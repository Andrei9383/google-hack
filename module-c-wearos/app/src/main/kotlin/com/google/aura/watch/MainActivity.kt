package com.google.aura.watch

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.google.aura.watch.ble.WatchPeripheral
import com.google.aura.watch.sensors.ShakeTriggerDetector
import com.google.aura.watch.ui.TriggerScreen
import com.google.aura.watch.ui.TriggerViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: TriggerViewModel by viewModels()

    private lateinit var watchPeripheral: WatchPeripheral
    private lateinit var shakeDetector: ShakeTriggerDetector

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        if (permissions.values.all { it }) {
            startPeripheral()
            shakeDetector.start()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        watchPeripheral = WatchPeripheral(this) { connected ->
            viewModel.setConnected(connected)
        }
        shakeDetector = ShakeTriggerDetector(this) {
            handleTrigger()
        }

        requestBluetoothPermissionsIfNeeded()

        setContent {
            val uiState by viewModel.uiState.collectAsState()

            TriggerScreen(
                isConnected = uiState.isConnected,
                onTrigger = { handleTrigger() },
            )
        }
    }

    override fun onResume() {
        super.onResume()
        shakeDetector.start()
    }

    override fun onPause() {
        shakeDetector.stop()
        super.onPause()
    }

    override fun onDestroy() {
        watchPeripheral.stop()
        super.onDestroy()
    }

    private fun requestBluetoothPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            startPeripheral()
            return
        }

        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
            ),
        )
    }

    private fun startPeripheral() {
        watchPeripheral.start()
    }

    private fun handleTrigger() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Vibrator::class.java)
        }

        vibrator.vibrate(
            VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE),
        )
        watchPeripheral.sendTrigger()
    }
}