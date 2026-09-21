import XCTest
@testable import FAHYBRIK

// FH-56 — el enlace muñeca↔móvil lo dice Apple. Lo que se prueba aquí:
//   · reloj: qué hace un `handle(_:)` según el PRIMARY que encuentra (Core, puro;
//     watchOS no tiene target de test) — re-espejar, nunca ignorar, nunca tirar;
//   · móvil: UN `startWatchApp` por intent, un `didDisconnect` no relanza nada,
//     adoptar sin plan GUARDA (`.endSaving`), nunca descarta;
//   · fuente: no queda ningún motor casero de «conexión» en `ios/`.

final class WatchPrimaryStartActionTests: XCTestCase {

    private func action(
        phase: WatchPrimaryLifecycle.Phase = .recording,
        hasSession: Bool = true,
        isFinishing: Bool = false,
        currentRole: WatchPrimaryLifecycle.Role? = .mirror,
        incomingRole: WatchPrimaryLifecycle.Role = .mirror,
        compatible: Bool = true
    ) -> WatchPrimaryLifecycle.StartAction {
        WatchPrimaryLifecycle.startAction(
            phase: phase,
            hasSession: hasSession,
            isFinishing: isFinishing,
            currentRole: currentRole,
            incomingRole: incomingRole,
            compatible: compatible
        )
    }

    /// Estados A/B del plan: el móvil vuelve a pedir el Primary mientras el reloj
    /// ya graba el mismo entreno → «vuelve a espejarme». Ni ignorar ni terminar.
    func testHandleWhileRecordingCompatibleRemirrors() {
        XCTAssertEqual(action(), .remirror)
    }

    /// Otra actividad / ubicación → terminar GUARDANDO y encolar el nuevo.
    func testHandleWhileRecordingIncompatibleFinishesSavingThenQueues() {
        XCTAssertEqual(action(compatible: false), .finishThenQueue)
    }

    /// FH-107 — el solo de la muñeca cede al móvil: guarda y encola.
    func testSoloYieldsToPhone() {
        XCTAssertEqual(action(currentRole: .solo), .finishThenQueue)
    }

    /// Un solo no puede pisar un Primary vivo.
    func testSoloCannotPreemptLivePrimary() {
        XCTAssertEqual(action(incomingRole: .solo), .decline)
        XCTAssertEqual(action(currentRole: .solo, incomingRole: .solo), .decline)
    }

    /// Estado D del plan: un `handle(_:)` mientras el cierre está en vuelo se
    /// encola — sea la UI (`.ending`) o el handle HK (`finishing`) — y no colisiona.
    func testStartDuringTeardownQueues() {
        XCTAssertEqual(action(phase: .ending, hasSession: true), .queue)
        XCTAssertEqual(action(phase: .idle, hasSession: false, isFinishing: true, currentRole: nil), .queue)
    }

    func testPendingStartFiresOnlyWithNoHandleLeft() {
        XCTAssertTrue(WatchPrimaryLifecycle.canFirePendingStart(phase: .idle, hasSession: false, isFinishing: false))
        XCTAssertFalse(WatchPrimaryLifecycle.canFirePendingStart(phase: .idle, hasSession: false, isFinishing: true))
        XCTAssertFalse(WatchPrimaryLifecycle.canFirePendingStart(phase: .ending, hasSession: true, isFinishing: true))
    }

    func testStuckEndingCountsFinishingAsAHandle() {
        XCTAssertTrue(WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(phase: .ending, hasSession: false))
        XCTAssertFalse(WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(phase: .ending, hasSession: true))
    }
}

