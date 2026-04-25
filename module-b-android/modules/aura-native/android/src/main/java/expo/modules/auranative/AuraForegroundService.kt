package expo.modules.auranative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AuraForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createChannel()

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Aura active"
    val description = intent?.getStringExtra(EXTRA_DESCRIPTION) ?: "Monitoring surroundings"
    startForeground(NOTIFICATION_ID, buildNotification(title, description))

    return START_STICKY
  }

  private fun buildNotification(title: String, description: String): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(description)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Aura Foreground Service",
      NotificationManager.IMPORTANCE_LOW,
    )
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "aura_foreground"
    private const val NOTIFICATION_ID = 42001
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_DESCRIPTION = "description"

    fun start(context: Context, title: String, description: String) {
      val intent = Intent(context, AuraForegroundService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_DESCRIPTION, description)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, AuraForegroundService::class.java))
    }
  }
}