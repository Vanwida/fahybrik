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

    /// `enableBackgroundDelivery` / `disableAllBackgroundDelivery` threw
    /// `HKError.Code.errorAuthorizationDenied`. Profile wires this to the existing
    /// `healthDenied` route so we never claim Apple Health active.
    var onAuthorizationDenied: (@MainActor () -> Void)?

    // True once start() has registered its observer set. Guards start() so the
    // several lifecycle callsites (launch, deep-link auth, onboarding finish) plus
    // the Perfil (re)connect can all call it without stacking duplicate anchored
    // queries. stop() clears it, so a disconnect → reconnect re-registers cleanly.
    private var isObserving = false

    private static let anchorKeyPrefix = "fahybrik.hk.anchor."

    /// Recent-window floor (days) for the connect-time backfill of high-frequency
    /// daily metrics. Bounds the first pull so readiness repopulates fast instead
    /// of dragging years of raw samples; workouts are exempt (load wants history).
    /// Going FURTHER back than this is the athlete's own call — see
    /// `HealthKitHistoryImporter`, which sweeps date windows with explicit consent.
    private static let backfillWindowDays = 30

    /// When the athlete last turned Apple Health OFF. `stop()` writes it; `connect()`
    /// reads it to widen the first-pull floor over exactly the disconnected gap, then
    /// clears it. Without this, a reconnect after three months away pulled 30 days and
    /// the other two months were lost for good: `connect()` resets the anchors, so the
    /// anchor-delta path that would have covered the gap no longer exists.
    private static let disconnectedAtKey = "fahybrik.hk.disconnected_at"

    /// Tope del relleno automático del hueco de una desconexión. Más allá de esto la
    /// respuesta no es leer en silencio, es ofrecer el import con consentimiento.
    private static let maxGapFillDays = 90

    /// Page size for both the live drain and the history sweep. Bounds each payload.
    private static let pageLimit = 500

    // Every quantity metric the sync observes + backfills. Single source of truth so
    // start()'s observers, backfillAll()'s replay AND the history sweep
    // (`HealthKitHistoryWindowReader`) iterate the EXACT same set — si el pasado
    // trajera menos métricas que el presente, la gráfica del atleta cambiaría de
    // forma justo en la fecha en que empezó a usar la app. `step_count` canonicalises
    // to `steps` in the backend metric-map.
    static let quantityMetrics: [(id: HKQuantityTypeIdentifier, metric: String, unit: HKUnit)] = [
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
        // LEÍDO PERO NO SINCRONIZADO, y a propósito. La distancia se lee sólo para
        // CONTRASTAR la que midió nuestro GPS al terminar una carrera
        // (`HealthKitDistanceProbe`): es una segunda opinión que se guarda en la traza
        // de la sesión, no una métrica diaria del atleta. Por eso no entra en
        // `quantityMetrics`, que es la lista de lo que se sube como biometría.
        //
        // El aviso de la cabecera va sobre el sentido contrario —observado sin
        // permiso, que devuelve vacío en silencio—; esto es el lado seguro:
        // autorizado y usado por un camino que no es el del sync.
        if let distance = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) {
            types.insert(distance)
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

    func start(since: Date? = nil) {
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
        backfillAll(since: since ?? recentWindowFloor())
        // Un import de histórico consentido que se cortó (la app murió, se fue la red)
        // se retoma al arrancar. Sin consentimiento previo esto no hace nada.
        Task { @MainActor in HealthKitHistoryImporter.resumeForCurrentAthlete() }
        Task { await self.finishEnablingDeliveries() }
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
    func connect() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        resetAnchors()
        // El suelo del re-tirón cubre el HUECO de la desconexión, no unos 30 días
        // fijos: si estuvo tres meses desconectado, se piden tres meses. Se consume
        // aquí (una sola vez) para que el próximo reconectar no vuelva a arrastrarlo.
        let since = gapAwareFirstPullFloor()
        UserDefaults.standard.removeObject(forKey: Self.disconnectedAtKey)
        if isObserving {
            // Observers already registered this session (e.g. a launch-time start()):
            // just re-run the now-anchorless backfill to pull the full window fresh.
            backfillAll(since: since)
        } else {
            start(since: since)   // registers observers + runs the (now anchorless) backfill
        }
        // Y si el atleta ya consintió traerse su histórico y se quedó a medias, esto
        // lo retoma. No es preguntar de nuevo: es terminar lo que ya dijo que sí.
        Task { @MainActor in HealthKitHistoryImporter.resumeForCurrentAthlete() }
        try await enableRegisteredDeliveries()
    }

    func stop() {
        observerQueries.forEach { store.stop($0) }
        observerQueries.removeAll()
        // start() enabled background delivery per type; turn it all off so the app
        // stops waking to read Health data after a disconnect.
        Task { await self.finishDisablingDeliveries() }
        // Anchors are intentionally KEPT: a later reconnect re-runs start(), whose
        // backfill then does an anchor-delta pull that covers only the disconnected
        // gap — cheaper and cleaner than re-dragging the whole recent window.
        isObserving = false
        // Cuándo se apagó. Lo lee `connect()` para que el re-tirón cubra el hueco
        // entero, porque ahí SÍ se reinician los anclas y el delta desaparece.
        // Sólo se estampa la PRIMERA desconexión de una racha: dos toques seguidos
        // al interruptor no pueden acortar un hueco que sigue abierto.
        if UserDefaults.standard.object(forKey: Self.disconnectedAtKey) == nil {
            UserDefaults.standard.set(Date(), forKey: Self.disconnectedAtKey)
        }
    }

    /// Suelo de la primera tirada cuando no hay ancla: la ventana reciente de siempre.
    private func recentWindowFloor() -> Date {
        Calendar.current.date(byAdding: .day, value: -Self.backfillWindowDays, to: Date())
            ?? Date(timeIntervalSinceNow: -Double(Self.backfillWindowDays) * 86_400)
    }

    /// El suelo de un RECONECTAR: la ventana reciente, o el momento de la
    /// desconexión si fue hace más. Cubre el hueco exacto en vez de tragárselo.
    ///
    /// Y CON TOPE, que es lo que mantiene honesta la regla del consentimiento. Una
    /// desconexión larga deja de ser una pausa: rellenar un hueco de dos años en
    /// silencio sería traerse el histórico por la puerta de atrás. Eso lo hace el
    /// toggle de conectar, que es el único control.
    private func gapAwareFirstPullFloor() -> Date {
        let recent = recentWindowFloor()
        guard let disconnectedAt = UserDefaults.standard.object(forKey: Self.disconnectedAtKey) as? Date
        else { return recent }
        let ceiling = Calendar.current.date(byAdding: .day, value: -Self.maxGapFillDays, to: Date())
            ?? Date(timeIntervalSinceNow: -Double(Self.maxGapFillDays) * 86_400)
        return min(recent, max(disconnectedAt, ceiling))
    }

    // MARK: - Backfill

    /// On (re)connect the observers won't replay existing samples, so upload recent
    /// history for EVERY observed type through the same anchored flush → POST path
    /// the observers use (anchors advance, so future fires resume cleanly). Runs
    /// sequentially to keep payloads + backend load gentle, then signals completion
    /// so the connect flow can refresh readiness.
    private func backfillAll(since: Date) {
        Task {
            await self.flushWorkouts()
            for m in Self.quantityMetrics {
                guard let type = HKQuantityType.quantityType(forIdentifier: m.id) else { continue }
                await self.flushQuantity(type: type, metric: m.metric, unit: m.unit, firstPullSince: since)
            }
            if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
                await self.flushSleep(type: sleepType, firstPullSince: since)
            }
            let done = self.onBackfillCompleted
            await MainActor.run { done?() }
        }
    }

    // MARK: - Workouts

    private func observeWorkouts() {
        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
            guard let self else { completionHandler(); return }
            self.handleObserverFire(error: error, completionHandler: completionHandler) {
                await self.flushWorkouts()
            }
        }
        store.execute(query)
        observerQueries.append(query)
    }

    private func flushWorkouts() async {
        var anchor = readAnchor(for: "workouts")
        while true {
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.workout()],
                anchor: anchor,
                limit: Self.pageLimit
            )
            do {
                let result = try await descriptor.result(for: store)
                let workouts = result.addedSamples
                if !workouts.isEmpty {
                    let dtos = workouts.map { HealthKitSampleMapper.workout($0) }
                    // El ancla sólo avanza si el lote llegó o quedó encolado: si no,
                    // estos entrenos no volverían a entregarse nunca.
                    guard await sendBatch(workouts: dtos, samples: []).mayAdvanceAnchor else { return }
                }
                anchor = result.newAnchor
                writeAnchor(anchor, for: "workouts")
                if workouts.count < Self.pageLimit { return }
            } catch {
                // Failure path — leave last-written anchor so the next fire retries.
                return
            }
        }
    }

    // MARK: - Quantity types

    private func observeQuantity(_ id: HKQuantityTypeIdentifier, metric: String, unit: HKUnit) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            guard let self else { completionHandler(); return }
            self.handleObserverFire(error: error, completionHandler: completionHandler) {
                await self.flushQuantity(
                    type: type,
                    metric: metric,
                    unit: unit,
                    firstPullSince: self.recentWindowFloor()
                )
            }
        }
        store.execute(query)
        observerQueries.append(query)
    }

    private func flushQuantity(
        type: HKQuantityType,
        metric: String,
        unit: HKUnit,
        firstPullSince: Date
    ) async {
        let key = metric
        var anchor = readAnchor(for: key)
        // No saved anchor ⇒ this is the connect-time backfill: bound the first pull
        // to a recent window so readiness-critical daily metrics land immediately.
        // With an anchor we stream only new samples since it (no date filter).
        let datePredicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(withStart: firstPullSince, end: nil, options: [])
            : nil
        let pageLimit = Self.pageLimit

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
                let dtos = HealthKitSampleMapper.quantitySamples(
                    HealthKitSampleMapper.measuredOnly(samples),
                    metric: metric,
                    unit: unit
                )
                if !dtos.isEmpty {
                    // Mismo criterio que el resto: sin entrega ni cola, el ancla se
                    // queda donde está y el siguiente barrido reintenta estas muestras.
                    guard await sendBatch(workouts: [], samples: dtos).mayAdvanceAnchor else { return }
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
            guard let self else { completionHandler(); return }
            self.handleObserverFire(error: error, completionHandler: completionHandler) {
                await self.flushSleep(type: type, firstPullSince: self.recentWindowFloor())
            }
        }
        store.execute(query)
        observerQueries.append(query)
    }

    /// Apple: call `HKObserverQueryCompletionHandler` only after processing ends.
    /// If it is not called three times, HealthKit stops background updates.
    private func handleObserverFire(
        error: Error?,
        completionHandler: @escaping HKObserverQueryCompletionHandler,
        work: @escaping () async -> Void
    ) {
        Task {
            defer { completionHandler() }
            guard error == nil else { return }
            await work()
        }
    }

    static func isAuthorizationDenied(_ error: Error) -> Bool {
        if let hk = error as? HKError, hk.code == .errorAuthorizationDenied {
            return true
        }
        let ns = error as NSError
        return ns.domain == HKError.errorDomain
            && ns.code == HKError.Code.errorAuthorizationDenied.rawValue
    }

    /// Official overlay: `enableBackgroundDelivery(for:frequency:) async throws`.
    /// Sleep stays `.hourly` — HealthKit caps it below `.immediate`.
    private func enableRegisteredDeliveries() async throws {
        try await store.enableBackgroundDelivery(
            for: HKObjectType.workoutType(),
            frequency: .immediate
        )
        for m in Self.quantityMetrics {
            guard let type = HKQuantityType.quantityType(forIdentifier: m.id) else { continue }
            try await store.enableBackgroundDelivery(for: type, frequency: .immediate)
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            try await store.enableBackgroundDelivery(for: sleep, frequency: .hourly)
        }
    }

    private func finishEnablingDeliveries() async {
        do {
            try await enableRegisteredDeliveries()
        } catch {
            await handleDeliveryFailure(error)
        }
    }

    private func finishDisablingDeliveries() async {
        do {
            try await store.disableAllBackgroundDelivery()
        } catch {
            UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
            await surfaceAuthorizationDenied(error)
        }
    }

    private func handleDeliveryFailure(_ error: Error) async {
        UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        await surfaceAuthorizationDenied(error)
    }

    private func surfaceAuthorizationDenied(_ error: Error) async {
        guard Self.isAuthorizationDenied(error) else { return }
        let handler = onAuthorizationDenied
        await MainActor.run { handler?() }
    }

    private func flushSleep(type: HKCategoryType, firstPullSince: Date) async {
        let key = "sleep_duration"
        let anchor = readAnchor(for: key)
        // First pull (no anchor) = backfill → bound to the recent window; afterwards
        // stream only new nights since the anchor.
        let datePredicate: NSPredicate? = anchor == nil
            ? HKQuery.predicateForSamples(withStart: firstPullSince, end: nil, options: [])
            : nil
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: datePredicate)],
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        )
        do {
            let result = try await descriptor.result(for: store)
            let dtos = HealthKitSampleMapper.sleepNights(from: result.addedSamples)
            if !dtos.isEmpty {
                guard await sendBatch(workouts: [], samples: dtos).mayAdvanceAnchor else { return }
            }
            writeAnchor(result.newAnchor, for: key)
        } catch {
            // Leave anchor for retry on the next observer fire.
        }
    }

    // MARK: - Send

    /// Qué le pasó a un lote. El import del histórico lo necesita para no pasarse
    /// horas llenando la cola de lotes que nadie va a entregar — y el sync vivo lo
    /// necesita para saber si puede mover el ancla (ver `mayAdvanceAnchor`).
    ///
    /// El sync vivo lo IGNORABA, y ahí había una fuga silenciosa: un 401 (sesión
    /// muerta a mitad de barrido) o un 4xx determinista no se encolan, pero el ancla
    /// avanzaba igual, así que esas muestras del atleta no se volvían a entregar
    /// jamás. Mismo patrón que se cargaba los metros de una carrera.
    enum SendOutcome {
        case sent
        case queued
        case unauthorized
        case rejected

        /// Si el ancla puede avanzar después de esto.
        ///
        /// `sent` y `queued` sí: entregado, o guardado en la cola de reintentos, que
        /// ya no depende de HealthKit. `unauthorized` y `rejected` NO se encolan (ver
        /// `sendBatch`), así que avanzar el ancla con uno de esos tira las muestras
        /// PARA SIEMPRE — `HKAnchoredObjectQuery` no vuelve a entregar lo que quedó
        /// detrás del ancla. Es el mismo patrón que costó los metros de la carrera:
        /// descartar el dato y mover igualmente el cursor.
        var mayAdvanceAnchor: Bool {
            switch self {
            case .sent, .queued:            return true
            case .unauthorized, .rejected:  return false
            }
        }
    }

    /// LA ÚNICA PUERTA de subida para quien no sea este servicio. El barrido del
    /// histórico (`HealthKitHistoryWindowReader`) entra por aquí a propósito: comparte
    /// el bearer, la cola de reintentos, el manejo del 401 y el endpoint, así que el
    /// pasado y el presente del atleta viajan exactamente por el mismo camino.
    func upload(workouts: [HKWorkoutDTO], samples: [HKBiometricSampleDTO]) async -> SendOutcome {
        await sendBatch(workouts: workouts, samples: samples)
    }

    @discardableResult
    private func sendBatch(workouts: [HKWorkoutDTO], samples: [HKBiometricSampleDTO]) async -> SendOutcome {
        guard !workouts.isEmpty || !samples.isEmpty else { return .sent }
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
            return .sent
        } catch {
            // A dead bearer (401) will 401 on every retry — don't enqueue a doomed
            // request; trigger the app's session recovery (clear session → login).
            if case APIError.http(401, _) = error {
                let handler = onUnauthorized
                await MainActor.run { handler?() }
                return .unauthorized
            }
            // AUDIT — generalizes the 401 guard above: no deterministic 4xx is queued.
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(wrapper) {
                await RequestQueue.shared.enqueue(
                    path: Self.endpointPath,
                    body: body,
                    bearer: bearer
                )
                return .queued
            }
            return .rejected
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
