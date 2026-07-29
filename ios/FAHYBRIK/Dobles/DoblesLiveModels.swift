import Foundation

// #56 — DOBLES EN VIVO wire models + the PURE presence state machines. Peloton-style:
// each athlete of a training pair works out in their own gym and the app shows how the
// other is going, via /api/athlete/dobles/live (POST heartbeat · GET partner presence).
//
// The wire is snake_case; APIClient's convertTo/FromSnakeCase maps it to the camelCase
// members here (assignmentId ⇄ assignment_id, elapsedS ⇄ elapsed_s, hrBpm ⇄ hr_bpm …).
// The state derivations are pure (no I/O, no SwiftUI) so the strip/banner rendering and
// the heartbeat payload are all unit-tested from a simulated session.

// MARK: - Tuning (no magic numbers in the logic)

enum DoblesLive {
    /// A partner heartbeat older than this reads as momentarily SILENT on the live
    /// strip ("sin señal") — they're still training, just between beats. Distinct from
    /// the server's 6 h presence expiry (a closed app).
    static let staleAfterS = 20
    /// The "únete en vivo" banner only invites while the partner's last beat is this
    /// fresh — a wider window than the strip's, because the banner is a "they're
    /// training now" nudge, not a live mirror.
    static let bannerFreshS = 60
    /// Heartbeat cadence (POST) and partner poll cadence (GET), seconds.
    static let heartbeatIntervalS: TimeInterval = 5
}

// MARK: - Phase (closed set, mirrors the backend LIVE_PHASES)

enum DoblesLivePhase: String, Codable, Equatable {
    case active, paused, finished, left
}

// MARK: - POST heartbeat payload

/// The athlete's own heartbeat, POSTed ~every 5 s during the workout. camelCase →
/// snake_case via APIClient's encoder. Optionals are omitted when nil (never sent as a
/// value the server would reject): hr_bpm only when in the plausible 20…250 band,
/// final_* only on a `finished` beat.
struct DoblesLiveHeartbeatPayload: Encodable, Equatable {
    let assignmentId: Int
    let phase: DoblesLivePhase
    let workoutTitle: String
    let blockName: String?
    let progressText: String?
    let elapsedS: Int
    let hrBpm: Int?
    let finalTimeS: Int?
    let finalRpe: Double?

    /// Plausible-human HR band mirrored from the server CHECK — a value outside it is
    /// OMITTED (nil), never sent (the server would 400 the whole beat).
    static let hrMin = 20
    static let hrMax = 250
}

// MARK: - GET partner presence response

/// GET /api/athlete/dobles/live → `{ partner: … | null }`.
struct PartnerLivePresenceResponse: Decodable, Equatable {
    let partner: PartnerLiveStatus?
}

/// The partner's presence as the client consumes it. `phase` is decoded as a raw String
/// (tolerant of an unknown future value) and read through `livePhase`.
struct PartnerLiveStatus: Decodable, Equatable {
    let name: String
    let phase: String
    let workoutTitle: String
    let blockName: String?
    let progressText: String?
    let elapsedS: Int
    let hrBpm: Int?
    let finalTimeS: Int?
    let finalRpe: Double?
    /// Seconds since the partner's last heartbeat, computed on the SERVER.
    let ageS: Int

    var livePhase: DoblesLivePhase? { DoblesLivePhase(rawValue: phase) }
}

// MARK: - Live STRIP state (shown in the active workout)

/// The partner strip's rendered state, derived purely from the presence snapshot.
enum DoblesLiveStripState: Equatable {
    /// No pair / no presence / an unknown phase → the strip is not rendered at all.
    case hidden
    /// Training now (a recent beat). `paused` swaps the "en vivo" cue for "en pausa".
    case live(name: String, paused: Bool, blockName: String?, progress: String?,
              elapsedS: Int, hrBpm: Int?, ageS: Int)
    /// Training but momentarily silent (beat older than `staleAfterS`) — NO live data
    /// is shown as if fresh; only "última señal hace …".
    case stale(name: String, ageS: Int)
    /// Finished — the headline time (+ RPE when known); "te espera en el resumen".
    case finished(name: String, finalTimeS: Int?, finalRpe: Double?)
    /// Left their session — "tu sesión sigue igual, por tu cuenta".
    case left(name: String)

    /// Derive the strip state from the partner presence (nil = no pair / no row).
    static func from(_ partner: PartnerLiveStatus?) -> DoblesLiveStripState {
        guard let p = partner, let phase = p.livePhase else { return .hidden }
        switch phase {
        case .finished:
            return .finished(name: p.name, finalTimeS: p.finalTimeS, finalRpe: p.finalRpe)
        case .left:
            return .left(name: p.name)
        case .active, .paused:
            if p.ageS > DoblesLive.staleAfterS {
                return .stale(name: p.name, ageS: p.ageS)
            }
            return .live(name: p.name, paused: phase == .paused,
                         blockName: p.blockName, progress: p.progressText,
                         elapsedS: p.elapsedS, hrBpm: p.hrBpm, ageS: p.ageS)
        }
    }
}

// MARK: - "Únete en vivo" BANNER state (Inicio + Dobles plan)

/// The join-live banner's rendered state. Present only while the partner is training
/// now-ish (active/paused within `bannerFreshS`); `canJoin` gates the CTA on the athlete
/// having a startable session today.
enum DoblesLiveBannerState: Equatable {
    case hidden
    case visible(name: String, subtitle: String, canJoin: Bool)

    /// Derive the banner from the partner presence + whether the athlete can start a
    /// session of their own today.
    static func from(_ partner: PartnerLiveStatus?, hasOwnSessionToday: Bool) -> DoblesLiveBannerState {
        guard let p = partner, let phase = p.livePhase,
              phase == .active || phase == .paused,
              p.ageS <= DoblesLive.bannerFreshS else { return .hidden }
        return .visible(name: p.name, subtitle: subtitle(p), canJoin: hasOwnSessionToday)
    }

    /// "Metcon 20' · RONDA 3/5" — the workout, plus the progress when the partner is
    /// deep enough into it to have one.
    private static func subtitle(_ p: PartnerLiveStatus) -> String {
        let title = p.workoutTitle.trimmingCharacters(in: .whitespaces)
        let progress = p.progressText?.trimmingCharacters(in: .whitespaces)
        if let progress, !progress.isEmpty { return "\(title) · \(progress)" }
        return title
    }
}

// MARK: - Formatting

enum DoblesLiveFormat {
    /// "hace 8 s" under a minute, "hace 3 min" beyond — the freshness cue.
    static func ago(_ ageS: Int) -> String {
        let a = max(0, ageS)
        if a < 60 { return "hace \(a) s" }
        return "hace \(a / 60) min"
    }

    /// RPE trimmed to a clean label ("8" / "7.5"), or nil when absent.
    static func rpe(_ value: Double?) -> String? {
        guard let v = value else { return nil }
        return v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
}
