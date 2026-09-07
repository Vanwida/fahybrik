import XCTest
@testable import FAHYBRIK

final class SessionStartPolicyTests: XCTestCase {

    private func seg(_ kind: SegmentKind, ergKind: String? = nil) -> WorkoutSegment {
        WorkoutSegment(order: 1, title: "x", kind: kind,
                       blockTitle: "B", blockPosition: 1, prescription: nil,
                       ergKind: ergKind)
    }

    private func recipe(run: Bool = false, ergs: [String] = [], unscoped: Bool = false) -> SessionStartRecipe {
        SessionStartRecipe(
            needsRunLocation: run,
            ergRoles: ergs,
            needsUnscopedErg: unscoped,
            asksWatch: run || !ergs.isEmpty || unscoped,
            isBenchmark: false
        )
    }

    func testRunLocationIsFirstStep() {
        let r = recipe(run: true)
        let a = SessionStartAnswers.empty
        XCTAssertEqual(SessionStartPolicy.nextIncompleteStep(recipe: r, answers: a), .runLocation)
    }

    func testErgAfterRunLocation() {
        let r = recipe(run: true, ergs: ["row"])
        var a = SessionStartAnswers.empty
        a.runEnvironment = .outdoor
        XCTAssertEqual(SessionStartPolicy.nextIncompleteStep(recipe: r, answers: a), .erg(roleWire: "row"))
    }

    func testCanReleaseAfterRunErgAndWatchAck() {
        let r = recipe(run: true, ergs: ["ski"])
        var a = SessionStartAnswers.empty
        a.runEnvironment = .indoor
        a.connectedErgRoles = ["ski"]
        a.watchProceedWithoutWrist = true
        XCTAssertTrue(SessionStartPolicy.canReleaseLive(recipe: r, answers: a))
    }

    func testPureStrengthSkipsWatch() {
        let r = SessionStartRecipe(
            needsRunLocation: false,
            ergRoles: [],
            needsUnscopedErg: false,
            asksWatch: false,
            isBenchmark: false
        )
        XCTAssertNil(SessionStartPolicy.nextIncompleteStep(recipe: r, answers: .empty))
        XCTAssertTrue(SessionStartPolicy.canReleaseLive(recipe: r, answers: .empty))
    }

    func testMeterAuthorityCopyNamesSource() {
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .outdoor).contains("Apple Watch"))
        XCTAssertTrue(SessionStartPolicy.meterAuthoritySubtitle(for: .treadmill).contains("cinta"))
    }

    func testRecipeFromSegmentsDetectsRunAndSki() {
        let r = SessionStartRecipe.from(segments: [seg(.running), seg(.rowOrSki, ergKind: "ski")],
                                        calentamientoRun: false)
        XCTAssertTrue(r.needsRunLocation)
        XCTAssertEqual(r.ergRoles, ["ski"])
    }
}
