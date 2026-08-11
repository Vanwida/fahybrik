import XCTest
@testable import FAHYBRIK

/// Contador de repeticiones y velocidad de barra (plan fases 0–3).
///
/// La señal NO se escribe a mano: se define la trayectoria de la muñeca en el
/// mundo y la orientación del reloj, y de ahí salen la aceleración y la gravedad
/// EN EL MARCO DEL DISPOSITIVO — que es exactamente lo que entrega CoreMotion.
/// Escribir «un seno en el eje X» probaba el detector contra una fantasía: así
/// pasaba wall balls y suspendía un back squat.
final class SensorPipelineTests: XCTestCase {

    // MARK: - Generador de señal

    private struct Movimiento {
        /// Trayectoria de la muñeca en el mundo (metros). z = arriba.
        var path: (Double) -> (Double, Double, Double)
        /// Giro del antebrazo (radianes).
        var pitch: (Double) -> Double = { _ in 0 }
        /// Inclinación fija del reloj en la muñeca (radianes).
        var tilt: Double = 0.6
    }

    private func capture(_ m: Movimiento, seconds: Double, hz: Double = 50) -> [SensorSample] {
        let dt = 1.0 / hz
        var seed: UInt64 = 20260811
        func noise(_ amp: Double) -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return (Double(seed >> 33) / Double(UInt64(1) << 31) - 1) * amp
        }
        func rotate(_ v: (Double, Double, Double), pitch: Double, tilt: Double) -> (Double, Double, Double) {
            let y1 = v.1 * cos(pitch) + v.2 * sin(pitch)
            let z1 = -v.1 * sin(pitch) + v.2 * cos(pitch)
            let x2 = v.0 * cos(tilt) - z1 * sin(tilt)
            let z2 = v.0 * sin(tilt) + z1 * cos(tilt)
            return (x2, y1, z2)
        }
        var out: [SensorSample] = []
        for i in 0..<Int(seconds * hz) {
            let t = Double(i) * dt
            let a = m.path(t - dt), b = m.path(t), c = m.path(t + dt)
            let accel = ((a.0 - 2 * b.0 + c.0) / (dt * dt),
                         (a.1 - 2 * b.1 + c.1) / (dt * dt),
                         (a.2 - 2 * b.2 + c.2) / (dt * dt))
            let p = m.pitch(t)
            let aDev = rotate(accel, pitch: p, tilt: m.tilt)
            let gDev = rotate((0, 0, -1), pitch: p, tilt: m.tilt)
            out.append(SensorSample(
                t: t,
                ax: aDev.0 + noise(0.15), ay: aDev.1 + noise(0.15), az: aDev.2 + noise(0.15),
                gx: 0, gy: 0, gz: 0,
                grx: gDev.0 + noise(0.004), gry: gDev.1 + noise(0.004), grz: gDev.2 + noise(0.004)
            ))
        }
        return out
    }

    /// Baja `rom` metros y vuelve, `reps` veces, con `pause` s de espera arriba.
    private func idaYVuelta(reps: Int, cycle: Double, rom: Double,
                            pause: Double = 0, delay: Double = 0) -> (Double) -> (Double, Double, Double) {
        let period = cycle + pause
        return { t in
            let u0 = t - delay
            guard u0 >= 0 else { return (0, 0, 0) }
            let k = floor(u0 / period)
            guard k < Double(reps) else { return (0, 0, 0) }
            let u = u0 - k * period
            guard u <= cycle else { return (0, 0, 0) }
            return (0, 0, -rom * 0.5 * (1 - cos(2 * .pi * u / cycle)))
        }
    }

    private func giro(reps: Int, cycle: Double, degrees: Double) -> (Double) -> Double {
        let rad = degrees * .pi / 180
        return { t in
            let k = floor(max(0, t) / cycle)
            guard k < Double(reps), t >= 0 else { return 0 }
            let u = t - k * cycle
            return rad * 0.5 * (1 - cos(2 * .pi * u / cycle))
        }
    }

    private func contar(_ samples: [SensorSample]) -> RepTracker {
        var tracker = RepTracker()
        for s in samples { tracker.push(s) }
        return tracker
    }

    // MARK: - Lo que viaja con la carga

    func testBackSquatLentoSeCuenta() {
        // 3 s bajando + 1,5 s subiendo. El contador anterior (por periodicidad, con
        // tope de 3,5 s de periodo) daba CERO en este caso — el más normal del gym.
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 6, cycle: 4.5, rom: 0.45, delay: 1.5)),
                              seconds: 32))
        XCTAssertLessThanOrEqual(abs(t.count - 6), 1, "back squat lento: \(t.count) de 6")
        XCTAssertEqual(t.level, .counted)
        // Concéntrica de 45 cm en ~2,25 s ⇒ 0,20 m/s.
        XCTAssertEqual(t.last?.concentricMs ?? 0, 0.20, accuracy: 0.08)
    }

    func testBackSquatConPausaArribaCuentaTodas() {
        // 2 s parado entre repeticiones: lo que hace cualquiera con carga alta.
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 5, cycle: 3.5, rom: 0.45, pause: 2)),
                              seconds: 34))
        XCTAssertLessThanOrEqual(abs(t.count - 5), 1, "con pausa arriba: \(t.count) de 5")
    }

    func testPressBancaTumbadoSeCuenta() {
        // Tumbado el reloj mira a otro sitio: el eje vertical sale de la gravedad
        // medida, no de un eje del dispositivo.
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 2.2, rom: 0.38), tilt: 1.9),
                              seconds: 20))
        XCTAssertLessThanOrEqual(abs(t.count - 8), 1, "press banca: \(t.count) de 8")
        XCTAssertEqual(t.last?.concentricMs ?? 0, 0.35, accuracy: 0.14)
    }

    func testWallBallsSeCuentan() {
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 10, cycle: 1.2, rom: 0.60)), seconds: 14))
        XCTAssertLessThanOrEqual(abs(t.count - 10), 1, "wall balls: \(t.count) de 10")
    }

    func testCurlConAntebrazoGirandoSeCuentaPorRecorrido() {
        // Un curl gira 70° Y viaja 35 cm. Manda el recorrido, porque es el que
        // trae velocidad: contarlo por el giro dejaría la serie sin m/s.
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 10, cycle: 1.8, rom: 0.35),
                                         pitch: giro(reps: 10, cycle: 1.8, degrees: 70)),
                              seconds: 20))
        XCTAssertLessThanOrEqual(abs(t.count - 10), 1, "curl: \(t.count) de 10")
        XCTAssertGreaterThan(t.last?.concentricMs ?? 0, 0, "un curl sí tiene velocidad medible")
    }

    // MARK: - Manos fijas: se mueve el cuerpo, no la muñeca

    func testDominadasSeCuentanPorOrientacion() {
        // La muñeca viaja 4 cm (las manos están en la barra) y el antebrazo abre 40°.
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 2.4, rom: 0.04),
                                         pitch: giro(reps: 8, cycle: 2.4, degrees: 40)),
                              seconds: 22))
        XCTAssertLessThanOrEqual(abs(t.count - 8), 1, "dominadas: \(t.count) de 8")
        XCTAssertEqual(t.last?.concentricMs ?? 0, 0, "sin traslación no se inventa m/s")
        XCTAssertEqual(t.level, .doubtful, "contadas por giro: estimación, nunca aplomo")
    }

    func testFlexionesSeCuentanPorOrientacion() {
        let t = contar(capture(Movimiento(path: idaYVuelta(reps: 12, cycle: 1.6, rom: 0.05),
                                         pitch: giro(reps: 12, cycle: 1.6, degrees: 32)),
                              seconds: 22))
        XCTAssertLessThanOrEqual(abs(t.count - 12), 1, "flexiones: \(t.count) de 12")
    }

    // MARK: - Lo que NO es una repetición

    func testAndarHaciaLaBarraNoCuentaNada() {
        // ESTE es el fallo que reportó Alex el 11-ago: el contador por periodicidad
        // daba 8 repeticiones con confianza 0,90 andando. Brazo 30 cm adelante y
        // atrás, muñeca subiendo 2 cm, antebrazo basculando 25° con la zancada.
        let t = contar(capture(Movimiento(
            path: { t in (0.15 * sin(2 * .pi * t / 1.1), 0, 0.02 * sin(2 * .pi * t / 0.55)) },
            pitch: { t in 25 * .pi / 180 * sin(2 * .pi * t / 1.1) }
        ), seconds: 30))
        XCTAssertEqual(t.count, 0, "andar no es una serie")
        XCTAssertEqual(t.level, .unknown)
    }

    func testFarmerCarryNoCuentaNada() {
        let t = contar(capture(Movimiento(path: { t in
            (0.01 * sin(2 * .pi * t / 0.9), 0, 0.01 * sin(2 * .pi * t / 0.7))
        }), seconds: 20))
        XCTAssertEqual(t.count, 0, "un carry no tiene repeticiones")
    }

    func testLevantarseDeLaSillaNoEsUnaSerie() {
        let t = contar(capture(Movimiento(path: { t in
            t < 1 ? (0, 0, 0) : (0, 0, -0.35 * max(0, min(1, (2.2 - t) / 1.2)))
        }), seconds: 8))
        XCTAssertLessThanOrEqual(t.count, 1, "una excursión suelta no es una serie")
        XCTAssertNotEqual(t.level, .counted, "y nunca con aplomo")
    }

    func testRemoSentadoHorizontalNoEntregaNumero() {
        // 40 cm horizontales. A esta altura un remo sentado y un brazo balanceándose
        // son la misma señal: no se entrega número (lo resolverá el clasificador).
        let t = contar(capture(Movimiento(path: { t in
            let u = t.truncatingRemainder(dividingBy: 1.8)
            return (-0.20 * (1 - cos(2 * .pi * u / 1.8)), 0, 0)
        }), seconds: 20))
        XCTAssertEqual(t.count, 0)
    }

    // MARK: - Una velocidad por repetición, no en streaming

    func testLaVelocidadCambiaUnaVezPorRepeticion() {
        var tracker = RepTracker()
        var cambios = 0
        var ultimo: Double?
        for s in capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 2.2, rom: 0.45)), seconds: 20) {
            tracker.push(s)
            if tracker.last?.concentricMs != ultimo {
                cambios += 1
                ultimo = tracker.last?.concentricMs
            }
        }
        XCTAssertEqual(cambios, tracker.count,
                       "la velocidad se sella al cerrar la repetición y no se toca hasta la siguiente")
    }

    func testElConteoNuncaBaja() {
        var tracker = RepTracker()
        var maximo = 0
        for s in capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 1.8, rom: 0.40)), seconds: 20) {
            tracker.push(s)
            XCTAssertGreaterThanOrEqual(tracker.count, maximo, "el conteo es monotónico")
            maximo = tracker.count
        }
    }

    func testSinGravedadNoSeCuentaNada() {
        // Un archivo v1 (sin gravedad) no tiene eje vertical: se declara «no lo sé»
        // en vez de contar sobre un eje adivinado.
        let sinGravedad = capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 1.8, rom: 0.45)), seconds: 18)
            .map { SensorSample(t: $0.t, ax: $0.ax, ay: $0.ay, az: $0.az, gx: 0, gy: 0, gz: 0) }
        XCTAssertEqual(contar(sinGravedad).count, 0)
    }

    // MARK: - La serie es el contexto (pipeline)

    @MainActor
    func testSinVentanaAbiertaNoSeCuenta() {
        let pipe = SensorPipeline()
        pipe.beginSession(mode: .classic)
        for s in capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 1.8, rom: 0.45)), seconds: 20) {
            pipe.pushRaw(t: s.t, ax: s.ax, ay: s.ay, az: s.az,
                         gx: s.gx, gy: s.gy, gz: s.gz, grx: s.grx, gry: s.gry, grz: s.grz)
        }
        XCTAssertEqual(pipe.liveCompletedReps, 0, "sin serie abierta no se cuenta")
    }

    @MainActor
    func testConVentanaDeFuerzaSeCuentaYAlCambiarDeSerieVuelveACero() {
        let pipe = SensorPipeline()
        pipe.beginSession(mode: .classic)
        pipe.setActiveWindow(key: "seg0|0|Back squat", modality: "strength", name: "Back squat", at: 0)
        for s in capture(Movimiento(path: idaYVuelta(reps: 8, cycle: 1.8, rom: 0.45)), seconds: 20) {
            pipe.pushRaw(t: s.t, ax: s.ax, ay: s.ay, az: s.az,
                         gx: s.gx, gy: s.gy, gz: s.gz, grx: s.grx, gry: s.gry, grz: s.grz)
        }
        XCTAssertGreaterThanOrEqual(pipe.liveCompletedReps, 6)
        XCTAssertNotNil(pipe.lastCompletedRepVelocityMs)
        pipe.setActiveWindow(key: "seg0|1|Back squat", modality: "strength", name: "Back squat", at: 20)
        XCTAssertEqual(pipe.liveCompletedReps, 0, "la serie siguiente cuenta las suyas")
        XCTAssertNil(pipe.lastCompletedRepVelocityMs)
    }

    @MainActor
    func testEnErgoNoSeCuentanRepeticionesDeMuneca() {
        XCTAssertFalse(SensorPipeline.countsReps(modality: "row"))
        XCTAssertFalse(SensorPipeline.countsReps(modality: "run"))
        XCTAssertTrue(SensorPipeline.countsReps(modality: "strength"))
        XCTAssertTrue(SensorPipeline.countsReps(modality: "functional"))
        // Modalidad desconocida SÍ cuenta: la ventana ya restringe a una serie
        // abierta, y callarse ahí dejaría el entreno libre sin contador.
        XCTAssertTrue(SensorPipeline.countsReps(modality: nil))
    }

    // MARK: - Decimador + archivo

    func testDecimatorDownsamplesToTargetRate() {
        var d = SensorDecimator(targetHz: 50)
        var out: [SensorSample] = []
        for i in 0..<200 {
            let t = Double(i) / 200.0
            out += d.push(t: t, ax: 1, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, grx: 0, gry: 0, grz: -1)
        }
        out += d.finish()
        XCTAssertGreaterThan(out.count, 40)
        XCTAssertLessThan(out.count, 60)
        XCTAssertEqual(out.first?.ax ?? 0, 1, accuracy: 0.01)
        XCTAssertEqual(out.first?.grz ?? 0, -1, accuracy: 0.01)
    }

    func testCodecRoundTripPreservesAlignmentAndGravity() throws {
        let samples = (0..<100).map { i -> SensorSample in
            let t = Double(i) / 50.0
            return SensorSample(t: t, ax: sin(t), ay: cos(t), az: 0.1,
                                gx: 0.01, gy: -0.02, gz: 0.03,
                                grx: 0.1, gry: -0.2, grz: -0.97)
        }
        let header = SensorFileHeader(
            formatVersion: Int(SensorFileFormat.version),
            executionLocalId: "local-1",
            startedAt: "2026-08-06T10:00:00.000Z",
            sampleHz: 50,
            channels: SensorFileFormat.channels,
            captureMode: "classic",
            watchModel: "Watch6,1",
            wrist: "left",
            appVersion: "1.0",
            windows: [SensorWindowLabel(t0: 0, t1: 2, tramoId: "t1", exerciseId: 9,
                                        modality: "strength", movementName: "squat")],
            sampleCount: samples.count
        )
        let data = try SensorFileCodec.encode(header: header, samples: samples)
        // 9 canales × 2 B × 50 Hz = 900 B/s ⇒ 2,4 MB en 45 min, dentro del presupuesto.
        XCTAssertLessThan(data.count, 5_000)

        let decoded = try SensorFileCodec.decode(data)
        XCTAssertEqual(decoded.samples.count, samples.count)
        XCTAssertEqual(decoded.header.windows.count, 1)
        XCTAssertEqual(decoded.samples[10].ax, samples[10].ax, accuracy: 0.02)
        XCTAssertEqual(decoded.samples[10].grz, -0.97, accuracy: 0.001)
        XCTAssertEqual(decoded.samples[10].verticalAccel ?? 0,
                       samples[10].verticalAccel ?? -99, accuracy: 0.02)
    }

    // MARK: - Trabajo y descanso

    func testActivityDetectorSplitsWorkAndRest() {
        var samples: [SensorSample] = []
        let hz = 50.0
        for i in 0..<400 {
            let t = Double(i) / hz
            let working = t >= 2 && t < 6
            let ax = working ? 8 * sin(2 * .pi * 1.5 * t) : 0.05 * sin(2 * .pi * 0.2 * t)
            samples.append(SensorSample(t: t, ax: ax, ay: 0.02, az: 0.01, gx: 0, gy: 0, gz: 0))
        }
        let result = ActivityDetector().analyze(samples)
        XCTAssertGreaterThan(result.workSeconds, 3.0)
        XCTAssertLessThan(result.workSeconds, 5.5)
        XCTAssertGreaterThan(result.restSeconds, 2.5)
        XCTAssertEqual(result.workSeconds + result.restSeconds, 8.0, accuracy: 0.3)
        XCTAssertGreaterThan(result.confidence, 0.3)
    }

    @MainActor
    func testMergeWorkIntervalsBridgesBetweenRepPauses() {
        let raw: [(Double, Double)] = [(0, 2.0), (2.5, 4.5), (5.0, 8.0), (20, 25)]
        let merged = SensorPipeline.mergeWorkIntervals(raw, maxGap: 1.8)
        XCTAssertEqual(merged.count, 2)
        XCTAssertEqual(merged[0].0, 0, accuracy: 0.01)
        XCTAssertEqual(merged[0].1, 8.0, accuracy: 0.01)
        XCTAssertEqual(merged[1].0, 20, accuracy: 0.01)
    }
}
