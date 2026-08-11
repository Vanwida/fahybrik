import Foundation

// MARK: - Sensor domain types (pure Foundation)
//
// Shared by iPhone tests, the watch capture pipeline, and the file format.
// No CoreMotion here — the capture wrapper maps device samples into these.

/// One decimated sample after gravity-aware packaging. Units: m/s² and rad/s.
struct SensorSample: Equatable, Sendable {
    /// Seconds from session t0.
    let t: Double
    let ax: Double
    let ay: Double
    let az: Double
    let gx: Double
    let gy: Double
    let gz: Double

    /// Euclidean magnitude of linear acceleration (user motion, not gravity).
    var accelNorm: Double {
        sqrt(ax * ax + ay * ay + az * az)
    }
}

/// Label of an active work window (tramo / series / station).
struct SensorWindowLabel: Equatable, Sendable, Codable {
    let t0: Double
    let t1: Double?
    let tramoId: String?
    let exerciseId: Int?
    let modality: String?
    let movementName: String?
}

enum SensorCaptureMode: String, Codable, Sendable {
    case batched
    case classic
}

enum SensorWrist: String, Codable, Sendable {
    case left
    case right
}

/// Who produced the rep count that landed on the wire.
enum RepsSource: String, Codable, Sendable {
    case athleteTap = "athlete_tap"
    case sensor
    case sensorCorrected = "sensor_corrected"
}

/// Three-state confidence for the rep counter (plan fase 2).
enum RepConfidenceLevel: String, Codable, Sendable {
    case counted   // high confidence — safe to prefill
    case doubtful  // show as estimate
    case unknown   // do not deliver a number with aplomb
}

struct RepCountResult: Equatable, Sendable {
    let reps: Int
    let confidence: Double          // 0...1
    let level: RepConfidenceLevel
    let periodSeconds: Double?
    /// True when alternating-arm signature detected — never high confidence.
    let alternatingPattern: Bool
}

struct ActivityTimingResult: Sendable {
    let workSeconds: Double
    let restSeconds: Double
    let confidence: Double
    /// Contiguous work intervals as (t0, t1) from session t0.
    let workIntervals: [(Double, Double)]
}

struct BarVelocityResult: Equatable, Sendable {
    let meanVelocityFirst: Double   // m/s
    let meanVelocityLast: Double
    let velocityLossPct: Double
    let romMeters: Double
    let confidence: Double
    let repVelocities: [Double]
}

/// Binary file format constants for archived captures (fase 0).
enum SensorFileFormat {
    static let magic = Data([0x46, 0x48, 0x53, 0x43]) // "FHSC"
    static let version: UInt16 = 1
    /// Target archive rate — literature works 20–100 Hz; 50 is the budget sweet spot.
    static let targetHz: Double = 50
    static let channels = ["ax", "ay", "az", "gx", "gy", "gz"]
    /// Scale for int16 quantisation: accel m/s² → int16, gyro rad/s → int16.
    /// ±16 g ≈ ±157 m/s² → scale 200 → ±31400 within int16.
    static let accelScale: Double = 200
    /// ±35 rad/s covers aggressive gym motion; scale 900 → within int16.
    static let gyroScale: Double = 900
}
