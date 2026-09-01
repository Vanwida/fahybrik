import SwiftUI

// #27 — HISTORIAL: a monthly calendar of the athlete's done work → tap a day / row →
// the EXISTING ExecutedWorkoutView (this screen builds no detail of its own). Month
// navigation is capped at the current month (no future); back is free. The grid math is
// pure (HistoryModels); this file is presentation + the fetch per month.
//
// ARQUETIPO **Lista** que degrada a **Vacío** (contrato §6.2). ESTRATEGIA `llena`,
// montada sobre las TRES posiciones de `CenteredScreen`:
//
//   head     la barra con la ✕ — clavada, nunca se va con el scroll.
//   lead     el mes, el calendario y la leyenda: el instrumento de la pantalla, que
//            se queda arriba (si bailara, el atleta reencuadraría al cambiar de mes)
//            pero scrollea con el contenido a tamaños de texto accesibles.
//   content  la lista del mes, que CENTRA en el alto que le deja el calendario
//            cuando está vacía y crece/scrollea cuando el mes está lleno.
//
// Antes era `VStack { topBar; ScrollView { … } }` y un mes sin entrenos dejaba ~380 pt
// muertos debajo del calendario con la frase «Sin entrenos este mes» pegada arriba y
// sin ninguna salida — el §6.1 y el §5 incumplidos en el mismo sitio.
struct HistoryView: View {
    let bearer: String?
    var onClose: () -> Void = {}
    /// Preguntarle al coach por un entreno YA hecho. El historial es el sitio
    /// natural para eso —es donde el atleta mira lo que pasó— y una pulsación
    /// larga no ocupa alto. Lo resuelve quien presenta esta pantalla: cierra el
    /// historial y abre el chat, porque dos presentaciones no se levantan a la
    /// vez. Nil cuando el atleta no tiene coach: entonces la fila no existe.
    var onPreguntar: ((AthleteHistorySession, String) -> Void)? = nil

    @State private var viewed: YearMonth = .current()
    @State private var month: AthleteHistoryMonth? = nil
    @State private var loading = true
    /// No pudimos preguntar por este mes. Distinto de «este mes no tiene entrenos»:
    /// uno lleva reintento y el otro no (§5).
    @State private var failed = false
    @State private var executedTarget: WorkoutLaunch? = nil
    /// The day (YYYY-MM-DD) the athlete tapped when it held SEVERAL sessions —
    /// the list below narrows to it so they choose, instead of the calendar
    /// picking one for them. Nil = showing the whole month.
    @State private var selectedDay: String? = nil

