package expo.modules.pacenative

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/** Both facts come from the same network; absent capability data never grants a download. */
internal fun otaNetwork(context: Context): Map<String, Boolean>? {
  val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    ?: return null
  return try {
    val network = manager.activeNetwork ?: return null
    val capabilities = manager.getNetworkCapabilities(network) ?: return null
    mapOf(
      "isWifi" to capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
      "isMetered" to !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
    )
  } catch (_: SecurityException) {
    // Missing permission is an unknown network, not permission to use mobile data.
    null
  }
}
