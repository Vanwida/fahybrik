import XCTest
@testable import FAHYBRIK

final class LiveUndoTests: XCTestCase {

    func testFirstSetWithNothingClosedIsNoop() {
        let c = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: false,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .noop)
        XCTAssertFalse(LiveUndo.canUndo(c))
    }

    func testClosedSetOnFirstSegmentUndoesThatSet() {
        let c = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: true,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .unconfirmLastSet)
        XCTAssertTrue(LiveUndo.canUndo(c))
    }

    func testStationInSameBlockStepsBack() {
        let c = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: false,
            segmentIndex: 2, sameBlockAsPrevious: true,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .stepBackSegment)
    }

    func testFirstMoveOfNextBlockParksAtGate() {
        let c = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: false,
            segmentIndex: 1, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .parkBlockGate)
    }

    func testFinishQuestionReopensAndStaysLive() {
        let c = LiveUndo.Cursor(
            finished: false, awaitingFinish: true, hasConfirmedSet: true,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .reopenFromFinish)
    }

    func testClosedSessionDoesNotReopen() {
        let c = LiveUndo.Cursor(
            finished: true, awaitingFinish: true, hasConfirmedSet: true,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: c), .noop)
    }

    func testEmomIntervalAndListStationKeepExistingDoors() {
        let emom = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: false,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 0, emomIntervalIndex: 2, isEmom: true)
        XCTAssertEqual(LiveUndo.action(for: emom), .stepBackEmom)

        let lista = LiveUndo.Cursor(
            finished: false, awaitingFinish: false, hasConfirmedSet: false,
            segmentIndex: 0, sameBlockAsPrevious: false,
            roundsDone: 3, emomIntervalIndex: 0, isEmom: false)
        XCTAssertEqual(LiveUndo.action(for: lista), .unmarkLastRound)
    }
}
