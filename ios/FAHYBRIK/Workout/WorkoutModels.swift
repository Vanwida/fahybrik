import Foundation

// The session's workout format is `PrescriptionScheme` (see Plan/Prescription.swift)
// — the SINGLE unified format enum, shared by the structured prescription and the
// execution timer. There is no separate format enum.

// Pedagogical ROLE of a coach block, inferred from its title. A session is an
// ordered list of blocks; the warmup runs FIRST and the cooldown LAST, so the
// session's defining format (score type, live timer) must come from the
// PRINCIPAL block — the main work — not whichever block happens to be first.
//
// Classification mirrors `classifyBlock` in
// web/app/api/athlete/plan/week/route.ts (single concept, two languages): keep
// the two in sync. Untitled blocks are `main` (no skew signal).
enum BlockPhase: String, Codable {
    case warmup
    case principal
    case cooldown
    case main

    static func classify(title: String?) -> BlockPhase {
        let t = (title ?? "")
            .folding(options: .diacriticInsensitive, locale: .current)
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return .main }
        if t.contains("principal") { return .principal }
        if t.contains("calent") || t.contains("warm") || t.contains("activaci") { return .warmup }
        if t.contains("calma") || t.contains("cooldown") || t.contains("cool down")
            || t.contains("cool-down") || t.contains("enfriamiento") {
            return .cooldown
        }
        return .main
    }

    /// Athlete-facing phase name shown in the active workout for context
    /// ("Calentamiento" / "Principal" / "Vuelta a la calma"). `main` work and the
    /// explicit `principal` block both read as the session's "Principal" phase.
    var displayName: String {
        switch self {
        case .warmup:               return "Calentamiento"
        case .cooldown:             return "Vuelta a la calma"
        case .principal, .main:     return "Principal"
        }
    }

    /// True for the session's main work (principal or untitled main blocks) — used
    /// to keep the principal section the visual focus and de-emphasise warmup/cooldown.
    var isMainWork: Bool { self == .principal || self == .main }
}

// Per-segment kind drives which 2x2 data grid is shown during execution.
enum SegmentKind: String, Codable {
    case running
    case rowOrSki = "row_or_ski"
    case sled
    case reps
    case strength

    /// Wire `modality` value for the per-segment execution record. MUST be one
    /// of the backend's canonical modalities (run | row | ski | bike | strength
    /// | other — see normalizeModality in ingest-execution-segments.ts); any
    /// other string is silently bucketed as "other" and breaks the run-vs-row
    /// analytics. The live grid collapses row/ski/bike into a single PM5-fed
    /// `rowOrSki` kind, so we emit "row" (the dominant HYROX erg); ski/bike
    /// distinction is a known follow-up that needs the erg subtype threaded onto
    /// the segment. `sled`/`reps` are HYROX-station work with no dedicated
    /// bucket → "other".
    var modality: String {
        switch self {
        case .running:  return "run"
        case .rowOrSki: return "row"
        case .strength: return "strength"
        case .sled, .reps: return "other"
        }
    }

    /// True when this segment is driven by the Concept2 PM5 erg (row/ski/bike).
    var isErg: Bool { self == .rowOrSki }
}

struct ZoneTarget: Codable {
    let zone: HRZone
    let percent: Int    // 0..100, sums approx to 100 across segments
}

// Either a target distance, target reps, or target duration drives completion.
/// #23 — HYROX dobles reparto for ONE station segment, resolved to the reading
/// athlete's perspective. `role` decides how the live engine treats it:
///   .mine    → the athlete does the full station (log normally).
///   .partner → the PARTNER does it; the athlete relays/recovers — a rest-style
///              screen ("{partner} hace {station} — recupera"), NOTHING logged
///              for this athlete (their half never includes the partner's work).
///   .split   → both share it; the athlete does `selfShare` of the volume + note.
struct SegmentDoblesSplit: Codable, Equatable {
    enum Role: String, Codable { case mine, partner, split }
    let role: Role
    /// The reading athlete's share, 0…1 (partner = 1 − this). 1 for .mine, 0 for
    /// .partner, the coach's split for .split.
    let selfShare: Double
    /// Explicit reparto note, e.g. "alterna 250m" / "tú 60 / compañero 40".
    let note: String?
    /// Station label for the relay/recover screen, e.g. "SkiErg 1km".
    let stationLabel: String
    /// Partner's first name for the relay line ("{partnerName} hace SkiErg").
    /// Nil → the surface falls back to "Tu compañero".
    let partnerName: String?

    /// One-line reparto reminder for a SHARED station (.split only) — shown dim on
    /// the active screen (and carried in the mirror `detailLine` / on the wrist) so
    /// the pact is legible mid-station, when no one remembers what was agreed. Nil
    /// for .mine (full station, no reminder) and .partner (that gets the relay
    /// screen instead). Format mirrors the coach's pact, e.g.
    /// "Tú 60 / Guillem 40 · alterna 250m". No banner — one honest line.
    var liveSplitLine: String? {
        guard role == .split else { return nil }
        let mine = Int((selfShare * 100).rounded())
        let theirs = max(0, 100 - mine)
        let trimmedPartner = partnerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let who = (trimmedPartner?.isEmpty == false) ? trimmedPartner! : "compañero"
        var line = "Tú \(mine) / \(who) \(theirs)"
        if let n = note?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty {
            line += " · \(n)"
        }
        return line
    }
}

/// UN TURNO de una superserie: qué ejercicio toca y por qué vuelta vas.
///
/// Existe porque la rotación aplanada (`sets[]` en orden de ejecución) sabe qué
/// hacer pero no sabe DECIRLO: la serie 5 de doce es «la vuelta 2 del press», y sin
/// eso el atleta ve doce series numeradas seguidas sin saber en cuál está. La
/// vuelta se guarda y no se calcula por división, porque con series desiguales
/// (A1 con 4 y A2 con 3) el índice deja de dividir.
struct SupersetSlot: Codable, Equatable {
    /// El movimiento de este turno — la etiqueta del coach, si no el ejercicio.
    let movement: String
    /// La vuelta a la rotación, en base 1.
    let round: Int
    /// Cuántas vueltas tiene el bloque entero.
    let rounds: Int
}

struct WorkoutSegment: Codable, Identifiable {
    let id: UUID
    let order: Int
    let title: String
    let kind: SegmentKind
    /// Backend template_segments.id this segment was prescribed from. Carried so
    /// the execution upload can attribute measured work to the prescribed item
    /// (coach prescrito-vs-hecho). Nil for the freeform fallback segment.
    let templateSegmentId: Int?
    let targetReps: Int?
    let targetDistanceMeters: Double?
    let targetDurationSeconds: Int?
    let targetPaceSecondsPerKm: Int?
    let targetPowerWatts: Int?
    /// Prescribed CALORIE target for a calorie-measured erg ("20 cal row"). Calories
    /// never flattened into a scalar before (#erg-1), so a calorie erg showed "—" as
    /// its target in the HUD. Optional so cached snapshots / non-calorie work decode.
    let targetCalories: Int?
    let targetZone: HRZone?
    let loadKg: Double?
    /// Prescribed effort (RPE). The ONLY intensity cue for target-less work
    /// (a warmup "8 min RPE 3"); without it the live HUD has nothing to show but
    /// dashes. Optional so cached snapshots from older builds still decode.
    let targetRpe: Double?
    /// Coach-authored title of the block this segment belongs to (e.g.
    /// "Calentamiento", "Principal", "Metcon"). Drives post-workout grouping and
    /// the active-workout phase label. Optional for the freeform fallback segment
    /// and older cached snapshots.
    let blockTitle: String?
    /// Position of the owning block within the session — the stable key that
    /// groups consecutive segments back into their block. Optional as above.
    let blockPosition: Int?
    /// YouTube watch URL — embedded in-app during brief / active workout.
    let videoUrl: String?
    /// The STRUCTURED per-set prescription this segment was built from (the rich
    /// `prescription_json`). Threaded onto the segment so the live engine can read
    /// the scheme (EMOM/AMRAP/…) and its per-interval `sets[]` directly, rather
    /// than only the flattened scalar targets. Optional: legacy/freeform segments
    /// carry only scalars (then the engine falls back to the generic lap).
    let prescription: Prescription?

    /// The specific ERG sub-modality for a PM5-driven segment: "row" | "ski" | "bike"
    /// (#erg-2). The live grid collapses all three into a single `.rowOrSki` kind, so
    /// without this the execution record emitted "row" for ALL ergs and the coach's
    /// modality analytics merged ski/bike/row. Threaded from the exercise category at
    /// build time; nil for non-erg segments (then `wireModality` uses `kind.modality`).
    /// `var` with a default so every existing `WorkoutSegment(...)` call-site + cached
    /// snapshots keep decoding.
    var ergKind: String? = nil

    /// #23 HYROX dobles reparto: how this STATION segment is split with the
    /// partner (derived from the coach's simulation; see WorkoutPlan.from). Nil
    /// for individual sessions, runs, and unmapped stations — those run in full,
    /// unchanged. `var` with a default so the big init and cached/mirror snapshots
    /// stay untouched and decode tolerantly.
    var doblesSplit: SegmentDoblesSplit? = nil

    /// La rotación de una SUPERSERIE, un turno por serie de `prescription.sets` y en
    /// el mismo orden — para que la pantalla pueda decir en todo momento qué
    /// ejercicio toca y por qué vuelta va. Nil en todo lo demás. `var` con defecto
    /// para que las llamadas y los snapshots cacheados sigan decodificando.
    var supersetSlots: [SupersetSlot]? = nil

    /// True cuando este tramo ejecuta un bloque en superserie.
    var isSuperset: Bool { prescription?.scheme == .superset }

    /// El turno que corresponde a la serie `i` (base 0). Nil fuera de una
    /// superserie o cuando la rotación no cubre ese índice.
    func supersetSlot(at i: Int) -> SupersetSlot? {
        guard let supersetSlots, supersetSlots.indices.contains(i) else { return nil }
        return supersetSlots[i]
    }

    /// The MODALITY string emitted on the execution wire for this segment. Single
    /// source for the lap's `modality` (#erg-2).
    ///
    /// The saved modality must be the one the ATHLETE trained, never the one the
    /// TRANSPORT implies. Row, ski and bike share a single PM5 and a single live
    /// grid (`SegmentKind.rowOrSki`), so for an erg the kind cannot answer "which
    /// machine" — and its default bucket answers "row", which is how Alex's SkiErg
    /// 400 m of 28-jul came to be stored as rowing. Two sources know better and are
    /// tried in order: `ergKind`, threaded from the exercise catalogue at build
    /// time, then the prescription's own declared modality via `resolvedModality` —
    /// the same resolution the live tramo already trusts to decide whose numbers
    /// own the screen. Runs / strength / stations are untouched: their kind IS the
    /// answer.
    /// The distinct ERG machines this segment's work touches. One for a plain erg
    /// segment; SEVERAL for a FOLDED block that mixes them (un AMRAP de ski + remo) —
    /// the case a single `ergKind` cannot express, and the reason a whole block used
    /// to be sealed as whatever the first movement happened to be. The
    /// catalogue-derived `ergKind` answers first (it IS the machine, not a
    /// declaration); a fold that carries none falls back to its own rotation, which
    /// holds the per-item modality. Empty for non-erg work.
    var ergMachines: Set<String> {
        if let ergKind { return [ergKind] }
        let declared = prescription?.sets?.compactMap(\.modality).filter(\.isErg) ?? []
        return Set(declared.map(\.rawValue))
    }

    var wireModality: String {
        guard kind.isErg else { return kind.modality }
        let machines = ergMachines
        if let only = machines.count == 1 ? machines.first : nil { return only }
        // MORE than one machine → no single one to name. The per-movement truth is
        // not lost (it rides in the fold's rotation); what must not happen is the
        // block being archived as rowing because the ski came first. "other" is the
        // canonical bucket for work that is no single modality — the same answer a
        // mixed run+reps WOD already gives.
        if machines.count > 1 { return "other" }
        return resolvedModality.rawValue
    }

    init(
        id: UUID = UUID(),
        order: Int,
        title: String,
        kind: SegmentKind,
        templateSegmentId: Int? = nil,
        targetReps: Int? = nil,
        targetDistanceMeters: Double? = nil,
        targetDurationSeconds: Int? = nil,
        targetPaceSecondsPerKm: Int? = nil,
        targetPowerWatts: Int? = nil,
        targetCalories: Int? = nil,
        targetZone: HRZone? = nil,
        loadKg: Double? = nil,
        targetRpe: Double? = nil,
        blockTitle: String? = nil,
        blockPosition: Int? = nil,
        videoUrl: String? = nil,
        prescription: Prescription? = nil,
        ergKind: String? = nil,
        supersetSlots: [SupersetSlot]? = nil
    ) {
        self.id = id
        self.order = order
        self.title = title
        self.kind = kind
        self.templateSegmentId = templateSegmentId
        self.targetReps = targetReps
        self.targetDistanceMeters = targetDistanceMeters
        self.targetDurationSeconds = targetDurationSeconds
        self.targetPaceSecondsPerKm = targetPaceSecondsPerKm
        self.targetPowerWatts = targetPowerWatts
        self.targetCalories = targetCalories
        self.targetZone = targetZone
        self.loadKg = loadKg
        self.targetRpe = targetRpe
        self.blockTitle = blockTitle
        self.blockPosition = blockPosition
        self.videoUrl = videoUrl
        self.prescription = prescription
        self.ergKind = ergKind
        self.supersetSlots = supersetSlots
    }
}

