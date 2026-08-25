import CoreGraphics
import Foundation

/// Cómo se LEE el tramo en horizontal. Espejo de `shared/domain/landscape-tramo.ts`.
enum LandscapeTramo {
    static let subjectPt: CGFloat = 112
    static let identityPt: CGFloat = 22
    static let titlePt: CGFloat = 28

    static func subjectPt(landscape: Bool) -> CGFloat { landscape ? subjectPt : 64 }
    static func identityPt(landscape: Bool) -> CGFloat { landscape ? identityPt : 12 }
    static func titlePt(landscape: Bool) -> CGFloat { landscape ? titlePt : 17 }
}
