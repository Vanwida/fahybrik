import Foundation
import Observation

// All optional values match the spec's "skipable per step" rule. Pablo
// programs tests for fields the athlete leaves empty.
@Observable
final class OnboardingState {
    static let totalSteps: Int = 13

    // Step 2 — personal basics
    var fullName: String = ""
    var dateOfBirth: Date? = nil
    var sex: Sex? = nil
    var heightCm: Int? = nil
    var weightKg: Double? = nil

    // Step 3 — athletic background
    var trainingYears: Int? = nil
    var primaryDiscipline: Discipline? = nil
    var hoursPerWeek: Int? = nil

    // Step 4 — HYROX history
    var hyroxRacesCompleted: Int? = nil
    var hyroxBestTimeSeconds: Int? = nil
    var hyroxDivisions: Set<HyroxDivision> = []
    var hyroxLastRaceDate: Date? = nil
    var hyroxNotes: String = ""

    // Step 5 — strength 1RMs (kg, except reps)
    var oneRmBackSquat: Double? = nil
    var oneRmDeadlift: Double? = nil
    var oneRmBenchPress: Double? = nil
    var oneRmOhp: Double? = nil
    var oneRmClean: Double? = nil
    var oneRmSnatch: Double? = nil
    var pullUpsMax: Int? = nil
    var pushUpsPerMinute: Int? = nil

    // Step 6 — endurance benchmarks (seconds)
    var time5kSeconds: Int? = nil
    var time10kSeconds: Int? = nil
    var timeHalfSeconds: Int? = nil
    var timeMarathonSeconds: Int? = nil
    var time2kRowSeconds: Int? = nil
    var time1kRowSeconds: Int? = nil
    var time1kSkiSeconds: Int? = nil
    var time500mSkiSeconds: Int? = nil

    // Step 7 — HYROX station bests
    var stationWallBallReps: Int? = nil
    var stationSledPushSeconds: Int? = nil
    var stationBbjSeconds: Int? = nil
    var stationFarmerCarryKg: Double? = nil
    var stationSandbagLungesSeconds: Int? = nil

    // Step 8 — anaerobic / threshold benchmarks
    var ftpWatts: Int? = nil
    var lthrBpm: Int? = nil
    var thresholdPaceSecondsPerKm: Int? = nil
    var time1MileSeconds: Int? = nil
    var maxHrBpm: Int? = nil

    // Step 9 — training context
    var daysPerWeek: Int? = nil
    var hoursPerSession: Double? = nil
    var equipmentAccess: Set<EquipmentAccess> = []
    var injuriesNotes: String = ""

    // Step 10 — recovery
    var sleepHoursAvg: Double? = nil
    var subjectiveStress: Int? = nil
    var hrvMeasured: Bool? = nil
    var devicesOwned: Set<DeviceBrand> = []

    // Step 11 — goals
    var aEventName: String = ""
    var aEventDate: Date? = nil
    var aEventDivision: HyroxDivision? = nil
    var goalKind: GoalKind? = nil
    var goalTimeSeconds: Int? = nil

    // Step 12 — connections
    var garminConnected: Bool = false
    var healthkitGranted: Bool = false

    // ─── flow ───
    var currentStepIndex: Int = 0
    var hasFinished: Bool = false

    func advance() {
        if currentStepIndex < Self.totalSteps - 1 {
            currentStepIndex += 1
        }
        persistDraft()
    }

    func goBack() {
        if currentStepIndex > 0 {
            currentStepIndex -= 1
        }
        persistDraft()
    }

