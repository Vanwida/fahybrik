import Foundation

/// Auto-pause for an outdoor run (#64) as a PURE hysteresis machine. The outdoor HUD
/// model ticks it with the current smoothed speed + context; it returns whether to
/// engage or release auto-pause, and the model applies the side effect
/// (`session.autoPause()` / `autoResume()` + haptic). Kept side-effect-free so the
/// dwell/threshold logic is unit-tested deterministically.
///
/// Design rules it enforces:
///   • It NEVER fights the manual pause: while the athlete holds a manual pause it
///     stands down and forgets its timers, so a manual resume starts auto-pause
///     fresh (never an instant re-pause).
///   • Distinct engage/release thresholds (engage < release) give hysteresis so a
///     runner hovering near the boundary doesn't flap paused/running.
///   • It fires only on a CONFIDENT stop: no trustworthy speed (signal loss) never
///     engages, and while paused a lost signal keeps it paused (can't confirm
///     movement).
///   • It only runs where auto-pause is meaningful (`eligible` — distance/continuous
///     legs, per the model). An eligible→ineligible flip while paused releases at
///     once so a time leg's clock is never left frozen.
struct RunAutoPause {
    enum Action: Equatable { case none, engage, release }

    /// At/under this speed (m/s ≈ 2.2 km/h) sustained, the athlete has stopped.
    static let engageSpeedMps: Double = 0.6
    /// At/over this speed (m/s ≈ 4.3 km/h) sustained, they're running again. The gap
    /// above `engageSpeedMps` is the hysteresis band.
    static let releaseSpeedMps: Double = 1.2
    /// Seconds of sustained sub-threshold speed before auto-pause ENGAGES (debounce
    /// against a brief slowdown at a corner).
    static let engageDwellSeconds: TimeInterval = 3
    /// Seconds of sustained over-threshold speed before it RELEASES (resume quickly).
    static let releaseDwellSeconds: TimeInterval = 1.5
    /// LA SALIDA A CIEGAS. Soltar la autopausa exige una velocidad fiable, y la
    /// velocidad se degrada justo donde uno se para: pegado a un edificio, bajo un
    /// puente. Sin esto, una pausa automática podía quedarse enganchada
    /// indefinidamente con el atleta ya corriendo. Pasado este rato sin ninguna
    /// lectura de confianza se suelta: equivocarse soltando sólo cuesta unos segundos
    /// de crono corriendo, y el atleta siempre puede pausar a mano; equivocarse
    /// quedándose congela la sesión entera sin que nadie lo pida.
    static let blindReleaseSeconds: TimeInterval = 20

    private(set) var isEngaged = false
    private var belowSince: TimeInterval?
    private var aboveSince: TimeInterval?
    /// Desde cuándo llevamos sin una velocidad de confianza estando enganchados.
    private var blindSince: TimeInterval?

    /// One evaluation tick.
    /// - Parameters:
    ///   - speedMps: the smoothed recent speed, or nil when no trustworthy signal.
    ///   - eligible: whether auto-pause applies to the current leg (distance/continuous).
    ///   - isManualPause: the session is paused BY THE ATHLETE (not by us) right now.
    mutating func step(speedMps: Double?, eligible: Bool, isManualPause: Bool, now: TimeInterval) -> Action {
        // The manual pause owns the session — step aside and reset, so a manual
        // resume begins auto-pause detection from scratch.
        if isManualPause {
            reset()
            return .none
        }

        if isEngaged {
            // A leg that no longer supports auto-pause (e.g. advanced to a TIME leg)
            // must not stay frozen — release immediately.
            guard eligible else { reset(); return .release }
            // No trustworthy speed → can't confirm movement → stay paused… pero no
            // para siempre: pasado `blindReleaseSeconds` a ciegas, se suelta.
            guard let v = speedMps else {
                aboveSince = nil
                if blindSince == nil { blindSince = now }
                if now - (blindSince ?? now) >= Self.blindReleaseSeconds {
                    reset()
                    return .release
                }
                return .none
            }
            blindSince = nil
            if v >= Self.releaseSpeedMps {
                if aboveSince == nil { aboveSince = now }
                if now - (aboveSince ?? now) >= Self.releaseDwellSeconds {
                    reset()
                    return .release
                }
            } else {
                aboveSince = nil
            }
            return .none
        }

        // Running: watch for a sustained, confident stop.
        guard eligible, let v = speedMps else { belowSince = nil; return .none }
        if v <= Self.engageSpeedMps {
            if belowSince == nil { belowSince = now }
            if now - (belowSince ?? now) >= Self.engageDwellSeconds {
                isEngaged = true
                belowSince = nil
                aboveSince = nil
                return .engage
            }
        } else {
            belowSince = nil
        }
        return .none
    }

    private mutating func reset() {
        isEngaged = false
        belowSince = nil
        aboveSince = nil
        blindSince = nil
    }
}
