import Foundation
import WatchConnectivity

// Watch-side WCSession bridge. Two directions:
//
//   • iPhone → Watch: the day's session + readiness arrives via
//     didReceiveApplicationContext (or a message) → WatchPlanModel.update.
//
//   • Watch → iPhone: a finished execution is handed to `sendExecutionResult`,
//     which queues it via transferUserInfo. That channel already persists across
//     launches/reachability; we ALSO keep a durable outbox and re-drain on
//     activation so a result survives an app kill before the system flush
//     (at-least-once delivery). The phone submits it to the backend.
//
//     El sobre sale del buzón con el ACUSE del teléfono, no con la entrega
//     (`WatchSaveLedger`, fase 1): hasta que el servidor contesta, la muñeca guarda
//     su copia.
final class WatchConnectivityService: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityService()

    @Published private(set) var isReachable: Bool = false

    /// Durable outbox for finished-execution envelopes: a `WatchSaveLedger` in JSON.
    private let outboxKey = "fahybrik.watch.outbox.v2"
    /// El buzón anterior (una lista de sobres). Se lee una vez y pasa al nuevo.
    private let legacyOutboxKey = "fahybrik.watch.outbox.v1"

    /// Serializes ALL outbox reads/writes. enqueue (coordinator, MainActor), remove
    /// (didFinish, WCSession delegate queue) and drain (activation, delegate queue)
    /// otherwise interleave a load→mutate→save on the same key from different threads
    /// and lose entries. One serial queue makes each mutation atomic.
    private let outboxQueue = DispatchQueue(label: "fahybrik.watch.outbox.serial")

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: - Watch → iPhone (finished execution)

    /// Queue a finished execution for delivery to the iPhone. Persisted to the outbox
    /// first, then handed to WCSession.transferUserInfo (which queues across launches
    /// and reachability). The phone decodes it and submits to the backend.
    func sendExecutionResult(_ envelope: WatchExecutionEnvelope) {
        guard let data = try? WatchWire.encoder.encode(Self.named(envelope)) else {
            DiagnosticsLog.shared.record(.save, .executionHandedToPhone, outcome: .failed, domain: "encode")
            return
        }
        enqueueOutbox(data)
        transfer(data)
    }

    // #23 — STAGED send (dobles share toggle). The result is persisted to the outbox
    // at finish with the DEFAULT decision but NOT transferred yet; the summary toggle
    // swaps the staged entry, and "Listo" transfers it. Crash-safety is independent
    // of the toggle: if the app dies before "Listo", the next activation drains
    // whatever is staged (the default, or a toggled value if it was already swapped).

    /// Persist an execution envelope to the outbox WITHOUT transferring it yet.
    /// Returns the encoded bytes so the caller can later swap or transfer exactly
    /// this entry. Nil only on an encode failure.
    func stageExecutionResult(_ envelope: WatchExecutionEnvelope) -> Data? {
        guard let data = try? WatchWire.encoder.encode(Self.named(envelope)) else { return nil }
        mutateOutbox { $0.insert(data, staged: true) }
        return data
    }

    /// Swap the staged entry for a re-encoded one (the toggle changed the decision).
    /// Removes `previous` and enqueues the new bytes; still NOT transferred. Returns
    /// the new bytes (the caller's new staged handle), or `previous` on encode failure.
    func restageExecutionResult(previous: Data?, envelope: WatchExecutionEnvelope) -> Data? {
        // El sobre re-escenificado es el MISMO entreno: conserva su nombre, así que
        // un acuse del escenificado (si ya salió tras una caída) también lo nombra.
        var renamed = envelope
        renamed.envelopeId = previous.flatMap(WatchSaveLedger.envelopeId(of:)) ?? envelope.envelopeId
        guard let data = try? WatchWire.encoder.encode(Self.named(renamed)) else { return previous }
        mutateOutbox { $0.replace(previous, with: data) }
        return data
    }

    /// Un sobre sale del reloj siempre con nombre: es lo que el acuse devuelve.
    private static func named(_ envelope: WatchExecutionEnvelope) -> WatchExecutionEnvelope {
        guard envelope.envelopeId == nil else { return envelope }
        var named = envelope
        named.envelopeId = UUID().uuidString
        return named
    }

    /// Transfer an already-staged entry (fired by "Listo"). It stays in the outbox
    /// until `didFinish` confirms delivery, so a failure still re-drains later.
    func transferStagedResult(_ data: Data) {
        transfer(data)
    }

    /// FH-101 — durable athlete-finish aviso when the HK mirror is unreachable.
    /// `sendMessage` when paired + reachable; always `transferUserInfo` as backup.
    func notifyPhoneLiveEnded(_ ended: MirrorEnded) {
        guard let body = WatchLiveEnded.encode(ended) else { return }
        let session = WCSession.default
        DiagnosticsLog.shared.record(
            .link, .liveEndSent,
            outcome: session.activationState == .activated ? .ok : .failed,
            detail: "reason=\(ended.reason) activated=\(session.activationState == .activated) reachable=\(session.isReachable)"
        )
        guard session.activationState == .activated else { return }
        if session.isReachable {
            session.sendMessage(body, replyHandler: nil) { _ in
                session.transferUserInfo(body)
            }
        } else {
            session.transferUserInfo(body)
        }
    }

    // MARK: - Sensor archive (fase 0)

    /// Hand a finished sensor capture file to the phone for archive (only when the
    /// athlete consented). Uses transferFile — never the live channel.
    func transferSensorCapture(fileURL: URL, metadata: [String: Any]) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        session.transferFile(fileURL, metadata: metadata)
    }

    private func transfer(_ data: Data) {
        let session = WCSession.default
        guard session.activationState == .activated else {   // drained on activation
            DiagnosticsLog.shared.record(.save, .executionHandedToPhone, outcome: .failed,
                                         domain: "not_activated", detail: "bytes=\(data.count) outbox")
            return
        }
        session.transferUserInfo([WatchWireKeys.executionResult: data])
        mutateOutbox { $0.markHanded(data, at: Date()) }
        DiagnosticsLog.shared.record(.save, .executionHandedToPhone, outcome: .ok, detail: "bytes=\(data.count)")
    }

    // MARK: - Outbox
    //
    // The `…Locked` helpers touch UserDefaults directly and MUST run inside
    // `outboxQueue`; the public mutators wrap a whole load→mutate→save as one
    // critical section on that queue so concurrent callers can't clobber each other.

    private func loadOutboxLocked() -> WatchSaveLedger {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: outboxKey),
           let ledger = try? JSONDecoder().decode(WatchSaveLedger.self, from: data) {
            return ledger
        }
        // Primera vez con el buzón nuevo: lo que hubiera en el viejo pasa entero.
        let legacy = defaults.array(forKey: legacyOutboxKey) as? [Data] ?? []
        return WatchSaveLedger.migrating(legacy: legacy)
    }

    private func saveOutboxLocked(_ ledger: WatchSaveLedger) {
        guard let data = try? JSONEncoder().encode(ledger) else { return }
        UserDefaults.standard.set(data, forKey: outboxKey)
        UserDefaults.standard.removeObject(forKey: legacyOutboxKey)
    }

    /// Una mutación del buzón = una sección crítica entera (leer → cambiar → guardar).
    @discardableResult
    private func mutateOutbox<T>(_ change: (inout WatchSaveLedger) -> T) -> T {
        outboxQueue.sync {
            var ledger = loadOutboxLocked()
            let result = change(&ledger)
            saveOutboxLocked(ledger)
            return result
        }
    }

    private func enqueueOutbox(_ data: Data) {
        mutateOutbox { $0.insert(data) }
    }

    /// Entrega lo que el buzón dice que toca (`WatchSaveLedger.toHand`): lo
    /// pendiente, y lo entregado hace más de una hora sin acuse. Al arrancar
    /// (`afterLaunch`), también lo escenificado que se quedó sin «Listo».
    private func drainOutbox(afterLaunch: Bool = false) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let inFlight = session.outstandingUserInfoTransfers.compactMap {
            $0.userInfo[WatchWireKeys.executionResult] as? Data
        }
        let due = outboxQueue.sync { loadOutboxLocked() }
            .toHand(now: Date(), inFlight: inFlight, afterLaunch: afterLaunch)
        for data in due { transfer(data) }
    }

    /// El acuse del teléfono: el servidor guardó, rechazó, o el teléfono lo tiene.
    private func applyReceipt(_ body: [String: Any]) -> Bool {
        guard let raw = body[WatchWireKeys.executionReceipt] as? Data else { return false }
        guard let receipt = try? JSONDecoder().decode(WatchExecutionReceipt.self, from: raw) else {
            DiagnosticsLog.shared.record(.save, .executionReceipt, outcome: .failed, domain: "decode")
            return true
        }
        let known = mutateOutbox { $0.apply(receipt) }
        DiagnosticsLog.shared.record(
            .save, .executionReceipt,
            outcome: receipt.outcome == .rejected ? .failed : .ok,
            detail: "outcome=\(receipt.outcome.rawValue) known=\(known)"
        )
        return true
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DiagnosticsLog.shared.record(
            .link, .wcActivated, error: error,
            detail: "state=\(activationState.rawValue) companion=\(session.isCompanionAppInstalled) reachable=\(session.isReachable)"
        )
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
        // Cold start: if the phone pushed the day while the watch app was dead, that
        // push is NOT redelivered via didReceiveApplicationContext — WCSession only
        // keeps the LATEST context, surfaced here. Read it through the same update
        // path so the plan lands now instead of waiting for the next push.
        let context = session.receivedApplicationContext
        if !context.isEmpty {
            Task { @MainActor in WatchPlanModel.shared.update(from: context) }
        }
        // Una sola activación por proceso: es el arranque, y un sobre escenificado
        // que se quedó sin «Listo» es de un proceso que murió.
        drainOutbox(afterLaunch: true)
        // La traza medida en la muñeca lleva su propio buzón de ficheros, y este es
        // el momento en que el teléfono puede haber vuelto a estar a tiro.
        WatchTraceOutbox.shared.drain()
        DiagnosticsForwarder.forwardPending()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DiagnosticsLog.shared.record(.link, .wcReachability, detail: "reachable=\(session.isReachable)")
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
        // El teléfono vuelve a estar a tiro: lo que espera acuse desde hace más de
        // una hora sale otra vez.
        if session.isReachable { drainOutbox() }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        Task { @MainActor in
            WatchPlanModel.shared.update(from: applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        Task { @MainActor in
            if Self.applyLiveEnd(message) { return }
            WatchPlanModel.shared.update(from: message)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        if applyReceipt(userInfo) { return }
        // La vía encolada del mismo aviso: si al pulsar Terminar en el móvil el
        // reloj estaba fuera de alcance, llega por aquí en cuanto vuelve.
        Task { @MainActor in
            if Self.applyLiveEnd(userInfo) { return }
            WatchPlanModel.shared.update(from: userInfo)
        }
    }

    /// «El entreno ya terminó en el teléfono». Devuelve true si el aviso era este,
    /// para que no siga su camino como si fuera un plan del día.
    ///
    /// Coach motor (`WatchWorkoutCoordinator`) plus the one PRIMARY owner.
    /// Each finish no-ops if that side is idle. Not a second HK path.
    @MainActor
    private static func applyLiveEnd(_ body: [String: Any]) -> Bool {
        guard let save = WatchLiveEnd.saveFlag(in: body) else { return false }
        // C-01: un `live_end` viejo que llega al arrancar termina la grabación nueva.
        DiagnosticsLog.shared.record(
            .link, .liveEndReceived,
            detail: "save=\(save) primary=\(WatchPrimaryOwner.shared.phase) coordinator=\(WatchWorkoutCoordinator.shared.phase)"
        )
        WatchWorkoutCoordinator.shared.finishFromPhone()
        WatchPrimaryOwner.shared.finishFromPhone(save: save)
        return true
    }

    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        if let error {
            DiagnosticsLog.shared.record(.save, .transferFailed, error: error,
                                         detail: userInfoTransfer.userInfo.keys.sorted().joined(separator: ","))
            DiagnosticsForwarder.transferFailed(userInfoTransfer.userInfo)
        }
        guard let data = userInfoTransfer.userInfo[WatchWireKeys.executionResult] as? Data else { return }
        // Llegó al teléfono: un sobre con nombre espera ahora su acuse (el del
        // servidor); uno sin nombre, de un reloj anterior, se borra como siempre.
        // Con error se queda: WCSession lo reintenta y el drenado lo vuelve a sacar.
        if error == nil {
            mutateOutbox { $0.deliveredToPhone(data, at: Date()) }
        }
    }

    /// Fin de una transferencia de FICHERO — hoy, la traza de la muñeca. Entregada se
    /// borra del buzón; fallida se queda y sale en el siguiente drenado. Se vuelve a
    /// drenar aquí porque una entrega buena significa que el teléfono está a tiro, y
    /// puede haber más ficheros esperando detrás.
    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        WatchTraceOutbox.shared.didFinish(fileTransfer, error: error)
        if error == nil { WatchTraceOutbox.shared.drain() }
    }
}
