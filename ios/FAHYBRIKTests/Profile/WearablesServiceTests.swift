import XCTest
@testable import FAHYBRIK

// The wearables GET response decodes with the same tolerance the app relies on:
// empty arrays, an absent key, malformed rows, and present-but-null scalars all
// degrade gracefully instead of throwing the whole payload. Uses the shared
// snake_case decoder so `connected_at` → `connectedAt` is exercised for real.
final class WearablesServiceTests: XCTestCase {
    private let decoder = APIClient.makeJSONDecoder()

    private func decode(_ json: String) throws -> WearablesResponse {
        try decoder.decode(WearablesResponse.self, from: Data(json.utf8))
    }

    func testDecodesPolarConnectedAndIgnoresUnknown() throws {
        let resp = try decode(#"""
        {"providers":[
          {"provider":"polar","connected":true,"connected_at":"2026-07-14T10:00:00Z"},
          {"provider":"whoop","connected":false}
        ]}
        """#)
        XCTAssertEqual(resp.providers.count, 2)
        let polar = resp.providers.first { $0.provider == WearablesService.polar }
        XCTAssertEqual(polar?.connected, true)
        XCTAssertEqual(polar?.connectedAt, "2026-07-14T10:00:00Z")
    }

    func testEmptyProvidersArray() throws {
        let resp = try decode(#"{"providers":[]}"#)
        XCTAssertTrue(resp.providers.isEmpty)
    }

    func testAbsentProvidersKeyDecodesEmpty() throws {
        let resp = try decode("{}")
        XCTAssertTrue(resp.providers.isEmpty)
    }

    func testMalformedRowIsDropped() throws {
        // Second row has no "provider" (required) → LossyArray drops it, keeps polar.
        let resp = try decode(#"""
        {"providers":[
          {"provider":"polar","connected":false},
          {"connected":true}
        ]}
        """#)
        XCTAssertEqual(resp.providers.map(\.provider), ["polar"])
        XCTAssertEqual(resp.providers.first?.connected, false)
    }

    func testConnectedAtOptional() throws {
        let resp = try decode(#"{"providers":[{"provider":"polar","connected":true}]}"#)
        XCTAssertNil(resp.providers.first?.connectedAt)
    }

    func testConnectedNullDefaultsFalse() throws {
        let resp = try decode(#"{"providers":[{"provider":"polar","connected":null}]}"#)
        XCTAssertEqual(resp.providers.first?.connected, false)
    }

    func testDecodesCorosAndPendingLink() throws {
        let resp = try decode(#"""
        {"providers":[{"provider":"coros","connected":true,"connected_at":"2026-09-05T10:00:00Z"}],
         "pending_links":[{"confirmation_id":"3","provider":"coros","source_workout_ref":"coros:99","started_at":"2026-09-05T08:00:00Z"}]}
        """#)
        XCTAssertEqual(resp.providers.first?.provider, WearablesService.coros)
        XCTAssertEqual(resp.providers.first?.connected, true)
        XCTAssertEqual(resp.pendingLinks.count, 1)
        XCTAssertEqual(resp.pendingLinks.first?.confirmationId, "3")
        XCTAssertEqual(resp.pendingLinks.first?.sourceWorkoutRef, "coros:99")
    }

    func testAbsentPendingLinksKeyDecodesEmpty() throws {
        let resp = try decode(#"{"providers":[{"provider":"coros","connected":false}]}"#)
        XCTAssertTrue(resp.pendingLinks.isEmpty)
    }

    func testDecodesCorosSyncStats() throws {
        let resp = try decode(#"""
        {"ok":true,"imported":2,"asked":1,"activities_found":5,"skip_reason":null,"errored":0,
         "providers":[{"provider":"coros","connected":true}],
         "pending_links":[]}
        """#)
        XCTAssertEqual(resp.imported, 2)
        XCTAssertEqual(resp.asked, 1)
        XCTAssertEqual(resp.activitiesFound, 5)
        XCTAssertNil(resp.skipReason)
    }

    func testCorosSyncResultMessageImported() {
        let resp = WearablesResponse(
            providers: [],
            pendingLinks: [],
            imported: 3,
            asked: 0,
            activitiesFound: 3,
            skipReason: nil,
            errored: 0
        )
        XCTAssertEqual(
            WearablesService.corosSyncResultMessage(resp),
            "Importados 3 entrenos de COROS."
        )
    }

    func testCorosSyncResultMessageEmpty() {
        let resp = WearablesResponse(
            providers: [],
            pendingLinks: [],
            imported: 0,
            asked: 0,
            activitiesFound: 0,
            skipReason: nil,
            errored: 0
        )
        XCTAssertEqual(WearablesService.corosSyncResultMessage(resp), "Nada nuevo en COROS.")
    }

    func testCorosSyncResultMessageSkipReason() {
        let resp = WearablesResponse(
            providers: [],
            pendingLinks: [],
            imported: 0,
            asked: 0,
            activitiesFound: 0,
            skipReason: "coros_client_unavailable",
            errored: 0
        )
        XCTAssertTrue(
            WearablesService.corosSyncResultMessage(resp)
                .contains("desconectar")
        )
    }
}

private extension WearablesResponse {
    init(
        providers: [WearableProvider],
        pendingLinks: [WearablePendingLink],
        imported: Int?,
        asked: Int?,
        activitiesFound: Int?,
        skipReason: String?,
        errored: Int?
    ) {
        self.providers = LossyArray(wrappedValue: providers)
        self.pendingLinks = LossyArray(wrappedValue: pendingLinks)
        self.imported = imported
        self.asked = asked
        self.activitiesFound = activitiesFound
        self.skipReason = skipReason
        self.errored = errored
    }
}
