import Foundation
import HealthKit

// Writes a session the PHONE recorded into Apple Health.
//
// Until now FAHYBRID only ever wrote a workout from the WRIST: both watch
// recorders finish an `HKLiveWorkoutBuilder`, so a session done with the watch
// lands in Salud on its own. A session done with the phone alone landed
// NOWHERE — it existed in FAHYBRID and was invisible to the rings, to the
// Fitness app, and to everything else the athlete's ecosystem builds on Salud.
//
// Two rules govern this file:
//
//  1. NEVER TWICE. If the wrist recorded the session it already wrote the
//     HKWorkout, so the phone must not write another. `ensureSaved` is therefore
//     told whether a wrist recorded this session (`wristRecorded`, latched by
//     `PhoneMirrorService` when the wrist is asked to save) and writes nothing
//     when it did. That flag is the guarantee.
//
//     It did NOT used to be. This file claimed the guarantee rested on the
//     overlap query below rather than on the wrist's uuid relay, "so it holds
//     even if the message arrives late". It does not: the wrist finishes its
//     HKWorkout asynchronously and Watch→phone propagation is a separate,
//     unbounded sync, so a watch that has not replied yet is also a watch whose
//     workout is not queryable yet. The relay and the query are the same bet, and
//     they lost together — the phone wrote a second copy of a session the wrist
//     had recorded. (Two quieter holes in the same query: `try?` turns any error
//     into "nothing found", and HealthKit reports a DENIED read as an empty
//     result, not an error. Neither can be detected from here.)
//
//     The uuid — the wrist's, an adopted one, or the one we wrote — travels to
//     the backend as `source_workout_ref`, which is exactly the key the ingest
//     uses to recognise the HealthKit copy of a session it already has
//     (web/lib/sync/ingest-healthkit.ts).
//
//  2. NEVER READ BACK OUR OWN NUMBERS. The app's own HealthKit observers watch
//     heart rate, active energy and distance. Without a guard, every sample we
//     write here would be re-ingested minutes later as if some device had
//     measured it — the athlete's active energy would count twice. Every sample
//     this writer produces is therefore stamped with `SaludNuestra.firma`, and
//     `HealthKitSyncService` drops stamped samples on the way in.
//
// The write is best-effort and never gates FAHYBRID's own save: no permission,
// no HealthKit, a HealthKit error — all return nil and the session is stored in
// FAHYBRID exactly as before.

/// One finished session, described in the terms Apple Health speaks.
struct HealthKitWorkoutDraft {
    /// One measured stretch of the session. Samples are written PER SEGMENT
    /// rather than one flat average across the whole workout, so Salud shows a
    /// real (if coarse) profile and its computed averages match ours.
    struct Segment {
        let startedAt: Date
        let endedAt: Date
        let energyKcal: Double?
        let distanceMeters: Double?
        let avgHeartRateBpm: Double?
    }

    let activityType: HKWorkoutActivityType
    let startedAt: Date
    let endedAt: Date
    /// Indoors: an erg, a treadmill, gym work. Drives both the workout's location
    /// type and `HKMetadataKeyIndoorWorkout`.
    let isIndoor: Bool
    let segments: [Segment]
}

enum HealthKitWorkoutWriter {
    /// Every quantity type this writer may produce. Authorization derives from
    /// this exact list (HealthKitPermissions.shareTypes), so a type can never end
    /// up written-but-unauthorized — HealthKit silently drops those samples and
    /// the workout would land in Salud with no distance or no energy.
    static let writtenQuantityIdentifiers: [HKQuantityTypeIdentifier] = [
        .heartRate,
        .activeEnergyBurned,
        .distanceWalkingRunning,
        .distanceCycling,
        .distanceRowing,
        .distanceCrossCountrySkiing,
    ]

    // MARK: - Modality → what Apple calls the same thing

