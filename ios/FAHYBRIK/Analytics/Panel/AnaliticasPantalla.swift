import SwiftUI

// LA PANTALLA DE ANALÍTICAS — el cascarón de todas las de la pestaña (la portada, los detalles de familia y la sesión), con el
// diseño de «Hoy · El día» (espejo de `kit-analiticas/pantalla.tsx#PantallaAnaliticas`): el sobretítulo de acento y el título en
// cursiva pesada, el selector de ventana que se PEGA arriba al bajar (una sola ventana rige toda la pestaña y siempre se ve cuál),
// y debajo el contenido. Una pantalla; no tres montajes del mismo scroll.
//
//   raíz         título de la pestaña, sin «atrás»
//   detalle      «‹ Analíticas» fijo a la izquierda (la barra de pestañas no se enseña dentro de un detalle), y el gesto de borde del sistema
//   sin ventana  una sesión es un día: no obedece a la ventana y no la enseña
//
// EL TEMA ES UNO Y LO ELIGE EL ATLETA (CONTRATO-UI §6.4): la pantalla no fuerza su esquema; claro u oscuro sale de `Theme`.

/// La cabecera de la pestaña: la ventana dicha en una frase (sobretítulo en el acento del club) y el título en cursiva de marca. Se va
/// con el scroll; el selector se queda.
struct AnaliticasCabecera: View {
    let sobretitulo: String
    let titulo: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if !sobretitulo.isEmpty { Text(sobretitulo).papel(.etiqueta).foregroundStyle(Theme.Color.accentText) }
            Text(titulo).papel(.saludo).foregroundStyle(Theme.Color.foreground)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AnaliticasPantalla<Cuerpo: View>: View {
    let sobretitulo: String
    let titulo: String
    /// La ventana que rige la pantalla; nula = no obedece a ninguna (una sesión es un día).
    var ventana: Binding<VentanaClave>? = nil
    /// «‹ Analíticas»; nulo = la pestaña raíz.
    var atras: (texto: String, accion: () -> Void)? = nil
    var alRefrescar: () async -> Void = {}
    /// El contenido, con el ancho útil del lienzo (para decidir cuántas columnas o semanas caben).
    @ViewBuilder let cuerpo: (CGFloat) -> Cuerpo

    /// El selector está pegado arriba (el contenido pasa por debajo): entonces lleva su raya.
    @State private var pegado = false
    /// Cuánto mide lo que se va con el scroll (sobretítulo y título): pasado ese punto el selector se pega.
    @State private var alturaDeCabecera: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let ancho = geo.size.width - 2 * Theme.Spacing.pantalla
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    AnaliticasCabecera(sobretitulo: sobretitulo, titulo: titulo)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, atras == nil ? Theme.Spacing.xs + 2 : 0)
                        .padding(.bottom, Theme.Spacing.m)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { alturaDeCabecera = $0 }
                    if let ventana {
                        Section {
                            contenido(ancho)
                        } header: {
                            selector(ventana)
                        }
                    } else {
                        contenido(ancho)
                    }
                }
            }
            .scrollBounceBehavior(.always)
            .onScrollGeometryChange(for: Bool.self) { g in
                alturaDeCabecera > 0 && g.contentOffset.y + g.contentInsets.top >= alturaDeCabecera - 0.5
            } action: { _, ahora in
                pegado = ahora
            }
            .refreshable { await alRefrescar() }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        // Un detalle no lleva la barra de pestañas (el contrato: «‹ Analíticas» fijo y la pantalla entera para el dato); la raíz sí.
        .toolbar(atras == nil ? .automatic : .hidden, for: .tabBar)
        .safeAreaInset(edge: .top, spacing: 0) {
            if let atras {
                HStack { AtrasDia(texto: atras.texto, accion: atras.accion); Spacer() }
                    .padding(.horizontal, Theme.Spacing.s)
                    .frame(maxWidth: .infinity)
                    .background(Theme.Color.background)
            }
        }
    }

    private func contenido(_ ancho: CGFloat) -> some View {
        cuerpo(ancho)
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
    }

    /// El selector, pegado arriba.
    private func selector(_ ventana: Binding<VentanaClave>) -> some View {
        AnaliticasSelectorVentana(ventana: ventana)
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.vertical, Theme.Spacing.m - 2)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.background)
            .overlay(alignment: .bottom) {
                if pegado { Hairline(fuerte: true) }
            }
    }
}
