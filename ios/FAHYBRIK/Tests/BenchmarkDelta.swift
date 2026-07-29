import Foundation

// Tests guiados — the ONE place that knows how a benchmark unit reads and which
// direction is better. Mirrors the server's rule exactly (test-results deltas):
// seconds → lower is better; every count/load unit (kg, bpm, meters, reps,
// calories) → higher is better. The hub rows, the result screen and the
// celebration all format through here so a delta can never read green in one
// surface and red in another.
enum BenchmarkDelta {
    /// U+2212 minus — typographically correct sign for readouts.
    static let minus = "−"

    /// seconds is the only lower-is-better unit today (time trials). Unknown
    /// future units default to higher-is-better (counts grow).
    static func lowerIsBetter(unit: String) -> Bool { unit == "seconds" }

    /// Did this delta beat the previous mark? A zero delta never celebrates.
    static func improved(unit: String, delta: Double) -> Bool {
        guard delta != 0 else { return false }
        return lowerIsBetter(unit: unit) ? delta < 0 : delta > 0
    }

    /// "22:14" · "1:02:40" · "142.5 kg" · "32 bpm" · "850 m" · "24 reps" · "18 cal"
    static func valueLabel(unit: String, value: Double) -> String {
        switch unit {
        case "seconds":  return timeLabel(Int(value.rounded()))
        case "kg":       return "\(trimmed(value)) kg"
        case "bpm":      return "\(Int(value.rounded())) bpm"
        case "meters":   return "\(Int(value.rounded())) m"
        case "reps":     return "\(Int(value.rounded())) reps"
        case "calories": return "\(Int(value.rounded())) cal"
        default:         return trimmed(value)
        }
    }

    /// Signed delta in the unit's own voice: "−12 s" · "−1:05" · "+2.5 kg" ·
    /// "+3 bpm". The sign is the RAW direction (a slower 5K reads "+12 s") —
    /// color it via `improved`, don't re-sign it.
    static func deltaLabel(unit: String, delta: Double) -> String {
        let sign = delta < 0 ? minus : "+"
        let mag = abs(delta)
        switch unit {
        case "seconds":
            let s = Int(mag.rounded())
            return s < 60 ? "\(sign)\(s) s" : "\(sign)\(Formato.ritmoCifras(Double(s)))"
        case "kg":       return "\(sign)\(trimmed(mag)) kg"
        case "bpm":      return "\(sign)\(Int(mag.rounded())) bpm"
        case "meters":   return "\(sign)\(Int(mag.rounded())) m"
        case "reps":     return "\(sign)\(Int(mag.rounded())) reps"
        case "calories": return "\(sign)\(Int(mag.rounded())) cal"
        default:         return "\(sign)\(trimmed(mag))"
        }
    }

    // "22:14" for 1334 s, "45s" under a minute, "1:02:40" past the hour.
    private static func timeLabel(_ seconds: Int) -> String {
        seconds >= 3600
            ? Formato.clock(Double(seconds))
            : Formato.clock(seconds, subMinuto: .segundos)
    }

    // "142.5" / "140" — one decimal max, no trailing ".0".
    private static func trimmed(_ v: Double) -> String {
        let rounded = (v * 10).rounded() / 10
        return rounded == rounded.rounded()
            ? String(Int(rounded))
            : String(format: "%.1f", rounded)
    }
}
