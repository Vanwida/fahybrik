import SwiftUI

// LA PESTAÑA INICIO — «Hoy · El día».
//
// Una portada que cambia de sujeto a lo largo del día: el atleta no la abre para ver el mismo panel
// siempre, la abre para saber qué le toca AHORA (el check-in, la sesión, «retoma tu entreno», «hecho hoy»,
// el descanso, el primer día). Cuál es lo decide `LecturaHoy.momento` con una precedencia fija y probada;
// las piezas (`Today/Hoy/`) solo pintan. Esta vista es lo único que conoce el `AppDataStore`: traduce lo
// que la app YA lee a una `LecturaHoy` (`LecturaHoy.desde`) y dice adónde lleva cada toque (`HoyAcciones`).
//
// UNA SOLA PESTAÑA para los dos tiers. Con coach es la portada del día; sin coach (`AuthState.hasCoach`
// falso) es la MISMA con la lectura `conCoach: false`: el sujeto natural es «Monta tu entreno de hoy» y
// ninguna pieza de coach se pinta, ni vacía. La semana navegable del atleta libre no se pierde: vive en
// su pestaña Plan (`SemanaAtletaOperativa`).
//
// Reglas que conserva (docs/DECISIONS.md):
//  · 6-ago: el PLAN es la única puerta que EMPIEZA un entreno. Hoy dice el estado y lleva al Plan; nunca
//    lanza el motor de la sesión del coach. (Retomar lo guardado y montar uno libre son lo que ya vivía
//    aquí y no es «empezar la sesión del coach».)
//  · 29-sep: el PROGRESO vive en Analíticas. Hoy deja UNA marca reciente.
//  · El entreno minimizado en marcha lo lleva la barra del sistema sobre las pestañas.
//
// Además de pintar, esta pestaña empuja el entreno de hoy al reloj (`HoyRelojPush`).
struct InicioView: View {
    /// Sesión viva, la de AppShell (única fuente de verdad).
    var bearer: String? = nil
    /// Cambia de pestaña.
    var onOpenTab: ((AppTab) -> Void)? = nil

    @Environment(AppDataStore.self) private var store
    @Environment(AuthState.self) private var auth
    @Environment(\.openChat) private var openChat
    @Environment(\.openCoachInbox) private var openCoachInbox
    @Environment(\.openURL) private var openURL

    @State private var modelo = HoyModelo()
    @State private var revelado = false
    /// Sube cuando una sesión se acaba de marcar hecha en local: el reloj y «Hecho hoy» se repintan desde
    /// `CompletedAssignmentsStore` sin esperar a `/plan/week`.
    @State private var revisionDeMarcas = 0

    // El check-in
    @State private var checkinPendiente = CheckinStore.isPending()
    @State private var cierreDelCheckin: CierreDelCheckin?
    @State private var aviso: AvisoDia.Contenido?

    // Lo que se levanta desde Hoy
    @State private var mostrarConstructor = false
    @State private var mostrarTests = false
    @State private var mostrarDisposicion = false
    @State private var mostrarBuscarCarrera = false
    @State private var mostrarCheckin = false
    @State private var mostrarNota = false
    @State private var mostrarHuecoDeRevision = false
    @State private var mostrarMarcas = false
    @State private var mostrarConflicto = false
    @State private var tituloEnConflicto: String?

    private var hrZones: HRZoneProfile? { store.identity.value?.hrZones }

    private var pareja: PartnerInfo? {
        let sobre = store.partner.value
        return sobre?.isDoublesPair == true ? sobre?.partner : nil
    }

    // MARK: - De la app a la lectura

    private var fuentes: FuentesHoy {
        FuentesHoy(
            conCoach: auth.hasCoach,
            identidad: store.identity.value,
            plan: store.planWeek.value,
            planCargado: store.planWeek.hasLoaded,
            planFallo: store.planWeek.loadFailed,
            macro: store.macroProgress.value,
            disposicion: store.readiness.value,
            disposicionCargada: store.readiness.hasLoaded,
            analisisDeCarrera: store.runningAnalysis.value,
            analisisCargado: store.runningAnalysis.hasLoaded,
            noLeidosChat: store.unreadCount,
            comunicadosPendientes: store.comunicadosPendientes,
            carrerasProximas: store.racesHub.value?.upcoming ?? [],
            checkinPendiente: checkinPendiente,
            saludConectada: HealthKitConnection.isConnected,
            pasos: modelo.pasos,
            guardado: modelo.guardadoOfrecido(hayEntrenoVivo: LiveWorkoutResume.shared.hasLiveSession),
            bateria: modelo.bateria,
            revision: modelo.revision,
            revisionReservada: modelo.revisionReservada,
            parejaEnVivo: modelo.parejaEnVivo
        )
    }

    // MARK: - Cuerpo

