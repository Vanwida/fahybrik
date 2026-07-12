import Foundation

// Service + Codable models for the Dobles modality: two connected athletes,
// each with their own plan, who SEE each other's training and SHARE analytics /
// results. Training together is optional; SIMULATIONS are joint. One payment,
// two accounts. The handoff colors the self athlete orange (= our brand accent)
// and the partner blue (= our info). Color is decided by the views via
// Theme.Color.accent (self) and Theme.Color.partner (partner), not here.
//
// BACKEND GAP: the Dobles-specific endpoints below do not ship yet. A partner
// LINK already exists in the app (PartnerInfo / partner-redeem flow), but the
// shared-analytics / connected-plan / joint-simulation payloads do not. Every
// method returns nil/empty → honest empty states. Contract shapes documented
// per method.
//
// DECODING CONVENTION: the app's APIClient decodes with
// `keyDecodingStrategy = .convertFromSnakeCase` (see PartnerService /
// PartnerInfo). The struct properties below are therefore camelCase — the wire
// stays snake_case (`partner_name`, `self_value`, `self_share`, …) and the
// decoder bridges. When the backend ships these endpoints it should emit the
// snake_case keys named in each property's doc comment.

// MARK: - Models

/// The connected-plan view: the self athlete's week alongside a read-only view
/// of the partner's week, flagging optional-together and joint items.
///
/// BACKEND GAP — wire shape `GET /api/athlete/dobles/plan`:
///   { partner_name, partner_plan_visible, week_label, self_days[], partner_days[] }
/// where each *_days entry is a DoblesPlanDay. The thin `notes` array remains
/// for any free-form coach markers the backend wants to surface, but the screen
/// renders structured rows — never free text — from the day arrays.
struct DoblesConnectedPlan: Codable, Hashable {
    let partnerName: String?
    /// Whether the partner has shared their plan for read access.
    let partnerPlanVisible: Bool
    /// e.g. "Sem 2/4". Rendered in the title subtitle next to the partner name.
    let weekLabel: String?
    /// The self athlete's week, one row per day (Mon–Sun, rest days included).
    let selfDays: [DoblesPlanDay]
    /// The partner's week (read-only). May differ from `selfDays` in volume.
    let partnerDays: [DoblesPlanDay]
    /// Optional free-form coach markers; structured rows above are the source
    /// of truth for what the UI draws.
    let notes: [String]
    /// The self assignment id the "Entrenar a la vez" screen loads (the first
    /// optional-together session of the week). Nil when there is none this week,
    /// so the hub's CTA opens an honest empty state instead of a nil id.
    let trainTogetherSessionId: String?
}

/// How a day's session is shared between the two connected athletes. Drives the
/// trailing badge on a plan row (and its color) without any free text.
enum DoblesTogetherness: String, Codable, Hashable {
    /// Both did / will do it independently (no togetherness implied).
    case bothDone = "both_done"
    /// They MAY do it together (optional); plans are identical.
    case optionalTogether = "optional_together"
    /// Each does their own version; plans may differ in volume.
    case eachOwn = "each_own"
    /// Joint-mandatory — they MUST do it together (the simulation).
    case jointMandatory = "joint_mandatory"
    /// A rest day for this athlete.
    case rest = "rest"
}

/// One day of a connected plan. `dayLabel` is a localized 3-letter day code
/// ("LUN"…"DOM"); `togetherness` decides the trailing badge.
struct DoblesPlanDay: Codable, Identifiable, Hashable {
    let id: String
    /// 3-letter day code, pre-localized by the backend (e.g. "LUN").
    let dayLabel: String
    /// Session name, e.g. "Intervalos · 5×1000". Empty/nil on rest days.
    let sessionTitle: String?
    /// Optional sub-line, e.g. "Marcos hace 6×1000" or "opcional juntos · en el box".
    let detail: String?
    let togetherness: DoblesTogetherness
    /// Modality string for the row dot (run / strength / ergo). Optional.
    let modality: String?
}

