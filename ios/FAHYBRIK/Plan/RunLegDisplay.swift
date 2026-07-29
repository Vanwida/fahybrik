import Foundation

// Pure display formatting for a structured-run leg on the wrist (#68): the tramo
// measure label ("800 m" / "2:00"), the leg's measured pace, the objetivo line +
// its in/out judgment, and the "luego: …" next-leg preview. No SwiftUI — the view
// maps `TargetStatus` to a Theme color; everything decidable is decided here so the
// band in/out logic is unit-tested from FAHYBRIKTests (no watch test target).

enum RunLegDisplay {
    /// Below this covered distance a per-leg average pace is too noisy to show
    /// honestly (a few metres over a second reads as an absurd pace), so the hero
    /// renders "—:—" until the leg has real distance under it.
    static let minMetersForPace: Double = 10

    /// The tramo's work measure for the status strip / previews: a distance in
    /// metres, a duration as m:ss, or "" for an open (manual) leg.
    static func measureLabel(_ leg: RunLeg) -> String {
        if let m = leg.distanceMeters { return "\(m) m" }
        if let s = leg.durationSeconds { return Formato.clock(s) }
        return ""
    }

    /// The CURRENT leg's average pace (sec/km) from its covered distance over its
    /// elapsed time — the honest per-tramo pace (the session's segment pace averages
    /// across every leg, so it can't be used here). Nil until the leg has enough
    /// distance/time for a meaningful number.
    static func legPaceSecPerKm(coveredMeters: Double, elapsedS: Double) -> Int? {
        guard coveredMeters >= minMetersForPace, elapsedS > 0 else { return nil }
        return Int((elapsedS / (coveredMeters / 1000.0)).rounded())
    }

    /// The objetivo line for a WORK leg + its judgment. `label` is the pace band /
    /// zone / RPE ("4:25–4:35 /km"); `status` judges the live pace against a pace
    /// BAND only — a zone/RPE/none objetivo carries no live pace to judge, so it
    /// stays `.unknown` and the view shows it plain (never a fabricated color).
    /// Nil when the leg is free (no objetivo at all).
    static func objetivo(for leg: RunLeg, livePaceSecPerKm: Int?) -> (label: String, status: TargetStatus)? {
        guard let label = leg.objetivoLabel else { return nil }
        let status: TargetStatus
        if case .pace = leg.runTarget {
            status = leg.runTarget.paceStatus(currentSecPerKm: livePaceSecPerKm)
        } else {
            status = .unknown
        }
        return (label, status)
    }

    /// The trailing state word on the objetivo line: "✓" inside the band, "rápido" /
    /// "lento" outside it (running below / above the prescribed pace), "" when there's
    /// nothing to judge.
    static func statusWord(_ status: TargetStatus) -> String {
        switch status {
        case .inTarget: return "✓"
        case .tooFast:  return "rápido"   // pace below the band → ease off
        case .tooSlow:  return "lento"    // pace above the band → push
        case .unknown:  return ""
        }
    }

    /// Natural-Spanish recovery mode word: trote → "suave", caminar → "caminando",
    /// parado → "parado". "" when the leg carries no mode.
    static func recoveryModeWord(_ mode: RunRecoveryMode?) -> String {
        switch mode {
        case .trote:   return "suave"
        case .caminar: return "caminando"
        case .parado:  return "parado"
        case .none:    return ""
        }
    }

    /// The "luego: …" preview of the NEXT leg — "rec. 2:00 suave" for a recovery,
    /// "800 m" / "2:00" for the next work bout. Nil on the last leg (nothing next).
    static func nextLegPreview(_ leg: RunLeg?) -> String? {
        guard let leg else { return nil }
        let measure = measureLabel(leg)
        if leg.isRecovery {
            let mode = recoveryModeWord(leg.recoveryMode)
            let tail = [measure, mode].filter { !$0.isEmpty }.joined(separator: " ")
            return tail.isEmpty ? "rec." : "rec. \(tail)"
        }
        return measure.isEmpty ? nil : measure
    }
}