    var body: some View {
        let lectura = LecturaHoy.desde(fuentes)
        let reloj = HoyRelojPush(store: store, bearer: bearer, revisionDeMarcas: revisionDeMarcas)
        let acciones = self.acciones

        // Su propia pila de navegación para que «¿Te pruebas?» empuje la biblioteca de marcas dentro de la
        // pestaña (AppShell aloja cada raíz sin pila compartida).
        let pantalla = NavigationStack {
            VStack(spacing: 0) {
                HoyCromo(lectura: lectura, acciones: acciones)
                FillingScreen {
                    HoyCuerpo(
                        lectura: lectura,
                        acciones: acciones,
                        cierreDelCheckin: cierreDelCheckin,
                        hayNotaEnElCheckin: !CheckinStore.loadDraftNotes().isEmpty,
                        pareja: pareja,
                        entrenoMinimizado: LiveWorkoutResume.shared.minimized,
                        revelado: revelado
                    )
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.xs + 2)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
                .refreshable { await refrescar() }
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $mostrarMarcas) {
                MarksLibraryView(bearer: bearer, hrZones: hrZones)
            }
        }

        presentaciones(pantalla, lectura: lectura)
        .avisoDia($aviso)
        .onAppear {
            checkinPendiente = CheckinStore.isPending()
            revelado = false
            DispatchQueue.main.async { revelado = true }
            Task { await modelo.cargarGuardado() }
        }
        .task(id: bearer) {
            store.activate(bearer: bearer)
            // Lo de Hoy y lo del store en paralelo: la batería o los pasos no esperan al plan.
            async let casa: Void = store.loadHome()
            async let propio: Void = modelo.cargarTodo(
                bearer: bearer, conCoach: auth.hasCoach, esPareja: pareja != nil
            )
            _ = await (casa, propio)
            // Primer empuje al reloj cuando lo de casa se ha asentado. Los siguientes van por el
            // `onChange` de la firma, sin llamadas por mutación.
            if auth.hasCoach {
                HoyRelojPush(store: store, bearer: bearer, revisionDeMarcas: revisionDeMarcas).empujar()
            }
            // En un arranque en frío la pareja solo se conoce tras cargar: un fetch más, solo para un par.
            if pareja != nil, modelo.parejaEnVivo == nil {
                await modelo.cargarParejaEnVivo(bearer: bearer, esPareja: true)
            }
        }
        .onChange(of: reloj.firma) { _, _ in
            // El cuello de botella único del reloj: cualquier cambio de plan o disposición que altere lo que
            // mandaríamos cambia la firma y se vuelve a empujar hoy. Solo con coach: el atleta libre no
            // tiene un «hoy» del plan que llevar a la muñeca (como hasta ahora).
            if auth.hasCoach { reloj.empujar() }
        }
    }

    // MARK: - Refrescar

    /// Tirar para refrescar: todo lo que Hoy pinta, saltándose la ventana de frescura del store.
    private func refrescar() async {
        await store.loadHome(force: true)
        await modelo.cargarTodo(bearer: bearer, conCoach: auth.hasCoach, esPareja: pareja != nil)
        checkinPendiente = CheckinStore.isPending()
        revisionDeMarcas += 1
    }

    // MARK: - Adónde lleva cada toque

    private var acciones: HoyAcciones {
        HoyAcciones(
            abrirPestana: { pestana in
                Haptics.light()
                onOpenTab?(pestana)
            },
            abrirPlan: {
                Haptics.light()
                onOpenTab?(.plan)
            },
            abrirChat: {
                Haptics.light()
                openChat(nil)
            },
            abrirComunicados: {
                Haptics.light()
                openCoachInbox(nil)
            },
            retomarEntreno: {
                Haptics.medium()
                Task { await LiveWorkoutResume.shared.recoverOnLaunch(hrZones: hrZones) }
            },
            crearEntrenoLibre: {
                Haptics.medium()
                Task { await intentarAbrirElConstructor() }
            },
            abrirTests: {
                Haptics.light()
                mostrarTests = true
            },
            abrirMarcas: {
                Haptics.light()
                mostrarMarcas = true
            },
            abrirDisposicion: {
                Haptics.light()
                mostrarDisposicion = store.readiness.value != nil
            },
            buscarCarrera: {
                Haptics.light()
                mostrarBuscarCarrera = true
            },
            elegirHuecoDeLaRevision: {
                Haptics.medium()
                mostrarHuecoDeRevision = true
            },
            unirseALaRevision: { enlace in
                Haptics.medium()
                openURL(enlace)
            },
            hacerCheckin: {
                Haptics.light()
                mostrarCheckin = true
            },
            checkinCerrado: { cerrarCheckin($0) },
            anadirNotaAlCheckin: { mostrarNota = true },
            checkinSincronizado: {
                // Un check-in cambia la disposición, pero solo DESPUÉS de que el servidor lo ingiera:
                // releer al enviar competía con el POST y traía la cifra vieja.
                await store.refreshReadiness(force: true)
            },
            bearer: bearer,
            reintentarCarga: { await store.loadHome(force: true) }
        )
    }

