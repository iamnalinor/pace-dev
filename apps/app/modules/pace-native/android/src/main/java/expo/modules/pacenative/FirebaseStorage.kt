package expo.modules.pacenative

import android.content.Context
import org.json.JSONObject

/** One atomic value avoids torn origin/config updates and requires acknowledged durable writes. */
internal class FirebaseStorage(context: Context) : FirebaseRecordStore {
  private val preferences = context.getSharedPreferences("pace-firebase", Context.MODE_PRIVATE)

  override fun read(): FirebaseRecord? {
    val raw = preferences.getString("record-v1", null) ?: return null
    return try {
      val json = JSONObject(raw)
      if (json.get("version") != 1 || !json.has("committed") || !json.has("staged")) {
        throw InvalidFirebaseConfig()
      }
      FirebaseRecord(selection(json, "committed"), selection(json, "staged"))
    } catch (_: org.json.JSONException) { throw InvalidFirebaseConfig() }
  }

  override fun write(value: FirebaseRecord): Boolean {
    val json = JSONObject()
      .put("version", value.version)
      .put("committed", selectionJson(value.committed))
      .put("staged", selectionJson(value.staged))
    // SharedPreferences updates memory even when its disk commit fails. Restore that view too,
    // so a failed handoff cannot be promoted by a later reconciliation in this same process.
    val previous = preferences.getString("record-v1", null)
    // apply() has no success acknowledgement and must not be used for this handoff.
    if (preferences.edit().putString("record-v1", json.toString()).commit()) return true
    val rollback = preferences.edit()
    if (previous == null) rollback.remove("record-v1") else rollback.putString("record-v1", previous)
    rollback.commit()
    return false
  }

  private fun selection(json: JSONObject, name: String): FirebaseSelection? {
    if (json.isNull(name)) return null
    val entry = json.getJSONObject(name)
    if (!entry.has("config")) throw InvalidFirebaseConfig()
    return FirebaseSelection(string(entry, "origin"), if (entry.isNull("config")) null else config(entry.getJSONObject("config")))
  }

  private fun selectionJson(value: FirebaseSelection?): Any = value?.let {
    JSONObject().put("origin", it.origin).put("config", it.config?.let(::configJson) ?: JSONObject.NULL)
  } ?: JSONObject.NULL

  companion object {
    fun parseConfig(raw: String?): FirebaseConfig? {
      if (raw == null) return null
      return try { config(JSONObject(raw)) }
      catch (_: org.json.JSONException) { throw InvalidFirebaseConfig() }
    }

    private fun string(json: JSONObject, name: String): String =
      (json.get(name) as? String)?.takeIf { it.isNotBlank() } ?: throw InvalidFirebaseConfig()

    private fun config(json: JSONObject): FirebaseConfig = FirebaseConfig(
      string(json, "projectId"), string(json, "senderId"), string(json, "appId"), string(json, "apiKey"),
    )

    private fun configJson(config: FirebaseConfig): JSONObject = JSONObject()
      .put("projectId", config.projectId).put("senderId", config.senderId)
      .put("appId", config.appId).put("apiKey", config.apiKey)
  }
}
