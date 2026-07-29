import Foundation

// How seconds-per-zone become a bar — THE one place. Pure Foundation, so the
// engine (shared with the watch) and the iPhone's views read the same maths.
//
// WHY THIS FILE EXISTS
// --------------------
// Zone seconds only accumulate while the engine HAS a live zone: a strap feeding
// samples AND a threshold to classify them against (`WorkoutSession.tick` — the
// clock advances every tick, `lapZoneAccumSec` only when `liveZone != nil`). So
// the seconds we bucket are always a SUBSET of the time trained, and how big
// that subset is is itself information the athlete is owed.
//
// Until 29-jul-2026 four surfaces each normalised those seconds over their own
// SUM, which makes any coverage — 100 % or 40 % — read as a full workout.
// Measured on execution 162 (athlete 64, production): 236 s in Z1 + 246 s in Z2
// over a 572 s session painted "Z1 49 % · Z2 51 %". A bar that claims the whole
// session while covering 84 % of it. The seconds were never wrong; the BASE was.
// And a total of 100 is precisely what stops anyone from checking — it is a
// harder lie to see than a wrong number. (§7 of `docs/CONTRATO-UI.md`.)
//
// THE FIX IS STRUCTURAL, NOT ARITHMETIC. The unmeasured remainder is a BAND OF
// THE ARRAY, not something each caller remembers to append: a surface that loops
// over `bands` paints the truth without having to know the hole exists. That is
// what stops the four copies from drifting apart again.
//
// ONE NUMBER PER BAND. `pct` drives the bar's geometry AND its legend, so the
// width on screen and the figure under it can never disagree. The percentages
// are allocated by largest remainder over the WINDOW, so what is listed adds up
// to exactly 100 — over the real base this time.
struct ZoneCoverage: Equatable {

    /// The legend's word for time trained with no pulse. Not in `Vocab` because
    /// this file compiles into the watch target, which has no Theme layer.
    static let unknownLabel = "Sin pulso"

    /// What a slice of the bar is. `.unknown` carries the same units and the same
    /// maths as a zone, which is the whole point: it cannot be forgotten.
    enum Kind: Equatable {
        case measured(HRZone)
        case unknown
    }

    struct Band: Equatable, Identifiable {
        let kind: Kind
        /// Seconds in this band.
        let seconds: Double
        /// Share of the WINDOW, 1…100. Drives both the width and the legend.
        let pct: Int

        var id: String {
            switch kind {
            case .measured(let zone): return zone.label
            case .unknown: return "sin-pulso"
            }
        }

        /// The legend's leading word — "Z2" or "Sin pulso".
        var label: String {
            switch kind {
            case .measured(let zone): return zone.label
            case .unknown: return ZoneCoverage.unknownLabel
            }
        }

        /// The zone this band measured; nil for the unmeasured remainder.
        var zone: HRZone? {
            if case .measured(let zone) = kind { return zone }
            return nil
        }
    }

    /// Zones in order, the unmeasured remainder last. Only bands that reach 1 %:
    /// a band the bar cannot draw has no business in the legend either, and
    /// "Z5 0 %" is a measured value painted as a zero (§6.2 bis). Never empty —
    /// `read` returns nil rather than hand back a bar with nothing in it.
    let bands: [Band]

    /// True when part of the window had no pulse. The bar already says so; this
    /// is for callers that must qualify a claim they derive from it.
    var hasUnknown: Bool { bands.contains { $0.kind == .unknown } }

    // MARK: - Reading

