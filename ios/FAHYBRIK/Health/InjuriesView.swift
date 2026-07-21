import SwiftUI

// "Molestias" — the athlete self-reports injuries and follows their evolution with
// the coach (#16). Pushed from Perfil. Two sections: "Activas" (open episodes) and
// "Historial" (resolved). A nav "＋ Reportar" opens the report sheet; tapping an
// injury opens its evolution (status transition + note + the coach's timeline).
//
// Reuses the app's Theme atoms (CardSurface / Hairline / SectionLabel / Chip /
// SingleChipFlow / FlowLayout / ExpertPrimaryButton / Haptics) and invents no
// colors — severity/status hues map onto the existing semantic tokens.
struct InjuriesView: View {
    let bearer: String?
    /// Agnostic coach display name (from the athlete's plan payload); nil → the
    /// copy falls back to "tu coach". Never a hardcoded name.
    let coachName: String?

    @State private var injuries: [AthleteInjury] = []
    @State private var loading = true
    @State private var failed = false
    @State private var showReport = false

    private var active: [AthleteInjury] { injuries.filter { $0.isOpen } }
    private var resolved: [AthleteInjury] { injuries.filter { !$0.isOpen } }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Molestias")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.light()
                    showReport = true
                } label: {
                    Label("Reportar", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .disabled(bearer == nil)
                .accessibilityLabel("Reportar una molestia")
            }
        }
        .sheet(isPresented: $showReport) {
            ReportInjurySheet(bearer: bearer, coachName: coachName) { await load() }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView().tint(Theme.Color.accentText)
        } else if failed {
            errorState
        } else if injuries.isEmpty {
            emptyState
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    intro
                    if !active.isEmpty {
                        section(title: "Activas", injuries: active)
                    }
                    if !resolved.isEmpty {
                        section(title: "Historial", injuries: resolved)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
    }

    private var intro: some View {
        Text("Si algo te molesta, repórtalo. \(coachLabel.capitalizedFirst) ajusta tu carga para que entrenes sin arriesgar.")
            .scaledFont(13, relativeTo: .footnote)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var coachLabel: String { (coachName?.isEmpty == false) ? coachName! : "tu coach" }

    // MARK: - Section

    private func section(title: String, injuries rows: [AthleteInjury]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SectionLabel(text: title)
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, injury in
                        if idx > 0 { Hairline() }
                        NavigationLink {
                            InjuryDetailView(
                                injury: injury,
                                bearer: bearer,
                                coachName: coachName,
                                onChanged: { await load() }
                            )
                        } label: {
                            injuryRowContent(injury)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Row

    private func injuryRowContent(_ injury: AthleteInjury) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(injury.zone.label)
                    .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                injurySubtitle(injury)
            }
            Spacer(minLength: 8)
            injuryTrailing(injury)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(injuryAccessibility(injury))
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private func injurySubtitle(_ injury: AthleteInjury) -> some View {
        if injury.status == .resuelta {
            Text(historyResolvedText(injury))
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
        } else {
            HStack(spacing: 6) {
                Circle().fill(injury.status.uiColor).frame(width: 6, height: 6)
                Text("\(injury.status.label) · \(InjuryDateText.since(injury.onsetDate))")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private func injuryTrailing(_ injury: AthleteInjury) -> some View {
        if injury.status == .resuelta {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
                .accessibilityHidden(true)
        } else {
            InjurySeverityChip(severity: injury.severity)
        }
    }

    private func historyResolvedText(_ injury: AthleteInjury) -> String {
        if let d = InjuryDateText.shortDate(injury.resolvedDate) {
            return "\(injury.severity.label) · resuelta el \(d)"
        }
        return "\(injury.severity.label) · resuelta"
    }

    private func injuryAccessibility(_ injury: AthleteInjury) -> String {
        if injury.status == .resuelta {
            return "\(injury.zone.label), \(historyResolvedText(injury))"
        }
        return "\(injury.zone.label), \(injury.status.label), gravedad \(injury.severity.label), \(InjuryDateText.since(injury.onsetDate))"
    }

    // MARK: - Empty / error states

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(Theme.Color.ok)
            Text("Sin molestias registradas")
                .scaledFont(16, weight: .bold, relativeTo: .headline)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Cuando algo te moleste o te lesiones, repórtalo aquí. \(coachLabel.capitalizedFirst) lo tendrá en cuenta al preparar tu semana.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Haptics.light()
                showReport = true
            } label: {
                Text("Reportar molestia")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .disabled(bearer == nil)
            .padding(.top, 4)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    private var errorState: some View {
        VStack(spacing: 10) {
            Text("No pudimos cargar tus molestias")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Button("Reintentar") { Task { await load() } }
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.accentText)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    // MARK: - Load

    private func load() async {
        guard let bearer else { loading = false; failed = true; return }
        loading = true
        failed = false
        do {
            injuries = try await InjuryService.fetch(bearer: bearer)
        } catch {
            failed = true
        }
        loading = false
    }
}

// MARK: - Report sheet

// The athlete self-reports a new episode. Fields map 1:1 to the coach's register
// dialog's athlete-facing subset: Zona (required) · Gravedad (required, default
// Leve) · ¿Desde cuándo? (defaults to today) · una nota libre para el coach.
private struct ReportInjurySheet: View {
    let bearer: String?
    let coachName: String?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var zone: InjuryZone? = nil
    @State private var severity: InjurySeverity = .leve
    @State private var onsetDate: Date = Date()
    @State private var note: String = ""
    @State private var saving = false
    @State private var errorText: String? = nil

    private var canSave: Bool { zone != nil && !saving }
    private var coachLabel: String { (coachName?.isEmpty == false) ? coachName! : "tu coach" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    field(title: "Zona", required: true) {
                        SingleChipFlow(
                            options: InjuryZone.allCases,
                            label: { $0.label },
                            selection: $zone
                        )
                    }
                    field(title: "Gravedad", required: true) {
                        SeveritySegment(selection: $severity)
                    }
                    field(title: "¿Desde cuándo?", required: false) {
                        onsetRow
                    }
                    field(title: "Cuéntale a \(coachLabel)", required: false) {
                        NoteEditor(text: $note, placeholder: "Cómo empezó, qué notas, qué lo empeora… (opcional)")
                    }
                    if let errorText { InjuryErrorLine(text: errorText) }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Reportar molestia")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .safeAreaInset(edge: .bottom) {
                ExpertPrimaryButton(
                    title: saving ? "ENVIANDO…" : "ENVIAR",
                    height: 46,
                    enabled: canSave,
                    action: send
                )
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
            }
        }
    }

    private var onsetRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            CardSurface(padding: 0) {
                HStack(spacing: 12) {
                    Text("Fecha")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                    Spacer()
                    DatePicker("", selection: $onsetDate, in: ...Date(), displayedComponents: .date)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .tint(Theme.Color.accentText)
                        .accessibilityLabel("Fecha de inicio de la molestia")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            Text("Si no lo sabes exacto, déjalo en hoy.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
        }
    }

    @ViewBuilder
    private func field<Content: View>(
        title: String,
        required: Bool,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: 6) {
                SectionLabel(text: title)
                if required { RequiredBadge() }
            }
            content()
        }
    }

    private func send() {
        guard let bearer, let zone, !saving else { return }
        saving = true
        errorText = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = InjuryCreateBody(
            zone: zone,
            severity: severity,
            onsetDate: InjuryDateText.wireDate(onsetDate),
            note: trimmed.isEmpty ? nil : trimmed
        )
        Task { @MainActor in
            do {
                _ = try await InjuryService.report(bearer: bearer, body: body)
                Haptics.success()
                await onSaved()
                dismiss()
            } catch {
                Haptics.error()
                errorText = "No pudimos enviar tu reporte. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
    }
}

// MARK: - Evolution detail

// Tap an injury → its evolution. An OPEN episode shows the valid state-machine
// transitions + a note (PATCH /athlete/injuries/[id]); a RESOLVED one is read-only
// history. Both show the coach's estimated return (when set) and the full
// injury_updates timeline (coach + athlete entries).
struct InjuryDetailView: View {
    let bearer: String?
    let coachName: String?
    let onChanged: () async -> Void

    @State private var injury: AthleteInjury
    @State private var selectedTransition: InjuryStatus? = nil
    @State private var note: String = ""
    @State private var saving = false
    @State private var errorText: String? = nil

    init(
        injury: AthleteInjury,
        bearer: String?,
        coachName: String?,
        onChanged: @escaping () async -> Void
    ) {
        _injury = State(initialValue: injury)
        self.bearer = bearer
        self.coachName = coachName
        self.onChanged = onChanged
    }

    private var coachLabel: String { (coachName?.isEmpty == false) ? coachName! : "tu coach" }

    private var canSave: Bool {
        guard injury.isOpen, !saving else { return false }
        return selectedTransition != nil || !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    summaryCard
                    if injury.isOpen { updateCard }
                    timelineCard
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationTitle(injury.zone.label)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Summary

    private var summaryCard: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: 8) {
                    InjuryStatusChip(status: injury.status)
                    InjurySeverityChip(severity: injury.severity)
                    Spacer(minLength: 0)
                }
                Text(summaryTemporal)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if injury.isOpen, let ret = InjuryDateText.shortDate(injury.expectedReturn) {
                    HStack(spacing: 8) {
                        Image(systemName: "calendar.badge.clock")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Color.accentText)
                        Text("\(coachLabel.capitalizedFirst) estima tu vuelta el \(ret)")
                            .scaledFont(12, weight: .semibold, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.accentText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private var summaryTemporal: String {
        if injury.status == .resuelta {
            if let d = InjuryDateText.shortDate(injury.resolvedDate) { return "Resuelta el \(d)." }
            return "Resuelta."
        }
        return "Registrada \(InjuryDateText.since(injury.onsetDate))."
    }

    // MARK: Update (open only)

    private var updateCard: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("¿Cómo va?")
                    .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Actualiza el estado o deja una nota para \(coachLabel).")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                FlowLayout(spacing: 8) {
                    ForEach(injury.status.allowedTransitions) { st in
                        Chip(title: transitionLabel(to: st), selected: selectedTransition == st) {
                            selectedTransition = (selectedTransition == st) ? nil : st
                        }
                    }
                }
                NoteEditor(text: $note, placeholder: "Añade una nota (opcional)")
                if let errorText { InjuryErrorLine(text: errorText) }
                ExpertPrimaryButton(
                    title: saving ? "GUARDANDO…" : "GUARDAR",
                    height: 46,
                    enabled: canSave,
                    action: saveUpdate
                )
            }
        }
    }

    /// Athlete-facing verb for a status transition (state-machine target → copy).
    private func transitionLabel(to status: InjuryStatus) -> String {
        switch status {
        case .enRecuperacion: return "Voy mejor"
        case .resuelta:       return "Ya está bien"
        case .activa:         return "Ha vuelto a molestar"
        }
    }

    private func saveUpdate() {
        guard let bearer, canSave else { return }
        saving = true
        errorText = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = InjuryUpdateBody(status: selectedTransition, note: trimmed.isEmpty ? nil : trimmed)
        Task { @MainActor in
            do {
                let updated = try await InjuryService.update(bearer: bearer, id: injury.id, body: body)
                Haptics.success()
                injury = updated
                selectedTransition = nil
                note = ""
                saving = false
                await onChanged()
            } catch let APIError.http(status, _) {
                Haptics.error()
                // 409 = the state machine rejected the transition (e.g. someone
                // else already resolved it). Surface it honestly.
                errorText = status == 409
                    ? "Ese cambio de estado ya no es válido. Vuelve atrás para ver el estado actual."
                    : "No pudimos guardar el cambio. Inténtalo de nuevo."
                saving = false
            } catch {
                Haptics.error()
                errorText = "No pudimos guardar el cambio. Revisa tu conexión."
                saving = false
            }
        }
    }

    // MARK: Timeline

    private var timelineCard: some View {
        CardSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("Evolución")
                    .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                VStack(alignment: .leading, spacing: 0) {
                    // Synthetic first entry: the original report.
                    timelineEntry(
                        icon: "flag",
                        title: "Molestia reportada",
                        who: injury.registeredByCoach ? coachLabel.capitalizedFirst : "Tú",
                        when: InjuryDateText.shortDate(injury.onsetDate),
                        detail: injury.note,
                        tint: Theme.Color.muted
                    )
                    ForEach(Array(injury.updates.enumerated()), id: \.element.id) { _, u in
                        Hairline().padding(.vertical, Theme.Spacing.s)
                        timelineEntry(
                            icon: u.status != nil ? "arrow.triangle.turn.up.right.circle" : "text.bubble",
                            title: u.status.map { "Pasó a \($0.label)" } ?? "Nota",
                            who: u.recordedByCoach ? coachLabel.capitalizedFirst : "Tú",
                            when: InjuryDateText.shortDate(u.recordedAt),
                            detail: u.note,
                            tint: u.status?.uiColor ?? Theme.Color.muted
                        )
                    }
                }
            }
        }
    }

    private func timelineEntry(
        icon: String,
        title: String,
        who: String,
        when: String?,
        detail: String?,
        tint: Color
    ) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer(minLength: 4)
                    if let when {
                        Text(when)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                Text(who)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 1)
                }
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Shared small components

/// Severity pill (color + label — never color alone). leve → amber, moderada →
/// orange, severa → red, on the existing semantic tokens.
private struct InjurySeverityChip: View {
    let severity: InjurySeverity
    var body: some View {
        Text(severity.label)
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(severity.uiColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(severity.uiColor.opacity(0.15))
            .clipShape(Capsule())
            .accessibilityLabel("Gravedad \(severity.label)")
    }
}

/// Status pill with a leading dot. activa → red, en recuperación → amber,
/// resuelta → green.
private struct InjuryStatusChip: View {
    let status: InjuryStatus
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(status.uiColor).frame(width: 6, height: 6)
            Text(status.label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(status.uiColor)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(status.uiColor.opacity(0.15))
        .clipShape(Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Estado \(status.label)")
    }
}

/// Small "Obligatorio" marker next to a required field label.
private struct RequiredBadge: View {
    var body: some View {
        Text("Obligatorio")
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.Color.accentText.opacity(0.12))
            .clipShape(Capsule())
    }
}

/// Inline error line (icon + red text). Shared by the report sheet and the
/// evolution card.
private struct InjuryErrorLine: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.danger)
            Text(text)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// On-brand segmented control for Gravedad — a recessed track with the active
/// segment on the Fabrik-orange pill (accentOn text = the valid 4.57:1 pairing),
/// inactive segments muted. Mirrors the Perfil "Apariencia" control.
private struct SeveritySegment: View {
    @Binding var selection: InjurySeverity

    var body: some View {
        HStack(spacing: 4) {
            ForEach(InjurySeverity.allCases) { sev in
                segment(sev)
            }
        }
        .padding(4)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Gravedad")
    }

    private func segment(_ sev: InjurySeverity) -> some View {
        let active = selection == sev
        return Button {
            guard !active else { return }
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.18)) { selection = sev }
        } label: {
            Text(sev.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background { if active { Capsule().fill(Theme.Color.accent) } }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(sev.label)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
    }
}

/// Multi-line note field with a placeholder overlay and a character counter,
/// capped at `maxChars` (server enforces ≤2000). Surface fill + hairline border,
/// accent border while focused.
private struct NoteEditor: View {
    @Binding var text: String
    var placeholder: String
    var maxChars: Int = 2000

    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .scaledFont(14, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 14)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .scaledFont(14, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .tint(Theme.Color.accentText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 96)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .focused($focused)
                    .onChange(of: text) { _, new in
                        if new.count > maxChars { text = String(new.prefix(maxChars)) }
                    }
            }
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(focused ? Theme.Color.accentText.opacity(0.5) : Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            HStack {
                Spacer()
                Text("\(text.count)/\(maxChars)")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .accessibilityHidden(true)
            }
        }
    }
}

// MARK: - Semantic color mapping (UI concern — kept out of the Foundation model)

private extension InjurySeverity {
    /// leve → amber (warning), moderada → orange (accentText), severa → red (danger).
    var uiColor: Color {
        switch self {
        case .leve:     return Theme.Color.warning
        case .moderada: return Theme.Color.accentText
        case .severa:   return Theme.Color.danger
        }
    }
}

private extension InjuryStatus {
    /// activa → red (danger), en recuperación → amber (warning), resuelta → green (ok).
    var uiColor: Color {
        switch self {
        case .activa:         return Theme.Color.danger
        case .enRecuperacion: return Theme.Color.warning
        case .resuelta:       return Theme.Color.ok
        }
    }
}

private extension String {
    /// Capitalizes only the first character (keeps a real coach name intact,
    /// turns the "tu coach" fallback into "Tu coach" at a sentence start).
    var capitalizedFirst: String {
        isEmpty ? self : prefix(1).uppercased() + dropFirst()
    }
}
