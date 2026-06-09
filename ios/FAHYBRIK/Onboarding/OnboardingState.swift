import Foundation
import Observation

// All optional values match the spec's "skipable per step" rule. Pablo
// programs tests for fields the athlete leaves empty.
@Observable
final class OnboardingState {
    // Welcome + 17 intake steps + Done. The progress UI (StepHeader N/total,
    // ProgressDots) reads this, so it is the single source of truth for length.
    static let totalSteps: Int = 19

    // Days are indexed Mon(0) … Sun(6) everywhere in this state. The snapshot
    // maps that index to {mon..sun} wire keys.
    static let dayCount = 7

    // Step 2 — personal basics
    var fullName: String = ""
    var dateOfBirth: Date? = nil
    var sex: Sex? = nil
    var heightCm: Int? = nil
    var weightKg: Double? = nil

    // Step 3 — relación con el deporte (GoalRelationStep)
    var goalType: OnbGoalType? = nil
    var goalOtherText: String = ""
    var runExperience: RunExperience? = nil
    var strengthExperience: StrengthExperience? = nil

    // Step 4 — hábitos (HabitsStep) — 1-10 sliders
    var sleepQuality: Int = 5
    var stressLevel: Int = 5
    var commitmentLevel: Int = 7

    // Step 5 — lesiones / limitaciones (InjuriesLimitationsStep)
    var injuries: [OnbInjury] = []
    var movementLimitations: String = ""

    // Step 6 — disponibilidad (AvailabilityStep)
    var availabilityByDay: [DayPlanStatus] = Array(repeating: .rest, count: OnboardingState.dayCount)
    var availableFrom: String = ""
    var availableTo: String = ""
    var sessionMinutes: Int = 60
    var scheduleFlexible: Bool = false

    // Step 7 — semana típica (PreferredWeekStep)
    var preferredWeekByDay: [Set<PreferredTrainingType>] = Array(repeating: [], count: OnboardingState.dayCount)

    // Step 8 — instalación (FacilityStep)
    var facilityType: FacilityType? = nil
    var facilityOtherText: String = ""
    var equipment: Set<EquipmentItem> = []
    var hasTrack: Bool = false
    var hasFlatRun: Bool = false

    // Step 9 — dispositivos (DevicesStep)
    var watchBrand: WatchBrand? = nil
    var watchModel: String = ""
    var hasHrBelt: Bool = false

    // Step 10 — metas (GoalsStep)
    var goalShort: String = ""
    var goalMid: String = ""
    var goalLong: String = ""
    var achievable24Months: Achievable? = nil
    var biggestObstacle: String = ""
    var pctDependsOnMe: Int = 5
    var coachRole: String = ""

    // Step 11 — strength 1RMs (kg, except reps)
    var oneRmBackSquat: Double? = nil
    var oneRmDeadlift: Double? = nil
    var oneRmBenchPress: Double? = nil
    var oneRmOhp: Double? = nil
    var oneRmClean: Double? = nil
    var oneRmSnatch: Double? = nil
    var pullUpsMax: Int? = nil
    var pushUpsPerMinute: Int? = nil

    // Step 12 — endurance benchmarks (seconds)
    var time5kSeconds: Int? = nil
    var time10kSeconds: Int? = nil
    var timeHalfSeconds: Int? = nil
    var timeMarathonSeconds: Int? = nil
    var time2kRowSeconds: Int? = nil
    var time1kRowSeconds: Int? = nil
    var time1kSkiSeconds: Int? = nil
    var time500mSkiSeconds: Int? = nil

    // Step 13 — A-event / carreras (AEventStep)
    var aEventName: String = ""
    var aEventDate: Date? = nil
    var aEventDivision: HyroxDivision? = nil
    var goalKind: GoalKind? = nil
    var goalTimeSeconds: Int? = nil

    // Step 14 — connections
    var garminConnected: Bool = false
    var healthkitGranted: Bool = false

