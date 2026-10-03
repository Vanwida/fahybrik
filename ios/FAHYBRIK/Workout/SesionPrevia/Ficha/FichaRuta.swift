import SwiftUI

// LA RUTA — la sesión en orden, de un vistazo: un nodo por bloque, unidos por una línea, con su nombre y lo que lleva.
//
// Es el mapa Y el control: tocar un nodo cambia el bloque que se lee debajo. Se queda fija arriba al hacer scroll
// (es la cabecera de la sección del panel, ver `FichaContenido`), así que en un bloque largo —dieciséis estaciones—
// siempre sabes en qué parte estás y a un toque tienes las demás.
//
// No es una línea de tiempo proporcional a propósito: el servidor no estima duraciones (CONTRATO-UI §7) y unas
// barras de ancho proporcional prometerían una precisión que nadie ha escrito. Cada nodo dice lo que se SABE del
// bloque (`resumen`).
//
// Con pocos bloques las celdas se reparten el ancho; con más de los que caben, la tira se desliza y el borde derecho
// se desvanece para decir «hay más» hasta que se llega al final. Con el texto del sistema grande, el nodo y la celda
// crecen con él y los nombres se leen enteros (la tira scrollea; nada se corta).

struct FichaRuta: View {
    let bloques: [BloqueFicha]
    let elegido: BloqueFicha.ID
    let alElegir: (BloqueFicha.ID) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto
    @ScaledMetric(relativeTo: .subheadline) private var nodo: CGFloat = 30
    /// Lo que mide «Calentamiento» en negrita a 15 pt más su aire: por debajo, una palabra se partiría a media letra.
    @ScaledMetric(relativeTo: .subheadline) private var anchoMinimo: CGFloat = 120

    @State private var anchoDeLaTira: CGFloat = 0
    @State private var alFinal = false

    private static let grosorDelTramo: CGFloat = 2
    private static let grosorDelBorde: CGFloat = 2
    /// Lo que se desvanece del borde derecho cuando hay más nodos por ver.
    private static let anchoDelDesvanecido: CGFloat = 36
    /// Hasta qué punto del final se da por llegado.
    private static let margenDelFinal: CGFloat = 4
    private static let lineasDelNombre = 3

    /// Cada celda se reparte el ancho de la tira (menos los márgenes) o, si no llegan al mínimo, lo mide ella.
    private var anchoDeLaCelda: CGFloat {
        let disponible = max(0, anchoDeLaTira - 2 * Theme.Spacing.pantalla)
        return max(anchoMinimo, disponible / CGFloat(max(bloques.count, 1)))
    }

    private var desborda: Bool {
        2 * Theme.Spacing.pantalla + CGFloat(bloques.count) * anchoDeLaCelda > anchoDeLaTira + 1
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { lector in
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(Array(bloques.enumerated()), id: \.element.id) { i, bloque in
                            celda(i, bloque).id(bloque.id)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                }
                .scrollIndicators(.hidden)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { anchoDeLaTira = $0 }
                .onScrollGeometryChange(for: Bool.self, of: { geo in
                    geo.contentOffset.x + geo.containerSize.width >= geo.contentSize.width - Self.margenDelFinal
                }) { _, llegado in alFinal = llegado }
                .mask { desvanecido }
                .onAppear { lector.scrollTo(elegido, anchor: .center) }
                .onChange(of: elegido) { _, nuevo in
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.26)) { lector.scrollTo(nuevo, anchor: .center) }
                }
            }
            .padding(.top, Theme.Spacing.m - 2)
            .padding(.bottom, Theme.Spacing.m)
            Hairline()
        }
        .background(Theme.Color.background)
    }

    /// El borde derecho se desvanece mientras queda tira por ver.
    private var desvanecido: some View {
        HStack(spacing: 0) {
            Rectangle()
            if desborda && !alFinal {
                LinearGradient(colors: [Theme.Color.background, .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: Self.anchoDelDesvanecido)
            }
        }
    }

    // MARK: - Una celda

    private func celda(_ i: Int, _ bloque: BloqueFicha) -> some View {
        let seleccionado = bloque.id == elegido
        let hayAnterior = i > 0
        let haySiguiente = i < bloques.count - 1
        // La línea se «enciende» junto al nodo elegido: la que llega a él y la que sale de él.
        let encendidoAntes = seleccionado || (hayAnterior && bloques[i - 1].id == elegido)
        let encendidoDespues = seleccionado || (haySiguiente && bloques[i + 1].id == elegido)
        return Button { alElegir(bloque.id) } label: {
            VStack(spacing: Theme.Spacing.s - 2) {
                HStack(spacing: 0) {
                    tramo(existe: hayAnterior, encendido: encendidoAntes)
                    circulo(i + 1, seleccionado: seleccionado)
                    tramo(existe: haySiguiente, encendido: encendidoDespues)
                }
                Text(bloque.titulo)
                    .papel(seleccionado ? .notaPesada : .notaFuerte)
                    .foregroundStyle(seleccionado ? Theme.Color.foreground : Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(tamanoDeTexto.isAccessibilitySize ? nil : Self.lineasDelNombre)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Theme.Spacing.xs)
                Text(bloque.resumen)
                    .papel(.nota)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: anchoDeLaCelda)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Bloque \(i + 1) de \(bloques.count), \(bloque.titulo), \(bloque.resumen)")
        .accessibilityAddTraits(seleccionado ? .isSelected : [])
    }

    /// El nodo: relleno del acento el elegido, una cara elevada con contorno los demás.
    private func circulo(_ numero: Int, seleccionado: Bool) -> some View {
        Text("\(numero)")
            .papel(.notaPesada)
            .foregroundStyle(seleccionado ? Theme.Color.accentOn : Theme.Color.foreground)
            .frame(width: nodo, height: nodo)
            .background(seleccionado ? Theme.Color.accent : Theme.Color.surfaceElevated, in: Circle())
            .overlay(Circle().strokeBorder(seleccionado ? Theme.Color.accent : Theme.Color.hairlineStrong, lineWidth: Self.grosorDelBorde))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: seleccionado)
    }

    /// La línea entre dos nodos: media celda a cada lado del nodo. El primero no tiene línea a su izquierda ni el último a su derecha.
    private func tramo(existe: Bool, encendido: Bool) -> some View {
        Rectangle()
            .fill(!existe ? Color.clear : (encendido ? Theme.Color.accent : Theme.Color.hairlineStrong))
            .frame(height: Self.grosorDelTramo)
            .frame(maxWidth: .infinity)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: encendido)
    }
}