/// Shared analytics: individual head-to-head bests + the joint Doubles mark,
/// who contributes what, and a friendly weekly comparison.
///
/// BACKEND GAP — wire shape `GET /api/athlete/dobles/analytics`:
///   { partner_name, best_self, best_partner, doubles_mark, doubles_delta,
///     contributions[], weekly[], head_to_head[] }
struct DoblesSharedAnalytics: Codable, Hashable {
    let partnerName: String?
    /// Pre-formatted best individual HYROX time for the self athlete, e.g. "1:08:42".
    let bestSelf: String?
    /// Pre-formatted best individual HYROX time for the partner.
    let bestPartner: String?
    /// Pre-formatted joint Doubles mark, e.g. "58:30".
    let doublesMark: String?
    /// Pre-formatted signed delta vs target for the joint mark, e.g. "−3:10 objetivo".
    let doublesDelta: String?
    /// "Who contributes what" split bars (one per discipline group).
    let contributions: [DoblesContribution]
    /// Friendly weekly comparison rows (adherence, a 2k row, …).
    let weekly: [DoblesH2HRow]
    /// Legacy/extra head-to-head rows. `weekly` above is what the screen draws.
    let headToHead: [DoblesH2HRow]
    /// "Who contributes what" prose, generated from the comparison (optional).
    let contributionSummary: String?
}

/// One head-to-head / weekly comparison row: a metric with the self value and
/// the partner value, both pre-formatted.
struct DoblesH2HRow: Codable, Identifiable, Hashable {
    let id: String
    /// Metric label, e.g. "Adherencia", "Remo 2k test".
    let metric: String
    /// Pre-formatted self value, e.g. "96%", "7:18".
    let selfValue: String?
    /// Pre-formatted partner value.
    let partnerValue: String?
}

/// One "who contributes what" row: a discipline group and the share each
/// athlete carries (`selfShare` 0…1; partner = 1 − selfShare). When the two
/// are within `parityBand` of 50/50 the row reads "parejos".
struct DoblesContribution: Codable, Identifiable, Hashable {
    let id: String
    /// Discipline group, e.g. "Trineos / fuerza", "Wall balls / burpees", "Running".
    let group: String
    /// Share the self athlete carries, 0…1.
    let selfShare: Double
}

/// "Train together" session: one shared session with per-athlete load (resolved
/// over each athlete's own 1RM). Buttons let them do it together or separately.
///
/// BACKEND GAP — wire shape `GET /api/athlete/dobles/session/{id}`:
///   { title, subtitle, self_name, partner_name, self_one_rm, partner_one_rm,
///     exercises[] }
struct DoblesTrainTogetherSession: Codable, Hashable {
    let title: String?
    /// Sub-line, e.g. "≈ 40 min · si la hacéis juntos, en el box".
    let subtitle: String?
    /// Display name for the self athlete (column header), defaults handled in UI.
    let selfName: String?
    let partnerName: String?
    /// Pre-formatted reference 1RM line for each athlete, e.g. "SQ 1RM 110".
    let selfOneRm: String?
    let partnerOneRm: String?
    let exercises: [DoblesExerciseRow]
    /// Assignment visibility: "shared" | "self_only". When "self_only" the
    /// session is private and CANNOT be logged jointly — the UI hides the
    /// "Hacerla juntos" action (the backend also rejects it with 409). Optional
    /// for backward-safety with an older backend.
    let partnerVisibility: String?

    /// True when this session is private to the athlete (not shareable as joint).
    var isSelfOnly: Bool { partnerVisibility == "self_only" }
}

/// One exercise row in a train-together session, with each athlete's resolved
/// load (already computed over their own 1RM by the backend).
struct DoblesExerciseRow: Codable, Identifiable, Hashable {
    let id: String
    let exercise: String
    /// Pre-formatted sets×reps, e.g. "5×5".
    let setsReps: String?
    /// Self athlete's resolved load, pre-formatted "88kg" (or "80% · 100kg").
    let selfLoad: String?
    /// Partner's resolved load.
    let partnerLoad: String?
}