    // ─── Fields retained from the prior intake (data model preserved even
    // though the dedicated screens are not part of the approved 13-step flow).
    // Pablo can still program against them; they round-trip through the draft.
    var trainingYears: Int? = nil
    var trainingLevel: Int? = nil
    var primaryDiscipline: Discipline? = nil
    var hoursPerWeek: Int? = nil
    var hyroxRacesCompleted: Int? = nil
    var hyroxBestTimeSeconds: Int? = nil
    var hyroxDivisions: Set<HyroxDivision> = []
    var hyroxLastRaceDate: Date? = nil
    var hyroxNotes: String = ""
    var stationWallBallReps: Int? = nil
    var stationSledPushSeconds: Int? = nil
    var stationBbjSeconds: Int? = nil
    var stationFarmerCarryKg: Double? = nil
    var stationSandbagLungesSeconds: Int? = nil
    var ftpWatts: Int? = nil
    var lthrBpm: Int? = nil
    var thresholdPaceSecondsPerKm: Int? = nil
    var time1MileSeconds: Int? = nil
    var maxHrBpm: Int? = nil
    var daysPerWeek: Int? = nil
    var hoursPerSession: Double? = nil
    var equipmentAccess: Set<EquipmentAccess> = []
    var injuriesNotes: String = ""
    var sleepHoursAvg: Double? = nil
    var subjectiveStress: Int? = nil
    var hrvMeasured: Bool? = nil
    var devicesOwned: Set<DeviceBrand> = []

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
            goal_type: goalType?.rawValue,
            goal_other_text: goalOtherText.isEmpty ? nil : goalOtherText,
            run_experience: runExperience?.rawValue,
            strength_experience: strengthExperience?.rawValue,
            sleep_quality: sleepQuality,
            stress_level: stressLevel,
            commitment_level: commitmentLevel,
            injuries: injuries.map {
                InjuryDTO(area: $0.area, type: $0.type, active: $0.active, note: $0.note)
            },
            movement_limitations: movementLimitations.isEmpty ? nil : movementLimitations,
            availability: DayStatusMap(from: availabilityByDay),
            available_from: availableFrom.isEmpty ? nil : availableFrom,
            available_to: availableTo.isEmpty ? nil : availableTo,
            session_minutes: sessionMinutes,
            schedule_flexible: scheduleFlexible,
            preferred_week: DayTypesMap(from: preferredWeekByDay),
            facility_type: facilityType?.rawValue,
            facility_other_text: facilityOtherText.isEmpty ? nil : facilityOtherText,
            equipment: equipment.map(\.rawValue).sorted(),
            has_track: hasTrack,
            has_flat_run: hasFlatRun,
            watch_brand: watchBrand?.rawValue,
            watch_model: watchModel.isEmpty ? nil : watchModel,
            has_hr_belt: hasHrBelt,
            goal_short: goalShort.isEmpty ? nil : goalShort,
            goal_mid: goalMid.isEmpty ? nil : goalMid,
            goal_long: goalLong.isEmpty ? nil : goalLong,
            achievable_2_4_months: achievable24Months?.rawValue,
            biggest_obstacle: biggestObstacle.isEmpty ? nil : biggestObstacle,
            pct_depends_on_me: pctDependsOnMe,
            coach_role: coachRole.isEmpty ? nil : coachRole,
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
            races: racesPayload(),
            a_event_name: aEventName.isEmpty ? nil : aEventName,
            a_event_date: aEventDate.map { Self.dateFormatter.string(from: $0) },
            a_event_division: aEventDivision?.rawValue,
            goal_kind: goalKind?.rawValue,
            goal_time_seconds: goalTimeSeconds,
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
            training_years: trainingYears,
            training_level: trainingLevel,
            primary_discipline: primaryDiscipline?.rawValue,
            hours_per_week: hoursPerWeek,
            hyrox_races_completed: hyroxRacesCompleted,
            hyrox_best_time_seconds: hyroxBestTimeSeconds,
            hyrox_divisions: hyroxDivisions.map(\.rawValue).sorted(),
            hyrox_last_race_date: hyroxLastRaceDate.map { Self.dateFormatter.string(from: $0) },
            hyrox_notes: hyroxNotes.isEmpty ? nil : hyroxNotes,
            days_per_week: daysPerWeek,
            hours_per_session: hoursPerSession,
            equipment_access: equipmentAccess.map(\.rawValue).sorted(),
            injuries_notes: injuriesNotes.isEmpty ? nil : injuriesNotes,
            sleep_hours_avg: sleepHoursAvg,
            subjective_stress: subjectiveStress,
            hrv_measured: hrvMeasured,
            devices_owned: devicesOwned.map(\.rawValue).sorted(),
            garmin_connected: garminConnected,
            healthkit_granted: healthkitGranted
        )
    }

    // The A-event becomes the athlete's primary race. Modeled as a list so the
    // backend can ingest several races later without a wire change.
    private func racesPayload() -> [RaceDTO] {
        guard !aEventName.isEmpty || aEventDate != nil || aEventDivision != nil else { return [] }
        return [
            RaceDTO(
                name: aEventName.isEmpty ? nil : aEventName,
                date: aEventDate.map { Self.dateFormatter.string(from: $0) },
                division: aEventDivision?.rawValue,
                priority: "A",
                goal_kind: goalKind?.rawValue,
                goal_time_seconds: goalTimeSeconds
            )
        ]
    }

    // MARK: - Draft persistence

    private static let draftKey = "onboarding.draft.v2"
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
        goalType = s.goal_type.flatMap(OnbGoalType.init(rawValue:))
        goalOtherText = s.goal_other_text ?? ""
        runExperience = s.run_experience.flatMap(RunExperience.init(rawValue:))
        strengthExperience = s.strength_experience.flatMap(StrengthExperience.init(rawValue:))
        sleepQuality = s.sleep_quality
        stressLevel = s.stress_level
        commitmentLevel = s.commitment_level
        injuries = s.injuries.map {
            OnbInjury(area: $0.area, type: $0.type, active: $0.active, note: $0.note)
        }
        movementLimitations = s.movement_limitations ?? ""
        availabilityByDay = s.availability.toArray()
        availableFrom = s.available_from ?? ""
        availableTo = s.available_to ?? ""
        sessionMinutes = s.session_minutes
        scheduleFlexible = s.schedule_flexible
        preferredWeekByDay = s.preferred_week.toArray()
        facilityType = s.facility_type.flatMap(FacilityType.init(rawValue:))
        facilityOtherText = s.facility_other_text ?? ""
        equipment = Set(s.equipment.compactMap(EquipmentItem.init(rawValue:)))
        hasTrack = s.has_track
        hasFlatRun = s.has_flat_run
        watchBrand = s.watch_brand.flatMap(WatchBrand.init(rawValue:))
        watchModel = s.watch_model ?? ""
        hasHrBelt = s.has_hr_belt
        goalShort = s.goal_short ?? ""
        goalMid = s.goal_mid ?? ""
        goalLong = s.goal_long ?? ""
        achievable24Months = s.achievable_2_4_months.flatMap(Achievable.init(rawValue:))
        biggestObstacle = s.biggest_obstacle ?? ""
        pctDependsOnMe = s.pct_depends_on_me
        coachRole = s.coach_role ?? ""
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
        aEventName = s.a_event_name ?? ""
        aEventDate = s.a_event_date.flatMap(Self.dateFormatter.date(from:))
        aEventDivision = s.a_event_division.flatMap(HyroxDivision.init(rawValue:))
        goalKind = s.goal_kind.flatMap(GoalKind.init(rawValue:))
        goalTimeSeconds = s.goal_time_seconds
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
        trainingYears = s.training_years
        trainingLevel = s.training_level
        primaryDiscipline = s.primary_discipline.flatMap(Discipline.init(rawValue:))
        hoursPerWeek = s.hours_per_week
        hyroxRacesCompleted = s.hyrox_races_completed
        hyroxBestTimeSeconds = s.hyrox_best_time_seconds
        hyroxDivisions = Set(s.hyrox_divisions.compactMap(HyroxDivision.init(rawValue:)))
        hyroxLastRaceDate = s.hyrox_last_race_date.flatMap(Self.dateFormatter.date(from:))
        hyroxNotes = s.hyrox_notes ?? ""
        daysPerWeek = s.days_per_week
        hoursPerSession = s.hours_per_session
        equipmentAccess = Set(s.equipment_access.compactMap(EquipmentAccess.init(rawValue:)))
        injuriesNotes = s.injuries_notes ?? ""
        sleepHoursAvg = s.sleep_hours_avg
        subjectiveStress = s.subjective_stress
        hrvMeasured = s.hrv_measured
        devicesOwned = Set(s.devices_owned.compactMap(DeviceBrand.init(rawValue:)))
        garminConnected = s.garmin_connected
        healthkitGranted = s.healthkit_granted
    }
}

