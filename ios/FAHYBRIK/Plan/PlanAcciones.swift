import SwiftUI

// LO QUE EL ATLETA PUEDE HACERLE A UNA SESIÓN — y lo que se le dice si falla.
//
// Vive aparte de `PlanView` para que la composición de la pantalla se lea sin
// atravesar cuatro mutaciones de red, no porque sea otra cosa: es la misma vista.
//
// NINGUNA de estas acciones es nueva. Son exactamente las que tenía cada fila de
// la vieja lista de días —mover, ver la técnica, corregir el estado, borrar un
// libre— con el mismo contrato de servidor, la misma actualización optimista y
// los mismos mensajes. Lo que cambió es DÓNDE se tocan: el «···» del héroe, el
// «···» de la segunda sesión y la pulsación larga sobre un día del carril.
//
// QUÉ SE RETIRÓ Y POR QUÉ: arrastrar una sesión de un día a otro. Su lienzo era
// la lista vertical de siete filas de alto completo, que ya no existe; una ficha
// de 46 pt del carril es un glifo, no una fila sobre la que soltar una tarjeta. El
// camino accesible —«Mover a otro día», con cada día y lo que ya lleva— es el que
// siempre fue fiable (arrastrar solo nunca cumplió WCAG) y sigue estando en las
// tres superficies. Ningún movimiento que el atleta pudiera hacer antes ha
// dejado de poder hacerse.

extension PlanView {

    // MARK: - Los menús

    /// El menú «···» de UNA sesión, contextual a su estado.
    ///   pendiente / no hecha → Marcar como hecha · Completar ahora
    ///   parcial              → Completar ahora · Deshacer hecho
    ///   hecha                → Deshacer hecho
    @ViewBuilder
    func accionesDeSesion(_ session: AthleteWeekDaySession) -> some View {
        Button {
            techniqueTarget = session
        } label: {
            Label("Ver ejercicios y técnica", systemImage: "list.bullet.rectangle")
        }
        // Preguntar SOBRE este entreno. Una fila más en un menú que ya existía:
        // cero alto nuevo en la pantalla, que era la condición del encargo (ver
        // docs/DECISIONS.md, 12-ago «El chat aprende SOBRE QUÉ va el mensaje»).
        // Sin coach no hay a quién preguntar, así que la fila tampoco existe.
        if hasCoach {
            Button {
                preguntarPor(session)
            } label: {
                Label("Preguntar al coach", systemImage: "message")
            }
        }
        if puedeMoverse(session) {
            Menu("Mover a otro día") {
                ForEach(diasDestino(de: session)) { dia in
                    Button(etiquetaDeDiaDestino(dia)) { mover(session, a: dia.isoDate) }
                }
            }
        }
        switch marca(session) {
        case .pending, .missed:
            Button { marcarHecha(session) } label: {
                Label("Marcar como hecha", systemImage: "checkmark")
            }
            Button { workoutLaunch = launch(session) } label: {
                Label("Completar ahora", systemImage: "square.and.pencil")
            }
        case .partial:
            Button { workoutLaunch = launch(session) } label: {
                Label("Completar ahora", systemImage: "square.and.pencil")
            }
            Button(role: .destructive) { pedirDeshacer(session) } label: {
                Label("Deshacer hecho", systemImage: "arrow.uturn.backward")
            }
        case .done:
            Button(role: .destructive) { pedirDeshacer(session) } label: {
                Label("Deshacer hecho", systemImage: "arrow.uturn.backward")
            }
        }
        // Un LIBRE es del atleta: se borra del todo, en cualquier estado. Las del
        // coach no ofrecen esto — se deshacen, no se borran.
        if session.isSelfOrigin {
            Button(role: .destructive) { deleteFreeTarget = session } label: {
                Label("Borrar entreno libre", systemImage: "trash")
            }
        }
    }

    /// Las acciones de TODAS las sesiones de un día, para la pulsación larga del
    /// carril. Un día de descanso no produce ningún botón y entonces no hay menú.
    @ViewBuilder
    func accionesDelDia(_ dia: DiaDelPlan) -> some View {
        ForEach(dia.sesiones) { session in
            if dia.sesiones.count > 1 {
                Menu(session.title) { accionesDeSesion(session) }
            } else {
                accionesDeSesion(session)
            }
        }
    }