/// Joint simulation: the 8-station split strategy between the two athletes,
/// running together, RoxZone relays, and the coach's tactical note.
///
/// BACKEND GAP — wire shape `GET /api/athlete/dobles/simulation`:
///   { title, day_label, intro, self_name, partner_name, coach_note,
///     station_splits[] }
struct DoblesSimulation: Codable, Hashable {
    let title: String?
    /// e.g. "Sábado". Rendered in the intro line.
    let dayLabel: String?
    /// One-line tactical summary, e.g. "Marcos lidera trineos, Ana wall balls."
    let intro: String?
    let selfName: String?
    let partnerName: String?
    let coachNote: String?
    let stationSplits: [DoblesStationSplit]
    // Edit provenance (mig 0099) — the reparto is pair-owned, so the app shows who
    // last touched it. Optional/tolerant: older cached payloads decode with nil.
    let lastEditedByKind: String?    // "coach" | "athlete" | nil
    let lastEditedByName: String?    // "Pablo" / "Guillem" / nil
    let updatedAt: String?           // ISO8601 / nil
    /// Consejos del coach antes de la simulación (wire `coach_tips`). Optional →
    /// decodeIfPresent (default [] vía `coachTipsList`), así un payload viejo sin
    /// el campo sigue decodificando.
    let coachTips: [String]?

    /// Non-nil accessor for the coach tips (empty when absent).
    var coachTipsList: [String] { coachTips ?? [] }
}

/// The reading athlete's frame for a station — they do it, the partner does it,
/// or they share. Snake-safe raw values (match the wire carrier).
enum DoblesCarrier: String, Codable, Hashable {
    case mine = "self"
    case partner
    case split
}

/// One station's split in the joint simulation. `selfShare` 0…1 is the share
/// the self athlete carries (partner = 1 − selfShare). `detail` carries a
/// human label like "1000m" / "100"; `splitNote` an explicit reparto note like
/// "alterna 250m" / "Marcos 100%".
struct DoblesStationSplit: Codable, Identifiable, Hashable {
    let id: String
    /// Canonical HYROX station index (2,4,…,16). Optional/tolerant for older
    /// payloads — derived from `id` ("station-2") when absent.
    let stationIndex: Int?
    let station: String
    /// The reading athlete's frame (they do it / partner / shared). Optional for
    /// older payloads; `resolvedCarrier` derives it from `selfShare` when absent.
    let carrier: DoblesCarrier?
    /// Share of the station the self athlete does, 0…1 (partner = 1 − this).
    let selfShare: Double
    /// Optional volume/units label, e.g. "1000m", "100".
    let detail: String?
    /// Optional explicit reparto note shown to the right, e.g. "alterna 250m".
    let splitNote: String?
    /// True when the station is a flagged weak spot (deficit border in the mock).
    let flagged: Bool

    /// The station index, derived from `id` ("station-10") when the field is
    /// absent (older payload). Falls back to 0 only for a malformed id.
    var resolvedStationIndex: Int {
        if let stationIndex { return stationIndex }
        return Int(id.split(separator: "-").last.map(String.init) ?? "") ?? 0
    }

    /// The carrier, derived from `selfShare` for an older payload with no carrier:
    /// a full self-share reads as `.mine`, a zero as `.partner`, else `.split`.
    var resolvedCarrier: DoblesCarrier {
        if let carrier { return carrier }
        if selfShare >= 0.999 { return .mine }
        if selfShare <= 0.001 { return .partner }
        return .split
    }
}

// MARK: - Service

