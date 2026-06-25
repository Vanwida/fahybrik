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
// DATA CONSTRAINT (see BACKEND GAPS in the handoff return): this view receives a
// `WorkoutPlan` (the live-execution shape), which carries the per-exercise
// targets the live engine needs — distance / duration / pace / zone / reps /
// load / video — but NOT the strength-specific `sets` / `loadPct` / `rpe` /
// `restSeconds` (those live on `WorkoutItemParams`, dropped by
// `WorkoutPlan.from(detail:)`) nor true block grouping or the coach's name. So
// the strength table renders the columns it truthfully has and em-dashes the
// rest; the AM/PM cross-session switch is a follow-up (the brief is handed one
// session). Both are listed as gaps for the wiring change.
struct PreWorkoutBriefView: View {
    let plan: WorkoutPlan
    /// The RICH assignment detail — structured per-set prescription + true block
    /// grouping. When present the brief renders the structured body (per-set
    /// pyramids, modality-native targets, grouped blocks); when nil (ad-hoc /
    /// title-only session) it degrades to the flat `WorkoutPlan` rendering below.
    var detail: AssignmentDetail? = nil
    let connections: ConnectionStatus
    let onStart: () -> Void
    let onClose: () -> Void

    // Logging block — local-only until completion is wired to the sync path.
    @State private var rpe: Int? = nil
    @State private var sessionNote: String = ""
    // Per-exercise technique video opened in-app from a series row, when present.
    @State private var segmentVideoUrl: String? = nil

    struct ConnectionStatus {
        let garmin: Bool
        let healthkit: Bool
        let pm5: Bool
        /// Real device state. PM5 reflects whether a device is remembered;
        /// Garmin/HealthKit aren't resolvable to a simple bool here so they
        /// stay false (the grid only renders tiles for connected devices).
        static var current: ConnectionStatus {
            ConnectionStatus(
                garmin: false,
                healthkit: false,
                pm5: PM5ConnectionStore.shared.rememberedDeviceName != nil
            )
        }
    }

    // MARK: - Derived shape

    private var modality: String? {
        // The dominant segment kind tints the screen accent (run = orange, erg =
        // blue, strength = neutral). Mirrors Theme.Modality.color's vocabulary.
        guard let first = sortedSegments.first else { return nil }
        return first.kind.modality
    }

    private var modalityColor: Color { Theme.Modality.color(modality) }

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

