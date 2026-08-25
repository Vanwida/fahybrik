import CoreGraphics
import Foundation

enum LandscapeTramo {
    enum Owner: String, Equatable {
        case currentWork
        case decisionGate
    }

    static let subjectPt: CGFloat = 112
    static let identityPt: CGFloat = 22
    static let titlePt: CGFloat = 28

    static func owner(
        awaitingBlockStart: Bool,
        awaitingFinish: Bool,
        finished: Bool
    ) -> Owner {
        if awaitingBlockStart || awaitingFinish || finished { return .decisionGate }
        return .currentWork
    }

    static func subjectPt(landscape: Bool) -> CGFloat { landscape ? subjectPt : 64 }
    static func identityPt(landscape: Bool) -> CGFloat { landscape ? identityPt : 12 }
    static func titlePt(landscape: Bool) -> CGFloat { landscape ? titlePt : 17 }
}