struct OnboardingDraft: Codable {
    let snapshot: OnboardingSnapshot
    let step: Int
}

// MARK: - Shared intake types (raw values are the API snake_case wire values)

enum OnbGoalType: String, Codable, CaseIterable {
    case firstHyrox = "first_hyrox"
    case improveHyroxMark = "improve_hyrox_mark"
    case improveRunning = "improve_running"
    case completeFun = "complete_fun"
    case other
}

enum RunExperience: String, Codable, CaseIterable {
    case enthusiast, comfortable, reluctant, none
}

enum StrengthExperience: String, Codable, CaseIterable {
    case lovesLifting = "loves_lifting"
    case weeklyIsh = "weekly_ish"
    case withGuidance = "with_guidance"
    case none
}

enum DayPlanStatus: String, Codable, CaseIterable {
    case program
    case otherActivity = "other_activity"
    case rest
}

enum PreferredTrainingType: String, Codable, CaseIterable {
    case isolatedRun = "isolated_run"
    case strengthGym = "strength_gym"
    case hyroxTransitions = "hyrox_transitions"
    case ergoConditioning = "ergo_conditioning"
    case specificMaterial = "specific_material"
}

enum FacilityType: String, Codable, CaseIterable {
    case commercialGym = "commercial_gym"
    case crossfitBox = "crossfit_box"
    case multiple, other
}

