package expo.modules.pacenative

import android.content.Context
import android.content.pm.PackageManager
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

/** Firebase owns the default app for this entire process; this adapter never calls delete(). */
private class DefaultFirebaseApp(private val context: Context) : FirebaseAppPort {
  override fun current(): FirebaseConfig? {
    val app = FirebaseApp.getApps(context).firstOrNull { it.name == FirebaseApp.DEFAULT_APP_NAME }
      ?: return null
    val options = app.options
    return FirebaseConfig(options.projectId.orEmpty(), options.gcmSenderId.orEmpty(), options.applicationId, options.apiKey)
  }

  override fun initialize(config: FirebaseConfig) {
    FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
      .setProjectId(config.projectId).setGcmSenderId(config.senderId)
      .setApplicationId(config.appId).setApiKey(config.apiKey).build())
  }
}

/** Shared by the application lifecycle, bridge and diagnostics, in the app's primary process. */
internal object FirebaseRuntime {
  private var controller: FirebaseController? = null

  @Synchronized fun controller(context: Context): FirebaseController = controller ?: run {
    val application = context.applicationContext
    FirebaseController(FirebaseStorage(application), DefaultFirebaseApp(application), enabled(application))
      .also { controller = it }
  }

  fun enabled(context: Context): Boolean = try {
    context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      .metaData?.getString("pace.firebaseMode") == "runtime"
  } catch (_: Exception) { false }

  fun withConfig(context: Context, origin: String, json: String?, staged: Boolean): Map<String, Any?> {
    val controller = controller(context)
    return try {
      val config = FirebaseStorage.parseConfig(json)
      (if (staged) controller.stage(origin, config) else controller.ensure(origin, config)).asMap()
    } catch (_: InvalidFirebaseConfig) { controller.invalid().asMap() }
  }
}
