import XCTest
@testable import FAHYBRIK

// #56 — the DOBLES turn projection (SegmentDoblesSplit → DoblesTurn) + its wire
// mirror. Pure logic: the rep reparto rounds so the two halves sum EXACTLY to the
// station total, the role maps 1:1, a station with no numeric reps is percentage-only
// (never a fabricated count), and the "Después:" preview walks the following stations.
// The frame-builder half is verified on the PHONE side (no watch test target), like
// the run-structure mirror tests.
final class DoblesTurnTests: XCTestCase {

    private func split(_ role: SegmentDoblesSplit.Role, _ share: Double,
                       partner: String? = "Guillem", note: String? = nil,
                       label: String = "Wall Balls") -> SegmentDoblesSplit {
        SegmentDoblesSplit(role: role, selfShare: share, note: note,
                           stationLabel: label, partnerName: partner)
    }

    private func station(_ label: String, reps: Int?, role: SegmentDoblesSplit.Role,
                         share: Double, partner: String? = "Guillem", order: Int = 1) -> WorkoutSegment {
        var seg = WorkoutSegment(order: order, title: label, kind: .reps, targetReps: reps)
        seg.doblesSplit = split(role, share, partner: partner, label: label)
        return seg
    }

    // MARK: - Rep reparto (rounded, sums to total)

    func testRepSplitRoundsAndSumsToTotal() {
        let s = split(.split, 0.6)
        let r = s.repSplit(total: 100)
        XCTAssertEqual(r?.mine, 60)
        XCTAssertEqual(r?.partner, 40)
    }

    func testRepSplitOddTotalStillSumsExactly() {
        // 7 × 0.5 = 3.5 → rounds to 4 mine; partner = total − mine (never a 2nd rounding).
        let r = split(.split, 0.5).repSplit(total: 7)
        XCTAssertEqual(r?.mine, 4)
        XCTAssertEqual(r?.partner, 3)
        XCTAssertEqual((r?.mine ?? 0) + (r?.partner ?? 0), 7)
    }

    func testRepSplitNilWithoutNumericTotal() {
        XCTAssertNil(split(.split, 0.6).repSplit(total: nil))
        XCTAssertNil(split(.split, 0.6).repSplit(total: 0))
    }

    // MARK: - Role mapping → DoblesTurn

    func testTurnMapsSplitRole() {
        let t = split(.split, 0.6).turn(total: 100)
        XCTAssertEqual(t.who, .split)
        XCTAssertEqual(t.selfReps, 60)
        XCTAssertEqual(t.partnerReps, 40)
        XCTAssertEqual(t.selfSharePct, 60)
        XCTAssertEqual(t.partnerSharePct, 40)
    }

    func testTurnMapsMineAndPartner() {
        let mine = split(.mine, 1.0).turn(total: 100)
        XCTAssertEqual(mine.who, .mine)
        XCTAssertEqual(mine.selfReps, 100)
        XCTAssertEqual(mine.partnerReps, 0)

        let partner = split(.partner, 0.0).turn(total: 100)
        XCTAssertEqual(partner.who, .partner)
        XCTAssertEqual(partner.selfReps, 0)
        XCTAssertEqual(partner.partnerReps, 100)
    }

    func testTurnPercentageOnlyWhenNoNumericReps() {
        let t = split(.split, 0.6).turn(total: nil)
        XCTAssertNil(t.selfReps)
        XCTAssertNil(t.partnerReps)
        XCTAssertEqual(t.selfSharePct, 60)   // the % is still known
    }

    // MARK: - WorkoutSegment.doblesTurn

    func testSegmentDoblesTurnNilWithoutSplit() {
        let seg = WorkoutSegment(order: 1, title: "Run", kind: .running, targetDistanceMeters: 1000)
        XCTAssertNil(seg.doblesTurn)
    }

    func testSegmentDoblesTurnReadsReps() {
        let seg = station("Wall Balls", reps: 100, role: .split, share: 0.6)
        XCTAssertEqual(seg.doblesTurn?.selfReps, 60)
        XCTAssertEqual(seg.doblesTurn?.station, "Wall Balls")
    }

