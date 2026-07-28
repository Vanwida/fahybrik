import Foundation
import HealthKit

// HealthKit observer + transform + batch upload pipeline.
//
// Strategy:
//   1. start() registers HKObserverQuery on workouts + HR + HRV + RHR + VO2Max
//      + activeEnergy + bodyMass + steps + sleep.
//   2. Each fire pulls new samples since last anchor, transforms to DTO matching
//      shared/schema/biometrics.ts, and POSTs `/api/sync/healthkit`.
//   3. If POST fails, the batch is queued via RequestQueue and replayed later.
//   4. Anchor is persisted to UserDefaults per type.
//
// Backend `/api/sync/healthkit` is built by another agent later. Until then,
// every batch lands on the queue and replays on next reachability.
final class HealthKitSyncService {
    static let shared = HealthKitSyncService()
    static let endpointPath = "/api/sync/healthkit"

    private let store = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []
    private var bearer: String? = nil
    private var athleteId: String? = nil

    /// Invoked when an upload is rejected with 401 (dead bearer). Set by AppRoot
    /// to the app's session recovery (clear session → login), so a dead token
    /// doesn't just re-queue a request that will 401 forever. @MainActor because
    /// it mutates AuthState / UI state.
    var onUnauthorized: (@MainActor () -> Void)?

    // True once start() has registered its observer set. Guards start() so the
    // several lifecycle callsites (launch, deep-link auth, onboarding finish) plus
    // the Perfil (re)connect can all call it without stacking duplicate anchored
    // queries. stop() clears it, so a disconnect → reconnect re-registers cleanly.
    private var isObserving = false

    private static let anchorKeyPrefix = "fahybrik.hk.anchor."

    /// Recent-window floor (days) for the connect-time backfill of high-frequency
    /// daily metrics. Bounds the first pull so readiness repopulates fast instead
    /// of dragging years of raw samples; workouts are exempt (load wants history).
    private static let backfillWindowDays = 30

    // Every quantity metric the sync observes + backfills. Single source of truth so
    // start()'s observers and backfillAll()'s replay iterate the EXACT same set (no
    // drift). `step_count` canonicalises to `steps` in the backend metric-map.
    private static let quantityMetrics: [(id: HKQuantityTypeIdentifier, metric: String, unit: HKUnit)] = [
        (.heartRate,                "heart_rate",         HKUnit(from: "count/min")),
        (.heartRateVariabilitySDNN, "hrv_sdnn",           .secondUnit(with: .milli)),
        (.restingHeartRate,         "resting_heart_rate", HKUnit(from: "count/min")),
        (.vo2Max,                   "vo2_max",            HKUnit(from: "ml/kg*min")),
        (.activeEnergyBurned,       "active_energy_kcal", .kilocalorie()),
        (.bodyMass,                 "body_mass_kg",       .gramUnit(with: .kilo)),
        (.stepCount,                "step_count",         .count()),
    ]

    /// Every anchor key the sync persists — derived from the SAME single source
    /// (quantityMetrics) the observers use, plus the two non-quantity keys, so a
    /// reset can never miss one and leave a metric stuck on a stale anchor. Order
    /// mirrors backfillAll()'s flush sequence.
    private static var allAnchorKeys: [String] {
        ["workouts"] + quantityMetrics.map { $0.metric } + ["sleep_duration"]
    }

    /// The COMPLETE set of HealthKit types this app reads — the single source of
    /// truth. Both authorization (HealthKitPermissions.readTypes) and the observers
    /// + backfill below derive from this exact set, so a type can never end up
    /// observed-but-unauthorized (queries return empty) or authorized-but-unsynced.
    /// That silent drift between two hand-kept lists is precisely what could leave a
    /// reconnect delivering only some metrics.
    static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        for m in quantityMetrics {
            if let t = HKObjectType.quantityType(forIdentifier: m.id) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        return types
    }

