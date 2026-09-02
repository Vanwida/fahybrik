import Foundation

// TIME rest hitting 0 — the same door as «empezar ya».
//
// Recupera is not an Apple pause. The iPhone UI Timer that subtracts
// `runLegRemaining` does not run in the pocket. The HealthKit remote-session
// channel does. The wrist does NOT own a rest clock: it ages the last TIME
// remaining the phone already sent (`ventanaQueda`) by the same `sinceFrame`
// the count-in already uses, and fires `MirrorWire.CommandKind.advance`.
// DISTANCE / open rest never travel as TIME, so they cannot invent a 0 here.
enum MirrorTimedRest {

    /// One Recupera window. Firing is once per window so a dead phone timer
    /// cannot double-advance after the command has already left.
    struct Window: Equatable {
        let rondaN: Int?
        let formaIndice: Int?
        let parte: String?
    }

    static func window(of t: MirrorTramo) -> Window {
        Window(rondaN: t.rondaN, formaIndice: t.formaIndice, parte: t.parte)
    }

    /// Structured-run Recupera closed by a clock. `parte` is the run-structure
    /// mark (conditioning / iron rest omit it). `ventanaQueda > 0` is the
    /// prescribed TIME — 0 or nil is DISTANCE/open, not a deadline.
    static func isTimedRunRest(_ t: MirrorTramo) -> Bool {
        guard t.enDescanso, t.parte != nil else { return false }
        guard t.cierre == "sessionClock" || t.cierre == "formatClock" else { return false }
        guard let queda = t.ventanaQueda, queda > 0 else { return false }
        return true
    }

    /// Remaining TIME rest from the last frame, aged by wall time since it
    /// landed. Nil when this rest is not TIME. Not a second engine.
    static func quedaViva(tramo: MirrorTramo?, sinceFrame: TimeInterval) -> Double? {
        guard let t = tramo, isTimedRunRest(t), let queda = t.ventanaQueda else { return nil }
        return max(0, queda - max(0, sinceFrame))
    }

    static func shouldAdvance(
        tramo: MirrorTramo?,
        sinceFrame: TimeInterval,
        alreadyFiredFor: Window?
    ) -> Bool {
        guard let t = tramo, isTimedRunRest(t) else { return false }
        guard quedaViva(tramo: t, sinceFrame: sinceFrame) == 0 else { return false }
        return alreadyFiredFor != window(of: t)
    }
}
