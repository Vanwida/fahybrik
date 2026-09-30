import SwiftUI

// LA PESTAÑA «PERFIL» — el atleta: su identidad, sus cinco cifras, lo que espera una respuesta suya y,
// al fondo, los ajustes.
//
// Esta vista NO decide qué se ve: LEE el store (identidad, pareja, suscripción, 1RM), pide lo suyo
// (batería, marcas, VO₂, wearables), traduce todo a una `LecturaPerfil` y se la da a
// `PerfilContenido`, que solo pinta. La decisión del sujeto, de «Pendiente», de las puertas y de las
// cinco filas es de `DecidePerfil` y `RendimientoEstados`, con sus tests. Aquí viven la NAVEGACIÓN,
// las HOJAS y las ACCIONES (que llaman al servidor y luego piden al store que se reconcilie).
//
// El store es cache-first (SWR): la pestaña se pinta al instante desde memoria o disco y revalida en
// silencio; solo una primera carga sin nada muestra esqueleto, y un fallo sin nada guardado se dice
// (con «Reintentar»), no se disfraza de vacío. Lo mismo vale por cifra: una fuente que falla dice que
// falló, y un fallo al REFRESCAR no pisa la cifra buena que ya estaba.
//
// Las pantallas que cuelgan (Identidad, Entreno, Dispositivos y apps, Cuenta, Privacidad, Ayuda y
// legal y las de cada cifra) siguen siendo las de siempre: aquí solo está su puerta. Cerrar sesión
// sale por el `onSignOut` que da `AppRoot`.

/// Las hojas que se pueden abrir sobre la pestaña.
private enum HojaPerfil: String, Identifiable {
    case editar
    /// La hoja de la foto de perfil: elegirla, verla antes de confirmarla y quitarla.
    case foto
    /// «Diagnóstico del reloj» (fase 0): siete toques en la versión.
    case diagnostico
    /// Invitar a la pareja de Dobles.
    case invitarPareja

    var id: String { rawValue }
}

struct ProfileView: View {
    let bearer: String?
    /// FREE tier switch (athlete without coach). False hides every coach-owned surface: la
    /// suscripción (nothing to pay by design), la batería de tests y las zonas (coach-calibrated) y
    /// la metodología — and reframes injuries + legal copy to the athlete alone.
    var hasCoach: Bool = true
    let onSignOut: () -> Void

    // App appearance lives in ProfileCuentaView (@AppStorage ThemeMode).

