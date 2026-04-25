#include <nuttx/config.h>

#include <assert.h>
#include <errno.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/boardctl.h>
#include <unistd.h>

#include "netutils/netinit.h"

#include "aura_vest_ble.h"

#include "nimble/ble.h"
#include "nimble/nimble_npl.h"
#include "nimble/nimble_port.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#define AURA_BLE_QUEUE_LEN 8
#define AURA_BLE_PAYLOAD_LEN 3
#define AURA_BLE_TASK_PRIORITY SCHED_PRIORITY_DEFAULT
#define AURA_BLE_TASK_STACK NULL
#define AURA_BLE_TASK_STACK_SIZE 0

/* UUIDs are stored little-endian for NimBLE. */

#define AURA_BLE_UUID128(n) \
  BLE_UUID128_INIT(0x00, 0x1a, 0x3e, 0x2d, 0x8b, 0x7f, 0x91, 0xa5, \
                   0x6e, 0x4d, 0xb2, 0xc4, (n), 0x00, 0x6a, 0x2e)

void ble_hci_sock_ack_handler(FAR void *param);
void ble_hci_sock_set_device(int dev);

static int aura_ble_access(uint16_t conn_handle, uint16_t attr_handle,
                           FAR struct ble_gatt_access_ctxt *ctxt,
                           FAR void *arg);
static int aura_ble_gap_event(FAR struct ble_gap_event *event, FAR void *arg);
static void aura_ble_on_reset(int reason);
static void aura_ble_on_sync(void);
static void aura_ble_advertise(void);
static FAR void *aura_ble_hci_sock_task(FAR void *param);
static FAR void *aura_ble_host_task(FAR void *param);

static const ble_uuid128_t g_aura_service_uuid = AURA_BLE_UUID128(0x00);
static const ble_uuid128_t g_aura_sensor_uuid = AURA_BLE_UUID128(0x01);
static const ble_uuid128_t g_aura_haptic_uuid = AURA_BLE_UUID128(0x02);
static const ble_uuid128_t g_aura_status_uuid = AURA_BLE_UUID128(0x03);

static uint16_t g_sensor_val_handle;
static uint16_t g_haptic_val_handle;
static uint16_t g_status_val_handle;

static const struct ble_gatt_svc_def g_aura_svcs[] =
{
  {
    .type = BLE_GATT_SVC_TYPE_PRIMARY,
    .uuid = &g_aura_service_uuid.u,
    .characteristics = (struct ble_gatt_chr_def[])
    {
      {
        .uuid = &g_aura_sensor_uuid.u,
        .access_cb = aura_ble_access,
        .val_handle = &g_sensor_val_handle,
        .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
      },
      {
        .uuid = &g_aura_haptic_uuid.u,
        .access_cb = aura_ble_access,
        .val_handle = &g_haptic_val_handle,
        .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
      },
      {
        .uuid = &g_aura_status_uuid.u,
        .access_cb = aura_ble_access,
        .val_handle = &g_status_val_handle,
        .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
      },
      {
        0,
      }
    },
  },
  {
    0,
  },
};

struct aura_ble_state_s
{
  pthread_mutex_t lock;
  uint8_t sensor[AURA_BLE_PAYLOAD_LEN];
  uint8_t status;
  uint8_t queue[AURA_BLE_QUEUE_LEN][AURA_BLE_PAYLOAD_LEN];
  uint8_t head;
  uint8_t tail;
  uint8_t count;
  uint8_t own_addr_type;
  uint16_t conn_handle;
  bool connected;
  bool sensor_subscribed;
  bool status_subscribed;
  bool initialized;
};

static struct aura_ble_state_s g_ble =
{
  .lock = PTHREAD_MUTEX_INITIALIZER,
  .sensor = { 0xff, 0xff, 0xff },
  .status = 0x00,
  .conn_handle = BLE_HS_CONN_HANDLE_NONE,
};

static struct ble_npl_task g_hci_task;
static struct ble_npl_task g_host_task;

static int aura_ble_push_override(const uint8_t payload[AURA_BLE_PAYLOAD_LEN])
{
  pthread_mutex_lock(&g_ble.lock);

  if (g_ble.count == AURA_BLE_QUEUE_LEN)
    {
      g_ble.head = (uint8_t)((g_ble.head + 1) % AURA_BLE_QUEUE_LEN);
      g_ble.count--;
    }

  memcpy(g_ble.queue[g_ble.tail], payload, AURA_BLE_PAYLOAD_LEN);
  g_ble.tail = (uint8_t)((g_ble.tail + 1) % AURA_BLE_QUEUE_LEN);
  g_ble.count++;

  pthread_mutex_unlock(&g_ble.lock);
  return 0;
}