// MARK: - EMOM (every-minute-on-the-minute) live model
//
// Resolved, render-ready description of ONE EMOM interval. For an ALTERNATING
// EMOM the movement rotates minute by minute, so each interval carries its own
// movement label + work + intensity. `movement` falls back to the exercise title
// when a set has no explicit label; `work` / `detail` are formatted by the shared
// PrescriptionRenderer so the live HUD reads exactly like the rest of the app.
struct EmomInterval: Equatable {
    let movement: String   // "Remo", "Burpees", or the exercise title
    /// "15 cal", "12 reps", "200 m", "0:40" — nil when the minute declares NO
    /// measurable work. Never a placeholder dash: the dash was a sentinel that
    /// five call sites had to strip with `!= "—"` to recover "not known", which
    /// is the type being wrong (§7 del contrato de UI). Quien pinta decide.
    let work: String?
    let detail: String?    // "@ 1:50/500m", "RPE 8" — nil when none prescribed
    /// ¿ES ESTA RONDA UNA MÁQUINA? — row/ski/bike, no burpees ni core.
    ///
    /// Existe porque el reloj necesita saber si el CUERPO puede mirar mientras
    /// hace esta ronda, y eso no es un dato que se adivine del texto («Ski 45
    /// s» vs «10 burpees»): es la modalidad que el coach ya escribió en cada
    /// set (`PrescriptionSet.modality`). Antes de este campo, el guion del
    /// espejo (`GuionDelEspejo.emom`) lo daba por hecho a `.ojeada` SIEMPRE —
    /// un EMOM de burpees se pintaba como si tuvieras las manos libres para
    /// mirar el reloj en pleno suelo. El dato ya se calculaba aquí mismo
    /// (`isErg` en `emomInterval`/`uniformEmomInterval`) y se tiraba después
    /// de decidir el formato del `detail`; ahora se queda.
    let isErg: Bool
}

// The full EMOM dosage for one segment, expanded across its N intervals. Built
// ONCE from the segment's Prescription (the single source of truth) and read by
// both the session timer and the HUD so there is no second interpretation.
// EMOM and INTERVAL are ONE shape — a cycle of WORK + TRANSITION, repeated N times
// — which is exactly how the server already models it (`rounds` / `work_s` /
// `rest_s`, see shared/domain/prescription/types.ts). The only difference is
// whether the transition is explicit:
//   • plain EMOM ("al minuto")  work_s 60, no rest_s  → cycle 60, rest is whatever
//     the athlete leaves over inside the minute; nothing cues the end of the work.
//   • box interval (Rogue)      work_s 45, rest_s 15  → cycle 60, and the engine
//     must cue when to STOP, not only when to start.
//   • Tabata                    work_s 20, rest_s 10, rounds 8 — the same structure
//     with different numbers, so it is a PRESET, not another type.
struct EmomPlan: Equatable {
    let intervalCount: Int      // N cycles (rounds, or the set count)
    /// The WORK window inside each cycle — the server's `work_s`. For a plain EMOM
    /// this IS the whole cycle.
    let workSeconds: Int
    /// The explicit TRANSITION closing each cycle — the server's `rest_s`. 0 for a
    /// plain EMOM (implicit rest), > 0 for an interval / Tabata.
    let restSeconds: Int
    let intervals: [EmomInterval]   // length == intervalCount (rotation expanded)
    let isAlternating: Bool     // the movement changes between intervals

    /// The full cycle — work + transition. This is the "cada 1:00" the athlete
    /// reads, and it is what `intervalSeconds` has always meant: with no explicit
    /// transition (every EMOM shipped so far) it still equals `work_s`.
    var intervalSeconds: Int { workSeconds + restSeconds }

    /// True when the cycle carries an EXPLICIT transition, so the engine cues the
    /// end of the work and the HUD names the phase. False = plain EMOM, unchanged.
    var hasTransition: Bool { restSeconds > 0 }

    func interval(_ i: Int) -> EmomInterval? {
        guard i >= 0, i < intervals.count else { return nil }
        return intervals[i]
    }
}

// MARK: - EMOM expansion (THE single source — read by timer AND brief)
//
// The EMOM rotation→intervals expansion lives on `Prescription` (and the per-set
// `EmomInterval` build on `PrescriptionSet`) so it has exactly ONE implementation.
// The live timer reaches it via `WorkoutSegment.emomPlan`; the pre-workout brief
// reaches it via `WorkoutBlock.alternatingEmom` → the SAME merged prescription.
// Neither side re-derives how an alternating EMOM is presented.

extension Prescription {
    /// This EMOM prescription expanded to a render-ready `EmomPlan`: one
    /// `EmomInterval` per minute, the rotation cycling across `rounds` minutes (an
    /// ALTERNATING EMOM) or one interval per explicit set. nil when the scheme
    /// isn't EMOM, or it can't run (no `rounds` and no `sets`). Default cadence is
    /// 60s ("on the minute"). `fallbackMovement` / `fallbackIsErg` fill a set's
    /// missing movement label / erg pace convention; `uniformInterval` supplies
    /// the single interval for a sets-less EMOM from scalar context the bare
    /// prescription lacks (callers with no scalars — the brief — pass `nil`).
    func emomPlan(
        fallbackMovement: String,
        fallbackIsErg: Bool,
        uniformInterval: () -> EmomInterval?
    ) -> EmomPlan? {
        guard scheme == .emom else { return nil }
        // The server's shape, adopted verbatim: `work_s` is the WORK window and
        // `rest_s` the explicit transition. A plain EMOM carries only `work_s` (the
        // whole minute, defaulting to 60), so the cycle still resolves to exactly
        // what it always did — every EMOM shipped so far is untouched.
        let work = max(1, workS ?? 60)
        let transition = max(0, restS ?? 0)
        let rotationSets = sets ?? []
        // A set's erg convention falls back to the prescription's modality, then
        // the caller's context — matching the original per-segment precedence.
        let ergFallback = modality?.isErg ?? fallbackIsErg

        // The rotation: one EmomInterval per prescribed set, else a single uniform
        // interval derived from the caller's scalar targets.
        let rotation: [EmomInterval]
        if rotationSets.isEmpty {
            guard let u = uniformInterval() else { return nil }
            rotation = [u]
        } else {
            rotation = rotationSets.map {
                $0.emomInterval(fallbackMovement: fallbackMovement, fallbackIsErg: ergFallback)
            }
        }

        // N intervals: explicit `rounds`, else one per set. Must be > 0 to run.
        let count = rounds ?? rotationSets.count
        guard count > 0, !rotation.isEmpty else { return nil }

        let expanded = (0..<count).map { rotation[$0 % rotation.count] }
        return EmomPlan(
            intervalCount: count,
            workSeconds: work,
            restSeconds: transition,
            intervals: expanded,
            isAlternating: rotation.count > 1
        )
    }
}

extension PrescriptionSet {
    /// This set rendered as ONE EMOM minute — movement label + work + intensity
    /// detail. Pure (no live-segment context): the movement falls back to
    /// `fallbackMovement` when the set carries no note, the erg pace convention to
    /// `fallbackIsErg` when the set carries no modality.
    func emomInterval(fallbackMovement: String, fallbackIsErg: Bool) -> EmomInterval {
        let label = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let movement = (label?.isEmpty == false) ? label! : fallbackMovement
        let isErg = modality?.isErg ?? fallbackIsErg
        let detail = PrescriptionRenderer.targetLoad(target)
            ?? PrescriptionRenderer.paceString(target, isErg: isErg)
        return EmomInterval(movement: movement, work: Self.emomWorkString(measure), detail: detail, isErg: isErg)
    }

    /// The EMOM minute's WORK string ("15 reps", "0:40", "200 m", "15 cal", y
    /// "12-15 reps" cuando el coach prescribió una banda), o nil cuando la medida
    /// falta / es cero / es desconocida. Lo ÚNICO propio del EMOM es que deletrea
    /// la unidad de las repeticiones; el formateo vive una sola vez en
    /// `PrescriptionRenderer.measureWork` (§2), que es de donde sale la banda.
    static func emomWorkString(_ m: Measure?) -> String? {
        PrescriptionRenderer.measureWork(m, deletreandoReps: true)
    }
}

extension WorkoutSegment {
    /// True when this segment is a runnable EMOM (a valid `emomPlan` exists). A
    /// `scheme==emom` prescription with neither `rounds` nor `sets` can't be run
    /// and degrades to the generic lap rather than crashing.
    var isEMOM: Bool { emomPlan != nil }

    /// The EMOM dosage expanded across its intervals, or nil when this segment is
    /// not a runnable EMOM. Delegates to the shared `Prescription.emomPlan` (the
    /// single EMOM-expansion) — feeding this segment's title / erg kind as the
    /// movement / pace fallbacks, and its scalar targets as the uniform interval
    /// for a sets-less EMOM (context the bare prescription doesn't carry).
    var emomPlan: EmomPlan? {
        guard let p = prescription else { return nil }
        return p.emomPlan(
            fallbackMovement: title,
            fallbackIsErg: kind.isErg,
            uniformInterval: { uniformEmomInterval(p) }
        )
    }

    // Uniform EMOM (same work every minute) — work comes from the flattened scalar
    // targets; intensity from the prescribed RPE / pace / the block target.
    private func uniformEmomInterval(_ p: Prescription) -> EmomInterval {
        let work: String? = targetReps.map { "\($0) reps" }
            ?? targetDistanceMeters.flatMap { Formato.distancia($0) }
            ?? targetCalories.map { "\($0) cal" }   // #erg-1: calorie work is a measure too
            ?? targetDurationSeconds.map { Formato.clock($0, subMinuto: .segundos) }
        let detail = effortGuidance
            ?? PrescriptionRenderer.targetLoad(p.target)
            ?? PrescriptionRenderer.paceString(p.target, isErg: kind.isErg)
        return EmomInterval(movement: title, work: work, detail: detail, isErg: kind.isErg)
    }
}

extension WorkoutSegment {
    /// Pedagogical phase of this segment's block (warmup / principal / cooldown).
    var blockPhase: BlockPhase { BlockPhase.classify(title: blockTitle) }

    /// Stable key that groups CONSECUTIVE segments into their coach block — the
    /// authored block position, else its title, else a single freeform bucket.
    /// The ONE definition both `WorkoutPlan.segmentGroups` and `.blockRegions`
    /// partition on, so the two groupings can never drift.
    var blockGroupingKey: String {
        blockPosition.map(String.init) ?? blockTitle ?? "_freeform"
    }

    /// True when the segment carries at least one MEASURABLE intensity target
    /// (pace, distance, zone, power, reps or load). False for effort-only work
    /// (a warmup run with just RPE/duration) — the live HUD then shows guidance
    /// instead of a row of dashes.
    var hasMeasurableTarget: Bool {
        targetPaceSecondsPerKm != nil
            || targetDistanceMeters != nil
            || targetZone != nil
            || targetPowerWatts != nil
            || (targetReps ?? 0) > 0
            || (loadKg ?? 0) > 0
    }

    /// Effort cue ("RPE 3"), or nil when no RPE was prescribed.
    var effortGuidance: String? {
        guard let r = targetRpe, r > 0 else { return nil }
        let s = Formato.esDecimal(r)
        return "RPE \(s)"
    }

    /// Prescribed duration as mm:ss ("08:00"), or nil when none was prescribed.
    var durationGuidance: String? {
        guard let d = targetDurationSeconds, d > 0 else { return nil }
        return Formato.clock(Double(d))
    }

