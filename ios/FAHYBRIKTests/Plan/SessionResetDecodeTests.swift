import XCTest
@testable import FAHYBRIK

// DESHACER — el 409 del cable es el diálogo, no el error genérico (card 183).
//
// El servidor manda `jsonError('needs_confirmation', …, 409, { has_recorded_work })`.
// `confirmationDialog` (SwiftUI) es la hoja destructiva. Si `APIErrorBody` no
// lee el `code`, el catch enseña «Inténtalo de nuevo» — eso es lo que vio
// el atleta. Aquí se caza el envelope real, no un mock de red.

final class SessionResetDecodeTests: XCTestCase {

    /// Bytes exactos de `jsonError` en web/lib/api/responses.ts.
    private func wireNeedsConfirmation() -> Data {
        Data("""
        {"error":{"code":"needs_confirmation","message":"This session has recorded work that will be permanently deleted","details":{"has_recorded_work":true}}}
        """.utf8)
    }

    func test_409_needs_confirmation_del_cable_es_dialogo() {
        let data = wireNeedsConfirmation()
        XCTAssertEqual(APIErrorBody.code(from: data), "needs_confirmation")
        let error = APIError.http(409, data)
        XCTAssertEqual(PlanService.ResetOutcome.mappingHTTPError(error), .needsConfirmation)
    }

    func test_409_conflict_no_es_el_dialogo() {
        let data = Data("""
        {"error":{"code":"conflict","message":"This session has no completion to undo"}}
        """.utf8)
        XCTAssertEqual(APIErrorBody.code(from: data), "conflict")
        XCTAssertNil(PlanService.ResetOutcome.mappingHTTPError(APIError.http(409, data)))
    }

    func test_envelope_con_details_no_tumba_el_decode() {
        // El campo extra que el Codable viejo podía perder si el envelope
        // crecía. JSONSerialization (Foundation) es el respaldo.
        XCTAssertEqual(APIErrorBody.code(from: wireNeedsConfirmation()), "needs_confirmation")
    }
}
