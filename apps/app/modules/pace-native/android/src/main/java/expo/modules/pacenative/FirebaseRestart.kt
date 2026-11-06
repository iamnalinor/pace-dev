package expo.modules.pacenative

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Process

/** A separate short-lived process kills the old app before starting the real launcher again. */
internal fun restartPace(context: Context): Boolean {
  val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
  val component = launcher.component ?: return false
  if (component.packageName != context.packageName || launcher.resolveActivity(context.packageManager) == null) return false
  val intent = Intent(context, FirebaseRestartActivity::class.java)
    .putExtra("oldPid", Process.myPid())
    .putExtra("launcher", Intent.makeRestartActivityTask(component))
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  return try {
    context.startActivity(intent)
    true
  } catch (_: Exception) { false }
}

/** Must run in :pace_restart: a JS reload or same-process activity cannot reset Firebase. */
class FirebaseRestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    @Suppress("DEPRECATION")
    val launcher = intent.getParcelableExtra<Intent>("launcher")
    val oldPid = intent.getIntExtra("oldPid", -1)
    val component = launcher?.component
    if (launcher == null || component?.packageName != packageName ||
      launcher.resolveActivity(packageManager) == null || oldPid <= 0 || oldPid == Process.myPid()) {
      finish()
      return
    }
    Process.killProcess(oldPid)
    startActivity(launcher)
    finish()
    Process.killProcess(Process.myPid())
  }
}
