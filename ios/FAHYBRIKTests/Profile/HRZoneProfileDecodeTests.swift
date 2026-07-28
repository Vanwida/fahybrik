import XCTest
@testable import FAHYBRIK

// The wire contract for the server-resolved HR zones.
//
// This is load-bearing in a way that is easy to miss: `AthleteIdentity.hrZones`
// is optional, but a PRESENT key whose shape doesn't match throws — and that
// throw fails the WHOLE /auth/me decode, so a single renamed field would log the
// athlete out of their own identity rather than just hiding a zone. The JSON
// below is copied from what `buildHrZonesDTO` (web/lib/athlete/hr-zones.ts)
// actually emits.
final class HRZoneProfileDecodeTests: XCTestCase {

    /// Exactly the server's shape, snake_case, as it rides in /auth/me.
    private let hrZonesJSON = """
    {
      "lthr_bpm": 156,
      "estimated": true,
      "source": "from_age",
      "source_label": "Estimado por tu edad",
      "zones": [
        {"zone":1,"code":"Z1","label":"Recuperación","min_bpm":null,"max_bpm":126,"range_label":"< 126 ppm"},
        {"zone":2,"code":"Z2","label":"Aeróbico suave","min_bpm":128,"max_bpm":137,"range_label":"128–137 ppm"},
        {"zone":3,"code":"Z3","label":"Aeróbico intenso","min_bpm":139,"max_bpm":147,"range_label":"139–147 ppm"},
        {"zone":4,"code":"Z4","label":"Umbral","min_bpm":148,"max_bpm":159,"range_label":"148–159 ppm"},
        {"zone":5,"code":"Z5","label":"VO₂ máx","min_bpm":161,"max_bpm":179,"range_label":"> 161 ppm"}
      ]
    }
    """

    func testDecodesTheServersShape() throws {
        let p = try APIClient.makeJSONDecoder().decode(HRZoneProfile.self, from: Data(hrZonesJSON.utf8))
        XCTAssertEqual(p.lthrBpm, 156)
        XCTAssertTrue(p.estimated)
        XCTAssertEqual(p.source, "from_age")
        XCTAssertEqual(p.sourceLabel, "Estimado por tu edad")
        XCTAssertEqual(p.zones.count, 5)
        XCTAssertNil(p.zones[0].minBpm, "Z1 has no floor")
        XCTAssertEqual(p.zones[1].minBpm, 128)
        XCTAssertEqual(p.zones[1].maxBpm, 137)
        XCTAssertEqual(p.zones[1].rangeLabel, "128–137 ppm")
    }

    /// The real athlete-64 case: age 44, no measured max → these exact bands. At
    /// 130 ppm he is in Z2, where his coach wants him. The app used to say Z3.
    func testClassifiesAgainstTheServersBands() throws {
        let p = try APIClient.makeJSONDecoder().decode(HRZoneProfile.self, from: Data(hrZonesJSON.utf8))
        XCTAssertEqual(p.zone(forBpm: 110), .z1)
        XCTAssertEqual(p.zone(forBpm: 130), .z2)
        XCTAssertEqual(p.zone(forBpm: 145), .z3)
        XCTAssertEqual(p.zone(forBpm: 155), .z4)
        XCTAssertEqual(p.zone(forBpm: 170), .z5)
        XCTAssertEqual(p.zone(forBpm: 200), .z5, "above the cap is still Z5")
        XCTAssertNil(p.zone(forBpm: 0))
    }

    /// An estimated threshold never becomes a watch target, and Z1 never becomes
    /// a two-sided band — the app has no formula to close one with.
    func testEstimatedProfileYieldsNoWatchBand() throws {
        let p = try APIClient.makeJSONDecoder().decode(HRZoneProfile.self, from: Data(hrZonesJSON.utf8))
        XCTAssertNil(p.bpmBand(for: .z1), "Z1 is open at the bottom")
        XCTAssertEqual(p.bpmBand(for: .z4), 148...159)
        XCTAssertNil(AppleWorkoutMapper.heartRateAlert(for: .z4, hrMax: p), "estimated → no alert")
    }

    /// The whole identity must survive an athlete who has NO zones — the common
    /// case today, and the one the old code refused to represent.
    func testIdentityDecodesWithoutZones() throws {
        let json = """
        {"id":"64","full_name":"Alex","dob":"1982-01-01","sex":"male","max_hr_bpm":null,"hr_zones":null}
        """
        let identity = try APIClient.makeJSONDecoder().decode(AthleteIdentity.self, from: Data(json.utf8))
        XCTAssertNil(identity.hrZones)
        XCTAssertNil(identity.maxHrBpm)
        XCTAssertEqual(identity.fullName, "Alex")
    }

    /// …and with them.
    func testIdentityDecodesWithZones() throws {
        let json = """
        {"id":"64","full_name":"Alex","dob":"1982-01-01","sex":"male","max_hr_bpm":null,"hr_zones":\(hrZonesJSON)}
        """
        let identity = try APIClient.makeJSONDecoder().decode(AthleteIdentity.self, from: Data(json.utf8))
        XCTAssertEqual(identity.hrZones?.lthrBpm, 156)
        XCTAssertEqual(identity.hrZones?.zones.count, 5)
    }
}
