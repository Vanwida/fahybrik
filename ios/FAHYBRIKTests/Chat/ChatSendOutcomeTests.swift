import XCTest
@testable import FAHYBRIK

// AUDIT — a failed chat send: a DETERMINISTIC 4xx marks the message failed (tap-to-retry,
// NOT queued → no eternal "enviando…"); a TRANSIENT failure queues for offline replay.
final class ChatSendOutcomeTests: XCTestCase {

    func testDeterministic4xxMarksFailed() {
        XCTAssertEqual(ChatSendOutcome.forError(APIError.http(400, Data())), .markFailed)
        XCTAssertEqual(ChatSendOutcome.forError(APIError.http(404, Data())), .markFailed)
        XCTAssertEqual(ChatSendOutcome.forError(APIError.http(409, Data())), .markFailed)
    }

    func testTransientFailuresQueue() {
        XCTAssertEqual(ChatSendOutcome.forError(APIError.http(500, Data())), .queueForReplay)
        XCTAssertEqual(ChatSendOutcome.forError(APIError.offline), .queueForReplay)
        XCTAssertEqual(ChatSendOutcome.forError(URLError(.timedOut)), .queueForReplay)
        XCTAssertEqual(ChatSendOutcome.forError(URLError(.networkConnectionLost)), .queueForReplay)
    }
}
