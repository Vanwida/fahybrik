#if DEBUG
import SwiftUI

// LA GALERÍA DE LA PORTADA — la pantalla entera en plano (sin scroll), para las `#Preview` y para
// las pruebas que dejan los PNG (`AnaliticasGaleriaRenderTests`). `ImageRenderer` no dibuja un
// `ScrollView`, así que la galería apila lo mismo que apila la pantalla: cabecera, selector y cuerpo.
//
// Los casos de ejemplo NO son datos de producción: son la respuesta REAL del motor
// (`cargarPanel`) volcada sobre una base desechable con cinco atletas de prueba
// (`FAHYBRIKTests/Analytics/Panel/Fixtures`). Una sola fuente para las pruebas y para las
// previews: la preview los lee del árbol de fuentes por su ruta (`#filePath`), y por eso esta
// galería solo existe en Debug.

enum AnaliticasEjemplos {
    /// Los cinco atletas del motor.
    enum Atleta: String, CaseIterable { case lleno, mixto, poco, vacio, viejo }

    /// El panel de un atleta a 12 semanas, decodificado por el MISMO decodificador que la app.
    static func panel(_ atleta: Atleta, _ ventana: VentanaClave = .doceSemanas) -> PanelAnaliticas? {
        let raiz = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Panel
            .deletingLastPathComponent()  // Analytics
            .deletingLastPathComponent()  // FAHYBRIK
            .deletingLastPathComponent()  // ios
        let url = raiz.appendingPathComponent("FAHYBRIKTests/Analytics/Panel/Fixtures/panel-\(atleta.rawValue)-\(ventana.rawValue).json")
        guard let datos = try? Data(contentsOf: url) else { return nil }
        return try? APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: datos)
    }
}

/// La portada en plano: lo que ve el atleta si el scroll fuera infinito, cortada en dos tramos (una
/// imagen de todo el scroll no cabe en una textura). El alto es el natural: en la pantalla el sujeto
/// vive en un scroll y tampoco absorbe nada.
struct AnaliticasGaleria: View {
    enum Tramo {
        /// La cabecera, el selector, el sujeto, Forma y fatiga y Semana a semana.
        case arriba
        /// Intensidad, Progreso, Récords, Carrera y Recuperación.
        case abajo

        var bloques: [BloqueDelPanel] {
            switch self {
            case .arriba: return [.forma, .semanas]
            case .abajo: return [.intensidad, .progreso, .records, .carrera, .recuperacion]
            }
        }
    }

    let panel: PanelAnaliticas
    var tramo: Tramo = .arriba
    var ancho: CGFloat = 402

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if tramo == .arriba {
                AnaliticasCabecera(sobretitulo: panel.ventana.clave.frase, titulo: AppTab.analiticas.title)
                    .padding(.bottom, Theme.Spacing.m)
                AnaliticasSelectorVentana(ventana: .constant(panel.ventana.clave))
                    .padding(.vertical, Theme.Spacing.m - 2)
            }
            AnaliticasPortadaCuerpo(panel: panel, ancho: ancho - 2 * Theme.Spacing.pantalla, animado: false,
                                    onGlosa: {}, onSalida: { _ in }, onAbrir: { _ in },
                                    bloques: tramo.bloques, conSujeto: tramo == .arriba)
                .padding(.top, tramo == .arriba ? Theme.Spacing.m : Theme.Spacing.s)
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.bottom, Theme.Spacing.xl)
        .frame(width: ancho, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .background(Theme.Color.background)
    }
}

/// Un panel de ejemplo o, si el árbol de fuentes no está a mano, un aviso (una preview no debe romper).
private struct PortadaDeEjemplo: View {
    let atleta: AnaliticasEjemplos.Atleta
    var body: some View {
        if let panel = AnaliticasEjemplos.panel(atleta) {
            ScrollView {
                VStack(spacing: 0) {
                    AnaliticasGaleria(panel: panel, tramo: .arriba)
                    AnaliticasGaleria(panel: panel, tramo: .abajo)
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            Text("Sin fixture de \(atleta.rawValue)").padding()
        }
    }
}

#Preview("Portada · lleno · fábrica") { PortadaDeEjemplo(atleta: .lleno) }
#Preview("Portada · lleno · oscuro") { PortadaDeEjemplo(atleta: .lleno).environment(\.colorScheme, .dark) }
#Preview("Portada · mixto") { PortadaDeEjemplo(atleta: .mixto) }
#Preview("Portada · poco dato") { PortadaDeEjemplo(atleta: .poco) }
#Preview("Portada · vacío") { PortadaDeEjemplo(atleta: .vacio) }
#Preview("Portada · viejo") { PortadaDeEjemplo(atleta: .viejo) }
#Preview("Portada · lleno · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    PortadaDeEjemplo(atleta: .lleno)
}
#Preview("Portada · cargando") {
    ScrollView { AnaliticasPortadaEsqueleto().padding(Theme.Spacing.pantalla) }.background(Theme.Color.background)
}
#Preview("Portada · error") {
    ScrollView { AnaliticasPortadaError(onReintentar: {}).padding(Theme.Spacing.pantalla) }.background(Theme.Color.background)
}
#endif
