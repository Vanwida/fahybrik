import Foundation
import HealthKit
import os

// UN dueño de HKWorkoutSession en la muñeca. Apple: `HKWorkoutSessionType.primary`
// es «a primary session running on watchOS»; `.mirrored` es «on the companion iOS
// device». Esta clase es el primary. El teléfono se suscribe. El coordinador
// (solitario) y el espejo (HUD + canal) son dos lecturas de LA MISMA instancia.
//
// Cierre, en este orden, porque el canal muere con la sesión y el uuid solo
// existe después de `finishWorkout` (`HKWorkoutBuilder.finishWorkout`):
//   1. endCollection + finishWorkout, acotados
//   2. onWillTearDownChannel (el `ended` sale por la sesión que aún vive)
//   3. session.end()
@MainActor
final class LiveWorkoutSession: NSObject, ObservableObject {
    @Published private(set) var isActive: Bool = false
    @Published private(set) var isPaused: Bool = false
    @Published private(set) var heartRate: Double = 0
    @Published private(set) var activeKcal: Double = 0
    @Published private(set) var distanceMeters: Double = 0

    /// LO QUE LLEVA GRABADO ESTA SESIÓN, SEGÚN APPLE.
    ///
    /// `HKLiveWorkoutBuilder.elapsedTime` — «The elapsed time for the
    /// workout based on the builder’s current contents, including pauses».
    /// Cero hasta `beginCollection`. No es un crono nuestro.
    var elapsedSeconds: TimeInterval { builder?.elapsedTime ?? 0 }

    /// Actividad de la sesión recuperada (`recoverActiveWorkoutSession`).
    var recoveredActivityType: HKWorkoutActivityType? {
        session?.workoutConfiguration.activityType
    }

    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?
    /// Paquetes del teléfono por el canal del espejo
    /// (`HKWorkoutSessionDelegate.workoutSession(_:didReceiveDataFromRemoteWorkoutSession:)`).
    var onRemoteData: ((Data) -> Void)?
    /// Justo antes de `session.end()`, con la sesión capturada de ESTA época —
    /// el `ended` tiene que salir por ella, no por `self.session`, que un
    /// force-release puede haber sustituido durante el save.
    var onWillTearDownChannel: ((_ workoutUuid: String?, _ session: HKWorkoutSession) async -> Void)?
    /// La sesión se acabó sin que lo pidiéramos nosotros (fallo o fin del sistema).
    var onEndedExternally: (() -> Void)?
    /// Apple pasó a `.running` / `.paused` (`workoutSession(_:didChangeTo:)`).
    /// El HUD no es la sesión: esto es cuando la primary de verdad vive.
    var onBecameLive: (() -> Void)?

    private var lastReportedDistance: Double = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var isClosing = false
    private var isMirroring = false
    private var endWaiters: [CheckedContinuation<String?, Never>] = []

    private static let log = Logger(subsystem: Marca.subsistemaLog("live"), category: "watch-session")
    /// `finishWorkout` se ha visto colgarse y dejar la muñeca en «Guardando…»
    /// con la sesión viva; el escape era apagar el reloj.
    private static let saveTimeout: Duration = .seconds(8)
    /// Esperas entre intentos de `startMirroringToCompanionDevice`. El primero
    /// va sin esperar; los demás dan tiempo al canal del acompañante.
    private static let mirrorRetryDelays: [TimeInterval] = [0, 0.5, 2.0, 5.0]

    // MARK: - Authorization

