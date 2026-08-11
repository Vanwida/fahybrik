import XCTest
import SwiftUI
@testable import FAHYBRIK

// AL TERMINAR DE CORRER, RENDERIZADO DE VERDAD — las formas que la app SÍ puede
// alimentar hoy.
//
// Hermana de `VivoHUDRenderTests`, y por lo mismo: no es una prueba de píxeles, es
// la prueba de que la pantalla se SOSTIENE en cada forma de carrera, y de paso el
// sitio de donde salen las capturas que se comparan con el doble.
//
//   dos ritmos    — un 6×800 corrido entero: fuertes y trotes cerrados por el
//                   motor. El sujeto es el ritmo de lo fuerte, lo suave va pegado
//                   y el peine enseña que la media no toca ninguna barra.
//   media honesta — ocho vueltas que cubren la sesión entera y van todas al mismo
//                   esfuerzo: ahí la media SÍ las describe y se queda de sujeto.
//   sin lo suave  — la misma serie sin las recuperaciones grabadas: hubo
//                   contraste, pero no hay contra qué comparar, y se dice.
//   sin tramos    — la serie que corrió el reloj y volvió en UN lap agregado. El
//                   sujeto degrada a lo que sí se midió y la media sale con su
//                   etiqueta verdadera.
//
// LOS LAPS SALEN DEL MOTOR SIEMPRE QUE EL MOTOR PUEDA PRODUCIRLOS (misma ley que
// `HuecoDeclaradoRenderTests`): una captura con laps inventados no probaría lo que
// se quiere probar — que la pantalla lee lo que la app guarda. Las dos formas que
// el motor de HOY ya no genera —la serie sin sus trotes y la que vuelve colapsada
// del reloj— se arman a mano, porque siguen estando en la base y llegando por el
// cable, y son justo las que la pantalla tiene que saber leer sin inventar.

