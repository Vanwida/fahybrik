import Foundation
import Observation

// #56 — the EMITTER side of dobles en vivo: while the athlete works out, POST their
// heartbeat to /api/athlete/dobles/live ~every 5 s so the partner's phone can render
// their live strip. Best-effort and silent — a workout is NEVER blocked or slowed by
// presence. Mirrors the PhoneMirrorService lifecycle (begin on start, one final beat on
// finish/leave), driven off its own light 5 s timer (the engine tick is 0.25 s and the
// pure engine must not learn networking).
//
// Gating is SERVER-DRIVEN, not a second partner cache: the first heartbeat that comes
// back 404 (no training pair / not the athlete's assignment) or 409 (session marked
// private) MUTES presence for the rest of the session — no retries, no noise. A solo
// athlete therefore pays exactly one POST per workout, then silence.
@MainActor
@Observable
final class DoblesLivePresence {
    static let shared = DoblesLivePresence()
    static let path = "api/athlete/dobles/live"

    @ObservationIgnored private weak var session: WorkoutSession?
    @ObservationIgnored private var assignmentId: Int?
    @ObservationIgnored private var bearer: String?
    @ObservationIgnored private var timer: Timer?
    /// Set after a structural rejection (no pair / private) — presence stays off for
    /// the rest of this session.
    @ObservationIgnored private var muted = false

    private init() {}

    // MARK: - Lifecycle

    /// Start emitting for `session`. No-op for an ad-hoc / free session (no numeric
    /// assignment to attribute presence to). Fires the first beat immediately so the
    /// partner sees "en vivo" without a 5 s wait.
    func begin(session: WorkoutSession, assignmentId rawId: String?, bearer: String?) {
        guard let rawId, let id = Int(rawId) else { return }
        self.session = session
        self.assignmentId = id
        self.bearer = bearer
        self.muted = false
        startTimer()
        emit(phase: session.isPaused ? .paused : .active)
    }

    /// The workout finished (saved). Emit ONE `finished` beat carrying the final time
    /// (and RPE when already known — nil at the live finish, before the summary) so the
    /// partner sees "ha terminado — 47:12", then stop.
    func finish(finalTimeS: Int?, finalRpe: Double?) {
        stopTimer()
        emit(phase: .finished, finalTimeS: finalTimeS, finalRpe: finalRpe)
        clear()
    }

    /// The athlete abandoned the session (clean exit, nothing recorded). Emit ONE
    /// `left` beat so the partner sees they stepped out, then stop.
    func leave() {
        stopTimer()
        emit(phase: .left)
        clear()
    }

    // MARK: - Timer

    private func startTimer() {
        stopTimer()
        let t = Timer(timeInterval: DoblesLive.heartbeatIntervalS, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func clear() {
        session = nil
        assignmentId = nil
        bearer = nil
    }

    private func tick() {
        guard let session, !session.isFinished else { return }
        emit(phase: session.isPaused ? .paused : .active)
    }

    // MARK: - Emit

    private func emit(phase: DoblesLivePhase, finalTimeS: Int? = nil, finalRpe: Double? = nil) {
        guard !muted, let session, let assignmentId else { return }
        let payload = Self.payload(session: session, assignmentId: assignmentId, phase: phase,
                                   finalTimeS: finalTimeS, finalRpe: finalRpe)
        let bearer = self.bearer
        Task { [weak self] in
            do {
                try await APIClient.shared.postRaw(path: Self.path, body: payload, bearer: bearer)
            } catch APIError.http(let code, _) where code == 404 || code == 409 {
                // 404 no_partner / not_found · 409 session_private → structural. Stop for
                // the rest of the session (the athlete has no pair, or chose privacy).
                await self?.mute()
            } catch {
                // Network / server blip — silent; the next tick tries again.
            }
        }
    }

    private func mute() {
        muted = true
        stopTimer()
    }

    // MARK: - Pure payload (unit-tested)

    /// Build the heartbeat from the session state. `workout_title` / `block_name` /
    /// `progress_text` come from the SAME live descriptor the mirror frame reads
    /// (WorkoutSession.liveProgressText / liveBlockName) — never a parallel derivation.
    /// hr is dropped unless it's in the plausible 20…250 band, and final_* ride only on
    /// a `finished` beat, so the payload can never make the server reject a live beat.
    nonisolated static func payload(
        session: WorkoutSession,
        assignmentId: Int,
        phase: DoblesLivePhase,
        finalTimeS: Int? = nil,
        finalRpe: Double? = nil
    ) -> DoblesLiveHeartbeatPayload {
        let title = session.plan.name.trimmingCharacters(in: .whitespaces)
        let hr = session.liveHRBpm
        let hrInBand = hr.map { $0 >= DoblesLiveHeartbeatPayload.hrMin && $0 <= DoblesLiveHeartbeatPayload.hrMax } ?? false
        let finished = phase == .finished
        return DoblesLiveHeartbeatPayload(
            assignmentId: assignmentId,
            phase: phase,
            workoutTitle: title.isEmpty ? "Entreno" : title,
            blockName: session.liveBlockName,
            progressText: session.liveProgressText,
            elapsedS: Int(session.elapsedSeconds.rounded()),
            hrBpm: hrInBand ? hr : nil,
            finalTimeS: finished ? finalTimeS : nil,
            finalRpe: finished ? finalRpe : nil
        )
    }
}

// MARK: - Reader (GET the partner's presence)

/// One GET result: the partner presence (possibly nil = has pair but not live now),
/// `noPair` (no training pair → structurally nothing to poll), or `failed` (transient).
enum DoblesLiveFetchResult: Equatable {
    case ok(PartnerLiveStatus?)
    case noPair
    case failed
}

/// Reads /api/athlete/dobles/live. Shared by the active-workout strip poll and the
/// Inicio / Dobles-plan banner one-shot. NEVER surfaces an error to the UI — a banner
/// or strip that can't load simply doesn't show.
enum DoblesLiveClient {
    static func fetch(bearer: String?) async -> DoblesLiveFetchResult {
        do {
            let resp: PartnerLivePresenceResponse =
                try await APIClient.shared.get(path: DoblesLivePresence.path, bearer: bearer)
            return .ok(resp.partner)
        } catch APIError.http(404, _) {
            // no_partner → no training pair; the caller stops polling.
            return .noPair
        } catch {
            return .failed
        }
    }
}
