import XCTest
@testable import FAHYBRIK

// The pure watch-vs-strap resolution for the pre-workout HR chip. A live/connecting
// chest strap always owns the chip; otherwise a paired Apple Watch turns it into the
// positive "automatic" state; with neither it's the unchanged connect CTA.
final class HRChipPresentationTests: XCTestCase {

    func testActiveStrapAlwaysWinsRegardlessOfWatch() {
        let active: [DeviceLink] = [.connected(name: "H10"), .connecting, .scanning, .reconnecting]
        for link in active {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: false), .band)
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: true), .band)
        }
    }

    func testNoStrapWithWatchShowsAppleWatch() {
        let inactive: [DeviceLink] = [.idle, .unavailable, .failed("x")]
        for link in inactive {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: true), .appleWatch)
        }
    }

    func testNoStrapNoWatchIsIdleCTA() {
        let inactive: [DeviceLink] = [.idle, .unavailable, .failed("x")]
        for link in inactive {
            XCTAssertEqual(HRChipPresentation.resolve(bandLink: link, watchAvailable: false), .idle)
        }
    }
}
