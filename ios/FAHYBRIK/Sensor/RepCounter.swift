import Foundation

/// Period-based rep counter on the dominant motion axis (plan fase 2).
///
/// 1. Project samples onto the principal axis of acceleration (PCA 1D).
/// 2. Autocorrelate to find the period.
/// 3. Count peaks on that projection with a minimum spacing of ~0.6× period.
/// 4. Detect alternating-arm double-peak signature → low confidence, never "counted".
struct RepCounter: Sendable {
    /// Squat / wall-ball cycle is slower than a tremor — 0.35 s was counting
    /// chair stands and fidgets as reps (Alex, 11-ago: 5 fake reps standing up).
    var minPeriod: Double = 0.55
    /// Maximum period (seconds). Above this is not cyclic work.
    var maxPeriod: Double = 3.5
    /// Peak prominence as a fraction of the signal's robust amplitude.
    var prominenceFraction: Double = 0.35
    /// Fewer peaks than this → never "counted" (a sit-to-stand is 1–2 peaks).
    var minRepsForCounted: Int = 3
    /// Need this much continuous work (s) before trusting a count.
    var minWorkSeconds: Double = 4.0

    func count(samples: [SensorSample], workOnly: [(Double, Double)]? = nil) -> RepCountResult {
        let filtered = Self.filter(samples, to: workOnly)
        let workSpan = Self.spanSeconds(filtered)
        // Hard gate: short gestures (get up from a chair) never become a set.
        guard filtered.count >= 40, workSpan >= minWorkSeconds else {
            return RepCountResult(reps: 0, confidence: 0, level: .unknown, periodSeconds: nil, alternatingPattern: false)
        }

        let axis = Self.dominantAxis(filtered)
        let projected = filtered.map { $0.ax * axis.0 + $0.ay * axis.1 + $0.az * axis.2 }
        let dt = ActivityDetector.medianDt(filtered)
        guard let period = Self.estimatePeriod(projected, dt: dt, minPeriod: minPeriod, maxPeriod: maxPeriod) else {
            return RepCountResult(reps: 0, confidence: 0.1, level: .unknown, periodSeconds: nil, alternatingPattern: false)
        }

        let peaks = Self.findPeaks(projected, dt: dt, period: period, prominenceFraction: prominenceFraction)
        let alternating = Self.looksAlternating(peaks: peaks, period: period, dt: dt)
        let reps = alternating ? max(0, (peaks.count + 1) / 2) : peaks.count

        let regularity = Self.periodRegularity(peaks: peaks, period: period, dt: dt)
        let peakClarity = Self.peakClarity(projected, peaks: peaks)
        var confidence = 0.45 * regularity + 0.55 * peakClarity
        if alternating { confidence = min(confidence, 0.40) }
        if reps == 0 { confidence = 0 }
        // Too few cycles: a stand-up can look like 2 "reps". Cap confidence.
        if reps < minRepsForCounted { confidence = min(confidence, 0.35) }

        let level: RepConfidenceLevel
        if alternating || confidence < 0.50 || reps < minRepsForCounted {
            level = confidence < 0.30 || reps == 0 ? .unknown : .doubtful
        } else if confidence >= 0.88 && reps >= minRepsForCounted {
            level = .counted
        } else if confidence >= 0.50 {
            level = .doubtful
        } else {
            level = .unknown
        }

        // Hard rule: alternating pattern NEVER delivered as high confidence.
        let safeLevel: RepConfidenceLevel = (alternating && level == .counted) ? .doubtful : level

        return RepCountResult(
            reps: reps,
            confidence: confidence,
            level: safeLevel,
            periodSeconds: period,
            alternatingPattern: alternating
        )
    }

    static func spanSeconds(_ samples: [SensorSample]) -> Double {
        guard let first = samples.first, let last = samples.last else { return 0 }
        return max(0, last.t - first.t)
    }

    // MARK: - axis / period / peaks

    static func dominantAxis(_ samples: [SensorSample]) -> (Double, Double, Double) {
        // Covariance of acceleration about its mean → first eigenvector via power iteration.
        let n = Double(samples.count)
        let mx = samples.reduce(0.0) { $0 + $1.ax } / n
        let my = samples.reduce(0.0) { $0 + $1.ay } / n
        let mz = samples.reduce(0.0) { $0 + $1.az } / n
        var cxx = 0.0, cxy = 0.0, cxz = 0.0, cyy = 0.0, cyz = 0.0, czz = 0.0
        for s in samples {
            let x = s.ax - mx, y = s.ay - my, z = s.az - mz
            cxx += x * x; cxy += x * y; cxz += x * z
            cyy += y * y; cyz += y * z; czz += z * z
        }
        var vx = 1.0, vy = 0.0, vz = 0.0
        for _ in 0..<12 {
            let nx = cxx * vx + cxy * vy + cxz * vz
            let ny = cxy * vx + cyy * vy + cyz * vz
            let nz = cxz * vx + cyz * vy + czz * vz
            let norm = sqrt(nx * nx + ny * ny + nz * nz)
            if norm < 1e-9 { return (1, 0, 0) }
            vx = nx / norm; vy = ny / norm; vz = nz / norm
        }
        return (vx, vy, vz)
    }