@MainActor
final class PhoneAppleLinkTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    override func tearDown() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        mirror.resetPrimaryBindingForTests()
        super.tearDown()
    }

    /// UN `startWatchApp` por Empezar. Ni bucle, ni generación, ni reintento.
    func testOneStartWatchAppPerBegin() {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-one"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "mixed")
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        // Lo que antes reintentaba: `kickFrame` y una segunda petición explícita.
        mirror.kickFrame()
        mirror.requestWatchPrimaryIfNeeded()
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)
    }

    /// Correr sin calle/cinta resuelta espera; al resolverse pide UNA vez.
    func testRunningRequestsOnceWhenEnvironmentResolves() {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-run"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 0, "sin entorno no hay configuración honesta")

        s.switchRunEnvironment(to: .outdoor)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)
        s.switchRunEnvironment(to: .treadmill)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1, "cambiar de entorno no relanza el reloj")
    }

    /// `didDisconnectFromRemoteDeviceWithError` no relanza nada ni termina nada:
    /// se sigue entrenando, la tira lo pinta, el enlace lo recupera Apple o el
    /// atleta.
    func testRemoteDisconnectDoesNotRelaunchOrEnd() {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-disc"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "mixed")
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        var sends: [String] = []
        mirror.sendOverride = { sends.append($0) }
        mirror.simulateRemoteDisconnectForTests(error: "remote device disconnected")

        XCTAssertEqual(mirror.phase, .coaching)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1, "no relaunch by timer")
        XCTAssertFalse(sends.contains(MirrorWire.MessageType.end), "a disconnect is not an end")
        XCTAssertEqual(mirror.link, .disconnected("remote device disconnected"))
        XCTAssertFalse(mirror.wristMirrorLive)
    }

    /// Adoptar sin motor y sin plan → el reloj recibe `MirrorEnd(save: true)`.
    /// La grabación de la muñeca es del atleta; nunca `save: false` desde adopt.
    /// (Sin un `HKWorkoutSession` real que enlazar, el final queda en cola con
    /// su flag — es lo que `adopt` vacía al enlazar.)
    func testAdoptWithoutPlanEndsSavingNeverDiscards() {
        mirror.applyAdoptAction(.endSaving)

        XCTAssertEqual(mirror.phase, .ending)
        XCTAssertEqual(mirror.pendingEndSaveForTests, true, "save: true — never discard on adopt")
    }

    /// Motor ya terminado cuando Apple entrega el espejo tarde → también guarda.
    func testAdoptAfterEngineFinishedEndsSaving() {
        XCTAssertEqual(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: true, engineFinished: true, hasFreshSnapshot: false
        ), .endSaving)
    }
}

/// Lo que no debe volver a existir en `ios/` (grep = 0, como criterio de hecho).
final class FH56SourceTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relative))
    }

    func testBothSidesListenToAppleDisconnect() throws {
        XCTAssertTrue(try source("FAHYBRIK/Workout/PhoneLiveSession.swift")
            .contains("didDisconnectFromRemoteDeviceWithError"))
        XCTAssertTrue(try source("FAHYBRIKWatch/WatchPrimaryOwner.swift")
            .contains("didDisconnectFromRemoteDeviceWithError"))
    }

    func testNoHomemadeLinkEngineLeft() throws {
        let phone = try source("FAHYBRIK/Workout/PhoneLiveSession.swift")
        XCTAssertFalse(phone.contains("watchLaunchAttempts"), "no startWatchApp retry loop")
        XCTAssertFalse(phone.contains("watchLaunchGeneration"))
        XCTAssertFalse(phone.contains("didLaunchWatch"))
        XCTAssertFalse(phone.contains("mirrorIsStale"))
        XCTAssertFalse(phone.contains("retryIntervalSeconds"))
        XCTAssertFalse(phone.contains("save: false)"), "adopt never discards the wrist recording")

        let watch = try source("FAHYBRIKWatch/WatchPrimaryOwner.swift")
        XCTAssertFalse(watch.contains("connectionLostAfter"), "no 15 s watchdog")
        XCTAssertFalse(watch.contains("requestSyncUntilFirstFrame"), "no sync spam")
        XCTAssertFalse(watch.contains(".orphan"))
        XCTAssertFalse(watch.contains("wrist PRIMARY still records. */"), "no silent catch around startMirroring")
        XCTAssertTrue(watch.contains("startMirroringToCompanionDevice"))

        let overlays = try source("FAHYBRIKWatch/Views/MirrorHUDOverlays.swift")
        XCTAssertFalse(overlays.contains("Conectando…"), "no unreachable Conectando overlay")

        let fm = FileManager.default
        XCTAssertFalse(fm.fileExists(atPath: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PhoneWorkoutRun.swift").path))
        XCTAssertFalse(fm.fileExists(atPath: iosRoot.appendingPathComponent("FAHYBRIK/Workout/WorkoutRunClock.swift").path))
        XCTAssertFalse(fm.fileExists(atPath: iosRoot.appendingPathComponent("FAHYBRIKCore/Workout/WristMirrorTruth.swift").path))
    }
}
