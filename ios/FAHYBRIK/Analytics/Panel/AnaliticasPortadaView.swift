import SwiftUI

// LA PORTADA DE ANALÍTICAS — el panel único con los ocho bloques en el orden de
// las preguntas (docs/analiticas/modelo.md §3), firmado por Alex el 29-09 sobre
// la propuesta `analiticas-portada` del doble: el título y la ventana fijos
// arriba, el Estado que no se va al hacer scroll, y debajo Forma y fatiga,
// Semana a semana, Intensidad, Progreso, Récords, Carrera y Recuperación.
//
// iOS PINTA, NO CALCULA. Todo sale de `PanelAnaliticas` (una llamada, una
// ventana); la caché por ventana y el refresco son del `AppDataStore` (SWR +
// disco). Un toque en un bloque empuja su detalle (placeholder hasta la segunda
// tanda); las salidas de los huecos llevan a la pestaña o pantalla que resuelve
// la falta. Detrás de `AnaliticasBandera` (Debug ON, Release OFF).

private typealias C = AnaliticasColor
private typealias TA = AnaliticasTokens.TA

struct AnaliticasPortadaView: View {
    var bearer: String? = nil
    /// FREE (sin coach): sin chat al que escribir.
    var hasCoach: Bool = true
    /// Las salidas que cambian de pestaña (Inicio, Plan, Carreras).
    var onOpenTab: ((AppTab) -> Void)? = nil
    /// La ventana con la que abre (el arnés de capturas la fija).
    var ventanaInicial: VentanaClave = .porDefecto

    @Environment(AppDataStore.self) private var store
    @Environment(\.openChat) private var openChat

    @State private var ventana: VentanaClave = .porDefecto
    @State private var glosa = false
    @State private var verTests = false
    @State private var camino = NavigationPath()

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
        .environment(\.colorScheme, .dark)
        .onAppear { ventana = ventanaInicial }
    }

    private var raiz: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                cabecera
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                        Section {
                            cuerpo(ancho: geo.size.width - 2 * AnaliticasTokens.margen)
                                .padding(.horizontal, AnaliticasTokens.margen)
                                .padding(.top, 20)
                                .padding(.bottom, AnaliticasTokens.entreBloques + 8)
                        } header: {
                            estadoFijo
                        }
                    }
                }
                .refreshable { await store.refreshPanelAnaliticas(ventana, force: true) }
            }
        }
        .background(C.fondo.ignoresSafeArea())
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

    // MARK: - Cabecera: el título y la ventana, fijos

    private var cabecera: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(AppTab.analiticas.title)
                .font(.system(size: TA.pantalla.cuerpo, weight: TA.pantalla.peso))
                .tracking(-0.5)
                .foregroundStyle(C.tinta)
                .accessibilityAddTraits(.isHeader)
            AnaliticasSelectorVentana(ventana: $ventana)
        }
        .padding(.horizontal, AnaliticasTokens.margen)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - El Estado fijo (pregunta 1)

    @ViewBuilder
    private var estadoFijo: some View {
        if let panel = slice.value {
            let estados = ContextoDeBloque.estados(de: panel)
            let e = AnaliticasDerivados.estado(panel, estadoBloque: estados[.estado] ?? .vacio)
            AnaliticasEstadoFijo(palabra: e.palabra, sinPalabra: e.sinPalabra, celdas: e.celdas, nota: e.nota, onGlosa: { glosa = true })
                .padding(.horizontal, AnaliticasTokens.margen)
                .padding(.top, 10)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(C.fondo)
                .overlay(alignment: .bottom) { Rectangle().fill(C.rejilla).frame(height: 1) }
        }
    }

    // MARK: - Los bloques

    @ViewBuilder
    private func cuerpo(ancho: CGFloat) -> some View {
        if let panel = slice.value {
            let ctx = ContextoDeBloque(panel: panel, estados: ContextoDeBloque.estados(de: panel), ancho: ancho,
                                       onSalida: salida(_:), onAbrir: { camino.append($0) })
            VStack(alignment: .leading, spacing: AnaliticasTokens.entreBloques) {
                ForEach(BloqueDelPanel.delCuerpo, id: \.rawValue) { b in
                    AnaliticasBloque(ctx: ctx, bloque: b)
                }
            }
        } else if slice.loadFailed {
            AnaliticasHueco(
                texto: TextoHueco(titulo: "No se han podido cargar tus analíticas", cuerpo: "Comprueba la conexión y vuelve a intentarlo.", salida: .espera("Desliza hacia abajo para reintentar"), plazo: nil),
                onSalida: { _ in }
            )
        } else {
            ProgressView()
                .tint(C.tinta2)
                .frame(maxWidth: .infinity, minHeight: 200)
                .accessibilityLabel("Cargando")
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
