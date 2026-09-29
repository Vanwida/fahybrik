import XCTest
import HealthKit
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

    // Orden aleatorio + un singleton compartido: cada test empieza con el espejo en
    // frío (`startWatchAppCallCount` es absoluto), no solo lo deja limpio al salir.
    override func setUp() {
        super.setUp()
        resetMirror()
    }

    override func tearDown() {
        resetMirror()
        super.tearDown()
    }

    private func resetMirror() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        mirror.resetPrimaryBindingForTests()
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

    /// El reloj se lanza SIEMPRE al empezar, sin esperar a calle/cinta. Antes una
    /// carrera sin entorno (el atleta pulsó Continuar sin elegir) no pedía nada al
    /// reloj y no dejaba rastro: la causa raíz del «no conecta» (29-sep).
    func testRunningLaunchesWatchEvenWithoutEnvironment() async {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-run"))
        XCTAssertNil(s.runEnvironment)
        var configs: [HKWorkoutConfiguration] = []
        mirror.startWatchAppOverride = { configs.append($0); return true }
        mirror.begin(session: s, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 1, "sin entorno se lanza igual")
        await waitUntil { !configs.isEmpty }
        XCTAssertEqual(configs.first?.locationType, .outdoor, "arranque sin respuesta: calle, nunca prohibir el GPS")
        XCTAssertEqual(configs.first?.activityType, .running)

        s.switchRunEnvironment(to: .outdoor)
        s.switchRunEnvironment(to: .treadmill)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1, "cambiar de entorno no relanza el reloj")
    }

    /// Con respuesta del atleta la configuración la respeta: una cinta nunca espera GPS.
    func testLaunchConfigurationRespectsTheAnswerWhenThereIsOne() async {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-cinta"))
        s.runEnvironment = .treadmill
        var configs: [HKWorkoutConfiguration] = []
        mirror.startWatchAppOverride = { configs.append($0); return true }
        mirror.begin(session: s, activityKind: "running")
        await waitUntil { !configs.isEmpty }
        XCTAssertEqual(configs.first?.locationType, .indoor)
    }

    /// Sin motor no hay nada que lanzar, pero deja rastro: nunca un silencio.
    func testSkipLeavesATraceInTheTechnicalLog() {
        let id = UUID()
        let s = WorkoutSession(plan: .minimal(title: "FH-56-skip"))
        s.hkSessionUUID = id
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "mixed")
        mirror.requestWatchPrimaryIfNeeded()   // ya pedido: se salta y se dice
        mirror.requestWatchPrimaryIfNeeded()   // repetido: el motivo se escribe UNA vez

        let skipped = DiagnosticsLog.shared.recent(limit: 200)
            .filter { $0.name == "start_watch_app_skipped" && $0.workoutId == id }
        XCTAssertEqual(skipped.count, 1)
        XCTAssertTrue(skipped.first?.detail?.contains("reason=already_requested") == true)
    }

    private func waitUntil(_ timeout: TimeInterval = 2, _ cond: () -> Bool) async {
        let end = Date().addingTimeInterval(timeout)
        while !cond(), Date() < end { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    /// Apple contestó con error y el reloj vuelve a estar alcanzable: UN relanzamiento
    /// por evento, con la MISMA configuración, y nunca más de `maxWatchRelaunchesPerIntent`.
    func testReachabilityRelaunchesOnlyAfterAnAppleErrorAndRespectsTheCap() async {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-reach"))
        var configs: [HKWorkoutConfiguration] = []
        mirror.startWatchAppOverride = { configs.append($0); return false }   // Apple dice error
        mirror.begin(session: s, activityKind: "running")
        await waitUntil { self.mirror.watchLaunch == .failed(nil) }
        XCTAssertEqual(mirror.watchLaunch, .failed(nil))
        XCTAssertEqual(mirror.watchStatus, .offline)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        mirror.handleWatchReachability(reachable: false)   // perder alcance no relanza
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        for expected in 2...(1 + PhoneLiveHandoffPolicy.maxWatchRelaunchesPerIntent) {
            mirror.handleWatchReachability(reachable: true)
            XCTAssertEqual(mirror.startWatchAppCallCount, expected)
            XCTAssertEqual(mirror.watchStatus, .connecting, "Apple aún no ha contestado al relanzamiento")
            await waitUntil { self.mirror.watchLaunch == .failed(nil) }
        }
        mirror.handleWatchReachability(reachable: true)    // tope agotado
        XCTAssertEqual(mirror.startWatchAppCallCount, 1 + PhoneLiveHandoffPolicy.maxWatchRelaunchesPerIntent)

        XCTAssertEqual(configs.count, mirror.startWatchAppCallCount)
        XCTAssertTrue(configs.allSatisfy { $0.locationType == configs[0].locationType && $0.activityType == configs[0].activityType },
                      "el relanzamiento lleva la misma configuración (FH-96)")
    }

    /// Si Apple dijo ok, un evento de alcance no relanza nada (el reloj se está abriendo).
    func testReachabilityAfterALaunchedOkDoesNotRelaunch() async {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-reach-ok"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "running")
        await waitUntil { self.mirror.watchLaunch == .launched }
        XCTAssertEqual(mirror.watchStatus, .connecting)

        mirror.handleWatchReachability(reachable: true)
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)
    }

    /// Fuera de un entreno en marcha el alcance no toca al reloj.
    func testReachabilityWhileIdleDoesNothing() {
        mirror.startWatchAppOverride = { _ in false }
        mirror.handleWatchReachability(reachable: true)
        XCTAssertEqual(mirror.startWatchAppCallCount, 0)
        XCTAssertEqual(mirror.watchStatus, .none)
    }

    /// El estado del reloj sale solo de lo que dice Apple, y su frase no lleva jerga.
    func testWatchStatusFollowsAppleAndSpeaksPlainSpanish() {
        XCTAssertEqual(mirror.watchStatus, .none)
        XCTAssertNil(PhoneLiveSession.WatchStatus.none.frase)
        for status in [PhoneLiveSession.WatchStatus.connecting, .recording, .offline] {
            let frase = status.frase ?? ""
            XCTAssertFalse(frase.isEmpty)
            for jerga in ["HealthKit", "espejo", "primario", "PM5", "—"] {
                XCTAssertFalse(frase.contains(jerga), "\(status): \(frase)")
            }
        }
        XCTAssertTrue(PhoneLiveSession.WatchStatus.offline.frase?.contains("Puedes seguir") == true)

        let s = WorkoutSession(plan: .minimal(title: "FH-56-status"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "mixed")
        XCTAssertEqual(mirror.watchStatus, .connecting)
        mirror.simulateRemoteDisconnectForTests(error: "remote device disconnected")
        XCTAssertEqual(mirror.watchStatus, .offline, "Apple dijo desconectado")
    }

    /// El chip del vivo: sin Apple Watch no se habla de reloj; con él, lo que dice Apple.
    func testLiveChipMappingHidesTheWatchWhenThereIsNone() {
        typealias R = Vivo.Dispositivos.Reloj
        XCTAssertEqual(R.delEnlace(.recording, hayAppleWatch: false), .segundaPantalla)
        XCTAssertEqual(R.delEnlace(.connecting, hayAppleWatch: true), .conectando)
        XCTAssertEqual(R.delEnlace(.connecting, hayAppleWatch: false), .sin)
        XCTAssertEqual(R.delEnlace(.offline, hayAppleWatch: true), .sinConexion)
        XCTAssertEqual(R.delEnlace(.offline, hayAppleWatch: false), .sin)
        XCTAssertEqual(R.delEnlace(.none, hayAppleWatch: true), .sin)

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
