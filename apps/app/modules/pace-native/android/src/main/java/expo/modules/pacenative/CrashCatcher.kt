package expo.modules.pacenative

import android.app.Application
import android.content.ContentValues
import android.content.Context
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
 * trace is readable through adb alone. The next start tells where the file is ([takeLastCrash]).
 */
object CrashCatcher {
  private const val FOLDER = "Pace"
  /** Where the last trace went, until the app has said so once. */
  private const val PENDING_FILE = "pending-crash.txt"
  private const val PRIVACY =
    "Not in this file: names, Telegram account, tokens, account or device ids, tasks, events, " +
      "calendar, app usage, the time zone's name."

  /** What the app was doing, set from JS (crash-context.ts); empty before the first screen. */
  @Volatile
  var appContext: String = ""

  fun install(application: Application) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val location = save(application, report(application, "crash on thread ${thread.name}", stackOf(error)))
        File(application.filesDir, PENDING_FILE).writeText(location)
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

  /**
   * A trace the app caught itself (the JS crash screen), saved as a crash's. Returns where, or
   * null when it could not be written: the screen showing it must not fail on that.
   */
  fun saveCaught(context: Context, trace: String): String? =
    try {
      save(context, report(context, "error shown on the crash screen", trace))
    } catch (_: Exception) {
      null
    }

  /** Where the last crash's trace was saved, once: the next call answers null. */
  fun takeLastCrash(context: Context): String? {
    val pending = File(context.filesDir, PENDING_FILE)
    if (!pending.exists()) {
      return null
    }
    val location = pending.readText()
    pending.delete()
    return location
  }

  /**
   * Downloads/Pace through MediaStore (no permission on Android 10+), else the app's own folder.
   * Returns where the file is, as a file manager shows it.
   */
  private fun save(context: Context, trace: String): String {
    val name = "crash-${SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.ROOT).format(Date())}.txt"
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      // Android 9 and older: Android/data/<package>/files, reachable over USB or a file manager.
      File(context.getExternalFilesDir(null) ?: context.filesDir, name).writeText(trace)
      return "Android/data/${context.packageName}/files/$name"
    }
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
    }
    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      ?: error("MediaStore refused the crash file")
    resolver.openOutputStream(uri)?.use { it.write(trace.toByteArray()) }
    return "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER/$name"
  }

  private fun stackOf(error: Throwable): String {
    val writer = StringWriter()
    error.printStackTrace(PrintWriter(writer))
    return writer.toString()
  }

  /** The file: what happened, the device, the app, what is left out, then the trace. */
  private fun report(context: Context, what: String, trace: String): String =
    listOf(
      "Pace $what",
      DebugInfo.describe(context),
      appContext.ifEmpty { "app: no screen yet (the crash came first)" },
      PRIVACY,
      trace,
    ).joinToString("\n\n")
}
