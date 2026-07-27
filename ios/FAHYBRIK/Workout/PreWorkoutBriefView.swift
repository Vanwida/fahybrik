import SwiftUI

// Session DETALLE — the pre-workout brief (handoff: `App Atleta - Flujo.dc.html`
// `detalle` screen). A faithful hi-fi recreation in our warm near-black palette
// with Fabrik orange as the brand accent (the handoff red is OURS = orange).
//
// The brief presents the prescription and lets the athlete register it. Two
// completion paths stay reachable: the rich "▶ Empezar" launch into the live
// ActiveWorkout (timed / erg / run sessions), and the handoff's quick "Marcar
// completada ✓ + RPE" for sessions that don't need live tracking (e.g. strength
// in the box). The footer offers both; the body never invents a value it
// doesn't have — every field is rendered from the coach's real prescription and
// absent fields are empty-stated.
//
// DATA SOURCE: the body is rendered from the RICH `AssignmentDetail` — the same
// authoritative `GET /api/athlete/assignments/{id}/detail` payload (blocks →
// typed items → per-set prescription + resolved pace/load) that the
// SessionExercisesSheet reads. There is ONE rendering of the day, single-sourced
// from that detail; the `WorkoutPlan` is kept only to launch the live execution
// engine (`onStart`), never as a second presentation of the prescription. When
// the detail isn't available the brief shows an honest "sin detalle" state — it
// never fabricates a placeholder session. (AM/PM cross-session switch remains a
// follow-up: the brief is handed one session.)
struct PreWorkoutBriefView: View {
    /// The live-execution shape — used ONLY to launch the timer/lap engine via
    /// `onStart` (and as the title/CTA source). NOT a rendering source for the
    /// prescription: that is always the structured `detail` below.
    let plan: WorkoutPlan
    /// The RICH assignment detail — structured per-set prescription + true block
    /// grouping — the brief's single rendering source (per-set pyramids,
    /// modality-native targets, grouped blocks). When nil/empty (offline first-
    /// open with no cache, ad-hoc session, or a session with no detailed
    /// exercises) the brief shows an honest "sin detalle" card, never a fabricated
    /// generic "Sesión".
    var detail: AssignmentDetail? = nil
    /// Fired with the athlete's run-location choice (nil for a non-run session or if
    /// unchosen) — the container stamps it on the session to auto-open the right HUD.
    let onStart: (RunEnvironment?) -> Void
    /// "Ya lo hice": the athlete trained without the live timer and registers it
    /// after the fact. Routes straight to manual entry (no ActiveWorkout).
    let onManualLog: () -> Void
    /// "Registrar con captura" (Idea 1): the athlete trained with ANOTHER app and
    /// brings the result in via a screenshot the IA reads. Opens the capture flow.
    var onCaptureLog: () -> Void = {}
    /// Show the capture-log button — only for a REAL assignment (the result must
    /// attribute to one). Hidden for ad-hoc/free sessions.
    var showCaptureLog: Bool = false
    /// #Marcas — a benchmark attempt: no manual paths (a mark the app didn't
    /// measure doesn't exist) and the erg gate has no escape.
    var isBenchmark: Bool = false
    let onClose: () -> Void

    // Per-exercise technique video opened in-app from a series row, when present.
    @State private var segmentVideoUrl: String? = nil

    // #8 — a session with running work starts through the full-screen pre-start
    // sequence (¿dónde corres? → cinta → conectar → GO); presented on "▶ EMPEZAR".
    @State private var showRunPreStart = false

    // Erg sessions start through a DEDICATED full-screen connect step (mirror of
    // the run pre-start): first the connect screen, the athlete accepts THEIR
    // machine, and only then the piece begins — plan, libre and benchmark alike.
    @State private var showErgPreStart = false

    // MARK: - Derived shape