enum EquipmentItem: String, Codable, CaseIterable {
    case barbellsPlates = "barbells_plates"
    case dumbbells, sleds
    case bagsKb = "bags_kb"
    case openSpace = "open_space"
    case pulleys, treadmill
    case stationaryBike = "stationary_bike"
    case rower, skierg, other
}

enum WatchBrand: String, Codable, CaseIterable {
    case appleWatch = "apple_watch"
    case garmin, polar, coros, suunto, whoop, oura, other
}

enum Achievable: String, Codable, CaseIterable {
    case yes, no, unknown
}

struct OnbInjury: Codable, Identifiable, Equatable {
    var id = UUID()
    var area: String = ""
    var type: String = ""
    var active: Bool = true
    var note: String? = nil
}

// MARK: - Existing enums (retained)

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

// MARK: - Wire-format DTOs
//
// Field names use snake_case explicitly so this struct is stable against
// Codable strategy changes elsewhere. Sub-DTOs (injuries, availability,
// preferred_week, races) encode to the exact JSON shapes the backend expects.

struct InjuryDTO: Codable {
    let area: String
    let type: String
    let active: Bool
    let note: String?
}

struct RaceDTO: Codable {
    let name: String?
    let date: String?
    let division: String?
    let priority: String
    let goal_kind: String?
    let goal_time_seconds: Int?
}

// availability: { mon: status, …, sun: status }
struct DayStatusMap: Codable {
    var mon: String
    var tue: String
    var wed: String
    var thu: String
    var fri: String
    var sat: String
    var sun: String

    init(from byDay: [DayPlanStatus]) {
        func v(_ i: Int) -> String {
            (i < byDay.count ? byDay[i] : .rest).rawValue
        }
        mon = v(0); tue = v(1); wed = v(2); thu = v(3); fri = v(4); sat = v(5); sun = v(6)
    }

