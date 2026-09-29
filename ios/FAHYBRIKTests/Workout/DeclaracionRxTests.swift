import XCTest
@testable import FAHYBRIK

// RX / ESCALADO SE DECLARA AL TERMINAR (DECISIONS 2026-09-28): el vivo nuevo no
// lo pinta, así que el resumen lo pregunta por bloque puntuado y lo manda en el
// MISMO campo que el conmutador viejo (`rx_scaled` / `scaled_note` del tramo).
final class DeclaracionRxTests: XCTestCase {

    private func rx(_ scheme: PrescriptionScheme, _ modality: PrescriptionModality?) -> Prescription {
        Prescription(scheme: scheme, modality: modality,
                     sets: [PrescriptionSet(measure: .reps(10), target: nil, modality: nil, restS: nil, tempo: nil, note: nil)],
                     rounds: nil, workS: nil, restS: nil, totalS: 600, target: nil, note: nil, start: nil, increment: nil)
    }

    private func seg(_ titulo: String, bloque: String, pos: Int, _ scheme: PrescriptionScheme,
                     _ kind: SegmentKind = .reps) -> WorkoutSegment {
        WorkoutSegment(order: pos, title: titulo, kind: kind, blockTitle: bloque, blockPosition: pos,
                       prescription: rx(scheme, .functional))
    }

    private func lap(_ s: WorkoutSegment, rx: String?, nota: String? = nil) -> LapRecord {
        var l = LapRecord(id: UUID(), segmentId: s.id, templateSegmentId: nil, position: s.order,
                          modality: "functional", startedAt: Date(), endedAt: Date(), durationSeconds: 60,
                          avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: [:], repsCompleted: nil,
                          distanceCoveredMeters: nil, avgPaceSecPer500m: nil, avgPaceSecPerKm: nil,
                          avgPowerWatts: nil, strokeRateSpm: nil, calories: nil, weightUsedKg: nil,
                          source: "live")
        l.rxScaled = rx
        l.scaledNote = nota
        return l
    }

    private func plan(_ segs: [WorkoutSegment]) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Sesión", format: .amrap, estimatedDurationSeconds: 3600,
                    blockContext: "", zoneTargets: [], equipment: [], segments: segs,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }

    // Calentamiento (aunque sea un AMRAP) · Fuerza · WOD AMRAP · Finisher For Time sin tramos.
    private lazy var calentamiento = seg("Movilidad", bloque: "Calentamiento", pos: 0, .amrap)
    private lazy var fuerza = seg("Sentadilla", bloque: "Fuerza", pos: 1, .sets, .strength)
    private lazy var wod = seg("Cindy", bloque: "WOD", pos: 2, .amrap)
    private lazy var finisher = seg("Burpees", bloque: "Finisher", pos: 3, .forTime)
    private lazy var todo = plan([calentamiento, fuerza, wod, finisher])

    func testSoloLosBloquesPuntuadosConTramosLlevanLaDeclaracion() {
        let laps = [lap(calentamiento, rx: nil), lap(fuerza, rx: nil), lap(wod, rx: "rx")]
        let bloques = DeclaracionesRx.bloques(plan: todo, laps: laps)
        XCTAssertEqual(bloques.map(\.titulo), ["WOD"],
                       "ni el calentamiento, ni la fuerza, ni un metcon sin tramos medidos")
        XCTAssertEqual(bloques.first?.segmentIds, [wod.id])
    }

    func testCadaMetconDelEntrenoTieneSuBloque() {
        let laps = [lap(wod, rx: "rx"), lap(finisher, rx: "rx")]
        XCTAssertEqual(DeclaracionesRx.bloques(plan: todo, laps: laps).map(\.titulo), ["WOD", "Finisher"])
    }

    func testLaSemillaEsLoQueSellaronLasVueltas() {
        let b = DeclaracionesRx.bloques(plan: todo, laps: [lap(wod, rx: "rx")])[0]
        XCTAssertEqual(DeclaracionesRx.semilla(b, laps: [lap(wod, rx: "rx")]), DeclaracionRx(nivel: .rx, nota: ""),
                       "el vivo nuevo no lo pregunta: el motor sella «rx» y el resumen parte de ahí")
        XCTAssertEqual(DeclaracionesRx.semilla(b, laps: [lap(wod, rx: "scaled", nota: "banda")]),
                       DeclaracionRx(nivel: .scaled, nota: "banda"),
                       "lo marcado en la vista vieja se respeta")
    }

    func testLoDeclaradoViajaEnElCampoDelTramo() {
        let laps = [lap(fuerza, rx: nil), lap(wod, rx: "rx"), lap(finisher, rx: "rx")]
        let bloques = DeclaracionesRx.bloques(plan: todo, laps: laps)
        let wodId = bloques.first { $0.titulo == "WOD" }!.id
        let declaradas = [wodId: DeclaracionRx(nivel: .scaled, nota: "  dominadas con banda \n")]
        let overlay = ManualSegmentOverlay(avgHR: nil, maxHR: nil, paceSecondsBySegment: [:],
                                           rxPorSegmento: DeclaracionesRx.porSegmento(bloques, declaradas))
        let dtos = SegmentPayloadBuilder.build(laps: laps, overlay: overlay, iso: ISO8601DateFormatter())
        XCTAssertEqual(dtos.map(\.rx_scaled), [nil, "scaled", "rx"],
                       "el WOD declarado escalado; el finisher sin tocar sigue con lo que selló el motor; la fuerza, sin eje")
        XCTAssertEqual(dtos.map(\.scaled_note), [nil, "dominadas con banda", nil])
    }

    func testRxNoLlevaNotaAunqueSeHayaEscrito() {
        var d = DeclaracionRx(nivel: .scaled, nota: "kettlebell de 16")
        XCTAssertEqual(d.notaParaEnviar, "kettlebell de 16")
        d.nivel = .rx
        XCTAssertNil(d.notaParaEnviar, "vuelto a RX, la nota de cómo se escaló no viaja")
        XCTAssertNil(DeclaracionRx(nivel: .scaled, nota: "   ").notaParaEnviar)
    }

    func testDeclararRxPisaUnEscaladoViejo() {
        let laps = [lap(wod, rx: "scaled", nota: "banda")]
        let bloques = DeclaracionesRx.bloques(plan: todo, laps: laps)
        let overlay = ManualSegmentOverlay(avgHR: nil, maxHR: nil, paceSecondsBySegment: [:],
                                           rxPorSegmento: DeclaracionesRx.porSegmento(bloques, [bloques[0].id: DeclaracionRx(nivel: .rx)]))
        let dto = SegmentPayloadBuilder.build(laps: laps, overlay: overlay, iso: ISO8601DateFormatter())[0]
        XCTAssertEqual(dto.rx_scaled, "rx")
        XCTAssertNil(dto.scaled_note)
    }
}
