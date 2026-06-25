import Foundation

// MARK: - PrescriptionRenderer
//
// THE single source of truth for turning a structured `Prescription` into
// athlete-readable text, branching by MODALITY (not the old binary
// strength-vs-everything-else split). Both the pre-workout brief and the
// exercise-detail sheet consume this, so a squat pyramid, a Z1 bike, a 4×400m
// run interval and a cal-row all render correctly from ONE place.
//
// Design intent (mirrors the wire model in shared/domain/prescription):
//   · strength    → per-set rows (set#, reps, %RM|kg|RIR|RPE|BW, tempo, rest);
//                   uniform sets collapse to "N× …", pyramids expand one row/set.
//   · run         → distance|duration × pace(/km)|zone|RPE; intervals add rest.
//   · ergo        → distance|duration|calories × pace(/500m)|RPE|zone.
//   · functional  → reps|distance × load|bodyweight.
//   · core/mob    → reps|duration (+ optional RPE).
//
// Nothing is fabricated: a field absent from the prescription is simply omitted.

enum PrescriptionRenderer {

    // MARK: - Per-set table row (strength / any explicit-set modality)

    /// One displayable set row for a per-set table. `index` is 1-based.
    struct SetRow: Identifiable, Equatable {
        let id: Int
        let index: Int
        /// Work column, e.g. "5", "12", "1 km", "0:40", "15 cal".
        let work: String
        /// Intensity column, e.g. "75% 1RM", "120 kg", "RPE 8", "RIR 2", "BW".
        let load: String?
        /// Tempo column, e.g. "3-1-1-0".
        let tempo: String?
        /// Rest column, e.g. "2:00", "90s".
        let rest: String?
    }

    /// A modality-tagged, athlete-readable line (used for non-strength cards and
    /// the WOD component list). `headline` is the dominant measure; `detail` is
    /// the secondary intensity/rest line.
    struct Line: Equatable {
        let headline: String?
        let pace: String?
        let detail: String?
        let zone: HRZone?
    }

    // MARK: - Strength / explicit-set table

    /// Per-set rows for a strength (or any explicit-`sets`) prescription. Returns
    /// nil when there are no usable sets. When EVERY set is identical the caller
    /// can collapse to a single "N× …" header (see `collapsedSetsLabel`).
    static func setRows(_ p: Prescription) -> [SetRow]? {
        guard let sets = p.sets, !sets.isEmpty else { return nil }
        var rows: [SetRow] = []
        for (i, s) in sets.enumerated() {
            let work = measureWork(s.measure) ?? "—"
            rows.append(
                SetRow(
                    id: i,
                    index: i + 1,
                    work: work,
                    load: targetLoad(s.target),
                    tempo: s.tempo,
                    rest: s.restS.map(formatRest)
                )
            )
        }
        return rows.isEmpty ? nil : rows
    }

    /// True when every set carries the SAME work / load / tempo / rest — the
    /// table collapses to one "N× …" line. A pyramid (sets differ) stays expanded.
    static func setsAreUniform(_ p: Prescription) -> Bool {
        guard let rows = setRows(p) else { return false }
        guard rows.count > 1 else { return true }
        let first = rows[0]
        return rows.allSatisfy {
            $0.work == first.work && $0.load == first.load
                && $0.tempo == first.tempo && $0.rest == first.rest
        }
    }