    static let workoutDataTypes: Set<HKSampleType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.heartRate),
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.distanceWalkingRunning)
    ]

    static func requestWorkoutAuthorization(store: HKHealthStore) async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try? await store.requestAuthorization(toShare: workoutDataTypes, read: workoutDataTypes)
    }

    func requestAuthorization() async {
        let workout = HKObjectType.workoutType()
        if store.authorizationStatus(for: workout) == .sharingAuthorized { return }
        await Self.requestWorkoutAuthorization(store: store)
    }

    /// `HKHealthStore.recoverActiveWorkoutSession` — «Recovers an active
    /// workout session». La misma primary, no otra. Apple avisa por
    /// `handleActiveWorkoutRecovery` cuando el proceso muere a mitad.
    func recoverActiveIfNeeded() async {
        guard session == nil else { return }
        let recovered: HKWorkoutSession? = await withCheckedContinuation { cont in
            store.recoverActiveWorkoutSession { session, error in
                if let error {
                    Self.log.error("recoverActiveWorkoutSession: \(error.localizedDescription, privacy: .public)")
                }
                cont.resume(returning: session)
            }
        }
        guard let recovered, recovered.state != .ended else { return }
        let builder = recovered.associatedWorkoutBuilder()
        recovered.delegate = self
        builder.delegate = self
        self.session = recovered
        self.builder = builder
        switch recovered.state {
        case .running, .paused:
            applyAppleState(recovered.state)
        case .prepared, .notStarted:
            recovered.prepare()
            recovered.startActivity(with: Date())
            applyAppleState(recovered.state)
        default:
            self.session = nil
            self.builder = nil
            return
        }
        if isActive {
            onBecameLive?()
            await subscribeCompanion()
        }
        Self.log.info("sesión recuperada")
    }

    // MARK: - Start / pause / resume

    func start(activityType: HKWorkoutActivityType, locationType: HKWorkoutSessionLocationType) async {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType
        await start(configuration: config)
    }

    /// Arranca ESTA primary, o la lleva a `.running` si el objeto ya existe
    /// pero Apple aún no la ha puesto en marcha. Un objeto `HKWorkoutSession`
    /// no es una sesión viva: `isActive` sigue `session.state` (`.running` /
    /// `.paused`). El walk de `1be0aad4` pintó las 3 páginas con 00:00 porque
    /// el primer `start` creaba el objeto, marcaba `isActive` y el segundo
    /// salía por `session != nil` sin `startActivity` ni `beginCollection`.
    func start(configuration config: HKWorkoutConfiguration) async {
        if isClosing {
            _ = await close(save: true)
        }
        if session == nil {
            do {
                let session = try HKWorkoutSession(healthStore: store, configuration: config)
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
                session.delegate = self
                builder.delegate = self
                self.session = session
                self.builder = builder
            } catch {
                Self.log.error("HKWorkoutSession no se pudo crear: \(error.localizedDescription, privacy: .public)")
                return
            }
        }
        guard let session, let builder else { return }

        switch session.state {
        case .notStarted:
            session.prepare()
            session.startActivity(with: Date())
        case .prepared:
            session.startActivity(with: Date())
        case .running, .paused:
            break
        default:
            applyAppleState(session.state)
            return
        }

        // `beginCollection(withStart:)` «Sets the workout’s start date and
        // begins building the workout». Es el del builder vivo, no el
        // `beginCollection(at:)` del writer offline. Sin esto
        // `elapsedTime` es 0 — el 00:00 del walk.
        if builder.startDate == nil {
            let start = session.startDate ?? Date()
            let ok = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                builder.beginCollection(withStart: start) { success, error in
                    if !success {
                        Self.log.error("beginCollection: \(error?.localizedDescription ?? "sin error", privacy: .public)")
                    }
                    cont.resume(returning: success)
                }
            }
            if !ok {
                Self.log.error("beginCollection no armó el builder — startActivity sigue; no se mata la sesión")
            }
        }
        applyAppleState(session.state)
        if isActive {
            onBecameLive?()
            await subscribeCompanion()
        }
    }

    /// `HKWorkoutSessionState.running` «The workout session is running».
    /// `paused` es la misma sesión, detenida. Cualquier otro estado no es live.
    func applyAppleState(_ state: HKWorkoutSessionState) {
        switch state {
        case .running:
            isActive = true
            isPaused = false
        case .paused:
            isActive = true
            isPaused = true
        default:
            isActive = false
            isPaused = false
        }
    }

    func pause() {
        session?.pause()
        isPaused = true
    }

    func resume() {
        session?.resume()
        isPaused = false
    }

    // MARK: - Companion (el teléfono se suscribe)

    /// `HKWorkoutSession.startMirroringToCompanionDevice` — watchOS 10. El
    /// iPhone recibe la sesión `.mirrored` en `workoutSessionMirroringStartHandler`.
    func subscribeCompanion() async {
        guard let session, session.state == .running else { return }
        if isMirroring { return }
        for (intento, espera) in Self.mirrorRetryDelays.enumerated() {
            if espera > 0 { try? await Task.sleep(for: .seconds(espera)) }
            guard self.session === session, !isClosing else { return }
            do {
                try await session.startMirroringToCompanionDevice()
                isMirroring = true
                Self.log.info("espejo abierto al teléfono (intento \(intento + 1, privacy: .public))")
                return
            } catch {
                Self.log.error("startMirroringToCompanionDevice falló (intento \(intento + 1, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            }
        }
        Self.log.error("el teléfono no pudo suscribirse al espejo — la muñeca graba sola")
    }

    /// `HKWorkoutSession.sendToRemoteWorkoutSession(data:)` — iOS 17 / watchOS 10.
    func sendToCompanion(_ data: Data) async {
        guard let session else { return }
        try? await session.sendToRemoteWorkoutSession(data: data)
    }

    // MARK: - End

    /// Cierra GUARDANDO. Idempotente: un segundo llamante espera el mismo uuid.
    @discardableResult
    func end() async -> String? {
        await close(save: true)
    }

    func discard() async {
        _ = await close(save: false)
    }

    /// Último recurso (muñeca atascada semanas). No espera al save.
    func forceRelease() {
        session?.end()
        let waiters = endWaiters
        endWaiters = []
        reset()
        waiters.forEach { $0.resume(returning: nil) }
    }

    private func close(save: Bool) async -> String? {
        if session == nil, !isClosing { return nil }
        if isClosing {
            return await withCheckedContinuation { endWaiters.append($0) }
        }
        isClosing = true
        let closingSession = session
        let closingBuilder = builder

        var uuid: String?
        if save {
            uuid = await saveWithTimeout(session: closingSession, builder: closingBuilder)
        } else {
            closingBuilder?.discardWorkout()
        }

        if let closingSession {
            await onWillTearDownChannel?(uuid, closingSession)
        }
        closingSession?.end()

        let waiters = endWaiters
        endWaiters = []
        if session === closingSession {
            reset()
        } else {
            isClosing = false
        }
        waiters.forEach { $0.resume(returning: uuid) }
        return uuid
    }

    /// End collection + finishWorkout, but never wait longer than `saveTimeout`.
    /// On timeout we end the HK session so HealthKit unblocks even if the save
    /// await is stuck (cancellation alone does not abort a hung HealthKit call).
    private func saveWithTimeout(session: HKWorkoutSession?,
                                 builder: HKLiveWorkoutBuilder?) async -> String? {
        await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            var resumed = false
            func resumeOnce(_ value: String?) {
                guard !resumed else { return }
                resumed = true
                cont.resume(returning: value)
            }
            Task { @MainActor in
                resumeOnce(await Self.endAndSave(builder: builder))
            }
            Task { @MainActor in
                try? await Task.sleep(for: Self.saveTimeout)
                session?.end()
                resumeOnce(nil)
            }
        }
    }

    /// `HKWorkoutBuilder.endCollection(withEnd:)` + `finishWorkout`. La firma
    /// va ANTES de sellar — ver `SaludNuestra`.
    private static func endAndSave(builder: HKLiveWorkoutBuilder?) async -> String? {
        guard let builder else { return nil }
        do {
            try? await builder.addMetadata(SaludNuestra.metadata)
            try await builder.endCollection(at: Date())
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
    }

    private func reset() {
        session = nil
        builder = nil
        isActive = false
        isPaused = false
        isClosing = false
        isMirroring = false
        heartRate = 0
        activeKcal = 0
        distanceMeters = 0
        lastReportedDistance = 0
    }
}

// MARK: - HKWorkoutSessionDelegate

extension LiveWorkoutSession: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session else { return }
            for packet in data { self.onRemoteData?(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session else { return }
            self.applyAppleState(toState)
            if toState == .running {
                self.onBecameLive?()
                await self.subscribeCompanion()
            }
            guard toState == .ended else { return }
            // Cierre nuestro: ya guardamos ANTES de session.end(). Un segundo
            // finishWorkout aquí era el otro diseño, y unificarlos es no
            // mezclarlos.
            guard !self.isClosing else { return }
            _ = await self.close(save: true)
            self.onEndedExternally?()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session else { return }
            if self.isClosing { return }
            self.forceRelease()
            self.onEndedExternally?()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension LiveWorkoutSession: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for type in collectedTypes {
            guard let qType = type as? HKQuantityType else { continue }
            let stats = workoutBuilder.statistics(for: qType)
            Task { @MainActor [weak self] in
                guard let self, workoutBuilder === self.builder else { return }
                self.apply(stats: stats, type: qType)
            }
        }
    }

    @MainActor
    private func apply(stats: HKStatistics?, type: HKQuantityType) {
        guard let stats else { return }
        switch type {
        case HKQuantityType(.heartRate):
            if let q = stats.mostRecentQuantity() {
                heartRate = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                if heartRate > 0 { onHeartRate?(Int(heartRate.rounded())) }
            }
        case HKQuantityType(.activeEnergyBurned):
            if let q = stats.sumQuantity() {
                activeKcal = q.doubleValue(for: .kilocalorie())
            }
        case HKQuantityType(.distanceWalkingRunning):
            if let q = stats.sumQuantity() {
                distanceMeters = q.doubleValue(for: .meter())
                let delta = distanceMeters - lastReportedDistance
                if delta > 0 {
                    lastReportedDistance = distanceMeters
                    onDistanceDelta?(delta)
                }
            }
        default:
            break
        }
    }
}
