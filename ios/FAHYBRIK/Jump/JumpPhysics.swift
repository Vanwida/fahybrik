import Foundation

// Paridad con shared/domain/jump/physics.ts. g no se edita.

enum JumpPhysics {
    static let g = 9.81

    /// El techo FÍSICO del vuelo (paridad con `JUMP_FLIGHT_MAX_S`): 1 s en el aire
    /// son 122,6 cm. Por encima no hay un salto, hay un aterrizaje mal marcado; el
    /// servidor lo rechaza (0278), así que aquí no se puede conservar.
    static let maxFlightS = 1.0

    static func flightTimeSeconds(takeoffFrame: Int, landingFrame: Int, fps: Double) -> Double? {
        guard fps > 0, landingFrame > takeoffFrame else { return nil }
        return Double(landingFrame - takeoffFrame) / fps
    }

    /// True cuando los fotogramas describen un salto posible.
    static func isPlausible(takeoffFrame: Int, landingFrame: Int, fps: Double) -> Bool {
        guard let t = flightTimeSeconds(takeoffFrame: takeoffFrame, landingFrame: landingFrame, fps: fps) else {
            return false
        }
        return t <= maxFlightS
    }

    static func heightCm(flightTimeS: Double, g: Double = g) -> Double? {
        guard flightTimeS > 0, g > 0 else { return nil }
        return (g * flightTimeS * flightTimeS / 8) * 100
    }

    /// La altura de un intento, o nil si sus fotogramas no son un salto posible.
    static func heightCm(takeoffFrame: Int, landingFrame: Int, fps: Double) -> Double? {
        guard let t = flightTimeSeconds(takeoffFrame: takeoffFrame, landingFrame: landingFrame, fps: fps),
              t <= maxFlightS
        else {
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
