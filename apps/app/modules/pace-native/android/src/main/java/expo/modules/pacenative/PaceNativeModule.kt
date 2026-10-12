package expo.modules.pacenative

import android.app.NotificationManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android capabilities Pace needs beyond Expo's packages: usage access (screen on/off, app
 * foreground events, aggregated stats) and Do Not Disturb.
 * Every `open*Settings` function opens the matching system screen; none of them block.
 */
class PaceNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val notificationManager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private val usageStatsManager: UsageStatsManager
    get() = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

  private fun openSettings(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  private fun hasUsageAccess(): Boolean = usageAccessGranted(context)

  override fun definition() = ModuleDefinition {
    Name("PaceNative")

    // Where the last crash's trace was saved (CrashCatcher), once; null when none is pending.
    Function("takeLastCrash") { CrashCatcher.takeLastCrash(context) }

    // A trace the JS crash screen caught (the app kept running), saved next to the crashes'.
    Function("saveCrashTrace") { trace: String -> CrashCatcher.saveCaught(context, trace) }

    // What the app is doing (screen, sync…), for the next crash file; never personal content.
    Function("setCrashContext") { text: String -> CrashCatcher.appContext = text.take(2_000) }

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      openSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    Function("isDndAccessGranted") { notificationManager.isNotificationPolicyAccessGranted }

    Function("openDndAccessSettings") {
      openSettings(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
    }

    // Returns false when policy access was not granted; the caller then offers the settings screen.
    Function("setDnd") { enabled: Boolean ->
      val manager = notificationManager
      if (!manager.isNotificationPolicyAccessGranted) {
        return@Function false
      }
      manager.setInterruptionFilter(
        if (enabled) NotificationManager.INTERRUPTION_FILTER_PRIORITY
        else NotificationManager.INTERRUPTION_FILTER_ALL
      )
      true
    }

    // Raw usage events in [beginMs, endMs); the JS side filters screen/keyguard/activity types.
    AsyncFunction("queryUsageEvents") { beginMs: Double, endMs: Double ->
      if (!hasUsageAccess()) {
        return@AsyncFunction emptyList<Map<String, Any?>>()
      }
      val events = usageStatsManager.queryEvents(beginMs.toLong(), endMs.toLong())
      val event = UsageEvents.Event()
      val result = mutableListOf<Map<String, Any?>>()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        result.add(
          mapOf(
            "packageName" to event.packageName,
            "className" to event.className,
            "eventType" to event.eventType,
            "timestamp" to event.timeStamp,
          )
        )
      }
      result
    }

    // Readable names for package ids (the launcher label); an unknown package keeps its id.
    AsyncFunction("appLabels") { packages: List<String> ->
      val manager = context.packageManager
      packages.associateWith { name ->
        try {
          manager.getApplicationLabel(manager.getApplicationInfo(name, 0)).toString()
        } catch (error: PackageManager.NameNotFoundException) {
          name
        }
      }
    }

    AsyncFunction("queryUsageStats") { beginMs: Double, endMs: Double ->
      if (!hasUsageAccess()) {
        return@AsyncFunction emptyList<Map<String, Any?>>()
      }
      usageStatsManager
        .queryUsageStats(UsageStatsManager.INTERVAL_BEST, beginMs.toLong(), endMs.toLong())
        .map { stats ->
          mapOf(
            "packageName" to stats.packageName,
            "firstTimestamp" to stats.firstTimeStamp,
            "lastTimestamp" to stats.lastTimeStamp,
            "lastTimeUsed" to stats.lastTimeUsed,
            "totalTimeInForeground" to stats.totalTimeInForeground,
          )
        }
    }
  }
}