    /// Read a zone partition against the window it was measured over.
    ///
    /// - Parameters:
    ///   - zoneSeconds: seconds keyed by `HRZone.rawValue`, as the engine accumulates them.
    ///   - windowSeconds: the time the athlete actually trained in that window.
    /// - Returns: nil when nothing was measured. The caller then paints NO bar —
    ///   not an empty one, which would insinuate a reading we do not have (§7).
    static func read(zoneSeconds: [Int: Double], windowSeconds: Double) -> ZoneCoverage? {
        let measuredBands: [(Kind, Double)] = HRZone.allCases.compactMap { zone in
            let seconds = zoneSeconds[zone.rawValue] ?? 0
            return seconds > 0 ? (Kind.measured(zone), seconds) : nil
        }
        let measured = measuredBands.reduce(0.0) { $0 + $1.1 }
        guard measured > 0 else { return nil }

        // A window shorter than what we measured means a clock we trust LESS than
        // the accumulation (a segment closed a tick early, seconds rounded on
        // save). Widening it to the measured total is the only reading that can
        // neither overflow the bar nor invent a negative hole, and it costs at
        // most that rounding. It never HIDES a hole: a real one makes the window
        // the larger of the two.
        let window = Swift.max(windowSeconds, measured)
        let unknown = window - measured
        // The remainder always goes in, however small, so the values handed to
        // `allocate` add up to the window exactly. A hole too small to reach 1 %
        // is then dropped by the same rule that drops a zone too small to reach
        // it — one criterion, not a second threshold to keep in sync.
        let parts = unknown > 0 ? measuredBands + [(Kind.unknown, unknown)] : measuredBands

        let pcts = allocate(parts.map(\.1), over: window)
        let bands = zip(parts, pcts)
            .filter { $0.1 > 0 }
            .map { Band(kind: $0.0.0, seconds: $0.0.1, pct: $0.1) }
        guard !bands.isEmpty else { return nil }
        return ZoneCoverage(bands: bands)
    }

    /// The same reading over a set of logged laps: the zones they accumulated,
    /// against the time they actually took. Deriving the window here — and not
    /// at each call site — is what keeps the summary and the celebration from
    /// measuring the same session against two different clocks.
    static func read(laps: [LapRecord]) -> ZoneCoverage? {
        var byZone: [Int: Double] = [:]
        for lap in laps {
            for (zone, seconds) in lap.zoneSecondsByZone { byZone[zone, default: 0] += seconds }
        }
        let window = laps.reduce(0.0) { $0 + $1.durationSeconds }
        return read(zoneSeconds: byZone, windowSeconds: window)
    }

    /// The same reading from the wire shape (`raw_lap_data_json.zone_seconds`,
    /// keyed "z1"…"z5") the server serves back on a saved execution.
    static func read(zoneSecondsByKey: [String: Int], windowSeconds: Double) -> ZoneCoverage? {
        var byZone: [Int: Double] = [:]
        for (key, seconds) in zoneSecondsByKey {
            guard key.hasPrefix("z"), let raw = Int(key.dropFirst()), HRZone(rawValue: raw) != nil else { continue }
            byZone[raw, default: 0] += Double(seconds)
        }
        return read(zoneSeconds: byZone, windowSeconds: windowSeconds)
    }

    // MARK: - Percentages

    /// Whole percentages of `total` that add up to exactly 100, by largest
    /// remainder. Rounding each band on its own lands the legend on 99 or 101,
    /// which reads as a bug on the one screen whose whole subject is a total
    /// that can be trusted.
    private static func allocate(_ values: [Double], over total: Double) -> [Int] {
        guard total > 0 else { return values.map { _ in 0 } }
        let exact = values.map { $0 / total * 100 }
        var pcts = exact.map { Int($0.rounded(.down)) }
        var left = 100 - pcts.reduce(0, +)
        guard left > 0 else { return pcts }
        // Ties broken by position so the same input always yields the same bar.
        let byRemainder = exact.indices.sorted {
            let a = exact[$0] - Double(pcts[$0]), b = exact[$1] - Double(pcts[$1])
            return a == b ? $0 < $1 : a > b
        }
        for index in byRemainder where left > 0 {
            pcts[index] += 1
            left -= 1
        }
        return pcts
    }
}
