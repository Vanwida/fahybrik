import XCTest
@testable import FAHYBRIK

// The pure watch-vs-strap resolution for the pre-workout HR chip. A live/connecting
// chest strap always owns the chip; otherwise a paired Apple Watch turns it into the
// positive "automatic" state; with neither it's the unchanged connect CTA.
final class HRChipPresentationTests: XCTestCase {

    func testActiveStrapAlwaysWinsRegardlessOfWatch() {
        let active: [DeviceLink] = [.connected(name: "H10"), .connecting, .scanning]
        for link in active {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: false), .band)
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: true), .band)
        }
    }

    /// `.lost` counts as INACTIVE. The strap dropped and nothing is bringing it back —
    /// the chip must invite a tap (or credit the watch that is still reading his pulse),
    /// never imply a recovery in progress. It replaced `.reconnecting`, which is gone
    /// along with every automatic reconnect in the app.
    func testNoStrapWithWatchShowsAppleWatch() {
        let inactive: [DeviceLink] = [.idle, .lost, .unavailable, .failed("x")]
        for link in inactive {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: true), .appleWatch)
        }
    }

    func testNoStrapNoWatchIsIdleCTA() {
        let inactive: [DeviceLink] = [.idle, .lost, .unavailable, .failed("x")]
        for link in inactive {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: false), .idle)
        }
    }
}