    private var modality: String? {
        // The session's modality comes from the PRINCIPAL block (the main work),
        // NOT the first exercise — otherwise a warmup BikeErg would label a leg-day
        // session "Ergómetro". Reuses the SAME principal-block selection the live
        // plan builder uses (WorkoutPlan.principalBlock), so the subtitle, the
        // accent tint and the weekly card all agree. Falls back to the first
        // segment's kind only for ad-hoc / title-only sessions with no blocks.
        if let blocks = structuredBlocks, !blocks.isEmpty,
           let principal = WorkoutPlan.principalBlock(blocks) {
            return blockModality(principal)
        }
        guard let first = sortedSegments.first else { return nil }
        return first.kind.modality
    }

    private var sortedSegments: [WorkoutSegment] {
        plan.segments.sorted { $0.order < $1.order }
    }

    /// A session reads as "strength" when every prescribed movement is a lift —
    /// then the handoff's Ejercicio / S×R / Carga / RPE table is the faithful
    /// presentation. Any cardio/erg/run segment flips it to the block layout.
    private var isStrengthSession: Bool {
        let segs = sortedSegments
        guard !segs.isEmpty else { return false }
        return segs.allSatisfy { $0.kind == .strength }
    }

    /// The devices worth connecting BEFORE this session starts — derived from its
    /// segments (a squat day offers none; a run day offers the belt + strap). Empty
    /// → the card is hidden.
    private var eligibleDevices: [PreWorkoutDevice] {
        PreWorkoutDeviceEligibility.devices(for: sortedSegments)
    }

    private var hasRunSegment: Bool { sortedSegments.contains { $0.kind == .running } }

    /// The PRINCIPAL work is an erg piece → the monitor measures the session, so
    /// starting without it makes the whole effort unmeasured. Warmup ergs inside a
    /// strength day do NOT gate (principal-block selection, same as the subtitle).
    private var ergIsPrincipal: Bool {
        switch modality {
        case "row", "ski", "bike": return true
        default: return false
        }
    }

    /// Human name of the machine for the connect CTA.
    private var ergMachineWord: String {
        switch modality {
        case "ski":  return "el SkiErg"
        case "bike": return "la bici"
        default:     return "el remo"
        }
    }

    /// Devices the SMALL bottom card still offers: the HR strap only. The PM5 has
    /// its first-class connect card at the top and the treadmill lives in the
    /// full-screen pre-start run sequence — ONE journey each, no duplicates.
    private var bottomDevices: [PreWorkoutDevice] {
        eligibleDevices.filter { $0 == .heartRate }
    }

    // Meta line under the title: only the fields we genuinely have. Estimated
    // duration (when known) + a human modality word + the headline zone target.
    private var metaLine: String {
        var parts: [String] = []
        if plan.estimatedDurationSeconds > 0 {
            let mins = Int((Double(plan.estimatedDurationSeconds) / 60.0).rounded())
            parts.append("≈ \(mins) min")
        }
        parts.append(modalityWord)
        if let z = headlineZone {
            parts.append("objetivo \(z.label)")
        }
        return parts.joined(separator: " · ")
    }

    // ES word for the subtitle. Covers both modality vocabularies the `modality`
    // property can return: PrescriptionModality raw values (run/row/ski/bike/
    // strength/functional/core/mobility) from the principal block, and the
    // SegmentKind fallback (run/row/strength/other). Unknown → neutral "Sesión".
    private var modalityWord: String {
        switch modality {
        case "run":                 return "Carrera"
        case "row", "ski", "bike":  return "Ergómetro"
        case "strength":            return "Fuerza"
        case "functional":          return "Funcional"
        case "core", "mobility":    return "Movilidad"
        default:                    return "Sesión"
        }
    }

