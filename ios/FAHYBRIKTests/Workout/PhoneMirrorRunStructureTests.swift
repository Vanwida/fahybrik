import XCTest
@testable import FAHYBRIK

// #68 mirror — the phone→watch frame builder must READ RUN STRUCTURE off the leg
// cursor, never the frozen folded-block accessors. Verified on the PHONE side because
// there is no watch test target: progressText counts TRAMOS (not the rotating machine,
// stuck at RONDA 1), the countdown is the tramo's own (pre-roll → the 3-2-1, a TIME
// leg → its remaining, a DISTANCE leg → none), and a leg change flips the structural
// key so a fresh frame is resent the instant the tramo advances.
//
// @MainActor because PhoneMirrorService is main-actor-isolated (the mirror runs on
// the phone's main actor); the engine it reads is not, so the calls are legal here.
@MainActor
final class PhoneMirrorRunStructureTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    // MARK: - Structure builders (mirror StructuredRunEngineTests)

    private func work(_ m: RunSegmentMeasure, _ t: RunSegmentTarget? = nil) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: t, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    private func structuredSession(_ structure: RunStructure) -> WorkoutSession {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: structure)
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start()        // arms the block gate
        s.beginBlock()   // clears the gate → startRunStructure (count-in, leg 0 primed)
        s.stop()         // kill the timer; the leg-cursor state is preserved
        return s
    }

    // MARK: - Pre-roll → count-in phase + count-in countdown (NOT a count-up)

    func testPreRollFrameIsCountInPhaseWithCountInCountdown() {
        let s = structuredSession([main([work(.duration(s: 120)), rec(.duration(s: 60), .parado)])])
        XCTAssertTrue(s.isRunCountIn)
        let f = mirror.buildFrame(from: s)
        XCTAssertEqual(f.phase, MirrorWire.Phase.countIn)
        XCTAssertEqual(f.progressText, "TRAMO 1/2")
        // The pre-roll shows the 3-2-1, never the leg's remaining and never a count-up
        // of a lapElapsed that accrued during the pre-roll (the ~3s offset bug).
        XCTAssertEqual(f.countdownRemaining, s.runCountInRemaining)
        XCTAssertNotNil(f.countdownRemaining)
    }

    // MARK: - TIME tramo → countdown = the leg's remaining, phase active

    func testTimeLegFrameCountsDownTheLegRemaining() {
        let s = structuredSession([main([work(.duration(s: 120)), rec(.duration(s: 60), .parado)])])
        s.primaryAdvance()                       // skip the 3-2-1 → leg 0 (TIME work)
        XCTAssertFalse(s.isRunCountIn)
        let f = mirror.buildFrame(from: s)
        XCTAssertEqual(f.phase, MirrorWire.Phase.active)
        XCTAssertEqual(f.progressText, "TRAMO 1/2")
        XCTAssertEqual(f.countdownRemaining, s.runLegRemaining)
        XCTAssertEqual(f.countdownRemaining, 120)                 // primed to the leg's duration
        XCTAssertEqual(f.lineTitle, "2:00")                       // the measure, not "Series"
    }

    // MARK: - DISTANCE tramo → no countdown (the wrist hero shows elapsed/measure)

    func testDistanceLegFrameHasNoCountdown() {
        let s = structuredSession([main([work(.distance(m: 800)), work(.distance(m: 600))])])
        s.primaryAdvance()                       // skip the 3-2-1 → leg 0 (DISTANCE work)
        let f = mirror.buildFrame(from: s)
        XCTAssertNil(f.countdownRemaining)        // distance → no fabricated countdown
        XCTAssertEqual(f.progressText, "TRAMO 1/2")
        XCTAssertEqual(f.lineTitle, "800 m")
    }

    // MARK: - Recovery tramo → "Recupera <modo>" + its measure, timed countdown

    func testRecoveryLegReadsRecuperaWithMode() {
        let s = structuredSession([main([work(.distance(m: 800)), rec(.duration(s: 60), .caminar)])])
        s.primaryAdvance()                       // skip the 3-2-1 → leg 0 (distance work)
        s.primaryAdvance()                       // manual "tramo hecho" → recovery leg 1
        XCTAssertFalse(s.isRunLegWork)
        let f = mirror.buildFrame(from: s)
        XCTAssertEqual(f.lineTitle, "Recupera caminando")
        XCTAssertEqual(f.detailLine, "1:00")                      // the recovery's measure
        XCTAssertEqual(f.progressText, "TRAMO 2/2")
        XCTAssertEqual(f.countdownRemaining, s.runLegRemaining)   // timed recovery counts down
    }

    // MARK: - Leg change flips the structural key (fresh frame resent at once)

    func testTramoChangeChangesStructuralKey() {
        let s = structuredSession([main([work(.distance(m: 800)), work(.distance(m: 600))])])
        s.primaryAdvance()                       // skip the 3-2-1 → leg 0
        let key0 = mirror.structuralKey(mirror.buildFrame(from: s))
        s.primaryAdvance()                       // manual "tramo hecho" → leg 1
        let key1 = mirror.structuralKey(mirror.buildFrame(from: s))
        XCTAssertNotEqual(key0, key1)            // "TRAMO 1/2 · 800 m" ≠ "TRAMO 2/2 · 600 m"
    }

    // MARK: - Treadmill belt ring — a continuous distance run sends covered/target/pace

    private func continuousRunSession(targetM: Double) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "5 km", kind: .running,
                                 targetDistanceMeters: targetM, blockTitle: "Carrera", blockPosition: 1)
        return WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 1800,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
    }

    func testTreadmillContinuousRunSendsBeltRing() {
        let s = continuousRunSession(targetM: 5000)
        s.lapElapsedSeconds = 300
        s.sampleTreadmillDistance(deltaMeters: 1200)     // belt covered 1.2 km

        mirror.isTreadmillLive = { true }
        defer { mirror.isTreadmillLive = { DeviceHub.shared.treadmillLink.isLive } }

        let f = mirror.buildFrame(from: s)
        XCTAssertEqual(f.beltDistanceM ?? 0, 1200, accuracy: 0.001)   // fills the wrist ring
        XCTAssertEqual(f.beltTargetM, 5000)
        XCTAssertNotNil(f.beltPaceSecPerKm)                          // honest covered average
        XCTAssertNil(f.countdownRemaining)                          // distance leg → still no fake clock
    }

    func testTreadmillBeltRingAbsentWhenBeltNotLive() {
        let s = continuousRunSession(targetM: 5000)
        s.sampleTreadmillDistance(deltaMeters: 1200)
        mirror.isTreadmillLive = { false }
        defer { mirror.isTreadmillLive = { DeviceHub.shared.treadmillLink.isLive } }
        let f = mirror.buildFrame(from: s)
        XCTAssertNil(f.beltDistanceM)                    // no belt live → no ring, no divergence
    }

    func testTreadmillFoldedSeriesDoesNotSendBeltRing() {
        // A folded interval SERIES: `targetDistanceMeters` is PER-BOUT (400) while the
        // belt accumulator spans ALL bouts of the segment — a ring would overflow, so
        // the gate excludes it (per-leg covered isn't in the engine). It keeps its
        // per-bout lines instead. Locks the gate against the isRunStructureActive-only
        // check that would have let a series through.
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 4,
                              workS: nil, restS: 60, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "4×400", kind: .running,
                                 targetDistanceMeters: 400, blockTitle: "Series",
                                 blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.sampleTreadmillDistance(deltaMeters: 300)
        mirror.isTreadmillLive = { true }
        defer { mirror.isTreadmillLive = { DeviceHub.shared.treadmillLink.isLive } }
        let f = mirror.buildFrame(from: s)
        XCTAssertNil(f.beltDistanceM)                    // series → no ring
    }

    // MARK: - Regla viva: the treadmill tramo surfaces via the SHARED live descriptor
    // (the same liveProgressText / liveBlockName the dobles-live heartbeat reads, so a
    // partner's live strip shows the run's block + tramo exactly as the wrist does).
    func testStructuredRunTramoSurfacesInSharedLiveDescriptor() {
        let s = structuredSession([main([work(.distance(m: 800)), work(.distance(m: 600))])])
        s.primaryAdvance()                       // → leg 0
        XCTAssertEqual(s.liveProgressText, "TRAMO 1/2")
        XCTAssertEqual(s.liveBlockName, "Series")
    }
}
