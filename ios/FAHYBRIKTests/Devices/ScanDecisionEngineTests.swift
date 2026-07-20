import XCTest
@testable import FAHYBRIK

// The pure scan-decision core. Its entire contract is now one sentence:
//
//      A SCAN NEVER CONNECTS. IT KEEPS LISTENING, OR IT HANDS OVER A LIST.
//
// This file exists to make that permanent. `ScanDecision` used to carry an
// `.autoConnect(DeviceID)` case for what looked like the safe situation — exactly one
// device found and it is the one you used last. It is not safe: gym equipment rotates,
// so "the belt you used last" is very likely someone else's right now, possibly with
// somebody running on it, and this app can drive belts (speed, incline, start, stop).
// The case is deleted, and the tests below fail if any input ever produces a connect.
final class ScanDecisionEngineTests: XCTestCase {

    private func cand(_ tail: UInt8, rssi: Int = -50) -> DeviceCandidate {
        let id = UUID(uuidString: "00000000-0000-0000-0000-0000000000\(String(format: "%02X", tail))")!
        return DeviceCandidate(id: id, name: "Dev \(tail)", rssi: rssi)
    }

    private func decide(_ candidates: [DeviceCandidate], remembered: DeviceID?, settle: Bool) -> ScanDecision {
        ScanDecisionEngine.decide(candidates: candidates, remembered: remembered, settleElapsed: settle)
    }

    /// A settled scan always presents. Never connects — whatever it found.
    private func assertPresents(_ decision: ScanDecision,
                                _ expected: [DeviceCandidate],
                                _ message: String,
                                file: StaticString = #filePath, line: UInt = #line) {
        guard case let .present(list) = decision else {
            return XCTFail("\(message) — expected a list, got \(decision)", file: file, line: line)
        }
        XCTAssertEqual(list.map(\.id), expected.map(\.id), message, file: file, line: line)
    }

    // MARK: - THE INVARIANT: no input, ever, produces a connection

    /// The case that caused the incident. One belt in range, and it is the remembered
    /// one — the old engine walked straight into it with no picker and no tap. If this
    /// test ever fails, the app can grab a stranger's treadmill again.
    func testNeverAutoConnectsEvenToTheRememberedDevice() {
        let mine = cand(1)
        // Before settle: still listening. After settle: a LIST — not a connection.
        XCTAssertEqual(decide([mine], remembered: mine.id, settle: false), .keepScanning)
        assertPresents(decide([mine], remembered: mine.id, settle: true), [mine],
                       "the single remembered device must still be CHOSEN, not grabbed")
    }

    /// Exhaustive sweep: every shape of (candidates × remembered × settle) resolves to
    /// keepScanning or present. `ScanDecision` has no third option, and adding one that
    /// connects will break this file loudly.
    func testNoCombinationOfInputsEverYieldsAConnection() {
        let a = cand(1, rssi: -40), b = cand(2, rssi: -60), c = cand(3, rssi: -80)
        let candidateSets: [[DeviceCandidate]] = [[], [a], [b], [a, b], [a, b, c]]
        let rememberedOptions: [DeviceID?] = [nil, a.id, b.id, c.id]

        for set in candidateSets {
            for remembered in rememberedOptions {
                for settle in [false, true] {
                    switch decide(set, remembered: remembered, settle: settle) {
                    case .keepScanning:
                        XCTAssertFalse(settle, "a settled scan owes the athlete the list")
                    case .present(let list):
                        XCTAssertTrue(settle, "nothing is presented before the settle window")
                        XCTAssertEqual(Set(list.map(\.id)), Set(set.map(\.id)),
                                       "the list must be exactly what was found — nothing dropped, nothing invented")
                    }
                }
            }
        }
    }

    // MARK: - What "remembered" IS allowed to do: sort and label

    func testRememberedDeviceIsSortedFirstSoItIsFoundInOneGlance() {
        let strongStranger = cand(9, rssi: -35)
        let mine = cand(1, rssi: -75)
        // The stranger has a far better signal, yet the remembered one leads: it is the
        // row the athlete is looking for. It is still only a row — he taps it.
        assertPresents(decide([strongStranger, mine], remembered: mine.id, settle: true),
                       [mine, strongStranger],
                       "remembered first, regardless of signal")
    }

    func testRemainingDevicesAreSortedByStrongestSignal() {
        let near = cand(1, rssi: -40), mid = cand(2, rssi: -60), far = cand(3, rssi: -85)
        assertPresents(decide([far, near, mid], remembered: nil, settle: true),
                       [near, mid, far],
                       "the machine you're standing in front of is the loudest")
    }

    func testRememberedFirstThenTheRestBySignal() {
        let mine = cand(1, rssi: -90)
        let near = cand(2, rssi: -40), far = cand(3, rssi: -80)
        assertPresents(decide([near, far, mine], remembered: mine.id, settle: true),
                       [mine, near, far],
                       "one remembered row on top, the rest ranked by signal")
    }

    // MARK: - The original gym bug: a lone stranger is never grabbed either

    func testSingleUnknownIsNeverAutoConnected() {
        let unknown = cand(7)
        XCTAssertEqual(decide([unknown], remembered: nil, settle: false), .keepScanning)
        assertPresents(decide([unknown], remembered: nil, settle: true), [unknown],
                       "a lone unknown machine is a list of one, not a connection")
    }

    func testRememberedAbsentStillJustPresentsWhatIsThere() {
        let stranger = cand(9)
        let mine = cand(1)
        XCTAssertEqual(decide([stranger], remembered: mine.id, settle: false), .keepScanning)
        assertPresents(decide([stranger], remembered: mine.id, settle: true), [stranger],
                       "the remembered belt isn't here; that changes nothing about the rule")
    }

    // MARK: - Empty

    func testEmptyBeforeSettleKeepsScanning() {
        XCTAssertEqual(decide([], remembered: nil, settle: false), .keepScanning)
    }

    func testEmptyAfterSettlePresentsEmptyList() {
        XCTAssertEqual(decide([], remembered: nil, settle: true), .present([]))
    }
}