    static func estimatePeriod(_ signal: [Double], dt: Double, minPeriod: Double, maxPeriod: Double) -> Double? {
        guard signal.count > 8, dt > 0 else { return nil }
        let minLag = Swift.max(1, Int((minPeriod / dt).rounded(.down)))
        let maxLag = Swift.min(signal.count / 2, Int((maxPeriod / dt).rounded(.up)))
        guard maxLag > minLag else { return nil }

        let mean = signal.reduce(0, +) / Double(signal.count)
        let centered = signal.map { $0 - mean }
        var bestLag = minLag
        var bestCorr = -Double.infinity
        for lag in minLag...maxLag {
            var num = 0.0, den0 = 0.0, den1 = 0.0
            let n = centered.count - lag
            for i in 0..<n {
                let a = centered[i]
                let b = centered[i + lag]
                num += a * b
                den0 += a * a
                den1 += b * b
            }
            let den = sqrt(den0 * den1)
            let corr = den > 1e-12 ? num / den : 0
            if corr > bestCorr {
                bestCorr = corr
                bestLag = lag
            }
        }
        guard bestCorr > 0.15 else { return nil }
        return Double(bestLag) * dt
    }

    static func findPeaks(_ signal: [Double], dt: Double, period: Double, prominenceFraction: Double) -> [Int] {
        guard signal.count > 2 else { return [] }
        let sorted = signal.sorted()
        let lo = sorted[sorted.count / 10]
        let hi = sorted[(sorted.count * 9) / 10]
        let amp = max(1e-6, hi - lo)
        let prom = amp * prominenceFraction
        let minGap = Swift.max(1, Int(((period * 0.6) / dt).rounded(.down)))

        var peaks: [Int] = []
        var i = 1
        while i < signal.count - 1 {
            if signal[i] >= signal[i - 1] && signal[i] > signal[i + 1] {
                // local prominence vs neighbors in ±period/2
                let w = Swift.max(1, Int((period * 0.5 / dt).rounded()))
                let loI = Swift.max(0, i - w)
                let hiI = Swift.min(signal.count - 1, i + w)
                let localMin = signal[loI...hiI].min() ?? signal[i]
                if signal[i] - localMin >= prom {
                    if let last = peaks.last {
                        if i - last >= minGap {
                            peaks.append(i)
                        } else if signal[i] > signal[last] {
                            peaks[peaks.count - 1] = i
                        }
                    } else {
                        peaks.append(i)
                    }
                }
            }
            i += 1
        }
        return peaks
    }

    /// Alternating arms produce a double-peak per cycle (left + right).
    static func looksAlternating(peaks: [Int], period: Double, dt: Double) -> Bool {
        guard peaks.count >= 4, dt > 0 else { return false }
        var gaps: [Double] = []
        for i in 1..<peaks.count {
            gaps.append(Double(peaks[i] - peaks[i - 1]) * dt)
        }
        let half = period * 0.5
        let nearHalf = gaps.filter { abs($0 - half) < period * 0.18 }.count
        return Double(nearHalf) / Double(gaps.count) >= 0.55
    }

    static func periodRegularity(peaks: [Int], period: Double, dt: Double) -> Double {
        guard peaks.count >= 3, dt > 0, period > 0 else { return 0 }
        var errs: [Double] = []
        for i in 1..<peaks.count {
            let gap = Double(peaks[i] - peaks[i - 1]) * dt
            errs.append(abs(gap - period) / period)
        }
        let meanErr = errs.reduce(0, +) / Double(errs.count)
        return max(0, min(1, 1 - meanErr))
    }

    static func peakClarity(_ signal: [Double], peaks: [Int]) -> Double {
        guard !peaks.isEmpty, !signal.isEmpty else { return 0 }
        let sorted = signal.sorted()
        let lo = sorted[sorted.count / 10]
        let hi = sorted[(sorted.count * 9) / 10]
        let amp = max(1e-6, hi - lo)
        let heights = peaks.map { signal[$0] - lo }
        let meanH = heights.reduce(0, +) / Double(heights.count)
        return max(0, min(1, meanH / amp))
    }

    static func filter(_ samples: [SensorSample], to windows: [(Double, Double)]?) -> [SensorSample] {
        guard let windows, !windows.isEmpty else { return samples }
        return samples.filter { s in
            windows.contains { s.t >= $0.0 && s.t <= $0.1 }
        }
    }
}
