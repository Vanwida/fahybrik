import XCTest
@testable import FAHYBRIK

// EL MOTOR DE LOS BLOQUES — saltar / guardar / reiniciar / ir.
//
// La hoja (`BloquesDelEntreno`) ya compilaba; el presentador se había caído.
// Estas pruebas fijan lo que el atleta pide desde esa hoja, contra una sesión
// de dos bloques (calentamiento + fuerza), el mismo andamio que
// `EntrenoSinMiedoTests`. No tocan `jumpTo`.

final class WorkoutSessionBloquesTests: XCTestCase {

    func testSaltarNoCreaLapYAparcaEnLaPuertaDelSiguiente() {
        let s = sesionDosBloques()
        s.start()
        s.beginBlock()
        let lapsAntes = s.laps.count
        s.saltarBloque()
        XCTAssertEqual(s.laps.count, lapsAntes, "lo saltado no puede parecer hecho")
        XCTAssertEqual(s.currentSegmentIndex, 1)
        XCTAssertTrue(s.isAwaitingBlockStart, "saltar aparca en la puerta, reloj parado")
        s.stop()
    }

    func testGuardarCierraElBloqueYAparcaEnLaPuertaDelSiguiente() {
        let s = sesionDosBloques()
        s.start()
        s.beginBlock()
        s.lapElapsedSeconds = 30
        s.guardarBloqueYSeguir()
        XCTAssertEqual(s.currentSegmentIndex, 1)
        XCTAssertTrue(s.isAwaitingBlockStart, "guardar es endBlockEarly: puerta del siguiente")
        XCTAssertFalse(s.isFinished)
        s.stop()
    }

    func testReiniciarBorraSoloLasVueltasDeEseBloque() {
        let s = sesionDosBloques()
        s.start()
        s.beginBlock()
        let propio = s.plan.segments[0].id
        let delOtro = s.plan.segments[1].id
        s.laps = [lap(segmentId: propio), lap(segmentId: delOtro)]
        s.reiniciarBloque()
        XCTAssertFalse(s.laps.contains { $0.segmentId == propio },
                       "reiniciar descarta las vueltas del bloque actual")
        XCTAssertTrue(s.laps.contains { $0.segmentId == delOtro },
                      "las vueltas de otro bloque no se tocan")
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertTrue(s.isAwaitingBlockStart)
        s.stop()
    }

    func testIrAOtroBloqueAparcaEnSuPuerta() {
        let s = sesionDosBloques()
        s.start()
        s.beginBlock()
        let destino = s.bloques[1]
        s.irAlBloque(destino)
        XCTAssertEqual(s.currentSegmentIndex, destino.firstIndex)
        XCTAssertTrue(s.isAwaitingBlockStart, "irAlBloque no es jumpTo: deja la puerta")
        XCTAssertEqual(s.laps.count, 0, "ir no cierra la vuelta que dejas")
        s.stop()
    }

    func testSaltarElUltimoCierraElTrabajoPrescrito() {
        let s = sesionDosBloques()
        s.start()
        s.irAlBloque(s.bloques[1])
        XCTAssertEqual(s.currentSegmentIndex, 1)
        s.saltarBloque()
        XCTAssertTrue(s.isAwaitingFinishDecision,
                      "sin bloque detrás, saltar pregunta el final — no deja tierra de nadie")
        XCTAssertFalse(s.isFinished)
        s.stop()
    }

    // MARK: - Andamio

    /// Calentamiento + fuerza. Dos `blockPosition` → dos `blockRegions`.
    private func sesionDosBloques() -> WorkoutSession {
        let wu = WorkoutSegment(order: 1, title: "Movilidad", kind: .reps,
                                blockTitle: "Calentamiento", blockPosition: 1)
        let series = (0..<3).map { _ in
            PrescriptionSet(measure: .reps(5), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nil)
        }
        let fuerza = WorkoutSegment(
            order: 2, title: "Peso muerto", kind: .strength, targetReps: 5,
            blockTitle: "Fuerza", blockPosition: 2,
            prescription: Prescription(scheme: .sets, modality: nil, sets: series,
                                       rounds: nil, workS: nil, restS: nil, totalS: nil,
                                       target: nil, note: nil, start: nil, increment: nil))
        let plan = WorkoutPlan(id: UUID(), name: "Calentamiento + fuerza", format: .sets,
                               estimatedDurationSeconds: 2400, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: [wu, fuerza],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan)
    }

    private func lap(segmentId: UUID) -> LapRecord {
        LapRecord(
            id: UUID(), segmentId: segmentId, templateSegmentId: nil, position: 1,
            modality: "strength", startedAt: Date(), endedAt: Date(),
            durationSeconds: 40, avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: [:],
            repsCompleted: 5, distanceCoveredMeters: nil, avgPaceSecPer500m: nil,
            avgPaceSecPerKm: nil, avgPowerWatts: nil, strokeRateSpm: nil, calories: nil,
            weightUsedKg: nil, source: "manual"
        )
    }
}
