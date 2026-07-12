import XCTest
@testable import FAHYBRIK

// #64 — the outdoor run's GPS trace is shipped + stored as a Google encoded
// polyline (precision 5). These lock the codec to the STANDARD (so the web twin
// and any external tool decode it identically) and prove the round-trip holds to
// the stored ~1 m resolution.
final class PolylineCodecTests: XCTestCase {

    // The canonical reference vector from the Google polyline spec — the single
    // best guard that our encoder matches the standard byte-for-byte.
    private let referencePoints = [
        RoutePoint(lat: 38.5, lon: -120.2),
        RoutePoint(lat: 40.7, lon: -120.95),
        RoutePoint(lat: 43.252, lon: -126.453),
    ]
    private let referenceEncoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"

    func testEncodesTheReferenceVector() {
        XCTAssertEqual(PolylineCodec.encode(referencePoints), referenceEncoded)
    }

    func testDecodesTheReferenceVector() {
        let decoded = PolylineCodec.decode(referenceEncoded)
        XCTAssertEqual(decoded.count, referencePoints.count)
        for (a, b) in zip(decoded, referencePoints) {
            XCTAssertEqual(a.lat, b.lat, accuracy: 1e-5)
            XCTAssertEqual(a.lon, b.lon, accuracy: 1e-5)
        }
    }

    // A realistic Barcelona run (positive lat, negative lon) round-trips within the
    // stored precision — the honesty guarantee for the rendered trace.
    func testRoundTripHoldsToPrecision() {
        let route = (0..<200).map { i -> RoutePoint in
            RoutePoint(lat: 41.3874 + Double(i) * 0.00012,
                       lon: 2.1686 + Double(i) * 0.00009)
        }
        let decoded = PolylineCodec.decode(PolylineCodec.encode(route))
        XCTAssertEqual(decoded.count, route.count)
        for (a, b) in zip(decoded, route) {
            XCTAssertEqual(a.lat, b.lat, accuracy: 1e-5)
            XCTAssertEqual(a.lon, b.lon, accuracy: 1e-5)
        }
    }

    // Southern + western hemisphere (both coordinates negative) — the zig-zag sign
    // handling must survive it.
    func testNegativeHemisphereRoundTrips() {
        let route = [
            RoutePoint(lat: -33.8688, lon: -151.2093),
            RoutePoint(lat: -33.8700, lon: -151.2050),
        ]
        let decoded = PolylineCodec.decode(PolylineCodec.encode(route))
        for (a, b) in zip(decoded, route) {
            XCTAssertEqual(a.lat, b.lat, accuracy: 1e-5)
            XCTAssertEqual(a.lon, b.lon, accuracy: 1e-5)
        }
    }

    func testPointCountMatchesWithoutFullDecode() {
        XCTAssertEqual(PolylineCodec.pointCount(referenceEncoded), 3)
        let route = (0..<57).map { RoutePoint(lat: 41.0 + Double($0) * 0.001, lon: 2.0) }
        XCTAssertEqual(PolylineCodec.pointCount(PolylineCodec.encode(route)), 57)
    }

    func testEmptyAndSinglePoint() {
        XCTAssertEqual(PolylineCodec.encode([]), "")
        XCTAssertEqual(PolylineCodec.decode(""), [])
        XCTAssertEqual(PolylineCodec.pointCount(""), 0)

        let one = [RoutePoint(lat: 41.3874, lon: 2.1686)]
        let decoded = PolylineCodec.decode(PolylineCodec.encode(one))
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].lat, 41.3874, accuracy: 1e-5)
        XCTAssertEqual(decoded[0].lon, 2.1686, accuracy: 1e-5)
    }
}
