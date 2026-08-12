import XCTest
@testable import FAHYBRIK

// LAS OTRAS DOS FUGAS DE METROS, y el contraste que hace que la próxima se vea sola.
//
// La puerta de distancia era la mayor, pero no la única: la autopausa TIRABA los
// metros en vez de sólo congelar el crono, y la misma forma —descartar un dato y
// mover igualmente el cursor— estaba en el cuentakilómetros de la cinta.
final class RunMetresNotLostTests: XCTestCase {

    private func armedRunSession() -> WorkoutSession {
        let s = WorkoutSession(plan: .minimal(title: "Rodaje"))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    // MARK: - La autopausa no puede borrar metros

    // LA LÍNEA: la distancia es un hecho físico, el tiempo parado es una política.
    // Con la autopausa enganchada el crono se congela —eso es lo que el atleta
    // espera— pero los metros siguen contando, como en Garmin y Strava. Antes se
    // tiraban, así que una autopausa disparada por señal floja mientras el atleta
    // seguía corriendo borraba esos metros para siempre.
    func testAutoPauseFreezesTheClockButKeepsTheMetres() {
        let s = armedRunSession()
        s.beginAutoPauseEvaluation()
        s.autoPause()

        XCTAssertTrue(s.isPaused)
        XCTAssertTrue(s.autoPaused)
        XCTAssertFalse(s.isManuallyPaused, "la autopausa NO es una pausa del atleta")
    }

    // LA PAUSA A MANO SÍ PARA TODO. Es cuando el atleta ha dicho explícitamente que
    // pare, y entonces dejamos de mirar: en la traza queda un hueco, que es la verdad.
    func testAManualPauseStopsCountingEverything() {
        let s = armedRunSession()
        s.togglePause()

        XCTAssertTrue(s.isPaused)
        XCTAssertFalse(s.autoPaused)
        XCTAssertTrue(s.isManuallyPaused)
    }

    // Y una acción manual siempre gana sobre la autopausa: reanudar a mano la limpia.
    func testAManualActionAlwaysWinsOverAutoPause() {
        let s = armedRunSession()
        s.beginAutoPauseEvaluation()
        s.autoPause()
        XCTAssertTrue(s.autoPaused)

        s.togglePause()   // el atleta reanuda a mano
        XCTAssertFalse(s.isPaused)
        XCTAssertFalse(s.autoPaused)
        XCTAssertFalse(s.isManuallyPaused)
    }

    // MARK: - La autopausa tiene salida

    // Soltar la autopausa exige velocidad fiable, y la velocidad se degrada JUSTO
    // donde uno se para: pegado a un edificio, bajo un puente. Sin salida, la sesión
    // se quedaba congelada indefinidamente con el atleta ya corriendo.
    func testAutoPauseReleasesItselfWhenItGoesBlind() {
        var pause = RunAutoPause()
        // Se engancha: parado y confirmado.
        for t in stride(from: 0.0, through: RunAutoPause.engageDwellSeconds, by: 0.5) {
            _ = pause.step(speedMps: 0.1, eligible: true, isManualPause: false, now: t)
        }
        XCTAssertTrue(pause.isEngaged)

        // Y ahora la señal muere del todo. Al principio aguanta (no puede confirmar
        // movimiento), pero no para siempre.
        let blind = RunAutoPause.engageDwellSeconds
        var action = pause.step(speedMps: nil, eligible: true, isManualPause: false, now: blind + 1)
        XCTAssertEqual(action, RunAutoPause.Action.none, "aguanta mientras sea razonable")

        action = pause.step(
            speedMps: nil, eligible: true, isManualPause: false,
            now: blind + RunAutoPause.blindReleaseSeconds + 1
        )
        XCTAssertEqual(action, RunAutoPause.Action.release, "pero acaba soltando")
        XCTAssertFalse(pause.isEngaged)
    }

    // Una velocidad de confianza que vuelve reinicia la cuenta a ciegas: no se suelta
    // por acumular silencio a trozos.
    func testATrustworthyReadingResetsTheBlindTimer() {
        var pause = RunAutoPause()
        for t in stride(from: 0.0, through: RunAutoPause.engageDwellSeconds, by: 0.5) {
            _ = pause.step(speedMps: 0.1, eligible: true, isManualPause: false, now: t)
        }
        let base = RunAutoPause.engageDwellSeconds
        _ = pause.step(speedMps: nil, eligible: true, isManualPause: false, now: base + 15)
        // Vuelve una lectura fiable de "sigue parado" → el reloj de ceguera se reinicia.
        _ = pause.step(speedMps: 0.1, eligible: true, isManualPause: false, now: base + 16)
        let action = pause.step(speedMps: nil, eligible: true, isManualPause: false, now: base + 25)
        XCTAssertEqual(action, RunAutoPause.Action.none, "sólo cuentan los 20 s SEGUIDOS")
    }

    // MARK: - El cuentakilómetros de la cinta

    /// Una muestra de cinta con lo justo para el cálculo.
    private func belt(total: Double?, kmh: Double?, at seconds: TimeInterval) -> TreadmillSample {
        var s = TreadmillSample()
        s.totalDistanceM = total
        s.speedKmh = kmh
        s.lastUpdate = Date(timeIntervalSince1970: 1_000_000 + seconds)
        return s
    }

    // MISMA FORMA QUE EL FALLO DEL GPS: durante una congelación se pagaban metros
    // integrando la velocidad, pero el ancla se quedaba en la lectura congelada, así
    // que al revivir el salto cobraba TODO el tramo — incluido lo ya pagado.
    // Ahora el total de la sesión es el del cuentakilómetros, ni un metro más.
    func testAFrozenOdometerNeitherLosesNorDoubleCountsMetres() {
        var tracker = TreadmillDistanceTracker()
        var total = 0.0

        // Arranque: la primera lectura es el cero de esta cinta.
        total += tracker.increment(from: belt(total: 0, kmh: 12, at: 0))
        // Avanza normal hasta 100 m.
        total += tracker.increment(from: belt(total: 100, kmh: 12, at: 30))
        XCTAssertEqual(total, 100, accuracy: 0.01)

        // Se CONGELA en 100 mientras la banda sigue a 12 km/h (3,33 m/s) — seis
        // muestras de un segundo. El cuentakilómetros real avanzaría a ~120.
        for i in 1...6 {
            total += tracker.increment(from: belt(total: 100, kmh: 12, at: 30 + Double(i)))
        }
        // Revive: la máquina dice 120.
        total += tracker.increment(from: belt(total: 120, kmh: 12, at: 37))

        XCTAssertEqual(total, 120, accuracy: 0.01,
                       "el total es el del cuentakilómetros: ni se pierde ni se cobra dos veces")
    }

    // Sin cuentakilómetros (cinta que sólo da velocidad) se integra, como siempre.
    func testWithoutAnOdometerItIntegratesSpeed() {
        var tracker = TreadmillDistanceTracker()
        _ = tracker.increment(from: belt(total: nil, kmh: 12, at: 0))
        let metres = tracker.increment(from: belt(total: nil, kmh: 12, at: 3))
        XCTAssertEqual(metres, 10, accuracy: 0.1, "3 s a 12 km/h = 10 m")
    }

    // Una cinta parada con el cuentakilómetros plano no inventa metros.
    func testAStillBeltAddsNothing() {
        var tracker = TreadmillDistanceTracker()
        _ = tracker.increment(from: belt(total: 500, kmh: 0, at: 0))
        for i in 1...5 {
            XCTAssertEqual(tracker.increment(from: belt(total: 500, kmh: 0, at: Double(i))), 0)
        }
    }

    // MARK: - El contraste que lo hace detectable

    // LA SEGUNDA OPINIÓN. Las muestras de Apple Salud se vuelven una serie acumulada
    // sobre el eje de la sesión, y se guarda AL LADO de la nuestra (misma señal, otra
    // fuente). Cualquier divergencia queda a la vista en el propio archivo — que es
    // lo que faltaba para que un fallo así no viva escondido hasta que alguien lo
    // note corriendo.
    func testTheHealthReferenceBecomesACumulativeSeries() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let series = HealthKitDistanceProbe.series(
            from: [
                (meters: 100, endedAt: start.addingTimeInterval(30)),
                (meters: 150, endedAt: start.addingTimeInterval(60)),
                (meters: 120, endedAt: start.addingTimeInterval(90)),
            ],
            startedAt: start
        )
        XCTAssertEqual(series.map(\.second), [30, 60, 90])
        XCTAssertEqual(series.map(\.value), [100, 250, 370], "acumulada, no por muestra")
    }

