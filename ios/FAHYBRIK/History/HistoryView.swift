import SwiftUI

// #27 — HISTORIAL: a monthly calendar of the athlete's done work → tap a day / row →
// the EXISTING ExecutedWorkoutView (this screen builds no detail of its own). Month
// navigation is capped at the current month (no future); back is free. The grid math is
// pure (HistoryModels); this file is presentation + the fetch per month.
//
// Una excepción a «el detalle es ExecutedWorkoutView»: las filas «Sin subir» (lo que el
// servidor rechazó y el móvil guarda) abren su ficha local, `EntrenoSinSubirView` —el
// servidor no las tiene y la ficha de siempre daría un 404—. La lista, en
// HistorialDelMes.swift.
//
// ARQUETIPO **Lista** que degrada a **Vacío** (contrato §6.2). ESTRATEGIA `llena`,
// montada sobre las TRES posiciones de `CenteredScreen`:
//
//   head     la cabecera con el título y la ✕ (`CabeceraDeLoHecho`) — clavada, nunca
//            se va con el scroll.
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
    /// Tras borrar un libre del historial — refrescar plan en quien presenta.
    var onFreeSessionDeleted: (() -> Void)? = nil

    @State private var viewed: YearMonth = .current()
    @State private var month: AthleteHistoryMonth? = nil
    @State private var loading = true
    /// No pudimos preguntar por este mes. Distinto de «este mes no tiene entrenos»:
    /// uno lleva reintento y el otro no (§5).
    @State private var failed = false
    @State private var executedTarget: WorkoutLaunch? = nil
    /// Lo hecho SIN asignación (importación, fuera del plan): se abre por ejecución.
    @State private var ejecucionTarget: EjecucionAbierta? = nil
    /// The day (YYYY-MM-DD) the athlete tapped when it held SEVERAL sessions —
    /// the list below narrows to it so they choose, instead of the calendar
    /// picking one for them. Nil = showing the whole month.
    @State private var selectedDay: String? = nil
    @State private var deleteFreeTarget: AthleteHistorySession? = nil
    /// Lo que el servidor rechazó y el móvil guarda (`RequestQueue.rejected`): se cose
    /// en el mes marcado «Sin subir» (DECISIONS 2026-09-25). Solo con el mes leído: sin
    /// él, una lista con solo esas filas se leería como «el mes tuvo esto y nada más».
    @State private var sinSubir: [LocalUnsyncedWorkout] = []
    /// La fila «Sin subir» que se abrió: su ficha local, nunca la del servidor.
    @State private var sinSubirTarget: LocalUnsyncedWorkout? = nil

    // Derived (pure)
    private var states: [Int: CalendarDayState] {
        HistoryCalendar.dayStates(month?.days ?? [], in: viewed, sinSubir: month == nil ? [] : sinSubir)
    }
    private var todayDay: Int? { HistoryCalendar.todayDay(in: viewed) }
    private var allRows: [HistoryListRow] {
        month.map { HistoryListRow.rows(from: $0, sinSubir: sinSubir, in: viewed) } ?? []
    }
    /// What the list actually renders: the focused day alone, or the whole month.
    private var rows: [HistoryListRow] {
        guard let selectedDay else { return allRows }
        return allRows.filter { $0.date == selectedDay }
    }
    private var canForward: Bool { HistoryCalendar.canGoForward(from: viewed) }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Cambiar de mes o de día enfocado: un fundido corto, o ninguno con Reducir movimiento.
    private var cambio: Animation? { reduceMotion ? nil : .easeInOut(duration: 0.15) }

    var body: some View {
        CenteredScreen {
            CabeceraDeLoHecho(titulo: "Historial", alCerrar: onClose)
        } lead: {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CalendarioDelMes(
                    viewed: viewed,
                    estados: states,
                    hoy: todayDay,
                    enfocado: selectedDay,
                    puedeAvanzar: canForward,
                    alCambiarDeMes: { mes in withAnimation(cambio) { viewed = mes } },
                    alTocarDia: openDay
                )
                Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.bottom, Theme.Spacing.l)
        } content: {
            monthList
                .padding(.horizontal, Theme.Spacing.pantalla)
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
        .fullScreenCover(item: $ejecucionTarget) { abierta in
            EntrenoHechoPorEjecucionView(
                executionId: abierta.executionId,
                fallbackTitle: abierta.title,
                bearer: bearer,
                onClose: { ejecucionTarget = nil }
            )
        }
        .fullScreenCover(item: $sinSubirTarget) { entreno in
            EntrenoSinSubirView(entreno: entreno, onClose: { sinSubirTarget = nil })
        }
        .confirmationDialog(
            "¿Borrar este entreno libre?",
            isPresented: Binding(
                get: { deleteFreeTarget != nil },
                set: { if !$0 { deleteFreeTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: deleteFreeTarget
        ) { session in
            Button("Borrar del todo", role: .destructive) {
                Task { await confirmDeleteFree(session) }
            }
            Button("Cancelar", role: .cancel) { deleteFreeTarget = nil }
        } message: { _ in
            Text("Lo creaste tú: se borra el entreno y lo registrado. No volverá a aparecer.")
        }
    }

    @MainActor
    private func confirmDeleteFree(_ session: AthleteHistorySession) async {
        deleteFreeTarget = nil
        guard let token = bearer, let assignmentId = session.assignmentId else { return }
        do {
            try await FreeSessionDelete.perform(assignmentId: assignmentId, bearer: token)
            Haptics.medium()
            onFreeSessionDeleted?()
            await load()
        } catch {
            Haptics.error()
        }
    }

    // MARK: - Load

    @MainActor
    private func load() async {
        loading = true
        // Del móvil, sin red: se relee en cada carga porque un GUARDAR sin cobertura
        // puede recibir su rechazo al vaciarse la cola, con esta pantalla abierta.
        sinSubir = await LocalUnsyncedWorkout.guardados()
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
        HistoryCalendar.isoDate(n, en: viewed)
    }

    private func openDay(_ n: Int) {
        let iso = isoDate(n)
        // Las filas del día, las del servidor y las «Sin subir»: un día cuyo único
        // entreno está sin subir también se abre.
        let delDia = allRows.filter { $0.date == iso }
        guard !delDia.isEmpty else { return }
        Haptics.light()
        if delDia.count == 1, let only = delDia.first {
            abrir(only)
            return
        }
        // Tapping the focused day again clears the focus (a toggle, so the
        // athlete is never stuck inside one day with no way back to the month).
        withAnimation(cambio) {
            selectedDay = (selectedDay == iso) ? nil : iso
        }
    }

    /// Una fila → su ficha: la del servidor, o la local si está «Sin subir» (el
    /// servidor no la tiene: `ExecutedWorkoutView` daría un 404).
    private func abrir(_ row: HistoryListRow) {
        if let local = row.sinSubir {
            sinSubirTarget = local
        } else {
            abrirSesion(row.session)
        }
    }

    /// Una sesión del servidor → su ficha: por la asignación si la tiene, si no por
    /// su ejecución (lo hecho fuera del plan también se abre).
    private func abrirSesion(_ s: AthleteHistorySession) {
        switch s.destino {
        case .asignacion(let id):
            executedTarget = WorkoutLaunch(assignmentId: id, title: s.title)
        case .ejecucion(let id):
            ejecucionTarget = EjecucionAbierta(executionId: id, title: s.title)
        case nil:
            break
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
                withAnimation(cambio) { viewed = viewed.previous() }
            },
            onVerElMes: {
                Haptics.light()
                withAnimation(cambio) { selectedDay = nil }
            },
            onAbrir: { session in
                Haptics.light()
                abrirSesion(session)
            },
            onPreguntar: onPreguntar,
            onRequestDeleteFree: { session in
                deleteFreeTarget = session
            },
            onAbrirSinSubir: { entreno in
                Haptics.light()
                sinSubirTarget = entreno
            }
        )
    }
}

/// Un entreno hecho sin asignación, abierto por su ejecución.
struct EjecucionAbierta: Identifiable, Equatable {
    let executionId: String
    let title: String?
    var id: String { executionId }
}