    /// The FREE-workout modality wire vocabulary (row · ski · bike · run ·
    /// strength · functional — see web/lib/athlete/free-workout-validate.ts)
    /// mapped to Apple's activity types.
    ///
    /// This is DELIBERATELY finer than the four buckets the watch mirror uses
    /// (`PhoneMirrorService.activityType(for:)`, which speaks the coarse
    /// running/strength/hyrox/mixed vocabulary the wrist needs): a rowing session
    /// written to Salud as "mixed cardio" is a session the athlete cannot find.
    /// Ski erg maps to cross-country skiing because that is what Apple's
    /// vocabulary has and what Concept2's own app uses for the SkiErg.
    static func activityType(forModality modality: String) -> HKWorkoutActivityType {
        switch modality {
        case "row": return .rowing
        case "ski": return .crossCountrySkiing
        case "bike": return .cycling
        case "run": return .running
        case "strength": return .traditionalStrengthTraining
        case "functional": return .functionalStrengthTraining
        default: return .other
        }
    }

    /// The distance Apple records for a given activity — nil when the activity has
    /// no distance of its own (gym work), so no distance sample is written.
    static func distanceType(for activity: HKWorkoutActivityType) -> HKQuantityType? {
        let id: HKQuantityTypeIdentifier?
        switch activity {
        case .running: id = .distanceWalkingRunning
        case .cycling: id = .distanceCycling
        case .rowing: id = .distanceRowing
        case .crossCountrySkiing: id = .distanceCrossCountrySkiing
        default: id = nil
        }
        return id.flatMap { HKQuantityType.quantityType(forIdentifier: $0) }
    }

    /// Whether a modality happens indoors. Running is the only one the athlete
    /// decides per session (calle vs cinta), so the caller passes that in.
    static func isIndoor(modality: String, treadmill: Bool) -> Bool {
        modality == "run" ? treadmill : true
    }

    // MARK: - Save

    /// The uuid of the Apple Health workout that represents this session — writing
    /// it first if nobody had. Returns nil when nothing was or could be written
    /// (a wrist owns the recording, no HealthKit, write permission not granted, an
    /// empty or inverted interval, or a HealthKit failure). NEVER throws: the
    /// caller's own save must proceed regardless of what Salud does.
    ///
    /// `wristRecorded` — did an Apple Watch record this session and get told to save
    /// it? When YES this function writes NOTHING, whatever the query below finds.
    /// See rule 1 in the file header: it is the only guard that does not depend on
    /// the watch having answered.
    static func ensureSaved(_ draft: HealthKitWorkoutDraft, wristRecorded: Bool) async -> String? {
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        guard draft.endedAt > draft.startedAt else { return nil }

        // THE guard. The wrist finishes its HKWorkout asynchronously and Watch→phone
        // propagation is a separate, unbounded sync, so "the wrist has not answered
        // yet" and "the wrist's workout is not queryable yet" are the SAME state —
        // which is why the uuid relay and the overlap query below fail together
        // rather than covering each other. Only this flag survives that state.
        //
        // Cost of being wrong either way is not symmetric: a miss leaves one session
        // out of Salud, a duplicate double-counts the athlete's rings and energy
        // forever. The wrist was told to save; let it.
        if wristRecorded { return nil }

        let store = HKHealthStore()

        // Already there? Adopt it. Source-independent backstop — it catches a THIRD
        // app that recorded the same session, and a wrist workout that has already
        // propagated. It is NOT the never-twice guarantee (`wristRecorded` is): a
        // denied read returns an empty result rather than an error, so this query
        // can silently find nothing at all.
        if let existing = await overlappingWorkout(store: store, draft: draft) {
            return existing.uuid.uuidString
        }

        // Write access is the one HealthKit permission the system DOES report on
        // (read access is deliberately opaque). Not granted → degrade in silence:
        // the athlete said no to Salud, not to FAHYBRID.
        guard store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
            return nil
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = draft.activityType
        configuration.locationType = draft.isIndoor ? .indoor : .outdoor

        let builder = HKWorkoutBuilder(
            healthStore: store,
            configuration: configuration,
            device: .local()
        )

        do {
            try await builder.beginCollection(at: draft.startedAt)
            let samples = quantitySamples(for: draft)
            if !samples.isEmpty {
                try await builder.addSamples(samples)
            }
            try await builder.addMetadata([
                HKMetadataKeyIndoorWorkout: draft.isIndoor,
                SaludNuestra.firma: true,
            ])
            try await builder.endCollection(at: draft.endedAt)
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            // A half-built workout must not linger in Salud as a phantom session.
            builder.discardWorkout()
            return nil
        }
    }

