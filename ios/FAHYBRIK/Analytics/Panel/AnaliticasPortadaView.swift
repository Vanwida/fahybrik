import SwiftUI

// LA PORTADA DE ANALÍTICAS — el panel único con los ocho bloques en el orden de las preguntas (docs/analiticas/modelo.md §3), firmado por
// Alex el 29-09 y vestido con el diseño de «El día» (la app entera lleva UNO): la ventana dicha en una frase y el título de la pestaña
// arriba, el selector de ventana que se PEGA arriba al bajar (una sola rige toda la pestaña y siempre se ve cuál), el Estado como sujeto
// y debajo Forma y fatiga, Semana a semana, Intensidad, Progreso, Récords, Carrera y Recuperación.
//
// iOS PINTA, NO CALCULA. Todo sale de `PanelAnaliticas` (una llamada, una ventana); la caché por ventana y el refresco son del
// `AppDataStore` (SWR + disco). Un toque en un bloque empuja su detalle (`AnaliticasDestino`): la familia de una fila del Progreso, la
// sesión de una fila de Semana a semana, y el detalle de Semana a semana, Récords y Carrera. Las salidas de los huecos llevan a la
// pestaña o pantalla que resuelve la falta.
//
// LA VENTANA ES UNA PARA TODA LA PESTAÑA (A4): los detalles la comparten (un `Binding`), así que cambiarla en uno la cambia al volver.
//
// EL TEMA ES UNO Y LO ELIGE EL ATLETA (CONTRATO-UI §6.4): esta pantalla no fuerza su esquema; claro u oscuro, sale de `Theme`. El acento
// es el del club.
//
// Cuatro estados: con datos (`AnaliticasPortadaCuerpo`), cargando (el esqueleto con la misma forma), error con su reintento y, dentro
// de cada bloque, vacío / poco / viejo con su salida.

struct AnaliticasPortadaView: View {
    var bearer: String? = nil
    /// FREE (sin coach): sin chat al que escribir.
    var hasCoach: Bool = true
    /// Las salidas que cambian de pestaña (Inicio, Plan, Carreras).
    var onOpenTab: ((AppTab) -> Void)? = nil

    @Environment(AppDataStore.self) private var store
    @Environment(\.openChat) private var openChat

    @State private var ventana: VentanaClave
    @State private var glosa = false
    @State private var verTests = false
    @State private var camino = NavigationPath()

    /// `ventanaInicial` fija la ventana con la que abre y `caminoInicial` los detalles ya empujados (el arnés de capturas los pide, para
    /// fotografiar la navegación de verdad); después manda el atleta: volver a la pestaña no reinicia la ventana.
    init(bearer: String? = nil, hasCoach: Bool = true, onOpenTab: ((AppTab) -> Void)? = nil, ventanaInicial: VentanaClave = .porDefecto,
         caminoInicial: [AnaliticasDestino] = []) {
        self.bearer = bearer
        self.hasCoach = hasCoach
        self.onOpenTab = onOpenTab
        _ventana = State(initialValue: ventanaInicial)
        var camino = NavigationPath()
        caminoInicial.forEach { camino.append($0) }
        _camino = State(initialValue: camino)
    }

    private var slice: Slice<PanelAnaliticas> { store.panelAnaliticas(ventana) }

