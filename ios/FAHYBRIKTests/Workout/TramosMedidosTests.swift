import XCTest
@testable import FAHYBRIK

// AL ACABAR UNA SERIE SE VEN LAS SERIES.
//
// El resumen post-entreno pintaba su tabla solo si `plan.segments.count > 1`, y una
// carrera estructurada es UN segmento con N tramos dentro: quien acababa un 6×800 no
// veía ninguno de los seis.
//
// Estas pruebas fijan las dos mitades: que la tabla se abre por tramos leyendo lo que
// la app GUARDA HOY (un lap por tramo fuerte, las recuperaciones sin lap), y que lo
// que no hay se declara en vez de rellenarse.

final class TramosMedidosTests: XCTestCase {

    // MARK: - Constructores

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: .trote))
    }

    /// Un 6×800 con 2:00 de trote entre series: 6 fuertes + 5 recuperaciones = 11 tramos.
    private func seisPorOchocientos() -> WorkoutSegment {
        let cuerpo: [RunElement] = [work(.distance(m: 800)), rec(.duration(s: 120))]
        var elementos: [RunElement] = []
        for i in 0..<6 { elementos += (i == 5 ? [cuerpo[0]] : cuerpo) }
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: elementos)])
        return WorkoutSegment(order: 1, title: "6×800", kind: .running,
                              blockTitle: "Principal", blockPosition: 1, prescription: rx)
    }

    private func lapDeTramo(_ seg: WorkoutSegment, ordinal: Int,
                            segundos: Double, metros: Double?, ritmo: Double?) -> LapRecord {
        LapRecord(id: UUID(), segmentId: seg.id, templateSegmentId: nil, position: seg.order,
                  modality: "run", startedAt: Date(), endedAt: Date(),
                  durationSeconds: segundos, avgHRBpm: nil, maxHRBpm: nil,
                  zoneSecondsByZone: [:], repsCompleted: nil, distanceCoveredMeters: metros,
                  avgPaceSecPer500m: nil, avgPaceSecPerKm: ritmo, avgPowerWatts: nil,
                  strokeRateSpm: nil, calories: nil, weightUsedKg: nil, source: "gps",
                  runLegIndex: ordinal)
    }

    private func lapAgregado(_ seg: WorkoutSegment, segundos: Double) -> LapRecord {
        LapRecord(id: UUID(), segmentId: seg.id, templateSegmentId: nil, position: seg.order,
                  modality: "run", startedAt: Date(), endedAt: Date(),
                  durationSeconds: segundos, avgHRBpm: nil, maxHRBpm: nil,
                  zoneSecondsByZone: [:], repsCompleted: nil, distanceCoveredMeters: 4800,
                  avgPaceSecPer500m: nil, avgPaceSecPerKm: nil, avgPowerWatts: nil,
                  strokeRateSpm: nil, calories: nil, weightUsedKg: nil, source: "gps")
    }

    // MARK: - Lo que la app guarda HOY: seis laps, once tramos en el plan

    func testUn6x800SeAbreEnSusSeisTramos() {
        let seg = seisPorOchocientos()
        XCTAssertEqual(seg.runStructureLegs?.count, 11, "6 fuertes + 5 recuperaciones")

        let laps = (0..<6).map {
            lapDeTramo(seg, ordinal: $0, segundos: 192 + Double($0), metros: 805, ritmo: 240)
        }
        let l = TramosMedidos.lee(segmento: seg, laps: laps)

        XCTAssertEqual(l.filas.count, 6, "los seis tramos, no uno")
        XCTAssertEqual(l.filas.map(\.titulo), (1...6).map { "Tramo \($0)" })
        XCTAssertEqual(l.fuertesPrevistos, 6)
        XCTAssertEqual(l.fuertesMedidos, 6)
        XCTAssertNil(l.cobertura, "medidos todos: el conteo no añade nada")
        XCTAssertFalse(l.sinTiemposPorTramo)

        // El dato de la fila sale del LAP, no del plan.
        XCTAssertEqual(l.filas[0].tiempo, "3:12")
        XCTAssertEqual(l.filas[0].medida, "4:00/km")
    }

    func testSinRitmoMedidoLaFilaCaeALaDistanciaCubiertaYNuncaAUnGuion() {
        let seg = seisPorOchocientos()
        let conDistancia = lapDeTramo(seg, ordinal: 0, segundos: 190, metros: 812, ritmo: nil)
        let pelado = lapDeTramo(seg, ordinal: 1, segundos: 191, metros: nil, ritmo: nil)
        let l = TramosMedidos.lee(segmento: seg, laps: [conDistancia, pelado])
        XCTAssertEqual(l.filas[0].medida, "812 m")
        XCTAssertNil(l.filas[1].medida, "sin ritmo ni distancia la fila se queda con su tiempo")
    }

    // MARK: - Lo que falta se DECLARA, no se rellena

    func testSerieAMediasDeclaraCuantosTramosSeMidieron() {
        let seg = seisPorOchocientos()
        let laps = (0..<4).map {
            lapDeTramo(seg, ordinal: $0, segundos: 195, metros: 800, ritmo: 244)
        }
        let l = TramosMedidos.lee(segmento: seg, laps: laps)
        XCTAssertEqual(l.filas.count, 4)
        XCTAssertEqual(l.cobertura, "4 de 6")
        // No se inventan dos filas vacías para «completar» la serie.
        XCTAssertEqual(l.filas.map(\.titulo), ["Tramo 1", "Tramo 2", "Tramo 3", "Tramo 4"])
    }

    func testUnLapAgregadoNOEsUnTramoYSeDeclaraQueFaltanLosTiempos() {
        // El caso del reloj: la serie llega colapsada en un solo lap sin ordinal.
        let seg = seisPorOchocientos()
        let l = TramosMedidos.lee(segmento: seg, laps: [lapAgregado(seg, segundos: 1980)])
        XCTAssertTrue(l.filas.isEmpty,
                      "meterlo como tramo diría que corriste 800 m en treinta y tres minutos")
        XCTAssertTrue(l.sinTiemposPorTramo, "el atleta hizo seis: hay que decirlo")
        XCTAssertNil(l.cobertura, "«0 de 6» sería declarar el mismo hueco dos veces")
    }

    // MARK: - Cuando se graben también las recuperaciones

    func testConTodosLosTramosGrabadosLasRecuperacionesSeNombranComoTales() {
        let seg = seisPorOchocientos()
        let laps = (0..<11).map {
            lapDeTramo(seg, ordinal: $0, segundos: 120, metros: nil, ritmo: nil)
        }
        let l = TramosMedidos.lee(segmento: seg, laps: laps)
        XCTAssertEqual(l.filas.count, 11)
        XCTAssertEqual(l.filas.map(\.titulo).prefix(4),
                       ["Tramo 1", "Recuperación", "Tramo 2", "Recuperación"])
        XCTAssertEqual(l.fuertesMedidos, 6)
        XCTAssertNil(l.cobertura)
    }

    // MARK: - La puerta: se pregunta por FILAS, no por bloques

    func testLaTablaSePintaConUnSoloBloqueSiTieneTramosDentro() {
        let seg = seisPorOchocientos()
        let laps = (0..<6).map {
            lapDeTramo(seg, ordinal: $0, segundos: 192, metros: 800, ritmo: 240)
        }
        // La pregunta vieja (`segments.count > 1`) decía que no con estos mismos datos.
        XCTAssertEqual([seg].count, 1, "un solo bloque")
        XCTAssertTrue(TablaDeTramos.hayQuePintarla(segmentos: [seg], laps: laps))
    }

    func testUnBloqueSueltoSinTramosNoAbreTablaDeUnaFila() {
        let seg = WorkoutSegment(order: 1, title: "Rodaje 40'", kind: .running,
                                 targetDurationSeconds: 2400,
                                 blockTitle: "Principal", blockPosition: 1)
        XCTAssertFalse(seg.hasRunStructure)
        XCTAssertFalse(
            TablaDeTramos.hayQuePintarla(segmentos: [seg], laps: [lapAgregado(seg, segundos: 2400)]),
            "una sola fila repetiría el reloj de la cabecera"
        )
    }

    func testUnaSerieColapsadaAbreLaTablaSoloParaDeclararlo() {
        let seg = seisPorOchocientos()
        XCTAssertTrue(
            TablaDeTramos.hayQuePintarla(segmentos: [seg], laps: [lapAgregado(seg, segundos: 1980)]),
            "una fila, pero hay algo que decir"
        )
    }
}
