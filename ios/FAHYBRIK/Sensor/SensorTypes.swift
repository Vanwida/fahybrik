import Foundation

// MARK: - Sensor domain types (pure Foundation)
//
// Shared by iPhone tests, the watch capture pipeline, and the file format.
// No CoreMotion here — the capture wrapper maps device samples into these.

/// One decimated sample after gravity-aware packaging. Units: m/s² and rad/s.
///
/// `gr*` is the GRAVITY vector as CoreMotion reports it (device frame, g units,
/// pointing down). It is not decoration: without it there is no world-vertical
/// axis, and without a vertical axis the only thing left is "the axis with most
/// variance", which for a wrist walking to the rack is the arm swing. Every
/// counted rep and every m/s in this project is a projection onto gravity.
/// Zero when unknown (v1 archives, synthetic fixtures) — the vertical accessors
/// then return nil and the live counter declares it doesn't know instead of
/// counting a guess.
struct SensorSample: Equatable, Sendable {
    /// Seconds from session t0.
    let t: Double
    let ax: Double
    let ay: Double
    let az: Double
    let gx: Double
    let gy: Double
    let gz: Double
    let grx: Double
    let gry: Double
    let grz: Double

    init(t: Double, ax: Double, ay: Double, az: Double,
         gx: Double, gy: Double, gz: Double,
         grx: Double = 0, gry: Double = 0, grz: Double = 0) {
        self.t = t
        self.ax = ax; self.ay = ay; self.az = az
        self.gx = gx; self.gy = gy; self.gz = gz
        self.grx = grx; self.gry = gry; self.grz = grz
    }

    /// Euclidean magnitude of linear acceleration (user motion, not gravity).
    var accelNorm: Double {
        sqrt(ax * ax + ay * ay + az * az)
    }

    /// Magnitude of the gravity vector (≈1 when measured, 0 when absent).
    var gravityMagnitude: Double {
        sqrt(grx * grx + gry * gry + grz * grz)
    }

    var hasGravity: Bool { gravityMagnitude > 0.5 }

    /// Acceleration along the world VERTICAL, positive upwards (m/s²).
    /// Nil when this sample carries no gravity reference.
    var verticalAccel: Double? {
        let m = gravityMagnitude
        guard m > 0.5 else { return nil }
        // CoreMotion's gravity points DOWN, so the component along it is downwards.
        return -(ax * grx + ay * gry + az * grz) / m
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

/// One rep the live tracker has CLOSED: it happened, it is over, and these are
/// its numbers. Emitted exactly once, in order, never revised — which is what
/// lets the screen show one velocity per rep instead of a number that wobbles.
struct SensorRepEvent: Equatable, Sendable {
    /// 1-based within the current work window (the set), not the session.
    let index: Int
    /// Seconds from session t0 at the moment the rep closed.
    let closedAt: Double
    /// Mean concentric speed (m/s) = concentric ROM / concentric time.
    let concentricMs: Double
    /// Fastest instantaneous upward speed inside the concentric (m/s).
    let peakMs: Double
    /// Concentric travel (m). Also the honest ROM of the rep.
    let romMeters: Double
    let concentricSeconds: Double
    /// Full eccentric+concentric time (s).
    let cycleSeconds: Double
    let confidence: Double
    let level: RepConfidenceLevel
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
    /// v2 adds the gravity channels. Nine channels at 50 Hz = 900 B/s → 2,4 MB
    /// for a 45-minute session, still inside the plan's 3 MB budget. v1 files
    /// keep decoding (gravity zero) so nothing archived is orphaned.
    static let version: UInt16 = 2
    /// Target archive rate — literature works 20–100 Hz; 50 is the budget sweet spot.
    static let targetHz: Double = 50
    static let channels = ["ax", "ay", "az", "gx", "gy", "gz", "grx", "gry", "grz"]
    static let channelsV1 = ["ax", "ay", "az", "gx", "gy", "gz"]
    /// Scale for int16 quantisation: accel m/s² → int16, gyro rad/s → int16.
    /// ±16 g ≈ ±157 m/s² → scale 200 → ±31400 within int16.
    static let accelScale: Double = 200
    /// ±35 rad/s covers aggressive gym motion; scale 900 → within int16.
    static let gyroScale: Double = 900
    /// Gravity is a unit-ish vector (±1 g) → 10 000 keeps 4 decimal places.
    static let gravityScale: Double = 10_000
}
