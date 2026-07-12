import Foundation
import WatchConnectivity

// iPhone-side bridge to the watch. Two directions:
//
//   • iPhone → Watch (push): the day's session + readiness, sent via
//     WCSession.updateApplicationContext. Application context OVERWRITES itself,
//     the right semantics for "current day" — no stale queue builds up on the
//     watch. The full assignment detail is embedded so the watch can build the
//     SAME WorkoutPlan and run the SAME engine as the phone.
//
//   • Watch → iPhone (results): a finished execution arrives via
//     didReceiveUserInfo. We decode it into the exact WorkoutExecutionPayload the
//     phone's own live finish posts, submit it through the SAME offline-first path
//     (WorkoutExecutionAPI), mark the assignment done locally, and re-push so the
//     watch flips to the completed state.
//
// Activated from AppRoot / Inicio on every authenticated launch. When the watch is
// not paired or the iPhone is offline, pushes are no-ops — the watch keeps its last
// good context until we successfully push again.
final class WatchConnectivityiOSService: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityiOSService()

    private override init() { super.init() }

    /// The last payload pushed for today. Reused to re-push a "done" marker after a
    /// watch execution lands — preserving the readiness/detail already sent, without
    /// a fresh fetch. MainActor-isolated so push + results handling never race on it.
    @MainActor private var lastTodayPayload: WatchTodayPayload?

    /// A push (or clear) fired BEFORE WCSession finished activating. Activation is
    /// async, so the first cold-launch push would otherwise be silently dropped;
    /// we hold the latest here and flush it from `activationDidCompleteWith`.
    @MainActor private var pendingContext: PendingContext?

    private enum PendingContext {
        case push(WatchTodayPayload)
        case clear
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.delegate == nil { session.delegate = self }
        if session.activationState != .activated {
            session.activate()
        }
    }

    // MARK: - iPhone → Watch push

    /// Push today to the watch from REAL home data. `dayKind` decides the shape:
    ///
    ///   • `.session` — a real assignment for today (pending OR already done). Fetches
    ///     the assignment detail (local cache first, network fallback) so the watch
    ///     can build the full WorkoutPlan; embeds it under the applicationContext
    ///     size ceiling, else falls back to a summary-only push. A missing/empty id
    ///     is a caller bug for a session day → CLEAR rather than push a shell.
    ///   • `.rest` — a genuine rest day: no assignment, but the readiness fields still
    ///     ride so the athlete glances readiness on the wrist. NOT an empty context
    ///     (empty is reserved for logout/no-data — see `clearToday`).
    @MainActor
    func pushToday(
        dayKind: String,
        assignmentId: String?,
        title: String?,
        focus: String?,
        estDurationMinutes: Int?,
        intensityLabel: String?,
        modality: String?,
        athleteHrMax: Int?,
        readiness: DailyReadinessPayload?,
        isDone: Bool,
        doneCompleteness: String?,
        isDoubles: Bool,
        partnerFirstName: String?,
        partnerVisibility: String?,
        bearer: String?
    ) async {
        activate()
        guard WCSession.isSupported() else { return }

        // Rest day: no session to run, but readiness still glances on the wrist.
        guard dayKind == WatchDayKind.session else {
            send(Self.restPayload(readiness: readiness))
            return
        }

        // Session day needs a real assignment; without one there is nothing to run.
        guard let assignmentId, let title, !assignmentId.isEmpty, !title.isEmpty else {
            clearToday()
            return
        }

        // Detail: cached copy first (instant, survives offline), network fallback.
        var detail = AssignmentDetailCache.load(assignmentId)
        if detail == nil, let bearer {
            detail = try? await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
        }

        let payload = WatchTodayPayload(
            dayKind: WatchDayKind.session,
            assignmentId: assignmentId,
            title: title,
            focus: focus,
            estDurationMinutes: estDurationMinutes,
            intensityLabel: intensityLabel,
            activityKind: Self.activityKind(from: modality),
            athleteHrMax: athleteHrMax,
            readinessScore: readiness?.score,
            readinessDelta7d: readiness?.delta7d,
            readinessWorstDriver: Self.worstDriver(readiness?.breakdown),
            isDone: isDone,
            doneCompleteness: isDone ? doneCompleteness : nil,
            isDoubles: isDoubles,
            partnerFirstName: isDoubles ? partnerFirstName : nil,
            partnerVisibility: isDoubles ? partnerVisibility : nil,
            detailJson: detail.flatMap(Self.encodeDetail)
        )
        send(payload)
    }

    /// A rest-day payload: no assignment fields, readiness only.
    private static func restPayload(readiness: DailyReadinessPayload?) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: WatchDayKind.rest,
            assignmentId: nil,
            title: nil,
            focus: nil,
            estDurationMinutes: nil,
            intensityLabel: nil,
            activityKind: nil,
            athleteHrMax: nil,
            readinessScore: readiness?.score,
            readinessDelta7d: readiness?.delta7d,
            readinessWorstDriver: worstDriver(readiness?.breakdown),
            isDone: false,
            doneCompleteness: nil,
            isDoubles: false,
            partnerFirstName: nil,
            partnerVisibility: nil,
            detailJson: nil
        )
    }

    /// Encode the detail for transport: snake_case body (the same shape
    /// AssignmentDetailCache stores) with technique-video URLs stripped (the watch
    /// never plays video — dead weight against the size ceiling).
    private static func encodeDetail(_ detail: AssignmentDetail) -> Data? {
        guard let raw = try? WatchWire.detailEncoder.encode(detail) else { return nil }
        return WatchWire.strippingVideoURLs(from: raw)
    }

    @MainActor
    private func send(_ payload: WatchTodayPayload) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default

        // Encode (+ size-cap fallback) up front so the pending copy held across an
        // activation race is already transport-ready.
        var finalPayload = payload
        guard var data = try? WatchWire.encoder.encode(finalPayload) else { return }
        // Over the applicationContext ceiling with the embedded detail → send the
        // summary only; the watch runs a minimal session and re-fetches on open.
        if data.count > WatchWire.maxContextBytes, payload.detailJson != nil {
            finalPayload = payload.droppingDetail()
            guard let slim = try? WatchWire.encoder.encode(finalPayload) else { return }
            data = slim
        }

        // Activation is async: a push fired before it completes is silently dropped
        // by WCSession. Hold the latest and flush it from activationDidCompleteWith.
        guard session.activationState == .activated else {
            pendingContext = .push(finalPayload)
            return
        }
        guard session.isPaired, session.isWatchAppInstalled else { return }

        do {
            try session.updateApplicationContext([WatchWireKeys.today: data])
            lastTodayPayload = finalPayload
        } catch {
            // Silent; watch keeps its last known good context.
        }
    }

    @MainActor
    func clearToday() {
        let session = WCSession.default
        guard session.activationState == .activated else {
            pendingContext = .clear
            return
        }
        try? session.updateApplicationContext([:])
        lastTodayPayload = nil
        pendingContext = nil
    }

    /// Flush a push/clear that was held while WCSession activated. Called once from
    /// `activationDidCompleteWith(.activated)`.
    @MainActor
    private func flushPendingContext() {
        guard let pending = pendingContext else { return }
        pendingContext = nil
        switch pending {
        case .push(let payload): send(payload)
        case .clear:             clearToday()
        }
    }

    // MARK: - Watch → iPhone results

    @MainActor
    private func handleIncomingExecution(_ data: Data) async {
        // A finished workout must never be lost: if the bytes don't decode, park
        // the raw envelope in the dead-letter store and retry on every activation
        // (the WCSession transfer is consumed once, and the watch outbox entry was
        // already removed on didFinish — there is no second copy anywhere else).
        if await submitEncodedExecution(data) == false {
            WatchExecutionDeadLetter.append(data)
        }
    }

    /// Decode a raw execution envelope and submit it through the phone's own
    /// offline-first path. Returns `false` ONLY when the bytes fail to decode (the
    /// dead-letter trigger). A network failure still returns `true`: the submit
    /// enqueues via RequestQueue, so the work is durably captured, not lost.
    @MainActor
    private func submitEncodedExecution(_ data: Data) async -> Bool {
        guard let envelope = try? WatchWire.decoder.decode(WatchExecutionEnvelope.self, from: data),
              let payload = try? WatchWire.decoder.decode(WorkoutExecutionPayload.self, from: envelope.payloadJson)
        else { return false }

        let bearer = KeychainTokenStore.shared.read()   // AUDIT-B1 — bearer moved to the Keychain

        // Fork solo vs dobles-joint exactly like the phone's own finish
        // (PostWorkoutSummaryView.handleSave): a dobles-pair session logs against
        // the per-assignment joint endpoint (records the SAME execution + links the
        // partner + shares the result); everything else takes the solo path.
        //
        // #23 — the wrist's share toggle rides on the envelope: log jointly ONLY when
        // this is a dobles session AND the athlete kept sharing on (default true for
        // an older watch binary with no field). A self_only/individual session never
        // had a toggle, so `false` just confirms the solo path; the server stays the
        // final net (409 session_private on a joint log of a private session).
        let shareWithPartner = envelope.shareWithPartner ?? true
        if resolveIsDoubles(assignmentId: envelope.assignmentId) && shareWithPartner {
            // sessionId == this athlete's own assignment id == payload.assignment_id.
            await DoblesExecutionAPI.submit(sessionId: payload.assignment_id, payload, bearer: bearer)
        } else {
            await WorkoutExecutionAPI.submit(payload, bearer: bearer)
        }

        // Optimistic local completion so Today/Plan paint it immediately (mirrors
        // PostWorkoutSummaryView's post-save marking). A partial finish stays amber ½.
        let completeness = payload.completeness == "partial" ? "partial" : "full"
        if completeness == "partial" {
            CompletedAssignmentsStore.markPartial(envelope.assignmentId)
        } else {
            CompletedAssignmentsStore.markCompleted(envelope.assignmentId)
        }

        // Re-push so the watch flips to the finished state, CARRYING the completeness
        // so the wrist tells "Sesión completada" apart from a partial. Reuse the last
        // payload (keeps readiness + detail) when it's the same assignment; else a
        // minimal done marker.
        if let last = lastTodayPayload, last.assignmentId == envelope.assignmentId {
            send(last.markingDone(completeness: completeness))
        } else {
            send(Self.minimalDonePayload(assignmentId: envelope.assignmentId, completeness: completeness))
        }
        return true
    }

    /// Retry every parked dead-letter envelope through the decode+submit path,
    /// dropping only the ones that submit successfully. A still-undecodable entry
    /// is kept for the next activation (capped store, so it can't grow unbounded).
    @MainActor
    private func retryDeadLetters() async {
        let entries = WatchExecutionDeadLetter.all()
        guard !entries.isEmpty else { return }
        var remaining: [Data] = []
        for entry in entries {
            if await submitEncodedExecution(entry) == false {
                remaining.append(entry)   // still undecodable — keep for next time
            }
        }
        WatchExecutionDeadLetter.replace(remaining)
    }

    /// Whether a watch-originated execution for this assignment should log jointly.
    /// Primary source: the flag on the last pushed payload (the wrist finished the
    /// exact session the phone pushed). Fallback for a cold-start / dead-letter
    /// replay where that's gone: positive dobles evidence from the cached
    /// AssignmentDetail (a HYROX station split). Defaults to SOLO when unknown — a
    /// solo log always records; a wrongly-joint log would 404 (no linked partner)
    /// and never land.
    @MainActor
    private func resolveIsDoubles(assignmentId: String) -> Bool {
        if let last = lastTodayPayload, last.assignmentId == assignmentId {
            return last.isDoubles
        }
        if let detail = AssignmentDetailCache.load(assignmentId) {
            return detail.assignment.stationAssignment != nil
        }
        return false
    }

    /// A bare "done" marker for a finished session the phone has no live context for
    /// (a different assignment than the last push, or a cold-start replay).
    private static func minimalDonePayload(assignmentId: String, completeness: String) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: WatchDayKind.session,
            assignmentId: assignmentId,
            title: "Sesión",
            focus: nil,
            estDurationMinutes: nil,
            intensityLabel: nil,
            activityKind: "mixed",
            athleteHrMax: nil,
            readinessScore: nil,
            readinessDelta7d: nil,
            readinessWorstDriver: nil,
            isDone: true,
            doneCompleteness: completeness,
            isDoubles: false,
            partnerFirstName: nil,
            partnerVisibility: nil,
            detailJson: nil
        )
    }

    // MARK: - Derivations

    /// Map the session's modality string to the watch's HR/HealthKit activity
    /// vocabulary ("running" | "strength" | "hyrox" | "mixed"). Tolerant: an
    /// unknown / absent modality falls to "mixed" (mixedCardio) — never a crash.
    static func activityKind(from modality: String?) -> String {
        guard let m = modality?.lowercased(), !m.isEmpty else { return "mixed" }
        if m.contains("run") || m.contains("carrera") { return "running" }
        if m.contains("strength") || m.contains("fuerza") { return "strength" }
        if m.contains("hyrox") || m.contains("dobles") { return "hyrox" }
        return "mixed"
    }

    /// The readiness component dragging the score down the most, as a human label
    /// ("Sueño 6h 10m", "HRV 42 ms", "FC reposo 58 ppm", "Check-in"). Picks the
    /// LOWEST-scoring present component and labels it with its real raw value — no
    /// fabrication, nil when no component is present.
    static func worstDriver(_ b: ReadinessBreakdown?) -> String? {
        guard let b else { return nil }
        var candidates: [(score: Double, label: String)] = []
        if let s = b.sleepComponent {
            candidates.append((s, "Sueño \(sleepLabel(b.sleepHours))"))
        }
        if let s = b.hrvComponent {
            let raw = b.hrvMs.map { " \(Int($0.rounded())) ms" } ?? ""
            candidates.append((s, "HRV\(raw)"))
        }
        if let s = b.rhrComponent {
            let raw = b.rhrBpm.map { " \(Int($0.rounded())) ppm" } ?? ""
            candidates.append((s, "FC reposo\(raw)"))
        }
        if let s = b.subScore {
            candidates.append((s, "Check-in"))
        }
        return candidates.min { $0.score < $1.score }?.label
    }

    /// Sleep hours as "6h 10m" (drops the minutes when zero → "6h"); em-dash when
    /// the raw hours are missing.
    private static func sleepLabel(_ hours: Double?) -> String {
        guard let hours, hours > 0 else { return "—" }
        let h = Int(hours)
        let m = Int((hours - Double(h)) * 60 + 0.5)
        return m > 0 ? "\(h)h \(m)m" : "\(h)h"
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        guard state == .activated else { return }
        Task { @MainActor in
            // Flush any push/clear held during the activation race, then replay any
            // executions that failed to decode on a prior launch.
            self.flushPendingContext()
            await self.retryDeadLetters()
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so we keep receiving paired-state changes between watches.
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let data = userInfo[WatchWireKeys.executionResult] as? Data else { return }
        Task { @MainActor in await self.handleIncomingExecution(data) }
    }
}

// MARK: - Dead-letter store for undecodable executions
//
// A finished workout that arrives from the wrist but fails to decode must NOT be
// dropped — the WCSession transfer is consumed once and the watch already cleared
// its outbox on didFinish, so this is the only remaining copy. We persist the raw
// envelope bytes to UserDefaults (Data is plist-native) and replay them on every
// activation until they submit. Capped so a persistent decode bug can't grow the
// store unbounded (oldest evicted first).
private enum WatchExecutionDeadLetter {
    private static let key = "fahybrik.watchExecutionDeadLetter.v1"
    /// Max parked envelopes — a hard ceiling against an unbounded decode-bug backlog.
    static let maxEntries = 20

    static func all() -> [Data] {
        (UserDefaults.standard.array(forKey: key) as? [Data]) ?? []
    }

    static func append(_ data: Data) {
        var entries = all()
        entries.append(data)
        if entries.count > maxEntries {
            entries.removeFirst(entries.count - maxEntries)
        }
        UserDefaults.standard.set(entries, forKey: key)
    }

    static func replace(_ entries: [Data]) {
        if entries.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(entries, forKey: key)
        }
    }
}
