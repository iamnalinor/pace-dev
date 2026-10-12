package expo.modules.pacenative

import android.app.Application
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.os.Process
import android.provider.MediaStore
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The last word of a crashing app: its trace goes to Downloads/Pace as a text file the person
 * can open or share from any file manager, then the app dies as it would have. Without it a
 * crash before the first screen (a JS error at start is one too) only closes the app, and its
 * trace is readable through adb alone.
 */
object CrashCatcher {
  private const val FOLDER = "Pace"

  fun install(application: Application) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        save(application, traceOf(application, thread, error))
      } catch (_: Throwable) {
        // Saving the trace is best effort; the crash itself goes on below either way.
      }
      if (previous != null) {
        previous.uncaughtException(thread, error)
      } else {
        Process.killProcess(Process.myPid())
      }
    }
  }

  /** Downloads/Pace through MediaStore (no permission on Android 10+), else the app's own folder. */
  private fun save(application: Application, trace: String) {
    val name = "crash-${SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.ROOT).format(Date())}.txt"
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      // Android 9 and older: Android/data/<package>/files, reachable over USB or a file manager.
      File(application.getExternalFilesDir(null) ?: application.filesDir, name).writeText(trace)
      return
    }
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
    }
    val resolver = application.contentResolver
    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
    resolver.openOutputStream(uri)?.use { it.write(trace.toByteArray()) }
  }

  private fun traceOf(application: Application, thread: Thread, error: Throwable): String {
    val writer = StringWriter()
    error.printStackTrace(PrintWriter(writer))
    val header = "Pace ${versionOf(application)} · Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}) · " +
      "${Build.MANUFACTURER} ${Build.MODEL} · thread ${thread.name}"
    return "$header\n\n$writer"
  }

  private fun versionOf(application: Application): String =
    try {
      application.packageManager.getPackageInfo(application.packageName, 0).versionName ?: "?"
    } catch (_: Exception) {
      "?"
    }
}
