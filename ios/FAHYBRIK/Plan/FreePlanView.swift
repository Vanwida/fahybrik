import SwiftUI

// PLAN (LIBRE) — la pestaña del atleta SIN coach, hecha la superficie de conversión del tier libre
// (docs/design/free-plan-conversion-mockup.html) y, desde el 29-sep, con el lenguaje de «El día».
//
// LA REGLA QUE LA MANTIENE ALEJADA DE UN ANUNCIO: el tier libre MIDE y COMPARA; el de pago DECIDE. Esta pantalla
// tiene que valer la pena aunque el atleta no pague nunca, así que todo lo que enseña son datos SUYOS. Un número
// que no existe no se pinta, y lo que falta se dice en voz alta.
//
// Dos estados, un mismo juego de tarjetas (lo decide `LecturaLibre.tieneEvidencia`):
//   · SIN EVIDENCIA (ninguna marca medida, ninguna carrera importada) — aquí no se vende nada. Primero lo que le
//     DAMOS (su VO₂ máx del reloj, si existe), luego lo que le PEDIMOS: traer su historial de HYROX en un toque o
//     medirse las tres de arranque. Vender antes de tener un diagnóstico es cuando se le ve el plumero al vendedor.
//   · CON EVIDENCIA — primero lo que sus carreras YA demuestran, luego su objetivo contra esa realidad, la semana
//     que esos números compran, y solo después lo que aún falta y la persona que lo convierte en plan.
//
// LO QUE SUS CARRERAS DEMUESTRAN Y LO QUE NO: en dobles los dos corren los 8 km y pasan por todas las
// transiciones, así que correr y roxzone SÍ son suyos. Las estaciones se reparten entre los dos, así que NO se le
// atribuyen nunca. Eso lo decide el servidor (`shared/domain/free-plan`); aquí solo se pinta lo que llega.
//
// Quién decide qué: la vista no decide. `LecturaLibre.desde` traduce lo que la app YA lee, `PlanLibreCopy` escribe
// cada frase, y `PlanLibreColumna`/`PlanLibreAnclaje` pintan. Aquí viven la carga y las presentaciones.

struct FreePlanView: View {
    /// Sesión viva, que pasa `AppShell` (única fuente de verdad).
    var bearer: String? = nil

    @Environment(AppDataStore.self) private var store
    @Environment(\.openURL) private var openURL

    /// El catálogo de «Probarme» + sus resultados (`GET /api/athlete/marks`). Se carga aquí (no es una rebanada del
    /// `AppDataStore`) y decide la bifurcación entera del estado, así que la pantalla lo espera para pintarse.
    @State private var marks: [MarkView] = []
    @State private var marksLoaded = false
    @State private var marksFailed = false
    /// Su VO₂ máx del reloj (`GET /api/athlete/biometrics/trend`). Nil siempre que el backend no tenga una serie real
    /// reciente: entonces no se pinta nada.
    @State private var vo2: BiometricMetricSeries? = nil
    /// El retrato calculado (`GET /api/athlete/free-plan`): lo que sus carreras prueban, su objetivo contra ellas y
    /// la semana que esos números compran. Nil mientras carga o cuando el servidor no tenía nada que calcular.
    @State private var freePlan: FreePlanPayload? = nil

    @State private var ruta: [RutaLibre] = []
    @State private var showImport = false
    @State private var showBuscarCarrera = false
    @State private var showFreeBuilder = false
    @State private var freeEditAssignmentId: String? = nil
    @State private var seleccion: String? = nil
    @State private var workoutLaunch: WorkoutLaunch? = nil
    @State private var executedLaunch: WorkoutLaunch? = nil
    @State private var reintentando = false
    @State private var aviso: AvisoDia.Contenido? = nil
    @State private var borrarTarget: AthleteWeekDaySession? = nil
    /// Sube cuando cambia una marca optimista local, para que la semana se resuelva otra vez.
    @State private var marcasVersion = 0

