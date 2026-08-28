import Foundation

// LOS DOS ACTOS DE SESIÓN EN LA MUÑECA.
//
// Distintos del avance de tramo (un toque cierra serie/estación) y distintos
// del vigía / cap / autocierre: esos no son una persona terminando. Pausar
// congela el mismo reloj; terminar lo pide una persona y cierra el mismo
// entreno en los dos aparatos.
//
// El cable ya sabía pausar (`CommandKind.pause` / `resume`) y ya sabía que
// solo `EndReason.athlete` propaga al teléfono. Lo que faltaba: que esos
// dos actos existieran en el vivo, con un gesto cada uno, no detrás de un
// deslizamiento ni solo cuando se pierde la señal.

enum WatchLiveSessionActs {

    /// En el vivo se ofrecen. Al guardar / al acabar, no.
    static func offersControls(isEnding: Bool) -> Bool { !isEnding }

    static func pauseTitle(isPaused: Bool) -> String {
        isPaused ? "Reanudar" : "Pausar"
    }

    static func pauseSymbol(isPaused: Bool) -> String {
        isPaused ? "play.fill" : "pause.fill"
    }

    static let finishTitle = "Terminar"
    static let finishSymbol = "stop.fill"

    /// El teléfono cierra SU motor solo si lo pidió una persona.
    static func phoneEngineCloses(reason: String?) -> Bool {
        reason == MirrorWire.EndReason.athlete
    }

    /// Pausa / reanuda el motor del teléfono. No es terminar. No es avanzar.
    @discardableResult
    static func applyPauseResume(_ kind: String, to session: WorkoutSession) -> Bool {
        switch kind {
        case MirrorWire.CommandKind.pause:
            guard !session.isPaused else { return false }
            session.togglePause()
            return true
        case MirrorWire.CommandKind.resume:
            guard session.isPaused else { return false }
            session.togglePause()
            return true
        default:
            return false
        }
    }
}
