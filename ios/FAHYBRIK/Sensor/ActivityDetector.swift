import Foundation

/// Work/rest detector from wrist acceleration energy.
///
/// Method (plan fase 1): accel-norm → smooth → relative threshold with hysteresis
/// + three-window agreement before state flips. Threshold is relative to the
/// resting baseline observed in the first seconds of the window — a burpee and a
/// curl do not share the same absolute energy.
struct ActivityDetector: Sendable {
    /// Smoothing half-window in samples (at 50 Hz, 5 ≈ 100 ms).
    var smoothRadius: Int = 5
    /// Samples that must agree before a state change (plan: three windows).
    var agreementWindows: Int = 3
    /// Multiplier over baseline for rising edge.
    var riseFactor: Double = 2.4
    /// Multiplier over baseline for falling edge (lower → hysteresis).
    var fallFactor: Double = 1.6
    /// Seconds used to estimate resting baseline at the start of a tramo.
    var baselineSeconds: Double = 2.0
    /// Floor on baseline so a silent sensor doesn't zero the threshold.
    var baselineFloor: Double = 0.4

    func analyze(_ samples: [SensorSample]) -> ActivityTimingResult {
        guard samples.count >= 3 else {
            return ActivityTimingResult(workSeconds: 0, restSeconds: 0, confidence: 0, workIntervals: [])
        }

        let norms = samples.map(\.accelNorm)
        let smoothed = Self.movingAverage(norms, radius: smoothRadius)
        let dt = Self.medianDt(samples)
        let baseline = Self.baseline(smoothed, samples: samples, seconds: baselineSeconds, floor: baselineFloor)
        let rise = max(baseline * riseFactor, baseline + 0.3)
        let fall = max(baseline * fallFactor, baseline + 0.15)

        var working = false
        var agree = 0
        var pending: Bool?
        var intervals: [(Double, Double)] = []
        var openT: Double?

        for i in smoothed.indices {
            let wantWork = working ? (smoothed[i] >= fall) : (smoothed[i] >= rise)
            if wantWork == working {
                agree = 0
                pending = nil
            } else if pending == wantWork {
                agree += 1
                if agree >= agreementWindows {
                    working = wantWork
                    agree = 0
                    pending = nil
                    if working {
                        openT = samples[i].t
                    } else if let t0 = openT {
                        intervals.append((t0, samples[i].t))
                        openT = nil
                    }
                }
            } else {
                pending = wantWork
                agree = 1
            }
        }
        if let t0 = openT, let last = samples.last {
            intervals.append((t0, last.t))
        }

        let total = max(0, (samples.last?.t ?? 0) - (samples.first?.t ?? 0))
        let work = intervals.reduce(0.0) { $0 + max(0, $1.1 - $1.0) }
        let rest = max(0, total - work)

        // Confidence: fraction of time not sitting on the threshold band + enough samples.
        let bandHits = zip(smoothed, smoothed).filter { abs($0.0 - rise) < 0.05 * rise || abs($0.0 - fall) < 0.05 * fall }.count
        let bandFrac = Double(bandHits) / Double(max(1, smoothed.count))
        let coverage = min(1, Double(samples.count) * dt / max(1, total + 0.001))
        let confidence = max(0, min(1, (1 - bandFrac) * 0.7 + coverage * 0.3))

        return ActivityTimingResult(
            workSeconds: work,
            restSeconds: rest,
            confidence: confidence,
            workIntervals: intervals
        )
    }

    // MARK: - helpers

    static func movingAverage(_ values: [Double], radius: Int) -> [Double] {
        guard !values.isEmpty else { return [] }
        let r = max(0, radius)
        var out = [Double](repeating: 0, count: values.count)
        for i in values.indices {
            let lo = max(0, i - r)
            let hi = min(values.count - 1, i + r)
            var s = 0.0
            for j in lo...hi { s += values[j] }
            out[i] = s / Double(hi - lo + 1)
        }
        return out
    }

    static func medianDt(_ samples: [SensorSample]) -> Double {
        guard samples.count >= 2 else { return 1.0 / SensorFileFormat.targetHz }
        var dts: [Double] = []
        dts.reserveCapacity(samples.count - 1)
        for i in 1..<samples.count {
            let d = samples[i].t - samples[i - 1].t
            if d > 0 { dts.append(d) }
        }
        guard !dts.isEmpty else { return 1.0 / SensorFileFormat.targetHz }
        dts.sort()
        return dts[dts.count / 2]
    }

    static func baseline(_ smoothed: [Double], samples: [SensorSample], seconds: Double, floor: Double) -> Double {
        guard let t0 = samples.first?.t else { return floor }
        var vals: [Double] = []
        for i in samples.indices where samples[i].t - t0 <= seconds {
            vals.append(smoothed[i])
        }
        guard !vals.isEmpty else { return floor }
        vals.sort()
        // Use lower quartile — rest is the quiet part, not the mean of fidgeting.
        let q = vals[max(0, vals.count / 4)]
        return max(floor, q)
    }
}
