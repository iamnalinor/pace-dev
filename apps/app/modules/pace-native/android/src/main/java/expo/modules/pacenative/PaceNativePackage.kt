package expo.modules.pacenative

import android.app.Application
import android.content.Context
import android.util.Log
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Writes uncaught JVM exceptions (any thread, from Application.onCreate on) to the crash log,
 * then hands them to the previous handler, so Android still reports the crash as before.
 */
class PaceNativePackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          val previous = Thread.getDefaultUncaughtExceptionHandler()
          Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
              CrashLog.append(application, "android", "thread ${thread.name}\n${Log.getStackTraceString(error)}")
            } catch (ignored: Throwable) {
              // Logging must never hide the crash itself.
            }
            previous?.uncaughtException(thread, error)
          }
        }
      }
    )
}