    // The most intense prescribed zone — the session's headline target badge.
    private var headlineZone: HRZone? {
        let zones = sortedSegments.compactMap(\.targetZone)
        return zones.max(by: { $0.rawValue < $1.rawValue })
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                    coachNote
                    // ErgData pattern: erg work puts the CONNECT card first-class at
                    // the top, above the blocks — the one PM5 entry, never a small
                    // chip below the fold.
                    if eligibleDevices.contains(.pm5) {
                        ErgConnectCard()
                    }
                    if let blocks = structuredBlocks, !blocks.isEmpty {
                        // The brief renders the coach's structured prescription —
                        // the SAME authoritative `GET /assignments/{id}/detail`
                        // blocks the SessionExercisesSheet shows — grouped per
                        // block and branched by modality. Single source of truth:
                        // there is NO second, WorkoutPlan-derived rendering of the
                        // day to drift from this one (that fork only ever produced
                        // a fabricated generic "Sesión" and was removed).
                        structuredBody(blocks)
                    } else {
                        // No detail blocks reached the brief: an offline first-open
                        // with no cache, or a session with no detailed exercises.
                        // We DON'T fabricate a placeholder warmup + a "Sesión"
                        // series — we say so honestly. The footer still offers a
                        // freeform start + the retroactive "Ya lo hice" log.
                        detailUnavailableCard
                    }
                    if !bottomDevices.isEmpty {
                        // The strap connects BEFORE the clock starts, so the live
                        // workout begins already streaming. Optional — starting
                        // without connecting is unchanged.
                        DeviceConnectCard(devices: bottomDevices)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            footer
        }
        .background(Theme.Color.background.ignoresSafeArea())
        // #8 — the run pre-start sequence (mockup): ¿dónde? → (cinta → conectar) → GO.
        .fullScreenCover(isPresented: $showRunPreStart) {
            RunPreStartFlow(
                sessionTitle: plan.name,
                onStart: { env in
                    showRunPreStart = false
                    onStart(env)
                },
                onCancel: { showRunPreStart = false }
            )
        }
        .sheet(isPresented: Binding(
            get: { segmentVideoUrl != nil },
            set: { if !$0 { segmentVideoUrl = nil } }
        )) {
            if let url = segmentVideoUrl {
                YouTubeSheet(url: url, title: "Técnica")
            }
        }
    }

    // MARK: - Nav bar (stays visible — the athlete can always leave)

