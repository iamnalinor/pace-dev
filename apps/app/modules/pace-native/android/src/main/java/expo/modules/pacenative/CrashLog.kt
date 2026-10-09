package expo.modules.pacenative

import android.content.Context
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The crash log in the app's files: every report goes to `crash-log.txt` (the newest 64 KB)
 * and to `crash-unseen.txt` until the person has seen it (markSeen). Writes are synchronous on purpose:
 * the process is about to die when most reports arrive.
 */
object CrashLog {
  private const val LOG = "crash-log.txt"
  private const val UNSEEN = "crash-unseen.txt"
  private const val MAX_CHARS = 64 * 1024

  private fun header(context: Context, kind: String): String {
    val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
      .apply { timeZone = TimeZone.getTimeZone("UTC") }
      .format(Date())
    val version = try {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName
    } catch (error: Exception) {
      "?"
    }
    return "=== $time · $kind · v$version · Android ${Build.VERSION.RELEASE} (${Build.MANUFACTURER} ${Build.MODEL})"
  }

  private fun appendTrimmed(file: File, text: String) {
    val current = if (file.exists()) file.readText() else ""
    file.writeText((current + text).takeLast(MAX_CHARS))
  }

  @Synchronized
  fun append(context: Context, kind: String, details: String) {
    val report = "${header(context, kind)}\n${details.trimEnd()}\n\n"
    appendTrimmed(File(context.filesDir, LOG), report)
    appendTrimmed(File(context.filesDir, UNSEEN), report)
  }

  @Synchronized
  fun read(context: Context): String = File(context.filesDir, LOG).let { if (it.exists()) it.readText() else "" }

  /** The reports logged since the person last looked (markSeen), "" when none. */
  @Synchronized
  fun readUnseen(context: Context): String =
    File(context.filesDir, UNSEEN).let { if (it.exists()) it.readText() else "" }

  @Synchronized
  fun markSeen(context: Context) {
    File(context.filesDir, UNSEEN).delete()
  }

  @Synchronized
  fun clear(context: Context) {
    File(context.filesDir, LOG).delete()
    File(context.filesDir, UNSEEN).delete()
  }
}
