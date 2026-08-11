import Foundation

/// Concentric bar velocity from wrist acceleration (plan fase 3).
///
/// Integrates the dominant-axis acceleration during the concentric half of each
/// rep, zero-velocity-updating at turnarounds. Validated literature exists for
/// squat with watch-on-wrist; heavy loads degrade — confidence reflects that.
struct BarVelocityEstimator: Sendable {
    var minPeriod: Double = 0.4
    var maxPeriod: Double = 4.0

    func estimate(samples: [SensorSample], workOnly: [(Double, Double)]? = nil) -> BarVelocityResult? {
        let filtered = RepCounter.filter(samples, to: workOnly)
        guard filtered.count >= 20 else { return nil }

        let axis = RepCounter.dominantAxis(filtered)
        let projected = filtered.map { $0.ax * axis.0 + $0.ay * axis.1 + $0.az * axis.2 }
        let dt = ActivityDetector.medianDt(filtered)
        guard let period = RepCounter.estimatePeriod(projected, dt: dt, minPeriod: minPeriod, maxPeriod: maxPeriod) else {
            return nil
        }

        // Remove gravity-ish bias on the projection (mean over the window).
        let mean = projected.reduce(0, +) / Double(projected.count)
        let linear = projected.map { $0 - mean }

        let peaks = RepCounter.findPeaks(linear, dt: dt, period: period, prominenceFraction: 0.2)
        guard peaks.count >= 2 else { return nil }

        // Turnarounds ≈ midpoints between consecutive peaks (eccentric↔concentric).
        var velocities: [Double] = []
        var roms: [Double] = []
        for i in 0..<(peaks.count - 1) {
            let a = peaks[i]
            let b = peaks[i + 1]
            guard b > a + 1 else { continue }
            // Integrate |v| over half-cycle with ZVU at ends.
            var v = 0.0
            var pos = 0.0
            var maxPos = 0.0
            var minPos = 0.0
            var sumAbsV = 0.0
            var n = 0
            for j in a..<b {
                let acc = linear[j]
                v += acc * dt
                pos += v * dt
                maxPos = max(maxPos, pos)
                minPos = min(minPos, pos)
                sumAbsV += abs(v)
                n += 1
            }
            // Zero-velocity update: end of rep should be still.
            // Mean concentric speed ≈ ROM / half-period.
            let rom = maxPos - minPos
            let halfT = Double(b - a) * dt
            guard halfT > 0.05, rom > 0.05 else { continue }
            let meanV = rom / halfT
            velocities.append(meanV)
            roms.append(rom)
        }

        guard velocities.count >= 2 else { return nil }
        let first = velocities[0]
        let last = velocities[velocities.count - 1]
        let loss = first > 1e-6 ? max(0, (first - last) / first * 100) : 0
        let meanRom = roms.reduce(0, +) / Double(roms.count)

        // Confidence: more reps + stable periods + non-tiny ROM.
        let regularity = RepCounter.periodRegularity(peaks: peaks, period: period, dt: dt)
        let romScore = min(1, meanRom / 0.4) // ~40 cm is a solid squat ROM
        let conf = max(0, min(1, 0.5 * regularity + 0.3 * romScore + 0.2 * min(1, Double(velocities.count) / 5)))

        return BarVelocityResult(
            meanVelocityFirst: first,
            meanVelocityLast: last,
            velocityLossPct: loss,
            romMeters: meanRom,
            confidence: conf,
            repVelocities: velocities
        )
    }
}
