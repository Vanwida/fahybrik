import XCTest
@testable import FAHYBRIK

// Unit coverage for `deleteAccountCanSubmit(input:loading:)` — the free
// function exposed by DeleteAccountConfirmView so XCTest can reach the same
// rule the view uses for its destructive "Confirmar eliminación" button.
//
// Rule (mirrors AccountService.deleteConfirmationPhraseEs == "ELIMINAR MI CUENTA"):
//   • trimmed input must exactly equal the phrase (case-sensitive)
//   • loading must be false
final class DeleteAccountConfirmTests: XCTestCase {
    func test_emptyInput_returnsFalse() {
        XCTAssertFalse(deleteAccountCanSubmit(input: "", loading: false))
    }

    func test_whitespaceOnly_returnsFalse() {
        XCTAssertFalse(deleteAccountCanSubmit(input: "   ", loading: false))
    }

    func test_lowercase_returnsFalse() {
        // Case-sensitive match — the confirmation string is upper-case copy
        // ("ELIMINAR MI CUENTA"). Anything else, including a lower-case
        // version, must not enable the button.
        XCTAssertFalse(
            deleteAccountCanSubmit(input: "eliminar mi cuenta", loading: false)
        )
    }

    func test_exactPhrase_notLoading_returnsTrue() {
        XCTAssertTrue(
            deleteAccountCanSubmit(input: "ELIMINAR MI CUENTA", loading: false)
        )
    }

    func test_exactPhrase_loading_returnsFalse() {
        // While a deletion request is in flight the button stays disabled to
        // prevent a double-submit.
        XCTAssertFalse(
            deleteAccountCanSubmit(input: "ELIMINAR MI CUENTA", loading: true)
        )
    }

    func test_phraseWithSurroundingWhitespace_returnsTrue() {
        // Trimming is applied; trailing spaces from auto-correct must not
        // block the user.
        XCTAssertTrue(
            deleteAccountCanSubmit(input: "  ELIMINAR MI CUENTA  ", loading: false)
        )
    }

    func test_partialPhrase_returnsFalse() {
        XCTAssertFalse(deleteAccountCanSubmit(input: "ELIMINAR", loading: false))
    }

    func test_phraseConstant_isLocalisedSpanishCopy() {
        // Guards against accidental refactor of the phrase the user must type.
        // If this fails, the iOS UI copy and the rule are out of sync.
        XCTAssertEqual(
            AccountService.deleteConfirmationPhraseEs,
            "ELIMINAR MI CUENTA"
        )
    }
}
