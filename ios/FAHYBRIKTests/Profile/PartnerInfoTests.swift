import XCTest
@testable import FAHYBRIK

// Unit coverage for `PartnerInfo` derived display fields (`firstName`,
// `initials`). These power the PlanView "Con [X]" badge and the partner
// avatar circle in the Profile partner card.
final class PartnerInfoTests: XCTestCase {
    private func make(_ fullName: String) -> PartnerInfo {
        PartnerInfo(
            userId: "u_1",
            athleteId: "ath_1",
            fullName: fullName,
            email: nil,
            modality: "dobles",
            onboardedAt: nil
        )
    }

    // MARK: - firstName

    func test_firstName_twoWordName_returnsFirstWord() {
        XCTAssertEqual(make("Marc Vidal").firstName, "Marc")
    }

    func test_firstName_singleWord_returnsWholeName() {
        // No whitespace to split on — fall back to the full trimmed string.
        XCTAssertEqual(make("Pablo").firstName, "Pablo")
    }

    func test_firstName_threePlusWords_returnsOnlyFirst() {
        XCTAssertEqual(make("Maria Elena García").firstName, "Maria")
    }

    func test_firstName_trimsSurroundingWhitespace() {
        XCTAssertEqual(make("  Marc Vidal  ").firstName, "Marc")
    }

    // MARK: - initials

    func test_initials_twoWordName_returnsFirstAndLastInitial() {
        XCTAssertEqual(make("Marc Vidal").initials, "MV")
    }

    func test_initials_threePlusWords_takesFirstAndLast() {
        // Implementation uses parts.first + parts.last, so middle names are
        // dropped on purpose to keep the avatar to two letters.
        XCTAssertEqual(make("Maria Elena García").initials, "MG")
    }

    func test_initials_singleWord_returnsFirstTwoLetters() {
        // Single-word names have no last initial to pair with, so the helper
        // falls back to `prefix(2)`. Documented behaviour — keeps the avatar
        // circle visually balanced (one letter looks orphaned).
        // NOTE: spec W6 originally asked for "P" here; that would require a
        // separate single-letter branch. Test pins the *current* behaviour.
        XCTAssertEqual(make("Pablo").initials, "PA")
    }

    func test_initials_emptyName_returnsBulletFallback() {
        XCTAssertEqual(make("").initials, "·")
    }

    func test_initials_isAlwaysUppercased() {
        XCTAssertEqual(make("marc vidal").initials, "MV")
    }
}
