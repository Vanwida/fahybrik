import XCTest
import SwiftUI
@testable import FAHYBRIK

// LAS DOS PANTALLAS DONDE EL HUECO SE DECLARA, RENDERIZADAS DE VERDAD.
//
// Hermana de `VivoHUDRenderTests`, y por lo mismo: no es una prueba de píxeles, es la
// prueba de que la pantalla se SOSTIENE en el estado que importa — y de paso el sitio
// de donde salen las capturas.
//
//   la semana      — la mayoría de las sesiones no escriben reloj. Antes se sumaban
//                    como cero y el volumen salía como si fuera el de la semana
//                    entera. Ahora se da el SUELO y se declara lo que queda fuera.
//   los tramos     — un 6×800 acabado, con lo que la app guarda HOY: un lap por
//                    tramo fuerte y ninguna recuperación. Antes no se veía ninguno
//                    de los seis; ahora se ven los seis, y lo que falta se dice.
//
// Las dos vistas viven fuera de su pantalla precisamente para poder renderizarse:
// dentro cuelgan de un ScrollView e `ImageRenderer` no dibuja ScrollView.

final class HuecoDeclaradoRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402   // iPhone 17 Pro dentro del área segura

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - La semana

    @MainActor
    func testLaSemanaConSesionesSinEstimarDeclaraSuHueco() throws {
        // La semana real de producción: seis sesiones, UNA escribe su reloj.
        let sesiones = try [
            sesion(titulo: "Simulación HYROX", modalidad: "hyrox", minutos: nil, motivo: "scored_by_time"),
            sesion(titulo: "Rodaje Z2", modalidad: "run", minutos: 50, motivo: nil),
            sesion(titulo: "Fuerza · pierna", modalidad: "strength", minutos: nil, motivo: "work_not_timed"),
            sesion(titulo: "Series 6×800", modalidad: "run", minutos: nil, motivo: "work_not_timed"),
            sesion(titulo: "Remo + ski", modalidad: "row", minutos: nil, motivo: "undosed"),
            sesion(titulo: "Metcon", modalidad: "functional", minutos: nil, motivo: "scored_by_time"),
        ]

        // La verdad que la tarjeta tiene que contar, comprobada antes de pintarla.
        let lectura = VolumenPrevisto.lee(sesiones.map(\.estDurationMinutes))
        XCTAssertEqual(lectura.linea, "desde 50 min · 5 sin tiempo previsto")

        let imagen = render(
            ResumenSemanaCard(sesiones: sesiones),
            nombre: "semana-resumen-sin-estimar", alto: 220
        )
        XCTAssertNotNil(imagen, "el resumen de la semana tiene que renderizar")
    }

    @MainActor
    func testLaSemanaEnteraEscritaNoDeclaraNada() throws {
        let sesiones = try [
            sesion(titulo: "Rodaje Z2", modalidad: "run", minutos: 50, motivo: nil),
            sesion(titulo: "Fuerza · empuje", modalidad: "strength", minutos: 65, motivo: nil),
            sesion(titulo: "Remo 5×1000", modalidad: "row", minutos: 45, motivo: nil),
        ]
        XCTAssertEqual(VolumenPrevisto.lee(sesiones.map(\.estDurationMinutes)).linea, "desde 2 h 40")
        let imagen = render(
            ResumenSemanaCard(sesiones: sesiones),
            nombre: "semana-resumen-completa", alto: 200
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Los tramos de una serie

    @MainActor
    func testAlAcabarUn6x800SeVenLosSeisTramos() {
        let sesion = seisPorOchocientosCorrido()
        let seg = sesion.plan.segments[0]
        let lectura = TramosMedidos.lee(segmento: seg, laps: sesion.laps)

        // Lo que la app guarda desde la 0146: TODOS los tramos, incluidas las cinco
        // recuperaciones. El test anterior fijaba «6 filas» porque el motor tiraba las
        // recuperaciones al grabar — grabarlas era justo el arreglo, así que la
        // expectativa vieja era la especificación del bug.
        XCTAssertEqual(seg.runStructureLegs?.count, 11)
        XCTAssertEqual(lectura.filas.count, 11, "los once tramos: seis fuertes y cinco recuperaciones")
        XCTAssertEqual(lectura.fuertesMedidos, 6, "de los once, seis son de trabajo")
        XCTAssertTrue(TablaDeTramos.hayQuePintarla(segmentos: sesion.plan.segments, laps: sesion.laps))

        let imagen = render(
            TablaDeTramos(grupos: sesion.plan.segmentGroups, laps: sesion.laps,
                          ritmosManuales: .constant([:])),
            nombre: "resumen-carrera-tramos", alto: 360
        )
        XCTAssertNotNil(imagen, "la tabla de tramos tiene que renderizar")
    }

    @MainActor
    func testUnaSerieQueLlegaColapsadaLoDice() {
        let sesion = seisPorOchocientosCorrido(colapsada: true)
        let lectura = TramosMedidos.lee(segmento: sesion.plan.segments[0], laps: sesion.laps)
        XCTAssertTrue(lectura.sinTiemposPorTramo)

        let imagen = render(
            TablaDeTramos(grupos: sesion.plan.segmentGroups, laps: sesion.laps,
                          ritmosManuales: .constant([:])),
            nombre: "resumen-carrera-sin-tramos", alto: 200
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Montaje

    private func sesion(titulo: String, modalidad: String,
                        minutos: Int?, motivo: String?) throws -> AthleteWeekDaySession {
        // Por el CABLE y no a mano: así la captura prueba también que el motivo del
        // servidor llega hasta el píxel.
        var campos: [String] = [
            #""assignment_id":"\#(UUID().uuidString)""#,
            #""slot":"am""#, #""title":"\#(titulo)""#,
            #""modality":"\#(modalidad)""#, #""status":"pending""#,
        ]
        campos.append(#""est_duration_minutes":\#(minutos.map(String.init) ?? "null")"#)
        campos.append(#""duration_unknown_reason":\#(motivo.map { "\"\($0)\"" } ?? "null")"#)
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AthleteWeekDaySession.self, from: Data("{\(campos.joined(separator: ","))}".utf8))
    }

    /// Un 6×800 con 2:00 de trote, CORRIDO por el motor de verdad: los laps salen de
    /// `recordRunLegLap`, no puestos a mano. Una captura con laps inventados no
    /// probaría lo que se quiere probar — que la pantalla lee lo que la app guarda.
    private func seisPorOchocientosCorrido(colapsada: Bool = false) -> WorkoutSession {
        func work(_ m: Int) -> RunElement {
            .segment(RunSegment(kind: .work, measure: .distance(m: m), target: nil, resolved: nil,
                                inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
        }
        func rec(_ s: Int) -> RunElement {
            .segment(RunSegment(kind: .recovery, measure: .duration(s: s), target: nil, resolved: nil,
                                inclinePct: nil, cadenceSpm: nil, recoveryMode: .trote))
        }
        var elementos: [RunElement] = []
        for i in 0..<6 { elementos += (i == 5 ? [work(800)] : [work(800), rec(120)]) }

        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: elementos)])
        let series = WorkoutSegment(order: 1, title: "6×800", kind: .running,
                                    targetDistanceMeters: 800, targetZone: .z4,
                                    blockTitle: "Principal", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Series 6×800", format: .intervals,
                               estimatedDurationSeconds: 0, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [series],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()                      // salta la cuenta atrás 3-2-1

        if colapsada {
            // El camino del reloj: la serie vuelve en UN lap agregado, sin ordinales.
            s.laps = [LapRecord(id: UUID(), segmentId: series.id, templateSegmentId: nil,
                                position: series.order, modality: "run",
                                startedAt: Date(), endedAt: Date(), durationSeconds: 1_980,
                                avgHRBpm: 168, maxHRBpm: 181, zoneSecondsByZone: [:],
                                repsCompleted: nil, distanceCoveredMeters: 4_800,
                                avgPaceSecPer500m: nil, avgPaceSecPerKm: nil, avgPowerWatts: nil,
                                strokeRateSpm: nil, calories: nil, weightUsedKg: nil, source: "gps")]
            return s
        }

        // Los once tramos, tocados como los toca el atleta. El GPS va alimentando la
        // distancia cubierta para que cada tramo fuerte cierre con SU ritmo, medido:
        // el ritmo de la fila sale de `recordRunLegLap`, no de nada puesto a mano.
        for i in 0..<11 {
            let esFuerte = i % 2 == 0
            let segundos: Double = esFuerte ? 190 + Double(i) : 120
            s.sampleRunGPS(deltaMeters: esFuerte ? 805 : 380)
            s.lapElapsedSeconds += segundos
            s.elapsedSeconds += segundos
            s.primaryAdvance()
        }
        return s
    }

    // MARK: - Render

    @MainActor
    private func render(_ vista: some View, nombre: String, alto: CGFloat) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                vista.padding(.horizontal, Theme.Spacing.xl)
            }
                .frame(width: Self.ancho, height: alto)
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