    /// El check-in se cerró (dentro del sujeto o en la hoja larga): se da por resuelto en el dispositivo y
    /// se avisa. La cifra tarda unos segundos en llegar, y la portada lo dice.
    private func cerrarCheckin(_ como: CierreDelCheckin) {
        checkinPendiente = false
        cierreDelCheckin = como
        aviso = AvisoDia.Contenido(
            tono: .ok,
            texto: como == .hecho
                ? "Check-in guardado. Tu cifra se actualiza en unos segundos."
                : "Sin check-in hoy. Puedes hacerlo mañana."
        )
    }

    // MARK: - El constructor de entreno libre

    /// Un entreno vivo (o minimizado) y el atleta pide montar otro: se le pregunta si sigue o termina.
    @MainActor
    private func intentarAbrirElConstructor() async {
        let guardado = await WorkoutStateStore.shared.load()
        if LiveWorkoutLaunchConflict.shouldPromptStartingLive(
            hasLiveCoverOrTracked: LiveWorkoutResume.shared.hasLiveSession
        ) {
            tituloEnConflicto = guardado?.freeTitle ?? guardado?.plan.name
            mostrarConflicto = true
        } else {
            mostrarConstructor = true
        }
    }

    private var tieneSesionHoy: Bool {
        guard let plan = store.planWeek.value else { return false }
        return !LeerHoy.sesionesReales(plan).isEmpty
    }

    // MARK: - Presentaciones

    /// Las hojas y los covers que levanta Hoy, aparte del cuerpo para que ni el cuerpo ni el compilador
    /// carguen con once modificadores encadenados.
    private func presentaciones(_ contenido: some View, lectura: LecturaHoy) -> some View {
        contenido
            // El constructor: P1 → constructor → motor de siempre → guardado libre. Al terminar se refresca
            // el plan para que la sesión nueva aparezca como «Libre».
            .fullScreenCover(isPresented: $mostrarConstructor, onDismiss: {
                Task { await modelo.cargarGuardado() }
            }) {
                FreeWorkoutBuilderView(
                    bearer: bearer,
                    hrZones: hrZones,
                    onClose: { mostrarConstructor = false },
                    onCompleted: {
                        revisionDeMarcas += 1
                        Task { await store.loadHome(force: true) }
                    }
                )
            }
            // El hub de tests: lo que pase dentro (un test, un resultado capturado) lo relee la fila.
            .fullScreenCover(isPresented: $mostrarTests, onDismiss: {
                Task { await modelo.cargarBateria(bearer: bearer) }
            }) {
                TestsHubView(
                    bearer: bearer,
                    hrZones: hrZones,
                    onClose: { mostrarTests = false },
                    onSessionCompleted: {
                        Task {
                            await modelo.cargarBateria(bearer: bearer)
                            await store.planMutated()
                        }
                    }
                )
            }
            .liveWorkoutLaunchConflict(
                isPresented: $mostrarConflicto,
                snapshotTitle: tituloEnConflicto,
                onResume: {
                    Task { await LiveWorkoutResume.shared.recoverOnLaunch(hrZones: hrZones) }
                },
                onEndAndStart: {
                    Task {
                        await LiveWorkoutLaunchConflict.terminateCurrentForNewStart()
                        mostrarConstructor = true
                    }
                }
            )
            // La hoja larga del check-in: la salida cuando el check-in NO es el sujeto (plan en pausa, sin
            // coach, error de carga…). Guarda y envía por el mismo camino que el paso a paso.
            .sheet(isPresented: $mostrarCheckin) {
                CheckinView(
                    bearer: bearer,
                    onSubmitted: { _, _ in
                        mostrarCheckin = false
                        cerrarCheckin(.hecho)
                    },
                    onSkipped: {
                        mostrarCheckin = false
                        cerrarCheckin(.saltado)
                    },
                    onServerSynced: { await store.refreshReadiness(force: true) }
                )
            }
            .sheet(isPresented: $mostrarNota) { HoyNotaCheckin() }
            .sheet(isPresented: $mostrarBuscarCarrera) {
                BuscarCarreraSheet(bearer: bearer) {
                    // Se fijó un objetivo: se refresca el plan y aparece el ancla.
                    Task { await store.planMutated() }
                }
            }
            .sheet(isPresented: $mostrarHuecoDeRevision) {
                ReviewSlotPickerSheet(bearer: bearer, coachFirstName: lectura.coach) { resultado in
                    // Reservada: la fila pasa a «Próxima sesión» sin esperar otra carga.
                    withAnimation(Theme.Motion.reveal) { modelo.revisionReservada(resultado.appointment) }
                }
            }
            .sheet(isPresented: $mostrarDisposicion) {
                // El payload se lee EN VIVO del store: un check-in hecho dentro de la hoja (que refresca la
                // disposición) actualiza las filas sin reabrirla.
                if let disposicion = store.readiness.value {
                    ReadinessDetailSheet(
                        payload: disposicion,
                        hasSessionToday: tieneSesionHoy,
                        checkinDone: !checkinPendiente,
                        bearer: bearer,
                        onCheckinSubmitted: { checkinPendiente = false },
                        onCheckinServerSynced: { await store.refreshReadiness(force: true) }
                    )
                }
            }
    }
}
