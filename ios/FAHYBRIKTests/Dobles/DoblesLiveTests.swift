import XCTest
@testable import FAHYBRIK

// #56 — dobles en vivo: the PURE presence state machines + the heartbeat payload.
// The strip/banner rendering is a switch over these enums, and the payload is built
// from a simulated session, so every derivation is verified without any I/O. The
// live descriptor (block/progress) parity with the mirror frame is covered by
// PhoneMirrorRunStructureTests (buildFrame now reads WorkoutSession.liveProgressText).
final class DoblesLiveTests: XCTestCase {

    private func status(
        phase: String, ageS: Int, name: String = "Guillem",
        block: String? = nil, progress: String? = nil, elapsed: Int = 300,
        hr: Int? = 150, finalTime: Int? = nil, finalRpe: Double? = nil
    ) -> PartnerLiveStatus {
        PartnerLiveStatus(
            name: name, phase: phase, workoutTitle: "Metcon 20'",
            blockName: block, progressText: progress, elapsedS: elapsed,
            hrBpm: hr, finalTimeS: finalTime, finalRpe: finalRpe, ageS: ageS
        )
    }

    // MARK: - Strip state machine

    func testStripHiddenWhenNoPartner() {
        XCTAssertEqual(DoblesLiveStripState.from(nil), .hidden)
    }

    func testStripLiveWhenActiveAndFresh() {
        let s = DoblesLiveStripState.from(status(phase: "active", ageS: 3, block: "Metcon", progress: "RONDA 3/5"))
        XCTAssertEqual(s, .live(name: "Guillem", paused: false, blockName: "Metcon",
                                progress: "RONDA 3/5", elapsedS: 300, hrBpm: 150, ageS: 3))
    }

    func testStripPausedFlag() {
        if case .live(_, let paused, _, _, _, _, _) = DoblesLiveStripState.from(status(phase: "paused", ageS: 4)) {
            XCTAssertTrue(paused)
        } else { XCTFail("expected .live(paused)") }
    }

    func testStripStaleBoundary() {
        // ≤ 20 s is still live; > 20 s reads "sin señal".
        if case .live = DoblesLiveStripState.from(status(phase: "active", ageS: 20)) {} else { XCTFail("age 20 → live") }
        if case .stale(_, let age) = DoblesLiveStripState.from(status(phase: "active", ageS: 21)) {
            XCTAssertEqual(age, 21)
        } else { XCTFail("age 21 → stale") }
    }

    func testStripFinishedIgnoresAge() {
        // A finished row within the 6 h server window shows the result regardless of age.
        let s = DoblesLiveStripState.from(status(phase: "finished", ageS: 5000, finalTime: 2832, finalRpe: 8))
        XCTAssertEqual(s, .finished(name: "Guillem", finalTimeS: 2832, finalRpe: 8))
    }

    func testStripLeft() {
        XCTAssertEqual(DoblesLiveStripState.from(status(phase: "left", ageS: 2)), .left(name: "Guillem"))
    }

    func testStripUnknownPhaseHidden() {
        XCTAssertEqual(DoblesLiveStripState.from(status(phase: "warmup", ageS: 2)), .hidden)
    }

    // MARK: - Banner state machine

    func testBannerHiddenWhenNoPartner() {
        XCTAssertEqual(DoblesLiveBannerState.from(nil, hasOwnSessionToday: true), .hidden)
    }

    func testBannerVisibleWithCTAWhenOwnSession() {
        let b = DoblesLiveBannerState.from(status(phase: "active", ageS: 30, progress: "RONDA 3/5"),
                                           hasOwnSessionToday: true)
        XCTAssertEqual(b, .visible(name: "Guillem", subtitle: "Metcon 20' · RONDA 3/5", canJoin: true))
    }

    func testBannerVisibleWithoutCTAWhenNoOwnSession() {
        let b = DoblesLiveBannerState.from(status(phase: "active", ageS: 30), hasOwnSessionToday: false)
        XCTAssertEqual(b, .visible(name: "Guillem", subtitle: "Metcon 20'", canJoin: false))
    }

    func testBannerFreshBoundary() {
        // ≤ 60 s shows; > 60 s hides (a wider window than the strip's 20 s).
        if case .visible = DoblesLiveBannerState.from(status(phase: "active", ageS: 60), hasOwnSessionToday: true) {} else {
            XCTFail("age 60 → visible")
        }
        XCTAssertEqual(DoblesLiveBannerState.from(status(phase: "active", ageS: 61), hasOwnSessionToday: true), .hidden)
    }