    /// Invoked on the main actor once a connect-time backfill has finished uploading
    /// every metric. The Perfil connect flow sets it to refresh readiness so
    /// "¿Cómo llegas hoy?" repopulates; left unset for launch-time syncs.
    var onBackfillCompleted: (() -> Void)? = nil

    func configure(bearer: String?, athleteId: String?) {
        self.bearer = bearer
        self.athleteId = athleteId
    }

    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        // Idempotent: repeated calls without an intervening stop() are a no-op, so
        // the app never stacks duplicate observers that would race on the shared
        // per-type anchor (advancing it out from under each other → missed samples).
        guard !isObserving else { return }
        isObserving = true
        observeWorkouts()
        for m in Self.quantityMetrics {
            observeQuantity(m.id, metric: m.metric, unit: m.unit)
        }
        observeSleep()
        // Observers only deliver FUTURE changes; on a fresh connect they never replay
        // existing history, and on a reconnect the saved anchors mean this pull
        // fetches exactly the samples added while disconnected (gap coverage). Without
        // it, only going-forward samples would ever upload and readiness stays empty.
        backfillAll()
    }

    /// Explicit user connect — the Perfil Apple Health toggle turning ON. Unlike the
    /// launch-time `start()` (which resumes each type from its saved anchor, fetching
    /// only the offline gap), a MANUAL connect re-pulls the whole recent window: it
    /// clears every per-type anchor, then runs a fresh bounded backfill. This is the
    /// market-standard "reconnect = resync" (Whoop/Strava) and the root fix for
    /// permissions granted LATER than the first sync: a query that ran while READ was
    /// denied still returns empty yet advances + persists its anchor, so without this
    /// reset the whole pre-grant history — last night's sleep, today's HRV, the 14–60d
    /// HRV baseline — is skipped forever and "¿Cómo llegas hoy?" stays empty. Re-uploaded
    /// samples de-dupe server-side (ingest-healthkit.ts), so the re-pull never doubles data.
    func connect() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        resetAnchors()
        if isObserving {
            // Observers already registered this session (e.g. a launch-time start()):
            // just re-run the now-anchorless backfill to pull the full window fresh.
            backfillAll()
        } else {
            start()   // registers observers + runs the (now anchorless) backfill
        }
    }

    func stop() {
        observerQueries.forEach { store.stop($0) }
        observerQueries.removeAll()
        // start() enabled background delivery per type; turn it all off so the app
        // stops waking to read Health data after a disconnect. No-op if none set.
        store.disableAllBackgroundDelivery { _, _ in }
        // Anchors are intentionally KEPT: a later reconnect re-runs start(), whose
        // backfill then does an anchor-delta pull that covers only the disconnected
        // gap — cheaper and cleaner than re-dragging the whole recent window.
        isObserving = false
    }

    // MARK: - Backfill

    /// On (re)connect the observers won't replay existing samples, so upload recent
    /// history for EVERY observed type through the same anchored flush → POST path
    /// the observers use (anchors advance, so future fires resume cleanly). Runs
    /// sequentially to keep payloads + backend load gentle, then signals completion
    /// so the connect flow can refresh readiness.
    private func backfillAll() {
        Task {
            await self.flushWorkouts()
            for m in Self.quantityMetrics {
                guard let type = HKQuantityType.quantityType(forIdentifier: m.id) else { continue }
                await self.flushQuantity(type: type, metric: m.metric, unit: m.unit)
            }
            if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
                await self.flushSleep(type: sleepType)
            }
            let done = self.onBackfillCompleted
            await MainActor.run { done?() }
        }
    }

    /// Recent-window floor for the connect-time backfill of high-frequency daily
    /// metrics (HRV / resting HR / sleep / steps …), so the first pull stays bounded.
    private var backfillSince: Date {
        Calendar.current.date(byAdding: .day, value: -Self.backfillWindowDays, to: Date())
            ?? Date(timeIntervalSinceNow: -Double(Self.backfillWindowDays) * 86_400)
    }

    // MARK: - Workouts

    private func observeWorkouts() {
        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Task { await self.flushWorkouts() }
        }
        store.execute(query)
        observerQueries.append(query)
        store.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, _ in }
    }

    private func flushWorkouts() async {
        let anchor = readAnchor(for: "workouts")
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.workout()],
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        )

        do {
            let result = try await descriptor.result(for: store)
            let workouts = result.addedSamples
            guard !workouts.isEmpty else {
                writeAnchor(result.newAnchor, for: "workouts")
                return
            }
            let dtos = workouts.map { transform(workout: $0) }
            await sendBatch(workouts: dtos, samples: [])
            writeAnchor(result.newAnchor, for: "workouts")
        } catch {
            // Failure path — leave anchor unchanged so next observer fire re-tries.
        }
    }

    private func transform(workout: HKWorkout) -> HKWorkoutDTO {
        let iso = ISO8601DateFormatter()
        let lapEvents = workout.workoutEvents?.filter {
            $0.type == .lap || $0.type == .segment || $0.type == .marker
        } ?? []
        let laps = lapEvents.map { ev -> HKWorkoutLapDTO in
            let kind: String
            switch ev.type {
            case .lap: kind = "lap"
            case .segment: kind = "segment"
            default: kind = "marker"
            }
            let start = ev.dateInterval.start
            let end = ev.dateInterval.end
            return HKWorkoutLapDTO(
                started_at: iso.string(from: start),
                ended_at: iso.string(from: end),
                duration_seconds: end.timeIntervalSince(start),
                event_kind: kind
            )
        }

        // Apple ships these identifiers, so the lookups never fail in practice —
        // but a force-unwrap is a latent crash. Resolve once; if an identifier is
        // ever nil, the corresponding metric stays nil (DTO fields are optional)
        // instead of trapping.
        let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)
        let bpmUnit = HKUnit(from: "count/min")

        let energy = energyType.flatMap { workout.statistics(for: $0) }?
            .sumQuantity()?.doubleValue(for: .kilocalorie())
        let distance = workout.totalDistance?.doubleValue(for: .meter())
        let avgHR = heartRateType.flatMap { workout.statistics(for: $0) }?
            .averageQuantity()?.doubleValue(for: bpmUnit)
        let maxHR = heartRateType.flatMap { workout.statistics(for: $0) }?
            .maximumQuantity()?.doubleValue(for: bpmUnit)

        return HKWorkoutDTO(
            source_workout_id: workout.uuid.uuidString,
            workout_activity_type: Int(workout.workoutActivityType.rawValue),
            started_at: iso.string(from: workout.startDate),
            ended_at: iso.string(from: workout.endDate),
            duration_seconds: workout.duration,
            total_energy_burned_kcal: energy,
            total_distance_meters: distance,
            avg_heart_rate_bpm: avgHR,
            max_heart_rate_bpm: maxHR,
            lap_markers: laps,
            source: "healthkit"
        )
    }

    // MARK: - Quantity types

    private func observeQuantity(_ id: HKQuantityTypeIdentifier, metric: String, unit: HKUnit) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Task { await self.flushQuantity(type: type, metric: metric, unit: unit) }
        }
        store.execute(query)
        observerQueries.append(query)
        store.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
    }

    private func flushQuantity(type: HKQuantityType, metric: String, unit: HKUnit) async {
        let key = metric
        var anchor = readAnchor(for: key)
        // No saved anchor ⇒ this is the connect-time backfill: bound the first pull
        // to a recent window so readiness-critical daily metrics land immediately.
        // With an anchor we stream only new samples since it (no date filter).
        let datePredicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(withStart: backfillSince, end: nil, options: [])
            : nil
        let pageLimit = 500
        let iso = ISO8601DateFormatter()

        // Page in fixed batches (bounded payloads) until the backlog drains, rather
        // than uploading only 500 and waiting for another observer fire to continue.
        while true {
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.quantitySample(type: type, predicate: datePredicate)],
                anchor: anchor,
                limit: pageLimit
            )
            do {
                let result = try await descriptor.result(for: store)
                let samples = result.addedSamples
                // Never re-ingest what WE wrote. `HealthKitWorkoutWriter` stamps the
                // energy / distance / heart-rate samples it attaches to a
                // phone-recorded workout; without this filter each of them would come
                // straight back through this observer as if a device had measured it,
                // and the athlete's active energy would be counted twice. Samples from
                // the watch app (a different writer) carry no stamp and flow normally.
                let measured = samples.filter {
                    $0.metadata?[HealthKitWorkoutWriter.writtenHereKey] == nil
                }
                let dtos: [HKBiometricSampleDTO] = measured.map { s in
                    HKBiometricSampleDTO(
                        metric_type: metric,
                        recorded_at: iso.string(from: s.startDate),
                        value_numeric: s.quantity.doubleValue(for: unit),
                        unit: unitString(for: metric),
                        source: "healthkit",
                        source_workout_id: nil
                    )
                }
                if !dtos.isEmpty {
                    await sendBatch(workouts: [], samples: dtos)
                }
                anchor = result.newAnchor
                writeAnchor(anchor, for: key)
                if samples.count < pageLimit { break }   // drained this batch
            } catch {
                // Leave the last-written anchor so the next observer fire retries.
                break
            }
        }
    }

    private func unitString(for metric: String) -> String {
        switch metric {
        case "heart_rate", "resting_heart_rate": return "bpm"
        case "hrv_sdnn": return "ms"
        case "vo2_max": return "ml/kg/min"
        case "active_energy_kcal": return "kcal"
        case "body_mass_kg": return "kg"
        case "step_count": return "count"
        default: return ""
        }
    }

    // MARK: - Sleep (category type)
    //
    // Sleep is an HKCategoryType, not a quantity, so it needs its own observer and
    // anchored read — the quantity path above can't handle it. Each fire reads new
    // sleepAnalysis samples since the last anchor, sums the *asleep* segments into a
    // per-night total (seconds) and uploads one `sleep_duration` sample per night
    // through the same flush → POST path as every other metric.

    private func observeSleep() {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return }
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Task { await self.flushSleep(type: type) }
        }
        store.execute(query)
        observerQueries.append(query)
        // Sleep background delivery is capped below `.immediate`; hourly is plenty
        // for a nightly metric.
        store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
    }

    private func flushSleep(type: HKCategoryType) async {
        let key = "sleep_duration"
        let anchor = readAnchor(for: key)
        // First pull (no anchor) = backfill → bound to the recent window; afterwards
        // stream only new nights since the anchor.
        let datePredicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(withStart: backfillSince, end: nil, options: [])
            : nil
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: datePredicate)],
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        )
        do {
            let result = try await descriptor.result(for: store)
            let dtos = sleepDurationDTOs(from: result.addedSamples)
            if !dtos.isEmpty {
                await sendBatch(workouts: [], samples: dtos)
            }
            writeAnchor(result.newAnchor, for: key)
        } catch {
            // Leave anchor for retry on the next observer fire.
        }
    }

    /// Groups asleep segments by night (keyed on the local day the athlete woke —
    /// the sample's end date), merges overlapping intervals per night so concurrent
    /// samples from multiple sources are never double-counted, and emits one nightly
    /// `sleep_duration` DTO. Value = asleep seconds (the unit the backend expects —
    /// see ingest-garmin.ts + biometric-trend.ts, which divides by 3600 for hours).
    private func sleepDurationDTOs(from samples: [HKCategorySample]) -> [HKBiometricSampleDTO] {
        let asleep = Self.asleepCategoryValues
        let calendar = Calendar.current
        var nights: [Date: [(start: Date, end: Date)]] = [:]
        for s in samples where asleep.contains(s.value) {
            let nightDay = calendar.startOfDay(for: s.endDate)
            nights[nightDay, default: []].append((s.startDate, s.endDate))
        }

        let iso = ISO8601DateFormatter()
        return nights.compactMap { nightDay, intervals -> HKBiometricSampleDTO? in
            let seconds = Self.mergedDurationSeconds(intervals)
            guard seconds > 0 else { return nil }
            return HKBiometricSampleDTO(
                metric_type: "sleep_duration",
                recorded_at: iso.string(from: nightDay),
                value_numeric: seconds,
                unit: "seconds",
                source: "healthkit",
                source_workout_id: nil
            )
        }
    }

    /// Total covered time (seconds) of a set of intervals with overlaps merged.
    private static func mergedDurationSeconds(_ intervals: [(start: Date, end: Date)]) -> Double {
        let sorted = intervals.sorted { $0.start < $1.start }
        var total: Double = 0
        var current: (start: Date, end: Date)? = nil
        for iv in sorted where iv.end > iv.start {
            if var cur = current, iv.start <= cur.end {
                if iv.end > cur.end { cur.end = iv.end }
                current = cur
            } else {
                if let cur = current { total += cur.end.timeIntervalSince(cur.start) }
                current = iv
            }
        }
        if let cur = current { total += cur.end.timeIntervalSince(cur.start) }
        return total
    }

    /// Category values that count as "asleep" (excludes inBed and awake).
    /// Deployment target is iOS 18, so the granular iOS 16 stages are always
    /// available; `.asleepUnspecified` is the same raw value the pre-iOS-16
    /// `.asleep` used, so legacy samples are covered too.
    private static let asleepCategoryValues: Set<Int> = [
        HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
        HKCategoryValueSleepAnalysis.asleepREM.rawValue,
    ]

    // MARK: - Send

    private func sendBatch(workouts: [HKWorkoutDTO], samples: [HKBiometricSampleDTO]) async {
        guard !workouts.isEmpty || !samples.isEmpty else { return }
        let batch = HKSyncBatch(
            athlete_id: athleteId,
            sent_at: ISO8601DateFormatter().string(from: Date()),
            timezone: TimeZone.current.identifier,
            workouts: workouts,
            samples: samples
        )

        struct Wrapper: Encodable {
            let batch: HKSyncBatch
        }
        let wrapper = Wrapper(batch: batch)

        do {
            try await APIClient.shared.postRaw(path: Self.endpointPath, body: wrapper, bearer: bearer)
        } catch {
            // A dead bearer (401) will 401 on every retry — don't enqueue a doomed
            // request; trigger the app's session recovery (clear session → login).
            if case APIError.http(401, _) = error {
                let handler = onUnauthorized
                await MainActor.run { handler?() }
                return
            }
            // AUDIT — generalizes the 401 guard above: no deterministic 4xx is queued.
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(wrapper) {
                await RequestQueue.shared.enqueue(
                    path: Self.endpointPath,
                    body: body,
                    bearer: bearer
                )
            }
        }
    }

    // MARK: - Anchor persistence

    /// Clears every persisted per-type anchor so the next flush treats each metric as
    /// a first-time pull (bounded backfill window). Called only by connect() — never
    /// on a disconnect, where a plain reconnect keeps anchors to fetch just the gap.
    private func resetAnchors() {
        let defaults = UserDefaults.standard
        for key in Self.allAnchorKeys {
            defaults.removeObject(forKey: Self.anchorKeyPrefix + key)
        }
    }

    private func readAnchor(for key: String) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: Self.anchorKeyPrefix + key) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func writeAnchor(_ anchor: HKQueryAnchor?, for key: String) {
        guard let anchor else { return }
        if let data = try? NSKeyedArchiver.archivedData(
            withRootObject: anchor,
            requiringSecureCoding: true
        ) {
            UserDefaults.standard.set(data, forKey: Self.anchorKeyPrefix + key)
        }
    }
}
