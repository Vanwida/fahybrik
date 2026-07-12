import SwiftUI

// #27 — HISTORIAL: a monthly calendar of the athlete's done work → tap a day / row →
// the EXISTING ExecutedWorkoutView (this screen builds no detail of its own). Month
// navigation is capped at the current month (no future); back is free. The grid math is
// pure (HistoryModels); this file is presentation + the fetch per month.
struct HistoryView: View {
    let bearer: String?
    var onClose: () -> Void = {}

    @State private var viewed: YearMonth = .current()
    @State private var month: AthleteHistoryMonth? = nil
    @State private var loading = true
    @State private var executedTarget: WorkoutLaunch? = nil

    // Derived (pure)
    private var grid: [CalendarGridCell] { HistoryCalendar.grid(viewed) }
    private var states: [Int: CalendarDayState] { HistoryCalendar.dayStates(month?.days ?? [], in: viewed) }
    private var todayDay: Int? { HistoryCalendar.todayDay(in: viewed) }
    private var rows: [HistoryListRow] { month.map(HistoryListRow.rows) ?? [] }
    private var canForward: Bool { HistoryCalendar.canGoForward(from: viewed) }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    monthNav
                    calendar
                    legend
                    Divider().overlay(Theme.Color.hairline)
                    monthList
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task(id: viewed) {
            loading = true
            month = await HistoryService.fetch(month: viewed, bearer: bearer)
            loading = false
        }
        .fullScreenCover(item: $executedTarget) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { executedTarget = nil },
                // Stale id (404) → refetch this month so the day reflects its current id.
                onStale: { Task { month = await HistoryService.fetch(month: viewed, bearer: bearer) } }
            )
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack {
            Button(action: { Haptics.light(); onClose() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
            Spacer()
            Text("Historial")
                .scaledFont(15, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Color.clear.frame(width: 40, height: 40)   // balance the X
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Month navigation (‹ julio 2026 ›)

    private var monthNav: some View {
        HStack {
            navButton(system: "chevron.left", enabled: true) {
                withAnimation(.easeInOut(duration: 0.15)) { viewed = viewed.previous() }
            }
            .accessibilityLabel("Mes anterior")
            Spacer()
            Text(viewed.displayLabel.capitalizedFirst)
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .contentTransition(.numericText())
            Spacer()
            navButton(system: "chevron.right", enabled: canForward) {
                guard canForward else { return }
                withAnimation(.easeInOut(duration: 0.15)) { viewed = viewed.next() }
            }
            .accessibilityLabel("Mes siguiente")
        }
    }

    private func navButton(system: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: { if enabled { Haptics.light(); action() } }) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(enabled ? Theme.Color.foreground : Theme.Color.faint.opacity(0.4))
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    // MARK: - Calendar grid

    private var calendar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(Array(HistoryCalendar.weekdayHeadersEs.enumerated()), id: \.offset) { _, d in
                    Text(d)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(Theme.Color.faint)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(Array(grid.enumerated()), id: \.offset) { _, cell in
                    dayCell(cell)
                }
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ cell: CalendarGridCell) -> some View {
        switch cell {
        case .blank:
            Color.clear.frame(height: 40)
        case .day(let n):
            let state = states[n] ?? .empty
            let isToday = todayDay == n
            Button(action: { openDay(n) }) {
                VStack(spacing: 3) {
                    Text("\(n)")
                        .font(.system(size: 13, weight: isToday ? .heavy : .medium).monospacedDigit())
                        .foregroundStyle(isToday ? Theme.Color.accentText : Theme.Color.foreground)
                    indicator(for: state)
                        .frame(height: 12)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(isToday ? Theme.Color.accentText.opacity(0.7) : .clear, lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!isTappable(state))
            .accessibilityLabel(cellAccessibility(n, state, isToday))
        }
    }

    @ViewBuilder
    private func indicator(for state: CalendarDayState) -> some View {
        switch state {
        case .empty:
            Color.clear.frame(width: 7, height: 7)
        case .rest:
            // A short muted dash = a scheduled rest day.
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(Theme.Color.faint)
                .frame(width: 10, height: 2)
        case .trained(let withPartner):
            ZStack {
                if withPartner {
                    Circle().stroke(Theme.Color.partner, lineWidth: 1.5).frame(width: 12, height: 12)
                }
                Circle().fill(Theme.Color.accent).frame(width: 7, height: 7)
            }
        }
    }

    private func isTappable(_ state: CalendarDayState) -> Bool {
        if case .trained = state { return true }
        return false
    }

    // Open the FIRST session of the tapped day (a two-a-day still lists both below).
    private func openDay(_ n: Int) {
        let iso = String(format: "%04d-%02d-%02d", viewed.year, viewed.month, n)
        guard let day = month?.days.first(where: { $0.date == iso }),
              let session = day.sessions.first else { return }
        Haptics.light()
        executedTarget = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
    }

    // MARK: - Legend

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem(label: "hecho") {
                Circle().fill(Theme.Color.accent).frame(width: 7, height: 7)
            }
            legendItem(label: "en pareja") {
                ZStack {
                    Circle().stroke(Theme.Color.partner, lineWidth: 1.5).frame(width: 12, height: 12)
                    Circle().fill(Theme.Color.accent).frame(width: 6, height: 6)
                }
            }
            legendItem(label: "descanso") {
                RoundedRectangle(cornerRadius: 1).fill(Theme.Color.faint).frame(width: 10, height: 2)
            }
            Spacer(minLength: 0)
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(Theme.Color.muted)
    }

    private func legendItem<Mark: View>(label: String, @ViewBuilder mark: () -> Mark) -> some View {
        HStack(spacing: 5) {
            mark().frame(width: 12)
            Text(label)
        }
    }

    // MARK: - Month list (newest-first)

    @ViewBuilder
    private var monthList: some View {
        if loading && month == nil {
            HStack { Spacer(); ProgressView().tint(Theme.Color.accent); Spacer() }
                .padding(.top, Theme.Spacing.l)
        } else if rows.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "calendar")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                Text("Sin entrenos este mes")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, Theme.Spacing.l)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Divider().overlay(Theme.Color.hairline) }
                    listRow(row)
                }
            }
        }
    }

    private func listRow(_ row: HistoryListRow) -> some View {
        let s = row.session
        return Button(action: {
            Haptics.light()
            executedTarget = WorkoutLaunch(assignmentId: s.assignmentId, title: s.title)
        }) {
            HStack(alignment: .center, spacing: 12) {
                // Date stamp — DOW + day number.
                VStack(spacing: 1) {
                    Text(HistoryCalendar.dowAbbrev(row.date))
                        .font(.system(size: 8, weight: .heavy)).tracking(0.4).textCase(.uppercase)
                        .foregroundStyle(Theme.Color.faint)
                    Text(dayNumber(row.date))
                        .font(.system(size: 16, weight: .heavy).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                }
                .frame(width: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(s.title)
                        .scaledFont(13.5, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    subChips(s)
                }
                Spacer(minLength: 8)

                if let time = s.headlineTime {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(time)
                            .font(.system(size: 17, weight: .heavy).italic().monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                        if let label = s.headlineLabel {
                            Text(label)
                                .font(.system(size: 8, weight: .heavy)).tracking(0.3).textCase(.uppercase)
                                .foregroundStyle(Theme.Color.faint)
                        }
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func subChips(_ s: AthleteHistorySession) -> some View {
        HStack(spacing: 6) {
            if let rpe = s.rpeLabel {
                chip(text: rpe, tint: Theme.Color.muted)
            }
            if s.withPartner {
                chip(icon: "person.2.fill", text: "en pareja", tint: Theme.Color.partner)
            }
            if s.hasRoute {
                chip(icon: "map", text: "ruta", tint: Theme.Color.muted)
            }
        }
    }

    private func chip(icon: String? = nil, text: String, tint: Color) -> some View {
        HStack(spacing: 3) {
            if let icon {
                Image(systemName: icon).font(.system(size: 8, weight: .bold))
            }
            Text(text).font(.system(size: 10, weight: .semibold))
        }
        .foregroundStyle(tint)
    }

    private func dayNumber(_ iso: String) -> String {
        HistoryCalendar.parseISO(iso).map { String($0.day) } ?? "—"
    }

    private func cellAccessibility(_ n: Int, _ state: CalendarDayState, _ isToday: Bool) -> String {
        var s = "\(n)"
        if isToday { s += ", hoy" }
        switch state {
        case .empty: break
        case .rest: s += ", descanso"
        case .trained(let p): s += p ? ", entreno hecho en pareja" : ", entreno hecho"
        }
        return s
    }
}

private extension String {
    /// "julio 2026" → "Julio 2026" (capitalize only the first letter, keep the rest).
    var capitalizedFirst: String {
        guard let first = first else { return self }
        return first.uppercased() + dropFirst()
    }
}
