import XCTest
@testable import FAHYBRIK

// The pure card-eligibility logic: given a session's segments, WHICH connectable
// devices (cinta / remo / ski / banda) the pre-workout card offers, in display order.
// This is the seam the device card reads in both the brief and the free builder —
// tested here without any BLE, view, or hub.
final class PreWorkoutDeviceEligibilityTests: XCTestCase {

    private func seg(_ kind: SegmentKind, prescription: Prescription? = nil,
                     ergKind: String? = nil) -> WorkoutSegment {
        WorkoutSegment(order: 1, title: "x", kind: kind,
                       blockTitle: "B", blockPosition: 1, prescription: prescription,
                       ergKind: ergKind)
    }

    private func amrap() -> Prescription {
        Prescription(scheme: .amrap, modality: nil, sets: nil, rounds: nil,
                     workS: nil, restS: nil, totalS: 600, target: nil,
                     note: nil, start: nil, increment: nil)
    }

    private func emomMixed() -> Prescription {
        // Extreme case: EMOM with remo + ski + run + wallballs.
        let sets = [
            PrescriptionSet(measure: .calories(10), target: nil, modality: .row,
                            restS: nil, tempo: nil, note: "Remo"),
            PrescriptionSet(measure: .calories(10), target: nil, modality: .ski,
                            restS: nil, tempo: nil, note: "Ski"),
            PrescriptionSet(measure: .reps(10), target: nil, modality: .functional,
                            restS: nil, tempo: nil, note: "Wall Balls"),
            PrescriptionSet(measure: .distance(meters: 200), target: nil, modality: .run,
                            restS: nil, tempo: nil, note: "Run"),
        ]
        return Prescription(scheme: .emom, modality: .functional, sets: sets,
                            rounds: 20, workS: 60, restS: nil, totalS: nil,
                            target: nil, note: nil, start: nil, increment: nil)
    }

    private func devices(_ segments: [WorkoutSegment]) -> [PreWorkoutDevice] {
        PreWorkoutDeviceEligibility.devices(for: segments)
    }

    // MARK: - Single-modality sessions

    func testRunOffersTreadmillAndStrap() {
        XCTAssertEqual(devices([seg(.running)]), [.treadmill, .heartRate])
    }

    func testErgOffersPM5AndStrap() {
        // Untagged erg segment → unscoped PM5 chip + strap.
        XCTAssertEqual(devices([seg(.rowOrSki)]), [.ergAny, .heartRate])
    }

    func testSkiErgKindOffersSkiChip() {
        XCTAssertEqual(devices([seg(.rowOrSki, ergKind: "ski")]),
                       [.erg(.ski), .heartRate])
    }

    func testRowErgKindOffersRowChip() {
        XCTAssertEqual(devices([seg(.rowOrSki, ergKind: "row")]),
                       [.erg(.row), .heartRate])
    }

    func testPureStrengthOffersNothing() {
        XCTAssertEqual(devices([seg(.strength)]), [])
    }

    func testRepsAndSledOfferNothing() {
        XCTAssertEqual(devices([seg(.reps), seg(.sled)]), [])
    }

    func testEmptySessionOffersNothing() {
        XCTAssertEqual(devices([]), [])
    }

    // MARK: - Mixed sessions + ordering (machines first, HR last)

    func testRunPlusErgOffersAllThreeInOrder() {
        XCTAssertEqual(devices([seg(.running), seg(.rowOrSki)]),
                       [.treadmill, .ergAny, .heartRate])
    }

    func testRunPlusNamedSkiOffersTreadmillSkiStrap() {
        XCTAssertEqual(devices([seg(.running), seg(.rowOrSki, ergKind: "ski")]),
                       [.treadmill, .erg(.ski), .heartRate])
    }

    func testRunPlusStrengthStillOffersBeltAndStrap() {
        XCTAssertEqual(devices([seg(.strength), seg(.running)]),
                       [.treadmill, .heartRate])
    }

    // MARK: - Conditioning is cardio → the strap earns its place

    func testMetconWithoutRunOrErgOffersOnlyStrap() {
        // A metcon block folds onto a non-run/-erg segment kind but IS cardio work,
        // so the HR strap is offered even without a belt or an erg.
        XCTAssertEqual(devices([seg(.strength, prescription: amrap())]), [.heartRate])
    }

    func testBareMetconDoesNotInventTreadmillOrPM5() {
        let out = devices([seg(.strength, prescription: amrap())])
        XCTAssertFalse(out.contains(.treadmill))
        XCTAssertFalse(out.contains(.ergAny))
        XCTAssertFalse(out.contains { if case .erg = $0 { return true }; return false })
    }

    // MARK: - Functional multi-machine (the extreme EMOM)

    func testFunctionalEmomOffersRemoSkiCintaAndStrap() {
        // 10 cal remo · 10 cal ski · wallballs · 200 m run → all three machines + HR.
        let out = devices([seg(.reps, prescription: emomMixed())])
        XCTAssertEqual(out, [
            .treadmill,
            .erg(.row),
            .erg(.ski),
            .heartRate,
        ])
    }

    func testInvolvesErgTrueWhenSetsCarryErgModality() {
        let s = seg(.reps, prescription: emomMixed())
        XCTAssertTrue(s.involvesErg)
        XCTAssertTrue(s.involvesRun)
    }

    func testNamedRolesFromSets() {
        let s = seg(.reps, prescription: emomMixed())
        let roles = PreWorkoutDeviceEligibility.namedErgRoles(in: s)
        XCTAssertEqual(roles, [.row, .ski])
    }
}
