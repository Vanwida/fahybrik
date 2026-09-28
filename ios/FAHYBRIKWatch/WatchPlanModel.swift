import Foundation

// Watch-side plan state. The iPhone pushes the day's session + readiness as an
// encoded `WatchTodayPayload` (WatchConnectivity applicationContext); we persist it
// and decode the embedded assignment detail so the watch can build the SAME
// WorkoutPlan and run the SAME engine as the phone. The wire shape lives in the
// shared WatchWireModels — no hand-synced mirror on this side anymore.
//
// EL DETALLE QUE NO CABE EN EL CONTEXTO llega por fichero (`receiveDetailFile`) y se
// guarda aparte, por asignación. Si falta, se pide al iPhone (`requestDetailIfMissing`):
// sin él la muñeca no empieza nada contra la asignación (`WatchSessionPlan`).
@MainActor
final class WatchPlanModel: ObservableObject {
    static let shared = WatchPlanModel()

    /// Today's session + readiness, as pushed from the iPhone.
    @Published private(set) var today: WatchTodayPayload?

    /// The full assignment detail — from `today.detailJson`, or from the file the
    /// phone sent when it didn't fit. The watch builds its WorkoutPlan (and runs the
    /// shared engine) from this. Nil on a rest day, or while the detail is on its way.
    @Published private(set) var assignmentDetail: AssignmentDetail?

    private let key = "fahybrik.watch.today.v2"
    private static let legacyKey = "fahybrik.watch.plan.today"
    /// El detalle que llegó por fichero: `StoredDetail` en JSON. Uno solo, el del día.
    private let fileDetailKey = "fahybrik.watch.detail-file.v1"

    private struct StoredDetail: Codable {
        let assignmentId: String
        let detailJson: Data
    }

    private init() {
        // Migrate off the v1 shape (WatchPlannedWorkout): it is not forward-
        // compatible, so just drop it — a stale summary never mis-decodes into the
        // new model, it simply re-syncs on the next push.
        UserDefaults.standard.removeObject(forKey: Self.legacyKey)
        load()
    }

    // MARK: - Update entry points (applicationContext + message both land here)

    /// The iPhone sends the encoded `WatchTodayPayload` as a single Data value under
    /// `WatchWireKeys.today`; an empty dictionary means CLEAR (rest day / no session).
    func update(from payload: [String: Any]) {
        if let data = payload[WatchWireKeys.today] as? Data {
            update(fromData: data)
        } else if payload.isEmpty {
            clear()
        }
    }

    func update(fromData data: Data) {
        guard let decoded = try? WatchWire.decoder.decode(WatchTodayPayload.self, from: data) else { return }
        apply(decoded, persisting: data)
    }

    /// Flip today's card to the completed state locally — the moment the watch
    /// finishes a session, before the iPhone's re-push lands — carrying the EARNED
    /// completeness ("full" | "partial") so the done screen tells the truth. Keeps the
    /// decoded detail so the finished session stays inspectable.
    func markDoneLocally(completeness: String) {
        guard let current = today, !current.isDone else { return }
        let done = current.markingDone(completeness: completeness)
        today = done
        if let data = try? WatchWire.encoder.encode(done) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    // MARK: - El detalle por fichero

    /// El iPhone mandó el detalle de una sesión como fichero (no cabía en el
    /// contexto, o el reloj lo pidió). Se guarda para esa asignación y, si es la de
    /// hoy, pasa a ser el detalle del día. Los bytes ya están leídos: WatchConnectivity
    /// borra el fichero en cuanto vuelve su delegado.
    func receiveDetailFile(_ data: Data, assignmentId: String) {
        guard let detail = try? WatchWire.detailDecoder.decode(AssignmentDetail.self, from: data) else {
            DiagnosticsLog.shared.record(.link, .sessionDetail, outcome: .failed, domain: "decode",
                                         detail: "bytes=\(data.count)")
            return
        }
        if let stored = try? JSONEncoder().encode(StoredDetail(assignmentId: assignmentId, detailJson: data)) {
            UserDefaults.standard.set(stored, forKey: fileDetailKey)
        }
        // El del contexto manda; si hoy no vino en él, el fichero más reciente.
        let isToday = today?.assignmentId == assignmentId
        if isToday, today?.detailJson == nil { assignmentDetail = detail }
        DiagnosticsLog.shared.record(.link, .sessionDetail, outcome: .ok,
                                     detail: "received bytes=\(data.count) today=\(isToday)")
    }

    /// Pide al iPhone el detalle que falta (día de sesión por hacer, sin detalle).
    /// Idempotente: el servicio no apila peticiones iguales.
    func requestDetailIfMissing() {
        guard let id = WatchDayDetail.toRequest(today: today, detail: assignmentDetail) else { return }
        WatchConnectivityService.shared.requestDetail(assignmentId: id)
    }

    // MARK: - Internals

    private func apply(_ payload: WatchTodayPayload, persisting data: Data) {
        today = payload
        assignmentDetail = detail(for: payload)
        WatchClubAccentState.current = payload.clubAccent
        UserDefaults.standard.set(data, forKey: key)
        requestDetailIfMissing()
    }

    private func clear() {
        today = nil
        assignmentDetail = nil
        // El acento del club es del atleta cuyo plan se acaba de limpiar (logout /
        // sin sesión) — no debe sobrevivir a quien entre después en este reloj.
        WatchClubAccentState.current = nil
        UserDefaults.standard.removeObject(forKey: key)
        UserDefaults.standard.removeObject(forKey: fileDetailKey)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? WatchWire.decoder.decode(WatchTodayPayload.self, from: data) else { return }
        today = decoded
        assignmentDetail = detail(for: decoded)
        WatchClubAccentState.current = decoded.clubAccent
    }

    /// El del contexto; si no vino, el del fichero guardado para esa asignación.
    private func detail(for payload: WatchTodayPayload) -> AssignmentDetail? {
        let fromContext = payload.detailJson.flatMap {
            try? WatchWire.detailDecoder.decode(AssignmentDetail.self, from: $0)
        }
        return WatchDayDetail.pick(
            assignmentId: payload.assignmentId,
            fromContext: fromContext,
            fromFile: fromContext == nil ? storedFileDetail() : nil
        )
    }

    private func storedFileDetail() -> (assignmentId: String, detail: AssignmentDetail)? {
        guard let raw = UserDefaults.standard.data(forKey: fileDetailKey),
              let stored = try? JSONDecoder().decode(StoredDetail.self, from: raw),
              let detail = try? WatchWire.detailDecoder.decode(AssignmentDetail.self, from: stored.detailJson)
        else { return nil }
        return (stored.assignmentId, detail)
    }
}
