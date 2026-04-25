#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#include "aura_vest_transport.h"

#define AURA_HTTP_BUFFER_SIZE 1024
#define AURA_HTTP_HEADER_SIZE 256
#define AURA_HTTP_BODY_SIZE 256
#define AURA_HTTP_QUEUE_LEN 8
#define AURA_HTTP_SERVER_STACK_SIZE 6144

struct aura_http_state_s
{
  pthread_mutex_t lock;
  pthread_t thread;
  uint8_t sensor[3];
  uint8_t status;
  uint8_t queue[AURA_HTTP_QUEUE_LEN][3];
  uint8_t head;
  uint8_t tail;
  uint8_t count;
  bool initialized;
  char bind_address[32];
  char state_path[64];
  char haptic_path[64];
  char health_path[64];
  char device_name[64];
  uint16_t port;
};

static struct aura_http_state_s g_http =
{
  .lock = PTHREAD_MUTEX_INITIALIZER,
  .sensor = { 0xff, 0xff, 0xff },
  .status = 0x00,
};

static int aura_http_push_override(const uint8_t payload[3])
{
  pthread_mutex_lock(&g_http.lock);

  if (g_http.count == AURA_HTTP_QUEUE_LEN)
    {
      g_http.head = (uint8_t)((g_http.head + 1) % AURA_HTTP_QUEUE_LEN);
      g_http.count--;
    }

  memcpy(g_http.queue[g_http.tail], payload, 3);
  g_http.tail = (uint8_t)((g_http.tail + 1) % AURA_HTTP_QUEUE_LEN);
  g_http.count++;

  pthread_mutex_unlock(&g_http.lock);
  return 0;
}

static bool aura_http_pop_override(uint8_t payload[3])
{
  bool has_payload = false;

  pthread_mutex_lock(&g_http.lock);

  if (g_http.count > 0)
    {
      memcpy(payload, g_http.queue[g_http.head], 3);
      g_http.head = (uint8_t)((g_http.head + 1) % AURA_HTTP_QUEUE_LEN);
      g_http.count--;
      has_payload = true;
    }

  pthread_mutex_unlock(&g_http.lock);
  return has_payload;
}

static void aura_http_copy_text(char *dst, size_t dst_len, const char *src)
{
  if (dst_len == 0)
    {
      return;
    }

  if (src == NULL)
    {
      dst[0] = '\0';
      return;
    }

  snprintf(dst, dst_len, "%s", src);
}

static bool aura_http_matches(const char *request, const char *method,
                              const char *path)
{
  char prefix[96];

  snprintf(prefix, sizeof(prefix), "%s %s ", method, path);
  return strncmp(request, prefix, strlen(prefix)) == 0;
}

static const char *aura_http_find_body(const char *request)
{
  const char *body = strstr(request, "\r\n\r\n");
  return body == NULL ? NULL : body + 4;
}

static bool aura_http_extract_u8(const char *body, const char *key,
                                 uint8_t *value)
{
  char pattern[32];
  const char *cursor;
  long parsed;

  if (body == NULL || key == NULL || value == NULL)
    {
      return false;
    }

  snprintf(pattern, sizeof(pattern), "\"%s\"", key);
  cursor = strstr(body, pattern);
  if (cursor == NULL)
    {
      return false;
    }

  cursor = strchr(cursor + strlen(pattern), ':');
  if (cursor == NULL)
    {
      return false;
    }

  cursor++;
  while (*cursor == ' ' || *cursor == '\t')
    {
      cursor++;
    }

  parsed = strtol(cursor, NULL, 10);
  if (parsed < 0 || parsed > 255)
    {
      return false;
    }

  *value = (uint8_t)parsed;
  return true;
}

static void aura_http_send_response(int client_fd, int status_code,
                                    const char *status_text,
                                    const char *content_type,
                                    const char *body)
{
  char header[AURA_HTTP_HEADER_SIZE];
  const char *response_body = body == NULL ? "" : body;
  const size_t body_len = strlen(response_body);
  const int header_len = snprintf(header, sizeof(header),
                                  "HTTP/1.1 %d %s\r\n"
                                  "Content-Type: %s\r\n"
                                  "Content-Length: %u\r\n"
                                  "Connection: close\r\n"
                                  "Cache-Control: no-store\r\n"
                                  "\r\n",
                                  status_code, status_text, content_type,
                                  (unsigned int)body_len);

  if (header_len <= 0)
    {
      return;
    }

  if ((size_t)header_len >= sizeof(header))
    {
      return;
    }

  send(client_fd, header, (size_t)header_len, 0);

  if (body_len > 0)
    {
      send(client_fd, response_body, body_len, 0);
    }
}

static void aura_http_send_state(int client_fd)
{
  char body[AURA_HTTP_BODY_SIZE];
  uint8_t sensor[3];
  uint8_t status;

  pthread_mutex_lock(&g_http.lock);
  memcpy(sensor, g_http.sensor, sizeof(sensor));
  status = g_http.status;
  pthread_mutex_unlock(&g_http.lock);

  snprintf(body, sizeof(body),
           "{\"device\":\"%s\",\"transport\":\"wifi\","
           "\"sensorPayload\":[%u,%u,%u],\"sensor\":{\"left\":%u,"
           "\"center\":%u,\"right\":%u},\"status\":%u}",
           g_http.device_name, sensor[0], sensor[1], sensor[2], sensor[0],
           sensor[1], sensor[2], status);
  aura_http_send_response(client_fd, 200, "OK", "application/json", body);
}

