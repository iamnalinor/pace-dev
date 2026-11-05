package expo.modules.pacenative

import org.junit.Assert.*
import org.junit.Test

class FirebaseControllerTest {
  private val a = FirebaseConfig("project-a", "sender-a", "app-a", "key-a")
  private val b = FirebaseConfig("project-b", "sender-b", "app-b", "key-b")
  private val originA = "https://a.test"
  private val originB = "https://b.test"

  private class Store : FirebaseRecordStore {
    var record: FirebaseRecord? = null
    var canWrite = true
    override fun read() = record
    override fun write(value: FirebaseRecord): Boolean {
      if (!canWrite) return false
      record = value
      return true
    }
  }

  private class Runtime : FirebaseAppPort {
    var live: FirebaseConfig? = null
    var initializations = 0
    var fails = false
    override fun current() = live
    override fun initialize(config: FirebaseConfig) {
      if (fails) throw IllegalStateException("sensitive Firebase diagnostic")
      check(live == null)
      initializations += 1
      live = config
    }
  }

  @Test fun freshInstallInitializesAfterAuthoritativeOriginReconciliation() {
    val runtime = Runtime()
    val store = Store()
    val controller = FirebaseController(store, runtime)
    assertEquals("disabled", controller.restore().status)
    controller.reconcile(originA)
    assertEquals("ready", controller.ensure(originA, a).status)
    assertEquals(a, store.record?.committed?.config)
    assertEquals("project-a", controller.status().projectId)
    assertEquals(1, runtime.initializations)
    controller.ensure(originA, a)
    assertEquals(1, runtime.initializations)
  }

  @Test fun stagedBeforeOriginWriteIsDiscardedAfterCrash() {
    val store = Store()
    store.record = FirebaseRecord(FirebaseSelection(originA, a), null)
    FirebaseController(store, Runtime()).stage(originB, b)
    val runtime = Runtime()
    val restarted = FirebaseController(store, runtime)
    assertEquals("project-a", restarted.restore().projectId)
    assertEquals("ready", restarted.reconcile(originA).status)
    assertNull(store.record?.staged)
    assertEquals(originA, store.record?.committed?.origin)
  }

  @Test fun originWrittenBeforePromotionRecoversPendingWithoutTrustingItAtLifecycle() {
    val store = Store()
    store.record = FirebaseRecord(FirebaseSelection(originA, a), FirebaseSelection(originB, b))
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    assertEquals("project-a", controller.restore().projectId)
    assertEquals("restart-needed", controller.reconcile(originB).status)
    assertEquals(b, store.record?.committed?.config)
    assertNull(store.record?.staged)
    assertEquals(a, runtime.live)
    val cold = FirebaseController(store, Runtime())
    assertEquals("project-b", cold.restore().projectId)
  }

  @Test fun promotedBeforeRestartInitializesNewConfigOnColdLaunch() {
    val store = Store()
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    controller.reconcile(originA)
    controller.ensure(originA, a)
    controller.stage(originB, b)
    assertEquals("restart-needed", controller.commit(originB).status)
    assertEquals(a, runtime.live)
    assertEquals("project-b", FirebaseController(store, Runtime()).restore().projectId)
  }

  @Test fun everyFirebaseOptionParticipatesInLiveAppComparison() {
    for (config in listOf(a.copy(projectId="other"), a.copy(senderId="other"), a.copy(appId="other"), a.copy(apiKey="other"))) {
      val runtime = Runtime()
      runtime.live = a
      val controller = FirebaseController(Store(), runtime)
      controller.reconcile(originA)
      val status = controller.ensure(originA, config)
      assertEquals("restart-needed", status.status)
      assertEquals("project-a", status.projectId)
      assertEquals(0, runtime.initializations)
    }
  }

  @Test fun failedWriteLeavesPriorSelectionAndDoesNotInitialize() {
    val store = Store()
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    controller.reconcile(originA)
    val before = store.record
    store.canWrite = false
    assertEquals("storage-failed", controller.ensure(originA, a).reason)
    assertEquals(before, store.record)
    assertNull(runtime.live)
  }

  @Test fun disablingRequiresRestartWhenDefaultAppIsLive() {
    val runtime = Runtime()
    val store = Store()
    val controller = FirebaseController(store, runtime)
    controller.reconcile(originA)
    controller.ensure(originA, a)
    assertEquals("restart-needed", controller.ensure(originA, null).status)
    assertEquals("project-a", controller.status().projectId)
    assertEquals("disabled", FirebaseController(store, Runtime()).restore().status)
  }

  @Test fun staleOriginCannotReplaceReconciledSelection() {
    val store = Store()
    val controller = FirebaseController(store, Runtime())
    controller.reconcile(originB)
    controller.ensure(originB, b)
    val before = store.record
    assertEquals("invalid-config", controller.ensure(originA, a).reason)
    assertEquals(before, store.record)
  }

