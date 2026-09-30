import Foundation

// LOS DATOS DEL INFORME DE SALTO — la ficha permanente del perfil de salto, tal como llega del servidor
// (`CmjReportDTO`) y su versión corta para cuando el servidor aún no mandó el informe (`thin`, `from`).
// La misma para atleta y coach. Los cortes NO viven aquí — llegan en el DTO (método del coach). La
// pantalla que los pinta es `JumpReportView`.

struct JumpProfileDTO: Codable, Equatable {
    let unloadedCm: Double
    let loadedCm: Double?
    let lri: Double?
    let lriLabel: String?
    let heightLevel: Int
    let lriLevel: Int?
}

struct CmjScaleBandDTO: Codable, Equatable {
    let level: Int
    let rangeLabel: String
    let label: String
    let active: Bool
}

struct CmjAttemptDTO: Codable, Equatable {
    let kind: String
    let heightCm: Double
    let kept: Bool
    let quality: String
}

struct CmjReportDTO: Codable, Equatable {
    let title: String
    let dateLabel: String?
    let unloadedCm: Double
    let loadedCm: Double?
    let heightLevel: Int
    let heightLabel: String
    let loadedHeightLevel: Int?
    let lri: Double?
    let lriLabel: String?
    let lriLevel: Int?
    let dropAbsCm: Double?
    let dropRel: Double?
    let loadRel: Double?
    let loadKg: Double?
    let bodyMassKg: Double?
    let lectura: String
    let heightScale: [CmjScaleBandDTO]
    let lriScale: [CmjScaleBandDTO]
    let attempts: [CmjAttemptDTO]
}

extension CmjReportDTO {
    /// Vista corta cuando el servidor aún no mandó el informe (p.ej. justo al guardar).
    static func thin(title: String, dateLabel: String?, profile: JumpProfileDTO, bodyMassKg: Double?) -> CmjReportDTO {
        let drop = profile.loadedCm.map { profile.unloadedCm - $0 }
        let dropRel = drop.map { profile.unloadedCm > 0 ? $0 / profile.unloadedCm : 0 }
        return CmjReportDTO(
            title: title,
            dateLabel: dateLabel,
            unloadedCm: profile.unloadedCm,
            loadedCm: profile.loadedCm,
            heightLevel: profile.heightLevel,
            heightLabel: "Nivel \(profile.heightLevel)",
            loadedHeightLevel: nil,
            lri: profile.lri,
            lriLabel: profile.lriLabel,
            lriLevel: profile.lriLevel,
            dropAbsCm: drop,
            dropRel: dropRel,
            loadRel: nil,
            loadKg: nil,
            bodyMassKg: bodyMassKg,
            lectura: profile.lriLabel.map {
                "Capacidad explosiva nivel \(profile.heightLevel). Respuesta a la carga: \($0.lowercased())."
            } ?? "Capacidad explosiva nivel \(profile.heightLevel).",
            heightScale: [],
            lriScale: [],
            attempts: []
        )
    }
}

extension JumpProfileDTO {
    static func from(unloaded: Double, loaded: Double?, loadKg: Double?, bodyMassKg: Double?) -> JumpProfileDTO {
        let dropRel = (loaded != nil && unloaded > 0) ? (unloaded - loaded!) / unloaded : nil
        let loadRel = (loadKg != nil && bodyMassKg != nil && bodyMassKg! > 0) ? loadKg! / bodyMassKg! : nil
        let lri = (dropRel != nil && loadRel != nil && loadRel! > 0) ? dropRel! / loadRel! : nil
        let heightLevel: Int
        if unloaded < 30 { heightLevel = 1 }
        else if unloaded < 35 { heightLevel = 2 }
        else if unloaded < 40 { heightLevel = 3 }
        else if unloaded <= 45 { heightLevel = 4 }
        else { heightLevel = 5 }
        var lriLevel: Int?
        var lriLabel: String?
        if let lri {
            if lri <= 0.45 { lriLevel = 5; lriLabel = "Excelente" }
            else if lri <= 0.70 { lriLevel = 4; lriLabel = "Muy buena" }
            else if lri <= 0.90 { lriLevel = 3; lriLabel = "Correcta" }
            else if lri <= 1.20 { lriLevel = 2; lriLabel = "Baja" }
            else { lriLevel = 1; lriLabel = "Muy baja" }
        }
        return JumpProfileDTO(
            unloadedCm: unloaded,
            loadedCm: loaded,
            lri: lri,
            lriLabel: lriLabel,
            heightLevel: heightLevel,
            lriLevel: lriLevel
        )
    }
}
