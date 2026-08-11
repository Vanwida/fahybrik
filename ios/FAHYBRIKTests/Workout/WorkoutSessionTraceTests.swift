import XCTest
@testable import FAHYBRIK

// EL EMISOR, ENCHUFADO A LA SESIÓN. Las pruebas del `WorkoutTraceRecorder` fijan el
// formato; estas fijan el CABLEADO: que la traza cuelgue de los mismos puntos de
// entrada que ya alimentan los tramos, y por tanto herede sus mismas puertas de
// honestidad. Nada entra pausado, ni terminado, ni fuera de un tramo de correr.
final class WorkoutSessionTraceTests: XCTestCase {

    /// Sesión ARMADA (start/beginBlock/stop), como en `HRProvenanceTests`: sin armar,
    /// `isAwaitingBlockStart` bloquea toda captura.
    private func armedSession() -> WorkoutSession {
        let s = WorkoutSession(plan: .minimal(title: "Rodaje"))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    // MARK: - El eje es de segundos enteros desde el arranque

    // `startedAt` es el ancla y el eje se cuenta desde ahí. Una sesión que empezó hace
    // 42 s pone su primera muestra en el segundo 42, no en el 0.
    func testTheAxisCountsFromTheSessionStart() {
        let s = WorkoutSession(plan: .minimal(title: "Rodaje"), startedAt: Date().addingTimeInterval(-42))
        XCTAssertEqual(s.traceSecond(), 42, accuracy: 1)
    }

    // Y se redondea al segundo entero: el eje de la tabla es `int[]`.
    func testTheAxisIsWholeSeconds() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let s = WorkoutSession(plan: .minimal(title: "Rodaje"), startedAt: start)
        XCTAssertEqual(s.traceSecond(start.addingTimeInterval(7.4)), 7)
        XCTAssertEqual(s.traceSecond(start.addingTimeInterval(7.6)), 8)
        XCTAssertEqual(s.traceSecond(start), 0)
    }

    // MARK: - Lo que se archiva es lo que la sesión ACEPTÓ

    // El pulso entra por `injectLiveHR`, DESPUÉS de la puerta de precedencia. Así la
    // serie y la media del tramo cuentan lo mismo, y un relevo de banda a reloj se lee
    // como dos series consecutivas en vez de como una mezcla de dos pulsos.
    func testAcceptedHeartRateIsArchivedWithItsSource() {
        let s = armedSession()
        s.injectLiveHR(151, source: .strap)

        let traces = s.trace.traces(startedAt: s.startedAt)
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces[0].signal, "hr")
        XCTAssertEqual(traces[0].source, "strap")
        XCTAssertEqual(traces[0].values, [151])
    }

    // Un pulso RECHAZADO por la puerta de precedencia (llega de una fuente peor
    // mientras la dueña sigue viva) no entra en la media… ni en la traza. Si entrara,
    // el archivo contaría un latido que la sesión decidió no creerse.
    func testRejectedHeartRateIsNotArchivedEither() {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)      // la banda toma la propiedad
        s.injectLiveHR(190, source: .pm5)        // peor fuente, con la dueña viva

        let values = s.trace.traces(startedAt: s.startedAt).first?.values
        XCTAssertEqual(values, [150], "el 190 no lo aceptó la sesión, así que no se archiva")
    }

    // El pulso se archiva en CUALQUIER sesión, no sólo corriendo: es lo que le da al
    // servidor la buena evidencia para recalcular el reparto de zonas de una sesión de
    // fuerza igual que de un rodaje.
    func testHeartRateIsArchivedOutsideRunningToo() {
        let s = armedSession()
        XCTAssertFalse(s.tramoIsRun, "la sesión mínima no es de correr")
        s.injectLiveHR(120, source: .healthkit)
        XCTAssertEqual(s.trace.traces(startedAt: s.startedAt).count, 1)
    }

    // MARK: - Las puertas de honestidad

    // EN PAUSA NO SE MUESTREA, y por eso el semáforo deja un HUECO en la serie en vez
    // de una línea recta que diría que estuvo corriendo. Es la misma puerta que ya
    // protegía la media del tramo.
    func testNothingIsArchivedWhilePaused() {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)
        s.togglePause()
        for _ in 0..<20 { s.injectLiveHR(90, source: .strap) }

        let values = s.trace.traces(startedAt: s.startedAt).first?.values
        XCTAssertEqual(values, [150], "los 20 latidos en pausa son el hueco")
    }

    // Terminada la sesión, el archivo está cerrado: lo que llegue después es otra cosa
    // (la recuperación de pulso, que tiene su propia columna y su propio motor).
    func testNothingIsArchivedAfterTheFinish() {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)
        s.finish()
        s.injectLiveHR(120, source: .strap)

        XCTAssertEqual(s.trace.traces(startedAt: s.startedAt).first?.values, [150])
    }

    // La velocidad y la altitud sólo se archivan en trabajo de CORRER: fuera de un
    // tramo de carrera no hay ritmo ni desnivel que leer.
    func testSpeedAndAltitudeNeedRunningWork() {
        let s = armedSession()
        XCTAssertFalse(s.tramoIsRun)
        s.sampleRunSpeed(metersPerSecond: 3.3, accuracyMps: 0.5)
        s.sampleAltitude(metersAboveSeaLevel: 112, at: Date())
        s.sampleTreadmillSpeed(metersPerSecond: 3.0)

        XCTAssertTrue(s.trace.traces(startedAt: s.startedAt).isEmpty)
    }

    // CoreLocation marca «no lo sé» con negativos. Un «no lo sé» no es una medida: se
    // descarta en vez de archivarse como un cero que se leería como «estaba parado».
    func testAnInvalidGPSSpeedIsNotAMeasurement() {
        let s = armedSession()
        s.sampleRunSpeed(metersPerSecond: -1, accuracyMps: 0.5)   // velocidad inválida
        s.sampleRunSpeed(metersPerSecond: 3.3, accuracyMps: -1)   // precisión inválida
        XCTAssertTrue(s.trace.traces(startedAt: s.startedAt).isEmpty)
    }

    // MARK: - El vocabulario del esquema

    // Los nombres de fuente son los del enum `biometric_source`, y `speed`/`distance`
    // sellan de dónde salieron los metros: el GPS y la cinta no son lo mismo.
    func testSourcesSpeakTheSchemaVocabulary() {
        XCTAssertEqual(TraceSource.gps.rawValue, "gps")
        XCTAssertEqual(TraceSource.treadmill.rawValue, "treadmill")
        XCTAssertEqual(TraceSource.healthkit.rawValue, "healthkit")
        XCTAssertEqual(TraceSource.concept2.rawValue, "concept2")
        XCTAssertEqual(TraceSource.strap.rawValue, "strap")
    }
}