    // ── Shared data: read live from the injected AppDataStore (cache-first/SWR) ──
    // Identity, partner, subscription, strength maxes and the coach name come from the store, so
    // opening Perfil renders instantly from memory — no redaction flash, no re-fetch on a tab
    // switch; the store revalidates in the background.
    @Environment(AppDataStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Navegación, hojas y avisos.
    @State private var camino: [DestinoPerfil] = []
    @State private var hoja: HojaPerfil?
    @State private var aviso: AvisoDia.Contenido?
    @State private var aparece = false

    // Upcoming races — the SAME source the Carreras tab reads (GET /api/athlete/races → upcoming).
    // Used ONLY to derive the athlete's competition division for the identity subtitle
    // (`objetivoRace`); the race objective itself lives in the Carreras tab, not in Perfil. Kept as a
    // local fetch — Perfil-only, not a cross-tab slice.
    @State private var proximas: [UpcomingRace] = []

    // Las tres fuentes que Perfil pide por su cuenta, cada una con su «ya contestó»: «no hay dato»,
    // «todavía no lo sé» y «no pudimos cargarlo» son tres cosas distintas.
    @State private var bateria: FuenteDelDato<BatteryStatus?> = .cargando
    @State private var marcas: FuenteDelDato<[MarkView]> = .cargando
    @State private var vo2: FuenteDelDato<AthleteVo2Max?> = .cargando

    // Lo que ya se lee y se guarda para las puertas: los wearables (una sola lectura, que también
    // trae la pregunta de COROS) y lo que el propio móvil sabe, sin red.
    @State private var polarConectado = false
    @State private var corosConectado = false
    // COROS «¿esto es el entreno?» — sigue apareciendo al abrir Perfil aunque la conexión viva en
    // Dispositivos y apps; ahora dentro de «Pendiente» y no como diálogo del sistema.
    @State private var corosPendiente: WearablePendingLink?
    @State private var respondiendoCoros = false
    @State private var saludConectado = HealthKitConnection.isConnected
    @State private var consentimiento = SensorCaptureConsent.state

    // MARK: La lectura

    private var identity: AthleteIdentity? { store.identity.value }

    /// Coach display name from the week payload (agnostic, multi-coach). Nil when unset /
    /// whitespace-only so callers fall back cleanly.
    private var coachName: String? {
        let n = store.planWeek.value?.coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (n?.isEmpty == false) ? n : nil
    }

    private var objetivoRace: UpcomingRace? {
        proximas.first { $0.priority?.lowercased() == "target" } ?? proximas.first
    }

    private var lectura: LecturaPerfil {
        LecturaPerfil.desde(
            LoLeidoPerfil(
                identidad: store.identity,
                division: AthleteNextRace.divisionLabel(objetivoRace?.division),
                conCoach: hasCoach,
                coach: coachName,
                bateria: bateria,
                marcas: marcas,
                vo2: vo2,
                fuerza: store.strengthMaxes,
                pareja: store.partner,
                suscripcion: store.subscription,
                saludConectado: saludConectado,
                relojActivo: AppleWatchWorkoutScheduler.shared.isEnabled,
                polarConectado: polarConectado,
                corosConectado: corosConectado,
                corosPendiente: corosPendiente,
                consentimiento: consentimiento,
                version: AppBundleMetadata.displayVersion
            )
        )
    }

    // MARK: Cuerpo

    var body: some View {
        // Su propia NavigationStack: las pantallas que cuelgan se empujan DENTRO de la pestaña. La barra
        // va oculta: la pantalla dibuja su propio sujeto, como las demás.
        NavigationStack(path: $camino) {
            FillingScreen {
                PerfilContenido(lectura: lectura, respondiendoCoros: respondiendoCoros, callbacks: callbacks)
                    .staggerReveal(aparece, index: 1)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationBarHidden(true)
            // El título no se ve (la pestaña dibuja su propio sujeto), pero es lo que el sistema escribe en el
            // «‹» de las pantallas que cuelgan: sin él dirían «Atrás».
            .navigationTitle("Perfil")
            .navigationDestination(for: DestinoPerfil.self, destination: destino)
            .onAppear {
                leerLocal()
                // Con Reducir movimiento la pestaña entra ya puesta.
                if reduceMotion {
                    var t = Transaction()
                    t.disablesAnimations = true
                    withTransaction(t) { aparece = true }
                } else {
                    aparece = true
                }
            }
        }
        .avisoDia($aviso)
        .task(id: bearer) { await abrir() }
        .sheet(item: $hoja, content: contenidoDeHoja)
        .onChange(of: scenePhase) { _, fase in
            guard fase == .active else { return }
            leerLocal()
            Task { await refrescarWearables(sincronizar: true) }
        }
        .onChange(of: camino) { anterior, actual in
            // De vuelta en la raíz: lo que se hizo dentro (conectar un reloj, hacer un test, cambiar el
            // permiso del movimiento) tiene que verse ya en las cifras y en el estado de las puertas.
            guard actual.isEmpty, !anterior.isEmpty else { return }
            leerLocal()
            Task { await alVolverALaRaiz() }
        }
    }

    // MARK: Las manos del cuerpo

    private var callbacks: CallbacksPerfil {
        CallbacksPerfil(
            alEditar: { hoja = .editar },
            alFoto: { hoja = .foto },
            alReintentarPerfil: { await recargarTodo() },
            alAbrir: { camino.append($0) },
            alReintentarCifra: { reintentar($0) },
            alReintentarCifras: { Task { await recargarTodo() } },
            alResponderCoros: { respuesta in Task { await responderCoros(respuesta) } },
            alInvitarPareja: { hoja = .invitarPareja },
            alCerrarSesion: onSignOut,
            alDiagnostico: { hoja = .diagnostico }
        )
    }

    // MARK: Destinos y hojas

    @ViewBuilder
    private func destino(_ d: DestinoPerfil) -> some View {
        switch d {
        case .puerta(.identidad):
            ProfileIdentidadView(bearer: bearer, hasCoach: hasCoach)
        case .puerta(.entreno):
            ProfileEntrenoView(bearer: bearer, hasCoach: hasCoach, coachName: coachName)
        case .puerta(.dispositivos):
            DeviceConnectionsView(bearer: bearer)
        case .puerta(.cuenta):
            ProfileCuentaView(
                bearer: bearer,
                hasCoach: hasCoach,
                coachName: coachName,
                partnerName: store.partner.value?.partner?.firstName,
                onSignOut: onSignOut
            )
        case .puerta(.privacidad):
            ProfilePrivacidadView(bearer: bearer)
        case .puerta(.ayuda):
            ProfileAyudaLegalView(bearer: bearer, hasCoach: hasCoach)
        case .cifra(.tests):
            TestsHubView(bearer: bearer, hrZones: identity?.hrZones, onSessionCompleted: { Task { await store.planMutated() } })
        case .cifra(.marcas):
            MarksLibraryView(bearer: bearer, hrZones: identity?.hrZones)
        case .cifra(.vo2):
            Vo2MaxView(bearer: bearer, hrZones: identity?.hrZones)
        case .cifra(.zonas):
            MyZonesView(bearer: bearer)
        case .cifra(.fuerza):
            MyStrengthView(bearer: bearer, hasCoach: hasCoach)
        case .suscripcion:
            SubscriptionView(bearer: bearer)
        }
    }

    @ViewBuilder
    private func contenidoDeHoja(_ h: HojaPerfil) -> some View {
        switch h {
        case .editar:
            EditProfileView(bearer: bearer, identity: identity) { updated in
                store.setIdentity(updated)
            }
        case .foto:
            FotoPerfilSheet(
                bearer: bearer,
                iniciales: identity?.initials ?? "",
                fotoActual: identity?.avatarURLResuelta
            ) { actualizada in
                store.setIdentity(actualizada)
            }
        case .diagnostico:
            DiagnosticoRelojView(bearer: bearer)
        case .invitarPareja:
            PartnerInviteSheet(bearer: bearer) { _ in
                Task { await store.refreshPartner(force: true) }
            }
        }
    }

    // MARK: Carga

    /// Lo que se hace al abrir Perfil: el store se reconcilia en segundo plano, y las cifras y los
    /// wearables se piden a la vez (una que tarde no retrasa a las demás).
    private func abrir() async {
        store.activate(bearer: bearer)
        HealthKitSyncService.shared.onAuthorizationDenied = {
            UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        }
        async let perfil: Void = store.loadProfile()
        async let carreras: Void = cargarCarreras()
        async let cifras: Void = cargarCifras()
        async let wearables: Void = refrescarWearables(sincronizar: true)
        _ = await (perfil, carreras, cifras, wearables)
        if HealthKitConnection.isConnected {
            let importer = HealthKitHistoryImporter.shared
            importer.rebind(athleteId: AuthState.persistedAthleteId())
            importer.consentAndStart()
        }
    }

    /// De vuelta en la raíz tras una pantalla que cuelga: el store, las cifras y los wearables (sin
    /// volver a sincronizar COROS: eso es de abrir la app, no de volver de una pantalla).
    private func alVolverALaRaiz() async {
        async let perfil: Void = store.loadProfile()
        async let cifras: Void = cargarCifras()
        async let wearables: Void = refrescarWearables(sincronizar: false)
        _ = await (perfil, cifras, wearables)
    }

    /// Lo que el móvil sabe sin preguntar a nadie: Apple Salud y el permiso del movimiento del reloj.
    private func leerLocal() {
        saludConectado = HealthKitConnection.isConnected
        consentimiento = SensorCaptureConsent.state
    }

    private func cargarCarreras() async {
        guard let bearer else { return }
        if let races = await CarrerasService.fetchRaces(bearer: bearer) {
            proximas = races.upcoming
        }
    }

    /// «Reintentar» del sujeto o de la frase de sin red: todo lo del perfil, a la fuerza.
    private func recargarTodo() async {
        bateria = bateria.alReintentar
        marcas = marcas.alReintentar
        vo2 = vo2.alReintentar
        async let perfil: Void = store.loadProfile(force: true)
        async let cifras: Void = cargarCifras()
        async let carreras: Void = cargarCarreras()
        _ = await (perfil, cifras, carreras)
    }

    /// «Reintentar» de UNA cifra: solo esa fuente vuelve a esqueleto y a pedirse.
    private func reintentar(_ clave: FilaRendimiento.Clave) {
        switch clave {
        case .tests:
            bateria = .cargando
            Task { await cargarBateria() }
        case .marcas:
            marcas = .cargando
            Task { await cargarMarcas() }
        case .vo2:
            vo2 = .cargando
            Task { await cargarVo2() }
        case .zonas:
            // Viajan con la identidad.
            Task { await store.refreshIdentity(force: true) }
        case .fuerza:
            Task { await store.refreshStrengthMaxes(force: true) }
        }
    }

    // MARK: Las tres fuentes de Rendimiento
    //
    // A la vez y tolerante por fuente: que falle el VO₂ no puede dejar sin cifra a las marcas. Y un
    // fallo NO se toma por «no hay nada»: pintaría «Aún no hay marcas que probar» a un atleta con nueve
    // récords, y eso no es un estado vacío, es la app mintiendo (§7). Sin respuesta la cifra lo dice y
    // se puede reintentar, y un fallo al refrescar no pisa la cifra buena que ya estaba.

    private func cargarCifras() async {
        async let b: Void = cargarBateria()
        async let m: Void = cargarMarcas()
        async let v: Void = cargarVo2()
        _ = await (b, m, v)
    }

    private func cargarBateria() async {
        // Sin coach la batería ni se pide: no hay nada que preguntar.
        guard hasCoach else { bateria = .contesto(nil); return }
        guard let bearer else { return }
        let respuesta: FuenteDelDato<BatteryStatus?>
        do { respuesta = .contesto(try await TestBatteryService.fetchStatus(bearer: bearer)) } catch { respuesta = .sinRespuesta }
        bateria = bateria.trasPedir(respuesta)
    }

    private func cargarMarcas() async {
        guard let bearer else { return }
        let respuesta: FuenteDelDato<[MarkView]>
        do { respuesta = .contesto(try await MarksService.fetchMarks(bearer: bearer).marks) } catch { respuesta = .sinRespuesta }
        marcas = marcas.trasPedir(respuesta)
    }

    private func cargarVo2() async {
        guard let bearer else { return }
        // `fetch` devuelve nil cuando NADIE lo ha medido: esa es una respuesta, y la cifra la convierte
        // en su invitación. Lo que no es respuesta es el `throw`. (`try?` lo confundía: aplana el
        // opcional y un «nadie lo ha medido» acababa como «no contestó», con el esqueleto para siempre.)
        let respuesta: FuenteDelDato<AthleteVo2Max?>
        do { respuesta = .contesto(try await Vo2MaxService.fetch(bearer: bearer)) } catch { respuesta = .sinRespuesta }
        vo2 = vo2.trasPedir(respuesta)
    }

    // MARK: COROS y los wearables

    /// Lee lo que dicen los proveedores y, al abrir la app o Perfil (`sincronizar`), trae los entrenos
    /// de COROS. Una sola lectura de `wearables` alimenta el estado de la puerta Dispositivos, la
    /// pregunta «¿esto es el entreno?» y la sincronización; de vuelta de una pantalla se lee sin volver
    /// a sincronizar ni tocar la pregunta (un «Ahora no» dura hasta la próxima vez que se abre).
    private func refrescarWearables(sincronizar: Bool) async {
        guard let bearer else { return }
        guard let estado = try? await WearablesService.fetch(bearer: bearer) else { return }
        polarConectado = estado.providers.first { $0.provider == WearablesService.polar }?.connected ?? false
        let coros = estado.providers.first { $0.provider == WearablesService.coros }?.connected ?? false
        corosConectado = coros
        guard sincronizar else { return }
        guard coros else {
            // Sin conectar solo puede quedar una pregunta que el servidor conserva hasta contestarse.
            if let pregunta = DecidePerfil.preguntaPendiente(estado) { corosPendiente = pregunta }
            return
        }
        do {
            let respuesta = try await WearablesService.corosSync(bearer: bearer)
            switch DecidePerfil.resultado(sincronizacion: respuesta) {
            case let .pregunta(enlace):
                corosPendiente = enlace
            case let .aviso(contenido):
                corosPendiente = nil
                aviso = AvisoDia.Contenido(contenido)
            case .nada:
                corosPendiente = nil
            }
        } catch {
            aviso = AvisoDia.Contenido(DecidePerfil.aviso(falloDeSincronizacion: error))
        }
    }

    /// Lo que contesta el atleta a «¿Esto es el entreno?». «Ahora no» no toca el servidor: la pregunta
    /// se queda allí y se vuelve a hacer al abrir Perfil. Si no se puede guardar «Sí» o «No», la fila se
    /// queda para poder repetirlo.
    private func responderCoros(_ respuesta: RespuestaCoros) async {
        guard !respondiendoCoros else { return }
        if respuesta == .ahoraNo {
            corosPendiente = nil
            aviso = .init(tono: .ok, texto: TextosPerfil.avisoDeRespuesta(.ahoraNo))
            return
        }
        guard let bearer, let enlace = corosPendiente else { return }
        respondiendoCoros = true
        defer { respondiendoCoros = false }
        do {
            try await WearablesService.corosConfirm(bearer: bearer, confirmationId: enlace.confirmationId, yes: respuesta == .si)
            corosPendiente = nil
            Haptics.success()
            aviso = .init(tono: .ok, texto: TextosPerfil.avisoDeRespuesta(respuesta))
            // «Sí» vincula la actividad al entreno de hoy: el plan tiene que enterarse ya.
            if respuesta == .si { await store.planMutated() }
        } catch {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: TextosPerfil.fallaLaRespuestaDeCoros)
        }
    }
}

extension AvisoDia.Contenido {
    /// De lo que decide `DecidePerfil` tras hablar con COROS al aviso que se pinta.
    init(_ aviso: AvisoCoros) {
        self.init(tono: aviso.tono == .ok ? .ok : .fallo, texto: aviso.texto)
    }
}