    /// A compact, athlete-readable line of THIS segment's prescribed work for the
    /// block-preview gate — the dominant measure + pace / zone / load / effort.
    /// Reuses the shared `PrescriptionRenderer` (structured prescription first),
    /// falling back to the scalar targets so a legacy/freeform segment still reads.
    /// Nil only when the segment carries no readable target at all.
    var previewWorkLine: String? {
        if let p = prescription {
            let line = PrescriptionRenderer.summaryLine(p)
            var parts: [String] = []
            if let h = line.headline { parts.append(h) }
            if let pace = line.pace { parts.append(pace) }
            if let z = line.zone { parts.append(z.label) }
            if let d = line.detail { parts.append(d) }
            if !parts.isEmpty { return parts.joined(separator: " · ") }
        }
        // Scalar fallback (no structured prescription): one dominant measure +
        // load / pace / zone / effort. Pace unit follows the segment kind (erg
        // reads /500m, run reads /km), mirroring the brief's lineFromParams.
        var parts: [String] = []
        if let r = targetReps, r > 0 { parts.append("\(r) reps") }
        else if let m = targetDistanceMeters, let s = Formato.distancia(m) { parts.append(s) }
        else if let d = durationGuidance { parts.append(d) }
        if let kg = loadKg, kg > 0 {
            parts.append(Formato.kg(kg))
        }
        if let p = targetPaceSecondsPerKm, p > 0 {
            parts.append(kind.isErg
                ? "@ \(Formato.ritmo(Double(p) / 2, .por500m))"
                : "@ \(Formato.ritmo(Double(p), .porKm))")
        }
        if let z = targetZone { parts.append(z.label) }
        if let e = effortGuidance { parts.append(e) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - WorkoutSegment → honest rep / strength logging
//
// The execution timer records what was ACTUALLY done against what was prescribed
// (done / scaled / skipped + a confidence flag). These helpers classify a segment
// so the session knows whether to PRE-FILL the prescribed reps (a fixed chunk to
// hit once) or count UP from zero (reps ARE the score), and whether to log the
// strength work PER SET. EMOM owns its own interval model, so it's excluded.
extension WorkoutSegment {
    /// Prescribed reps to LOG against (the scalar target), nil for open-score /
    /// target-less work. A real 0 is never prescribed.
    ///
    /// #23/#56 — a SHARED dobles station (`.split`) is prescribed, primed AND recorded
    /// against the athlete's PACT: their half of the volume (`repSplit.mine`), NOT the
    /// full station. So the default (unedited) log reads prescribed 60 · actual 60 ·
    /// "hecho", never "prescribed 100 · did 60 · escalado" — the coach's signal stays
    /// honest. A `.mine` station is the whole total (they do it entire); a `.partner`
    /// station never logs (the relay discards, `advanceRelay`) so its value is moot.
    /// This is the SINGLE source read by the priming, the lap record's `repsPrescribed`,
    /// the rep HUD and the wrist set-table — fix once, no twin.
    var prescribedRepsForLog: Int? {
        guard let r = targetReps, r > 0 else { return nil }
        if let split = doblesSplit, split.role == .split, let mine = split.repSplit(total: r)?.mine {
            return mine > 0 ? mine : nil
        }
        return r
    }

    /// True when reps ACCUMULATE as the score (count up from 0, a real 0 is
    /// legal) — an AMRAP movement — rather than a fixed prescribed chunk. EMOM is
    /// not open-score here (its work is interval-driven, handled by the EMOM HUD).
    var repsAreOpenScore: Bool {
        guard !isEMOM else { return false }
        return prescription?.scheme.repsAreOpenScore == true
    }

    /// True when the segment's reps should be PRE-FILLED from the prescription
    /// (a fixed chunk the athlete confirms or adjusts). Excludes EMOM, open-score
    /// AMRAP work, and target-less reps (which start at 0 and count up).
    var repsArePrimable: Bool {
        guard kind == .reps || kind == .strength, !isEMOM, !repsAreOpenScore else { return false }
        return prescribedRepsForLog != nil
    }

    /// True when this strength segment is a multi-SET piece (a 5×5, a pyramid) the
    /// athlete logs set by set — driven by the structured `prescription.sets`.
    /// A single-set strength move falls back to the simple prefilled rep flow.
    ///
    /// Una SUPERSERIE entra siempre, la mueva el músculo que la mueva: el formato ya
    /// declara que esto se registra serie a serie. Mirando solo el `kind`, una
    /// superserie de sentadilla + dominadas se resuelve como mixta (`.reps`) y se
    /// habría quedado sin registro de carga — que es exactamente lo que un bloque de
    /// fuerza no puede perder.
    var usesMultiSetStrength: Bool {
        guard !isEMOM else { return false }
        guard kind == .strength || isSuperset else { return false }
        return (prescription?.sets?.count ?? 0) > 1
    }

    /// True when this segment belongs to a metcon-family block (the Rx / Scaled
    /// axis applies). Read from the structured scheme; nil prescription = not a WOD.
    var isMetconFamily: Bool { prescription?.scheme.isMetconFamily == true }
}

// MARK: - WorkoutSegment → conditioning-format live timer
//
// The non-EMOM conditioning formats (For Time, AMRAP, Tabata, Intervals, Death By,
// Steady, Chipper, Ladder, Rounds, HYROX sim) each run a dedicated block-level
// live timer. A multi-movement block is FOLDED into ONE segment (see
// `WorkoutBlock.conditioningFold` / `WorkoutPlan.mergedConditioningSegment`,
// mirroring the alternating-EMOM fold), so the timer always reads ONE segment
// whose `prescription` carries the scheme, the block params (cap / rounds / work /
// rest / death-by start+increment) and the movement list as `sets[]`. These
// accessors expose those for the HUD + session engine, with no re-derivation.

/// One movement (or round) in a conditioning block's round/list, render-ready:
/// the movement name, its work string ("5 reps", "200 m", "15 cal") and an
/// optional intensity detail ("@ 1:50/500m", "RPE 8"). The fixed-round task list
/// (AMRAP / For Time / Chipper / Ladder) and the block preview both read this.
struct WorkComponent: Identifiable, Equatable {
    let id: Int
    let name: String
    /// La dosis del movimiento ("500 m", "12 reps") — nil cuando el bloque no
    /// declara ninguna. Nunca una raya: quien pinta decide qué dice (§7).
    let work: String?
    let detail: String?
}

extension WorkoutSegment {
    /// The conditioning scheme driving this segment's live timer, or nil for a
    /// legacy / structural / strength segment (no dedicated format timer).
    var formatScheme: PrescriptionScheme? { prescription?.scheme }

    /// True when this segment runs a NON-EMOM conditioning timer (For Time, AMRAP,
    /// Tabata, Intervals, Death By, Steady, Chipper, Ladder, Rounds, HYROX sim).
    ///
    /// QUIÉN CONDUCE EL TRAMO SE DECIDE UNA VEZ, Y AQUÍ. El motor lo tiene claro
    /// desde el #61 (`WorkoutSession.onEnterSegment`): la ESTRUCTURA de carrera manda
    /// sobre el rotativo, y el EMOM tiene su propio motor. Esta propiedad —que es la
    /// que leen las PANTALLAS— solo excluía el EMOM, así que una serie de correr con
    /// estructura decía «yo llevo reloj de acondicionamiento» aunque el que la
    /// conducía fuese el cursor de tramos. El resultado, con datos reales (Fartlek
    /// 16×500 m Z4, 10-ago): la pantalla de antes de empezar montaba debajo un
    /// `ForTimeLiveHUD` con sus 16 rondas sin recortar —unos 2.000 pt en una pantalla
    /// de 874— así que el `ZStack` del entreno activo crecía más que el móvil, la
    /// puerta del bloque quedaba centrada en ese alto y al atleta solo le llegaba una
    /// franja de «LO QUE VIENE»: sin título y, sobre todo, sin EMPEZAR. Pantalla en
    /// blanco y entreno imposible de arrancar.
    ///
    /// Con la exclusión, la cadena de la vista (`superficieViva` → `modalityHUD`)
    /// dice de la carrera estructurada lo que ya decía el motor: no es esto.
    var isConditioningTimer: Bool {
        guard let s = formatScheme, !isEMOM, !hasRunStructure else { return false }
        return s.runsConditioningTimer
    }

    /// The block's movement list — one row per movement, from the folded
    /// `prescription.sets[]` (the round shown at once in a FIXED format / the
    /// rotation in a ROTATING one). Falls back to ONE row from this segment's
    /// scalar work when no structured sets exist (a single-movement block shipped
    /// with only scalar params). Reuses the per-set EMOM-interval builder so the
    /// work/detail strings read exactly like the rest of the app.
    var components: [WorkComponent] {
        let isErg = kind.isErg
        if let sets = prescription?.sets, !sets.isEmpty {
            return sets.enumerated().map { i, s in
                let itv = s.emomInterval(fallbackMovement: title, fallbackIsErg: isErg)
                return WorkComponent(id: i, name: itv.movement,
                                     work: itv.work, detail: itv.detail)
            }
        }
        // Scalar fallback: one component from the dominant measure + intensity.
        let work: String? = targetReps.map { "\($0) reps" }
            ?? targetDistanceMeters.flatMap { Formato.distancia($0) }
            ?? targetCalories.map { "\($0) cal" }   // #erg-1: calorie work is a measure too
            ?? targetDurationSeconds.map { Formato.clock($0, subMinuto: .segundos) }
        let detail = effortGuidance
            ?? prescription.flatMap { PrescriptionRenderer.targetLoad($0.target) }
            ?? prescription.flatMap { PrescriptionRenderer.paceString($0.target, isErg: isErg) }
        return [WorkComponent(id: 0, name: title, work: work, detail: detail)]
    }

    /// True when this segment declares WHAT to do — structured `sets[]`, or a scalar
    /// measure. FALSE for a bare CLOCK: an entreno libre started as a box timer,
    /// where the athlete named a format and nothing else.
    ///
    /// `components` cannot answer this: its scalar fallback ALWAYS yields one row, so
    /// a clock with nothing declared comes back as a single work-less line named after
    /// the segment. That is the row the live lists must not print.
    var hasDeclaredWork: Bool {
        if prescription?.sets?.isEmpty == false { return true }
        return targetReps != nil || targetDistanceMeters != nil
            || targetCalories != nil || targetDurationSeconds != nil
    }

    /// `components`, but EMPTY for a bare clock instead of the one-row work-less
    /// fallback. The live movement lists read this so a cronómetro shows no phantom round.
    var declaredComponents: [WorkComponent] { hasDeclaredWork ? components : [] }

    // ── Block-level conditioning params (read from the folded prescription) ──────

    /// Time CAP (For Time / Chipper / Ladder / Rounds / HYROX sim) or fixed WINDOW
    /// (AMRAP / Steady), in seconds. Nil = open clock (no cap / no window).
    var formatTotalSeconds: Int? {
        guard let t = prescription?.totalS, t > 0 else { return nil }
        return t
    }

    /// Rounds / minutes the format runs (For Time scheme rounds, Tabata rounds,
    /// Rounds circuits). Nil when not prescribed.
    ///
    /// Legacy interval pyramids (1200/1000/800) ship NO `rounds`; their `sets`
    /// array IS the bout list — one entry per bout — so the bout count is
    /// `sets.count`. This fallback is scoped to `.intervals` ONLY: for every other
    /// scheme `sets` are the MOVEMENTS in a round (a For Time / Chipper list), so
    /// conflating `sets.count` with the round count there would be wrong. ~40% of
    /// real running intervals are this sets-only legacy shape; #61's `structure`
    /// wire will carry the count explicitly for new authoring.
    var formatRounds: Int? {
        if let r = prescription?.rounds, r > 0 { return r }
        if prescription?.scheme == .intervals, let n = prescription?.sets?.count, n > 0 { return n }
        return nil
    }

    /// Work-window length — Tabata work, interval bout, Death By minute. Defaults
    /// to 60s ("on the minute") for Death By when unset, else nil.
    var formatWorkSeconds: Int? {
        guard let w = prescription?.workS, w > 0 else { return nil }
        return w
    }

    /// Rest between intervals / rounds (Tabata rest, interval recovery). Nil when none.
    var formatRestSeconds: Int? {
        guard let r = prescription?.restS, r > 0 else { return nil }
        return r
    }

    /// Death By starting amount (reps / cal in round 1); defaults to 1 when unset.
    var deathByStart: Int { max(1, prescription?.start ?? 1) }
    /// Death By per-round increment; defaults to 1 when unset.
    var deathByIncrement: Int { max(1, prescription?.increment ?? 1) }

    /// The single movement name a uniform conditioning block shows (Tabata air
    /// squats, Steady run) — the first component's name, else the segment title.
    var primaryMovement: String { components.first?.name ?? title }
}

// A session's segments regrouped into their coach blocks, in session order, so
// the post-workout summary reads as Calentamiento / Principal / Vuelta a la calma
// instead of one flat mix. `title` is the coach block title (phase name as
// fallback); `phase` drives ordering emphasis (principal = focus).
struct WorkoutSegmentGroup: Identifiable {
    let id: Int
    let title: String
    let phase: BlockPhase
    let segments: [WorkoutSegment]
}

struct WorkoutPlan: Codable, Identifiable {
    let id: UUID
    let name: String
    let format: PrescriptionScheme
    let estimatedDurationSeconds: Int
    let blockContext: String        // pedagogical phase, e.g. "Tapering · sem 2 · día 4"
    let zoneTargets: [ZoneTarget]
    let equipment: [String]
    let segments: [WorkoutSegment]
    let coachNote: String?
    let warmupChecklist: [String]
}

// One completed segment's measured execution. This is the on-device source of
// truth that PostWorkoutSummaryView maps into the `segments[]` upload — so every
// dimension the analytics contract needs lives here (no recomputation
// downstream). Erg fields (pace/500m, power, SPM, calories) are aggregated from
// the PM5 stream over the segment window; they stay nil for non-erg modalities.
struct LapRecord: Codable, Identifiable {
    let id: UUID
    let segmentId: UUID
    /// Backend template_segments.id of the prescribed segment this lap measured —
    /// threaded onto the wire so the coach can map actuals → prescription. Nil
    /// for the freeform fallback segment (backend then matches on `position`).
    let templateSegmentId: Int?
    /// 1-based coach order — drives `position` on the wire.
    let position: Int
    /// Wire modality from `SegmentKind.modality` (run | erg | strength | reps | sled).
    let modality: String
    let startedAt: Date
    let endedAt: Date
    let durationSeconds: Double
    let avgHRBpm: Int?
    let maxHRBpm: Int?
    let zoneSecondsByZone: [Int: Double]   // zone(rawValue) -> seconds
    let repsCompleted: Int?
    let distanceCoveredMeters: Double?
    // Intensity targets / measured outputs.
    let avgPaceSecPer500m: Double?         // erg only — mean of PM5 split samples
    let avgPaceSecPerKm: Double?           // run only — prescribed pace
    let avgPowerWatts: Double?             // erg only — mean of PM5 power samples
    let strokeRateSpm: Double?             // erg only — mean of PM5 SPM samples
    let calories: Double?                  // erg only — final PM5 kcal in window
    let weightUsedKg: Double?              // strength/sled — prescribed load
    /// Provenance of the metrics: "pm5" for erg segments fed by the Concept2,
    /// "healthkit" when HR came from a wearable, else "manual".
    let source: String

    // MARK: Honest-logging carriers (FASE 2 · PASO 2)
    //
    // `repsCompleted` above STAYS the canonical "actual" reps (nil = skipped,
    // never a fabricated 0). These add the prescribed reference + the three-state
    // honesty (done/scaled/skipped) + the confidence flag, mirroring the wire/DB
    // contract. Defaulted so older persisted snapshots and the freeform fallback
    // keep building without them.
    /// Prescribed reps this segment was logged against (nil for open-score /
    /// target-less / structural work).
    var repsPrescribed: Int? = nil
    /// "done" | "scaled" | "skipped" — nil for segments with no rep dimension.
    var repsStatus: String? = nil
    /// TRUE only when the athlete explicitly touched/confirmed the value; FALSE =
    /// assumed from the prescription (advanced past without acting).
    var repsConfirmed: Bool = false
    /// Warmup / cooldown completion-only marker — one structural row per block,
    /// EXCLUDED from volume/analytics (no reps/load).
    var isStructural: Bool = false
    /// "rx" | "scaled" — only on metcon-family laps.
    var rxScaled: String? = nil
    /// Optional free note on HOW a WOD was scaled.
    var scaledNote: String? = nil
    /// Per-set strength detail (a 5×5 / pyramid, AND — #break-3 — a single set, so its
    /// rpe/rir/tempo/rest reach the coach's per-set analytics); nil for non-strength.
    var sets: [SetRecord]? = nil

    // MARK: EMOM completion (#break-1)
    /// How many EMOM intervals the athlete completed the prescribed work in. Captured
    /// from `emomCompletedIntervals` BEFORE the live engine tears down (it used to be
    /// zeroed before the lap closed → the coach saw blanks). nil off an EMOM segment.
    var emomRoundsCompleted: Int? = nil
    /// How many intervals the EMOM prescribed (the "Y" in "X/Y rondas"). nil off EMOM.
    var emomRoundsPrescribed: Int? = nil

    // MARK: Structured-run per-leg attribution (#break-2)
    /// For a structured/interval run, the 0-based index of this bout in the FLAT
    /// expanded leg list of the block's prescription — repeticiones desplegadas,
    /// fases en orden, RECUPERACIONES INCLUIDAS. Es el mismo espacio de índices que
    /// `RunStructure.expandedLegs()` aquí y `flattenSegments()` en el servidor, así
    /// que es la clave con la que «tramo 3 hecho» casa con «tramo 3 prescrito» sin
    /// adivinar por orden de llegada. nil en todo lap que no sea un bout de carrera
    /// estructurada (que conserva `position` = el orden del bloque del coach).
    ///
    /// OJO: hasta el 29-jul esto era el ordinal entre los tramos de TRABAJO, no el
    /// índice plano. Con las recuperaciones sin grabar los dos coincidían; grabarlas
    /// los separa, y el índice plano es el único que casa con la prescripción.
    var runLegIndex: Int? = nil
    /// Qué ES este bout: "work" (una serie) o "recovery" (el trote/andar entre
    /// series). Es EL contraste que define una sesión de series — sin él, cinco
    /// fuertes no tienen contra qué compararse. nil fuera de una carrera estructurada.
    var runLegRole: String? = nil
    /// En qué FASE del bloque cae el bout: "warmup" | "main" | "cooldown". Hace falta
    /// además del rol porque en la gramática un calentamiento es literalmente
    /// `kind: work` (verificado en la prescripción 2574 de producción): sin la fase,
    /// un trote de 10 min de calentamiento es indistinguible de una serie y un 5×1000
    /// se lee como un 7×1000 cuya primera «serie» dura diez minutos.
    var runLegPhase: String? = nil

    // MARK: Run device averages (#62)
    /// AVERAGE incline (%) over the segment, folded from the treadmill telemetry
    /// (`TreadmillHUDModel` → `session.sampleTreadmillIncline`). nil when no belt fed
    /// the segment — never a fabricated 0. Defaulted so cached snapshots still decode.
    var inclinePct: Double? = nil
    /// AVERAGE running cadence (steps/min) over the segment. Stays nil on iOS today:
    /// the FTMS treadmill reports NO running cadence and there is no foot-pod /
    /// HealthKit running-cadence source in the app, so we never fabricate it — the
    /// value arrives through the web vision / HealthKit paths (#62), which already
    /// accept `run_cadence_spm`. The field exists so the wire is ready when a real
    /// on-device source lands.
    var runCadenceSpm: Int? = nil

    // MARK: Erg detail (#33 — PM5 "erg completo")
    /// Segment-average drag factor (mean of the 0x31 readings). nil off an erg or
    /// when the monitor never reported it — never a fabricated 0.
    var dragFactor: Int? = nil
    /// Segment-average calorie burn RATE (mean of the 0x36 Cals/Hr readings).
    var avgCaloriesPerHour: Double? = nil
    /// Segment-average / peak handle drive force (lbs) — stroke-quality signal.
    var peakDriveForceLbs: Double? = nil
    var avgDriveForceLbs: Double? = nil
    /// The monitor's own per-interval splits (ErgData interval table), captured
    /// verbatim from the PM5. Empty/nil when no split boundary fired this segment.
    var ergSplits: [PM5Split]? = nil

    // MARK: HR provenance — el fallo de la mezcla de fuentes concurrentes (correa
    // + Watch, o Watch + PM5). `source` arriba describe el TRAMO (gps/pm5/
    // treadmill/manual), no específicamente de qué aparato salió el pulso.
    /// Provenance of the PULSE specifically — "strap" | "healthkit" | "pm5", nil
    /// when this lap has no HR at all. Set from `WorkoutSession.hrSource` — the
    /// single owning device the priority latch (`injectLiveHR`) already tracks —
    /// at the instant this lap had any HR samples; nil otherwise. Defaulted so
    /// older persisted snapshots and the freeform fallback keep building.
    var hrSource: String? = nil

    // Sensor (fases 1–2) — defaulted for snapshot decode.
    var sensorWorkS: Double? = nil
    var sensorRestS: Double? = nil
    var sensorTimingConfidence: Double? = nil
    var repsSource: String? = nil
    var repsConfidence: Double? = nil
}

// One logged STRENGTH set — the on-device source the per-set view fills and
// `closeCurrentSegmentLap` carries onto the wire. Each value defaults to the
// prescription (confirmed=false) until the athlete touches it; mirrors
// `SetExecutionDTO` 1:1. `id` (== setIndex) makes it ForEach-stable.
struct SetRecord: Codable, Equatable, Identifiable {
    var id: Int { setIndex }
    let setIndex: Int                  // 1-based
    var repsPrescribed: Int?
    /// El TECHO cuando el coach prescribió una banda («12-15»): `repsPrescribed` es
    /// el suelo y con él se prellena y se calcula, y esto es lo que hace que la
    /// pantalla enseñe la banda entera en vez de media prescripción. Solo se pinta;
    /// no viaja al cable (`SetExecutionDTO` registra lo HECHO, que es un número).
    /// `var` con defecto para que los snapshots cacheados sigan decodificando.
    var repsPrescribedMax: Int? = nil
    var repsActual: Int?
    var loadPrescribedKg: Double?
    var loadActualKg: Double?
    var rpe: Double?
    var rir: Double?
    var status: String                 // "done" | "scaled" | "skipped"
    var confirmed: Bool
    var tempo: String?
    var restS: Int?
    // Sensor (fases 2–3) — defaults so snapshots keep decoding.
    var repsSource: String? = nil
    var repsConfidence: Double? = nil
    var meanVelocityFirstMs: Double? = nil
    var meanVelocityLastMs: Double? = nil
    var velocityLossPct: Double? = nil
    var romM: Double? = nil
    var velocityConfidence: Double? = nil
}

// Per-segment execution record on the wire. Property names are already
// snake_case (like WorkoutExecutionPayload) so the encoder's
// `.convertToSnakeCase` is a no-op and the keys can't desync from the backend
// Zod schema. The backend consumes this to attribute measured work to each
// prescribed segment (erg splits, run pace, strength load) for analytics + IA
// adaptation.
struct SegmentExecutionDTO: Codable {
    /// Backend template_segments.id of the prescribed segment, threaded from the
    /// assignment detail (`template_segment_id`) through the WorkoutSegment/LapRecord
    /// so the coach can map actuals → prescription. Null only for the freeform
    /// fallback segment — the backend then falls back to matching on `position`.
    let template_segment_id: Int?
    let position: Int
    let modality: String
    let started_at: String           // ISO8601
    let ended_at: String             // ISO8601
    let duration_seconds: Int
    let distance_meters: Double?
    let avg_pace_s_per_500m: Double?
    let avg_pace_s_per_km: Double?
    let avg_power_w: Double?
    let stroke_rate_spm: Double?
    let avg_hr: Int?
    let max_hr: Int?
    let calories: Double?
    let reps_completed: Int?
    let weight_used_kg: Double?
    let zone_seconds_json: [String: Int]?
    let source: String

    // Honest-logging fields (FASE 2 · PASO 2). All optional — the backend Zod
    // schema accepts them as optional and derives sensible defaults. `reps_actual`
    // is the canonical actual (NULL only when skipped); we also keep sending
    // `reps_completed` (= actual) as the legacy alias the analytics readers use.
    let reps_prescribed: Int?
    let reps_actual: Int?
    let reps_status: String?         // "done" | "scaled" | "skipped"
    let reps_confirmed: Bool?
    let is_structural: Bool?
    let rx_scaled: String?           // "rx" | "scaled"
    let scaled_note: String?
    let sets: [SetExecutionDTO]?

    // EMOM completion (#break-1, mig 0134). "X/Y rondas hechas" — both nil off an
    // EMOM segment. `var` with a default so the watch relay / older payloads keep
    // building and the memberwise init stays back-compatible.
    var emom_rounds_completed: Int? = nil
    var emom_rounds_prescribed: Int? = nil

    // Run device averages (#62, mig 0124). `incline_pct` is the segment's average
    // treadmill grade; `run_cadence_spm` the average running cadence. Both optional
    // and range-gated server-side (ingest-execution-segments.ts). iOS sends incline
    // when a belt fed the segment; cadence stays null (no on-device source yet).
    var incline_pct: Double? = nil
    var run_cadence_spm: Int? = nil

    // Erg detail (#33). NO new columns: the backend folds these into the segment's
    // `raw_lap_data_json` (alongside zone_seconds). `avg_pace_s_per_500m` above
    // already carries the PM5's own average pace when present. Keys are explicit
    // snake_case (encoder key strategy is a no-op) so they land in the jsonb verbatim.
    /// Segment-average drag factor (unitless C2 units).
    var drag_factor: Int? = nil
    /// Segment-average calorie burn rate (Cals/Hr).
    var avg_calories_per_hour: Double? = nil
    /// Segment-average / peak handle drive force (lbs).
    var peak_drive_force_lbs: Double? = nil
    var avg_drive_force_lbs: Double? = nil
    /// The PM5's per-interval splits (ErgData interval table).
    var erg_splits: [ErgSplitDTO]? = nil

    // Atribución por tramo de una carrera estructurada (mig 0146). Los tres van
    // juntos o ninguno: describen un bout de la lista plana de tramos.
    /// Índice 0-based en la lista PLANA de tramos de la prescripción (repeticiones
    /// desplegadas, fases en orden, recuperaciones incluidas) — la clave con la que
    /// el servidor casa lo hecho con lo prescrito sin adivinar por orden.
    var leg_index: Int? = nil
    /// "work" | "recovery". El contraste que define una sesión de series.
    var leg_role: String? = nil
    /// "warmup" | "main" | "cooldown". Un calentamiento es `kind: work` en la
    /// gramática, así que sin la fase no se distingue de una serie.
    var leg_phase: String? = nil

    // HR provenance — el fallo de la mezcla de fuentes concurrentes (correa +
    // Watch, o Watch + PM5). `source` arriba describe el TRAMO (gps/pm5/
    // treadmill/manual), no específicamente el pulso.
    /// Provenance of `avg_hr`/`max_hr` — "strap" | "healthkit" | "pm5", null when
    /// this segment has no HR at all. See `LapRecord.hrSource`. `var` with a
    /// default so older payloads (watch relay, cached snapshots) keep building.
    var hr_source: String? = nil

    // Sensor timing + rep provenance (plan fases 1–2, mig 0174/0175).
    var sensor_work_s: Double? = nil
    var sensor_rest_s: Double? = nil
    var sensor_timing_confidence: Double? = nil
    /// "athlete_tap" | "sensor" | "sensor_corrected"
    var reps_source: String? = nil
    var reps_confidence: Double? = nil
}

// One PM5 split/interval on the wire — the ErgData interval table row. Explicit
// snake_case property names (encoder key strategy is a no-op) so the object lands
// in `raw_lap_data_json.erg_splits[]` verbatim. All optional except `index`
// because the two source frames (0x37/0x38) may not both have landed.
struct ErgSplitDTO: Codable, Equatable {
    let index: Int
    let time_seconds: Double?
    let distance_meters: Double?
    let avg_pace_s_per_500m: Double?
    let stroke_rate_spm: Int?
    let avg_power_w: Int?
    let calories: Int?
    let calories_per_hour: Int?
    let drag_factor: Int?
    let rest_time_seconds: Double?
    let rest_distance_meters: Double?
    let avg_hr: Int?
}

// Per-set strength execution on the wire. Explicit snake_case keys (the encoder's
// key strategy is a no-op) matching `setInputSchema` in
// web/lib/sync/ingest-execution-segments.ts byte-for-byte.
struct SetExecutionDTO: Codable {
    let set_index: Int
    let reps_prescribed: Int?
    let reps_actual: Int?
    let load_prescribed_kg: Double?
    let load_actual_kg: Double?
    let rpe: Double?
    let rir: Double?
    let status: String?              // "done" | "scaled" | "skipped"
    let confirmed: Bool?
    let tempo: String?
    let rest_s: Int?
    // Fase 2–3 sensor fields (optional; older clients omit).
    var reps_source: String? = nil
    var reps_confidence: Double? = nil
    var mean_velocity_first_m_s: Double? = nil
    var mean_velocity_last_m_s: Double? = nil
    var velocity_loss_pct: Double? = nil
    var rom_m: Double? = nil
    var velocity_confidence: Double? = nil
}

// POST /api/sync/workout-execution body. Explicit snake_case keys to match the
// Zod schema in web/app/api/sync/workout-execution/route.ts so the encoder's
// key strategy can't accidentally desync field names.
struct WorkoutExecutionPayload: Codable {
    let assignment_id: String
    let perceived_exertion: Int?
    let total_duration_seconds: Int?
    let notes: String?
    /// Provenance of the execution (the backend `biometric_source` enum). Sent
    /// "manual" for a retroactive "Ya lo hice" log the athlete typed by hand;
    /// nil for the live-timer path, where the backend defaults it to 'healthkit'.
    let source: String?
    /// Metcon/HYROX final score. `score_time_s` for For Time / RFT / HYROX-sim;
    /// `score_rounds` (+ `score_reps`) for AMRAP. All nil for non-scored formats.
    let score_time_s: Int?
    let score_rounds: Int?
    let score_reps: Int?
    /// Session completeness: "full" when the protocol ran to its end → assignment
    /// 'completed'; "partial" when terminated early → assignment 'partial'. The
    /// honest finish signal — the backend never marks 'completed' for a partial.
    let completeness: String?
    let started_at: String?
    let ended_at: String?
    /// Per-segment measured execution. Omitted (nil) for sessions with a single
    /// freeform segment and no captured laps; populated for structured workouts.
    let segments: [SegmentExecutionDTO]?
    /// The `uuid` of the HKWorkout this execution was saved as, when the finish
    /// happened on the wrist (the watch also writes the workout to HealthKit, which
    /// the iPhone HealthKitSyncService independently forwards). The backend
    /// (`workout_executions.source_workout_ref`) uses it to recognize the
    /// HealthKit-synced copy of the SAME session and not double-count it. `var` with
    /// a default (not `let`) so it stays in the memberwise init as an OPTIONAL
    /// argument: the phone's own finish path (which doesn't set it) is unchanged, the
    /// watch passes the HKWorkout id, and older encoded payloads still decode.
    var source_workout_ref: String? = nil

    /// The outdoor run's GPS trace (#64) as a Google ENCODED POLYLINE (precision 5),
    /// or nil when the session was not outdoors. The backend persists it to
    /// workout_routes (server derives point_count) and returns it on the session
    /// detail so the athlete sees the map. `var` with a default so the watch relay /
    /// older payloads keep building.
    var route_polyline: String? = nil

    // MARK: Structured session feedback (#58)
    //
    // Optional feedback the athlete adds on the summary, in the SAME POST. All
    // `var` with a default so the watch relay / older payloads keep building.
    /// How the session felt vs the prescription: "too_easy"|"as_expected"|"too_hard".
    var perceived_difficulty: String? = nil
    /// Body area of a physical niggle: "rodilla"|"tobillo"|"cadera"|"espalda"|"hombro"|"otra".
    var pain_area: String? = nil
    /// Short free note on the niggle (≤500 chars).
    var pain_note: String? = nil
}

// Offline-first sync helper for post-workout summary. Mirrors the CheckinAPI
// pattern: try the POST, on any failure enqueue for replay through the shared
// RequestQueue so closing the workout view is never blocked by network.
//
// iPhone-only: the watch never talks to the backend directly — it relays a
// finished execution to the phone (WatchConnectivity), which submits through this
// exact path. So the networking-backed submitters are compiled out on watchOS
// (they'd otherwise drag APIClient + RequestQueue onto the wrist for no reason).
#if !os(watchOS)
enum WorkoutExecutionAPI {
    static let path = "/api/sync/workout-execution"

    static func submit(_ payload: WorkoutExecutionPayload, bearer: String?) async {
        _ = await submitReturning(payload, bearer: bearer)
    }

    /// Submit and decode the response (which carries any running `prs` set this
    /// session, #65). Returns nil — WITHOUT celebrating — when the response can't
    /// be read, and preserves the offline-first replay on a network/HTTP failure.
    static func submitReturning(
        _ payload: WorkoutExecutionPayload,
        bearer: String?
    ) async -> WorkoutExecutionResponse? {
        do {
            return try await APIClient.shared.post(path: path, body: payload, bearer: bearer)
        } catch APIError.decoding {
            // 2xx but an unexpected body: the execution WAS saved — never replay
            // (that would double-count), just skip the celebration.
            return nil
        } catch {
            // AUDIT — queue ONLY a transient failure; a deterministic 4xx must not sit
            // in the replay queue forever (a 2xx-bad-body is already caught above).
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(payload) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
            return nil
        }
    }
}
#endif

// Where a finished execution is submitted. `.solo` → the standard
// /api/sync/workout-execution path. `.doublesJoint` → the joint Dobles endpoint,
// which records the SAME execution and additionally links the partner + shares
// the result. Same payload shape either way — one logging model, no fork.
enum WorkoutLogTarget: Equatable {
    case solo
    case doublesJoint
}

// Joint Dobles execution sync. Mirrors WorkoutExecutionAPI (offline-first via
// RequestQueue) but POSTs to the per-assignment joint endpoint so the backend
// links the partner and shares the result. Reuses WorkoutExecutionPayload —
// `sessionId` is the athlete's own assignment id (== payload.assignment_id).
// iPhone-only for the same reason as WorkoutExecutionAPI above.
#if !os(watchOS)
enum DoblesExecutionAPI {
    static func path(sessionId: String) -> String {
        let encoded = sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId
        return "/api/athlete/dobles/session/\(encoded)/log"
    }

    static func submit(sessionId: String, _ payload: WorkoutExecutionPayload, bearer: String?) async {
        _ = await submitReturning(sessionId: sessionId, payload, bearer: bearer)
    }

    /// Joint submit that also decodes the `prs` set this session (#65). Same
    /// response-read/offline-replay contract as `WorkoutExecutionAPI.submitReturning`.
    static func submitReturning(
        sessionId: String,
        _ payload: WorkoutExecutionPayload,
        bearer: String?
    ) async -> WorkoutExecutionResponse? {
        let p = path(sessionId: sessionId)
        do {
            return try await APIClient.shared.post(path: p, body: payload, bearer: bearer)
        } catch APIError.decoding {
            return nil
        } catch {
            // AUDIT — a 404 no_partner on a joint log is deterministic: don't queue it.
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(payload) {
                await RequestQueue.shared.enqueue(path: p, body: body, bearer: bearer)
            }
            return nil
        }
    }
}
#endif

// Minimal real plan used to run the timer/lap engine when we only know the
// assignment title. The per-assignment workout BODY (segments, zone targets,
// equipment) is not yet exposed in a shape the live execution engine consumes
// (the detail endpoint returns blocks/items, not WorkoutSegments) — so we
// surface only what we truly have: the session title and a single freeform
// segment. No invented segments, zones, equipment or coach notes.
extension WorkoutPlan {
    static func minimal(title: String?) -> WorkoutPlan {
        let name = (title?.isEmpty == false) ? title! : "Sesión"
        return WorkoutPlan(
            id: UUID(),
            name: name,
            format: .forTime,
            estimatedDurationSeconds: 0,
            blockContext: "",
            zoneTargets: [],
            equipment: [],
            segments: [
                WorkoutSegment(order: 1, title: name, kind: .reps)
            ],
            coachNote: nil,
            warmupChecklist: []
        )
    }

    /// Build a runnable plan from the real assignment detail (blocks + items +
    /// params) returned by GET /api/athlete/assignments/{id}/detail. This is what
    /// "EMPEZAR" must run — the same body the athlete sees in Plan — not an empty
    /// title-only shell. Every value comes from the coach's prescription; nothing
    /// is invented. Returns nil for rest days (no workout body).
    static func from(detail: AssignmentDetail) -> WorkoutPlan? {
        guard let workout = detail.workout else { return nil }
        // A non-null workout with ZERO blocks is NOT a runnable/previewable body —
        // it is the rest/empty state, same as `workout == null`. The backend now
        // collapses that case to null, but a STALE cache written before the fix
        // could still carry the pathological shape; treat it as no body so the
        // brief never reaches its half-rendered "Sin detalle" / "Sesión" state.
        guard !workout.blocks.isEmpty else { return nil }

        // One segment per exercise item, ordered by block position then item
        // order, so the live timer/lap engine walks the session in coach order.
        // Each segment carries its block's title + position so the post-workout
        // summary can regroup by block and the active HUD can show the phase.
        var order = 0
        let segments: [WorkoutSegment] = workout.blocks
            .sorted { $0.blockPosition < $1.blockPosition }
            .flatMap { block -> [WorkoutSegment] in
                // Calentamiento y vuelta a la calma NUNCA se pliegan, sea cual sea su
                // `format` — es el contrato que ya documentaban `conditioningFold` y
                // `StructuralBlockChecklist` («un tramo por movimiento») pero que
                // ningún guard comprobaba de verdad: los tres pliegues de abajo miran
                // el FORMATO del bloque, no su FASE, así que un calentamiento montado
                // como circuito/rondas (un activation flow de verdad, no un caso raro)
                // se plegaba en un solo tramo opaco — el título salía concatenando los
                // nombres de los 9 ejercicios y «hecho» saltaba directo al siguiente
                // bloque sin pasar por ninguno (Alex, 7-ago). Cortar aquí, antes de
                // los tres pliegues, es la única forma de que ninguno futuro repita el
                // mismo fallo.
                let phase = BlockPhase.classify(title: block.title)
                if phase == .warmup || phase == .cooldown {
                    return block.items.map { item in
                        order += 1
                        return segment(from: item, order: order, block: block)
                    }
                }
                // An ALTERNATING EMOM is ONE block with several movements that the
                // athlete cycles minute by minute (min1 wallballs / min2 run / min3
                // wallballs …) — a SINGLE 15-min EMOM, not back-to-back ones. The
                // backend ships it as one emom block with N items; `block.alternatingEmom`
                // (the shared fold) merges those items into ONE rotation prescription
                // so `emomPlan` cycles them across the EMOM's minutes. One-segment-
                // per-item would run them as N separate 15-min EMOMs — the 30-min bug.
                if let merged = block.alternatingEmom {
                    order += 1
                    return [mergedEmomSegment(block: block, merged: merged, order: order)]
                }
                // UNA SUPERSERIE ROTA: A1 serie 1 → A2 serie 1 → A3 serie 1 →
                // descanso → A1 serie 2 … Es UN bloque, así que es UN tramo cuya
                // rotación aplanada conserva TODAS las series de cada ejercicio con
                // su carga y su descanso. No pasa por `conditioningFold` —ni podría:
                // aquel se queda con el primer set de cada ejercicio y arranca un
                // reloj de acondicionamiento, y esto es fuerza que se registra serie
                // a serie. Un bloque mal formado devuelve nil y cae a series rectas.
                if let (folded, slots) = block.supersetFold {
                    order += 1
                    return [mergedSupersetSegment(block: block, merged: folded,
                                                  slots: slots, order: order)]
                }
                // Every OTHER multi-movement conditioning block (For Time, AMRAP,
                // Tabata, Intervals, Death By, Steady, Chipper, Ladder, Rounds,
                // HYROX sim) folds into ONE block-level segment the same way: the
                // format runs a SINGLE timer over the whole round/list (the screen
                // is the block, not a per-movement lap). Mirrors the EMOM fold;
                // strength / warmup / cooldown stay one-segment-per-item.
                if let folded = block.conditioningFold {
                    order += 1
                    return [mergedConditioningSegment(block: block, merged: folded, order: order)]
                }
                return block.items.map { item in
                    order += 1
                    return segment(from: item, order: order, block: block)
                }
            }

        // No items at all → fall back to a single freeform segment titled with
        // the workout name (rather than presenting zero segments to the engine).
        let resolvedSegments = segments.isEmpty
            ? [WorkoutSegment(order: 1, title: workout.name, kind: .reps)]
            : segments

        // Format/score-type comes from the PRINCIPAL block (the main work), NOT
        // `blocks.first` — which is the warmup, so a For-Time/HYROX session would
        // otherwise be misclassified as a circuit and never show its score field.
        let format = workoutFormat(from: principalBlock(workout.blocks)?.format)

        return WorkoutPlan(
            id: UUID(),
            name: workout.name,
            format: format,
            estimatedDurationSeconds: (workout.estimatedDurationMinutes ?? 0) * 60,
            blockContext: workout.focus ?? "",
            zoneTargets: [],
            equipment: [],
            // #23 — annotate the station segments with the dobles reparto so the
            // live engine (phone + watch, shared) runs each athlete's half.
            segments: applyDoblesSplit(resolvedSegments, assignment: detail.assignment),
            coachNote: workout.coachNote,
            warmupChecklist: []
        )
    }

    // #23 — apply the derived HYROX dobles reparto to the station segments. The
    // backend emits `station_assignment` (per station: assigned_to + reader-flipped
    // self_share + note) keyed by template_segment_id, plus my_role. We annotate
    // each segment whose templateSegmentId matches; everything else (individual
    // sessions, runs, unmapped stations) is returned untouched → run in full.
    private static func applyDoblesSplit(
        _ segments: [WorkoutSegment],
        assignment: AssignmentInfo
    ) -> [WorkoutSegment] {
        guard let sa = assignment.stationAssignment, !sa.stations.isEmpty else { return segments }
        var byTsid: [Int: StationAssignmentEntry] = [:]
        for e in sa.stations { if let t = e.templateSegmentId { byTsid[t] = e } }
        guard !byTsid.isEmpty else { return segments }
        let mine = assignment.myRole?.lowercased()

        return segments.map { seg in
            guard let tsid = seg.templateSegmentId, let e = byTsid[tsid] else { return seg }
            let a = e.assignedTo.lowercased()
            let role: SegmentDoblesSplit.Role
            if a == "split" || a == "alternate" {
                role = .split
            } else if let mine, a == mine {
                role = .mine
            } else if let mine, (a == "a" || a == "b"), a != mine {
                role = .partner
            } else if let s = e.selfShare {
                // Role unknown (no my_role) → infer from the reader-flipped share.
                role = s >= 0.85 ? .mine : (s <= 0.15 ? .partner : .split)
            } else {
                // Ambiguous → treat as partner (never wrongly attribute their work).
                role = .partner
            }
            let share = e.selfShare ?? (role == .mine ? 1 : role == .partner ? 0 : 0.5)
            var s = seg
            s.doblesSplit = SegmentDoblesSplit(
                role: role,
                selfShare: share,
                note: e.note,
                stationLabel: e.label ?? e.displayName,
                partnerName: sa.partnerFirstName
            )
            return s
        }
    }

    private static func segment(from item: WorkoutItem, order: Int, block: WorkoutBlock) -> WorkoutSegment {
        let p = item.paramsJson
        let distanceMeters: Double? = p.distanceMeters.map(Double.init)
            ?? p.distanceKm.map { $0 * 1000 }
        let kind = item.segmentKind
        // #break-3(a): a scalar "4×10" (params_json {sets:4, reps:10}) with NO
        // structured prescription primed ONE lap of 10 reps → 3 sets vanished (~4×
        // volume error) while the athlete was shown "4×10". Materialize the scalar Nx
        // into a real per-set prescription so the multi-set logger records ALL N sets
        // (with their tempo/rest). An AUTHORED prescription always wins — only a
        // prescription-LESS scalar strength with N>1 sets is synthesized here.
        let prescription = item.prescription ?? item.scalarStrengthPrescription
        return WorkoutSegment(
            order: order,
            title: item.exerciseName,
            kind: kind,
            templateSegmentId: item.templateSegmentId,
            targetReps: p.reps,
            targetDistanceMeters: distanceMeters,
            targetDurationSeconds: p.durationSeconds,
            targetPaceSecondsPerKm: p.paceSecPerKm,
            // #erg-3: watts now reaches execution — structured target is primary (the
            // scalar `watts` is a lossy mirror the normalizer may not always carry).
            targetPowerWatts: prescription?.wattsTarget ?? p.watts,
            targetCalories: p.calories,         // #erg-1: calorie erg target now visible in HUD
            targetZone: p.hrZone.flatMap { HRZone(rawValue: $0) },
            loadKg: p.loadKg,
            targetRpe: p.rpe,
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            videoUrl: item.exerciseVideoUrl,
            // The rich structured prescription drives the live EMOM/interval timer
            // (scheme + per-interval sets); scalar params above still feed the
            // generic HUDs. Preferred when present, ignored when nil.
            prescription: prescription,
            ergKind: item.ergSubtype            // #erg-2: row/ski/bike, not a merged "row"
        )
    }

    // Package the shared alternating-EMOM fold (`block.alternatingEmom` — the ONE
    // rotation prescription read by both the live timer and the brief) into the
    // single live-execution segment that runs it. Only the segment-specific
    // concerns live here (lap modality, title, attributed template id); the
    // rotation itself is built once on `WorkoutBlock`, never re-derived.
    private static func mergedEmomSegment(block: WorkoutBlock, merged: Prescription, order: Int) -> WorkoutSegment {
        // `kind` drives the ONE recorded lap's modality + capture. A mixed-modality
        // EMOM (run + reps) has no single modality → `.reps` (a neutral timed record,
        // no false GPS/PM5/load); a homogeneous EMOM (e.g. all-erg) keeps that kind.
        let kinds = Set(block.items.map(\.segmentKind))
        let kind: SegmentKind = kinds.count == 1 ? (kinds.first ?? .reps) : .reps

        // Title = the movements in order, e.g. "Wallballs / Run" — the PostWorkout
        // row label and the EMOM HUD's movement fallback.
        let title = dedupPreservingOrder(block.items.map(\.exerciseName)).joined(separator: " / ")

        return WorkoutSegment(
            order: order,
            title: title.isEmpty ? block.title : title,
            kind: kind,
            // One template_segments.id per segment. An alternating EMOM is ONE
            // continuous effort recorded as a single lap, so we attribute it to the
            // first movement's prescription (the rest share the block).
            templateSegmentId: block.items.first?.templateSegmentId,
            // Scalar targets stay nil: the structured `sets` rotation is the single
            // source of truth for a merged EMOM, and `emomPlan` reads it directly.
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            // No single technique video for a multi-movement EMOM (the model carries
            // one per segment, not per minute) — omit rather than show a misleading one.
            videoUrl: nil,
            prescription: merged,
            // #erg-2: a homogeneous all-erg EMOM keeps its subtype. `kinds.count == 1`
            // was NOT enough: ski, row and bike share the single `.rowOrSki` kind, so a
            // ski+bike EMOM passed the test and got sealed as ski. The machine is a
            // machine, so the test is on the MACHINES — one of them, or none.
            ergKind: block.singleErgMachine
        )
    }

    // Package the shared conditioning fold (`block.conditioningFold` — the ONE
    // block-level prescription whose `sets[]` is the movement list, read by both
    // the live timer and the preview) into the single segment that runs it.
    // Mirrors `mergedEmomSegment`: only the segment-specific concerns (lap
    // modality, title, attributed template id) live here; the fold itself is
    // built once on `WorkoutBlock`.
    private static func mergedConditioningSegment(block: WorkoutBlock, merged: Prescription, order: Int) -> WorkoutSegment {
        // A homogeneous block (all-run series, all-erg) keeps that kind so its lap
        // records the right modality + capture; a MIXED-movement WOD (pull-ups +
        // run) has no single modality → `.reps` (a neutral timed record, no false
        // GPS/PM5/load). Mirrors the EMOM-merge rule.
        let kinds = Set(block.items.map(\.segmentKind))
        let kind: SegmentKind = kinds.count == 1 ? (kinds.first ?? .reps) : .reps

        let title = dedupPreservingOrder(block.items.map(\.exerciseName)).joined(separator: " · ")

        // A homogeneous single-modality block (a run series, a steady ride) keeps
        // its scalar pace / distance / zone targets so the pace HUD reads them; a
        // mixed WOD carries none (the round list drives the FIXED HUD instead).
        // "Homogeneous" has to include the MACHINE: a ski+remo Z2 used to borrow the
        // first movement's 4 km and pace and show them as the whole block's target.
        let principal = block.isSingleModality ? block.items.first : nil
        let p = principal?.paramsJson
        let distanceMeters: Double? = p?.distanceMeters.map(Double.init) ?? p?.distanceKm.map { $0 * 1000 }

        return WorkoutSegment(
            order: order,
            title: title.isEmpty ? block.title : title,
            kind: kind,
            templateSegmentId: block.items.first?.templateSegmentId,
            targetReps: p?.reps,
            targetDistanceMeters: distanceMeters,
            targetDurationSeconds: p?.durationSeconds,
            targetPaceSecondsPerKm: p?.paceSecPerKm,
            targetPowerWatts: merged.wattsTarget ?? p?.watts,   // #erg-3
            targetCalories: p?.calories,         // #erg-1
            targetZone: p?.hrZone.flatMap { HRZone(rawValue: $0) },
            loadKg: p?.loadKg,
            targetRpe: p?.rpe,
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            // One technique video only when the block is a single movement — and a
            // ski+remo block is two, however much they share a monitor.
            videoUrl: block.isSingleModality ? block.items.first?.exerciseVideoUrl : nil,
            prescription: merged,
            // #erg-2: a homogeneous erg fold (all-row, all-ski) carries its subtype so
            // the ONE lap records the right erg. A fold that MIXES machines carries
            // none — see `mergedEmomSegment` for why the kind alone can't tell.
            ergKind: block.singleErgMachine
        )
    }

    // Empaqueta la superserie plegada (`block.supersetFold`) en el ÚNICO tramo que
    // la ejecuta. Espeja a los otros dos plegados: aquí solo vive lo propio del
    // tramo (título, modalidad del registro, id atribuido); la rotación se construye
    // una vez en `WorkoutBlock`.
    private static func mergedSupersetSegment(block: WorkoutBlock,
                                              merged: Prescription,
                                              slots: [SupersetSlot],
                                              order: Int) -> WorkoutSegment {
        // Homogénea (todo hierro) conserva su kind; una superserie MIXTA (sentadilla
        // + dominadas) no tiene una sola modalidad → `.reps`, un registro neutro sin
        // GPS ni PM5 falsos. Misma regla que los otros dos plegados. Y no se pierde
        // el registro por serie: `usesMultiSetStrength` lo decide por el FORMATO.
        let kinds = Set(block.items.map(\.segmentKind))
        let kind: SegmentKind = kinds.count == 1 ? (kinds.first ?? .reps) : .reps

        // Los ejercicios en orden — es lo que el atleta reconoce como el bloque.
        let title = dedupPreservingOrder(block.items.map(\.exerciseName)).joined(separator: " · ")

        return WorkoutSegment(
            order: order,
            title: title.isEmpty ? block.title : title,
            kind: kind,
            // Un tramo, un template_segments.id: se atribuye al primer ejercicio (los
            // demás comparten bloque), igual que en los otros dos plegados.
            templateSegmentId: block.items.first?.templateSegmentId,
            // Sin escalares de bloque: la verdad de una superserie es de CADA serie,
            // y un objetivo de bloque sería el del primer ejercicio sobre todos.
            blockTitle: block.title,
            blockPosition: block.blockPosition,
            // Varios movimientos → ningún vídeo de técnica que no engañe.
            videoUrl: nil,
            prescription: merged,
            ergKind: block.singleErgMachine,
            supersetSlots: slots
        )
    }

    // Distinct strings keeping first-seen order — for the merged EMOM title so a
    // movement repeated across items isn't listed twice.
    private static func dedupPreservingOrder(_ xs: [String]) -> [String] {
        var seen = Set<String>()
        return xs.filter { seen.insert($0).inserted }
    }

    // The session's PRINCIPAL block — the main work whose format defines the
    // session. Mirrors `principalModality`/`classifyBlock` in
    // web/app/api/athlete/plan/week/route.ts: an explicitly "principal"-titled
    // block wins outright; else the largest non-warmup/cooldown block (most
    // items); else any block. Ties keep the earliest position so the result is
    // stable. Returns nil only for an empty block list.
    //
    // Internal (not private) so the pre-workout brief reuses the SAME selection to
    // derive its subtitle modality from the main work — never the warmup's first
    // exercise. One definition, no second heuristic to drift from this one.
    static func principalBlock(_ blocks: [WorkoutBlock]) -> WorkoutBlock? {
        guard !blocks.isEmpty else { return nil }
        let ordered = blocks.sorted { $0.blockPosition < $1.blockPosition }
        let roles = ordered.map { BlockPhase.classify(title: $0.title) }

        let principal = zip(ordered, roles).filter { $0.1 == .principal }.map(\.0)
        let mains = zip(ordered, roles).filter { $0.1 == .principal || $0.1 == .main }.map(\.0)
        let candidates = !principal.isEmpty ? principal : (!mains.isEmpty ? mains : ordered)

        // Largest by item count; `ordered` is position-ascending so `max(by:)`
        // keeping the first on a tie means the earliest block wins deterministically.
        return candidates.max { $0.items.count < $1.items.count }
    }

    // Map the DB `template_format` string (the block_format override) to the
    // unified `PrescriptionScheme` that drives the execution timer + score type.
    // Every canonical AND legacy value maps explicitly via `canonicalizing`
    // (strength_block/strength → .sets, tempo → .steady, circuit → .rounds,
    // test → .forTime, interval → .intervals); only a genuinely-unknown or nil
    // value falls to the generic default `.rounds` (a plain multi-round block).
    private static func workoutFormat(from blockFormat: String?) -> PrescriptionScheme {
        PrescriptionScheme(canonicalizing: blockFormat ?? "") ?? .rounds
    }
}

// MARK: - WorkoutItem → live-execution kind / measure
//
// An item's live-execution `SegmentKind` and its scalar-derived `Measure` are
// intrinsic to the item, so they live on `WorkoutItem` — reachable by both the
// live-plan builder (`WorkoutPlan.from`) and the alternating-EMOM fold
// (`WorkoutBlock.alternatingEmom`) without duplicating the mapping.

extension WorkoutItem {
    /// Map the DB `exercise_category` enum (running | rowing | ski_erg | bike_erg
    /// | functional | strength | hyrox_station | cardio | …) to the live-execution
    /// `SegmentKind` that drives which data grid + timer behaviour is shown.
    ///
    /// `cardio` is the catch-all bucket for run/row/ski/bike, so — exactly like the
    /// backend's modality resolver — we disambiguate by slug: erg work (row/ski/
    /// bike) gets the PM5-fed `rowOrSki` grid; everything else cardio is treated as
    /// running (distance/pace grid). `hyrox_station`/`functional` sleds get the
    /// sled grid; the rest of the stations are rep-driven. strength → strength.
    var segmentKind: SegmentKind {
        let s = exerciseSlug.lowercased()
        switch exerciseCategory {
        // Modern prescription modalities (web displayCategoryForModality)
        case "running":
            return .running
        case "rowing", "ski_erg", "bike_erg":
            return .rowOrSki
        case "functional":
            return s.contains("sled") ? .sled : .reps
        // Legacy raw exercise_category fallback
        case "cardio":
            if s.contains("row") || s.contains("ski") || s.contains("bike") || s.contains("cycl") {
                return .rowOrSki
            }
            return .running   // run / treadmill / generic cardio
        case "strength":
            return .strength
        case "hyrox_station":
            return s.contains("sled") ? .sled : .reps
        default:
            return .reps   // mobility | skill | plyometric | core | other
        }
    }

    /// #erg-2: the specific ERG sub-modality — "row" | "ski" | "bike" — or nil for a
    /// non-erg item. The live grid collapses all three into `.rowOrSki`; this recovers
    /// the distinction for the execution wire so the coach's modality analytics keep
    /// ski/bike/row separate. Disambiguates by category first, then slug (mirrors
    /// `segmentKind` + the web `SEG_MODALITY_SQL` resolver exactly).
    var ergSubtype: String? {
        let s = exerciseSlug.lowercased()
        switch exerciseCategory {
        case "rowing":  return "row"
        case "ski_erg": return "ski"
        case "bike_erg": return "bike"
        case "cardio":
            if s.contains("row") { return "row" }
            if s.contains("ski") { return "ski" }
            if s.contains("bike") || s.contains("cycl") { return "bike" }
            return nil   // run / treadmill / generic cardio is not an erg
        default:
            return nil
        }
    }

    /// This item's per-minute WORK as a structured `Measure`, derived from its
    /// scalar params — so a legacy (prescription-less) item still rotates in a
    /// merged EMOM. Mirrors `PrescriptionSet.emomWorkString`'s precedence.
    var scalarMeasure: Measure? {
        let p = paramsJson
        if let r = p.reps, r > 0 { return .reps(r) }
        if let c = p.calories, c > 0 { return .calories(c) }
        if let m = p.distanceMeters, m > 0 { return .distance(meters: Double(m)) }
        if let km = p.distanceKm, km > 0 { return .distance(meters: km * 1000) }
        if let d = p.durationSeconds, d > 0 { return .duration(seconds: d) }
        return nil
    }

    /// #break-3(a): a per-set strength prescription built from a SCALAR "N × reps"
    /// (params_json `{sets, reps, load_kg | load_pct, rest_seconds}`), so a
    /// prescription-less multi-set lift materializes ALL its sets instead of priming
    /// one. Nil unless it is genuinely a multi-set (`sets > 1`) rep-based strength
    /// scalar — a single set, a non-strength item, or a repless scalar keeps the
    /// legacy single-lap path (single sets get their per-set detail at close time).
    ///
    /// Vive en `WorkoutItem` (y no dentro del constructor de tramos) porque la
    /// rotación de la superserie necesita EXACTAMENTE las mismas series: si cada
    /// camino se las materializara por su cuenta, un 4×10 escrito en escalares
    /// rotaría distinto de como se ejecuta recto. UNA definición.
    var scalarStrengthPrescription: Prescription? {
        let p = paramsJson
        guard segmentKind == .strength, let sets = p.sets, sets > 1,
              let reps = p.reps, reps > 0 else { return nil }
        // Prefer an absolute kg objective; else a %1RM; else none (athlete logs load).
        let target: Target? = p.loadKg.map { .kg(value: $0, min: nil, max: nil) }
            ?? p.loadPct.map { .percentRM(value: $0, min: nil, max: nil) }
        let one = PrescriptionSet(measure: .reps(reps), target: target, modality: .strength,
                                  restS: p.restSeconds, tempo: nil, note: nil)
        return Prescription(scheme: .sets, modality: .strength,
                            sets: Array(repeating: one, count: sets),
                            rounds: nil, workS: nil, restS: p.restSeconds, totalS: nil,
                            target: target, note: nil, start: nil, increment: nil)
    }

    /// Las series de este ejercicio tal y como se van a ejecutar: las estructuradas
    /// del coach, y si no las trae, las que se materializan de sus escalares. Vacío
    /// cuando el ejercicio no declara ninguna serie — que es una de las dos formas
    /// en que una superserie llega mal formada.
    var seriesEjecutables: [PrescriptionSet] {
        if let sets = prescription?.sets, !sets.isEmpty { return sets }
        return scalarStrengthPrescription?.sets ?? []
    }
}

// MARK: - WorkoutBlock → alternating-EMOM fold (THE single source)
//
// An ALTERNATING EMOM is ONE block with several movements the athlete cycles
// minute by minute (min1 wallballs / min2 run / min3 wallballs …) — a SINGLE
// 15-min EMOM, not back-to-back ones. The backend ships it as one `emom` block
// with N items. Folding those items into ONE rotation prescription lives HERE,
// on `WorkoutBlock`, so BOTH consumers read it: the live timer (via
// `WorkoutPlan.from` → `WorkoutSegment.emomPlan`) and the pre-workout brief.
// Before, only the live builder folded and the brief stacked the items as
// separate cards ("15 wallballs then run") — two consumers, one presentation.

extension WorkoutBlock {
    /// The distinct erg machines ("row" | "ski" | "bike") the block's movements run
    /// on. Empty for non-erg work, several for a block that mixes them.
    var ergMachines: Set<String> { Set(items.compactMap(\.ergSubtype)) }

    /// The ONE erg machine this block runs on, or nil when it runs on none — or on
    /// MORE THAN ONE. Both folds ask this before stamping a machine on the single lap
    /// they produce: a block with a SkiErg and a RowErg has no single machine, and
    /// picking the first movement's is how a whole block came to be archived as
    /// rowing. THE single test, so the two folds cannot drift.
    var singleErgMachine: String? {
        let machines = ergMachines
        return machines.count == 1 ? machines.first : nil
    }

    /// True when the whole block is ONE movement family AND — for erg work — one
    /// machine. The test for "the block may borrow this movement's own scalars"
    /// (pace / distance / zone target, technique video). `segmentKind` alone says
    /// yes for ski+remo, because the three ergs share a single live grid.
    var isSingleModality: Bool {
        Set(items.map(\.segmentKind)).count == 1 && ergMachines.count <= 1
    }

    /// True when this block is an ALTERNATING EMOM: an EMOM (the block's declared
    /// `emom` format, else every item carries an EMOM prescription) with MORE THAN
    /// ONE movement. A single-movement EMOM (one item every minute) and every
    /// non-EMOM multi-item block (AMRAP, circuit, a strength block's exercises) are
    /// not — they keep one unit per item.
    var isAlternatingEmom: Bool {
        guard items.count > 1 else { return false }
        // "emom" is the backend's `template_format` enum value (see workoutFormat).
        if format == "emom" { return true }
        return items.allSatisfy { $0.prescription?.scheme == .emom }
    }

    /// The merged EMOM prescription for an alternating-EMOM block: its movements
    /// folded into ONE EMOM whose minutes ROTATE through them (min1 item0 / min2
    /// item1 / min3 item0 …) across the EMOM's total minutes (`rounds`). nil when
    /// the block is not an alternating EMOM. THE single fold the live timer and the
    /// brief both read, so the EMOM is presented identically in both.
    var alternatingEmom: Prescription? {
        guard isAlternatingEmom else { return nil }

        // Each item becomes one rotation slot — its per-minute work (the item's
        // set, else its scalar params), intensity target, modality and movement
        // label — so `Prescription.emomPlan` expands the rotation across the minutes.
        let rotation: [PrescriptionSet] = items.map { item in
            let baseSet = item.prescription?.sets?.first
            let coachLabel = baseSet?.note?.trimmingCharacters(in: .whitespacesAndNewlines)
            return PrescriptionSet(
                // The minute's WORK — the item's prescribed set, else derived from its
                // scalar params so a legacy (prescription-less) item still rotates.
                measure: baseSet?.measure ?? item.scalarMeasure,
                // Its INTENSITY — the per-set target, else the item's block-level one.
                target: baseSet?.target ?? item.prescription?.target,
                // Its MODALITY — drives the erg /500m vs run /km pace unit in the HUD.
                // Per-set, else item-level, else inferred from the exercise category.
                // The catalogue's ERG machine wins: the exercise IS a SkiErg or a
                // RowErg, and `segmentKind` collapses all three ergs into one bucket
                // whose fallback string is "row" — which is how a folded ski minute
                // came out labelled rowing. Non-erg items keep the old precedence.
                modality: item.ergSubtype.flatMap(PrescriptionModality.init(rawValue:))
                    ?? baseSet?.modality
                    ?? item.prescription?.modality
                    ?? PrescriptionModality(rawValue: item.segmentKind.modality),
                restS: baseSet?.restS,
                tempo: baseSet?.tempo,
                // The MOVEMENT label shown for this minute — the coach's set note, else
                // the exercise name. Never nil, so each minute names its own movement.
                note: (coachLabel?.isEmpty == false) ? coachLabel : item.exerciseName
            )
        }

        // EMOM TOTAL minutes (e.g. 15). Every item carries the SAME total in `rounds`;
        // take the max (guards a nil/stray). NOT summed across items — an alternating
        // "EMOM 15" is 15 minutes total cycling the rotation, NOT 15×items = 30 (the
        // bug). Per-movement counts would DIFFER (8 vs 7 across 15 alternating
        // minutes), so an equal `rounds` on every item can only be the EMOM total.
        let totalMinutes = items.compactMap { $0.prescription?.rounds }.max()
        // The WORK window ("on the minute" = 60s; `emomPlan` defaults to 60 when
        // absent) and, when the coach prescribed one, the explicit TRANSITION that
        // closes each cycle — carried through so a 45/15 station EMOM keeps its
        // stop cue after the fold. Both come from the items, which all repeat the
        // block's params identically.
        let cadence = items.compactMap { $0.prescription?.workS }.first
        let transition = items.compactMap { $0.prescription?.restS }.first

        return Prescription(
            scheme: .emom,
            modality: nil,
            sets: rotation,
            rounds: totalMinutes,
            workS: cadence,
            restS: transition,
            totalS: nil,
            target: nil,
            note: nil,
            start: nil,
            increment: nil
        )
    }

    /// True cuando el coach declaró este bloque como SUPERSERIE. Solo el formato
    /// del bloque lo dice: dos ejercicios en el mismo bloque nunca han rotado, y no
    /// van a empezar a hacerlo por estar juntos (docs/DECISIONS.md 2026-08-05).
    var isSuperset: Bool { PrescriptionScheme(canonicalizing: format) == .superset }

    /// La SUPERSERIE plegada: los ejercicios del bloque en el orden REAL de
    /// ejecución —A1 serie 1 → A2 serie 1 → A3 serie 1 → A1 serie 2 …— más la
    /// etiqueta de qué ejercicio y qué vuelta es cada turno.
    ///
    /// POR QUÉ NO SIRVE `conditioningFold`: aquel se queda con el PRIMER set de
    /// cada ejercicio (una ronda de metcon es una lista de movimientos), y una
    /// superserie de fuerza es justo lo contrario — cada ejercicio trae N series
    /// con SU carga y SU descanso, y perderlas es perder el entreno. Aquí se
    /// conservan todas: la serie r de cada ejercicio, con su medida, su objetivo,
    /// su tempo y su descanso intactos.
    ///
    /// SERIES DESIGUALES: si A1 trae 4 y A2 trae 3, la vuelta 4 la corre A1 solo.
    /// Nada se inventa y nada se pierde; las vueltas son las del que más trae.
    ///
    /// DEGRADA A SERIES RECTAS (nil) cuando el bloque llega mal formado: un solo
    /// ejercicio, o algún ejercicio sin series. Misma doctrina que el EMOM y el
    /// AMRAP — un bloque roto se ejecuta como lo que sí se entiende, nunca revienta
    /// y nunca se inventa una rotación que el coach no escribió.
    var supersetFold: (prescription: Prescription, slots: [SupersetSlot])? {
        guard isSuperset, items.count > 1 else { return nil }
        let porEjercicio = items.map(\.seriesEjecutables)
        guard porEjercicio.allSatisfy({ !$0.isEmpty }) else { return nil }
        let vueltas = porEjercicio.map(\.count).max() ?? 0
        guard vueltas > 0 else { return nil }

        var rotacion: [PrescriptionSet] = []
        var slots: [SupersetSlot] = []
        for vuelta in 0..<vueltas {
            for (i, item) in items.enumerated() {
                let series = porEjercicio[i]
                // El ejercicio que ya agotó sus series no vuelve a aparecer.
                guard vuelta < series.count else { continue }
                let serie = series[vuelta]
                let etiquetaCoach = serie.note?.trimmingCharacters(in: .whitespacesAndNewlines)
                let movimiento = (etiquetaCoach?.isEmpty == false) ? etiquetaCoach! : item.exerciseName
                rotacion.append(
                    PrescriptionSet(
                        // La serie ENTERA, verbatim: su medida, su carga, su tempo y
                        // su descanso son lo que hace que esto sea fuerza y no un WOD.
                        measure: serie.measure,
                        target: serie.target ?? item.prescription?.target,
                        modality: serie.modality
                            ?? item.prescription?.modality
                            ?? PrescriptionModality(rawValue: item.segmentKind.modality),
                        restS: serie.restS,
                        tempo: serie.tempo,
                        // Nunca nil: cada turno nombra su movimiento, que es la mitad
                        // de lo que el atleta necesita saber en una rotación.
                        note: movimiento
                    )
                )
                slots.append(SupersetSlot(movement: movimiento, round: vuelta + 1, rounds: vueltas))
            }
        }

        return (
            Prescription(
                scheme: .superset,
                modality: nil,
                sets: rotacion,
                rounds: vueltas,
                workS: nil,
                restS: nil,
                totalS: nil,
                // El objetivo es de CADA serie (cargas distintas por ejercicio): uno
                // de bloque sería el del primer ejercicio pintado sobre todos.
                target: nil,
                note: nil,
                start: nil,
                increment: nil
            ),
            slots
        )
    }

    /// The block's canonical conditioning scheme — the authored `format`, else the
    /// items' shared prescription scheme. Nil when neither resolves to a known
    /// format.
    var conditioningScheme: PrescriptionScheme? {
        if let s = PrescriptionScheme(canonicalizing: format) { return s }
        return items.first?.prescription?.scheme
    }

    /// The merged block-level prescription for a MULTI-movement conditioning block
    /// that is NOT an alternating EMOM (For Time, AMRAP, Tabata, Intervals, Death
    /// By, Steady, Chipper, Ladder, Rounds, HYROX sim): its movements folded into
    /// ONE prescription whose `sets[]` is the round/list and whose top-level params
    /// (cap/window `total_s`, `rounds`, `work_s`, `rest_s`, Death By `start`/
    /// `increment`) drive the single live timer. nil when the block is not a
    /// multi-movement conditioning block (single-movement blocks keep their natural
    /// one-segment-per-item shape; strength / warmup / cooldown never fold). THE
    /// single fold the live timer and the preview both read.
    var conditioningFold: Prescription? {
        guard items.count > 1,
              let scheme = conditioningScheme,
              scheme != .emom,           // alternating EMOM has its own fold
              scheme.runsConditioningTimer else { return nil }

        // Each movement becomes one round/list entry — its work (the item's set,
        // else its scalar params), intensity target, modality and movement label.
        let rotation: [PrescriptionSet] = items.map { item in
            let baseSet = item.prescription?.sets?.first
            let coachLabel = baseSet?.note?.trimmingCharacters(in: .whitespacesAndNewlines)
            return PrescriptionSet(
                measure: baseSet?.measure ?? item.scalarMeasure,
                target: baseSet?.target ?? item.prescription?.target,
                // The catalogue's ERG machine wins: the exercise IS a SkiErg or a
                // RowErg, and `segmentKind` collapses all three ergs into one bucket
                // whose fallback string is "row" — which is how a folded ski minute
                // came out labelled rowing. Non-erg items keep the old precedence.
                modality: item.ergSubtype.flatMap(PrescriptionModality.init(rawValue:))
                    ?? baseSet?.modality
                    ?? item.prescription?.modality
                    ?? PrescriptionModality(rawValue: item.segmentKind.modality),
                restS: baseSet?.restS,
                tempo: baseSet?.tempo,
                note: (coachLabel?.isEmpty == false) ? coachLabel : item.exerciseName
            )
        }

        // Block params: prefer the per-item prescription (each line carries the
        // block-level config, as EMOM lines carry `rounds`), else the schemaless
        // `config_json` keys (snake_case, read verbatim — see JSONValue note).
        func itemMax(_ f: (Prescription) -> Int?) -> Int? {
            items.compactMap { $0.prescription.flatMap(f) }.max()
        }
        func itemFirst(_ f: (Prescription) -> Int?) -> Int? {
            items.compactMap { $0.prescription.flatMap(f) }.first
        }
        let totalS = itemMax { $0.totalS } ?? configJson?.int("time_cap_seconds") ?? configJson?.int("total_seconds")
        let rounds = itemMax { $0.rounds } ?? configJson?.int("rounds")

        // CIRCUITO (2026-08-07 DECISIONS): a block authored with a real `pacing` —
        // "por_tarea" (no clock; the round ends whenever the athlete strikes the last
        // station) or "por_reloj" (a hard per-station clock, `work_seconds`) — GATES
        // `workS` explicitly instead of ever inferring one. `por_tarea` means "no
        // clock cap", full stop: it wins over any legacy per-item leftover — this is
        // the exact "ventana trabajo" confusion Alex reported, where a work window
        // kept being asked for / applied on a format that has none. No `pacing` in
        // `config_json` (every block today, and every non-circuit format forever)
        // falls to the pre-existing legacy chain byte-for-byte.
        let pacing = configJson?.string("pacing")
        let workS: Int?
        switch pacing {
        case "por_tarea":
            workS = nil
        case "por_reloj":
            workS = configJson?.int("work_seconds")
        default:
            workS = itemFirst { $0.workS } ?? configJson?.int("work_seconds") ?? configJson?.int("emom_interval_seconds")
        }

        // Two SEPARATE rest windows (2026-08-07 DECISIONS): the gap INSIDE a round,
        // between one station and the next — `restS`, its existing meaning, already
        // correct — and the gap AFTER a full round, before the next one starts —
        // `restBetweenRoundsS`, new. `rest_between_stations_seconds` only exists on a
        // real Circuito block, so it slots in ahead of the legacy generic
        // `rest_seconds` without ever shadowing it for EMOM/Tabata/intervals, which
        // keep reading that key exactly as before.
        let restS = itemFirst { $0.restS }
            ?? configJson?.int("rest_between_stations_seconds")
            ?? configJson?.int("rest_seconds")
        let restBetweenRoundsS = configJson?.int("rest_between_rounds_seconds")
        let start = itemFirst { $0.start } ?? configJson?.int("start")
        let increment = itemFirst { $0.increment } ?? configJson?.int("increment")

        // A block-level HEADER target is only honest when EVERY item genuinely
        // shares the SAME one — a uniform interval pyramid ("5×400m @ threshold")
        // where every bout carries the identical objective. Blindly taking item 0's
        // target is the "3:45/km huérfano" bug (2026-08-07 DECISIONS): a mixed
        // circuit's item 0 (say a Run station) keeps its own real pace, but that pace
        // is not the BLOCK's — `RunTarget.resolve(from:)` (Devices/Treadmill/
        // RunTargetResolver.swift) reads `segment.prescription?.target` directly, with
        // no per-station awareness, and would show a leftover run pace as the target
        // while the athlete is on Wallballs or Sled Push.
        let firstTarget = items.first?.prescription?.target
        let uniformTarget: Target? = (firstTarget != nil
            && items.allSatisfy { $0.prescription?.target == firstTarget })
            ? firstTarget : nil

        return Prescription(
            scheme: scheme,
            modality: nil,
            sets: rotation,
            rounds: rounds,
            workS: workS,
            restS: restS,
            totalS: totalS,
            target: uniformTarget,
            note: nil,
            start: start,
            increment: increment,
            restBetweenRoundsS: restBetweenRoundsS
        )
    }
}

// MARK: - Block regions (coach-authored block boundaries)
//
// The session's segments partitioned into the coach's AUTHORED blocks (a
// "Calentamiento", a "Fuerza" block, a "Metcon"), in session order, each with the
// segment-index span it covers. Unlike `phaseRegions` — which FOLDS every main
// block into one "Principal" phase for the top rail — this keeps every block
// DISTINCT, because the block-transition gate must fire at EACH block boundary the
// athlete sets up for: a Fuerza→Metcon hand-off needs a gate (load the bar, read
// the WOD) just as much as Calentamiento→Principal does, even though both are the
// "Principal" phase. Phase granularity would miss those intra-phase gates.
struct WorkoutBlockRegion: Identifiable, Equatable {
    let id: Int            // 0-based block index in session order
    let title: String      // coach block title, else the phase display name
    let phase: BlockPhase
    let firstIndex: Int    // first segment index of this block
    let lastIndex: Int     // last segment index of this block
}

extension WorkoutPlan {
    /// The coach's blocks as index-spanned regions, in session order. Consecutive
    /// segments sharing a `blockGroupingKey` form one block. Empty only for an
    /// empty plan. THE single partition both the block-preview gate and
    /// `segmentGroups` read, so block boundaries are defined in exactly one place.
    var blockRegions: [WorkoutBlockRegion] {
        var regions: [WorkoutBlockRegion] = []
        var start = 0
        var key: String? = nil
        func flush(_ end: Int) {
            let first = segments[start]
            let trimmed = first.blockTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (trimmed?.isEmpty == false) ? trimmed! : first.blockPhase.displayName
            regions.append(
                WorkoutBlockRegion(
                    id: regions.count,
                    title: title,
                    phase: first.blockPhase,
                    firstIndex: start,
                    lastIndex: end
                )
            )
        }
        for (i, seg) in segments.enumerated() {
            let k = seg.blockGroupingKey
            if let prev = key, prev != k { flush(i - 1); start = i }
            key = k
        }
        if !segments.isEmpty { flush(segments.count - 1) }
        return regions
    }

    /// The block region that contains `index`, or nil when out of range.
    func blockRegion(containing index: Int) -> WorkoutBlockRegion? {
        blockRegions.first { index >= $0.firstIndex && index <= $0.lastIndex }
    }

    /// The segments belonging to a block region, in session order.
    func segments(in region: WorkoutBlockRegion) -> [WorkoutSegment] {
        guard region.firstIndex <= region.lastIndex,
              region.firstIndex >= 0, region.lastIndex < segments.count else { return [] }
        return Array(segments[region.firstIndex...region.lastIndex])
    }
}

extension WorkoutPlan {
    // The plan's segments regrouped into their coach blocks, preserving session
    // order. Derived from `blockRegions` (the single block partition) so the
    // post-workout summary's Calentamiento / Principal / Vuelta a la calma sections
    // and the live block-preview gate can never disagree on where a block begins.
    var segmentGroups: [WorkoutSegmentGroup] {
        blockRegions.map { region in
            WorkoutSegmentGroup(
                id: region.id,
                title: region.title,
                phase: region.phase,
                segments: segments(in: region)
            )
        }
    }
}

extension WorkoutPlan {
    /// The runnable session's principal modality as a backend modality wire string
    /// ("run" | "row" | "strength" | "other"), read from the main-work block's
    /// dominant segment kind. Feeds WatchConnectivityiOSService.activityKind so the
    /// wrist recording (mirror mode) gets the SAME HKWorkout type the watch push
    /// derives. Falls back to any segment for a title-only / freeform plan.
    var principalModalityWire: String {
        let mains = blockRegions.filter { $0.phase.isMainWork }
        let regions = mains.isEmpty ? blockRegions : mains
        let pool = regions.flatMap { segments(in: $0) }
        let candidates = pool.isEmpty ? segments : pool
        let dominant = Dictionary(grouping: candidates, by: { $0.kind })
            .max { $0.value.count < $1.value.count }?.key
        return (dominant ?? segments.first?.kind ?? .reps).modality
    }
}

// MARK: - Phase regions (the persistent top phase rail)
//
// The session's segments collapsed into their PEDAGOGICAL phases (Calentamiento /
// Principal / Vuelta a la calma) with the segment-index span each phase covers,
// in session order. Drives the active-workout phase rail: each region is one
// rail segment whose state (done / current / upcoming) is read off the current
// segment index, and tapping it jumps to `firstIndex`.

struct WorkoutPhaseRegion: Identifiable, Equatable {
    let id: Int
    let phase: BlockPhase
    let title: String      // phase display name ("Principal")
    let firstIndex: Int    // first segment index of this phase
    let lastIndex: Int     // last segment index of this phase
}

extension WorkoutPlan {
    /// Distinct phases present in the session, ordered by first appearance, each
    /// spanning the segment range it covers. Empty when NO segment carries block
    /// context (the freeform / `minimal` fallback) — the rail then collapses to a
    /// single "Entreno" chip rather than hiding (kills the dead-spot). `.main` and
    /// `.principal` both fold into the one "Principal" phase.
    var phaseRegions: [WorkoutPhaseRegion] {
        guard segments.contains(where: { $0.blockTitle != nil }) else { return [] }

        // Fold .main into .principal so warmup/principal/cooldown is the axis.
        func key(_ p: BlockPhase) -> BlockPhase { p.isMainWork ? .principal : p }

        var minIdx: [BlockPhase: Int] = [:]
        var maxIdx: [BlockPhase: Int] = [:]
        for (i, seg) in segments.enumerated() {
            let k = key(seg.blockPhase)
            minIdx[k] = Swift.min(minIdx[k] ?? i, i)
            maxIdx[k] = Swift.max(maxIdx[k] ?? i, i)
        }
        return minIdx.keys
            .sorted { (minIdx[$0] ?? 0) < (minIdx[$1] ?? 0) }
            .enumerated()
            .map { idx, phase in
                WorkoutPhaseRegion(
                    id: idx,
                    phase: phase,
                    title: phase.displayName,
                    firstIndex: minIdx[phase]!,
                    lastIndex: maxIdx[phase]!
                )
            }
    }
}