    func testBannerHiddenForFinishedAndLeft() {
        XCTAssertEqual(DoblesLiveBannerState.from(status(phase: "finished", ageS: 5), hasOwnSessionToday: true), .hidden)
        XCTAssertEqual(DoblesLiveBannerState.from(status(phase: "left", ageS: 5), hasOwnSessionToday: true), .hidden)
    }

    // MARK: - Heartbeat payload

    private func session(_ segments: [WorkoutSegment], name: String = "Metcon 20'") -> WorkoutSession {
        WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: name, format: .amrap, estimatedDurationSeconds: 0,
            blockContext: "", zoneTargets: [], equipment: [], segments: segments,
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
    }

    func testPayloadActiveMapsCoreFields() {
        let s = session([WorkoutSegment(order: 1, title: "Thrusters", kind: .reps, targetReps: 40)])
        s.elapsedSeconds = 125.4
        s.liveHRBpm = 148
        let p = DoblesLivePresence.payload(session: s, assignmentId: 42, phase: .active)
        XCTAssertEqual(p.assignmentId, 42)
        XCTAssertEqual(p.phase, .active)
        XCTAssertEqual(p.workoutTitle, "Metcon 20'")
        XCTAssertEqual(p.elapsedS, 125)          // rounded
        XCTAssertEqual(p.hrBpm, 148)
        XCTAssertNil(p.finalTimeS)               // final_* never on a live beat
        XCTAssertNil(p.finalRpe)
    }

    func testPayloadDropsImplausibleHR() {
        let s = session([WorkoutSegment(order: 1, title: "Run", kind: .running)])
        s.liveHRBpm = 5                          // below the 20…250 band → omitted
        XCTAssertNil(DoblesLivePresence.payload(session: s, assignmentId: 1, phase: .active).hrBpm)
        s.liveHRBpm = nil
        XCTAssertNil(DoblesLivePresence.payload(session: s, assignmentId: 1, phase: .active).hrBpm)
    }

    func testPayloadFinishedCarriesFinalOnlyWhenFinished() {
        let s = session([WorkoutSegment(order: 1, title: "Run", kind: .running)])
        let finished = DoblesLivePresence.payload(session: s, assignmentId: 1, phase: .finished,
                                                  finalTimeS: 2832, finalRpe: 8)
        XCTAssertEqual(finished.finalTimeS, 2832)
        XCTAssertEqual(finished.finalRpe, 8)
        // The same final args on a non-finished beat are dropped.
        let active = DoblesLivePresence.payload(session: s, assignmentId: 1, phase: .active,
                                                finalTimeS: 2832, finalRpe: 8)
        XCTAssertNil(active.finalTimeS)
        XCTAssertNil(active.finalRpe)
    }

    func testPayloadReadsSharedDescriptorNotAParallelOne() {
        // block_name / progress_text come from the SAME accessors the mirror frame reads.
        let seg = WorkoutSegment(order: 1, title: "Thrusters", kind: .reps, targetReps: 40,
                                 blockTitle: "Principal", blockPosition: 1)
        let s = session([seg])
        let p = DoblesLivePresence.payload(session: s, assignmentId: 7, phase: .active)
        XCTAssertEqual(p.blockName, s.liveBlockName)
        XCTAssertEqual(p.progressText, s.liveProgressText)
    }

    func testPayloadEmptyTitleFallsBack() {
        let s = session([WorkoutSegment(order: 1, title: "X", kind: .reps)], name: "   ")
        XCTAssertEqual(DoblesLivePresence.payload(session: s, assignmentId: 1, phase: .active).workoutTitle, "Entreno")
    }

    // MARK: - Formatting

    func testClockAndAgoFormat() {
        XCTAssertEqual(Formato.clock(2832), "47:12")
        XCTAssertEqual(Formato.clock(3661), "1:01:01")
        XCTAssertEqual(DoblesLiveFormat.ago(8), "hace 8 s")
        XCTAssertEqual(DoblesLiveFormat.ago(125), "hace 2 min")
        XCTAssertEqual(DoblesLiveFormat.rpe(8), "8")
        XCTAssertEqual(DoblesLiveFormat.rpe(7.5), "7.5")
        XCTAssertNil(DoblesLiveFormat.rpe(nil))
    }
}
