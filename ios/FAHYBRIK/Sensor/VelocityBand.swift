import Foundation

/// Semáforo de velocidad de subida (fase 3). Misma doctrina que
/// `shared/domain/strength/velocity-bands.ts`: color = m/s, no %1RM.
/// Puro Foundation — compila en reloj e iPhone; los colores de Theme los pinta la UI.
enum VelocityBand: String, Sendable, Equatable {
    case green, yellow, orange, red, none

    /// Defectos absolutos (m/s) — coach_movement_policy puede pisarlos más adelante.
    static let greenMin = 0.55
    static let yellowMin = 0.40
    static let orangeMin = 0.25
    /// Por debajo de esto no se pinta (no rojo con aplomo). Subido tras falsos
    /// positivos de “m/s” al levantarse de una silla (11-ago).
    static let minConfidence = 0.55

    static func from(velocityMs: Double?, confidence: Double?) -> VelocityBand {
        guard let v = velocityMs, v >= 0 else { return .none }
        guard let c = confidence, c >= minConfidence else { return .none }
        if v >= greenMin { return .green }
        if v >= yellowMin { return .yellow }
        if v >= orangeMin { return .orange }
        return .red
    }

    var label: String {
        switch self {
        case .green:  return "Rápida"
        case .yellow: return "Media"
        case .orange: return "Lenta"
        case .red:    return "Muy lenta"
        case .none:   return ""
        }
    }
}

/// Lectura lista para pintar en el vivo de fuerza.
struct VelocityLiveReading: Equatable, Sendable {
    let metersPerSecond: Double
    let band: VelocityBand
    let lossPct: Double?
    let confidence: Double

    var mpsText: String {
        String(format: "%.2f", metersPerSecond).replacingOccurrences(of: ".", with: ",")
    }

    var lossText: String? {
        guard let lossPct, lossPct > 0.5 else { return nil }
        let n = String(format: "%.0f", lossPct)
        return "−\(n) %"
    }
}

enum VelocityLive {
    /// m/s de la última rep YA cerrada. Sin rep completada → nil (no hay chip).
    /// Alex: “repe ok → velocidad mostrada”, no estimar a mitad de ciclo.
    static func reading(from c: MirrorSensorConclusions?) -> VelocityLiveReading? {
        guard let c else { return nil }
        // Only the completed-rep field — not a mid-rep mean.
        guard let v = c.lastRepVelocityMs else { return nil }
        let conf = c.velocityConfidence ?? 0
        let band = VelocityBand.from(velocityMs: v, confidence: conf)
        guard band != .none else { return nil }
        return VelocityLiveReading(
            metersPerSecond: v,
            band: band,
            lossPct: c.velocityLossPct,
            confidence: conf
        )
    }
}
