import SwiftUI

// PESTAÑA PLAN — dónde estás hoy dentro del bloque, y qué toca. Es la pestaña del atleta CON coach; la del
// atleta libre es `FreePlanView`.
//
// QUÉ PASÓ AQUÍ (docs/DECISIONS.md, 6-ago-2026; rehecha con el diseño de «El día» el 29-sep)
// -------------------------------------------------------------------------------------------
// Esta pantalla era una LISTA de los siete días del microciclo, y a la vez `InicioView` pintaba su propia
// versión de «qué toca hoy». Ahora la responde el Plan, UNA vez, y el atleta ve el entreno CON el porqué al
// lado. Con «El día» la composición es la de Hoy: UN sujeto grande con el tinte de su momento, y todo lo
// demás lo sirve.
//
// LA COMPOSICIÓN, de arriba abajo
// -------------------------------
//   · Cromo            — compartir la semana, el ciclo, el historial y el chat (`PlanCromo`). Fijo.
//   · Cabecera         — el bloque, «Semana N de M», el rango y la línea del coach (`CabeceraPlan`).
//   · Carril           — los siete días con su sello. Tocar un día CAMBIA la card, no abre otra pantalla.
//   · Sujeto           — el día mostrado en grande (`SujetoSesionPlan`), o el día que no toca nada. Las demás
//                        sesiones del día van como filas compactas debajo, jamás como un segundo héroe.
//   · Acción anclada   — empezar · ver lo hecho · ver lo de mañana. UNA, siempre la misma puerta.
//
// QUIÉN DECIDE QUÉ. La vista no decide: `LecturaPlan.vista` (PlanLectura.swift) dice qué pantalla toca, con
// qué tono y con qué acción, y `PlanLecturaTests` fija cada caso. Aquí viven el estado de la navegación (qué
// semana y qué día se miran), la carga (cache-first + SWR, como el resto de la app) y las presentaciones.
//
// ALTURA (contrato §6.1): la pantalla es `llena` — el cromo es fijo y TODO el sobrante se lo lleva el sujeto.
// Los estados sin día que mostrar (error, pausa, vacíos) degradan a `centra`.

struct PlanView: View {
    var bearer: String? = nil

    // La capa de datos compartida (cache-first): entrar a Plan pinta al instante desde lo que el store ya
    // tiene y revalida por detrás. La semana 0 SIEMPRE se lee de aquí: es la misma que ven Inicio y Perfil.
    @Environment(AppDataStore.self) var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // ── Carga ─────────────────────────────────────────────────────────────────
    @State private var cargando = true
    @State private var falloDeCarga = false
    /// «Reintentar» tras un error de carga está en marcha.
    @State private var reintentando = false
    /// Las semanas HOJEADAS (offset ≥ 1), tal como llegaron del cable. Se guardan crudas y no resueltas: el
    /// estado de un día une al servidor la marca optimista local, y hay que recalcularlo al marcar.
    @State private var hojeadasResp: [Int: AthletePlanWeekResponse] = [:]
    @State private var falloOffset: Set<Int> = []
    @State private var cargandoOffset: Int? = nil
    @State private var visibilidadHojeada: AthletePlanWeekVisibility? = nil
    /// El desglose de cada sesión que se ha mirado, por id. Una sola petición por día mostrado.
    @State var desgloses: [String: Desglose] = [:]
    /// Sube cuando cambia una marca optimista local (`CompletedAssignmentsStore`, que no es observable) para
    /// que la semana se resuelva otra vez y el sello y el tono cambien AL MOMENTO.
    @State var marcasVersion = 0

    // ── Navegación: qué día muestra la card, ahora mismo (Alex, 7-ago) ────────
    // Tocar un chip del carril, o deslizarlo entre semanas, hacen LO MISMO: cambian cuál es el día mostrado.
    @State private var offset = 0
    /// El día elegido A MANO dentro de la semana visible. Nil = el que toca por defecto.
    @State private var seleccion: String? = nil

    // ── Destinos ──────────────────────────────────────────────────────────────
    @State var workoutLaunch: WorkoutLaunch? = nil
    @State private var executedLaunch: WorkoutLaunch? = nil
    @State private var resumeBannerRefresh = 0
    @State private var showLaunchConflict = false
    @State private var conflictSnapshotTitle: String?
    @State private var pendingWorkoutLaunch: WorkoutLaunch? = nil
    @State var techniqueTarget: AthleteWeekDaySession? = nil
    @State var showChat = false
    /// Sobre qué se abre el chat cuando se abre desde el menú de una sesión o de un ejercicio. Nil desde el
    /// cromo: entonces es la conversación a secas.
    @State var contextoDelChat: ChatContextChoice? = nil
    @State private var showPartnerPlan = false
    @State private var showHistory = false
    @State private var showCiclo = false
    @State var freeEditAssignmentId: String? = nil
    @State private var tarjetaParaCompartir: TarjetaCompartible? = nil
    @State private var showMuro = false

