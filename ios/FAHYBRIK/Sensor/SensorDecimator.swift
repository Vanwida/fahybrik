import Foundation

/// Downsamples a high-rate stream to a fixed target rate by box-averaging
/// within each output bin. Pure: no clocks, no CoreMotion.
struct SensorDecimator: Sendable {
    let targetHz: Double
    private var binStart: Double?
    private var sumAx = 0.0, sumAy = 0.0, sumAz = 0.0
    private var sumGx = 0.0, sumGy = 0.0, sumGz = 0.0
    private var count = 0
    private var lastEmittedT: Double = -.infinity

    init(targetHz: Double = SensorFileFormat.targetHz) {
        self.targetHz = max(1, targetHz)
    }

    private var binWidth: Double { 1.0 / targetHz }

    /// Feed one raw sample (any rate). Returns 0…N decimated samples ready to archive/process.
    mutating func push(t: Double, ax: Double, ay: Double, az: Double,
                       gx: Double, gy: Double, gz: Double) -> [SensorSample] {
        if binStart == nil { binStart = t }
        guard let start = binStart else { return [] }

        var out: [SensorSample] = []
        // Advance bins until this sample falls inside the current bin.
        while t >= start + binWidth {
            if count > 0 {
                let mid = start + binWidth * 0.5
                if mid > lastEmittedT {
                    out.append(flushBin(at: mid))
                    lastEmittedT = mid
                } else {
                    resetBin()
                }
            }
            binStart = (binStart ?? start) + binWidth
            guard let newStart = binStart else { break }
            if t < newStart + binWidth { break }
            // empty bins between sparse samples are skipped (no fabricated zeros)
            if count == 0 && t >= newStart + binWidth {
                binStart = newStart + binWidth
            } else {
                break
            }
        }

        sumAx += ax; sumAy += ay; sumAz += az
        sumGx += gx; sumGy += gy; sumGz += gz
        count += 1
        return out
    }

    /// Flush any partial bin (call on session end).
    mutating func finish() -> [SensorSample] {
        guard count > 0, let start = binStart else { return [] }
        let mid = start + binWidth * 0.5
        let sample = flushBin(at: mid)
        return [sample]
    }

    private mutating func flushBin(at t: Double) -> SensorSample {
        let n = Double(count)
        let s = SensorSample(
            t: t,
            ax: sumAx / n, ay: sumAy / n, az: sumAz / n,
            gx: sumGx / n, gy: sumGy / n, gz: sumGz / n
        )
        resetBin()
        return s
    }

    private mutating func resetBin() {
        sumAx = 0; sumAy = 0; sumAz = 0
        sumGx = 0; sumGy = 0; sumGz = 0
        count = 0
    }

    /// Quantise a sample to int16 sextuple for the archive format.
    static func quantize(_ s: SensorSample) -> (Int16, Int16, Int16, Int16, Int16, Int16) {
        func q(_ v: Double, scale: Double) -> Int16 {
            let scaled = (v * scale).rounded()
            let clamped = min(Double(Int16.max), max(Double(Int16.min), scaled))
            return Int16(clamped)
        }
        return (
            q(s.ax, scale: SensorFileFormat.accelScale),
            q(s.ay, scale: SensorFileFormat.accelScale),
            q(s.az, scale: SensorFileFormat.accelScale),
            q(s.gx, scale: SensorFileFormat.gyroScale),
            q(s.gy, scale: SensorFileFormat.gyroScale),
            q(s.gz, scale: SensorFileFormat.gyroScale)
        )
    }

    static func dequantize(ax: Int16, ay: Int16, az: Int16,
                           gx: Int16, gy: Int16, gz: Int16, t: Double) -> SensorSample {
        SensorSample(
            t: t,
            ax: Double(ax) / SensorFileFormat.accelScale,
            ay: Double(ay) / SensorFileFormat.accelScale,
            az: Double(az) / SensorFileFormat.accelScale,
            gx: Double(gx) / SensorFileFormat.gyroScale,
            gy: Double(gy) / SensorFileFormat.gyroScale,
            gz: Double(gz) / SensorFileFormat.gyroScale
        )
    }
}
