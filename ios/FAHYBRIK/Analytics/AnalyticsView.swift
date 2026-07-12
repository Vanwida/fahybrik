import SwiftUI

// ANALÍTICAS tab — "todo tu entrenamiento, aquí dentro; y el único sitio que
// entiende tu HYROX". Five sections (Carrera first/biggest, then Ergo, Fuerza,
// HYROX, Recuperación), each faithful to docs/superpowers/plans/analiticas-tab.html.
//
// Two patterns run through every section:
//   • PERIOD SELECTOR — 7 días / Mes / Año / Custom, the `where` window applied to
//     every temporal aggregate AND its drill-down.
//   • DRILL-DOWN — every aggregate opens its REAL source sessions; a provenance
//     chip ("de N carreras") on each metric, tappable to the list.
//
// Honest states throughout: real / needs-more-logging / needs-wearable / field /
// gate — never a fabricated number. Cache-first via the shared AppDataStore (one
// in-memory + on-disk slice per section×period, SWR), so switching sections and
// periods you've already opened is instant.
struct AnalyticsView: View {
    var bearer: String? = nil

    @Environment(AppDataStore.self) private var store

    @State private var section: AnalyticsSectionKey = .running
    @State private var period: AnalyticsPeriod = .default
    /// Which ergometer the Ergo section is scoped to. Persisted so the last pick
    /// sticks across launches; only meaningful while `section == .ergo`.
    @AppStorage("fahybrik.analytics.erg") private var erg: ErgScope = .row
    @State private var drillTarget: DrillTarget? = nil
    @State private var showCustomPicker = false
    @State private var revealed = false

    /// Effective bearer: the one AppShell passed, else the persisted token.
    private var effectiveBearer: String? {
        bearer
    }

    /// The erg scope to send / cache by — only the Ergo section carries one.
    private var scopedErg: ErgScope? { section == .ergo ? erg : nil }

    private var slice: Slice<AnalyticsSection> { store.analyticsSection(section, period: period, erg: scopedErg) }
    private var currentSection: AnalyticsSection? { slice.value }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                sectionNav
                periodSelector
                if section == .ergo { ergSelector }
                cards
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable {
            // Pull-to-refresh: re-pull the active section×period fresh (force
            // bypasses the SWR staleness window).
            await store.refreshAnalyticsSection(section, period: period, erg: scopedErg, force: true)
        }
        .sheet(item: $drillTarget) { target in
            AnalyticsDrillDownSheet(target: target, bearer: effectiveBearer)
                .environment(store)
        }
        .sheet(isPresented: $showCustomPicker) {
            CustomPeriodSheet(initial: period) { newPeriod in
                period = newPeriod
            }
        }
        .onAppear {
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        // Revalidate whenever the bearer, section or period changes. Cache-first:
        // a warm slice renders instantly; this just refreshes it (throttled + SWR).
        .task(id: refreshKey) {
            store.activate(bearer: effectiveBearer)
            await store.refreshAnalyticsSection(section, period: period, erg: scopedErg)
        }
    }

