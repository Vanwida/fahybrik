import SwiftUI

// LO QUE EL ATLETA PUEDE HACERLE A UNA SESIÓN — y lo que se le dice si falla.
//
// Vive aparte de `PlanView` para que la composición de la pantalla se lea sin atravesar cuatro mutaciones de
// red, no porque sea otra cosa: es la misma vista. QUÉ ofrece el menú lo decide `AthleteWeekDaySession.acciones`
// (PlanMenu.swift, probado); aquí solo se PINTA y se hace lo que cada fila pide.
//
// NINGUNA de estas acciones es nueva. Son exactamente las que tenía cada fila de la vieja lista de días —mover,
// ver la técnica, corregir el estado, borrar un libre— con el mismo contrato de servidor, la misma actualización
// optimista y los mismos mensajes. Lo que cambió es DÓNDE se tocan: el «···» de la acción anclada, el «···» de
// la fila de cada otra sesión y la pulsación larga sobre un día del carril.
//
// QUÉ SE RETIRÓ Y POR QUÉ: arrastrar una sesión de un día a otro. Su lienzo era la lista vertical de siete filas
// de alto completo, que ya no existe; una ficha del carril es un glifo, no una fila sobre la que soltar una
// tarjeta. El camino accesible —«Mover a otro día», con cada día y lo que ya lleva— es el que siempre fue fiable
// (arrastrar solo nunca cumplió WCAG) y sigue estando. Ningún movimiento que el atleta pudiera hacer antes ha
// dejado de poder hacerse.

extension PlanView {

    // MARK: - Los menús

    /// El menú «···» de UNA sesión, contextual a su estado. `semana` es la que se mira: de ella salen los días a
    /// los que se puede mover.
    @ViewBuilder
    func menuDeSesion(_ sesion: AthleteWeekDaySession, _ semana: SemanaDelPlan?) -> some View {
        ForEach(sesion.acciones(conCoach: true)) { accion in
            if accion.clave == .mover {
                if let semana {
                    Menu {
                        ForEach(semana.diasDestino(de: sesion)) { dia in
                            Button(semana.etiquetaDeDiaDestino(dia)) { mover(sesion, a: dia.isoDate) }
                        }
                    } label: {
                        Label(accion.etiqueta, systemImage: accion.simbolo)
                    }
                }
            } else {
                Button(role: accion.destructiva ? .destructive : nil) {
                    elegir(accion.clave, de: sesion)
                } label: {
                    Label(accion.etiqueta, systemImage: accion.simbolo)
                }
            }
        }
    }

    /// Las acciones de TODAS las sesiones de un día, para la pulsación larga del carril. Un día de descanso no
    /// produce ningún botón y entonces no hay menú.
    @ViewBuilder
    func menuDelDia(_ dia: DiaDelPlan, _ semana: SemanaDelPlan?) -> some View {
        ForEach(dia.sesiones) { sesion in
            if dia.sesiones.count > 1 {
                Menu(sesion.title) { menuDeSesion(sesion, semana) }
            } else {
                menuDeSesion(sesion, semana)
            }
        }
    }

