import Foundation

/// Live outdoor pace from phone GPS (#64). CoreLocation's per-fix `speed` is too
/// jittery to show raw, so this pure smoother averages the trustworthy speed fixes
/// over a short rolling window → a stable-but-responsive sec/km. It is deliberately
/// HONEST: a fix whose speed-accuracy CoreLocation can't vouch for is dropped, and
/// when there's no trustworthy recent speed the pace is `nil` — nunca un número
/// inventado. Quien pinta enseña entonces la RAZÓN (`GPSSignalQuality.label`), que
/// es lo único accionable. It also exposes the smoothed SPEED for auto-pause —
/// distinct from pace, because a confident near-zero speed is a valid "stopped"
/// reading that pace intentionally suppresses.
struct RunPaceSmoother {
    /// Rolling window (seconds) the live pace is averaged over — long enough to kill
    /// GPS jitter, short enough to react when the athlete changes gear. ~10 s is the
    /// band running watches settle on.
    static let windowSeconds: TimeInterval = 10
    /// Shorter window (seconds) for the auto-pause SPEED signal: a stop must register
    /// in a few seconds, not lag behind the 10 s pace average. The auto-pause dwell
    /// adds the debounce on top, so 3 s of raw fixes is enough to see a real stop.
    static let speedWindowSeconds: TimeInterval = 3
    /// A speed fix is trusted only when CoreLocation's own speed-accuracy is at/under
    /// this (m/s); above it (or negative = invalid) the sample is dropped. Con la
    /// señal floja no hay ritmo, y se dice que se está buscando.
    static let maxSpeedAccuracyMps: Double = 2.0
    /// Below this speed (m/s ≈ 2.5 km/h) the athlete is walking or stopped; a pace
    /// derived from it reads as an absurd number, so no pace is published at all.
    static let minPaceSpeedMps: Double = 0.7

    private var samples: [(t: TimeInterval, speed: Double)] = []

    /// Feed one GPS fix. `speedMps` / `speedAccuracyMps` are CoreLocation's values
    /// (negative = invalid). A distrusted fix is discarded; trusted ones join the
    /// window and old ones are pruned.
    mutating func ingest(speedMps: Double, speedAccuracyMps: Double, now: TimeInterval) {
        guard speedMps >= 0,
              speedAccuracyMps >= 0, speedAccuracyMps <= Self.maxSpeedAccuracyMps else { return }
        samples.append((now, speedMps))
        let cutoff = now - Self.windowSeconds
        samples.removeAll { $0.t < cutoff }
    }

    /// The smoothed live pace (sec/km), or `nil` when there is no trustworthy recent
    /// speed OR the athlete is essentially stopped → el HUD enseña la razón, no la
    /// cifra. Averaged over the full pace window.
    func paceSecPerKm(now: TimeInterval) -> Int? {
        guard let avg = averageSpeed(now: now, window: Self.windowSeconds),
              avg >= Self.minPaceSpeedMps else { return nil }
        return Int((1000.0 / avg).rounded())
    }

    /// The recent speed (m/s) for auto-pause over the SHORT window, or `nil` when no
    /// trustworthy sample (so auto-pause never fires on signal loss — only on a
    /// confident stop). Shorter window than pace so a stop registers promptly.
    func speedMps(now: TimeInterval) -> Double? {
        averageSpeed(now: now, window: Self.speedWindowSeconds)
    }

    private func averageSpeed(now: TimeInterval, window: TimeInterval) -> Double? {
        let cutoff = now - window
        let recent = samples.filter { $0.t >= cutoff }
        guard !recent.isEmpty else { return nil }
        return recent.reduce(0) { $0 + $1.speed } / Double(recent.count)
    }
}
