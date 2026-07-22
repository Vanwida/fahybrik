import Foundation

// Resolves the belt speed we DISPLAY — and the pace we derive from it — for an FTMS
// treadmill whose Instantaneous Speed field can't be trusted at face value.
//
// THE FIELD BUG IT FIXES: on his BH / Exercycle i.Concept (`T01_8BDCE`) the Treadmill
// Data (0x2ACD) Instantaneous Speed field reads 0.00 km/h while the belt is genuinely
// running from the machine's OWN console — yet the Total Distance odometer keeps climbing
// (5 m → 6 m in a second ⇒ ~3.6 km/h). A naive readout then shows "0.0 km/h" and a
// "—:—" pace that flickers as odd packets slip through. This resolver reads the belt's
// real speed honestly and keeps the pace stable.
//
// PRECEDENCE (most trustworthy first):
//   1. a LIVE Instantaneous Speed (the latest packet says the belt is moving) — smoothed
//      over a short window so a single jittery packet can't spike the pace;
//   2. else a speed DERIVED from the advancing odometer (Δdistance / Δtime) — the machine's
//      own measurement, the very signal we already trust for covered meters, differentiated
//      instead of integrated;
//   3. else the Average Speed field, when a packet carries one.
// When the latest packet says ~0 AND the odometer is flat, the belt is genuinely stopped
// and we report 0 promptly (so START/STOP stays honest and the pace drops to "—:—" only
// after the belt is really still — never a flicker mid-run).
//
// Pure and deterministic (a `Date` per reading, no clock of its own) so it's unit-testable.
struct TreadmillSpeedResolver {
    /// Rolling window (s) the displayed speed is smoothed / derived over. Long enough to
    /// kill packet-to-packet jitter (the source of the RITMO flicker), short enough to
    /// track a real change in belt speed within a stride or two.
    static let windowSeconds: TimeInterval = 2.5
    /// Below this the belt counts as stopped — shared with the rest of the HUD so every
    /// surface draws the "moving?" line in the same place.
    static var minMovingKmh: Double { TreadmillConstants.minMovingSpeedKmh }
    /// The odometer-derived speed needs at least this much elapsed time across the window,
    /// or a single coarse 1 m odometer tick would read as an enormous instantaneous spike.
    static let minDerivationDtSeconds: TimeInterval = 0.6

    private struct Reading: Equatable {
        var t: Date
        var instKmh: Double?
        var odometerM: Double?
    }
    private var window: [Reading] = []
    /// The most recent Average Speed the belt sent (kept outside the window — it arrives
    /// only on some packets, and it's a last-resort fallback, not a smoothing input).
    private var lastAvgKmh: Double?

    /// Feed one telemetry sample. Old readings beyond `windowSeconds` are pruned relative
    /// to this sample's own timestamp (the resolver has no clock of its own).
    mutating func ingest(instantaneousKmh: Double?, avgKmh: Double?, odometerM: Double?, at: Date) {
        if let avg = avgKmh { lastAvgKmh = avg }
        window.append(Reading(t: at, instKmh: instantaneousKmh, odometerM: odometerM))
        let cutoff = at.addingTimeInterval(-Self.windowSeconds)
        window.removeAll { $0.t < cutoff }
    }

    /// The belt speed to DISPLAY (km/h). `nil` only before any telemetry has landed (the
    /// tile then shows "—"); once data flows it returns a real number, 0 when stopped.
    var displaySpeedKmh: Double? {
        guard let last = window.last else { return nil }
        // 1) The latest packet says the belt is moving → trust it, smoothed.
        if let inst = last.instKmh, inst > Self.minMovingKmh {
            return smoothedInstantaneousKmh ?? inst
        }
        // 2) Instantaneous reads ~0 but the odometer is advancing → derive from it.
        if let derived = odometerDerivedKmh, derived > Self.minMovingKmh {
            return derived
        }
        // 3) No usable odometer signal AT ALL (the belt sends no Total Distance) → the
        // Average Speed field is the last real number. Gated on the odometer being absent so
        // a belt WITH an odometer that reads flat is correctly seen as stopped below (the
        // session-average field lingers above 0 after a stop and must not fake movement).
        if odometerDerivedKmh == nil, let avg = lastAvgKmh, avg > Self.minMovingKmh {
            return avg
        }
        // Genuinely stopped (or no movement signal at all): 0, promptly.
        return 0
    }

    /// Live pace (sec/km) from the displayed speed, or `nil` when the belt is stopped — so
    /// the hero shows "—:—" only after sustained stillness, never as a mid-run flicker.
    var paceSecPerKm: Int? {
        guard let kmh = displaySpeedKmh, kmh >= Self.minMovingKmh else { return nil }
        return Int((3600.0 / kmh).rounded())
    }

    // MARK: - Derivations

    /// Mean of the NON-ZERO instantaneous readings in the window (zeros are the very glitch
    /// we're smoothing over). `nil` when the window holds no moving instantaneous sample.
    private var smoothedInstantaneousKmh: Double? {
        let moving = window.compactMap { $0.instKmh }.filter { $0 > Self.minMovingKmh }
        guard !moving.isEmpty else { return nil }
        return moving.reduce(0, +) / Double(moving.count)
    }

    /// Δodometer / Δtime across the window, in km/h. `nil` when there aren't two odometer
    /// readings far enough apart in time, or the odometer went backwards (a reconnect /
    /// machine reset) — never a negative or spike speed.
    private var odometerDerivedKmh: Double? {
        let odo = window.compactMap { r -> (t: Date, m: Double)? in
            r.odometerM.map { (r.t, $0) }
        }
        guard let first = odo.first, let last = odo.last else { return nil }
        let dt = last.t.timeIntervalSince(first.t)
        let dm = last.m - first.m
        guard dt >= Self.minDerivationDtSeconds, dm >= 0 else { return nil }
        return (dm / dt) * 3.6
    }
}