    var body: some View {
        NavigationStack(path: $camino) {
            raiz
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: AnaliticasDestino.self) { destino in
                    detalle(destino)
                }
        }
        // Las hojas cuelgan de la pila y no de la raíz: un detalle empujado también pide la glosa o el test de zonas.
        .sheet(isPresented: $glosa) {
            AnaliticasGlosa(metodo: slice.value?.metodo ?? MetodoDelPanel.porDefecto, onCerrar: { glosa = false })
        }
        .fullScreenCover(isPresented: $verTests) {
            TestsHubView(
                bearer: bearer,
                hrZones: store.identity.value?.hrZones,
                onClose: { verTests = false },
                onSessionCompleted: { Task { await recargar(forzar: true) } }
            )
        }
    }

    private var raiz: some View {
        AnaliticasPantalla(
            sobretitulo: ventana.frase,
            titulo: AppTab.analiticas.title,
            ventana: $ventana,
            alRefrescar: { await recargar(forzar: true) }
        ) { ancho in
            cuerpo(ancho: ancho)
        }
        .task(id: "\(bearer ?? "")|\(ventana.rawValue)") {
            store.activate(bearer: bearer)
            await recargar(forzar: false)
        }
    }

    /// El panel y, aparte, el cumplimiento de la misma ventana (de él salen las sesiones de Semana a semana). Un fallo del segundo no
    /// tumba la portada: la puerta a los días simplemente no sale.
    private func recargar(forzar: Bool) async {
        async let panel: Void = store.refreshPanelAnaliticas(ventana, force: forzar)
        async let cumplimiento: Void = store.refreshCumplimientoAnalitico(ventana, force: forzar)
        _ = await (panel, cumplimiento)
    }

    // MARK: - El cuerpo, en sus estados

    @ViewBuilder
    private func cuerpo(ancho: CGFloat) -> some View {
        if let panel = slice.value {
            AnaliticasPortadaCuerpo(
                panel: panel, ancho: ancho,
                sesiones: store.cumplimientoAnalitico(ventana).value.map(PuertaDeSesiones.filas) ?? [],
                onGlosa: { glosa = true }, onSalida: salida(_:), onAbrir: { camino.append($0) }
            )
        } else if slice.loadFailed {
            AnaliticasErrorDeCarga(reintentando: slice.isRevalidating) {
                Task { await recargar(forzar: true) }
            }
        } else {
            AnaliticasPortadaEsqueleto()
        }
    }

    // MARK: - Los detalles

    @ViewBuilder
    private func detalle(_ destino: AnaliticasDestino) -> some View {
        switch destino {
        case .dispositivos:
            DeviceConnectionsView(bearer: bearer)
        case .familia(let f):
            if let familia = FamiliaDeDetalle(f) {
                AnaliticasFamiliaView(familia: familia, ventana: $ventana, onSalida: salida(_:), onAtras: atras)
            }
        case .sesion(let s):
            AnaliticasSesionView(destino: s, ventana: ventana, onAtras: atras)
        case .bloque(let b):
            AnaliticasBloqueDetalleView(bloque: b, ventana: $ventana, onSalida: salida(_:), onAbrir: { camino.append($0) }, onAtras: atras)
        }
    }

    private func atras() {
        if !camino.isEmpty { camino.removeLast() }
    }

    private func volverALaRaiz() {
        if !camino.isEmpty { camino.removeLast(camino.count) }
    }

    // MARK: - Las salidas de los huecos

    private func salida(_ destino: DestinoDeSalida) {
        switch destino {
        // Cambiar de pestaña deja la pila en su raíz: al volver a Analíticas no espera un detalle abierto hace un rato.
        case .inicio: volverALaRaiz(); onOpenTab?(.inicio)
        case .plan: volverALaRaiz(); onOpenTab?(.plan)
        case .carreras: volverALaRaiz(); onOpenTab?(.carreras)
        case .dispositivos: camino.append(AnaliticasDestino.dispositivos)
        case .chat: if hasCoach { openChat(nil) }
        case .tests: verTests = true
        }
    }
}

extension MetodoDelPanel {
    /// Para la glosa antes de que llegue el panel: los días de mercado (42/7),
    /// los mismos defectos que `DEFAULT_COACH_ANALYTICS_METHOD`.
    static let porDefecto = MetodoDelPanel(
        ctlDays: 42, atlDays: 7, rampAlertTssPerWeek: nil, coberturaVeredictoMinPct: nil, hrvMinNightsBaseline: nil, basalDias: nil
    )
}
