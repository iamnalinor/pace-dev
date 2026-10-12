package expo.modules.pacenative

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Hooks Pace into the app's start: the crash catcher goes in before React Native loads, so a
 * crash during start leaves its trace too (expo autolinking finds this class by its name).
 */
class PaceNativePackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          CrashCatcher.install(application)
        }
      }
    )
}
