import XCTest
@testable import FAHYBRIK

// FH-56 — el cierre del espejo (teléfono → reloj) es UN `MirrorEnd` por HK más
// el aviso durable por WCSession (`live_end_v1`, FH-101). Antes (card 72/102)
// había un reintento ×5 cada 2 s: un motor casero de «conexión» encima del
// canal de Apple. Lo que queda es un plazo de UI (10 s) para no bloquear el
// resumen si la muñeca está fuera de alcance; el handle HK lo suelta Apple con
// `.ended`, o ese plazo.
//
// Esto verifica la cadencia REAL (Timer + RunLoop de verdad, no una réplica)
// contra un seam de envío inyectado (`sendOverride`): no hay HKWorkoutSession
// espejo — un tipo opaco del sistema — que fabricar en un test. El lado del
// RELOJ no tiene target de test (ver project.yml, FAHYBRIKTests).
@MainActor
final class PhoneMirrorEndTests: XCTestCase {

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

    /// El único envío es INMEDIATO.
    func testFirstAttemptIsImmediate() {
        var sends: [String] = []
        mirror.sendOverride = { type in sends.append(type) }
        mirror.deliverEnd(save: true)
        XCTAssertEqual(sends, [MirrorWire.MessageType.end])
    }

    /// FH-56 — sin reintentos: pasada la ventana del viejo reintento (2 s) no
    /// sale ni un paquete más. El durable es WCSession, no un bucle sobre HK.
    func testNoRetryAfterTheOneSend() {
        var sendCount = 0
        mirror.sendOverride = { _ in sendCount += 1 }
        mirror.deliverEnd(save: true)
        XCTAssertEqual(sendCount, 1)

        let exp = expectation(description: "esperar más allá de la ventana del viejo reintento")
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { exp.fulfill() }
        wait(for: [exp], timeout: 5)

        XCTAssertEqual(sendCount, 1, "un MirrorEnd por final — ni un paquete más")
    }

    /// FH-56 — `end` es idempotente mientras el cierre está en vuelo.
    func testEndWhileEndingIsANoOp() {
        let s = WorkoutSession(plan: .minimal(title: "FH-56-end-twice"))
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "mixed")
        mirror.end(save: true)
        XCTAssertEqual(mirror.phase, .ending)
        mirror.end(save: false)
        XCTAssertEqual(mirror.phase, .ending)
        XCTAssertEqual(mirror.pendingEndSaveForTests, true,
                       "el segundo end no pisa al primero: sigue en cola con save: true")
    }

    /// FH-31 — Terminar en la muñeca manda `reason=athlete`. El teléfono cierra
    /// el motor una vez y NO reenvía `MirrorEnd` (eso dejaría un `pendingEndSave`
    /// que mataría el siguiente entreno al adoptar).
    func testAthleteEndedClosesThePhoneAndEndIsANoOp() {
        let s = WorkoutSession(plan: .minimal(title: "FH-31"))
        mirror.begin(session: s, activityKind: "mixed")
        XCTAssertFalse(mirror.wristFinishedByAthlete)

        let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: "uuid-athlete", reason: MirrorWire.EndReason.athlete)
        )
        XCTAssertNotNil(data)
        mirror.handleIncoming([data!])

        XCTAssertTrue(mirror.wristFinishedByAthlete)
        XCTAssertEqual(mirror.consumeWorkoutRef(), "uuid-athlete")

        var sends: [String] = []
        mirror.sendOverride = { sends.append($0) }
        mirror.end(save: true)
        XCTAssertEqual(sends, [], "el Primary ya cerró en la muñeca — no reenviar MirrorEnd")
    }

    /// FH-100 — Terminar debe dejar idle y el siguiente Empezar vuelve a pedir el
    /// Primary al reloj: arranque frío, UN `startWatchApp` por intent.
    func testEndThenSecondBeginLaunchesWatchAgain() {
        let first = WorkoutSession(plan: .minimal(title: "FH-100-a"))
        first.runEnvironment = .outdoor
        mirror.startWatchAppOverride = { _ in true }

        mirror.begin(session: first, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        mirror.end(save: true)
        mirror.teardown()
        XCTAssertEqual(mirror.phase, .idle)

        let second = WorkoutSession(plan: .minimal(title: "FH-100-b"))
        second.runEnvironment = .outdoor
        mirror.begin(session: second, activityKind: "running")

        XCTAssertEqual(mirror.startWatchAppCallCount, 2,
                       "second workout must call startWatchApp after clean idle")
        XCTAssertTrue(mirror.primaryRequestedForTests)
        XCTAssertFalse(mirror.wristMirrorLive,
                       "UI must not claim live until Apple binds the mirror")
    }

    func testAthleteEndedPacketLeavesIdleForNextBegin() {
        let s = WorkoutSession(plan: .minimal(title: "FH-100-athlete-end"))
        s.runEnvironment = .indoor
        mirror.startWatchAppOverride = { _ in true }
        mirror.begin(session: s, activityKind: "running")

        let ended = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: "uuid-1", reason: MirrorWire.EndReason.athlete)
        )
        XCTAssertNotNil(ended)
        mirror.handleIncoming([ended!])

        XCTAssertFalse(mirror.wristMirrorLive)
        XCTAssertFalse(mirror.primaryRequestedForTests)

        let next = WorkoutSession(plan: .minimal(title: "FH-100-next"))
        next.runEnvironment = .indoor
        mirror.begin(session: next, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 2)
    }

    func testEndedWithoutReasonDoesNotFinishThePhoneEngine() {
        let s = WorkoutSession(plan: .minimal(title: "FH-31-old"))
        mirror.begin(session: s, activityKind: "mixed")

        let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: "uuid-old")
        )
        XCTAssertNotNil(data)
        mirror.handleIncoming([data!])

        XCTAssertFalse(
            mirror.wristFinishedByAthlete,
            "una muñeca vieja sin motivo no termina el motor del teléfono"
        )
    }
}
