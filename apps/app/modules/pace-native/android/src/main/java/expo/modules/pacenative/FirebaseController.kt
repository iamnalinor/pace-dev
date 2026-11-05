package expo.modules.pacenative

/** Never stringify this value: it includes a public client key which diagnostics do not need. */
internal data class FirebaseConfig(
  val projectId: String,
  val senderId: String,
  val appId: String,
  val apiKey: String,
) {
  fun valid() = listOf(projectId, senderId, appId, apiKey).all { it.isNotBlank() }
  override fun toString() = "FirebaseConfig(redacted)"
}

internal data class FirebaseSelection(val origin: String, val config: FirebaseConfig?)
internal data class FirebaseRecord(
  val committed: FirebaseSelection?,
  val staged: FirebaseSelection?,
  val version: Int = 1,
)
internal data class FirebaseStatus(val status: String, val projectId: String?, val reason: String? = null) {
  fun asMap(): Map<String, Any?> = mapOf("status" to status, "projectId" to projectId, "reason" to reason)
}
internal interface FirebaseRecordStore {
  fun read(): FirebaseRecord?
  fun write(value: FirebaseRecord): Boolean
}
internal interface FirebaseAppPort {
  fun current(): FirebaseConfig?
  fun initialize(config: FirebaseConfig)
}
internal class InvalidFirebaseConfig : Exception()

/** Storage is authoritative only after commit; a pending server choice is never a boot config. */
internal class FirebaseController(
  private val store: FirebaseRecordStore,
  private val app: FirebaseAppPort,
  private val enabled: Boolean = true,
) {
  private var desired: FirebaseConfig? = null
  private var trustedOrigin: String? = null
  private var reason: String? = null

  @Synchronized fun status(): FirebaseStatus {
    val live = try { app.current() } catch (_: Exception) {
      return FirebaseStatus("error", null, "initialization-failed")
    }
    reason?.let { return FirebaseStatus("error", live?.projectId?.ifBlank { null }, it) }
    if (!enabled) return FirebaseStatus(if (live == null) "unsupported" else "ready", live?.projectId?.ifBlank { null })
    return FirebaseStatus(
      when {
        live == null && desired == null -> "disabled"
        live != null && live == desired -> "ready"
        else -> "restart-needed"
      },
      live?.projectId?.ifBlank { null },
    )
  }

  @Synchronized fun restore(): FirebaseStatus = operation {
    desired = read().committed?.config
    initializeDesired()
  }

  @Synchronized fun stage(origin: String, config: FirebaseConfig?): FirebaseStatus = operation {
    validate(origin, config)
    persist(read().copy(staged = FirebaseSelection(origin, config)))
    // Revoke the old origin's in-flight ensures only after the pending choice is durable.
    // A failed write leaves the current reconciled origin usable.
    trustedOrigin = null
  }

  @Synchronized fun commit(origin: String): FirebaseStatus = operation {
    validate(origin, null)
    val record = read()
    val selected = record.staged?.takeIf { it.origin == origin }
      ?: record.committed?.takeIf { it.origin == origin && record.staged == null }
      ?: throw InvalidFirebaseConfig()
    persist(FirebaseRecord(selected, null))
    desired = selected.config
    // JS must read the persisted server origin before an on-demand initialization.
    trustedOrigin = null
  }

  @Synchronized fun reconcile(origin: String): FirebaseStatus = operation {
    validate(origin, null)
    val record = read()
    val selected = record.staged?.takeIf { it.origin == origin }
      ?: record.committed?.takeIf { it.origin == origin }
    persist(FirebaseRecord(selected, null))
    desired = selected?.config
    trustedOrigin = origin
  }

  @Synchronized fun ensure(origin: String, config: FirebaseConfig?): FirebaseStatus = operation {
    validate(origin, config)
    if (trustedOrigin != origin) throw InvalidFirebaseConfig()
    persist(FirebaseRecord(FirebaseSelection(origin, config), null))
    desired = config
    initializeDesired()
  }

  /** Used by the JSON boundary to turn parse failures into fixed, non-sensitive diagnostics. */
  @Synchronized fun invalid(): FirebaseStatus {
    if (!enabled) return FirebaseStatus("unsupported", status().projectId)
    reason = "invalid-config"
    return status()
  }

  private fun read(): FirebaseRecord {
    val record = store.read() ?: FirebaseRecord(null, null)
    if (record.version != 1) throw InvalidFirebaseConfig()
    for (selection in listOfNotNull(record.committed, record.staged)) {
      validate(selection.origin, selection.config)
    }
    return record
  }

  private fun validate(origin: String, config: FirebaseConfig?) {
    if (origin.isBlank() || origin != origin.trim() || config?.valid() == false) throw InvalidFirebaseConfig()
  }

  private fun persist(record: FirebaseRecord) {
    if (!store.write(record)) throw FirebaseStorageFailed()
  }

  private fun initializeDesired() {
    val config = desired ?: return
    // Firebase is process-global. Never delete or recreate an existing default app.
    try {
      if (app.current() == null) app.initialize(config)
    } catch (_: Exception) { throw FirebaseInitializationFailed() }
  }

  private fun operation(action: () -> Unit): FirebaseStatus {
    if (!enabled) return FirebaseStatus("unsupported", status().projectId)
    reason = null
    try { action() }
    catch (_: InvalidFirebaseConfig) { reason = "invalid-config" }
    catch (_: FirebaseInitializationFailed) { reason = "initialization-failed" }
    catch (_: Exception) { reason = "storage-failed" }
    return status()
  }
}

private class FirebaseStorageFailed : Exception()
private class FirebaseInitializationFailed : Exception()
