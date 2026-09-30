import Foundation

// El briefing del test de salto, tal como llega del servidor: qué traer, cómo se coloca el teléfono, cómo
// se salta y en qué orden va a ir. El test solo existe si el coach lo programó. La pantalla que lo pinta
// es `JumpBriefView`.

struct JumpNeedDTO: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let detail: String
}

struct JumpBriefStepDTO: Codable, Equatable, Identifiable {
    var id: Int { n }
    let n: Int
    let title: String
    let detail: String
}

struct JumpBriefDTO: Codable, Equatable {
    let title: String
    let what: String
    let durationLabel: String
    let needs: [JumpNeedDTO]
    let sequence: [JumpBriefStepDTO]
    let jumpCues: [String]
    let phone: [String]
    let dayCard: String
}
