import Foundation

// QUÉ CIFRA MANDA EL HUD DE CORRER cuando no hay cinta FTMS.
//
// El plan (ritmo objetivo) NO es una medida. Sin reloj y sin cinta el héroe
// dice que no hay fuente — nunca pinta 5:45/km como si lo hubiera medido.
enum RunLiveHero: Equatable {
    case esfuerzo(String)
    case ritmoMedido(Int)
    case sinFuente
    case relojDeVuelta(Double)

    static func resolve(
        isGuidanceOnly: Bool,
        effortGuidance: String?,
        livePaceSecPerKm: Int?,
        hasLiveDistance: Bool,
        hasPacePrescription: Bool,
        lapElapsed: Double
    ) -> RunLiveHero {
        if isGuidanceOnly { return .esfuerzo(effortGuidance ?? "Suave") }
        if hasLiveDistance, let ritmo = livePaceSecPerKm { return .ritmoMedido(ritmo) }
        if hasPacePrescription { return .sinFuente }
        return .relojDeVuelta(lapElapsed)
    }
}
