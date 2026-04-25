package com.google.aura.watch.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import androidx.annotation.RequiresPermission

class WatchPeripheral(
    context: Context,
    private val onConnectionChanged: (Boolean) -> Unit,
) {
    private val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
    private val bluetoothAdapter: BluetoothAdapter = bluetoothManager.adapter
    private val advertiser: BluetoothLeAdvertiser? = bluetoothAdapter.bluetoothLeAdvertiser
    private val connectedCentrals = linkedSetOf<BluetoothDevice>()

    private var gattServer: BluetoothGattServer? = null
    private val triggerCharacteristic = BluetoothGattCharacteristic(
        BleConstants.WATCH_TRIGGER_CHARACTERISTIC_UUID,
        BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
        BluetoothGattCharacteristic.PERMISSION_READ,
    ).apply {
        addDescriptor(
            BluetoothGattDescriptor(
                BleConstants.CLIENT_CONFIG_DESCRIPTOR_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
            ),
        )
        value = BleConstants.TRIGGER_PAYLOAD
    }

    @RequiresPermission(allOf = [
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT,
    ])
    fun start() {
        val service = BluetoothGattService(
            BleConstants.WATCH_SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY,
        ).apply {
            addCharacteristic(triggerCharacteristic)
        }

        gattServer = bluetoothManager.openGattServer(context, gattCallback).apply {
            addService(service)
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .addServiceUuid(ParcelUuid(BleConstants.WATCH_SERVICE_UUID))
            .build()

        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    @RequiresPermission(Manifest.permission.BLUETOOTH_ADVERTISE)
    fun stop() {
        advertiser?.stopAdvertising(advertiseCallback)
        gattServer?.close()
        gattServer = null
        connectedCentrals.clear()
        onConnectionChanged(false)
    }

    @SuppressLint("MissingPermission")
    fun sendTrigger() {
        triggerCharacteristic.value = BleConstants.TRIGGER_PAYLOAD

        connectedCentrals.forEach { device ->
            gattServer?.notifyCharacteristicChanged(device, triggerCharacteristic, false)
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {}

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            if (device == null) {
                return
            }

            when (newState) {
                BluetoothGatt.STATE_CONNECTED -> connectedCentrals.add(device)
                BluetoothGatt.STATE_DISCONNECTED -> connectedCentrals.remove(device)
            }

            onConnectionChanged(connectedCentrals.isNotEmpty())
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice?,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic?,
        ) {
            val payload = if (characteristic?.uuid == BleConstants.WATCH_TRIGGER_CHARACTERISTIC_UUID) {
                BleConstants.TRIGGER_PAYLOAD
            } else {
                byteArrayOf()
            }

            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, payload)
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?,
        ) {
            if (
                device != null &&
                descriptor?.uuid == BleConstants.CLIENT_CONFIG_DESCRIPTOR_UUID &&
                value != null
            ) {
                val notificationsEnabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)

                if (notificationsEnabled) {
                    connectedCentrals.add(device)
                } else {
                    connectedCentrals.remove(device)
                }

                onConnectionChanged(connectedCentrals.isNotEmpty())
            }

            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
            }
        }
    }
}