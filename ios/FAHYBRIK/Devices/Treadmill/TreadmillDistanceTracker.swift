import Foundation

// Belt telemetry → covered-metre INCREMENTS. Pure, no CoreBluetooth, no view: feed
// it raw `TreadmillSample`s in order and it answers "how many metres since the last
// one", which is the only question every consumer actually has.
//
// WHY A TYPE AND NOT A METHOD ON THE HUD. This logic used to live inside
// `TreadmillHUDModel`, which is a VIEW MODEL — it exists only while the treadmill
// cover is on screen. That made the belt's data a property of WHICH SCREEN WAS OPEN:
// a run minute inside an EMOM (remo → ski → cinta) never opens that cover, so the
// belt streamed happily and the session recorded nothing (4-ago: "el FTMS se ha
// conectado pero no ha recibido información"). Now the increment logic is a type both
// the always-on session feeder and the HUD's own ring use, so neither duplicates it
// and the recording no longer depends on a cover being presented.
//
// TWO WAYS A BELT REPORTS DISTANCE, and both are handled here:
//   · Its cumulative odometer (FTMS Total Distance) — preferred WHILE IT ADVANCES.
//   · Speed × time — the fallback for belts that report no odometer at all, and for
//     the ones whose odometer is frozen/broken while the band clearly runs (common on
//     OEM belts; it would otherwise freeze covered metres at zero with speed reading
//     fine). The stall count resets the moment the odometer moves, so a healthy
//     machine always wins.
struct TreadmillDistanceTracker {

    /// Never integrate more than this much wall time from one sample — a gap that big
    /// means the stream stalled (backgrounded, dropped link), and treating it as
    /// continuous running would invent metres nobody covered.
    static let maxIntegrationStepSeconds: TimeInterval = 5

    /// The last odometer reading seen, whether or not it was trusted — so a belt whose
    /// odometer revives after a stall resumes from where it actually is instead of
    /// dumping the whole frozen interval in at once.
    private var lastOdometerM: Double?
    private var odometerStalledSamples = 0
    private var lastSampleAt: Date?

    init() {}

    /// Forget the belt's history (a new machine, a fresh session). The next sample
    /// then establishes the zero and contributes nothing, which is correct: one
    /// reading alone measures no distance.
    mutating func reset() {
        lastOdometerM = nil
        odometerStalledSamples = 0
        lastSampleAt = nil
    }

    /// Metres covered between the previous sample and this one. Zero when nothing can
    /// be derived honestly (first sample, belt still, no usable field) — never a
    /// guess, and never negative.
    mutating func increment(from sample: TreadmillSample) -> Double {
        let dt = lastSampleAt.map { sample.lastUpdate.timeIntervalSince($0) } ?? 0
        defer { lastSampleAt = sample.lastUpdate }

        if let total = sample.totalDistanceM {
            let trusted = noteOdometer(total, speedKmh: sample.speedKmh)
            let previous = lastOdometerM
            lastOdometerM = total
            // The first reading is this belt's zero, not a distance.
            if trusted, let previous { return Swift.max(0, total - previous) }
            if trusted { return 0 }
        }
        // No odometer, or one we've proven is frozen while the band runs → integrate.
        guard let kmh = sample.speedKmh else { return 0 }
        return TreadmillMath.advanceDistance(
            0, speedKmh: kmh, dt: Swift.min(dt, Self.maxIntegrationStepSeconds)
        )
    }

    /// Can the odometer be trusted for THIS sample? Trusted while it advances; once
    /// the belt is clearly moving but the reading sits flat for
    /// `odometerStallGraceSamples`, we stop trusting it and let the caller integrate.
    /// A flat odometer while the belt is STILL is correct, not broken, so it keeps its
    /// trust (integrating would add nothing anyway).
    private mutating func noteOdometer(_ total: Double, speedKmh: Double?) -> Bool {
        guard let last = lastOdometerM else {
            odometerStalledSamples = 0
            return true
        }
        if total > last + TreadmillConstants.odometerAdvanceEpsilonM {
            odometerStalledSamples = 0
            return true
        }
        guard (speedKmh ?? 0) > TreadmillConstants.minMovingSpeedKmh else { return true }
        odometerStalledSamples += 1
        return odometerStalledSamples < TreadmillConstants.odometerStallGraceSamples
    }
}
