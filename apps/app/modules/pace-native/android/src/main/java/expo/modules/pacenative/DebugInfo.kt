package expo.modules.pacenative

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * The device's side of a crash file: what helps a fix and says nothing about the person. Build,
 * device model, language, UTC offset (not the zone's name), memory, power saving, dark mode and
 * which permissions are granted. Each line is read on its own; one that fails says "?".
 */
internal object DebugInfo {
  private const val MB = 1024 * 1024

  fun describe(context: Context): String =
    listOf(
      line("app") { app(context) },
      line("device") {
        "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}), " +
          Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
      },
      line("locale") { "${Locale.getDefault().toLanguageTag()}, ${utcOffset()}" },
      line("memory") { memory(context) },
      line("process") { process(context) },
      line("power saver") { onOff((context.getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode) },
      line("dark mode") {
        onOff(context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES)
      },
      line("permissions") { permissions(context) },
    ).joinToString("\n")

  private fun line(label: String, value: () -> String): String =
    "$label: " + try {
      value()
    } catch (_: Throwable) {
      "?"
    }

  private fun onOff(isOn: Boolean): String = if (isOn) "on" else "off"

  private fun app(context: Context): String {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    val isDebug = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    return "Pace ${info.versionName} ($code), ${if (isDebug) "debug" else "release"} build"
  }

  /** "UTC+03:00": enough for time bugs without naming the city the zone is called after. */
  private fun utcOffset(): String {
    val zone = TimeZone.getDefault()
    val minutes = zone.getOffset(System.currentTimeMillis()) / 60_000
    val sign = if (minutes < 0) "-" else "+"
    val daylight = if (zone.inDaylightTime(Date())) ", daylight saving now" else ""
    return "UTC$sign%02d:%02d$daylight".format(abs(minutes) / 60, abs(minutes) % 60)
  }

  private fun memory(context: Context): String {
    val device = ActivityManager.MemoryInfo()
    (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(device)
    val runtime = Runtime.getRuntime()
    val heapUsed = (runtime.totalMemory() - runtime.freeMemory()) / MB
    return "device ${device.availMem / MB} of ${device.totalMem / MB} MB free" +
      (if (device.lowMemory) " (low)" else "") +
      ", app heap $heapUsed of ${runtime.maxMemory() / MB} MB"
  }

  private fun process(context: Context): String {
    val upSeconds = (SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()) / 1000
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    val isFront = state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    return "up ${upSeconds}s, ${if (isFront) "on screen" else "in the background"}"
  }

  private fun permissions(context: Context): String {
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val calendar = context.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
    return "notifications ${onOff(notifications.areNotificationsEnabled())}, calendar ${onOff(calendar)}, " +
      "usage access ${onOff(usageAccessGranted(context))}, " +
      "do not disturb ${onOff(notifications.isNotificationPolicyAccessGranted)}"
  }
}