    // ── Acciones que pueden fallar ────────────────────────────────────────────
    @State var aviso: AvisoDia.Contenido? = nil
    @State var undoConfirmTarget: AthleteWeekDaySession? = nil
    @State var deleteFreeTarget: AthleteWeekDaySession? = nil

    // MARK: - La lectura

    private var respuestaActual: AthletePlanWeekResponse? { store.planWeek.value }

    private func semanaDe(_ resp: AthletePlanWeekResponse) -> SemanaDelPlan {
        // El total de «Semana N de M» sale de la etiqueta del servidor; si la de esta respuesta no lo trae, la del
        // progreso del macro (ver `PosicionEnBloque` para por qué NO se calcula aquí).
        SemanaDelPlan.desde(resp, etiquetaDeRespaldo: store.macroProgress.value?.macro.weekLabel)
    }

    /// Lo que la pestaña recibe, sin desgloses todavía: `vista` no depende de ellos.
    private var lecturaBase: LecturaPlan {
        _ = marcasVersion   // depende de la marca optimista local: al cambiar, se resuelve otra vez
        let resp = respuestaActual
        let coach = resp?.coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        var hojeadas: [Int: SemanaHojeada] = [:]
        for (o, r) in hojeadasResp { hojeadas[o] = .llego(semanaDe(r)) }
        for o in falloOffset where hojeadas[o] == nil { hojeadas[o] = .falla }
        return LecturaPlan(
            coach: (coach?.isEmpty == false) ? coach : nil,
            companero: store.partner.value?.partner?.firstName,
            hoyIso: resp?.week.todayIso ?? FechaES.iso(Date()),
            cargando: cargando,
            errorCarga: falloDeCarga,
            pausa: (resp?.week.paused == true) ? PausaDelPlan(desde: resp?.week.pausedSince) : nil,
            actual: resp.map(semanaDe),
            hojeadas: hojeadas,
            muro: visibilidad?.wallMessage,
            horizonteBloquea: visibilidad?.peekBlockedByHorizon ?? false
        )
    }

    /// Lo que el servidor dice del horizonte del club: lo de la última semana pedida, o lo de esta.
    private var visibilidad: AthletePlanWeekVisibility? { visibilidadHojeada ?? respuestaActual?.planVisibility }

    private var navegacion: NavegacionPlan {
        NavegacionPlan(offset: offset, seleccion: seleccion, cargando: cargandoOffset == offset && hojeadasResp[offset] == nil)
    }

    /// Las sesiones cuyo desglose hace falta para pintar lo que se ve: la del sujeto, y la de ayer cuando el
    /// descanso de hoy la cuenta (sus minutos medidos).
    private func idsADesglosar(_ v: VistaPlan) -> [String] {
        guard case let .semana(_, semana, cuerpo) = v else { return [] }
        switch cuerpo {
        case let .sesion(_, principal, _, _):
            return [principal.assignmentId]
        case let .descanso(_, conContexto):
            return conContexto ? (semana?.sesionDeAyer.map { [$0.sesion.assignmentId] } ?? []) : []
        default:
            return []
        }
    }

    // MARK: - Cuerpo

    /// La lectura con los desgloses que ya llegaron. Lo que aún no ha llegado se pinta como esqueleto, no como
    /// «sin detalle»: aún no sabemos cuál de los dos es.
    private func conDesgloses(_ base: LecturaPlan, _ v: VistaPlan) -> LecturaPlan {
        var l = base
        l.desgloses = desgloses
        if bearer != nil {
            for id in idsADesglosar(v) where l.desgloses[id] == nil { l.desgloses[id] = .cargando }
        }
        return l
    }

