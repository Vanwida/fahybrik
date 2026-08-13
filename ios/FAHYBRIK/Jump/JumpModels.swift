import Foundation

struct JumpDraftAttempt: Identifiable {
    let id = UUID()
    var kind: String
    var takeoffFrame: Int
    var landingFrame: Int
    var fps: Double
    var quality: String
    var kept: Bool
    var clipURL: URL?

    var heightCm: Double? {
        JumpPhysics.heightCm(takeoffFrame: takeoffFrame, landingFrame: landingFrame, fps: fps)
    }
}

struct JumpAttemptWire: Encodable {
    let kind: String
    let takeoffFrame: Int
    let landingFrame: Int
    let fps: Double
    let quality: String
    let kept: Bool
}

struct JumpResultsBody: Encodable {
    let results: [TestResultEntry]
    let bodyMassKg: Double?
    let loadKg: Double?
    let attempts: [JumpAttemptWire]
}

enum JumpSeries: String {
    case cmj
    case loaded = "loaded_cmj"

    var title: String {
        switch self {
        case .cmj: return "Sin carga"
        case .loaded: return "Con carga"
        }
    }
}