    private var topBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button(action: { Haptics.light(); onClose() }) {
                ZStack {
                    Circle().fill(Theme.Color.surfaceElevated)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                }
                .frame(width: 34, height: 34)
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Atrás")

            Text(sessionsTodayLabel)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.m)
    }

    // The handoff shows "{Weekday N} · {n} sesiones hoy". The brief is handed a
    // single session with no calendar context, so we stay honest: one session,
    // no fabricated date. (AM/PM cross-session switch is a backend gap — the
    // sibling session isn't passed to this view.)
    private var sessionsTodayLabel: String { "1 sesión hoy" }

    // MARK: - Header (title + meta)

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(plan.name)
                .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            MonoText(text: metaLine, size: 12, weight: .medium, color: Theme.Color.muted)
            if !plan.blockContext.isEmpty {
                LabelText(text: plan.blockContext)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Coach note ("generado y revisado por {coach}")

    @ViewBuilder
    private var coachNote: some View {
        if let note = plan.coachNote, !note.isEmpty {
            CardSurface(padding: 13) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(note)
                        .scaledFont(12, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                    // The handoff attributes the note to the coach by name. The
                    // brief isn't given the coach name (BACKEND GAP), so we keep
                    // the honest, name-free attribution rather than hardcoding one.
                    Text("Generado y revisado por tu coach")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
    }

    // MARK: - Detail unavailable (honest — no fabricated session)
    //
    // Shown when the authoritative assignment detail didn't reach the brief: an
    // offline first-open with no cache, or a session with no detailed exercises.
    // The brief NEVER invents a placeholder warmup + a "Sesión" series here — it
    // states it plainly and leaves the footer's freeform start / "Ya lo hice" log
    // reachable so the athlete can still act.
    private var detailUnavailableCard: some View {
        CardSurface(padding: 18) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 9) {
                    Image(systemName: "list.bullet.rectangle")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                    Text("Sin detalle de la sesión")
                        .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                }
                Text("No pudimos cargar los ejercicios de esta sesión. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sin detalle de la sesión. No pudimos cargar los ejercicios. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente.")
    }

    // MARK: - Structured body (from the rich AssignmentDetail prescription)
    //
    // The faithful presentation: the coach's blocks stay GROUPED (a metcon /
    // superset keeps its movements under one block, never flattened into
    // separate cards), and each item renders by its MODALITY — a squat pyramid
    // as a per-set table, a Z1 bike as a distance×zone card, a 4×400m run as an
    // interval card. Falls back gracefully per-item to scalar params when an item
    // has no structured prescription.

    private var structuredBlocks: [WorkoutBlock]? {
        detail?.workout?.blocks
    }

    @ViewBuilder
    private func structuredBody(_ blocks: [WorkoutBlock]) -> some View {
        let ordered = blocks.sorted { $0.blockPosition < $1.blockPosition }
        // Partition by pedagogical role. The MAIN work (principal + untitled main
        // blocks) leads the brief as full sections; warmup/cooldown collapse into
        // compact checklists below so they never push the main work below the fold.
        let mainBlocks = ordered.filter { BlockPhase.classify(title: $0.title).isMainWork }
        let warmupItems = ordered
            .filter { BlockPhase.classify(title: $0.title) == .warmup }
            .flatMap(\.items)
        let cooldownItems = ordered
            .filter { BlockPhase.classify(title: $0.title) == .cooldown }
            .flatMap(\.items)
        // Safety: if nothing classified as main work (every block is warmup/
        // cooldown), render them all in full rather than hiding the whole session.
        let leadBlocks = mainBlocks.isEmpty ? ordered : mainBlocks

        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(leadBlocks) { block in
                blockSection(block)
            }
            if !mainBlocks.isEmpty {
                if !warmupItems.isEmpty {
                    collapsedChecklist("Calentamiento", items: warmupItems)
                }
                if !cooldownItems.isEmpty {
                    collapsedChecklist("Vuelta a la calma", items: cooldownItems)
                }
            }
        }
    }

    // MARK: Collapsed warmup / cooldown checklist
    //
    // Secondary work (warmup, cooldown) shown as a compact tickable list — one
    // small row per drill with its dominant target — instead of full-size cards
    // identical to the main work. Keeps the athlete's eye on the principal block.
    @ViewBuilder
    private func collapsedChecklist(_ title: String, items: [WorkoutItem]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: 9) {
                Circle().fill(Theme.Color.faint).frame(width: 6, height: 6)
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .heavy, design: .default).italic())
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 8)
            }
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        if idx > 0 { Hairline() }
                        checklistRow(item)
                    }
                }
            }
        }
    }

    private func checklistRow(_ item: WorkoutItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "circle")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text(item.exerciseName)
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            if let summary = compactSummary(item) {
                MonoText(text: summary, size: 12, weight: .medium, color: Theme.Color.muted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // A one-line target for a collapsed row: the dominant measure + pace/zone.
    // Reuses the same renderer the full cards use (structured prescription first,
    // legacy scalar params as fallback), so the compact line never invents a value.
    private func compactSummary(_ item: WorkoutItem) -> String? {
        let line = item.prescription.map { PrescriptionRenderer.summaryLine($0) }
            ?? lineFromParams(item)
        var parts: [String] = []
        if let h = line.headline { parts.append(h) }
        if let p = line.pace { parts.append(p) }
        if let z = line.zone { parts.append(z.label) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func blockSection(_ block: WorkoutBlock) -> some View {
        let wod = wodHeader(for: block)
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            // Block header: a modality dot + the block title + (when conditioning)
            // its WOD format/cap chip.
            HStack(spacing: 9) {
                Circle()
                    .fill(Theme.Modality.color(blockModality(block)))
                    .frame(width: 8, height: 8)
                Text(block.title)
                    .scaledFont(14, weight: .bold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                Spacer(minLength: 8)
                if let wod {
                    Text(wod)
                        .font(.system(size: 11, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Theme.Color.accentText.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
            }
            if let note = block.coachNote, !note.isEmpty {
                Text(note)
                    .scaledFont(12, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // An ALTERNATING EMOM is ONE EMOM whose minutes rotate through its
            // movements — render it as a single interleaved unit (min impar / min
            // par …), NOT a stack of "15 wallballs" + "run" cards. Reads the SAME
            // `block.alternatingEmom` fold the live timer runs, so the brief and the
            // timer can never present the EMOM differently.
            if let merged = block.alternatingEmom {
                alternatingEmomCard(block, merged)
            } else {
                ForEach(block.items) { item in
                    itemView(item)
                }
            }
        }
    }

    // MARK: Alternating EMOM — one interleaved unit (the minute-by-minute rotation)
    //
    // Renders the shared `block.alternatingEmom` rotation as ONE card: an "alterna
    // cada minuto · N min" header over one row per movement (Min impar / Min par,
    // or Min 1/2/3 for ≥3), each with its work + intensity from the SAME
    // `PrescriptionSet.emomInterval` the live HUD uses. The athlete reads "this
    // alternates every minute", not "do 15 wallballs then run".
    @ViewBuilder
    private func alternatingEmomCard(_ block: WorkoutBlock, _ merged: Prescription) -> some View {
        let sets = merged.sets ?? []
        CardSurface(padding: 0, leftAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "repeat")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text("ALTERNA CADA MINUTO")
                        .font(.system(size: 11, weight: .heavy, design: .default).italic())
                        .tracking(0.6)
                        .foregroundStyle(Theme.Color.accentText)
                    Spacer(minLength: 8)
                    if let minutes = merged.rounds, minutes > 0 {
                        MonoText(text: "\(minutes) min", size: 12, weight: .semibold, color: Theme.Color.muted)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(Theme.Color.surfaceSunken)
                .overlay(alignment: .bottom) { Hairline() }

                ForEach(Array(sets.enumerated()), id: \.offset) { idx, set in
                    if idx > 0 { Hairline() }
                    let interval = set.emomInterval(
                        fallbackMovement: "Movimiento",
                        fallbackIsErg: set.modality?.isErg ?? false
                    )
                    let item = idx < block.items.count ? block.items[idx] : nil
                    emomRotationRow(
                        label: minuteLabel(idx, of: sets.count),
                        interval: interval,
                        item: item
                    )
                }
            }
        }
    }

    private func emomRotationRow(label: String, interval: EmomInterval, item: WorkoutItem?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .heavy))
                .tracking(0.6)
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 66, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(interval.movement)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if let item { techniqueButton(item) }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                MonoText(text: interval.work, size: 15, weight: .semibold, color: Theme.Color.foreground)
                if let detail = interval.detail {
                    MonoText(text: detail, size: 12, weight: .medium, color: Theme.Color.accentText)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    // The minute a rotation slot owns: for a 2-movement EMOM the slots fall on the
    // odd / even minutes; for ≥3 movements they cycle Min 1 / 2 / 3 …
    private func minuteLabel(_ index: Int, of count: Int) -> String {
        if count == 2 { return index == 0 ? "Min impar" : "Min par" }
        return "Min \(index + 1)"
    }

    // Render ONE item by its modality. Strength → per-set table; run/ergo →
    // distance/duration × pace/zone card; functional/core/mobility → reps/dist ×
    // load/bodyweight card.
    @ViewBuilder
    private func itemView(_ item: WorkoutItem) -> some View {
        let modality = itemModality(item)
        if modality == .strength, item.prescription?.sets?.isEmpty == false {
            strengthItemTable(item)
        } else {
            modalityCard(item, modality: modality)
        }
    }

    // MARK: Strength — per-set table (set#, reps, load, tempo, rest)

    @ViewBuilder
    private func strengthItemTable(_ item: WorkoutItem) -> some View {
        let rows = item.prescription.flatMap { PrescriptionRenderer.setRows($0) } ?? []
        let uniform = item.prescription.map { PrescriptionRenderer.setsAreUniform($0) } ?? false
        let collapsed = uniform ? item.prescription.flatMap { PrescriptionRenderer.collapsedSetsLabel($0) } : nil
        let showTempo = rows.contains { $0.tempo != nil }
        let showRest = rows.contains { $0.rest != nil }

        CardSurface(padding: 0, leftAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                // Exercise title + optional technique video, padded inside the card.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.exerciseName)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    techniqueButton(item)
                }
                .padding(.horizontal, 14)
                .padding(.top, 13)
                .padding(.bottom, collapsed != nil ? 4 : 11)

                if let collapsed {
                    // Uniform sets collapse to a single mono line.
                    MonoText(text: collapsed, size: 14, weight: .medium, color: Theme.Color.foreground)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 13)
                } else {
                    setTableHeader(showTempo: showTempo, showRest: showRest)
                    ForEach(rows) { row in
                        if row.id > 0 { Hairline() }
                        setTableRow(row, showTempo: showTempo, showRest: showRest)
                    }
                }

                // Backend-resolved absolute load: the line's %RM × the athlete's
                // own 1RM → "52–64 kg". A divided footer beside the %; only present
                // when the lift is tracked AND the athlete has a 1RM (never faked).
                if let rl = item.resolvedLoad {
                    Hairline()
                    resolvedLoadLine(rl)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                }
            }
        }
    }

    @ViewBuilder
    private func resolvedLoadLine(_ rl: ResolvedLoad) -> some View {
        HStack(spacing: 8) {
            Text("SEGÚN TU 1RM")
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
            MonoText(text: rl.kgLabel, size: 14, weight: .semibold, color: Theme.Color.accentText)
            if rl.needsReview {
                Text("sin confirmar")
                    .scaledFont(10, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: 0)
        }
    }

    private func setTableHeader(showTempo: Bool, showRest: Bool) -> some View {
        HStack(spacing: 0) {
            setHeaderCell("SET", width: setColIndex)
            setHeaderCell("REPS", width: setColReps)
            setHeaderCell("CARGA", leading: false)
            if showTempo { setHeaderCell("TEMPO", width: setColTempo) }
            if showRest { setHeaderCell("DESC.", width: setColRest) }
        }
        .padding(.vertical, 8)
        .background(Theme.Color.surfaceSunken)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func setTableRow(_ row: PrescriptionRenderer.SetRow, showTempo: Bool, showRest: Bool) -> some View {
        HStack(spacing: 0) {
            setCell("\(row.index)", width: setColIndex, color: Theme.Color.faint)
            setCell(row.work, width: setColReps)
            setCell(row.load ?? "—", color: row.load != nil ? Theme.Color.accentText : Theme.Color.faint)
            if showTempo { setCell(row.tempo ?? "—", width: setColTempo, color: row.tempo != nil ? Theme.Color.muted : Theme.Color.faint) }
            if showRest { setCell(row.rest ?? "—", width: setColRest, color: row.rest != nil ? Theme.Color.muted : Theme.Color.faint) }
        }
        .padding(.vertical, 10)
    }

    private let setColIndex: CGFloat = 40
    private let setColReps: CGFloat = 56
    private let setColTempo: CGFloat = 64
    private let setColRest: CGFloat = 52

    @ViewBuilder
    private func setHeaderCell(_ text: String, width: CGFloat? = nil, leading: Bool = true) -> some View {
        let label = Text(text)
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 10)
        if let width {
            label.frame(width: width, alignment: .leading)
        } else {
            label.frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func setCell(_ text: String, width: CGFloat? = nil, color: Color = Theme.Color.foreground) -> some View {
        let cell = Text(text)
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 10)
        if let width {
            cell.frame(width: width, alignment: .leading)
        } else {
            cell.frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Modality card (run / ergo / functional / core / mobility / WOD line)

    @ViewBuilder
    private func modalityCard(_ item: WorkoutItem, modality: PrescriptionModality) -> some View {
        let line = item.prescription.map { PrescriptionRenderer.summaryLine($0) }
            ?? lineFromParams(item)   // legacy fallback to scalar params
        // The athlete's ABSOLUTE pace band: prefer an explicit prescribed pace,
        // else the backend-resolved band for a zone target (e.g. "@ 4:00–4:14/km"
        // beside the Z4 badge). Both are honest — nil when neither exists.
        let pace = line.pace ?? item.resolvedIntensity?.paceChip
        let needsReview = item.resolvedIntensity?.needsReview == true
        // Append the backend-resolved %RM→kg when present (a %RM on a non-strength
        // card, e.g. a barbell complex); strength items render it in the table.
        let detail = [line.detail, item.resolvedLoad?.kgLabel, needsReview ? "sin confirmar" : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.exerciseName)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if let z = line.zone { ZBadge(zone: z) }
                }
                if line.headline != nil || pace != nil {
                    HStack(alignment: .lastTextBaseline, spacing: 8) {
                        if let headline = line.headline {
                            Text(headline)
                                .font(.system(size: 24, weight: .heavy, design: .monospaced).monospacedDigit())
                                .foregroundStyle(Theme.Color.foreground)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        Spacer(minLength: 8)
                        if let pace {
                            MonoText(text: pace, size: 13, weight: .medium, color: Theme.Color.accentText)
                        }
                    }
                }
                if !detail.isEmpty {
                    MonoText(text: detail, size: 12, weight: .medium, color: Theme.Color.muted)
                }
                techniqueButton(item)
            }
        }
    }

    // A renderer Line built from the legacy scalar params, so an item with no
    // structured prescription still shows its dominant measure + pace/zone.
    private func lineFromParams(_ item: WorkoutItem) -> PrescriptionRenderer.Line {
        let p = item.paramsJson
        let isErg = ["rowing", "ski_erg", "bike_erg"].contains(item.exerciseCategory.lowercased())
        var headline: String? = nil
        if let m = p.distanceMeters, m > 0 {
            headline = PrescriptionRenderer.formatDistance(Double(m))
        } else if let km = p.distanceKm, km > 0 {
            headline = PrescriptionRenderer.formatDistance(km * 1000)
        } else if let d = p.durationSeconds, d > 0 {
            headline = PrescriptionRenderer.formatClock(d)
        } else if let r = p.reps, r > 0 {
            headline = "\(r) reps"
        } else if let cal = p.calories, cal > 0 {
            headline = "\(cal) cal"
        }
        var pace: String? = nil
        if let pk = p.paceSecPerKm, pk > 0 {
            pace = isErg ? "@ \(PrescriptionRenderer.formatPace(pk / 2)) /500m"
                         : "@ \(PrescriptionRenderer.formatPace(pk)) /km"
        }
        let zone = p.hrZone.flatMap { HRZone(rawValue: $0) }
        var detail: [String] = []
        if let kg = p.loadKg, kg > 0 { detail.append(formatKg(kg)) }
        if let rest = p.restSeconds, rest > 0 { detail.append("descanso \(PrescriptionRenderer.formatRest(rest))") }
        return PrescriptionRenderer.Line(
            headline: headline, pace: pace,
            detail: detail.isEmpty ? nil : detail.joined(separator: " · "), zone: zone
        )
    }

    @ViewBuilder
    private func techniqueButton(_ item: WorkoutItem) -> some View {
        if let url = item.exerciseVideoUrl, YouTubeLinkParser.videoId(from: url) != nil {
            Button {
                Haptics.light()
                segmentVideoUrl = url
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Ver técnica")
                        .scaledFont(12, weight: .semibold, relativeTo: .caption)
                }
                .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Ver vídeo de técnica de \(item.exerciseName)")
        }
    }

    // MARK: Modality / WOD classification

    private func itemModality(_ item: WorkoutItem) -> PrescriptionModality {
        if let m = item.prescription?.modality { return m }
        switch item.exerciseCategory.lowercased() {
        case "running":               return .run
        case "rowing":                return .row
        case "ski_erg":               return .ski
        case "bike_erg":              return .bike
        case "strength":              return .strength
        case "functional":            return .functional
        case "mobility":              return .mobility
        default:                      return .other
        }
    }

    /// The dominant modality for a block's header dot (first item's modality).
    private func blockModality(_ block: WorkoutBlock) -> String {
        guard let first = block.items.first else { return block.format }
        return itemModality(first).rawValue
    }

    /// The WOD format/cap chip for a conditioning block — derived from the first
    /// item's prescription scheme (amrap/emom/for_time), else from the block
    /// format. Nil for a plain strength/cardio block.
    private func wodHeader(for block: WorkoutBlock) -> String? {
        if let p = block.items.first?.prescription, p.scheme.isWOD {
            return PrescriptionRenderer.wodHeader(p)
        }
        switch block.format.lowercased() {
        case "amrap":    return "AMRAP"
        case "emom":     return "EMOM"
        case "for_time": return "FOR TIME"
        default:         return nil
        }
    }

    // MARK: - Footer
    //
    // Two honest completion paths:
    //  • `onStart` (primary) opens the live ActiveWorkout — timer + laps — whose
    //    PostWorkoutSummary records the result and marks the session completed.
    //  • `onManualLog` (secondary, "Ya lo hice") is for an athlete who trained
    //    WITHOUT the timer and wants to log it after the fact: it skips
    //    ActiveWorkout and goes straight to the same summary in manual mode, which
    //    saves the by-hand result with source='manual'.
    private var footer: some View {
        VStack(spacing: Theme.Spacing.s) {
            ExpertPrimaryButton(title: ctaTitle) {
                if hasRunSegment {
                    // #8 — running work: the full-screen pre-start sequence decides
                    // dónde + conexión, then fires `onStart` with the environment.
                    showRunPreStart = true
                } else if ergIsPrincipal {
                    // Erg work: connect screen FIRST — never both at once.
                    showErgPreStart = true
                } else {
                    onStart(nil)
                }
            }
            if !isBenchmark {
            Button(action: { Haptics.light(); onManualLog() }) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 13, weight: .semibold))
                    Text("Ya lo hice · registrar sin cronómetro")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                }
                .foregroundStyle(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Ya lo hice. Registrar sin cronómetro.")
            // Idea 1: entrenaste fuera con otra app → trae el resultado por foto.
            if showCaptureLog {
                Button(action: { Haptics.light(); onCaptureLog() }) {
                    HStack(spacing: 6) {
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Registrar con captura de otra app")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    }
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 36)
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Registrar con una captura de otra app.")
            }
            } // !isBenchmark — a benchmark has no manual paths: no measurement, no mark.
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.l)
        .background(
            LinearGradient(
                colors: [Theme.Color.background.opacity(0), Theme.Color.background],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        // The erg pre-start: connect → accept YOUR machine → the piece starts.
        .fullScreenCover(isPresented: $showErgPreStart) {
            ErgPreStartFlow(
                sessionTitle: plan.name,
                machineWord: ergMachineWord,
                isBenchmark: isBenchmark,
                onStart: {
                    showErgPreStart = false
                    onStart(nil)
                },
                onCancel: { showErgPreStart = false }
            )
        }
    }

    private var ctaTitle: String {
        isStrengthSession ? "▶ EMPEZAR FUERZA" : "▶ EMPEZAR"
    }

    // Kg formatter for the structured `lineFromParams` legacy-scalar fallback
    // (an item with no structured prescription that still carries a stored load).
    private func formatKg(_ kg: Double) -> String {
        if kg.truncatingRemainder(dividingBy: 1) == 0 { return "\(Int(kg)) kg" }
        return String(format: "%.1f kg", kg)
    }
}