    func snapshot() -> OnboardingSnapshot {
        OnboardingSnapshot(
            full_name: fullName.isEmpty ? nil : fullName,
            date_of_birth: dateOfBirth.map { Self.dateFormatter.string(from: $0) },
            sex: sex?.rawValue,
            height_cm: heightCm,
            weight_kg: weightKg,
            training_years: trainingYears,
            primary_discipline: primaryDiscipline?.rawValue,
            hours_per_week: hoursPerWeek,
            hyrox_races_completed: hyroxRacesCompleted,
            hyrox_best_time_seconds: hyroxBestTimeSeconds,
            hyrox_divisions: hyroxDivisions.map(\.rawValue).sorted(),
            hyrox_last_race_date: hyroxLastRaceDate.map { Self.dateFormatter.string(from: $0) },
            hyrox_notes: hyroxNotes.isEmpty ? nil : hyroxNotes,
            one_rm_back_squat_kg: oneRmBackSquat,
            one_rm_deadlift_kg: oneRmDeadlift,
            one_rm_bench_press_kg: oneRmBenchPress,
            one_rm_ohp_kg: oneRmOhp,
            one_rm_clean_kg: oneRmClean,
            one_rm_snatch_kg: oneRmSnatch,
            pull_ups_max: pullUpsMax,
            push_ups_per_minute: pushUpsPerMinute,
            time_5k_seconds: time5kSeconds,
            time_10k_seconds: time10kSeconds,
            time_half_seconds: timeHalfSeconds,
            time_marathon_seconds: timeMarathonSeconds,
            time_2k_row_seconds: time2kRowSeconds,
            time_1k_row_seconds: time1kRowSeconds,
            time_1k_ski_seconds: time1kSkiSeconds,
            time_500m_ski_seconds: time500mSkiSeconds,
            station_wall_ball_reps: stationWallBallReps,
            station_sled_push_seconds: stationSledPushSeconds,
            station_bbj_seconds: stationBbjSeconds,
            station_farmer_carry_kg: stationFarmerCarryKg,
            station_sandbag_lunges_seconds: stationSandbagLungesSeconds,
            ftp_watts: ftpWatts,
            lthr_bpm: lthrBpm,
            threshold_pace_seconds_per_km: thresholdPaceSecondsPerKm,
            time_1_mile_seconds: time1MileSeconds,
            max_hr_bpm: maxHrBpm,
            days_per_week: daysPerWeek,
            hours_per_session: hoursPerSession,
            equipment_access: equipmentAccess.map(\.rawValue).sorted(),
            injuries_notes: injuriesNotes.isEmpty ? nil : injuriesNotes,
            sleep_hours_avg: sleepHoursAvg,
            subjective_stress: subjectiveStress,
            hrv_measured: hrvMeasured,
            devices_owned: devicesOwned.map(\.rawValue).sorted(),
            a_event_name: aEventName.isEmpty ? nil : aEventName,
            a_event_date: aEventDate.map { Self.dateFormatter.string(from: $0) },
            a_event_division: aEventDivision?.rawValue,
            goal_kind: goalKind?.rawValue,
            goal_time_seconds: goalTimeSeconds,
            garmin_connected: garminConnected,
            healthkit_granted: healthkitGranted
        )
    }

    // MARK: - Draft persistence

    private static let draftKey = "onboarding.draft.v1"
    private static let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()

    func persistDraft() {
        let snap = OnboardingDraft(snapshot: snapshot(), step: currentStepIndex)
        guard let data = try? JSONEncoder().encode(snap) else { return }
        UserDefaults.standard.set(data, forKey: Self.draftKey)
    }

    func restoreDraft() {
        guard let data = UserDefaults.standard.data(forKey: Self.draftKey),
              let draft = try? JSONDecoder().decode(OnboardingDraft.self, from: data) else { return }
        applyDraft(draft.snapshot)
        currentStepIndex = max(0, min(draft.step, Self.totalSteps - 1))
    }

    func clearDraft() {
        UserDefaults.standard.removeObject(forKey: Self.draftKey)
    }