enum DoblesService {
    /// The connected-plan overview (self week + partner read-only week).
    ///
    /// `GET /api/athlete/dobles/plan` — the self athlete's week alongside a
    /// read-only view of the partner's week, each day tagged with how the two
    /// share that session (joint-mandatory sim / optional-together / both-done /
    /// each-own / rest), plus `trainTogetherSessionId` for the "Entrenar a la
    /// vez" CTA. Returns nil (→ honest empty state) when there is no bearer or
    /// no linked partner (backend 404 `no_partner`). Decoding uses APIClient's
    /// `convertFromSnakeCase`, so the wire stays snake_case.
    static func fetchConnectedPlan(bearer: String?) async -> DoblesConnectedPlan? {
        guard let bearer, !bearer.isEmpty else { return nil }
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/dobles/plan",
                bearer: bearer
            )
        } catch {
            // Honest empty: no partner / transient error → nil so the view shows
            // its empty state instead of a fabricated week.
            return nil
        }
    }

    /// Shared analytics between the two connected athletes.
    ///
    /// `GET /api/athlete/dobles/analytics` — compares each athlete's OWN
    /// imported single HYROX races: best individual finish for each, a
    /// per-station head-to-head, "who's stronger" per discipline group, and a
    /// friendly weekly comparison. Returns nil (→ honest empty state) when
    /// there is no bearer, no linked partner (backend 404 `no_partner`), or
    /// neither athlete has an imported race (backend 404 `no_data`). The joint
    /// Doubles mark is always null by product decision — there is no separate
    /// joint result, so the view never shows a fabricated mark. Decoding uses
    /// APIClient's `convertFromSnakeCase`, so the wire stays snake_case.
    static func fetchSharedAnalytics(bearer: String?) async -> DoblesSharedAnalytics? {
        guard let bearer, !bearer.isEmpty else { return nil }
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/dobles/analytics",
                bearer: bearer
            )
        } catch {
            // Honest empty: no partner / no imported races / transient error all
            // collapse to nil so the view renders the empty state instead of
            // fabricating either athlete's marks.
            return nil
        }
    }

    /// A "train together" session with per-athlete load resolution.
    ///
    /// `GET /api/athlete/dobles/session/{id}` — given a shared workout
    /// assignment id, returns the dual-load table with each `% RM` line
    /// resolved over THAT athlete's own 1RM. Returns nil (→ honest empty
    /// state) when there is no session id, no bearer, no linked partner
    /// (backend 404 `no_partner`), or the assignment isn't found. Decoding
    /// uses APIClient's `convertFromSnakeCase`, so the wire stays snake_case.
    static func fetchTrainTogether(sessionId: String?, bearer: String?) async -> DoblesTrainTogetherSession? {
        guard let sessionId, !sessionId.isEmpty, let bearer, !bearer.isEmpty else {
            return nil
        }
        let encodedId = sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/dobles/session/\(encodedId)",
                bearer: bearer
            )
        } catch {
            // Honest empty: no partner / not found / transient error all collapse
            // to nil so the view renders the empty state instead of fabricating
            // either athlete's loads.
            return nil
        }
    }

    /// The joint simulation split strategy.
    ///
    /// `GET /api/athlete/dobles/simulation` — the coach-authored 8-station split
    /// strategy for this paired team, resolved to THIS athlete's perspective
    /// (stored A-share flipped to the reader's `self_share`) plus the coach's
    /// tactical note. Returns nil (→ honest empty state) when there is no bearer,
    /// no linked partner (backend 404 `no_partner`), or the coach has authored no
    /// simulation yet (backend 404 `no_simulation`). We NEVER fabricate the split
    /// or the note. Decoding uses APIClient's `convertFromSnakeCase`, so the wire
    /// stays snake_case.
    static func fetchSimulation(bearer: String?) async -> DoblesSimulation? {
        guard let bearer, !bearer.isEmpty else { return nil }
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/dobles/simulation",
                bearer: bearer
            )
        } catch {
            // Honest empty: no partner / no authored simulation / transient error
            // all collapse to nil so the view renders the empty state instead of
            // fabricating the station split or the coach's note.
            return nil
        }
    }

    /// The athlete ADJUSTS the pair's reparto (mig 0099 — pair-owned strategy).
    ///
    /// `PUT /api/athlete/dobles/simulation` — a SELF-centric body (per station:
    /// self/partner/split + the athlete's share + a note). The backend flips it to
    /// the A/B-neutral storage and stamps athlete provenance (last-write-wins, no
    /// approval flow), then returns the fresh reader-centric simulation. Encoded
    /// with APIClient's `convertToSnakeCase`, so the wire stays snake_case. Returns
    /// nil on failure (the view keeps the edits + shows an inline error).
    static func updateSimulation(
        _ body: DoblesSimulationEditBody,
        bearer: String?
    ) async -> DoblesSimulation? {
        guard let bearer, !bearer.isEmpty else { return nil }
        return try? await APIClient.shared.put(
            path: "api/athlete/dobles/simulation",
            body: body,
            bearer: bearer
        )
    }
}

/// Self-centric edit body for `PUT /api/athlete/dobles/simulation`. The athlete
/// edits the STATION reparto only — `carrier` is "self" | "partner" | "split",
/// `selfShare` is the editing athlete's share, `note` an optional per-station
/// reparto note. The coach's tactical notes are preserved server-side.
struct DoblesSimulationEditBody: Encodable {
    struct Station: Encodable {
        let stationIndex: Int
        let carrier: String
        let selfShare: Double
        let note: String?
    }
    let stationSplits: [Station]
}
