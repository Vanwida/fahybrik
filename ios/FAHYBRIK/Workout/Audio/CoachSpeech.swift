import Foundation

// MARK: - CoachSpeech — natural es-ES phrasing (#63)
//
// Turns numbers and the prescribed grammar into the EXACT strings the synthesizer
// speaks. Two hard rules keep AVSpeechSynthesizer (es-ES) reliable and natural:
//   • NEVER emit a colon or "m:ss" — the synth reads "4:25" as a clock time
//     ("las cuatro y veinticinco"). Every time is spelled in words + digits
//     ("4 minutos 25 segundos"), which es-ES reads correctly as cardinals.
//   • ONE consistent time formatter (`clock`) for pace, splits, durations and the
//     total, so the athlete always hears times the same way.
// Pure and deterministic → unit-tested string-for-string.

enum CoachSpeech {

    // MARK: Numbers → spoken Spanish

    /// Whole seconds → "H hora(s) M minuto(s) S segundo(s)", omitting empty parts.
    /// The single time voice for pace, splits, durations and the workout total.
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(h) " + (h == 1 ? "hora" : "horas")) }
        if m > 0 { parts.append("\(m) " + (m == 1 ? "minuto" : "minutos")) }
        if sec > 0 || parts.isEmpty { parts.append("\(sec) " + (sec == 1 ? "segundo" : "segundos")) }
        return parts.joined(separator: " ")
    }

    /// Metres → "N metros", collapsing whole kilometres ("1 kilómetro", "2 kilómetros").
    /// A non-round distance stays in metres ("1200 metros") — never a fabricated "1,2 km".
    static func distance(_ meters: Int) -> String {
        let m = max(0, meters)
        if m >= 1000, m % 1000 == 0 {
            let k = m / 1000
            return "\(k) " + (k == 1 ? "kilómetro" : "kilómetros")
        }
        return "\(m) metros"
    }

    // MARK: Prescription grammar → phrases

    /// The measure phrase ("800 metros", "3 minutos"), or nil for an unknown/zero
    /// measure (a heterogeneous-pyramid bout with no scalar — spoken as objective only).
    static func measurePhrase(_ measure: RunSegmentMeasure) -> String? {
        switch measure {
        case let .distance(m): return m > 0 ? distance(m) : nil
        case let .duration(s): return s > 0 ? clock(s) : nil
        case .unknown:         return nil
        }
    }

    /// The objective phrase — the coach's target as the athlete should hear it:
    /// a pace band / single pace, a zone, or an RPE. Nil when there's nothing to
    /// hit (done by feel).
    static func objectivePhrase(_ target: RunSegmentTarget?) -> String? {
        switch target {
        case let .pace(value, minS, maxS):
            if let lo = minS, let hi = maxS, lo != hi {
                let (a, b) = lo < hi ? (lo, hi) : (hi, lo)
                return "ritmo entre \(clock(a)) y \(clock(b))"
            }
            if let single = value ?? minS ?? maxS { return "ritmo \(clock(single))" }
            return nil
        case let .paceZone(z) where z > 0: return "en zona \(z)"
        case let .hrZone(z) where z > 0:   return "en zona \(z)"
        case let .rpe(value, minV, maxV):
            if let lo = minV, let hi = maxV, lo != hi {
                let (a, b) = lo < hi ? (lo, hi) : (hi, lo)
                return "esfuerzo entre \(rpe(a)) y \(rpe(b))"
            }
            if let one = value ?? minV ?? maxV { return "esfuerzo \(rpe(one))" }
            return nil
        default:
            return nil   // .unknown, .paceZone/.hrZone(0), or nil target → done by feel
        }
    }

    /// RPE spoken form: whole numbers as-is ("8"), a clean half as "8 y medio",
    /// anything else rounded (RPE is a 0–10 point/band, never finer than 0.5).
    private static func rpe(_ value: Double) -> String {
        let whole = value.rounded(.down)
        let frac = value - whole
        if abs(frac) < 0.1 { return "\(Int(whole))" }
        if abs(frac - 0.5) < 0.1 { return "\(Int(whole)) y medio" }
        return "\(Int(value.rounded()))"
    }

    // MARK: Cue sentences

    /// The full sentence spoken when a leg begins.
    static func legText(_ leg: CueLeg) -> String {
        guard leg.isWork else { return recoveryText(leg) }
        let prefix: String
        switch leg.phase {
        case .warmup:   prefix = "Calentamiento. "
        case .cooldown: prefix = "Vuelta a la calma. "
        case .main:     prefix = "Tramo \(leg.number) de \(leg.total). "
        }
        let measure = measurePhrase(leg.measure)
        let objective = objectivePhrase(leg.target)
        let body: String
        if let m = measure, let o = objective { body = "\(m), \(o)" }
        else if let m = measure             { body = m }
        else if let o = objective           { body = capitalizedFirst(o) }
        else                                { body = "" }
        if body.isEmpty { return prefix.trimmingCharacters(in: .whitespaces) }  // already ends in "."
        return prefix + body + "."
    }

    /// A recovery bout: "Recuperación." + how it's measured + how it's taken.
    static func recoveryText(_ leg: CueLeg) -> String {
        if let measure = measurePhrase(leg.measure) {
            let mode = recoveryModeInline(leg.recoveryMode)
            return "Recuperación. \(measure)\(mode.isEmpty ? "" : " " + mode)."
        }
        // Open recovery (no distance / time) → an imperative for how to recover.
        let imperative = recoveryModeImperative(leg.recoveryMode)
        return imperative.isEmpty ? "Recuperación." : "Recuperación. \(imperative)."
    }

    private static func recoveryModeInline(_ mode: RunRecoveryMode?) -> String {
        switch mode {
        case .trote:   return "trote suave"
        case .caminar: return "caminando"
        case .parado:  return "parado"
        case nil:      return "suave"
        }
    }

    private static func recoveryModeImperative(_ mode: RunRecoveryMode?) -> String {
        switch mode {
        case .trote:   return "Trota suave"
        case .caminar: return "Camina"
        case .parado, nil: return ""   // "parado" needs a duration; without one, stay brief
        }
    }

    /// LA APP NO HABLA DEL RITMO (cards 114+171). Devuelve cadena vacía a
    /// propósito: el veredicto se PINTA —la zona tiñe el lienzo, el numeral cambia de
    /// tono—, no se dice. La firma se queda porque la histéresis de
    /// `RunCueEngine.onPaceSample` sigue siendo la que decide CUÁNDO habría algo que
    /// decir, y ese cuándo es lo que gobierna el háptico.
    static func paceCorrection(status: TargetStatus, deltaSec: Int?) -> String {
        switch status {
        case .tooFast, .tooSlow, .inTarget, .unknown:
            return ""
        }
    }

    // AQUÍ VIVÍA `split(km:splitSec:)`, la frase del kilómetro. El aviso de parcial
    // es de Apple: lo da la app Entrenamiento cuando el kilómetro es un PASO del
    // entreno que le mandamos (`AppleWorkoutMapper.kmSteps`). Era además la última
    // frase que quedaba hablando después de «la app no habla».

    /// The last-10-seconds heads-up before a timed leg / recovery rolls over.
    static let countdown = "10 segundos"

    /// End of workout.
    static func finish(totalSeconds: Int) -> String {
        "Entreno completado. Tiempo total \(clock(totalSeconds))."
    }

    // MARK: Helpers

    private static func capitalizedFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        return String(first).uppercased() + s.dropFirst()
    }
}
