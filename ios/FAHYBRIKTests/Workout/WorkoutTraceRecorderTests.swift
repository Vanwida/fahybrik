import XCTest
@testable import FAHYBRIK

// EL NEGATIVO DE LA SESIÓN. Estas pruebas fijan las cuatro reglas que hacen que la
// serie sea un archivo y no una interpretación: el eje en segundos enteros, el hueco
// que se ve, el diezmado que nunca corta el final, y la fuente como parte de la
// identidad de la serie.
final class WorkoutTraceRecorderTests: XCTestCase {

    private let anchor = Date(timeIntervalSince1970: 1_760_000_000)

    // MARK: - El eje

    // El eje va en SEGUNDOS ENTEROS desde el arranque, y sale ordenado.
    func testAxisIsWholeSecondsInOrder() {
        let r = WorkoutTraceRecorder()
        for (second, bpm) in [(0, 120.0), (1, 122.0), (2, 125.0)] {
            r.record(.hr, source: .strap, value: bpm, atSecond: second)
        }
        let traces = r.traces(startedAt: anchor)
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces[0].offsets_s, [0, 1, 2])
        XCTAssertEqual(traces[0].values, [120, 122, 125])
    }

    // Dos muestras en el MISMO segundo dejan la última: el eje tiene que ser
    // estrictamente creciente (lo exige el escritor de la 0156), no repetir instantes.
    func testTwoSamplesInOneSecondKeepTheLast() {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .strap, value: 140, atSecond: 10)
        r.record(.hr, source: .strap, value: 145, atSecond: 10)
        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.offsets_s, [10])
        XCTAssertEqual(t.values, [145])
    }

    // El reloj del sistema puede saltar hacia atrás (NTP). Una muestra con un segundo
    // anterior al último se descarta: un eje desordenado se lee mal para siempre.
    func testBackwardsClockIsDropped() {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .strap, value: 140, atSecond: 30)
        r.record(.hr, source: .strap, value: 999, atSecond: 12)
        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.offsets_s, [30], "una muestra del pasado no puede reescribir el eje")
        XCTAssertEqual(t.values, [140])
    }

    // Un segundo negativo (una muestra anterior al arranque) no entra.
    func testNegativeSecondIsDropped() {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .strap, value: 140, atSecond: -3)
        XCTAssertTrue(r.traces(startedAt: anchor).isEmpty)
    }

    // Un valor no finito (NaN/infinito de un sensor que se fue) no se archiva.
    func testNonFiniteValueIsDropped() {
        let r = WorkoutTraceRecorder()
        r.record(.speed, source: .gps, value: .nan, atSecond: 4)
        r.record(.speed, source: .gps, value: .infinity, atSecond: 5)
        XCTAssertTrue(r.traces(startedAt: anchor).isEmpty)
    }

    // MARK: - El hueco

    // UN HUECO ES UN HUECO. El atleta se para en un semáforo, la sesión se pausa y
    // deja de muestrear: en la serie tiene que quedar el agujero, no una interpolación.
    // Esta es la regla que la 0156 dejó escrita — rellenar es fabricar dato.
    func testGapIsNeverFilled() {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .healthkit, value: 150, atSecond: 100)
        r.record(.hr, source: .healthkit, value: 152, atSecond: 101)
        // …81 segundos sin cobertura…
        r.record(.hr, source: .healthkit, value: 138, atSecond: 182)

        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.offsets_s, [100, 101, 182])
        XCTAssertEqual(t.values.count, t.offsets_s.count)
        XCTAssertEqual(t.offsets_s.count, 3, "tres muestras son tres, no 83 con relleno")
    }

    // MARK: - Las fuentes

    // La banda y el reloj son DOS medidas del mismo fenómeno: dos series separadas,
    // sin mezclar. Es lo que permite que un relevo a mitad de carrera se lea como lo
    // que fue, y no como un pulso medio que nadie tuvo.
    func testEachSourceGetsItsOwnSeries() {
        let r = WorkoutTraceRecorder()
        for second in 0..<3 { r.record(.hr, source: .strap, value: 150, atSecond: second) }
        for second in 3..<6 { r.record(.hr, source: .healthkit, value: 148, atSecond: second) }

        let traces = r.traces(startedAt: anchor)
        XCTAssertEqual(traces.count, 2)
        let bySource = Dictionary(uniqueKeysWithValues: traces.map { ($0.source, $0) })
        XCTAssertEqual(bySource["strap"]?.offsets_s, [0, 1, 2])
        XCTAssertEqual(bySource["healthkit"]?.offsets_s, [3, 4, 5])
        XCTAssertEqual(Set(traces.map(\.signal)), ["hr"])
    }

    // La distancia llega en trozos ("metros desde el fix anterior") y se archiva
    // ACUMULADA, que es lo que deja mapear cualquier instante a un punto del recorrido.
    func testDistanceAccumulates() {
        let r = WorkoutTraceRecorder()
        r.accumulate(.distance, source: .gps, delta: 4.2, atSecond: 1)
        r.accumulate(.distance, source: .gps, delta: 3.8, atSecond: 2)
        r.accumulate(.distance, source: .gps, delta: 5.0, atSecond: 3)
        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.values, [4.2, 8.0, 13.0])
    }

    // Dos fixes dentro del mismo segundo suman sus metros los dos, aunque sólo quede
    // un punto: perder los metros del segundo fix sería acortar la carrera.
    func testDistanceKeepsBothDeltasInsideOneSecond() {
        let r = WorkoutTraceRecorder()
        r.accumulate(.distance, source: .gps, delta: 4.0, atSecond: 1)
        r.accumulate(.distance, source: .gps, delta: 3.0, atSecond: 1)
        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.offsets_s, [1])
        XCTAssertEqual(t.values, [7.0])
    }

    // MARK: - El diezmado

    // Por debajo del tope no se toca nada.
    func testUnderTheCapNothingIsDropped() {
        let points = (0..<500).map { WorkoutTraceRecorder.Point(second: $0, value: Double($0)) }
        XCTAssertEqual(WorkoutTraceRecorder.decimated(points, limit: 20_000), points)
    }

    // POR ENCIMA DEL TOPE SE DIEZMA, Y SE CONSERVAN EL PRIMERO Y EL ÚLTIMO. Recortar
    // la cola sería más fácil y es justo el fallo caro: en una tirada larga se
    // perderían los últimos kilómetros, que son los que cuentan.
    func testDecimationKeepsBothEnds() {
        let n = 50_000
        let points = (0..<n).map { WorkoutTraceRecorder.Point(second: $0, value: Double($0)) }
        let kept = WorkoutTraceRecorder.decimated(points, limit: 20_000)

        XCTAssertEqual(kept.count, 20_000)
        XCTAssertEqual(kept.first, points.first, "el principio de la carrera se queda")
        XCTAssertEqual(kept.last, points.last, "y el final TAMBIÉN — nunca se corta la cola")
    }

    // Diezmado UNIFORME: los puntos quedan repartidos por toda la serie, no apelotonados.
    func testDecimationIsUniformAndStrictlyIncreasing() {
        let points = (0..<100).map { WorkoutTraceRecorder.Point(second: $0, value: Double($0)) }
        let kept = WorkoutTraceRecorder.decimated(points, limit: 10)

        XCTAssertEqual(kept.count, 10)
        XCTAssertEqual(kept.map(\.second), [0, 11, 22, 33, 44, 55, 66, 77, 88, 99])
        for (a, b) in zip(kept, kept.dropFirst()) {
            XCTAssertLessThan(a.second, b.second, "el eje sigue siendo estrictamente creciente")
        }
    }

    // Una serie que supera el tope sale ya recortada del `traces`, sin que haya que
    // acordarse de llamar a nadie — el endpoint devuelve 400 por encima de 20.000 y
    // eso perdería la sesión entera.
    func testTracesAppliesTheCap() {
        let r = WorkoutTraceRecorder()
        for second in 0..<(TRACE_MAX_POINTS + 5_000) {
            r.record(.hr, source: .strap, value: Double(100 + second % 60), atSecond: second)
        }
        let t = r.traces(startedAt: anchor)[0]
        XCTAssertEqual(t.offsets_s.count, TRACE_MAX_POINTS)
        XCTAssertEqual(t.values.count, TRACE_MAX_POINTS)
        XCTAssertEqual(t.offsets_s.first, 0)
        XCTAssertEqual(t.offsets_s.last, TRACE_MAX_POINTS + 5_000 - 1)
    }

    // MARK: - El contrato del cuerpo

    // Los dos arrays describen los mismos puntos SIEMPRE — es un CHECK de la tabla y
    // un superRefine del Zod, así que desalinearlos es un 400 con la sesión dentro.
    func testArraysAlwaysAlign() {
        let r = WorkoutTraceRecorder()
        for second in 0..<77 {
            r.record(.speed, source: .gps, value: Double(second) * 0.03, atSecond: second * 3)
            r.record(.hr, source: .strap, value: 130, atSecond: second)
        }
        for t in r.traces(startedAt: anchor) {
            XCTAssertEqual(t.offsets_s.count, t.values.count, "traza desalineada en \(t.signal)")
            XCTAssertFalse(t.offsets_s.isEmpty)
        }
    }

    // Las claves del cuerpo son las que pide el Zod, en snake_case, y `started_at` va
    // en ISO 8601 con offset (`isoDateTime`).
    func testWireShapeMatchesTheSchema() throws {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .concept2, value: 141, atSecond: 0)
        let payload = WorkoutTracesPayload(execution_id: 137, traces: r.traces(startedAt: anchor))

        let data = try JSONEncoder().encode(payload)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["execution_id"] as? Int, 137)

        let traces = try XCTUnwrap(json["traces"] as? [[String: Any]])
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(Set(traces[0].keys), ["signal", "source", "started_at", "offsets_s", "values"])
        XCTAssertEqual(traces[0]["signal"] as? String, "hr")
        XCTAssertEqual(traces[0]["source"] as? String, "concept2")
        XCTAssertEqual(traces[0]["started_at"] as? String, "2025-10-09T08:53:20Z")
    }

    // Una sesión sin sensores no manda una traza vacía: no manda ninguna. Degradar
    // diciendo la verdad, que es lo que este código ya hace en todas partes.
    func testNothingMeasuredIsNoTrace() {
        XCTAssertTrue(WorkoutTraceRecorder().traces(startedAt: anchor).isEmpty)
        XCTAssertTrue(WorkoutTraceRecorder().isEmpty)
    }

    // NUNCA se emite `pace` (se deriva de la velocidad al leer) ni `cadence`/`power`
    // (no hay fuente en el dispositivo). El emisor sólo sabe nombrar lo que mide.
    func testTheEmitterCanOnlyNameWhatItMeasures() {
        XCTAssertEqual(Set(TraceSignal.allCases.map(\.rawValue)), ["hr", "speed", "distance", "altitude"])
    }

    // Los nombres de fuente son los del enum `biometric_source` de la base, no un
    // vocabulario nuestro: el pulso de una banda emparejada al PM5 es `concept2`.
    func testHRSourcesMapToTheSchemaVocabulary() {
        XCTAssertEqual(WorkoutSession.HRSource.strap.traceSource, .strap)
        XCTAssertEqual(WorkoutSession.HRSource.healthkit.traceSource, .healthkit)
        XCTAssertEqual(WorkoutSession.HRSource.pm5.traceSource, .concept2)
    }

    // Se redondea a lo que el sensor sabe de verdad: la columna es `real[]` y un
    // 3.4200000000000004 en el cuerpo son bytes por nada.
    func testValuesAreRoundedToWhatTheSensorKnows() {
        let r = WorkoutTraceRecorder()
        r.record(.hr, source: .strap, value: 142.7, atSecond: 0)
        r.record(.speed, source: .gps, value: 3.333333333, atSecond: 0)
        r.record(.altitude, source: .gps, value: 112.34567, atSecond: 0)

        let bySignal = Dictionary(uniqueKeysWithValues: r.traces(startedAt: anchor).map { ($0.signal, $0) })
        XCTAssertEqual(bySignal["hr"]?.values, [143])
        XCTAssertEqual(bySignal["speed"]?.values, [3.33])
        XCTAssertEqual(bySignal["altitude"]?.values, [112.3])
    }

    // MARK: - Coste

    // El tamaño REAL del cuerpo de una sesión de 90 min a 1 Hz con las cuatro señales.
    // Está aquí para que un cambio que lo dispare se vea en una prueba y no en la
    // factura: el límite de cuerpo de Vercel son 4,5 MB.
    func testNinetyMinuteSessionPayloadStaysSmall() throws {
        let r = WorkoutTraceRecorder()
        let seconds = 90 * 60
        for second in 0..<seconds {
            r.record(.hr, source: .strap, value: Double(140 + second % 25), atSecond: second)
            r.record(.speed, source: .gps, value: 3.2 + Double(second % 40) / 100, atSecond: second)
            r.accumulate(.distance, source: .gps, delta: 3.3, atSecond: second)
            r.record(.altitude, source: .gps, value: 90 + Double(second % 120) / 3, atSecond: second)
        }
        let payload = WorkoutTracesPayload(execution_id: 1, traces: r.traces(startedAt: anchor))
        let bytes = try JSONEncoder().encode(payload).count
        XCTAssertLessThan(bytes, 400_000, "una sesión de 90 min ocupa \(bytes) bytes")
        XCTAssertEqual(r.pointCount, seconds * 4)
    }

    // Ocho series como mucho en una sesión real (pulso por tres orígenes, velocidad y
    // distancia por dos, altitud), y el tope del endpoint son catorce.
    func testRealSessionStaysUnderTheRequestCap() {
        let r = WorkoutTraceRecorder()
        for source in [TraceSource.strap, .healthkit, .concept2] {
            r.record(.hr, source: source, value: 150, atSecond: 0)
        }
        for source in [TraceSource.gps, .treadmill] {
            r.record(.speed, source: source, value: 3.1, atSecond: 0)
            r.accumulate(.distance, source: source, delta: 3.1, atSecond: 0)
        }
        r.record(.altitude, source: .gps, value: 100, atSecond: 0)

        let traces = r.traces(startedAt: anchor)
        XCTAssertEqual(traces.count, 8)
        XCTAssertLessThanOrEqual(traces.count, TRACE_MAX_PER_REQUEST)
        // Y si alguna vez se pasara, lo primero que sale es el pulso, no lo que caiga
        // por orden alfabético.
        XCTAssertEqual(traces.first?.signal, "hr")
    }
}