static void aura_http_send_health(int client_fd)
{
  char body[96];
  uint8_t status;

  pthread_mutex_lock(&g_http.lock);
  status = g_http.status;
  pthread_mutex_unlock(&g_http.lock);

  snprintf(body, sizeof(body), "{\"ok\":true,\"status\":%u}", status);
  aura_http_send_response(client_fd, 200, "OK", "application/json", body);
}

static void aura_http_handle_haptic(int client_fd, const char *request)
{
  const char *body = aura_http_find_body(request);
  uint8_t payload[3];

  if (!aura_http_extract_u8(body, "motorId", &payload[0]) ||
      !aura_http_extract_u8(body, "intensity", &payload[1]) ||
      !aura_http_extract_u8(body, "pattern", &payload[2]))
    {
      aura_http_send_response(client_fd, 400, "Bad Request",
                              "application/json",
                              "{\"error\":\"Expected motorId, intensity and pattern.\"}");
      return;
    }

  aura_http_push_override(payload);
  aura_http_send_response(client_fd, 202, "Accepted", "application/json",
                          "{\"queued\":true}");
}

static void aura_http_handle_client(int client_fd)
{
  char request[AURA_HTTP_BUFFER_SIZE];
  const ssize_t received = recv(client_fd, request, sizeof(request) - 1, 0);

  if (received <= 0)
    {
      return;
    }

  request[received] = '\0';

  if (aura_http_matches(request, "GET", g_http.state_path))
    {
      aura_http_send_state(client_fd);
      return;
    }

  if (aura_http_matches(request, "GET", g_http.health_path))
    {
      aura_http_send_health(client_fd);
      return;
    }

  if (aura_http_matches(request, "POST", g_http.haptic_path))
    {
      aura_http_handle_haptic(client_fd, request);
      return;
    }

  aura_http_send_response(client_fd, 404, "Not Found", "application/json",
                          "{\"error\":\"Unknown endpoint.\"}");
}

static void *aura_http_server_main(void *arg)
{
  struct sockaddr_in server_addr;
  int enable = 1;
  int server_fd;

  (void)arg;

  server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0)
    {
      printf("aura_vest: socket failed: %d\n", errno);
      return NULL;
    }

  setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &enable, sizeof(enable));

  memset(&server_addr, 0, sizeof(server_addr));
  server_addr.sin_family = AF_INET;
  server_addr.sin_port = htons(g_http.port);
  server_addr.sin_addr.s_addr =
    g_http.bind_address[0] == '\0' || strcmp(g_http.bind_address, "0.0.0.0") == 0
      ? htonl(INADDR_ANY)
      : inet_addr(g_http.bind_address);

  if (bind(server_fd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0)
    {
      printf("aura_vest: bind failed on %s:%u: %d\n", g_http.bind_address,
             g_http.port, errno);
      close(server_fd);
      return NULL;
    }

  if (listen(server_fd, 4) < 0)
    {
      printf("aura_vest: listen failed: %d\n", errno);
      close(server_fd);
      return NULL;
    }

  printf("aura_vest: WiFi API ready at http://%s:%u%s\n",
         g_http.bind_address[0] == '\0' ? "0.0.0.0" : g_http.bind_address,
         g_http.port, g_http.state_path);

  for (;;)
    {
      const int client_fd = accept(server_fd, NULL, NULL);

      if (client_fd < 0)
        {
          printf("aura_vest: accept failed: %d\n", errno);
          continue;
        }

      aura_http_handle_client(client_fd);
      close(client_fd);
    }

  close(server_fd);
  return NULL;
}

int aura_platform_transport_init(const struct aura_transport_config_s *config)
{
  pthread_attr_t attr;
  int rc;

  if (config == NULL)
    {
      return -EINVAL;
    }

  pthread_mutex_lock(&g_http.lock);
  g_http.initialized = true;
  g_http.port = config->port;
  aura_http_copy_text(g_http.bind_address, sizeof(g_http.bind_address),
                      config->bind_address);
  aura_http_copy_text(g_http.state_path, sizeof(g_http.state_path),
                      config->state_path);
  aura_http_copy_text(g_http.haptic_path, sizeof(g_http.haptic_path),
                      config->haptic_path);
  aura_http_copy_text(g_http.health_path, sizeof(g_http.health_path),
                      config->health_path);
  aura_http_copy_text(g_http.device_name, sizeof(g_http.device_name),
                      config->device_name);
  pthread_mutex_unlock(&g_http.lock);

  rc = pthread_attr_init(&attr);
  if (rc != 0)
    {
      printf("aura_vest: http attr init failed: %d\n", rc);
      return -rc;
    }

  rc = pthread_attr_setstacksize(&attr, AURA_HTTP_SERVER_STACK_SIZE);
  if (rc != 0)
    {
      pthread_attr_destroy(&attr);
      printf("aura_vest: http stack size setup failed: %d\n", rc);
      return -rc;
    }

  rc = pthread_create(&g_http.thread, &attr, aura_http_server_main, NULL);
  pthread_attr_destroy(&attr);

  if (rc != 0)
    {
      printf("aura_vest: http server thread failed: %d\n", rc);
      return -rc;
    }

  return 0;
}

bool aura_platform_transport_read_override(uint8_t payload[3])
{
  return aura_http_pop_override(payload);
}

int aura_platform_transport_publish_sensor(const uint8_t payload[3])
{
  pthread_mutex_lock(&g_http.lock);
  memcpy(g_http.sensor, payload, 3);
  pthread_mutex_unlock(&g_http.lock);
  return 0;
}

int aura_platform_transport_publish_status(uint8_t status)
{
  pthread_mutex_lock(&g_http.lock);
  g_http.status = status;
  pthread_mutex_unlock(&g_http.lock);
  return 0;
}