    /// Composite identity that drives the revalidation task (erg only for Ergo).
    private var refreshKey: String {
        "\(effectiveBearer ?? "nil")|\(section.rawValue)|\(period.cacheSuffix)|\(scopedErg?.rawValue ?? "")"
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "Tu rendimiento", color: Theme.Color.accentText, size: 11)
                Text("Analíticas")
                    .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 8)
            ChatHeaderButton()
        }
        .padding(.top, 2)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Section nav (Carrera · Ergo · Fuerza · HYROX · Recup.)

    private var sectionNav: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(AnalyticsSectionKey.allCases) { key in
                    let active = key == section
                    Button {
                        guard !active else { return }
                        Haptics.light()
                        withAnimation(.easeInOut(duration: 0.16)) { section = key }
                    } label: {
                        Text(key.navLabel)
                            .font(.system(size: 12.5, weight: .heavy))
                            .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 7)
                            .background(active ? Theme.Color.accent : Theme.Color.surfaceElevated)
                            .overlay(
                                Capsule().stroke(active ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel(key.navLabel)
                    .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: - Period selector (7 días · Mes · Año · Custom)

    private var periodSelector: some View {
        HStack(spacing: 4) {
            ForEach(AnalyticsPeriodKey.allCases, id: \.self) { key in
                let active = key == period.key
                Button {
                    Haptics.light()
                    if key == .custom {
                        showCustomPicker = true
                    } else if !active {
                        withAnimation(.easeInOut(duration: 0.16)) {
                            period = AnalyticsPeriod(key: key)
                        }
                    }
                } label: {
                    Text(periodLabel(key))
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(active ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Periodo \(key.label)")
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    // MARK: - Ergo scope selector (Remo · SkiErg · BikeErg)
    //
    // Same segmented style as the period selector; scopes the Ergo section to one
    // machine so every metric names it (never a bare "ergo"). Switching refetches
    // that erg (cache is keyed per erg, so an already-seen one renders instantly).

    private var ergSelector: some View {
        HStack(spacing: 4) {
            ForEach(ErgScope.allCases) { scope in
                let active = scope == erg
                Button {
                    guard !active else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { erg = scope }
                } label: {
                    Text(scope.label)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(active ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Ergo \(scope.label)")
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    /// Custom shows its resolved range ("12 jun → 24 jun") once chosen.
    private func periodLabel(_ key: AnalyticsPeriodKey) -> String {
        if key == .custom, period.key == .custom, let label = currentSection?.period.label_es {
            return label
        }
        return key.label
    }

    // MARK: - Cards

    @ViewBuilder
    private var cards: some View {
        if let section = currentSection {
            VStack(alignment: .leading, spacing: 11) {
                ForEach(Array(section.cards.enumerated()), id: \.element.id) { idx, card in
                    AnalyticsCardView(card: card) { drill in
                        drillTarget = DrillTarget(ref: drill, period: period)
                    }
                    .staggerReveal(revealed, index: min(idx, 8))
                }
            }
        } else if slice.isRevalidating || !slice.hasLoaded {
            // Cold load (no cache yet) — quiet skeletons, not an empty state.
            VStack(spacing: 11) {
                ForEach(0..<3, id: \.self) { _ in AnalyticsSkeletonCard() }
            }
        } else {
            // Loaded but genuinely nothing — honest empty (rare; sections emit cards).
            CardSurface(padding: 15) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: section.navLabel)
                    Text("Aún no hay datos para este periodo.")
                        .scaledFont(12.5, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }
}

// MARK: - Skeleton card (cold-load placeholder)

private struct AnalyticsSkeletonCard: View {
    @State private var pulse = false
    var body: some View {
        CardSurface(padding: 15) {
            VStack(alignment: .leading, spacing: 12) {
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(width: 90, height: 30)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(maxWidth: .infinity)
                    .frame(height: 12)
            }
        }
        .opacity(pulse ? 0.55 : 1)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Custom period picker

private struct CustomPeriodSheet: View {
    let initial: AnalyticsPeriod
    let onConfirm: (AnalyticsPeriod) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var from: Date
    @State private var to: Date

    init(initial: AnalyticsPeriod, onConfirm: @escaping (AnalyticsPeriod) -> Void) {
        self.initial = initial
        self.onConfirm = onConfirm
        let cal = Calendar.current
        let now = Date()
        let defaultFrom = cal.date(byAdding: .day, value: -30, to: now) ?? now
        _from = State(initialValue: Self.parse(initial.from) ?? defaultFrom)
        _to = State(initialValue: Self.parse(initial.to) ?? now)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    DatePicker("Desde", selection: $from, in: ...to, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .tint(Theme.Color.accent)
                    Hairline()
                    DatePicker("Hasta", selection: $to, in: from...Date(), displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .tint(Theme.Color.accent)
                    Spacer()
                    ExpertPrimaryButton(title: "Aplicar") {
                        onConfirm(AnalyticsPeriod(key: .custom, from: Self.iso(from), to: Self.iso(to)))
                        dismiss()
                    }
                }
                .padding(Theme.Spacing.xl)
            }
            .navigationTitle("Rango personalizado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private static let isoFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static func iso(_ d: Date) -> String { isoFmt.string(from: d) }
    private static func parse(_ s: String?) -> Date? { s.flatMap { isoFmt.date(from: $0) } }
}
