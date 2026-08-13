import Foundation

// Paridad con shared/domain/jump/physics.ts. g no se edita.

enum JumpPhysics {
    static let g = 9.81

    static func flightTimeSeconds(takeoffFrame: Int, landingFrame: Int, fps: Double) -> Double? {
        guard fps > 0, landingFrame > takeoffFrame else { return nil }
        return Double(landingFrame - takeoffFrame) / fps
    }

    static func heightCm(flightTimeS: Double, g: Double = g) -> Double? {
        guard flightTimeS > 0, g > 0 else { return nil }
        return (g * flightTimeS * flightTimeS / 8) * 100
    }

    static func heightCm(takeoffFrame: Int, landingFrame: Int, fps: Double) -> Double? {
        guard let t = flightTimeSeconds(takeoffFrame: takeoffFrame, landingFrame: landingFrame, fps: fps) else {
            return nil
        }
        return heightCm(flightTimeS: t)
    }

    static func takeoffVelocityMs(flightTimeS: Double, g: Double = g) -> Double? {
        guard flightTimeS > 0, g > 0 else { return nil }
        return (g * flightTimeS) / 2
    }

    static func uncertaintyCm(fps: Double, g: Double = g) -> Double? {
        guard fps > 0, g > 0 else { return nil }
        let dt = 1 / fps
        let tRef = sqrt((8 * 0.47) / g)
        guard let h0 = heightCm(flightTimeS: tRef, g: g),
              let h1 = heightCm(flightTimeS: tRef + dt, g: g)
        else { return nil }
        return abs(h1 - h0)
    }

    static func displayCm(_ cm: Double) -> String {
        "\(Int(cm.rounded())) cm"
    }
}