static int aura_ble_access(uint16_t conn_handle, uint16_t attr_handle,
                           FAR struct ble_gatt_access_ctxt *ctxt,
                           FAR void *arg)
{
  uint8_t payload[AURA_BLE_PAYLOAD_LEN];
  uint16_t len;
  int rc;

  (void)conn_handle;
  (void)attr_handle;
  (void)arg;

  if (ble_uuid_cmp(ctxt->chr->uuid, &g_aura_sensor_uuid.u) == 0)
    {
      if (ctxt->op != BLE_GATT_ACCESS_OP_READ_CHR)
        {
          return BLE_ATT_ERR_UNLIKELY;
        }

      pthread_mutex_lock(&g_ble.lock);
      memcpy(payload, g_ble.sensor, AURA_BLE_PAYLOAD_LEN);
      pthread_mutex_unlock(&g_ble.lock);

      rc = os_mbuf_append(ctxt->om, payload, AURA_BLE_PAYLOAD_LEN);
      return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

  if (ble_uuid_cmp(ctxt->chr->uuid, &g_aura_haptic_uuid.u) == 0)
    {
      if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR)
        {
          return BLE_ATT_ERR_UNLIKELY;
        }

      if (OS_MBUF_PKTLEN(ctxt->om) != AURA_BLE_PAYLOAD_LEN)
        {
          return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        }

      rc = ble_hs_mbuf_to_flat(ctxt->om, payload, sizeof(payload), &len);
      if (rc != 0 || len != AURA_BLE_PAYLOAD_LEN)
        {
          return BLE_ATT_ERR_UNLIKELY;
        }

      return aura_ble_push_override(payload);
    }

  if (ble_uuid_cmp(ctxt->chr->uuid, &g_aura_status_uuid.u) == 0)
    {
      if (ctxt->op != BLE_GATT_ACCESS_OP_READ_CHR)
        {
          return BLE_ATT_ERR_UNLIKELY;
        }

      pthread_mutex_lock(&g_ble.lock);
      payload[0] = g_ble.status;
      pthread_mutex_unlock(&g_ble.lock);

      rc = os_mbuf_append(ctxt->om, payload, 1);
      return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

  return BLE_ATT_ERR_UNLIKELY;
}

static void aura_ble_advertise(void)
{
  struct ble_gap_adv_params adv_params;
  struct ble_hs_adv_fields fields;
  struct ble_hs_adv_fields rsp_fields;
  const char *name = ble_svc_gap_device_name();
  int rc;

  memset(&fields, 0, sizeof(fields));
  fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
  fields.uuids128 = (ble_uuid128_t *)&g_aura_service_uuid;
  fields.num_uuids128 = 1;
  fields.uuids128_is_complete = 1;

  rc = ble_gap_adv_set_fields(&fields);
  if (rc != 0)
    {
      printf("aura_vest: ble adv fields failed rc=%d\n", rc);
      return;
    }

  memset(&rsp_fields, 0, sizeof(rsp_fields));
  rsp_fields.name = (uint8_t *)name;
  rsp_fields.name_len = strlen(name);
  rsp_fields.name_is_complete = 1;

  rc = ble_gap_adv_rsp_set_fields(&rsp_fields);
  if (rc != 0)
    {
      printf("aura_vest: ble scan response failed rc=%d\n", rc);
      return;
    }

  memset(&adv_params, 0, sizeof(adv_params));
  adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
  adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;

  rc = ble_gap_adv_start(g_ble.own_addr_type, NULL, BLE_HS_FOREVER,
                         &adv_params, aura_ble_gap_event, NULL);
  if (rc != 0)
    {
      printf("aura_vest: ble advertise failed rc=%d\n", rc);
    }
  else
    {
      printf("aura_vest: ble advertising as %s\n", name);
    }
}

static int aura_ble_gap_event(FAR struct ble_gap_event *event, FAR void *arg)
{
  (void)arg;

  switch (event->type)
    {
      case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0)
          {
            pthread_mutex_lock(&g_ble.lock);
            g_ble.connected = true;
            g_ble.conn_handle = event->connect.conn_handle;
            pthread_mutex_unlock(&g_ble.lock);
            printf("aura_vest: ble connected\n");
          }
        else
          {
            aura_ble_advertise();
          }
        return 0;

      case BLE_GAP_EVENT_DISCONNECT:
        pthread_mutex_lock(&g_ble.lock);
        g_ble.connected = false;
        g_ble.sensor_subscribed = false;
        g_ble.status_subscribed = false;
        g_ble.conn_handle = BLE_HS_CONN_HANDLE_NONE;
        pthread_mutex_unlock(&g_ble.lock);
        printf("aura_vest: ble disconnected\n");
        aura_ble_advertise();
        return 0;

      case BLE_GAP_EVENT_SUBSCRIBE:
        pthread_mutex_lock(&g_ble.lock);
        if (event->subscribe.attr_handle == g_sensor_val_handle)
          {
            g_ble.sensor_subscribed = event->subscribe.cur_notify;
          }
        else if (event->subscribe.attr_handle == g_status_val_handle)
          {
            g_ble.status_subscribed = event->subscribe.cur_notify;
          }
        pthread_mutex_unlock(&g_ble.lock);
        return 0;

      default:
        return 0;
    }
}

static void aura_ble_on_reset(int reason)
{
  printf("aura_vest: ble reset reason=%d\n", reason);
}