    /// A dónde lleva una marca o «Todas»: dentro del `NavigationStack` de esta pestaña.
    private enum RutaLibre: Hashable {
        case marca(String)
        case todas
    }

    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }
    /// El máximo de pulso resuelto del atleta: cada puerta de «Probarme» lo lleva para que un intento en vivo tenga
    /// SUS zonas y no unas genéricas.
    private var hrZones: HRZoneProfile? { store.identity.value?.hrZones }

    private var lectura: LecturaLibre {
        _ = marcasVersion
        return LecturaLibre.desde(
            marcas: marks, marcasCargadas: marksLoaded, marcasFallaron: marksFailed,
            carrerasCargadas: store.racesHub.hasLoaded || store.racesHub.loadFailed,
            carrerasImportadas: store.racesHub.value?.past.count ?? 0,
            vo2: vo2, retrato: freePlan, carreraObjetivo: planWeek?.targetRace,
            semana: planWeek.map { SemanaDelPlan.desde($0) },
            hoyIso: planWeek?.week.todayIso ?? FechaES.iso(Date())
        )
    }

    // MARK: - Cuerpo

    var body: some View {
        let l = lectura
        let acciones = acciones(l)
        NavigationStack(path: $ruta) {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                PlanLibrePantalla(l: l, acciones: acciones, seleccion: $seleccion, reintentando: reintentando)
                    .refreshable { await load(force: true) }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: RutaLibre.self) { destino in
                switch destino {
                case let .marca(slug): MarkDetailView(slug: slug, bearer: bearer, hrZones: hrZones)
                case .todas: MarksLibraryView(bearer: bearer, hrZones: hrZones)
                }
            }
        }
        .avisoDia($aviso)
        .confirmarBorrarLibre($borrarTarget, alConfirmar: confirmarBorrado)
        .sheet(isPresented: $showImport) {
            // El MISMO importador por nombre que el hub de Carreras: un toque trae todo su historial de HYROX con
            // sus parciales por estación.
            ImportRaceSheet(bearer: bearer) { result in
                if let result { store.applyImportedRaces(result.races) }
                Task { await store.racesMutated() }
            }
        }
        .sheet(isPresented: $showBuscarCarrera) {
            BuscarCarreraSheet(bearer: bearer) {
                Task { await store.racesMutated() }
            }
        }
        .fullScreenCover(isPresented: $showFreeBuilder) {
            FreeWorkoutBuilderView(
                bearer: bearer, hrZones: hrZones,
                onClose: { showFreeBuilder = false },
                onCompleted: { Task { await store.planMutated() } })
        }
        .fullScreenCover(isPresented: Binding(get: { freeEditAssignmentId != nil }, set: { if !$0 { freeEditAssignmentId = nil } })) {
            if let editId = freeEditAssignmentId, let id = Int(editId) {
                FreeWorkoutBuilderView(
                    bearer: bearer, editingAssignmentId: id, hrZones: hrZones,
                    onClose: { freeEditAssignmentId = nil },
                    onCompleted: {
                        freeEditAssignmentId = nil
                        Task { await store.planMutated() }
                    })
            }
        }
        .fullScreenCover(item: $executedLaunch) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId, fallbackTitle: launch.title, bearer: bearer,
                onClose: { executedLaunch = nil },
                onStale: { Task { await store.planMutated() } })
        }
        .fullScreenCover(item: $workoutLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId, fallbackTitle: launch.title, bearer: bearer, hrZones: hrZones,
                onClose: { workoutLaunch = nil },
                onCompleted: { _ in
                    workoutLaunch = nil
                    Task { await store.planMutated() }
                })
        }
        .task(id: bearer) {
            store.activate(bearer: bearer)
            await load()
        }
    }

    // MARK: - Lo que se hace al tocar

    private func acciones(_ l: LecturaLibre) -> AccionesDeLibre {
        AccionesDeLibre(
            alAbrirMarca: { ruta.append(.marca($0.slug)) },
            alVerTodasLasMarcas: { ruta.append(.todas) },
            alReintentarMarcas: reintentarMarcas,
            alPonerCarrera: { showBuscarCarrera = true },
            alImportar: { showImport = true },
            alHablarConUnCoach: {
                // El embudo de socios (lead → cita) ya existe en la web; iOS lo abre en Safari, sin precio, como la
                // bienvenida previa al login.
                openURL(AppLinks.funnel)
            },
            alAbrirSesion: abrir,
            alProgramar: { showFreeBuilder = true },
            menuDeSesion: { sesion, semana in AnyView(menuDeSesion(sesion, semana)) },
            menuDelDia: { dia in
                AnyView(ForEach(dia.sesiones) { sesion in
                    if dia.sesiones.count > 1 { Menu(sesion.title) { menuDeSesion(sesion, nil) } } else { menuDeSesion(sesion, nil) }
                })
            }
        )
    }

    /// Tocar una sesión ROUTEA POR ESTADO: una terminada abre lo que registraste; una pendiente, la previa.
    private func abrir(_ session: AthleteWeekDaySession) {
        let launch = WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
        if session.estado.trabajada { executedLaunch = launch } else { workoutLaunch = launch }
    }

    /// El «···» de una sesión propia: editar, mover y borrar (`AthleteWeekDaySession.accionesLibres`). La semana de
    /// la que sale «Mover» es la de hoy; el menú de un día no la trae y la lee de aquí.
    @ViewBuilder
    private func menuDeSesion(_ sesion: AthleteWeekDaySession, _ semana: SemanaDelPlan?) -> some View {
        let semana = semana ?? planWeek.map { SemanaDelPlan.desde($0) }
        ForEach(sesion.accionesLibres()) { accion in
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
                    if accion.clave == .editarLibre { freeEditAssignmentId = sesion.assignmentId } else { borrarTarget = sesion }
                } label: {
                    Label(accion.etiqueta, systemImage: accion.simbolo)
                }
            }
        }
    }

    private func mover(_ session: AthleteWeekDaySession, a iso: String) {
        guard let token = bearer, let id = Int(session.assignmentId) else {
            aviso = AvisoDia.Contenido(tono: .fallo, texto: PlanTextos.Fallo.mover)
            return
        }
        Haptics.light()
        Task {
            do {
                _ = try await PlanService.moveSession(assignmentId: id, toDate: iso, bearer: token)
                Haptics.success()
                await store.planMutated()
            } catch {
                Haptics.error()
                aviso = AvisoDia.Contenido(tono: .fallo, texto: PlanTextos.Fallo.deMover(error))
            }
        }
    }

    private func confirmarBorrado(_ session: AthleteWeekDaySession) {
        borrarTarget = nil
        guard let token = bearer else { return }
        Task {
            do {
                try await FreeSessionDelete.perform(assignmentId: session.assignmentId, bearer: token)
                Haptics.medium()
                await store.planMutated()
            } catch {
                aviso = AvisoDia.Contenido(tono: .fallo, texto: PlanTextos.Fallo.borrar)
            }
        }
    }

    private func reintentarMarcas() {
        guard !reintentando else { return }
        reintentando = true
        Task {
            await loadMarks()
            reintentando = false
        }
    }

    // MARK: - Carga

    private func load(force: Bool = false) async {
        async let slices: Void = store.loadFreePlan(force: force)
        async let marks: Void = loadMarks()
        async let bio: Void = loadVO2()
        async let portrait: Void = loadPortrait()
        _ = await (slices, marks, bio, portrait)
    }

    /// El retrato calculado. Silencioso si falla: cada tarjeta que alimenta es condicional, así que una petición
    /// caída degrada a la pantalla sin ellas y no a un error sobre datos que el atleta nunca pidió.
    private func loadPortrait() async {
        freePlan = try? await FreePlanService.fetch(bearer: bearer)
    }

    private func loadMarks() async {
        do {
            marks = try await MarksService.fetchMarks(bearer: bearer).marks
            marksFailed = false
        } catch {
            marksFailed = true
        }
        marksLoaded = true
    }

    /// Su VO₂ máx del reloj, cuando el backend tiene de verdad una serie reciente. Silencioso si falla: la tarjeta
    /// simplemente no sale.
    private func loadVO2() async {
        guard let bearer else { return }
        let trend = try? await BiometricTrendService.fetch(bearer: bearer)
        vo2 = trend?.metrics.first { $0.key == PlanLibreCopy.claveVo2 }
    }
}

