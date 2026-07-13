import XCTest
@testable import FAHYBRIK

// The pure card-eligibility logic: given a session's segments, WHICH connectable
// devices (cinta / remo / banda) the pre-workout card offers, in display order.
// This is the seam the device card reads in both the brief and the free builder —
// tested here without any BLE, view, or hub.
final class PreWorkoutDeviceEligibilityTests: XCTestCase {

    private func seg(_ kind: SegmentKind, prescription: Prescription? = nil) -> WorkoutSegment {
        WorkoutSegment(order: 1, title: "x", kind: kind,
                       blockTitle: "B", blockPosition: 1, prescription: prescription)
    }

    private func amrap() -> Prescription {
        Prescription(scheme: .amrap, modality: nil, sets: nil, rounds: nil,
                     workS: nil, restS: nil, totalS: 600, target: nil,
                     note: nil, start: nil, increment: nil)
    }

    private func devices(_ segments: [WorkoutSegment]) -> [PreWorkoutDevice] {
        PreWorkoutDeviceEligibility.devices(for: segments)
    }

    // MARK: - Single-modality sessions

    func testRunOffersTreadmillAndStrap() {
        XCTAssertEqual(devices([seg(.running)]), [.treadmill, .heartRate])
    }

    func testErgOffersPM5AndStrap() {
        XCTAssertEqual(devices([seg(.rowOrSki)]), [.pm5, .heartRate])
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
                       [.treadmill, .pm5, .heartRate])
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

    func testMetconDoesNotInventTreadmillOrPM5() {
        let out = devices([seg(.strength, prescription: amrap())])
        XCTAssertFalse(out.contains(.treadmill))
        XCTAssertFalse(out.contains(.pm5))
    }
}