    private func elegir(_ clave: ClaveAccion, de sesion: AthleteWeekDaySession) {
        switch clave {
        case .tecnica:     techniqueTarget = sesion
        case .preguntar:   preguntarPor(sesion)
        case .mover:       break   // el destino se elige en el submenú
        case .marcarHecha: marcarHecha(sesion)
        case .completar:   Task { await attemptWorkoutLaunch(WorkoutLaunch(assignmentId: sesion.assignmentId, title: sesion.title)) }
        case .deshacer:    pedirDeshacer(sesion)
        case .editarLibre: freeEditAssignmentId = sesion.assignmentId
        case .borrarLibre: deleteFreeTarget = sesion
        }
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

    /// Lo mismo, pero señalando UN ejercicio dentro del entreno: el coach recibe «Back squat · Fuerza A, hoy» y
    /// no el entreno entero.
    func preguntarPorEjercicio(_ ejercicio: EjercicioSeñalado, de session: AthleteWeekDaySession) {
        Haptics.light()
        // Sin segmento prescrito la referencia fina no existe, así que se señala el entreno y la etiqueta lo dice
        // tal cual: nunca una etiqueta que prometa un ejercicio y una referencia que apunte a la sesión entera.
        let etiqueta = ejercicio.segmentoId == nil
            ? "\(session.title) · \(cuandoFue(session))"
            : "\(ejercicio.nombre) · \(session.title), \(cuandoFue(session))"
        contextoDelChat = ChatContextChoice(
            target: .entreno(session.assignmentId, ejercicio: ejercicio.segmentoId),
            etiqueta: etiqueta
        )
        showChat = true
    }

    /// Un entreno del HISTORIAL: ahí no hay `AthleteWeekDaySession`, solo la fila de lo hecho con su fecha, y
    /// basta — la referencia es el assignment.
    func preguntarPorEntrenoPasado(_ sesion: AthleteHistorySession, iso: String) {
        // Sin asignación no hay entreno al que el chat pueda señalar (el historial tampoco ofrece la acción en ese caso).
        guard let assignmentId = sesion.assignmentId else { return }
        Haptics.light()
        let hoyIso = store.planWeek.value?.week.todayIso ?? iso
        contextoDelChat = ChatContextChoice(
            target: .entreno(assignmentId),
            etiqueta: "\(sesion.title) · \(EntrenosSeñalables.cuando(iso: iso, hoyIso: hoyIso))"
        )
        showChat = true
    }

    /// «hoy» · «ayer» · «mar 12» para la etiqueta del chip. Es de pantalla: la etiqueta que se guarda con el
    /// mensaje la escribe el servidor.
    private func cuandoFue(_ session: AthleteWeekDaySession) -> String {
        let dia = store.planWeek.value?.week.days.first { dia in
            dia.sessions.contains { $0.assignmentId == session.assignmentId }
        }
        guard let dia else { return EntrenosSeñalables.etiquetaHoy }
        let hoyIso = store.planWeek.value?.week.todayIso ?? dia.isoDate
        if dia.isoDate == hoyIso { return EntrenosSeñalables.etiquetaHoy }
        return EntrenosSeñalables.cuando(iso: dia.isoDate, hoyIso: hoyIso)
    }

    // MARK: - Las mutaciones (mismo contrato de servidor de siempre)

    func mover(_ session: AthleteWeekDaySession, a targetIso: String) {
        guard let token = bearer, let numericId = Int(session.assignmentId) else {
            mostrarError(PlanTextos.Fallo.mover)
            return
        }
        Haptics.light()
        Task {
            do {
                _ = try await PlanService.moveSession(assignmentId: numericId, toDate: targetIso, bearer: token)
                Haptics.success()
                await store.planMutated()
                await cargar(force: true)
            } catch {
                Haptics.error()
                mostrarError(PlanTextos.Fallo.deMover(error))
            }
        }
    }

    /// «Marcar como hecha» — afirma el HECHO sin inventar ninguna métrica: el mismo grabador que el final en vivo,
    /// pero sin un solo número. La marca es OPTIMISTA (la card pasa a verde al momento) y se revierte si el
    /// servidor rechaza.
    func marcarHecha(_ session: AthleteWeekDaySession) {
        guard let token = bearer, !session.assignmentId.isEmpty else {
            mostrarError(PlanTextos.Fallo.marcar)
            return
        }
        let id = session.assignmentId
        CompletedAssignmentsStore.markCompleted(id)
        marcasVersion += 1
        Haptics.success()
        Task {
            do {
                try await PlanService.markSessionDone(assignmentId: id, bearer: token)
                await store.planMutated()
                await cargar(force: true)
            } catch {
                CompletedAssignmentsStore.unmark(id)
                marcasVersion += 1
                Haptics.error()
                mostrarError(PlanTextos.Fallo.marcar)
                await cargar(force: true)
            }
        }
    }

    /// «Deshacer hecho», primera pasada. Decide el SERVIDOR: si la sesión guarda trabajo real pide confirmación;
    /// si no, ya está deshecha.
    func pedirDeshacer(_ session: AthleteWeekDaySession) {
        guard let token = bearer, let numericId = Int(session.assignmentId) else {
            mostrarError(PlanTextos.Fallo.deshacer)
            return
        }
        Task {
            do {
                switch try await PlanService.resetSession(assignmentId: numericId, confirm: false, bearer: token) {
                case .reset:             await aplicarDeshacer(session)
                case .needsConfirmation: undoConfirmTarget = session
                }
            } catch {
                Haptics.error()
                mostrarError(PlanTextos.Fallo.deshacer)
            }
        }
    }

    /// Deshacer CONFIRMADO — el atleta aceptó perder lo registrado.
    func confirmUndo(_ session: AthleteWeekDaySession) {
        undoConfirmTarget = nil
        guard let token = bearer, let numericId = Int(session.assignmentId) else {
            mostrarError(PlanTextos.Fallo.deshacer)
            return
        }
        Task {
            do {
                _ = try await PlanService.resetSession(assignmentId: numericId, confirm: true, bearer: token)
                await aplicarDeshacer(session)
            } catch {
                Haptics.error()
                mostrarError(PlanTextos.Fallo.deshacer)
            }
        }
    }

    private func aplicarDeshacer(_ session: AthleteWeekDaySession) async {
        CompletedAssignmentsStore.unmark(session.assignmentId)
        marcasVersion += 1
        desgloses[session.assignmentId] = nil   // lo registrado ya no existe: sus minutos medidos tampoco
        AssignmentDetailCache.remove(session.assignmentId)
        Haptics.success()
        await store.planMutated()
        await cargar(force: true)
    }

    func confirmDeleteFree(_ session: AthleteWeekDaySession) {
        deleteFreeTarget = nil
        guard let token = bearer else { return }
        Task {
            do {
                try await FreeSessionDelete.perform(assignmentId: session.assignmentId, bearer: token)
                Haptics.medium()
                await store.planMutated()
                await cargar(force: true)
            } catch {
                mostrarError(PlanTextos.Fallo.borrar)
            }
        }
    }

    // MARK: - Cuando algo falla

    /// El aviso de que algo no salió. Cuando aparece, lo que falló ya se revirtió: no promete nada, solo cuenta qué
    /// pasó. Es el aviso del día (`AvisoDia`), el único de la app: se queda hasta que el atleta lo descarte.
    func mostrarError(_ mensaje: String) {
        aviso = AvisoDia.Contenido(tono: .fallo, texto: mensaje)
    }
}

// MARK: - Los dos diálogos destructivos

extension View {
    /// «¿Deshacer este entreno?»: el atleta acepta perder lo registrado. Los diálogos son dos modificadores y no
    /// uno porque el Plan libre solo usa el de borrar, y dos `confirmationDialog` en el mismo `body` disparan el
    /// tiempo de comprobación de tipos.
    func confirmarDeshacer(_ objetivo: Binding<AthleteWeekDaySession?>, alConfirmar: @escaping (AthleteWeekDaySession) -> Void) -> some View {
        confirmationDialog(
            PlanTextos.Deshacer.titulo,
            isPresented: Binding(get: { objetivo.wrappedValue != nil }, set: { if !$0 { objetivo.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: objetivo.wrappedValue
        ) { session in
            Button(PlanTextos.Deshacer.confirmar, role: .destructive) { alConfirmar(session) }
            Button("Cancelar", role: .cancel) { objetivo.wrappedValue = nil }
        } message: { _ in
            Text(PlanTextos.Deshacer.mensaje)
        }
    }

    /// «¿Borrar este entreno libre?»: un libre es del atleta y se borra del todo, entreno y lo registrado.
    func confirmarBorrarLibre(_ objetivo: Binding<AthleteWeekDaySession?>, alConfirmar: @escaping (AthleteWeekDaySession) -> Void) -> some View {
        confirmationDialog(
            PlanTextos.Borrar.titulo,
            isPresented: Binding(get: { objetivo.wrappedValue != nil }, set: { if !$0 { objetivo.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: objetivo.wrappedValue
        ) { session in
            Button(PlanTextos.Borrar.confirmar, role: .destructive) { alConfirmar(session) }
            Button("Cancelar", role: .cancel) { objetivo.wrappedValue = nil }
        } message: { _ in
            Text(PlanTextos.Borrar.mensaje)
        }
    }
}