    /// El «···» de la fila de la segunda sesión del día.
    func menuDeSesion(_ session: AthleteWeekDaySession) -> some View {
        Menu {
            accionesDeSesion(session)
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 32, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Acciones de \(session.title)")
    }

    /// Una sesión se mueve mientras no esté completada — el servidor congela las
    /// hechas y devolvería 409.
    func puedeMoverse(_ session: AthleteWeekDaySession) -> Bool {
        !session.assignmentId.isEmpty && marca(session) != .done
    }

    func diasDestino(de session: AthleteWeekDaySession) -> [DiaDelPlan] {
        let origen = semana?.dias.first { dia in
            dia.sesiones.contains { $0.assignmentId == session.assignmentId }
        }
        return (semana?.dias ?? []).filter { $0.isoDate != origen?.isoDate }
    }

    /// «Lunes 21 · libre» / «Hoy · 1 sesión» — el día, su fecha y su carga, para
    /// que el atleta elija con contexto y no a ciegas.
    func etiquetaDeDiaDestino(_ dia: DiaDelPlan) -> String {
        let nombre = dia.esHoy ? "Hoy" : "\(dia.nombre) \(dia.numero)"
        let n = dia.sesiones.count
        let carga = n == 0 ? "libre" : (n == 1 ? "1 sesión" : "\(n) sesiones")
        return "\(nombre) · \(carga)"
    }

    // MARK: - Preguntar al coach sobre algo

    /// Abre el chat con ESTE entreno ya señalado.
    func preguntarPor(_ session: AthleteWeekDaySession) {
        Haptics.light()
        contextoDelChat = ChatContextChoice(
            target: .entreno(session.assignmentId),
            etiqueta: "\(session.title) · \(cuandoFue(session))"
        )
        showChat = true
    }

    /// Lo mismo, pero señalando UN ejercicio dentro del entreno: el coach recibe
    /// «Back squat · Fuerza A, hoy» y no el entreno entero.
    func preguntarPorEjercicio(_ ejercicio: EjercicioSeñalado, de session: AthleteWeekDaySession) {
        Haptics.light()
        // Sin segmento prescrito la referencia fina no existe, así que se señala
        // el entreno y la etiqueta lo dice tal cual: nunca una etiqueta que
        // prometa un ejercicio y una referencia que apunte a la sesión entera.
        let etiqueta = ejercicio.segmentoId == nil
            ? "\(session.title) · \(cuandoFue(session))"
            : "\(ejercicio.nombre) · \(session.title), \(cuandoFue(session))"
        contextoDelChat = ChatContextChoice(
            target: .entreno(session.assignmentId, ejercicio: ejercicio.segmentoId),
            etiqueta: etiqueta
        )
        showChat = true
    }

    /// Un entreno del HISTORIAL: ahí no hay `AthleteWeekDaySession`, solo la fila
    /// de lo hecho con su fecha, y basta — la referencia es el assignment.
    func preguntarPorEntrenoPasado(_ sesion: AthleteHistorySession, iso: String) {
        Haptics.light()
        let hoyIso = store.planWeek.value?.week.todayIso ?? iso
        contextoDelChat = ChatContextChoice(
            target: .entreno(sesion.assignmentId),
            etiqueta: "\(sesion.title) · \(EntrenosSeñalables.cuando(iso: iso, hoyIso: hoyIso))"
        )
        showChat = true
    }

    /// «hoy» · «ayer» · «mar 12» para la etiqueta del chip. Es de pantalla: la
    /// etiqueta que se guarda con el mensaje la escribe el servidor.
    private func cuandoFue(_ session: AthleteWeekDaySession) -> String {
        let dia = semana?.dias.first { dia in
            dia.sesiones.contains { $0.assignmentId == session.assignmentId }
        }
        guard let dia else { return EntrenosSeñalables.etiquetaHoy }
        if dia.esHoy { return EntrenosSeñalables.etiquetaHoy }
        let hoyIso = store.planWeek.value?.week.todayIso ?? dia.isoDate
        return EntrenosSeñalables.cuando(iso: dia.isoDate, hoyIso: hoyIso)
    }

    // MARK: - Las mutaciones (mismo contrato de servidor de siempre)

    func mover(_ session: AthleteWeekDaySession, a targetIso: String) {
        guard let token = effectiveBearer, let numericId = Int(session.assignmentId) else {
            mostrarError("No se pudo mover la sesión. Inténtalo de nuevo.")
            return
        }
        Haptics.light()
        Task {
            do {
                _ = try await PlanService.moveSession(
                    assignmentId: numericId, toDate: targetIso, bearer: token
                )
                Haptics.success()
                await store.planMutated()
                await cargar(force: true)
            } catch {
                Haptics.error()
                mostrarError(mensajeDeMover(error))
            }
        }
    }

    /// «Marcar como hecha» — afirma el HECHO sin inventar ninguna métrica: el
    /// mismo grabador que el final en vivo, pero sin un solo número.
    func marcarHecha(_ session: AthleteWeekDaySession) {
        guard let token = effectiveBearer, !session.assignmentId.isEmpty else {
            mostrarError("No se pudo marcar la sesión. Inténtalo de nuevo.")
            return
        }
        let id = session.assignmentId
        CompletedAssignmentsStore.markCompleted(id)                 // optimista
        Haptics.success()
        Task {
            do {
                try await PlanService.markSessionDone(assignmentId: id, bearer: token)
                await store.planMutated()
                await cargar(force: true)
            } catch {
                CompletedAssignmentsStore.unmark(id)                // revierte
                Haptics.error()
                mostrarError("No se pudo marcar como hecha. Inténtalo de nuevo.")
                await cargar(force: true)
            }
        }
    }

    /// «Deshacer hecho», primera pasada. Decide el SERVIDOR: si la sesión guarda
    /// trabajo real pide confirmación; si no, ya está deshecha.
    func pedirDeshacer(_ session: AthleteWeekDaySession) {
        guard let token = effectiveBearer, let numericId = Int(session.assignmentId) else {
            mostrarError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            return
        }
        Task {
            do {
                let outcome = try await PlanService.resetSession(
                    assignmentId: numericId, confirm: false, bearer: token
                )
                switch outcome {
                case .reset:             await aplicarDeshacer(session)
                case .needsConfirmation: undoConfirmTarget = session
                }
            } catch {
                Haptics.error()
                mostrarError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            }
        }
    }

    /// Deshacer CONFIRMADO — el atleta aceptó perder lo registrado.
    func confirmUndo(_ session: AthleteWeekDaySession) {
        undoConfirmTarget = nil
        guard let token = effectiveBearer, let numericId = Int(session.assignmentId) else {
            mostrarError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            return
        }
        Task {
            do {
                _ = try await PlanService.resetSession(
                    assignmentId: numericId, confirm: true, bearer: token
                )
                await aplicarDeshacer(session)
            } catch {
                Haptics.error()
                mostrarError("No se pudo deshacer la sesión. Inténtalo de nuevo.")
            }
        }
    }

    private func aplicarDeshacer(_ session: AthleteWeekDaySession) async {
        CompletedAssignmentsStore.unmark(session.assignmentId)
        Haptics.success()
        await store.planMutated()
        await cargar(force: true)
    }

    func confirmDeleteFree(_ session: AthleteWeekDaySession) {
        deleteFreeTarget = nil
        guard let id = Int(session.assignmentId), let token = effectiveBearer else { return }
        Task {
            do {
                try await PlanService.deleteFreeSession(assignmentId: id, bearer: token)
                Haptics.medium()
                await store.planMutated()
                await cargar(force: true)
            } catch {
                mostrarError("No se pudo borrar el entreno. Inténtalo de nuevo.")
            }
        }
    }

    // MARK: - Cuando algo falla

    /// Traduce un fallo de mover a lo que el atleta necesita saber. 409 = la
    /// sesión está congelada; 422 = fuera de esta semana; 404 = ya no existe.
    func mensajeDeMover(_ error: Error) -> String {
        guard case let APIError.http(status, data) = error else {
            return "No se pudo mover la sesión. Revisa tu conexión."
        }
        let code = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error.code
        switch status {
        case 409: return "Esta sesión ya está completada y no se puede mover."
        case 422:
            return code == "out_of_range"
                ? "Solo puedes mover la sesión dentro de esta semana."
                : "No se pudo mover la sesión. Revisa el día e inténtalo de nuevo."
        case 404: return "No encontramos esta sesión. Desliza para recargar tu plan."
        case 401: return "Tu sesión ha caducado. Vuelve a entrar para mover la sesión."
        default:  return "No se pudo mover la sesión. Inténtalo de nuevo."
        }
    }

    func mostrarError(_ message: String) {
        actionError = message
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if actionError == message { actionError = nil }
        }
    }

