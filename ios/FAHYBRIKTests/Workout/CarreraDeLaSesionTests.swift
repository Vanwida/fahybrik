import XCTest
@testable import FAHYBRIK

// LA CARRERA QUE HAY DENTRO DE UNA SESIÓN — lo que se lee de los laps antes de
// que nadie decida quién es el sujeto.
//
// `FormaDeCarreraTests` defiende la LEY; esto defiende la LECTURA: qué lap es un
// tramo, cuál fue fuerte y cuál trote, cuánto duró la carrera y cuándo no hay
// carrera que leer. Es donde se cazan los fallos que no dan error — un
// calentamiento contado como serie no rompe nada, sólo miente.

final class CarreraDeLaSesionTests: XCTestCase {

    // MARK: - Constructores

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }

    private func trote(_ s: Int) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: .duration(s: s), target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: .trote))
    }

    private func tramoDeCorrer(_ fases: [RunPhase], titulo: String) -> WorkoutSegment {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil, structure: fases)
        return WorkoutSegment(order: 1, title: titulo, kind: .running,
                              blockTitle: "Principal", blockPosition: 1, prescription: rx)
    }

    private func sesion(_ tramo: WorkoutSegment) -> WorkoutSession {
        let plan = WorkoutPlan(id: UUID(), name: tramo.title, format: .intervals,
                               estimatedDurationSeconds: 0, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()      // salta la cuenta atrás 3-2-1
        return s
    }

    /// Cierra el tramo en curso con lo que se ha corrido en él.
    private func corre(_ s: WorkoutSession, segundos: Double, metros: Double) {
        s.sampleRunDistance(deltaMeters: metros, source: .healthkit)
        s.lapElapsedSeconds += segundos
        s.elapsedSeconds += segundos
        s.primaryAdvance()
    }

    // MARK: - Fuerte no es «lo que la gramática llama work»

    func testUnCalentamientoTrotandoNoCuentaComoSerie() throws {
        // EL FALLO QUE ESTE TEST HACE IMPOSIBLE: en la gramática de carrera un
        // calentamiento es literalmente `kind: work`. Contándolo por el rol, un 4×1000
        // se lee como un 5×1000 cuya primera «serie» dura diez minutos — el ritmo de
        // lo fuerte se va al garete y el aguante juzga una serie que nadie corrió.
        let tramo = tramoDeCorrer([
            RunPhase(role: .warmup, elements: [work(.duration(s: 600))]),
            RunPhase(role: .main, elements: (0..<4).map { _ in work(.distance(m: 1000)) }),
        ], titulo: "4×1000")
        let s = sesion(tramo)
        corre(s, segundos: 600, metros: 1_800)                    // trote de 5:33/km
        for i in 0..<4 { corre(s, segundos: 238 + Double(i) * 3, metros: 1_000) }

        let carrera = try XCTUnwrap(CarreraDeLaSesion.carrera(laps: s.laps,
                                                             segmentos: s.plan.segments))
        let l = FormaDeCarrera.lectura(de: carrera)
        XCTAssertEqual(l.fuerte?.n, 4, "las series son cuatro: el calentamiento no es una")
        XCTAssertEqual(l.suave?.n, 1, "el calentamiento ES lo suave, que es lo que fue")
        XCTAssertEqual(l.fuerte!.ritmoSkm, 242, accuracy: 3,
                       "el ritmo de lo fuerte no se contamina con el trote")
        XCTAssertEqual(l.forma, .conContraste)
    }

    // MARK: - Cuándo NO hay carrera que leer

    func testSinLapsDeCorrerNoHayCarrera() {
        let fuerza = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength,
                                    blockTitle: "Fuerza", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                               estimatedDurationSeconds: 0, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: [fuerza],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        XCTAssertNil(CarreraDeLaSesion.carrera(laps: s.laps, segmentos: s.plan.segments))
    }

    func testCorrerSinQueNadaMidaLaDistanciaNoTieneSujetoQueEnsenar() throws {
        // Cinta sin cable, calle sin señal: se corrió, pero sin metros no hay ritmo
        // ni kilómetros que enseñar. La lectura de carrera no tiene sujeto, así que
        // manda el resumen genérico — que sí sabe hablar de tiempo y pulso.
        let tramo = tramoDeCorrer([RunPhase(role: .main, elements: [work(.duration(s: 1_800))])],
                                  titulo: "Rodaje")
        let s = sesion(tramo)
        s.lapElapsedSeconds += 1_800
        s.elapsedSeconds += 1_800
        s.primaryAdvance()

        XCTAssertFalse(s.laps.filter { $0.modality == "run" }.isEmpty, "sí hubo laps de correr")
        XCTAssertNil(CarreraDeLaSesion.carrera(laps: s.laps, segmentos: s.plan.segments))
    }

    // MARK: - Lo que el coach mandó

    func testUnRodajeContinuoNoAcusaALaMediaDeNada() throws {
        // La otra mitad de la ventaja: si el coach NO mandó contraste, la media no
        // se acusa de mezclar nada. Decirlo sería inventar un formato.
        let tramo = tramoDeCorrer([RunPhase(role: .main, elements: [work(.duration(s: 1_800))])],
                                  titulo: "Rodaje Z2")
        let s = sesion(tramo)
        corre(s, segundos: 1_800, metros: 6_000)

        let carrera = try XCTUnwrap(CarreraDeLaSesion.carrera(laps: s.laps,
                                                             segmentos: s.plan.segments))
        XCTAssertEqual(carrera.formaPrescrita, .continua)
        XCTAssertFalse(FormaDeCarrera.lectura(de: carrera).mediaEsMezcla)
    }

    func testUnaSerieConTroteEsContrastePrescrito() throws {
        let tramo = tramoDeCorrer([
            RunPhase(role: .main, elements: [work(.distance(m: 1_000)), trote(120),
                                             work(.distance(m: 1_000))]),
        ], titulo: "2×1000")
        let s = sesion(tramo)
        XCTAssertEqual(
            CarreraDeLaSesion.carrera(
                laps: [LapRecord(id: UUID(), segmentId: tramo.id, templateSegmentId: nil,
                                 position: 1, modality: "run",
                                 startedAt: Date(), endedAt: Date(), durationSeconds: 240,
                                 avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: [:],
                                 repsCompleted: nil, distanceCoveredMeters: 1_000,
                                 avgPaceSecPer500m: nil, avgPaceSecPerKm: 240,
                                 avgPowerWatts: nil, strokeRateSpm: nil, calories: nil,
                                 weightUsedKg: nil, source: "gps")],
                segmentos: s.plan.segments
            )?.formaPrescrita,
            .conContraste
        )
    }
}