    var body: some View {
        let base = lecturaBase
        let v = base.vista(navegacion)
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            contenido(conDesgloses(base, v), v)
        }
        .avisoDia($aviso)
        .animation(reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.9), value: aviso)
        .task { store.activate(bearer: bearer); await cargar() }
        // El desglose real del día MOSTRADO — se pide cada vez que ese día cambia (por tocar un chip o por
        // deslizar de semana), nunca antes.
        .task(id: claveDeMostrado(v)) { await cargarDesgloses(idsADesglosar(v)) }
        .confirmarDeshacer($undoConfirmTarget, alConfirmar: confirmUndo)
        .confirmarBorrarLibre($deleteFreeTarget, alConfirmar: confirmDeleteFree)
        .modifier(destinos)
        .alert(PlanTextos.Muro.titulo, isPresented: $showMuro) {
            Button(PlanTextos.Muro.cerrar, role: .cancel) {}
        } message: {
            Text(base.muro ?? PlanTextos.Muro.porDefecto)
        }
    }

    private var destinos: PlanDestinos {
        PlanDestinos(
            bearer: bearer,
            workoutLaunch: $workoutLaunch, executedLaunch: $executedLaunch, freeEditAssignmentId: $freeEditAssignmentId,
            showPartnerPlan: $showPartnerPlan, showHistory: $showHistory, showCiclo: $showCiclo,
            showChat: $showChat, contextoDelChat: $contextoDelChat, techniqueTarget: $techniqueTarget,
            tarjetaParaCompartir: $tarjetaParaCompartir, showLaunchConflict: $showLaunchConflict,
            conflictSnapshotTitle: conflictSnapshotTitle,
            alCerrarEntreno: { resumeBannerRefresh += 1 },
            alCambiarElPlan: { Task { await store.planMutated(); await cargar(force: true) } },
            alRetomar: { Task { await LiveWorkoutResume.shared.recoverOnLaunch(hrZones: store.identity.value?.hrZones) } },
            alTerminarYEmpezar: {
                Task {
                    await LiveWorkoutLaunchConflict.terminateCurrentForNewStart()
                    if let pending = pendingWorkoutLaunch {
                        pendingWorkoutLaunch = nil
                        workoutLaunch = pending
                    }
                }
            },
            alPreguntarPorEntrenoPasado: { sesion, iso in preguntarPorEntrenoPasado(sesion, iso: iso) },
            alPreguntarPorEjercicio: { ejercicio, sesion in preguntarPorEjercicio(ejercicio, de: sesion) }
        )
    }

    /// La clave que dispara la carga del desglose: cambia cada vez que cambia CUÁL es el día mostrado. `.task(id:)`
    /// cancela y repite la petición sola.
    private func claveDeMostrado(_ v: VistaPlan) -> String {
        "\(offset)|\(seleccion ?? "")|\(idsADesglosar(v).joined(separator: ","))|\(marcasVersion)"
    }

    // MARK: - La pantalla

    /// Todo lo que la pantalla hace al tocarla, conectado a esta vista.
    private func acciones() -> AccionesDePlan {
        AccionesDePlan(
            alDobles: { showPartnerPlan = true },
            alCompartir: { tarjetaParaCompartir = .semana(TarjetaCompartibleBuilder.semana($0)) },
            alCiclo: { showCiclo = true },
            alHistorial: { showHistory = true },
            alChat: { showChat = true },
            alPulsarDia: { seleccion = $0.isoDate },
            alDeslizar: { $0 > 0 ? irAdelante() : irAtras() },
            alAtras: irAtras, alAdelante: irAdelante, alVolver: volver,
            alAccion: { alAccion($0) },
            alAbrir: abrir,
            menuDeSesion: { sesion, semana in AnyView(menuDeSesion(sesion, semana)) },
            menuDelDia: { dia, semana in AnyView(menuDelDia(dia, semana)) }
        )
    }

    @ViewBuilder
    private func contenido(_ l: LecturaPlan, _ v: VistaPlan) -> some View {
        PlanPantalla(l: l, v: v, acciones: acciones(), reintentando: reintentando) {
            WorkoutResumeBanner(refreshToken: resumeBannerRefresh) { _ in
                Task { await LiveWorkoutResume.shared.recoverOnLaunch(hrZones: store.identity.value?.hrZones) }
            }
        }
        // Cambiar de semana o de día: el contenido nuevo entra, no se reescribe.
        .animation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.86), value: offset)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.28), value: seleccion)
        .refreshable {
            if offset == 0 { await cargar(force: true) } else { await cargarSemana(offset: offset, force: true) }
        }
    }

    // MARK: - Semanas: hojear

    /// Adelante desde la semana que se mira: la siguiente, si hay (contenido + horizonte del club); si el club la
    /// bloquea, dice por qué. Cada salto limpia la selección de día.
    private func irAdelante() {
        let l = lecturaBase
        if l.puedeAvanzar(offset: offset) {
            Haptics.light()
            seleccion = nil
            offset += 1
            let siguiente = offset
            // Se marca ANTES de que la petición arranque: un fotograma sin marca diría «esa semana aún no tiene sesiones».
            if hojeadasResp[siguiente] == nil { cargandoOffset = siguiente }
            Task { await cargarSemana(offset: siguiente) }
        } else if l.bloqueadaPorElClub(offset: offset) {
            Haptics.light()
            showMuro = true
        }
    }

    private func irAtras() {
        guard offset > 0 else { return }
        Haptics.light()
        seleccion = nil
        offset -= 1
    }

    private func volver() {
        Haptics.light()
        seleccion = nil
        offset = 0
    }

    // MARK: - La acción anclada

    private func alAccion(_ a: AccionAnclada) {
        switch a {
        case let .empezar(sesion, _), let .verHecho(sesion, _), let .verSiguiente(sesion, _, _):
            abrir(sesion)
        case .escribirAlCoach:
            Haptics.light()
            showChat = true
        case .reintentar:
            Haptics.light()
            if offset > 0 {
                Task { await cargarSemana(offset: offset, force: true) }
            } else if !reintentando {
                reintentando = true
                Task {
                    await cargar(force: true)
                    reintentando = false
                }
            }
        case .verSemanaQueViene:
            irAdelante()
        case .volverAEstaSemana:
            volver()
        }
    }

    // MARK: - Abrir y empezar

    /// UNA puerta, con el aviso de lo que se pisaría. Tocar ROUTEA POR ESTADO: una sesión terminada (hecha o a
    /// medias) abre el detalle de lo que registraste; una pendiente abre la previa del entreno. Un solo punto de
    /// decisión, para que hecho y pendiente no se confundan.
    private func abrir(_ session: AthleteWeekDaySession) {
        guard !session.assignmentId.isEmpty else { return }
        let launch = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
        if session.estado.trabajada {
            executedLaunch = launch
        } else {
            Task { await attemptWorkoutLaunch(launch) }
        }
    }

    @MainActor
    func attemptWorkoutLaunch(_ launch: WorkoutLaunch) async {
        let saved = await WorkoutStateStore.shared.load()
        if LiveWorkoutLaunchConflict.shouldPromptStartingLive(
            hasLiveCoverOrTracked: LiveWorkoutResume.shared.hasLiveSession
        ) {
            conflictSnapshotTitle = saved?.plan.name ?? launch.title
            pendingWorkoutLaunch = launch
            showLaunchConflict = true
        } else {
            workoutLaunch = launch
        }
    }

    // MARK: - Carga (cache-first + SWR, como el resto de la app)

    func cargar(force: Bool = false) async {
        guard bearer != nil else {
            cargando = false
            falloDeCarga = true
            return
        }
        // 1. Lo que ya está en memoria se pinta YA: cambiar de pestaña no gira.
        if store.planWeek.value != nil { cargando = false }
        // 2. Se revalida en segundo plano (semana + macro + pareja).
        await store.loadPlanScreen(force: force)
        // Sin semana pero con la carga hecha: el atleta no tiene plan (vacío), no un error.
        falloDeCarga = store.planWeek.value == nil && !store.planWeek.hasLoaded
        cargando = false
        // Las semanas hojeadas se piden otra vez si el plan cambió: lo mutado puede haberlas movido.
        if force, offset > 0 { await cargarSemana(offset: offset, force: true) }
    }

    private func cargarSemana(offset o: Int, force: Bool = false) async {
        guard let token = bearer else {
            falloOffset.insert(o)
            return
        }
        if hojeadasResp[o] != nil, !force { return }
        cargandoOffset = o
        do {
            let resp = try await PlanService.fetchWeek(bearer: token, weekOffset: o)
            hojeadasResp[o] = resp
            if let v = resp.planVisibility { visibilidadHojeada = v }
            falloOffset.remove(o)
        } catch {
            if hojeadasResp[o] == nil { falloOffset.insert(o) }
        }
        cargandoOffset = nil
    }

    // MARK: - El desglose del día MOSTRADO

    /// El desglose REAL de lo que la card enseña AHORA — sus bloques, su cabecera de formato y, si está hecha, sus
    /// minutos medidos. El resumen de fila (`shortPrescription`) es una frase y no basta para la card, sea el día
    /// que sea (Alex, 7-ago: «no me la enseñes vacía»).
    private func cargarDesgloses(_ ids: [String]) async {
        guard let token = bearer else { return }
        for id in ids {
            // La caché local repinta al instante; la red confirma después.
            if let cache = AssignmentDetailCache.load(id) {
                desgloses[id] = .listo(DesgloseSesion.desde(cache))
            } else if desgloses[id] == nil {
                desgloses[id] = .cargando
            }
            do {
                let detalle = try await PlanService.fetchAssignmentDetail(id, bearer: token)
                AssignmentDetailCache.save(detalle)
                desgloses[id] = .listo(DesgloseSesion.desde(detalle))
            } catch {
                // Si el día cambió a mitad de la petición no es un fallo: es que ya no se necesita.
                if !Task.isCancelled, desgloses[id] == .cargando { desgloses[id] = .sinDetalle }
            }
        }
    }
}

#if DEBUG
#Preview {
    PlanView()
        .environment(AppDataStore())
}
#endif