    // Derived (pure)
    private var grid: [CalendarGridCell] { HistoryCalendar.grid(viewed) }
    private var states: [Int: CalendarDayState] { HistoryCalendar.dayStates(month?.days ?? [], in: viewed) }
    private var todayDay: Int? { HistoryCalendar.todayDay(in: viewed) }
    private var allRows: [HistoryListRow] { month.map(HistoryListRow.rows) ?? [] }
    /// What the list actually renders: the focused day alone, or the whole month.
    private var rows: [HistoryListRow] {
        guard let selectedDay else { return allRows }
        return allRows.filter { $0.date == selectedDay }
    }
    private var canForward: Bool { HistoryCalendar.canGoForward(from: viewed) }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        CenteredScreen {
            topBar
        } lead: {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                monthNav
                calendar
                legend
                Divider().overlay(Theme.Color.hairline)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.l)
        } content: {
            monthList
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task(id: viewed) {
            // A focus belongs to the month it was set in — carrying it across
            // navigation would filter the new month down to nothing.
            selectedDay = nil
            await load()
        }
        .fullScreenCover(item: $executedTarget) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { executedTarget = nil },
                // Stale id (404) → refetch this month so the day reflects its current id.
                onStale: { Task { await load() } }
            )
        }
    }

    // MARK: - Load

    @MainActor
    private func load() async {
        loading = true
        do {
            month = try await HistoryService.fetch(month: viewed, bearer: bearer)
            failed = false
        } catch {
            // Sin respuesta el mes se queda SIN pintar (nil), no vacío: un mes que
            // no pudimos leer no es un mes sin entrenos, y decir lo segundo es la
            // app mintiendo sobre el trabajo del atleta (§7).
            month = nil
            failed = true
        }
        loading = false
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
            let isFocused = selectedDay == isoDate(n)
            Button(action: { openDay(n) }) {
                VStack(spacing: 3) {
                    Text("\(n)")
                        .font(.system(size: 13, weight: isToday || isFocused ? .heavy : .medium).monospacedDigit())
                        .foregroundStyle(isToday ? Theme.Color.accentText : Theme.Color.foreground)
                    indicator(for: state)
                        .frame(height: 12)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isFocused ? Theme.Color.surfaceElevated : .clear)
                )
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(isToday ? Theme.Color.accentText.opacity(0.7) : .clear, lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!isTappable(state))
            .accessibilityLabel(cellAccessibility(n, state, isToday))
            .accessibilityAddTraits(isFocused ? .isSelected : [])
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

    // Tap a day → open WHAT THE ATHLETE MEANT.
    //
    // This used to open `day.sessions.first` unconditionally. On any day with
    // more than one session that silently opened a DIFFERENT workout than the
    // one being asked for — and since the detail screen is the same for all of
    // them, nothing on screen said so. It reads as the app lying about a
    // session: you tap the day you ran 1 km at RPE 9 and you get the Ski-Erg
    // logged at 7. One session → open it. Several → never guess: focus the day
    // in the list below so the athlete picks the one they mean.
    /// "YYYY-MM-DD" for a day of the viewed month — the key the payload uses.
    private func isoDate(_ n: Int) -> String {
        String(format: "%04d-%02d-%02d", viewed.year, viewed.month, n)
    }

    private func openDay(_ n: Int) {
        let iso = isoDate(n)
        guard let day = month?.days.first(where: { $0.date == iso }),
              !day.sessions.isEmpty else { return }
        Haptics.light()
        if day.sessions.count == 1, let only = day.sessions.first {
            executedTarget = WorkoutLaunch(assignmentId: only.assignmentId, title: only.title)
            return
        }
        // Tapping the focused day again clears the focus (a toggle, so the
        // athlete is never stuck inside one day with no way back to the month).
        withAnimation(.easeInOut(duration: 0.15)) {
            selectedDay = (selectedDay == iso) ? nil : iso
        }
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

    private var monthList: some View {
        HistorialDelMes(
            viewed: viewed,
            rows: rows,
            loading: loading && month == nil,
            failed: failed,
            selectedDay: selectedDay,
            onReintentar: { Task { await load() } },
            onVerMesAnterior: {
                Haptics.light()
                withAnimation(.easeInOut(duration: 0.15)) { viewed = viewed.previous() }
            },
            onVerElMes: {
                Haptics.light()
                withAnimation(.easeInOut(duration: 0.15)) { selectedDay = nil }
            },
            onAbrir: { session in
                Haptics.light()
                executedTarget = WorkoutLaunch(
                    assignmentId: session.assignmentId,
                    title: session.title
                )
            },
            onPreguntar: onPreguntar
        )
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

// MARK: - La lista del mes, con sus cuatro estados

/// Lo que va debajo del calendario: la lista de sesiones del mes, su cargando, su
/// vacío y su error. Sin estado propio — lo recibe todo y devuelve toques.
///
/// Vive fuera de `HistoryView` para poder renderizarse en una captura (dentro
/// cuelga del `CenteredScreen`, que es un `ScrollView`, e `ImageRenderer` no dibuja
/// ScrollView) y porque es la parte de la pantalla que tiene estados: separarla
/// hace que los cuatro se puedan mirar uno a uno.
struct HistorialDelMes: View {
    let viewed: YearMonth
    let rows: [HistoryListRow]
    let loading: Bool
    let failed: Bool
    /// El día enfocado cuando el atleta tocó uno con varias sesiones.
    let selectedDay: String?
    let onReintentar: () -> Void
    let onVerMesAnterior: () -> Void
    let onVerElMes: () -> Void
    let onAbrir: (AthleteHistorySession) -> Void
    /// Preguntarle al coach por esta sesión. Nil = sin coach, y entonces la fila
    /// del menú no existe. Con defecto para no obligar a las pruebas de render
    /// —ni a ningún futuro llamador— a declarar algo que no les importa.
    var onPreguntar: ((AthleteHistorySession, String) -> Void)? = nil

    var body: some View {
        if loading {
            HStack { Spacer(); ProgressView().tint(Theme.Color.accent); Spacer() }
        } else if failed {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar \(HistoryCalendar.monthNameEs(viewed.month))",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar", perform: onReintentar)
            )
        } else if rows.isEmpty {
            mesVacio
        } else {
            VStack(spacing: 0) {
                if selectedDay != nil { focusedDayHeader }
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Divider().overlay(Theme.Color.hairline) }
                    listRow(row)
                }
            }
        }
    }

    /// Un mes sin entrenos. Lleva salida SIEMPRE (§5), y la salida es el acto que
    /// el atleta viene a hacer aquí: **mirar hacia atrás**. «Ver junio» nombra su
    /// destino, cabe en un toque y no le deja adivinando si hay algo detrás.
    ///
    /// Un mes ya cerrado y otro en curso no dicen lo mismo: en el que corre todavía
    /// puede pasar algo, y eso es información; en el que pasó, ya no.
    private var mesVacio: some View {
        RedesignEmptyState(
            symbol: "calendar",
            title: "Sin entrenos en \(HistoryCalendar.monthNameEs(viewed.month))",
            message: HistoryCalendar.todayDay(in: viewed) != nil
                ? "Lo que entrenes este mes aparece aquí en cuanto lo cierres."
                : "No hay ninguna sesión registrada en este mes.",
            exit: .action(
                title: "Ver \(HistoryCalendar.monthNameEs(viewed.previous().month))",
                perform: onVerMesAnterior
            )
        )
    }

    /// Shown when a multi-session day is focused: says WHICH day is on screen and
    /// gives one obvious way back to the full month. Without it the filtered list
    /// would look like a month that lost most of its sessions.
    @ViewBuilder
    private var focusedDayHeader: some View {
        if let selectedDay {
            HStack(spacing: 8) {
                LabelText(text: focusedDayLabel(selectedDay), color: Theme.Color.accentText, size: 10)
                Spacer(minLength: 0)
                Button(action: onVerElMes) {
                    Text("Ver el mes")
                        .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ver todo el mes")
            }
            .padding(.vertical, Theme.Spacing.s)
        }
    }

    /// "MIÉ 28 JUL · 4 SESIONES" — the focused day and how many it holds.
    private func focusedDayLabel(_ iso: String) -> String {
        let count = rows.count
        let unit = count == 1 ? "sesión" : "sesiones"
        guard let p = HistoryCalendar.parseISO(iso) else { return "\(count) \(unit)" }
        let dow = HistoryCalendar.dowAbbrev(iso)
        let mon = HistoryCalendar.monthAbbrevEs[max(0, min(11, p.month - 1))]
        return "\(dow) \(p.day) \(mon) · \(count) \(unit)"
    }

    private func listRow(_ row: HistoryListRow) -> some View {
        let s = row.session
        return Button(action: { onAbrir(s) }) {
            HStack(alignment: .center, spacing: 12) {
                // Date stamp — DOW + day number.
                VStack(spacing: 1) {
                    Text(HistoryCalendar.dowAbbrev(row.date))
                        .font(.system(size: 8, weight: .heavy)).tracking(0.4).textCase(.uppercase)
                        .foregroundStyle(Theme.Color.faint)
                    if let day = dayNumber(row.date) {
                        Text(day)
                            .font(.system(size: 16, weight: .heavy).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
                .frame(width: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(s.title)
                        .scaledFont(13, weight: .semibold, relativeTo: .subheadline)
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
        // Pulsación larga sobre la fila. VA SOBRE EL BOTÓN, nunca dentro de su
        // `label:`: ahí dentro el botón se queda el gesto y el menú no se abre.
        .contextMenu {
            Button {
                onAbrir(s)
            } label: {
                Label("Ver el entreno", systemImage: "list.bullet.rectangle")
            }
            if let onPreguntar {
                Button {
                    onPreguntar(s, row.date)
                } label: {
                    Label("Preguntar al coach", systemImage: "message")
                }
            }
        }
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

    /// El día del mes del sello. Nil cuando la fecha no se puede leer: entonces no
    /// hay sello que pintar, igual que `dowAbbrev` ya devuelve vacío. La columna
    /// sigue reservada para que la lista no se desalinee.
    private func dayNumber(_ iso: String) -> String? {
        HistoryCalendar.parseISO(iso).map { String($0.day) }
    }
}