final class ResumenCarreraRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 781)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - Las cuatro formas

    @MainActor
    func testUnFartlekCorridoEnteroEnsenaSusDosRitmos() throws {
        let sesion = seriesCorridas()
        let carrera = CarreraDeLaSesion.carrera(laps: sesion.laps, segmentos: sesion.plan.segments)
        let lectura = FormaDeCarrera.lectura(de: try XCTUnwrap(carrera))
        XCTAssertEqual(lectura.forma, .conContraste, "seis fuertes contra cinco trotes son dos cosas")
        XCTAssertEqual(lectura.certeza, .marcados)
        XCTAssertEqual(lectura.fuerte?.n, 6)
        XCTAssertEqual(lectura.suave?.n, 5)
        XCTAssertTrue(lectura.tramosSonLectura, "hay peine que pintar")

        XCTAssertNotNil(render(sesion, nombre: "carrera-dos-ritmos"),
                        "el par de ritmos tiene que renderizar")
    }

    @MainActor
    func testOchoVueltasAlMismoEsfuerzoDejanLaMediaDeSujeto() throws {
        let sesion = ochoVueltasCorridas()
        let carrera = CarreraDeLaSesion.carrera(laps: sesion.laps, segmentos: sesion.plan.segments)
        let lectura = FormaDeCarrera.lectura(de: try XCTUnwrap(carrera))
        XCTAssertEqual(lectura.forma, .uniforme, "cubren la sesión entera y van al mismo esfuerzo")
        XCTAssertFalse(lectura.mediaEsMezcla)

        XCTAssertNotNil(render(sesion, nombre: "carrera-media-honesta"),
                        "la media honesta tiene que renderizar")
    }

    @MainActor
    func testSinLasRecuperacionesGrabadasSeDiceQueNoHayContraQueComparar() throws {
        let sesion = seriesSinLosTrotes()
        let carrera = CarreraDeLaSesion.carrera(laps: sesion.laps, segmentos: sesion.plan.segments)
        let lectura = FormaDeCarrera.lectura(de: try XCTUnwrap(carrera))
        // El hueco entre lo cubierto y lo que duró la carrera ES la recuperación que
        // nadie grabó: hubo contraste, y llamar «uniforme» a esto absolvería a la
        // media.
        XCTAssertEqual(lectura.forma, .conContraste)
        XCTAssertNil(lectura.suave)
        XCTAssertNil(lectura.contrasteSkm)

        XCTAssertNotNil(render(sesion, nombre: "carrera-sin-lo-suave"),
                        "el hueco declarado tiene que renderizar")
    }

    @MainActor
    func testLaSerieQueVolvioEnUnSoloLapDegradaAKilometros() throws {
        let sesion = serieColapsada()
        let carrera = CarreraDeLaSesion.carrera(laps: sesion.laps, segmentos: sesion.plan.segments)
        let lectura = FormaDeCarrera.lectura(de: try XCTUnwrap(carrera))
        XCTAssertEqual(lectura.forma, .noSeSabe)
        XCTAssertEqual(lectura.motivo, .sinSerie)
        // El coach mandó contraste, así que sabemos que su media es una mezcla
        // aunque no sepamos partirla.
        XCTAssertTrue(lectura.mediaEsMezcla)

        XCTAssertNotNil(render(sesion, nombre: "carrera-sin-tramos"),
                        "el peor caso tiene que renderizar, y es el que más aire deja")
    }

    // MARK: - Fixtures — corridas por el motor

    private func tramoDeSeries(reps: Int, metros: Int, trote: Int?) -> WorkoutSegment {
        func work(_ m: Int) -> RunElement {
            .segment(RunSegment(kind: .work, measure: .distance(m: m), target: nil, resolved: nil,
                                inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
        }
        func rec(_ s: Int) -> RunElement {
            .segment(RunSegment(kind: .recovery, measure: .duration(s: s), target: nil, resolved: nil,
                                inclinePct: nil, cadenceSpm: nil, recoveryMode: .trote))
        }
        var elementos: [RunElement] = []
        for i in 0..<reps {
            elementos.append(work(metros))
            if let trote, i < reps - 1 { elementos.append(rec(trote)) }
        }
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: elementos)])
        return WorkoutSegment(order: 1, title: "\(reps)×\(metros)", kind: .running,
                              targetDistanceMeters: Double(metros), targetZone: .z4,
                              blockTitle: "Principal", blockPosition: 1, prescription: rx)
    }

    private func sesionDe(_ tramo: WorkoutSegment, nombre: String) -> WorkoutSession {
        let plan = WorkoutPlan(id: UUID(), name: nombre, format: .intervals,
                               estimatedDurationSeconds: 0, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan, hrZones: Self.zonas())
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()      // salta la cuenta atrás 3-2-1
        return s
    }

    /// Un 6×800 con 2:00 de trote, tocado tramo a tramo como lo toca el atleta. El
    /// ritmo de cada tramo sale de `recordRunLegLap`, no de nada puesto a mano.
    private func seriesCorridas() -> WorkoutSession {
        let tramo = tramoDeSeries(reps: 6, metros: 800, trote: 120)
        let s = sesionDe(tramo, nombre: "Series 6×800")
        for i in 0..<11 {
            let esFuerte = i % 2 == 0
            let segundos: Double = esFuerte ? 190 + Double(i) : 120
            s.injectLiveHR(esFuerte ? 172 : 148, source: .strap)
            s.sampleRunGPS(deltaMeters: esFuerte ? 805 : 380)
            s.lapElapsedSeconds += segundos
            s.elapsedSeconds += segundos
            s.primaryAdvance()
        }
        return s
    }

    /// LA MISMA SERIE GRABADA POR EL CAMINO DE HASTA EL 29-JUL: seis fuertes y ni
    /// un trote. Esta va a mano y no por el motor, y tiene que ser así: el motor de
    /// hoy YA graba las recuperaciones, así que no puede producir esta forma — pero
    /// está en la base de todo atleta que corrió antes de esa fecha, y llega igual
    /// desde un reloj que sólo manda las series.
    ///
    /// Las horas son reales y separadas por los dos minutos de trote que nadie
    /// grabó: sin ese hueco de reloj de pared no habría nada que delatara el
    /// contraste, y ESE es justo el mecanismo que esta captura prueba.
    private func seriesSinLosTrotes() -> WorkoutSession {
        let tramo = tramoDeSeries(reps: 6, metros: 800, trote: 120)
        let s = sesionDe(tramo, nombre: "Series 6×800")
        let ritmos: [Double] = [190, 192, 195, 197, 200, 203]   // se va yendo, como se va
        var reloj = Date(timeIntervalSinceNow: -(ritmos.reduce(0, +) + 5 * 120))
        s.laps = ritmos.enumerated().map { i, segundos in
            let inicio = reloj
            reloj = reloj.addingTimeInterval(segundos + 120)     // el trote que no se grabó
            return LapRecord(id: UUID(), segmentId: tramo.id, templateSegmentId: nil,
                             position: tramo.order, modality: "run",
                             startedAt: inicio, endedAt: inicio.addingTimeInterval(segundos),
                             durationSeconds: segundos,
                             avgHRBpm: 172, maxHRBpm: 181, zoneSecondsByZone: [:],
                             repsCompleted: nil, distanceCoveredMeters: 800,
                             avgPaceSecPer500m: nil, avgPaceSecPerKm: segundos / 0.8,
                             avgPowerWatts: nil, strokeRateSpm: nil, calories: nil,
                             weightUsedKg: nil, source: "gps",
                             runLegIndex: i * 2, runLegRole: "work", runLegPhase: "main")
        }
        return s
    }

    /// Las ocho vueltas de una carrera: ocho tramos de trabajo seguidos, sin trote
    /// entre medias. Cubren la sesión entera, así que su media SÍ las describe.
    private func ochoVueltasCorridas() -> WorkoutSession {
        let tramo = tramoDeSeries(reps: 8, metros: 1000, trote: nil)
        let s = sesionDe(tramo, nombre: "Carrera 8 × 1 km")
        for i in 0..<8 {
            let segundos: Double = [227, 234, 247, 245, 258, 249, 250, 248][i]
            s.injectLiveHR(174, source: .strap)
            s.sampleRunGPS(deltaMeters: 1000)
            s.lapElapsedSeconds += segundos
            s.elapsedSeconds += segundos
            s.primaryAdvance()
        }
        return s
    }

    /// El camino del reloj: la serie vuelve en UN lap agregado, sin ordinales. Es
    /// exactamente lo que la app guarda hoy de la mayoría de las carreras.
    private func serieColapsada() -> WorkoutSession {
        let tramo = tramoDeSeries(reps: 6, metros: 800, trote: 120)
        let s = sesionDe(tramo, nombre: "Series 6×800")
        s.laps = [LapRecord(id: UUID(), segmentId: tramo.id, templateSegmentId: nil,
                            position: tramo.order, modality: "run",
                            startedAt: Date(timeIntervalSinceNow: -1_980), endedAt: Date(),
                            durationSeconds: 1_980,
                            avgHRBpm: 168, maxHRBpm: 181, zoneSecondsByZone: [:],
                            repsCompleted: nil, distanceCoveredMeters: 4_800,
                            avgPaceSecPer500m: nil, avgPaceSecPerKm: nil, avgPowerWatts: nil,
                            strokeRateSpm: nil, calories: nil, weightUsedKg: nil, source: "gps")]
        return s
    }

    private static func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170, estimated: false, source: "test",
            sourceLabel: "Zonas de tu test de umbral", confidence: "measured",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    // MARK: - Render

    @MainActor
    private func render(_ sesion: WorkoutSession, nombre: String) -> UIImage? {
        let renderer = ImageRenderer(
            content: ResumenCarreraView(session: sesion, onContinuar: {})
                .frame(width: Self.lienzo.width, height: Self.lienzo.height)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }
        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