static void aura_ble_on_sync(void)
{
  int rc;

  rc = ble_hs_util_ensure_addr(0);
  assert(rc == 0);

  rc = ble_hs_id_infer_auto(0, &g_ble.own_addr_type);
  assert(rc == 0);

  aura_ble_advertise();
}

static FAR void *aura_ble_hci_sock_task(FAR void *param)
{
  ble_hci_sock_ack_handler(param);
  return NULL;
}

static FAR void *aura_ble_host_task(FAR void *param)
{
  (void)param;
  nimble_port_run();
  return NULL;
}

static int aura_ble_notify(uint16_t handle, const uint8_t *payload, uint8_t len)
{
  struct os_mbuf *om;
  uint16_t conn_handle;
  bool connected;

  pthread_mutex_lock(&g_ble.lock);
  connected = g_ble.connected;
  conn_handle = g_ble.conn_handle;
  pthread_mutex_unlock(&g_ble.lock);

  if (!connected)
    {
      return 0;
    }

  om = ble_hs_mbuf_from_flat(payload, len);
  if (om == NULL)
    {
      return -ENOMEM;
    }

  return ble_gatts_notify_custom(conn_handle, handle, om);
}

int aura_platform_ble_init(const struct aura_ble_config_s *config)
{
  int ret;

  if (g_ble.initialized)
    {
      return 0;
    }

  printf("aura_vest: starting NimBLE service=%s sensor=%s haptic=%s status=%s\n",
         config->service_uuid, config->sensor_uuid, config->haptic_uuid,
         config->status_uuid);

#ifndef CONFIG_NSH_ARCHINIT
  boardctl(BOARDIOC_INIT, 0);
#endif

#ifndef CONFIG_NSH_NETINIT
  netinit_bringup();
#endif

  nimble_port_init();
  ble_svc_gap_init();
  ble_svc_gatt_init();
  ble_svc_gap_device_name_set(config->device_name);

  ble_hs_cfg.reset_cb = aura_ble_on_reset;
  ble_hs_cfg.sync_cb = aura_ble_on_sync;
  ble_hs_cfg.store_status_cb = ble_store_util_status_rr;

  ret = ble_gatts_count_cfg(g_aura_svcs);
  if (ret != 0)
    {
      printf("aura_vest: ble count cfg failed ret=%d\n", ret);
      return -EIO;
    }

  ret = ble_gatts_add_svcs(g_aura_svcs);
  if (ret != 0)
    {
      printf("aura_vest: ble add svcs failed ret=%d\n", ret);
      return -EIO;
    }

  ret = ble_npl_task_init(&g_hci_task, "aura_hci",
                          aura_ble_hci_sock_task, NULL,
                          AURA_BLE_TASK_PRIORITY, BLE_NPL_TIME_FOREVER,
                          AURA_BLE_TASK_STACK, AURA_BLE_TASK_STACK_SIZE);
  if (ret != 0)
    {
      printf("aura_vest: hci task failed ret=%d\n", ret);
      return -EIO;
    }

  ret = ble_npl_task_init(&g_host_task, "aura_ble",
                          aura_ble_host_task, NULL,
                          AURA_BLE_TASK_PRIORITY, BLE_NPL_TIME_FOREVER,
                          AURA_BLE_TASK_STACK, AURA_BLE_TASK_STACK_SIZE);
  if (ret != 0)
    {
      printf("aura_vest: host task failed ret=%d\n", ret);
      return -EIO;
    }

  g_ble.initialized = true;
  return 0;
}

bool aura_platform_ble_read_override(uint8_t payload[AURA_BLE_PAYLOAD_LEN])
{
  bool have_payload;

  pthread_mutex_lock(&g_ble.lock);
  have_payload = g_ble.count > 0;
  if (have_payload)
    {
      memcpy(payload, g_ble.queue[g_ble.head], AURA_BLE_PAYLOAD_LEN);
      g_ble.head = (uint8_t)((g_ble.head + 1) % AURA_BLE_QUEUE_LEN);
      g_ble.count--;
    }
  pthread_mutex_unlock(&g_ble.lock);

  return have_payload;
}

int aura_platform_ble_notify_sensor(const uint8_t payload[AURA_BLE_PAYLOAD_LEN])
{
  bool should_notify;

  pthread_mutex_lock(&g_ble.lock);
  memcpy(g_ble.sensor, payload, AURA_BLE_PAYLOAD_LEN);
  should_notify = g_ble.sensor_subscribed;
  pthread_mutex_unlock(&g_ble.lock);

  if (!should_notify)
    {
      return 0;
    }

  return aura_ble_notify(g_sensor_val_handle, payload, AURA_BLE_PAYLOAD_LEN);
}

int aura_platform_ble_notify_status(uint8_t status)
{
  bool should_notify;

  pthread_mutex_lock(&g_ble.lock);
  g_ble.status = status;
  should_notify = g_ble.status_subscribed;
  pthread_mutex_unlock(&g_ble.lock);

  if (!should_notify)
    {
      return 0;
    }

  return aura_ble_notify(g_status_val_handle, &status, 1);
}
