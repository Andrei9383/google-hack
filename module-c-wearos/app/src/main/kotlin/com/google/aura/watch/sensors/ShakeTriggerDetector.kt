package com.google.aura.watch.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.abs

class ShakeTriggerDetector(
    context: Context,
    private val onTrigger: () -> Unit,
) : SensorEventListener {
    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    private var windowStartMs = 0L
    private var lastTriggerMs = 0L
    private var spikeCount = 0

    fun start() {
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) {
            return
        }

        val normalizedX = abs(event.values[0] / SensorManager.GRAVITY_EARTH)
        val normalizedY = abs(event.values[1] / SensorManager.GRAVITY_EARTH)
        val normalizedZ = abs(event.values[2] / SensorManager.GRAVITY_EARTH)
        val now = System.currentTimeMillis()

        if (now - lastTriggerMs < COOLDOWN_MS) {
            return
        }

        if (windowStartMs == 0L || now - windowStartMs > WINDOW_MS) {
            windowStartMs = now
            spikeCount = 0
        }

        if (normalizedX > THRESHOLD_G || normalizedY > THRESHOLD_G || normalizedZ > THRESHOLD_G) {
            spikeCount += 1
        }

        if (spikeCount >= REQUIRED_SPIKES && now - windowStartMs <= WINDOW_MS) {
            lastTriggerMs = now
            windowStartMs = 0L
            spikeCount = 0
            onTrigger()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    companion object {
        private const val THRESHOLD_G = 2.5f
        private const val WINDOW_MS = 500L
        private const val COOLDOWN_MS = 3000L
        private const val REQUIRED_SPIKES = 3
    }
}