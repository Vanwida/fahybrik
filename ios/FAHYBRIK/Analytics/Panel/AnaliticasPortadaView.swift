import SwiftUI

// LA PORTADA DE ANALÍTICAS — el panel único con los ocho bloques en el orden de
// las preguntas (docs/analiticas/modelo.md §3), firmado por Alex el 29-09 y vestido con
// el diseño de «El día» (la app entera lleva UNO): la ventana dicha en una frase y el
// título de la pestaña arriba, el selector de ventana que se PEGA arriba al bajar (una
// sola rige toda la pestaña y siempre se ve cuál), el Estado como sujeto y debajo Forma y
// fatiga, Semana a semana, Intensidad, Progreso, Récords, Carrera y Recuperación.
//
// iOS PINTA, NO CALCULA. Todo sale de `PanelAnaliticas` (una llamada, una ventana); la
// caché por ventana y el refresco son del `AppDataStore` (SWR + disco). Un toque en un
// bloque empuja su detalle (placeholder hasta la segunda tanda); las salidas de los huecos
// llevan a la pestaña o pantalla que resuelve la falta.
//
// EL TEMA ES UNO Y LO ELIGE EL ATLETA (CONTRATO-UI §6.4): esta pantalla no fuerza su esquema;
// claro u oscuro, sale de `Theme`. El acento es el del club.
//
// Cuatro estados: con datos (`AnaliticasPortadaCuerpo`), cargando (el esqueleto con la misma
// forma), error con su reintento y, dentro de cada bloque, vacío / poco / viejo con su salida.
// Detrás de `AnaliticasBandera` (encendida por defecto).

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
    /// El selector está pegado arriba (el contenido pasa por debajo): entonces lleva su raya.
    @State private var pegado = false
    /// Cuánto mide lo que se va con el scroll (sobretítulo y título): pasado ese punto el selector se pega.
    @State private var alturaDeCabecera: CGFloat = 0

    /// `ventanaInicial` fija la ventana con la que abre (el arnés de capturas la pide); después manda el
    /// atleta: volver a la pestaña no la reinicia.
    init(bearer: String? = nil, hasCoach: Bool = true, onOpenTab: ((AppTab) -> Void)? = nil, ventanaInicial: VentanaClave = .porDefecto) {
        self.bearer = bearer
        self.hasCoach = hasCoach
        self.onOpenTab = onOpenTab
        _ventana = State(initialValue: ventanaInicial)
    }

    private var slice: Slice<PanelAnaliticas> { store.panelAnaliticas(ventana) }

    var body: some View {
        NavigationStack(path: $camino) {
            raiz
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: AnaliticasDestino.self) { destino in
                    switch destino {
                    case .dispositivos: DeviceConnectionsView(bearer: bearer)
                    default: AnaliticasDetalleView(destino: destino)
                    }
                }
        }
    }

    private var raiz: some View {
        GeometryReader { geo in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    AnaliticasCabecera(sobretitulo: ventana.frase, titulo: AppTab.analiticas.title)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.xs + 2)
                        .padding(.bottom, Theme.Spacing.m)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { alturaDeCabecera = $0 }
                    Section {
                        cuerpo(ancho: geo.size.width - 2 * Theme.Spacing.pantalla)
                            .padding(.horizontal, Theme.Spacing.pantalla)
                            .padding(.top, Theme.Spacing.m)
                            .padding(.bottom, Theme.Spacing.xxl)
                    } header: {
                        selector
                    }
                }
            }
            .scrollBounceBehavior(.always)
            .onScrollGeometryChange(for: Bool.self) { g in
                alturaDeCabecera > 0 && g.contentOffset.y + g.contentInsets.top >= alturaDeCabecera - 0.5
            } action: { _, ahora in
                pegado = ahora
            }
            .refreshable { await store.refreshPanelAnaliticas(ventana, force: true) }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task(id: "\(bearer ?? "")|\(ventana.rawValue)") {
            store.activate(bearer: bearer)
            await store.refreshPanelAnaliticas(ventana)
        }
        .sheet(isPresented: $glosa) {
            AnaliticasGlosa(metodo: slice.value?.metodo ?? MetodoDelPanel.porDefecto, onCerrar: { glosa = false })
        }
        .fullScreenCover(isPresented: $verTests) {
            TestsHubView(
                bearer: bearer,
                hrZones: store.identity.value?.hrZones,
                onClose: { verTests = false },
                onSessionCompleted: { Task { await store.refreshPanelAnaliticas(ventana, force: true) } }
            )
        }
    }

    // MARK: - El selector, pegado arriba

    private var selector: some View {
        AnaliticasSelectorVentana(ventana: $ventana)
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.vertical, Theme.Spacing.m - 2)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.background)
            .overlay(alignment: .bottom) {
                if pegado { Rectangle().fill(Theme.Color.hairlineStrong).frame(height: 1) }
            }
    }

    // MARK: - El cuerpo, en sus estados

    @ViewBuilder
    private func cuerpo(ancho: CGFloat) -> some View {
        if let panel = slice.value {
            AnaliticasPortadaCuerpo(panel: panel, ancho: ancho, onGlosa: { glosa = true }, onSalida: salida(_:), onAbrir: { camino.append($0) })
        } else if slice.loadFailed {
            AnaliticasPortadaError(reintentando: slice.isRevalidating) {
                Task { await store.refreshPanelAnaliticas(ventana, force: true) }
            }
        } else {
            AnaliticasPortadaEsqueleto()
        }
    }

    // MARK: - Las salidas de los huecos

    private func salida(_ destino: DestinoDeSalida) {
        switch destino {
        case .inicio: onOpenTab?(.inicio)
        case .plan: onOpenTab?(.plan)
        case .carreras: onOpenTab?(.carreras)
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