    private var anyConnection: Bool {
        connections.garmin || connections.healthkit || connections.pm5
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

    private var modalityWord: String {
        switch modality {
        case "run":      return "Carrera"
        case "row":      return "Ergómetro"
        case "strength": return "Fuerza"
        default:         return "Sesión"
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
                    if let blocks = structuredBlocks, !blocks.isEmpty {
                        // Rich path: render the coach's structured prescription,
                        // grouped per block, branching by modality. This is the
                        // source-of-truth presentation when the detail is loaded.
                        structuredBody(blocks)
                    } else if isStrengthSession {
                        strengthTable
                    } else {
                        warmupCard
                        seriesBlocks
                    }
                    if anyConnection {
                        connectionsGrid
                    }
                    loggingBlock
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            footer
        }
        .background(Theme.Color.background.ignoresSafeArea())
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

    // MARK: - Warm-up card (with the technique video placeholder)

    private var warmupCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 9) {
                    Circle().fill(Theme.Color.faint).frame(width: 8, height: 8)
                    Text("Calentamiento")
                        .scaledFont(14, weight: .bold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer(minLength: 8)
                    LabelText(text: "Técnica")
                }
                // Honest placeholder: no technique video URL is shipped on the
                // session today (BACKEND GAP). Tapping a real per-exercise video
                // happens in the series rows below when a URL is present.
                TechniqueVideoPlaceholder(available: false)
            }
        }
    }

    // MARK: - Series blocks (run / erg / mixed)

    private var seriesBlocks: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: 9) {
                Circle().fill(modalityColor).frame(width: 8, height: 8)
                Text("Principal · series")
                    .scaledFont(14, weight: .bold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                if let z = headlineZone {
                    ZBadge(zone: z)
                }
            }
            ForEach(sortedSegments) { seg in
                seriesCard(seg)
            }
        }
    }

    // One prescribed movement as a card with an orange left edge: the headline
    // target reads big in mono, secondary targets (pace, zone, load, rest) sit
    // beneath, and a per-exercise technique video opens in-app when present.
    private func seriesCard(_ seg: WorkoutSegment) -> some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(seg.title)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if let z = seg.targetZone {
                        ZBadge(zone: z)
                    }
                }
                if let headline = primaryTarget(seg) {
                    HStack(alignment: .lastTextBaseline, spacing: 8) {
                        Text(headline.value)
                            .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        if !headline.unit.isEmpty {
                            Text(headline.unit)
                                .scaledFont(13, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.muted)
                        }
                        Spacer(minLength: 8)
                        if let pace = paceTarget(seg) {
                            MonoText(text: pace, size: 13, weight: .medium, color: Theme.Color.accentText)
                        }
                    }
                }
                if let secondary = secondaryTargets(seg) {
                    MonoText(text: secondary, size: 12, weight: .medium, color: Theme.Color.muted)
                }
                if let url = seg.videoUrl, YouTubeLinkParser.videoId(from: url) != nil {
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
                    .padding(.top, 2)
                    .accessibilityLabel("Ver vídeo de técnica de \(seg.title)")
                }
            }
        }
    }

    // The dominant prescribed measure for the headline mono readout. Honest
    // priority: distance → duration → reps. Never fabricates an absent field.
    private func primaryTarget(_ seg: WorkoutSegment) -> (value: String, unit: String)? {
        if let m = seg.targetDistanceMeters, m > 0 {
            if m >= 1000 {
                let km = m / 1000
                let str = km.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(km))" : String(format: "%.1f", km)
                return (str, "km")
            }
            return ("\(Int(m))", "m")
        }
        if let d = seg.targetDurationSeconds, d > 0 {
            return (TimeMinSecRow.format(d), "")
        }
        if let r = seg.targetReps, r > 0 {
            return ("\(r)", "reps")
        }
        return nil
    }

    // Right-aligned pace target on the headline row (run → /km, erg → /500m).
    private func paceTarget(_ seg: WorkoutSegment) -> String? {
        guard let pace = seg.targetPaceSecondsPerKm, pace > 0 else { return nil }
        if seg.kind == .rowOrSki {
            return "@ \(formatPace(pace / 2)) /500m"
        }
        return "@ \(formatPace(pace)) /km"
    }

    // Secondary line: load + power when present. Rest interval is NOT carried on
    // WorkoutSegment (BACKEND GAP), so it's never shown rather than guessed.
    private func secondaryTargets(_ seg: WorkoutSegment) -> String? {
        var parts: [String] = []
        if let kg = seg.loadKg, kg > 0 {
            parts.append(formatKg(kg))
        }
        if let w = seg.targetPowerWatts, w > 0 {
            parts.append("\(w) W")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Strength table (Ejercicio / S×R / Carga / RPE)

    private var strengthTable: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: 9) {
                Circle().fill(modalityColor).frame(width: 8, height: 8)
                Text("Fuerza")
                    .scaledFont(14, weight: .bold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
            }
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    strengthHeaderRow
                    ForEach(Array(sortedSegments.enumerated()), id: \.element.id) { idx, seg in
                        if idx > 0 { Hairline() }
                        strengthRow(seg)
                    }
                }
            }
            // The live-execution WorkoutSegment carries reps + load but not the
            // coach's sets / %1RM / RPE / rest (BACKEND GAP). Surface that the
            // full prescription lives in Plan rather than silently dropping it.
            Text("Series, %1RM, RPE y descansos completos en tu Plan.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
        }
    }

    // Fixed widths for the numeric columns so the header and every row align;
    // "Ejercicio" takes the remaining space. (layoutPriority can't replicate
    // flexbox ratios, so explicit widths are the robust choice.)
    private let colSR: CGFloat = 56
    private let colLoad: CGFloat = 88
    private let colRPE: CGFloat = 42

    private var strengthHeaderRow: some View {
        HStack(spacing: 0) {
            headerCell("Ejercicio", leading: true)
            headerCell("S×R", width: colSR)
            headerCell("Carga", width: colLoad)
            headerCell("RPE", width: colRPE)
        }
        .padding(.vertical, 9)
        .background(Theme.Color.surfaceSunken)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func strengthRow(_ seg: WorkoutSegment) -> some View {
        HStack(spacing: 0) {
            Text(seg.title)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
            // S×R — only reps are known on the segment; sets are a gap → "× R".
            monoCell(setsRepsString(seg), width: colSR)
            // Carga — real kg when present; %1RM is a gap.
            monoCell(loadString(seg), width: colLoad, color: seg.loadKg != nil ? Theme.Color.accentText : Theme.Color.faint)
            // RPE — not on the segment → honest em-dash.
            monoCell("—", width: colRPE, color: Theme.Color.faint)
        }
        .padding(.vertical, 11)
    }

    private func setsRepsString(_ seg: WorkoutSegment) -> String {
        if let r = seg.targetReps, r > 0 { return "× \(r)" }
        return "—"
    }

    private func loadString(_ seg: WorkoutSegment) -> String {
        if let kg = seg.loadKg, kg > 0 { return formatKg(kg) }
        return "—"
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
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(blocks.sorted { $0.blockPosition < $1.blockPosition }) { block in
                blockSection(block)
            }
        }
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
            ForEach(block.items) { item in
                itemView(item)
            }
        }
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
            }
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
                if let headline = line.headline {
                    HStack(alignment: .lastTextBaseline, spacing: 8) {
                        Text(headline)
                            .font(.system(size: 24, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 8)
                        if let pace = line.pace {
                            MonoText(text: pace, size: 13, weight: .medium, color: Theme.Color.accentText)
                        }
                    }
                }
                if let det = line.detail {
                    MonoText(text: det, size: 12, weight: .medium, color: Theme.Color.muted)
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

    // MARK: - Connections grid

    private var connectionsGrid: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Dispositivos")
                let cols = [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ]
                LazyVGrid(columns: cols, spacing: 8) {
                    connTile(label: "Garmin", connected: connections.garmin)
                    connTile(label: "HR Strap", connected: connections.healthkit)
                    connTile(label: "PM5", connected: connections.pm5)
                }
            }
        }
    }

    private func connTile(label: String, connected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            Text(connected ? "Listo" : "Off")
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(connected ? Theme.Color.ok : Theme.Color.faint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Logging block (free-text + RPE + import note)

    private var loggingBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Registrar resultado")
                .scaledFont(13, weight: .bold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)

            // Free-text "Cómo te fue…". A native multiline field over the card
            // surface; the placeholder degrades to muted helper text.
            CardSurface(padding: 13) {
                ZStack(alignment: .topLeading) {
                    if sessionNote.isEmpty {
                        Text("Cómo te fue, sensaciones, ritmos…")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.faint)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $sessionNote)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 64)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .tint(Theme.Color.accent)
                }
            }

            // RPE selector 6–10 (reused foundation component).
            HStack(spacing: Theme.Spacing.m) {
                LabelText(text: "RPE")
                RPESelector(value: $rpe)
            }

            HStack(spacing: 8) {
                Image(systemName: "applewatch")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                Text("o importa automáticamente desde Garmin / Polar / Strava")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Footer
    //
    // `onStart` is the ONLY launch the brief is wired to: it opens the live
    // ActiveWorkout, whose PostWorkoutSummary records RPE + marks the session
    // completed. So that IS the completion path for every session shape — the
    // CTA wording is honest about what the tap does.
    //
    // The handoff's quick "Marcar completada ✓ + RPE" (skip the live timer for a
    // box strength session, submit just note + RPE) needs a second callback that
    // the container doesn't expose yet. Rather than fake a button that secretly
    // launches the timer, we label by what actually happens and list the
    // quick-complete entry point as a wiring gap (see handoff return).
    private var footer: some View {
        VStack(spacing: Theme.Spacing.s) {
            ExpertPrimaryButton(title: ctaTitle, action: onStart)
            Text(isStrengthSession
                 ? "Cronometra cada serie; al terminar registras RPE y sensaciones."
                 : "Cronometra la sesión y marca vueltas; al terminar registras el resultado.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
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
    }

    private var ctaTitle: String {
        isStrengthSession ? "▶ EMPEZAR FUERZA" : "▶ EMPEZAR"
    }

    // MARK: - Table cell helpers

    @ViewBuilder
    private func headerCell(_ text: String, width: CGFloat? = nil, leading: Bool = false) -> some View {
        let label = Text(text)
            .scaledFont(11, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, leading ? 12 : 8)
        if let width {
            label.frame(width: width, alignment: .leading)
        } else {
            label.frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func monoCell(_ text: String, width: CGFloat, color: Color = Theme.Color.foreground) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(width: width, alignment: .leading)
            .padding(.horizontal, 8)
    }

    // MARK: - Local formatters (mirror WorkoutItemParamsFormatter)

    private func formatKg(_ kg: Double) -> String {
        if kg.truncatingRemainder(dividingBy: 1) == 0 { return "\(Int(kg)) kg" }
        return String(format: "%.1f kg", kg)
    }

    private func formatPace(_ secondsPerUnit: Int) -> String {
        let m = secondsPerUnit / 60
        let s = secondsPerUnit % 60
        return String(format: "%d:%02d", m, s)
    }
}
