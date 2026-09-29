import SwiftUI

// LA PESTAÑA «CARRERAS» — la del atleta y el diferencial de HYROX. Solo carreras: objetivos futuros
// y resultados. Todo el análisis del ENTRENO (volumen, ritmo, tendencias) vive en Analíticas.
//
// Esta vista NO decide qué se ve: LEE el store (`racesHub`, `raceOverview`), pide lo suyo (el
// predicho del principal y la revisión del análisis), traduce todo a una `LecturaCarreras` y se la da
// a `CarrerasContenido`, que solo pinta. La decisión del sujeto (el objetivo, la carrera de ayer, la
// última, la invitación) es de `DecideCarreras`, con sus tests. Aquí viven la NAVEGACIÓN, las HOJAS y
// las ACCIONES (que llaman al servidor y luego piden al store que se reconcilie).
//
// El store es cache-first (SWR): la pestaña se pinta al instante desde memoria o disco y revalida en
// silencio; solo una primera carga sin nada muestra esqueleto, y un fallo sin nada guardado se dice
// (con «Reintentar»), no se disfraza de vacío.

/// Adónde se puede ir desde la pestaña (dentro de su propia `NavigationStack`: `AppShell` aloja cada
/// pestaña en plano y no hay una pila compartida).
enum DestinoCarreras: Hashable {
    /// El detalle de una próxima: predicho hoy + camino al objetivo, o «hacerla principal».
    case detalle(raceId: Int)
    /// El detalle de una estación (por su nombre canónico).
    case estacion(String)
    /// La comparación completa entre lo que se predijo y lo que se hizo.
    case predichoVsReal
}

/// Las hojas que se pueden abrir sobre la pestaña.
enum HojaCarreras: Identifiable, Equatable {
    case importar
    case buscar
    case meta(raceId: Int)

    var id: String {
        switch self {
        case .importar: return "importar"
        case .buscar: return "buscar"
        case .meta(let raceId): return "meta-\(raceId)"
        }
    }
}

struct CarrerasView: View {
    var bearer: String? = nil
    /// Sin coach (tier libre): no hay chat ni «Preguntar al coach» ni informe de la IA del método.
    /// Las carreras y su predicho son del atleta.
    var hasCoach: Bool = true

    @Environment(AppDataStore.self) private var store
    @Environment(\.openChat) private var openChat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Navegación y hojas.
    @State private var camino: [DestinoCarreras] = []
    @State private var hoja: HojaCarreras?
    /// La carrera cuyo «⋯» se ha tocado (diálogo de acciones) y la que se va a quitar (su confirmación).
    @State private var accionesDe: ProximaCarrera?
    @State private var porQuitar: ProximaCarrera?
    @State private var confirmarQuitarImportadas = false
    @State private var aviso: AvisoDia.Contenido?
    /// Una acción al servidor en marcha: no admite otra encima (un doble toque no la repite).
    @State private var enMarcha = false
    @State private var aparece = false

    // Lo que esta pestaña pide por su cuenta.
    @State private var predicho: LecturaDePredicho?
    @State private var predichoDe: ObjetivoDelPredicho?
    @State private var reintentosPredicho = 0
    @State private var revision: (raceId: String, valor: PredictionReview)?

    /// Del qué (carrera y meta) es el predicho que hay guardado: si cambia, el que hay ya no vale y se
    /// vuelve a calcular (esqueleto); si solo se refresca, el bueno se queda hasta que llegue el nuevo.
    struct ObjetivoDelPredicho: Hashable {
        let raceId: Int
        let metaS: Int?
        let formato: FormatoCarrera
    }

    // MARK: La lectura

    private var lectura: LecturaCarreras {
        LecturaCarreras.desde(
            hub: store.racesHub.value,
            cargaHub: CargaCarreras(store.racesHub),
            overview: store.raceOverview.value,
            cargaAnalisis: CargaCarreras(store.raceOverview),
            predicho: predicho,
            revision: revision.flatMap { $0.raceId == store.raceOverview.value?.last_race?.id ? $0.valor : nil },
            conCoach: hasCoach,
            noLeidosChat: store.unreadCount,
            hoy: FechaES.iso(Date())
        )
    }