    private func applyDraft(_ s: OnboardingSnapshot) {
        fullName = s.full_name ?? ""
        dateOfBirth = s.date_of_birth.flatMap(Self.dateFormatter.date(from:))
        sex = s.sex.flatMap(Sex.init(rawValue:))
        heightCm = s.height_cm
        weightKg = s.weight_kg
        trainingYears = s.training_years
        primaryDiscipline = s.primary_discipline.flatMap(Discipline.init(rawValue:))
        hoursPerWeek = s.hours_per_week
        hyroxRacesCompleted = s.hyrox_races_completed
        hyroxBestTimeSeconds = s.hyrox_best_time_seconds
        hyroxDivisions = Set(s.hyrox_divisions.compactMap(HyroxDivision.init(rawValue:)))
        hyroxLastRaceDate = s.hyrox_last_race_date.flatMap(Self.dateFormatter.date(from:))
        hyroxNotes = s.hyrox_notes ?? ""
        oneRmBackSquat = s.one_rm_back_squat_kg
        oneRmDeadlift = s.one_rm_deadlift_kg
        oneRmBenchPress = s.one_rm_bench_press_kg
        oneRmOhp = s.one_rm_ohp_kg
        oneRmClean = s.one_rm_clean_kg
        oneRmSnatch = s.one_rm_snatch_kg
        pullUpsMax = s.pull_ups_max
        pushUpsPerMinute = s.push_ups_per_minute
        time5kSeconds = s.time_5k_seconds
        time10kSeconds = s.time_10k_seconds
        timeHalfSeconds = s.time_half_seconds
        timeMarathonSeconds = s.time_marathon_seconds
        time2kRowSeconds = s.time_2k_row_seconds
        time1kRowSeconds = s.time_1k_row_seconds
        time1kSkiSeconds = s.time_1k_ski_seconds
        time500mSkiSeconds = s.time_500m_ski_seconds
        stationWallBallReps = s.station_wall_ball_reps
        stationSledPushSeconds = s.station_sled_push_seconds
        stationBbjSeconds = s.station_bbj_seconds
        stationFarmerCarryKg = s.station_farmer_carry_kg
        stationSandbagLungesSeconds = s.station_sandbag_lunges_seconds
        ftpWatts = s.ftp_watts
        lthrBpm = s.lthr_bpm
        thresholdPaceSecondsPerKm = s.threshold_pace_seconds_per_km
        time1MileSeconds = s.time_1_mile_seconds
        maxHrBpm = s.max_hr_bpm
        daysPerWeek = s.days_per_week
        hoursPerSession = s.hours_per_session
        equipmentAccess = Set(s.equipment_access.compactMap(EquipmentAccess.init(rawValue:)))
        injuriesNotes = s.injuries_notes ?? ""
        sleepHoursAvg = s.sleep_hours_avg
        subjectiveStress = s.subjective_stress
        hrvMeasured = s.hrv_measured
        devicesOwned = Set(s.devices_owned.compactMap(DeviceBrand.init(rawValue:)))
        aEventName = s.a_event_name ?? ""
        aEventDate = s.a_event_date.flatMap(Self.dateFormatter.date(from:))
        aEventDivision = s.a_event_division.flatMap(HyroxDivision.init(rawValue:))
        goalKind = s.goal_kind.flatMap(GoalKind.init(rawValue:))
        goalTimeSeconds = s.goal_time_seconds
        garminConnected = s.garmin_connected
        healthkitGranted = s.healthkit_granted
    }
}

struct OnboardingDraft: Codable {
    let snapshot: OnboardingSnapshot
    let step: Int
}

// MARK: - Enums (raw values are the wire values — snake/lowercase per Brain rules)

enum Sex: String, Codable, CaseIterable, Identifiable {
    case male, female, other
    var id: String { rawValue }
    var label: String {
        switch self {
        case .male: return "Hombre"
        case .female: return "Mujer"
        case .other: return "Otro"
        }
    }
}

enum Discipline: String, Codable, CaseIterable, Identifiable {
    case hyrox, crossfit, running, triathlon, strength, hybrid, other
    var id: String { rawValue }
    var label: String {
        switch self {
        case .hyrox: return "HYROX"
        case .crossfit: return "CrossFit"
        case .running: return "Running"
        case .triathlon: return "Triatlón"
        case .strength: return "Fuerza"
        case .hybrid: return "Híbrido"
        case .other: return "Otro"
        }
    }
}