    func testSegmentDoblesTurnPercentOnlyWhenRepsAbsent() {
        let seg = station("SkiErg", reps: nil, role: .split, share: 0.5)
        XCTAssertNil(seg.doblesTurn?.selfReps)
        XCTAssertEqual(seg.doblesTurn?.selfSharePct, 50)
    }

    // MARK: - Next turn ("Después:") derivation

    func testNextDoblesTurnSkipsNonDoblesSegments() {
        let segs = [
            station("Wall Balls", reps: 100, role: .mine, share: 1.0, order: 1),
            WorkoutSegment(order: 2, title: "Run 1k", kind: .running, targetDistanceMeters: 1000),
            station("SkiErg", reps: 80, role: .partner, share: 0.0, order: 3),
        ]
        let next = segs.nextDoblesTurn(after: 0)
        XCTAssertEqual(next?.who, .partner)          // skipped the run
        XCTAssertEqual(next?.station, "SkiErg")
        XCTAssertEqual(next?.partnerReps, 80)
    }

    func testNextDoblesTurnNilAtEnd() {
        let segs = [station("Wall Balls", reps: 100, role: .mine, share: 1.0, order: 1)]
        XCTAssertNil(segs.nextDoblesTurn(after: 0))
    }

    // MARK: - "Después:" descriptor

    func testNextDescriptionByRole() {
        XCTAssertEqual(DoblesTurnHero.nextDescription(split(.mine, 1.0).turn(total: 60)),
                       "tú · 60 reps")
        XCTAssertEqual(DoblesTurnHero.nextDescription(split(.partner, 0.0).turn(total: 40)),
                       "Guillem · 40 reps")
        XCTAssertEqual(DoblesTurnHero.nextDescription(split(.split, 0.6).turn(total: 100)),
                       "relevo · tú 60 / Guillem 40")
    }

    // MARK: - Wire population + structural handoff (phone-side, @MainActor)

    @MainActor
    private func session(_ segments: [WorkoutSegment]) -> WorkoutSession {
        WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Sim", format: .hyroxSim, estimatedDurationSeconds: 0,
            blockContext: "", zoneTargets: [], equipment: [], segments: segments,
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
    }

    @MainActor
    func testBuildFramePopulatesDoblesForSplit() {
        let s = session([station("Wall Balls", reps: 100, role: .split, share: 0.6)])
        let f = PhoneMirrorService.shared.buildFrame(from: s)
        XCTAssertEqual(f.dobles?.role, "split")
        XCTAssertEqual(f.dobles?.station, "Wall Balls")
        XCTAssertEqual(f.dobles?.selfReps, 60)
        XCTAssertEqual(f.dobles?.partnerReps, 40)
        XCTAssertEqual(f.dobles?.partnerName, "Guillem")
    }

    @MainActor
    func testBuildFrameNilDoblesForIndividualWork() {
        let s = session([WorkoutSegment(order: 1, title: "Run", kind: .running,
                                        targetDistanceMeters: 1000)])
        XCTAssertNil(PhoneMirrorService.shared.buildFrame(from: s).dobles)
    }

    @MainActor
    func testStructuralKeyFlipsOnTurnHandoff() {
        // Station 1 (partner relay) → station 2 (mine): the key must flip so a fresh
        // frame is resent the instant the turn hands back → the wrist's handoff haptic.
        let s = session([
            station("SkiErg", reps: 80, role: .partner, share: 0.0, order: 1),
            station("Wall Balls", reps: 100, role: .mine, share: 1.0, order: 2),
        ])
        let mirror = PhoneMirrorService.shared
        let key0 = mirror.structuralKey(mirror.buildFrame(from: s))
        s.currentSegmentIndex = 1
        let key1 = mirror.structuralKey(mirror.buildFrame(from: s))
        XCTAssertNotEqual(key0, key1)
    }
}
