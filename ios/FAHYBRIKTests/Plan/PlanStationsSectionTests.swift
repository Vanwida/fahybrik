import XCTest
@testable import FAHYBRIK

// Unit coverage for `DoblesRole.resolveMyRole(explicit:currentAthleteId:partnerAthleteId:)`.
//
// Contract:
//   • `explicit` (backend `my_role`) wins when it is "a" or "b".
//   • Otherwise, fall back to a lexicographic comparison of the two athlete
//     IDs. Lower → "a", higher → "b". Both partners see the same pair, so
//     the resolution is symmetric across devices.
//   • Returns nil when partner / current ID are missing — caller renders no
//     station-split section in that case.
final class PlanStationsSectionTests: XCTestCase {
    func test_explicitA_returnsA() {
        let role = DoblesRole.resolveMyRole(
            explicit: "a",
            currentAthleteId: "athlete-zzz",
            partnerAthleteId: "athlete-aaa"
        )
        XCTAssertEqual(role, "a", "Explicit my_role must win over the lexicographic fallback.")
    }

    func test_explicitB_returnsB() {
        let role = DoblesRole.resolveMyRole(
            explicit: "b",
            currentAthleteId: "athlete-aaa",
            partnerAthleteId: "athlete-zzz"
        )
        XCTAssertEqual(role, "b")
    }

    func test_noPartner_returnsNil() {
        let role = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "athlete-aaa",
            partnerAthleteId: nil
        )
        XCTAssertNil(role)
    }

    func test_noCurrent_returnsNil() {
        let role = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: nil,
            partnerAthleteId: "athlete-aaa"
        )
        XCTAssertNil(role)
    }

    func test_emptyIds_returnsNil() {
        let role = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "",
            partnerAthleteId: ""
        )
        XCTAssertNil(role)
    }

    func test_fallbackLowerId_returnsA() {
        // "athlete-aaa" < "athlete-zzz" → current is the lower → "a".
        let role = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "athlete-aaa",
            partnerAthleteId: "athlete-zzz"
        )
        XCTAssertEqual(role, "a")
    }

    func test_fallbackHigherId_returnsB() {
        let role = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "athlete-zzz",
            partnerAthleteId: "athlete-aaa"
        )
        XCTAssertEqual(role, "b")
    }

    func test_explicitInvalidValue_fallsBackToLexicographic() {
        // Unknown values for `explicit` (anything other than "a" / "b") must
        // not poison the result — fall through to the deterministic shim.
        let role = DoblesRole.resolveMyRole(
            explicit: "wat",
            currentAthleteId: "alpha",
            partnerAthleteId: "omega"
        )
        XCTAssertEqual(role, "a")
    }

    func test_symmetry_partnersSeeOppositeRoles() {
        // The fallback must produce opposite roles when called from each
        // partner's perspective.
        let aliceRole = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "alice",
            partnerAthleteId: "bob"
        )
        let bobRole = DoblesRole.resolveMyRole(
            explicit: nil,
            currentAthleteId: "bob",
            partnerAthleteId: "alice"
        )
        XCTAssertNotEqual(aliceRole, bobRole)
        XCTAssertNotNil(aliceRole)
        XCTAssertNotNil(bobRole)
    }
}