enum HyroxDivision: String, Codable, CaseIterable, Identifiable {
    case pro, open, doubles, relay
    var id: String { rawValue }
    var label: String {
        switch self {
        case .pro: return "Pro"
        case .open: return "Open"
        case .doubles: return "Doubles"
        case .relay: return "Relay"
        }
    }
}

enum EquipmentAccess: String, Codable, CaseIterable, Identifiable {
    case fullGym = "full_gym"
    case homeGym = "home_gym"
    case sled, rower, skiErg = "ski_erg", wallBall = "wall_ball", sandbag, kettlebells
    var id: String { rawValue }
    var label: String {
        switch self {
        case .fullGym: return "Gimnasio completo"
        case .homeGym: return "Home gym"
        case .sled: return "Sled"
        case .rower: return "Rower"
        case .skiErg: return "Ski erg"
        case .wallBall: return "Wall ball"
        case .sandbag: return "Sandbag"
        case .kettlebells: return "Kettlebells"
        }
    }
}

enum DeviceBrand: String, Codable, CaseIterable, Identifiable {
    case garmin, appleWatch = "apple_watch", polar, oura, whoop, coros
    var id: String { rawValue }
    var label: String {
        switch self {
        case .garmin: return "Garmin"
        case .appleWatch: return "Apple Watch"
        case .polar: return "Polar"
        case .oura: return "Oura"
        case .whoop: return "Whoop"
        case .coros: return "Coros"
        }
    }
}

enum GoalKind: String, Codable, CaseIterable, Identifiable {
    case finish, time, podium
    var id: String { rawValue }
    var label: String {
        switch self {
        case .finish: return "Terminar"
        case .time: return "Tiempo objetivo"
        case .podium: return "Podio división"
        }
    }
}

// Wire-format DTO. Field names use snake_case explicitly so this struct is
// stable against Codable strategy changes elsewhere.
struct OnboardingSnapshot: Codable {
    let full_name: String?
    let date_of_birth: String?
    let sex: String?
    let height_cm: Int?
    let weight_kg: Double?
    let training_years: Int?
    let primary_discipline: String?
    let hours_per_week: Int?
    let hyrox_races_completed: Int?
    let hyrox_best_time_seconds: Int?
    let hyrox_divisions: [String]
    let hyrox_last_race_date: String?
    let hyrox_notes: String?
    let one_rm_back_squat_kg: Double?
    let one_rm_deadlift_kg: Double?
    let one_rm_bench_press_kg: Double?
    let one_rm_ohp_kg: Double?
    let one_rm_clean_kg: Double?
    let one_rm_snatch_kg: Double?
    let pull_ups_max: Int?
    let push_ups_per_minute: Int?
    let time_5k_seconds: Int?
    let time_10k_seconds: Int?
    let time_half_seconds: Int?
    let time_marathon_seconds: Int?
    let time_2k_row_seconds: Int?
    let time_1k_row_seconds: Int?
    let time_1k_ski_seconds: Int?
    let time_500m_ski_seconds: Int?
    let station_wall_ball_reps: Int?
    let station_sled_push_seconds: Int?
    let station_bbj_seconds: Int?
    let station_farmer_carry_kg: Double?
    let station_sandbag_lunges_seconds: Int?
    let ftp_watts: Int?
    let lthr_bpm: Int?
    let threshold_pace_seconds_per_km: Int?
    let time_1_mile_seconds: Int?
    let max_hr_bpm: Int?
    let days_per_week: Int?
    let hours_per_session: Double?
    let equipment_access: [String]
    let injuries_notes: String?
    let sleep_hours_avg: Double?
    let subjective_stress: Int?
    let hrv_measured: Bool?
    let devices_owned: [String]
    let a_event_name: String?
    let a_event_date: String?
    let a_event_division: String?
    let goal_kind: String?
    let goal_time_seconds: Int?
    let garmin_connected: Bool
    let healthkit_granted: Bool
}