    private var principal: ProximaCarrera? { DecideCarreras.principalDe(lectura.proximas) }

    private func carreraDelHub(_ raceId: Int) -> UpcomingRace? {
        store.racesHub.value?.upcoming.first { $0.raceId == raceId }
    }

    // MARK: Cuerpo

    var body: some View {
        // Su propia NavigationStack: el detalle de una carrera y el de una estación se empujan DENTRO de
        // la pestaña. La barra va oculta: la pantalla dibuja su propia cabecera, como las demás.
        NavigationStack(path: $camino) {
            VStack(spacing: 0) {
                CromoCarreras(conCoach: hasCoach, noLeidos: lectura.noLeidosChat) {
                    Haptics.light()
                    openChat(nil)
                }
                FillingScreen {
                    CarrerasContenido(lectura: lectura, callbacks: callbacks)
                        .staggerReveal(aparece, index: 1)
                }
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .navigationDestination(for: DestinoCarreras.self, destination: destino)
            .onAppear {
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
        .task(id: bearer) {
            // Cache-first: el cuerpo ya se pinta desde las rebanadas del store; esto fija la sesión y
            // revalida las de Carreras en segundo plano (con freno y sin duplicar).
            store.activate(bearer: bearer)
            await store.loadCarreras()
        }
        .task(id: clavePredicho) { await cargarPredicho() }
        .task(id: store.raceOverview.value?.last_race?.id) { await cargarRevision() }
        .sheet(item: $hoja, content: contenidoDeHoja)
        .confirmationDialog(
            accionesDe?.nombre ?? "",
            isPresented: Binding(get: { accionesDe != nil }, set: { if !$0 { accionesDe = nil } }),
            titleVisibility: .visible,
            presenting: accionesDe
        ) { carrera in
            BotonesAccionesCarrera(esPrincipal: carrera.raceId == principal?.raceId, conCoach: hasCoach) { elegir($0, carrera) }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog(
            "¿Quitar este objetivo?",
            isPresented: Binding(get: { porQuitar != nil }, set: { if !$0 { porQuitar = nil } }),
            titleVisibility: .visible,
            presenting: porQuitar
        ) { carrera in
            Button("Quitar objetivo", role: .destructive) { Task { await quitar(carrera) } }
            Button("Cancelar", role: .cancel) {}
        } message: { carrera in
            Text("\(carrera.nombre) dejará de contar para tu cuenta atrás. Podrás volver a fijarla cuando quieras.")
        }
        .confirmationDialog(
            "¿Eliminar las carreras importadas?",
            isPresented: $confirmarQuitarImportadas,
            titleVisibility: .visible
        ) {
            Button("Eliminar carreras importadas", role: .destructive) { Task { await quitarImportadas() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Esto borrará las carreras importadas y podrás volver a buscar tu perfil.")
        }
    }

    // MARK: Las manos del cuerpo

    private var callbacks: CallbacksCarreras {
        CallbacksCarreras(
            alAbrirObjetivo: { accion, carrera in abrirObjetivo(accion, carrera) },
            alAbrirProxima: { camino.append(.detalle(raceId: $0.raceId)) },
            alElegirAccion: { elegir($0, $1) },
            alMostrarAcciones: { accionesDe = $0 },
            alBuscar: { hoja = .buscar },
            alImportar: { hoja = .importar },
            alQuitarImportacion: { confirmarQuitarImportadas = true },
            alAbrirEstacion: { camino.append(.estacion($0)) },
            alAbrirPredichoVsReal: { camino.append(.predichoVsReal) },
            alReintentarTodo: { await store.loadCarreras(force: true) },
            alReintentarPredicho: { reintentosPredicho += 1 },
            alReintentarAnalisis: { Task { await store.refreshRaceOverview(force: true) } }
        )
    }

    /// La acción del póster es la salida del hueco más importante que tenga: ver el camino, fijar el
    /// tiempo, hacerla principal o conectar a la pareja (que vive en el detalle de la carrera).
    private func abrirObjetivo(_ accion: AccionObjetivoCarrera, _ carrera: ProximaCarrera) {
        switch accion {
        case .verCamino, .conectarPareja: camino.append(.detalle(raceId: carrera.raceId))
        case .fijarMeta: hoja = .meta(raceId: carrera.raceId)
        case .hacerPrincipal: Task { await hacerPrincipal(carrera) }
        }
    }

    private func elegir(_ accion: AccionCarrera, _ carrera: ProximaCarrera) {
        switch accion {
        case .preguntar:
            openChat(ChatContextChoice(target: .carrera(String(carrera.raceId)), etiqueta: etiquetaDeContexto(carrera)))
        case .hacerPrincipal:
            Task { await hacerPrincipal(carrera) }
        case .quitar:
            porQuitar = carrera
        }
    }

    /// «HYROX Barcelona · 4 oct» para el chip del compositor. De pantalla: la que se guarda con el
    /// mensaje la escribe el servidor.
    private func etiquetaDeContexto(_ carrera: ProximaCarrera) -> String {
        guard let fecha = carrera.fecha, let corta = FechaES.corta(fecha) else { return carrera.nombre }
        return "\(carrera.nombre) · \(corta)"
    }

    // MARK: Destinos y hojas

    @ViewBuilder
    private func destino(_ d: DestinoCarreras) -> some View {
        switch d {
        case .detalle(let raceId):
            if let race = carreraDelHub(raceId) {
                RaceDetailView(
                    race: race,
                    isTargetRace: raceId == principal?.raceId,
                    bearer: bearer,
                    onMakePrimary: { if let c = lectura.proximas.first(where: { $0.raceId == raceId }) { Task { await hacerPrincipal(c) } } }
                )
            }
        case .estacion(let nombre):
            StationDetailView(station: nombre, bearer: bearer)
        case .predichoVsReal:
            if let valor = revision?.valor { PredichoVsRealView(review: valor) }
        }
    }

    @ViewBuilder
    private func contenidoDeHoja(_ h: HojaCarreras) -> some View {
        switch h {
        case .importar:
            ImportRaceSheet(bearer: bearer) { resultado in
                // La importación entera trae las carreras ricas (con equipo): se pliegan en el hub al
                // momento, y luego se reconcilia todo lo derivado con el servidor. La del enlace (una
                // sola carrera) pasa nil y solo se reconcilia.
                if let resultado { store.applyImportedRaces(resultado.races) }
                Task { await store.racesMutated() }
                let n = resultado?.races.count ?? 1
                aviso = .init(tono: .ok, texto: n > 1 ? "Historial importado: \(n) carreras." : "Carrera importada.")
            }
        case .buscar:
            // Fijar la hace la principal y pasa la actual a secundaria: se refresca el hub y el plan para
            // que el objetivo nuevo aparezca aquí y la cuenta atrás de Inicio lo siga.
            BuscarCarreraSheet(bearer: bearer) {
                Task {
                    await store.racesMutated()
                    if let nueva = principal { aviso = .init(tono: .ok, texto: "«\(nueva.nombre)» es ahora tu carrera objetivo.") }
                }
            }
        case .meta(let raceId):
            if let race = carreraDelHub(raceId) {
                FijarTiempoObjetivoSheet(race: race, bearer: bearer) {
                    Task {
                        await store.racesMutated()
                        aviso = .init(tono: .ok, texto: "Tiempo objetivo guardado.")
                    }
                }
            }
        }
    }

    // MARK: Lo que se pide por su cuenta: el predicho y su revisión

    private var clavePredicho: ClavePredicho {
        ClavePredicho(
            objetivo: principal.map { ObjetivoDelPredicho(raceId: $0.raceId, metaS: $0.metaS, formato: $0.formato) },
            tipoEvento: principal?.tipoEvento,
            // Cada vez que el hub se reconcilia, el predicho se refresca (importar o fijar lo cambia).
            hubCargadoEn: store.racesHub.loadedAt,
            reintentos: reintentosPredicho,
            bearer: bearer
        )
    }

    struct ClavePredicho: Hashable {
        let objetivo: ObjetivoDelPredicho?
        let tipoEvento: TipoEventoCarrera?
        let hubCargadoEn: Date?
        let reintentos: Int
        let bearer: String?
    }

    @MainActor
    private func cargarPredicho() async {
        // Solo el principal HYROX con tiempo objetivo tiene predicho que pedir: el resto se resuelve
        // en la lectura sin red (no aplica / sin meta).
        guard let principal, principal.tipoEvento == .hyrox, principal.metaS != nil, let bearer else {
            predicho = nil
            predichoDe = nil
            return
        }
        let de = ObjetivoDelPredicho(raceId: principal.raceId, metaS: principal.metaS, formato: principal.formato)
        if predichoDe != de {
            // Otra carrera u otra meta: el que hay ya no vale, se vuelve a calcular (esqueleto).
            predicho = .pidiendo
            predichoDe = de
        } else if case .fallo? = predicho {
            predicho = .pidiendo
        }
        let nuevo: LecturaDePredicho
        if principal.formato == .dobles {
            nuevo = await DoblesService.fetchRaceGap(raceId: String(principal.raceId), bearer: bearer).map(LecturaDePredicho.pareja) ?? .fallo
        } else {
            nuevo = await GoalGapService.fetchGoalGap(bearer: bearer).map(LecturaDePredicho.individual) ?? .fallo
        }
        if Task.isCancelled { return }
        // Un fallo al REFRESCAR no pisa un predicho bueno que ya estaba: solo se declara si no había nada.
        if case .fallo = nuevo {
            switch predicho {
            case .individual?, .pareja?: return
            default: break
            }
        }
        predicho = nuevo
    }

    @MainActor
    private func cargarRevision() async {
        guard let id = store.raceOverview.value?.last_race?.id, let bearer else {
            revision = nil
            return
        }
        let valor = await GoalGapService.fetchPredictionReview(raceId: id, bearer: bearer)
        if Task.isCancelled { return }
        revision = valor.map { (raceId: id, valor: $0) }
    }

    // MARK: Acciones (al servidor, y luego el store se reconcilia)

    /// «Tu sesión ha caducado…» o, si no, el mensaje propio de la acción (los de `HyresultImportError`
    /// hablan de importar y aquí no vienen a cuento).
    private func mensaje(_ error: Error, generico: String) -> String {
        if let e = error as? HyresultImportError, case .unauthorized = e { return e.message }
        return generico
    }

    @MainActor
    private func hacerPrincipal(_ carrera: ProximaCarrera) async {
        guard !enMarcha else { return }
        enMarcha = true
        defer { enMarcha = false }
        do {
            try await CarrerasService.makePrimaryObjective(raceId: carrera.raceId, bearer: bearer)
            Haptics.success()
            await store.racesMutated()
            aviso = .init(tono: .ok, texto: "«\(carrera.nombre)» es ahora tu objetivo principal.")
        } catch {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: mensaje(error, generico: "No pudimos cambiar tu objetivo principal. Inténtalo de nuevo."))
        }
    }

    @MainActor
    private func quitar(_ carrera: ProximaCarrera) async {
        guard !enMarcha else { return }
        enMarcha = true
        defer { enMarcha = false }
        do {
            try await CarrerasService.deleteObjective(raceId: carrera.raceId, bearer: bearer)
            Haptics.success()
            await store.racesMutated()
            aviso = .init(tono: .ok, texto: "Objetivo quitado.")
        } catch {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: mensaje(error, generico: "No pudimos quitar este objetivo. Inténtalo de nuevo."))
        }
    }

    /// «No soy yo»: borra lo importado en el servidor y en local, reconcilia y reabre la búsqueda con
    /// el campo limpio para que el atleta elija su perfil de verdad. Si falla, se queda y se dice.
    @MainActor
    private func quitarImportadas() async {
        guard !enMarcha else { return }
        enMarcha = true
        defer { enMarcha = false }
        do {
            _ = try await CarrerasService.undoImport(bearer: bearer)
            Haptics.success()
            store.removeImportedRaces()
            await store.racesMutated()
            aviso = .init(tono: .ok, texto: "Carreras importadas eliminadas.")
            hoja = .importar
        } catch {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: mensaje(error, generico: "No pudimos eliminar las carreras importadas. Inténtalo de nuevo."))
        }
    }
}
