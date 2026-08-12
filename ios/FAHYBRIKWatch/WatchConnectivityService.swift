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
final class WatchConnectivityService: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityService()

    @Published private(set) var isReachable: Bool = false

    /// Durable outbox for finished-execution envelopes (array of encoded Data).
    private let outboxKey = "fahybrik.watch.outbox.v1"

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
        guard let data = try? WatchWire.encoder.encode(envelope) else { return }
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
        guard let data = try? WatchWire.encoder.encode(envelope) else { return nil }
        enqueueOutbox(data)
        return data
    }

    /// Swap the staged entry for a re-encoded one (the toggle changed the decision).
    /// Removes `previous` and enqueues the new bytes; still NOT transferred. Returns
    /// the new bytes (the caller's new staged handle), or `previous` on encode failure.
    func restageExecutionResult(previous: Data?, envelope: WatchExecutionEnvelope) -> Data? {
        guard let data = try? WatchWire.encoder.encode(envelope) else { return previous }
        if let previous, previous != data { removeFromOutbox(previous) }
        enqueueOutbox(data)
        return data
    }

    /// Transfer an already-staged entry (fired by "Listo"). It stays in the outbox
    /// until `didFinish` confirms delivery, so a failure still re-drains later.
    func transferStagedResult(_ data: Data) {
        transfer(data)
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
        guard session.activationState == .activated else { return }   // drained on activation
        session.transferUserInfo([WatchWireKeys.executionResult: data])
    }

    // MARK: - Outbox
    //
    // The `…Locked` helpers touch UserDefaults directly and MUST run inside
    // `outboxQueue`; the public mutators wrap a whole load→mutate→save as one
    // critical section on that queue so concurrent callers can't clobber each other.

    private func loadOutboxLocked() -> [Data] {
        UserDefaults.standard.array(forKey: outboxKey) as? [Data] ?? []
    }

    private func saveOutboxLocked(_ items: [Data]) {
        UserDefaults.standard.set(items, forKey: outboxKey)
    }

    private func enqueueOutbox(_ data: Data) {
        outboxQueue.sync {
            var items = loadOutboxLocked()
            guard !items.contains(data) else { return }
            items.append(data)
            saveOutboxLocked(items)
        }
    }

    private func removeFromOutbox(_ data: Data) {
        outboxQueue.sync {
            var items = loadOutboxLocked()
            items.removeAll { $0 == data }
            saveOutboxLocked(items)
        }
    }

    /// Re-transfer any queued result not already in flight — so a result enqueued
    /// while unreachable (or across a kill) still reaches the phone.
    private func drainOutbox() {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let queued = outboxQueue.sync { loadOutboxLocked() }
        let inFlight = session.outstandingUserInfoTransfers.compactMap {
            $0.userInfo[WatchWireKeys.executionResult] as? Data
        }
        for data in queued where !inFlight.contains(data) {
            session.transferUserInfo([WatchWireKeys.executionResult: data])
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
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
        drainOutbox()
        // La traza medida en la muñeca lleva su propio buzón de ficheros, y este es
        // el momento en que el teléfono puede haber vuelto a estar a tiro.
        WatchTraceOutbox.shared.drain()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        Task { @MainActor in
            WatchPlanModel.shared.update(from: applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        Task { @MainActor in
            WatchPlanModel.shared.update(from: message)
        }
    }

    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        guard let data = userInfoTransfer.userInfo[WatchWireKeys.executionResult] as? Data else { return }
        // Delivered → drop it. On error, leave it queued: WCSession retries the
        // transfer, and drainOutbox re-issues it on the next activation.
        if error == nil {
            removeFromOutbox(data)
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
