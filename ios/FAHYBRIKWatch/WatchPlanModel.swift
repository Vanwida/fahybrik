import Foundation

// Watch-side plan state. The iPhone pushes the day's session + readiness as an
// encoded `WatchTodayPayload` (WatchConnectivity applicationContext); we persist it
// and decode the embedded assignment detail so the watch can build the SAME
// WorkoutPlan and run the SAME engine as the phone. The wire shape lives in the
// shared WatchWireModels — no hand-synced mirror on this side anymore.
@MainActor
final class WatchPlanModel: ObservableObject {
    static let shared = WatchPlanModel()

    /// Today's session + readiness, as pushed from the iPhone.
    @Published private(set) var today: WatchTodayPayload?

    /// The full assignment detail, decoded from `today.detailJson` — the watch builds
    /// its WorkoutPlan (and runs the shared engine) from this. Nil when the phone sent
    /// a summary-only payload (over the size ceiling) or a rest day.
    @Published private(set) var assignmentDetail: AssignmentDetail?

    private let key = "fahybrik.watch.today.v2"
    private static let legacyKey = "fahybrik.watch.plan.today"

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

    // MARK: - Internals

    private func apply(_ payload: WatchTodayPayload, persisting data: Data) {
        today = payload
        assignmentDetail = payload.detailJson.flatMap {
            try? WatchWire.detailDecoder.decode(AssignmentDetail.self, from: $0)
        }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func clear() {
        today = nil
        assignmentDetail = nil
        UserDefaults.standard.removeObject(forKey: key)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? WatchWire.decoder.decode(WatchTodayPayload.self, from: data) else { return }
        today = decoded
        assignmentDetail = decoded.detailJson.flatMap {
            try? WatchWire.detailDecoder.decode(AssignmentDetail.self, from: $0)
        }
    }
}
