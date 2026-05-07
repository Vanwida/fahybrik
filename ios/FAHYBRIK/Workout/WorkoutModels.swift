import Foundation

// Format set per UX spec 03-workout-execution.md "Format-specific timer behavior".
enum WorkoutFormat: String, Codable, CaseIterable {
    case forTime = "for_time"
    case amrap = "amrap"
    case circuit = "circuit"
    case hyroxSim = "hyrox_sim"
    case emom = "emom"
    case intervals = "intervals"
    case strength = "strength"

    var displayName: String {
        switch self {
        case .forTime: return "For Time"
        case .amrap: return "AMRAP"
        case .circuit: return "Circuit"
        case .hyroxSim: return "HYROX Sim"
        case .emom: return "EMOM"
        case .intervals: return "Intervals"
        case .strength: return "Strength"
        }
    }
}

// Per-segment kind drives which 2x2 data grid is shown during execution.
enum SegmentKind: String, Codable {
    case running
    case rowOrSki = "row_or_ski"
    case sled
    case reps
    case strength
}

struct ZoneTarget: Codable {
    let zone: HRZone
    let percent: Int    // 0..100, sums approx to 100 across segments
}

// Either a target distance, target reps, or target duration drives completion.
struct WorkoutSegment: Codable, Identifiable {
    let id: UUID
    let order: Int
    let title: String
    let kind: SegmentKind
    let targetReps: Int?
    let targetDistanceMeters: Double?
    let targetDurationSeconds: Int?
    let targetPaceSecondsPerKm: Int?
    let targetPowerWatts: Int?
    let targetZone: HRZone?
    let loadKg: Double?

    init(
        id: UUID = UUID(),
        order: Int,
        title: String,
        kind: SegmentKind,
        targetReps: Int? = nil,
        targetDistanceMeters: Double? = nil,
        targetDurationSeconds: Int? = nil,
        targetPaceSecondsPerKm: Int? = nil,
        targetPowerWatts: Int? = nil,
        targetZone: HRZone? = nil,
        loadKg: Double? = nil
    ) {
        self.id = id
        self.order = order
        self.title = title
        self.kind = kind
        self.targetReps = targetReps
        self.targetDistanceMeters = targetDistanceMeters
        self.targetDurationSeconds = targetDurationSeconds
        self.targetPaceSecondsPerKm = targetPaceSecondsPerKm
        self.targetPowerWatts = targetPowerWatts
        self.targetZone = targetZone
        self.loadKg = loadKg
    }
}

struct WorkoutPlan: Codable, Identifiable {
    let id: UUID
    let name: String
    let format: WorkoutFormat
    let estimatedDurationSeconds: Int
    let blockContext: String        // "REAL · sem 2 · día 4"
    let zoneTargets: [ZoneTarget]
    let equipment: [String]
    let segments: [WorkoutSegment]
    let coachNote: String?
    let warmupChecklist: [String]
}

struct LapRecord: Codable, Identifiable {
    let id: UUID
    let segmentId: UUID
    let startedAt: Date
    let endedAt: Date
    let durationSeconds: Double
    let avgHRBpm: Int?
    let maxHRBpm: Int?
    let zoneSecondsByZone: [Int: Double]   // zone(rawValue) -> seconds
    let repsCompleted: Int?
    let distanceCoveredMeters: Double?
}

// Demo plan used during dev; real plans come from the backend.
extension WorkoutPlan {
    static let demo = WorkoutPlan(
        id: UUID(),
        name: "Sled Push + Wall Ball Circuit",
        format: .forTime,
        estimatedDurationSeconds: 52 * 60,
        blockContext: "REAL · sem 2 · día 4",
        zoneTargets: [
            ZoneTarget(zone: .z3, percent: 60),
            ZoneTarget(zone: .z4, percent: 30),
            ZoneTarget(zone: .z5, percent: 10),
        ],
        equipment: ["Sled 50kg", "Wall ball 9kg", "PM5"],
        segments: [
            WorkoutSegment(order: 1, title: "Run 400m", kind: .running,
                          targetDistanceMeters: 400, targetPaceSecondsPerKm: 270, targetZone: .z3),
            WorkoutSegment(order: 2, title: "Sled push 100m · 50kg", kind: .sled,
                          targetDistanceMeters: 100, targetZone: .z5, loadKg: 50),
            WorkoutSegment(order: 3, title: "Wall balls · 50 reps · 9kg", kind: .reps,
                          targetReps: 50, targetZone: .z4, loadKg: 9),
            WorkoutSegment(order: 4, title: "Run 400m", kind: .running,
                          targetDistanceMeters: 400, targetPaceSecondsPerKm: 270, targetZone: .z3),
            WorkoutSegment(order: 5, title: "Row 500m · TGT 240W", kind: .rowOrSki,
                          targetDistanceMeters: 500, targetPowerWatts: 240, targetZone: .z4),
        ],
        coachNote: "Mantén la cadencia controlada en run. Sled all-out.",
        warmupChecklist: [
            "5 min easy bike o jog",
            "10 air squats + 10 push-ups",
            "2 series 5 wall balls técnica",
        ]
    )
}