  @Test fun initializationFailureIsFixedAndNeverContainsConfiguration() {
    val runtime = Runtime()
    runtime.fails = true
    val controller = FirebaseController(Store(), runtime)
    controller.reconcile(originA)
    assertEquals(FirebaseStatus("error", null, "initialization-failed"), controller.ensure(originA, a))
  }

  @Test fun bakedBuildRejectsRuntimeMutation() {
    val store = Store()
    val controller = FirebaseController(store, Runtime(), false)
    assertEquals("unsupported", controller.stage(originA, a).status)
    assertEquals("unsupported", controller.commit(originA).status)
    assertEquals("unsupported", controller.reconcile(originA).status)
    assertEquals("unsupported", controller.ensure(originA, a).status)
    assertNull(store.record)
  }

  @Test fun unmatchedPendingAndCommittedOriginsAreCleared() {
    val store = Store()
    store.record = FirebaseRecord(FirebaseSelection(originA, a), FirebaseSelection(originB, b))
    val controller = FirebaseController(store, Runtime())
    assertEquals("disabled", controller.reconcile("https://c.test").status)
    assertNull(store.record?.committed)
    assertNull(store.record?.staged)
  }

  @Test fun invalidConfigAndUnreconciledEnsureCannotWrite() {
    val store = Store()
    val controller = FirebaseController(store, Runtime())
    assertEquals("invalid-config", controller.ensure(originA, a).reason)
    assertNull(store.record)
    assertEquals("invalid-config", controller.stage(originA, a.copy(apiKey=" ")).reason)
    assertNull(store.record)
  }

  @Test fun failedPromotionLeavesPendingForRetryAndRejectsEnsureUntilReconciled() {
    val store = Store()
    store.record = FirebaseRecord(FirebaseSelection(originA, a), FirebaseSelection(originB, b))
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    controller.restore()
    store.canWrite = false
    assertEquals("storage-failed", controller.reconcile(originB).reason)
    assertEquals(originA, store.record?.committed?.origin)
    assertEquals(originB, store.record?.staged?.origin)
    store.canWrite = true
    assertEquals("invalid-config", controller.ensure(originB, b).reason)
    assertEquals("restart-needed", controller.reconcile(originB).status)
    assertEquals("restart-needed", controller.ensure(originB, b).status)
    assertEquals(a, runtime.live)
  }

  @Test fun configWithBlankFieldIsRejectedForEveryField() {
    for (config in listOf(a.copy(projectId=" "), a.copy(senderId=""), a.copy(appId="\n"), a.copy(apiKey="\t"))) {
      val store = Store()
      val controller = FirebaseController(store, Runtime())
      controller.reconcile(originA)
      val before = store.record
      assertEquals("invalid-config", controller.ensure(originA, config).reason)
      assertEquals(before, store.record)
    }
  }

  @Test fun invalidPersistedVersionCannotInitialize() {
    val store = Store()
    store.record = FirebaseRecord(FirebaseSelection(originA, a), null, 2)
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    assertEquals("invalid-config", controller.restore().reason)
    assertNull(runtime.live)
  }

  @Test fun defaultAppProjectIsReportedEvenWhenStorageFails() {
    val store = object : FirebaseRecordStore {
      override fun read(): FirebaseRecord? = throw IllegalStateException("private storage diagnostic")
      override fun write(value: FirebaseRecord) = false
    }
    val runtime = Runtime()
    runtime.live = a
    val status = FirebaseController(store, runtime).restore()
    assertEquals(FirebaseStatus("error", "project-a", "storage-failed"), status)
  }

  @Test fun committingAnotherOriginCannotPromotePending() {
    val store = Store()
    val controller = FirebaseController(store, Runtime())
    controller.stage(originB, b)
    assertEquals("invalid-config", controller.commit(originA).reason)
    assertNull(store.record?.committed)
    assertEquals(originB, store.record?.staged?.origin)
  }


  @Test fun pendingSwitchRevokesOldEnsureAuthorityOnlyAfterDurableStage() {
    val store = Store()
    val runtime = Runtime()
    val controller = FirebaseController(store, runtime)
    controller.reconcile(originA)
    controller.ensure(originA, a)

    // A failed stage did not begin a durable handoff: the current server stays usable.
    store.canWrite = false
    assertEquals("storage-failed", controller.stage(originB, b).reason)
    store.canWrite = true
    assertEquals("ready", controller.ensure(originA, a).status)

    controller.stage(originB, b)
    // An in-flight response from A must not erase B before SecureStore's origin write/commit.
    assertEquals("invalid-config", controller.ensure(originA, a).reason)
    assertEquals(originB, store.record?.staged?.origin)
    assertEquals(b, store.record?.staged?.config)
    assertEquals("restart-needed", controller.commit(originB).status)
    assertEquals(originB, store.record?.committed?.origin)
    assertEquals(b, store.record?.committed?.config)
    assertEquals(a, runtime.live)
  }

}
