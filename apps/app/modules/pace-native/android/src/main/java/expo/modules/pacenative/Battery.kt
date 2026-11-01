package expo.modules.pacenative

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PowerManager

/**
 * Phone makers' own autostart / background pages, tried in order; the first one this phone has
 * opens. Their packages are listed under `<queries>` in the manifest, or Android 11+ would hide
 * them from `resolveActivity`.
 */
private val AUTOSTART_PAGES = listOf(
  // Xiaomi, Redmi, POCO (MIUI / HyperOS)
  "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
  // Huawei (EMUI) and Honor before and after the split
  "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
  "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
  "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
  // Oppo and Realme (ColorOS / realme UI)
  "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
  "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
  "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
  // Vivo and iQOO (Funtouch / OriginOS)
  "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
  "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
  // OnePlus (OxygenOS)
  "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
  // Asus (ZenUI)
  "com.asus.mobilemanager" to "com.asus.mobilemanager.autostart.AutoStartActivity",
  "com.asus.mobilemanager" to "com.asus.mobilemanager.entry.FunctionActivity",
  // Samsung (One UI): Device care → Battery, where background limits are lifted
  "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
)

/** Whether Android leaves Pace out of battery optimization, so its background check runs on time. */
internal fun ignoresBatteryOptimizations(context: Context): Boolean {
  val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  return power.isIgnoringBatteryOptimizations(context.packageName)
}

/**
 * Opens the first known autostart page this phone has; false when none resolves (a phone
 * without such a page, or one whose page is not exported to other apps).
 */
internal fun openAutostartPage(context: Context): Boolean {
  val manager = context.packageManager
  for ((owner, activity) in AUTOSTART_PAGES) {
    val intent = Intent()
      .setComponent(ComponentName(owner, activity))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (intent.resolveActivity(manager) == null) {
      continue
    }
    try {
      context.startActivity(intent)
      return true
    } catch (_: ActivityNotFoundException) {
      // Listed but gone on this build: the next one.
    } catch (_: SecurityException) {
      // Present but not exported to other apps: the next one.
    }
  }
  return false
}