    /// El aviso transitorio. Cuando aparece, lo que falló ya se revirtió: no
    /// promete nada, solo cuenta qué pasó.
    @ViewBuilder
    var actionErrorBanner: some View {
        if let actionError {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.danger)
                Text(actionError)
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Theme.Spacing.s)
                Button { self.actionError = nil } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Cerrar aviso")
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 10)
            .background {
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .fill(Theme.Color.dangerTint)
                    )
            }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.danger.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .brandShadow(Theme.Shadow.cardTight)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Aviso: \(actionError)")
        }
    }
}

// MARK: - Los dos diálogos destructivos

/// Extraídos a un `ViewModifier` porque son UNA sola cosa —las dos formas de
/// retirar un entreno— y porque dos `confirmationDialog` en línea disparan el
/// tiempo de comprobación de tipos del `body`.
struct PlanDialogos: ViewModifier {
    @Binding var undoTarget: AthleteWeekDaySession?
    @Binding var deleteFreeTarget: AthleteWeekDaySession?
    let onUndo: (AthleteWeekDaySession) -> Void
    let onDeleteFree: (AthleteWeekDaySession) -> Void

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                "¿Deshacer este entreno?",
                isPresented: Binding(
                    get: { undoTarget != nil },
                    set: { if !$0 { undoTarget = nil } }
                ),
                titleVisibility: .visible,
                presenting: undoTarget
            ) { session in
                Button("Deshacer y borrar lo registrado", role: .destructive) { onUndo(session) }
                Button("Cancelar", role: .cancel) { undoTarget = nil }
            } message: { _ in
                Text("Se borrará lo que registraste y el entreno volverá a pendiente. Esto no se puede deshacer.")
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
                Button("Borrar del todo", role: .destructive) { onDeleteFree(session) }
                Button("Cancelar", role: .cancel) { deleteFreeTarget = nil }
            } message: { _ in
                Text("Lo creaste tú: se borra el entreno y lo registrado. No volverá a aparecer.")
            }
    }
}
