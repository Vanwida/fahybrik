import XCTest
@testable import FAHYBRIK

// EL KILÓMETRO SE DETECTA DONDE ENTRAN LOS METROS.
//
// Antes lo detectaba el cerebro del audio, empujado por los dos modelos de HUD —
// calle y cinta — cada uno con su timer de medio segundo. De ahí venían los dos
// fallos que estos tests clavan:
//
//   · el suceso NO SALÍA de la voz, así que no podía llegar a la vuelta que Apple
//     guarda en el HKWorkout ni a ningún resumen;
//   · el cursor lo reiniciaba SÓLO la cinta al abrir tramo, así que un rodaje de
//     calle arrastraba los metros del tramo anterior y su «kilómetro 1» era mentira.
final class WorkoutSessionKmSplitTests: XCTestCase {

    /// Un rodaje continuo: un solo segmento de correr, el segmento ES el tramo.
    private func rodaje(targetM: Double = 10_000) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Largo Z2", kind: .running,
                                 targetDistanceMeters: targetM,
                                 blockTitle: "Carrera", blockPosition: 1)
        return WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Largo Z2", format: .steady, estimatedDurationSeconds: 3600,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
    }

    func testElMotorEmiteUnParcialPorKilometro() {
        let s = rodaje()
        var vistos: [RunKmSplit] = []
        s.onKmSplit = { vistos.append($0) }

        s.lapElapsedSeconds = 150
        s.sampleTreadmillDistance(deltaMeters: 500)
        XCTAssertTrue(vistos.isEmpty, "medio kilómetro no es un kilómetro")

        s.lapElapsedSeconds = 300
        s.sampleTreadmillDistance(deltaMeters: 500)          // 1.000 m
        XCTAssertEqual(vistos.count, 1)
        XCTAssertEqual(vistos.first?.km, 1)
        XCTAssertEqual(vistos.first?.splitSeconds ?? 0, 300, accuracy: 0.001)

        s.lapElapsedSeconds = 610
        s.sampleTreadmillDistance(deltaMeters: 1000)         // 2.000 m
        XCTAssertEqual(vistos.count, 2)
        XCTAssertEqual(vistos.last?.km, 2)
        // EL PARCIAL, no el acumulado: 310, no 610.
        XCTAssertEqual(vistos.last?.splitSeconds ?? 0, 310, accuracy: 0.001)
    }

    // Una carrera ESTRUCTURADA no anuncia kilómetros: el coach escribió 6×1000 y el
    // hito es la serie. Un «kilómetro 3» ahí no le dice nada a nadie.
    func testUnaSerieNoAnunciaKilometros() {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 4,
                              workS: nil, restS: 60, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "4×1000", kind: .running,
                                 targetDistanceMeters: 1000, blockTitle: "Series",
                                 blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Series", format: .intervals, estimatedDurationSeconds: 1800,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        var vistos: [RunKmSplit] = []
        s.onKmSplit = { vistos.append($0) }
        s.lapElapsedSeconds = 300
        s.sampleTreadmillDistance(deltaMeters: 1200)
        XCTAssertTrue(vistos.isEmpty)
    }

    // Sin nadie escuchando el motor sigue contando igual: el cursor es suyo, no de
    // la voz. Si el atleta apaga los avisos, el kilómetro no deja de existir.
    func testSinOyenteElMotorNoSeRompe() {
        let s = rodaje()
        s.lapElapsedSeconds = 300
        s.sampleTreadmillDistance(deltaMeters: 1000)
        XCTAssertEqual(s.lapBeltDistanceMeters, 1000)
    }
}
