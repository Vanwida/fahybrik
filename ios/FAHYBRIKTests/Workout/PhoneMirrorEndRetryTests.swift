import XCTest
@testable import FAHYBRIK

// CARD 72/102 — el cierre del espejo (teléfono → reloj) era UN paquete, sin ACK ni
// reintento (`PhoneMirrorService.deliverEnd`, antes de este fix). Perdido en
// vuelo — típico corriendo, teléfono en el bolsillo — la muñeca se quedaba
// grabando PARA SIEMPRE y el siguiente entreno arrancaba pillado en silencio.
//
// Esto verifica la cadencia de reintento REAL (Timer + RunLoop de verdad, no una
// réplica) contra un seam de envío inyectado (`sendOverride`): no hay
// HKWorkoutSession espejo — un tipo opaco del sistema — que fabricar en un test.
//
// El lado del RELOJ (MirrorSessionController: la idempotencia de `finish(save:)`
// ante un cierre repetido, el auto-reparo de cualquier estado sucio al arrancar,
// el watchdog que autoguarda una grabación atascada) NO tiene target de test: vive
// en FAHYBRIKWatch, y `FAHYBRIKTests` sólo compila contra el target `FAHYBRIK`
// (iOS) — ver project.yml, sección FAHYBRIKTests, y el comentario de
// FAHYBRIKCore sobre por qué no hay target de watchOS. Verificado por lectura +
// build de los dos targets; documentado en el informe de esta tarea.
@MainActor
final class PhoneMirrorEndRetryTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    override func tearDown() {
        // Nunca dejar un Timer del handshake de cierre vivo entre tests — el
        // singleton es compartido con el resto del target de tests.
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        super.tearDown()
    }

    /// El primer envío es INMEDIATO — sin esto la muñeca esperaría de más en el
    /// caso normal (sin ninguna pérdida) sólo por existir el reintento.
    func testFirstAttemptIsImmediate() {
        var sends: [String] = []
        mirror.sendOverride = { type in sends.append(type) }
        mirror.deliverEnd(save: true)
        XCTAssertEqual(sends, [MirrorWire.MessageType.end])
    }

    /// Si el ACK de la muñeca llega (aquí, directamente: `teardown()`, que es lo
    /// que `handleIncoming` hace al decodificar un `ended`) ANTES de agotar el
    /// presupuesto de reintentos, NINGÚN reintento más debe salir — perder esto
    /// reabre exactamente el bug original en sentido contrario: paquetes de más
    /// después de que la muñeca ya cerró.
    func testAckStopsFurtherRetries() {
        var sendCount = 0
        mirror.sendOverride = { _ in sendCount += 1 }
        mirror.deliverEnd(save: true)
        XCTAssertEqual(sendCount, 1)

        // El ACK llega antes del primer reintento (a los 2 s).
        mirror.teardown()

        let exp = expectation(description: "esperar más allá de la ventana del primer reintento")
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { exp.fulfill() }
        wait(for: [exp], timeout: 5)

        XCTAssertEqual(sendCount, 1, "el ACK debe cortar el reintento — ni un paquete más")
    }

    /// Sin ACK, el reintento se agota en un número FIJO de intentos — no reintenta
    /// para siempre — y todos caen dentro de la ventana de gracia del teardown
    /// final (`endGraceSeconds`), así que el último intento real llega antes del
    /// abandono forzado.
    func testRetriesExhaustWithoutAckAndStayBounded() {
        var sendCount = 0
        mirror.sendOverride = { _ in sendCount += 1 }
        mirror.deliverEnd(save: true)

        // 5 envíos totales a t=0,2,4,6,8 s (primer envío + 4 reintentos).
        let exp = expectation(description: "esperar todo el presupuesto de reintentos")
        DispatchQueue.main.asyncAfter(deadline: .now() + 8.8) { exp.fulfill() }
        wait(for: [exp], timeout: 10)

        XCTAssertEqual(sendCount, 5, "primer envío + 4 reintentos, ni uno más")

        // Y no debe seguir reintentando pasado el presupuesto.
        let exp2 = expectation(description: "confirmar que no hay un sexto envío")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { exp2.fulfill() }
        wait(for: [exp2], timeout: 4)
        XCTAssertEqual(sendCount, 5)
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
