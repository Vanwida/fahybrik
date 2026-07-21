import SwiftUI

// "Mis días de entreno" — the athlete edits their weekly day→role map AFTER
// onboarding: which days are for the plan ("Entreno"), which they already have
// something on ("Otra actividad"), and which are free ("Descanso"). Powered by
// GET / PATCH /api/athlete/availability.
//
// This is the reparto driver (#47): only "Entreno" days receive sessions. The
// number of "Entreno" days IS the athlete's training days per week, shown live.
//
// HONEST SEMANTICS (founder decision): a saved change applies to the plan FROM THE
// NEXT WEEK ON. The current, already-scheduled week is NOT re-laid-out — rewriting
// it would clobber the plan and anything the athlete already logged. We say this
// plainly and never pretend the current week reshuffles. On a successful save we
// call the shared plan refresh (`AppDataStore.planMutated`) so every tab re-pulls
// the plan and future-week materialization reflects the new days.
//
// The time window (available_from/to, session length) is onboarding-only with no
// athlete edit endpoint — and the availability GET doesn't return it — so it is
// intentionally NOT shown here. Only the day-role map is editable.
struct TrainingDaysView: View {
    let bearer: String?

    @Environment(AppDataStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    /// Working copy the athlete edits; `baseline` is the last-saved state so we
    /// only PATCH when something actually changed (and never on an unchanged tap).
    @State private var working = AvailabilityMap.restAll
    @State private var baseline: AvailabilityMap? = nil

    @State private var loading = true
    @State private var loadFailed = false
    @State private var saving = false
    @State private var saveFailed = false

    // Lunes … Domingo — index 0 = Monday (matches AvailabilityMap.days + backend).
    private static let dayNames = [
        "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
    ]

    /// A save is worth sending only when we have a session, the map changed, and
    /// we're not mid-save.
    private var canSave: Bool {
        guard bearer != nil, let baseline, !saving else { return false }
        return working != baseline
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Mis días de entreno")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if saving {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Button("Guardar") { save() }
                        .foregroundStyle(canSave ? Theme.Color.accentText : Theme.Color.faint)
                        .disabled(!canSave)
                        .accessibilityLabel("Guardar días de entreno")
                }
            }
        }
        .task { await load() }
    }

    // MARK: - Content states

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView().tint(Theme.Color.accentText)
        } else if loadFailed {
            errorState
        } else {
            editor
        }
    }

    private var editor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                intro
                countLine
                daysCard
                nextWeekNote
                if saveFailed { saveErrorLine }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    // MARK: - Intro + live count

    private var intro: some View {
        Text("Marca qué días son para tu plan. Solo los días de “Entreno” reciben sesiones; “Otra actividad” es algo que ya tienes tú y “Descanso” es día libre.")
            .scaledFont(13, relativeTo: .footnote)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// "Ahora entrenas N días a la semana." — N is live from the working map, so it
    /// updates as the athlete toggles days, before saving.
    private var countLine: some View {
        let n = working.programDayCount
        let amount: String
        switch n {
        case 0:  amount = "ningún día"
        case 1:  amount = "1 día"
        default: amount = "\(n) días"
        }
        return (
            Text("Ahora entrenas ").foregroundStyle(Theme.Color.muted)
            + Text(amount).font(.subheadline.weight(.bold)).foregroundStyle(Theme.Color.accentText)
            + Text(" a la semana.").foregroundStyle(Theme.Color.muted)
        )
        .font(.subheadline)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityLabel("Ahora entrenas \(amount) a la semana.")
    }

    // MARK: - The 7 day rows

    private var daysCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    if i > 0 { Hairline() }
                    DayRoleRow(
                        dayName: Self.dayNames[i],
                        isProgram: working.days[i] == .program,
                        role: roleBinding(for: i)
                    )
                }
            }
        }
    }

    private func roleBinding(for i: Int) -> Binding<DayPlanStatus> {
        Binding(
            get: { working.days.indices.contains(i) ? working.days[i] : .rest },
            set: { newValue in
                guard working.days.indices.contains(i) else { return }
                working.days[i] = newValue
            }
        )
    }

    // MARK: - Honest next-week note

    private var nextWeekNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
            Text("Tus cambios se aplican a tu plan a partir de la próxima semana. La semana en curso no se reorganiza.")
                .scaledFont(12, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var saveErrorLine: some View {
        Text("No pudimos guardar tus días. Revisa tu conexión e inténtalo de nuevo.")
            .scaledFont(12, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.danger)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var errorState: some View {
        VStack(spacing: 10) {
            Text("No pudimos cargar tus días")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
            Button("Reintentar") { Task { await load() } }
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.accentText)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    // MARK: - Load / save

    private func load() async {
        guard let bearer else { loading = false; loadFailed = true; return }
        loading = true
        loadFailed = false
        do {
            let resp = try await AvailabilityService.fetch(bearer: bearer)
            working = resp.availability
            baseline = resp.availability
        } catch {
            loadFailed = true
        }
        loading = false
    }

    private func save() {
        guard let bearer, canSave else { return }
        saving = true
        saveFailed = false
        Task {
            do {
                let resp = try await AvailabilityService.save(working, bearer: bearer)
                baseline = resp.availability
                working = resp.availability
                // Reflect the change: force-refetch the plan-derived slices so every
                // tab re-pulls and future-week materialization honors the new days.
                // (The current week is NOT re-laid-out by design — see header.)
                await store.planMutated()
                Haptics.success()
                dismiss()
            } catch {
                saveFailed = true
                Haptics.error()
                saving = false
            }
        }
    }
}

// MARK: - Per-day row (day name + a 3-role segmented control)

private struct DayRoleRow: View {
    let dayName: String
    let isProgram: Bool
    @Binding var role: DayPlanStatus

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: 8) {
                Text(dayName)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                // A small orange dot flags a plan day at a glance.
                if isProgram {
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 6, height: 6)
                        .accessibilityHidden(true)
                }
                Spacer(minLength: 0)
            }
            DayRoleSegmented(role: $role)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(dayName)
    }
}

// MARK: - 3-role segmented control (Entreno / Otra actividad / Descanso)
//
// A sunken track holding three equal-width segments; the selected one fills Fabrik
// orange with the brown-on-orange glyph. Single-select, bound to a DayPlanStatus.
// Reuses the Theme atoms + press feedback — no new colors.
private struct DayRoleSegmented: View {
    @Binding var role: DayPlanStatus

    var body: some View {
        HStack(spacing: 4) {
            ForEach(DayPlanStatus.allCases, id: \.self) { option in
                segment(option)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    private func segment(_ option: DayPlanStatus) -> some View {
        let selected = role == option
        return Button {
            guard role != option else { return }
            Haptics.light()
            role = option
        } label: {
            Text(Self.label(for: option))
                .scaledFont(12, weight: selected ? .semibold : .medium, relativeTo: .caption)
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .fill(selected ? Theme.Color.accent : Color.clear)
                )
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(Self.label(for: option))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    /// Athlete-facing labels for the three roles. Single source so the segmented
    /// control and any future surface can't drift.
    static func label(for role: DayPlanStatus) -> String {
        switch role {
        case .program:       return "Entreno"
        case .otherActivity: return "Otra actividad"
        case .rest:          return "Descanso"
        }
    }
}