    func toArray() -> [DayPlanStatus] {
        [mon, tue, wed, thu, fri, sat, sun].map {
            DayPlanStatus(rawValue: $0) ?? .rest
        }
    }
}

// preferred_week: { mon: [type, …], …, sun: [type, …] }
struct DayTypesMap: Codable {
    var mon: [String]
    var tue: [String]
    var wed: [String]
    var thu: [String]
    var fri: [String]
    var sat: [String]
    var sun: [String]

    init(from byDay: [Set<PreferredTrainingType>]) {
        func v(_ i: Int) -> [String] {
            (i < byDay.count ? byDay[i] : []).map(\.rawValue).sorted()
        }
        mon = v(0); tue = v(1); wed = v(2); thu = v(3); fri = v(4); sat = v(5); sun = v(6)
    }

    func toArray() -> [Set<PreferredTrainingType>] {
        [mon, tue, wed, thu, fri, sat, sun].map {
            Set($0.compactMap(PreferredTrainingType.init(rawValue:)))
        }
    }
}

struct OnboardingSnapshot: Codable {
    let full_name: String?
    let date_of_birth: String?
    let sex: String?
    let height_cm: Int?
    let weight_kg: Double?

    // Relación con el deporte
    let goal_type: String?
    let goal_other_text: String?
    let run_experience: String?
    let strength_experience: String?

    // Hábitos
    let sleep_quality: Int
    let stress_level: Int
    let commitment_level: Int

    // Lesiones
    let injuries: [InjuryDTO]
    let movement_limitations: String?

    // Disponibilidad
    let availability: DayStatusMap
    let available_from: String?
    let available_to: String?
    let session_minutes: Int
    let schedule_flexible: Bool

    // Semana típica
    let preferred_week: DayTypesMap

    // Instalación
    let facility_type: String?
    let facility_other_text: String?
    let equipment: [String]
    let has_track: Bool
    let has_flat_run: Bool

    // Dispositivos
    let watch_brand: String?
    let watch_model: String?
    let has_hr_belt: Bool

    // Metas
    let goal_short: String?
    let goal_mid: String?
    let goal_long: String?
    let achievable_2_4_months: String?
    let biggest_obstacle: String?
    let pct_depends_on_me: Int
    let coach_role: String?

    // Fuerza 1RM
    let one_rm_back_squat_kg: Double?
    let one_rm_deadlift_kg: Double?
    let one_rm_bench_press_kg: Double?
    let one_rm_ohp_kg: Double?
    let one_rm_clean_kg: Double?
    let one_rm_snatch_kg: Double?
    let pull_ups_max: Int?
    let push_ups_per_minute: Int?

    // Resistencia
    let time_5k_seconds: Int?
    let time_10k_seconds: Int?
    let time_half_seconds: Int?
    let time_marathon_seconds: Int?
    let time_2k_row_seconds: Int?
    let time_1k_row_seconds: Int?
    let time_1k_ski_seconds: Int?
    let time_500m_ski_seconds: Int?

    // A-event / carreras
    let races: [RaceDTO]
    let a_event_name: String?
    let a_event_date: String?
    let a_event_division: String?
    let goal_kind: String?
    let goal_time_seconds: Int?

    // Retained fields (stations / threshold / hyrox history / context / recovery)
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
    let training_years: Int?
    let training_level: Int?
    let primary_discipline: String?
    let hours_per_week: Int?
    let hyrox_races_completed: Int?
    let hyrox_best_time_seconds: Int?
    let hyrox_divisions: [String]
    let hyrox_last_race_date: String?
    let hyrox_notes: String?
    let days_per_week: Int?
    let hours_per_session: Double?
    let equipment_access: [String]
    let injuries_notes: String?
    let sleep_hours_avg: Double?
    let subjective_stress: Int?
    let hrv_measured: Bool?
    let devices_owned: [String]

    // Connections
    let garmin_connected: Bool
    let healthkit_granted: Bool
}