    /// Collapsed header for a uniform set table, e.g. "4 × 5 · 75% 1RM · 2:00".
    static func collapsedSetsLabel(_ p: Prescription) -> String? {
        guard let rows = setRows(p), let first = rows.first else { return nil }
        var parts: [String] = []
        parts.append("\(rows.count) × \(first.work)")
        if let load = first.load { parts.append(load) }
        if let tempo = first.tempo { parts.append("tempo \(tempo)") }
        if let rest = first.rest { parts.append("descanso \(rest)") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Single-line summary (run / ergo / functional / core / mobility)
    //
    // For a non-strength line the athlete reads one card, not a table. We pick the
    // dominant measure (from the block target + the single set, if present) and
    // attach pace / zone / load / RPE / rest as secondary detail.

    static func summaryLine(_ p: Prescription) -> Line {
        let set = p.sets?.first
        let measure = set?.measure
        // Intensity precedence: a per-set target overrides the block-level one
        // (a steady ride carries the block target; an interval carries per-set).
        let target = set?.target ?? p.target

        let modality = p.modality ?? set?.modality ?? .other
        let headline = measureWork(measure)
        let pace = paceString(target, isErg: modality.isErg)
        let zone = zoneFromTarget(target)

        // Detail line: everything that isn't the headline measure or pace/zone.
        var detail: [String] = []
        // Interval shape: N × (work) with rest.
        if let count = p.sets?.count, count > 1, p.scheme == .interval {
            detail.insert("\(count)×", at: 0)
        }
        if let load = targetLoad(target), !isPaceOrZone(target) {
            detail.append(load)
        }
        if let restS = set?.restS ?? p.restS, restS > 0 {
            detail.append("descanso \(formatRest(restS))")
        }
        return Line(
            headline: headline,
            pace: pace,
            detail: detail.isEmpty ? nil : detail.joined(separator: " · "),
            zone: zone
        )
    }

    // MARK: - WOD (amrap / emom / for_time) header

    /// The format + cap/rounds header for a conditioning block, e.g.
    /// "AMRAP · 12:00", "EMOM · 10 min", "For Time · cap 15:00".
    static func wodHeader(_ p: Prescription) -> String? {
        switch p.scheme {
        case .amrap:
            if let cap = p.totalS, cap > 0 { return "AMRAP · \(formatClock(cap))" }
            return "AMRAP"
        case .emom:
            var parts = ["EMOM"]
            if let work = p.workS, work > 0 { parts.append("cada \(formatRest(work))") }
            if let rounds = p.rounds, rounds > 0 { parts.append("\(rounds) rondas") }
            return parts.joined(separator: " · ")
        case .forTime:
            var parts = ["For Time"]
            if let rounds = p.rounds, rounds > 0 { parts.insert("\(rounds) rondas", at: 1) }
            if let cap = p.totalS, cap > 0 { parts.append("cap \(formatClock(cap))") }
            return parts.joined(separator: " · ")
        default:
            return nil
        }
    }

    // MARK: - Measure → work string

    static func measureWork(_ m: Measure?) -> String? {
        guard let m else { return nil }
        switch m {
        case .reps(let v):
            return v > 0 ? "\(v)" : nil
        case .distance(let meters):
            return formatDistance(meters)
        case .duration(let seconds):
            return seconds > 0 ? formatClock(seconds) : nil
        case .calories(let v):
            return v > 0 ? "\(v) cal" : nil
        case .unknown:
            return nil
        }
    }

    /// The unit suffix for a measure's headline readout ("km" / "m" / "reps" / …).
    static func measureUnit(_ m: Measure?) -> String {
        guard let m else { return "" }
        switch m {
        case .reps:                return "reps"
        case .distance(let meters): return meters >= 1000 ? "km" : "m"
        case .duration:            return ""
        case .calories:            return ""
        case .unknown:             return ""
        }
    }

    // MARK: - Target → load / pace / zone strings

    /// The intensity column for a per-set table or the load chip on a card.
    /// Covers every Target kind that reads as a "load": %RM, kg, RPE, RIR,
    /// bodyweight, hr_bpm, calories-as-goal. Pace and hr_zone are surfaced
    /// separately (pace chip / zone badge) so they're excluded here.
    static func targetLoad(_ t: Target?) -> String? {
        guard let t else { return nil }
        switch t {
        case let .percentRM(v, mn, mx):
            return range(v, mn, mx, suffix: "% 1RM")
        case let .kg(v, mn, mx):
            return range(v, mn, mx, suffix: " kg", isKg: true)
        case let .rpe(v, mn, mx):
            return range(v, mn, mx, prefix: "RPE ")
        case let .rir(v, mn, mx):
            return range(v, mn, mx, prefix: "RIR ")
        case .bodyweight:
            return "BW"
        case let .hrBpm(v, mn, mx):
            return range(v, mn, mx, suffix: " ppm")
        case let .calories(v, mn, mx):
            return range(v, mn, mx, suffix: " cal")
        case .hrZone, .pace, .unknown:
            return nil
        }
    }

    /// The pace chip for a card, e.g. "@ 3:40 /km" (run) or "@ 1:55 /500m" (erg).
    /// `isErg` selects the /500m convention when the unit is generic.
    static func paceString(_ t: Target?, isErg: Bool) -> String? {
        guard case let .pace(unit, valueS, minS, maxS) = t else { return nil }
        let label: String
        switch unit {
        case .per500m: label = "/500m"
        case .perMile: label = "/mi"
        case .perKm:   label = isErg ? "/500m" : "/km"
        }
        // When the stored unit is per_km but this is an erg, convert to /500m.
        let scale: Double = (unit == .perKm && isErg) ? 0.5 : 1.0
        func fmt(_ s: Int) -> String { formatPace(Int((Double(s) * scale).rounded())) }
        if let v = valueS, v > 0 { return "@ \(fmt(v)) \(label)" }
        if let lo = minS, let hi = maxS, lo > 0, hi > 0 {
            return "@ \(fmt(lo))–\(fmt(hi)) \(label)"
        }
        if let lo = minS, lo > 0 { return "@ \(fmt(lo))+ \(label)" }
        if let hi = maxS, hi > 0 { return "@ \(fmt(hi)) \(label)" }
        return nil
    }

    /// The HR-zone badge value for a card (uses the range midpoint when a band).
    static func zoneFromTarget(_ t: Target?) -> HRZone? {
        guard case let .hrZone(v, mn, mx) = t else { return nil }
        let raw: Int?
        if let v { raw = Int(v.rounded()) }
        else if let mn, let mx { raw = Int(((mn + mx) / 2).rounded()) }
        else if let mn { raw = Int(mn.rounded()) }
        else if let mx { raw = Int(mx.rounded()) }
        else { raw = nil }
        return raw.flatMap { HRZone(rawValue: $0) }
    }

    private static func isPaceOrZone(_ t: Target?) -> Bool {
        switch t {
        case .pace, .hrZone: return true
        default: return false
        }
    }

    // MARK: - Formatters (mono, athlete-facing)

    private static func range(
        _ value: Double?, _ min: Double?, _ max: Double?,
        prefix: String = "", suffix: String = "", isKg: Bool = false
    ) -> String? {
        func n(_ d: Double) -> String {
            if isKg { return d.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(d))" : String(format: "%.1f", d) }
            return d.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(d))" : String(format: "%.1f", d)
        }
        if let v = value { return "\(prefix)\(n(v))\(suffix)" }
        if let lo = min, let hi = max { return "\(prefix)\(n(lo))–\(n(hi))\(suffix)" }
        if let lo = min { return "\(prefix)\(n(lo))+\(suffix)" }
        if let hi = max { return "\(prefix)≤\(n(hi))\(suffix)" }
        return nil
    }

    static func formatDistance(_ meters: Double) -> String? {
        guard meters > 0 else { return nil }
        if meters >= 1000 {
            let km = meters / 1000
            return km.truncatingRemainder(dividingBy: 1) == 0
                ? "\(Int(km)) km" : String(format: "%.1f km", km)
        }
        return "\(Int(meters.rounded())) m"
    }

    /// m:ss for a duration ≥ 1 min, else "Ns".
    static func formatClock(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        if m == 0 { return "\(s)s" }
        return String(format: "%d:%02d", m, s)
    }

    /// Rest reads "90s" under a minute, "2:00" / "2:30" at or above.
    static func formatRest(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }

    static func formatPace(_ secondsPerUnit: Int) -> String {
        let m = secondsPerUnit / 60
        let s = secondsPerUnit % 60
        return String(format: "%d:%02d", m, s)
    }
}