    // Sin muestras no se inventa una serie plana de ceros: no hay segunda opinión y
    // se dice callando, que es justo la mentira que esto viene a cazar.
    func testNoHealthSamplesMeansNoSeries() {
        XCTAssertTrue(HealthKitDistanceProbe.series(from: [], startedAt: Date()).isEmpty)
    }

    // Las dos medidas conviven en la traza sin pisarse: la clave de la tabla es
    // (ejecución, señal, fuente), así que el lector ve las dos y decide.
    func testBothMeasurementsSurviveSideBySide() {
        let recorder = WorkoutTraceRecorder()
        recorder.accumulate(.distance, source: .gps, delta: 1000, atSecond: 300)   // la nuestra
        recorder.adopt(
            [WorkoutTraceRecorder.Point(second: 300, value: 1042)],                // la de Salud
            as: .distance, source: .healthkit
        )

        let traces = recorder.traces(startedAt: Date())
        XCTAssertEqual(traces.count, 2)
        XCTAssertEqual(Set(traces.map(\.source)), ["gps", "healthkit"])
        let bySource = Dictionary(uniqueKeysWithValues: traces.map { ($0.source, $0.values) })
        XCTAssertEqual(bySource["gps"], [1000])
        XCTAssertEqual(bySource["healthkit"], [1042], "la divergencia queda escrita")
    }
}
