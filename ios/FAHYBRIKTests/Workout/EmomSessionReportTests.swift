import XCTest
@testable import FAHYBRIK

// EMOM multi-station report: per-minute laps surface as table rows with erg
// measure, and session totals roll up by machine.
final class EmomSessionReportTests: XCTestCase {

    private func lap(mod: String, idx: Int, dur: Double,
                     meters: Double? = nil, cal: Double? = nil,
                     pace500: Double? = nil, power: Double? = nil,
                     segId: UUID = UUID()) -> LapRecord {
        LapRecord(
            id: UUID(), segmentId: segId, templateSegmentId: nil, position: 1,
            modality: mod,
            startedAt: Date(), endedAt: Date().addingTimeInterval(dur),
            durationSeconds: dur, avgHRBpm: 140, maxHRBpm: 160,
            zoneSecondsByZone: [:], repsCompleted: nil,
            distanceCoveredMeters: meters, avgPaceSecPer500m: pace500,
            avgPaceSecPerKm: nil, avgPowerWatts: power, strokeRateSpm: 28,
            calories: cal, weightUsedKg: nil, source: "pm5",
            runLegIndex: idx, runLegRole: "work", runLegPhase: "main"
        )
    }

    func testTotalesWeightedPaceAndCalories() {
        let sid = UUID()
        let laps = [
            lap(mod: "row", idx: 0, dur: 60, meters: 250, cal: 12, pace500: 120, power: 200, segId: sid),
            lap(mod: "ski", idx: 1, dur: 60, meters: 200, cal: 10, pace500: 130, power: 180, segId: sid),
            lap(mod: "row", idx: 2, dur: 60, meters: 250, cal: 12, pace500: 118, power: 210, segId: sid),
        ]
        let t = ResumenSesionCard.totales(from: laps, elapsed: 180)
        XCTAssertEqual(t.calories ?? 0, 34, accuracy: 0.1)
        XCTAssertEqual(t.distanceM ?? 0, 700, accuracy: 0.1)
        XCTAssertNotNil(t.avgPace500)
        XCTAssertNotNil(t.avgPower)
        let machines = ResumenSesionCard.porMaquina(from: laps)
        XCTAssertEqual(machines.map(\.id), ["row", "ski"])
        XCTAssertTrue(machines[0].detail?.contains("cal") == true)
    }

    func testTramosMedidosEmomTitlesFromPlan() {
        let sid = UUID()
        let sets = [
            PrescriptionSet(measure: .calories(10), target: nil, modality: .row,
                            restS: nil, tempo: nil, note: "Remo"),
            PrescriptionSet(measure: .calories(10), target: nil, modality: .ski,
                            restS: nil, tempo: nil, note: "Ski"),
        ]
        let presc = Prescription(scheme: .emom, modality: .functional, sets: sets,
                                 rounds: 4, workS: 60, restS: nil, totalS: nil,
                                 target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "EMOM", kind: .reps,
                                 blockTitle: "Principal", blockPosition: 1,
                                 prescription: presc)
        // Force same segment id as laps
        // WorkoutSegment generates its own id — use that from seg
        let laps = [
            lap(mod: "row", idx: 0, dur: 55, cal: 10, pace500: 120, segId: seg.id),
            lap(mod: "ski", idx: 1, dur: 58, cal: 10, pace500: 128, segId: seg.id),
            lap(mod: "row", idx: 2, dur: 54, cal: 11, pace500: 118, segId: seg.id),
            lap(mod: "ski", idx: 3, dur: 59, cal: 10, pace500: 130, segId: seg.id),
        ]
        let lectura = TramosMedidos.lee(segmento: seg, laps: laps)
        XCTAssertEqual(lectura.filas.count, 4)
        XCTAssertTrue(lectura.filas[0].titulo.contains("Remo"))
        XCTAssertTrue(lectura.filas[1].titulo.contains("Ski"))
        XCTAssertNotNil(lectura.filas[0].medida) // pace or cal
        XCTAssertTrue(TablaDeTramos.hayQuePintarla(segmentos: [seg], laps: laps))
    }
}