    // MARK: - Already recorded?

    /// The workout already in Salud that IS this session, if there is one. Judged
    /// by overlap rather than by start time so back-to-back sessions are never
    /// confused with each other: something that covers at least half of our
    /// interval is the same effort, something that merely starts nearby is not.
    private static func overlappingWorkout(
        store: HKHealthStore,
        draft: HealthKitWorkoutDraft
    ) async -> HKWorkout? {
        let ours = DateInterval(start: draft.startedAt, end: draft.endedAt)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [
                .workout(HKQuery.predicateForSamples(withStart: ours.start, end: ours.end, options: []))
            ],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)],
            limit: Self.overlapCandidateLimit
        )
        guard let candidates = try? await descriptor.result(for: store) else { return nil }
        return candidates.first { candidate in
            let theirs = DateInterval(start: candidate.startDate, end: candidate.endDate)
            guard let shared = ours.intersection(with: theirs) else { return false }
            return shared.duration >= ours.duration * Self.sameSessionOverlapShare
        }
    }

    /// How many overlapping workouts to inspect. A single session can genuinely
    /// overlap a couple of neighbours; anything beyond that is noise.
    private static let overlapCandidateLimit = 10
    /// The share of our interval another workout must cover to BE our session.
    private static let sameSessionOverlapShare = 0.5

    // MARK: - Samples

    /// The per-segment samples that give the workout its totals: active energy,
    /// distance (when the activity has one) and heart rate (when something
    /// actually measured it). A bare cronómetro measures none of the three and
    /// simply produces no samples — the workout still records its duration.
    private static func quantitySamples(for draft: HealthKitWorkoutDraft) -> [HKQuantitySample] {
        let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)
        let distanceType = distanceType(for: draft.activityType)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let metadata: [String: Any] = SaludNuestra.metadata

        var samples: [HKQuantitySample] = []
        for segment in draft.segments {
            guard segment.endedAt > segment.startedAt else { continue }

            if let type = energyType, let kcal = segment.energyKcal, kcal > 0 {
                samples.append(HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                    start: segment.startedAt,
                    end: segment.endedAt,
                    metadata: metadata
                ))
            }
            if let type = distanceType, let meters = segment.distanceMeters, meters > 0 {
                samples.append(HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: .meter(), doubleValue: meters),
                    start: segment.startedAt,
                    end: segment.endedAt,
                    metadata: metadata
                ))
            }
            if let type = heartRateType, let hr = segment.avgHeartRateBpm, hr > 0 {
                samples.append(HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: bpm, doubleValue: hr),
                    start: segment.startedAt,
                    end: segment.endedAt,
                    metadata: metadata
                ))
            }
        }
        return samples
    }
}

// MARK: - Free workout → draft

extension HealthKitWorkoutDraft {
    /// Builds the draft straight off the payload the free save already sends, so
    /// Salud and FAHYBRID can never describe the same session differently. Returns
    /// nil when the payload carries no usable interval (nothing to write).
    ///
    /// `treadmill` is the athlete's own calle/cinta answer from the run pre-start;
    /// it is ignored for every other modality.
    init?(freeWorkout payload: FreeWorkoutPayload, treadmill: Bool) {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        guard let startedAt = payload.started_at.flatMap({ iso.date(from: $0) }),
              let endedAt = payload.ended_at.flatMap({ iso.date(from: $0) }),
              endedAt > startedAt
        else { return nil }

        let segments = (payload.segments ?? []).compactMap { dto -> Segment? in
            guard let start = iso.date(from: dto.started_at),
                  let end = iso.date(from: dto.ended_at),
                  end > start
            else { return nil }
            return Segment(
                startedAt: start,
                endedAt: end,
                energyKcal: dto.calories,
                distanceMeters: dto.distance_meters,
                avgHeartRateBpm: dto.avg_hr.map(Double.init)
            )
        }

        self.init(
            activityType: HealthKitWorkoutWriter.activityType(forModality: payload.modality),
            startedAt: startedAt,
            endedAt: endedAt,
            isIndoor: HealthKitWorkoutWriter.isIndoor(modality: payload.modality, treadmill: treadmill),
            segments: segments
        )
    }
}
