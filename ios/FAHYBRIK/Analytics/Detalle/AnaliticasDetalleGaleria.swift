#if DEBUG
import SwiftUI

// LA GALERÍA DEL DETALLE — cada pantalla de detalle entera y en plano (sin scroll), para las `#Preview` y para las pruebas que dejan
// los PNG (`AnaliticasDetalleGaleriaRenderTests`). `ImageRenderer` no dibuja un `ScrollView`: la galería apila lo mismo que la pantalla
// (`AnaliticasPantalla`): «‹ Analíticas», cabecera, selector de ventana y cuerpo. El cuerpo es EL de la pantalla, no una copia.
//
// Los casos de ejemplo NO son datos de producción: son la respuesta REAL del motor (`progresoAtleta`, `preciarSesion`,
// `cumplimientoDeSesion`) volcada con cinco atletas sintéticos (`FAHYBRIKTests/Analytics/Detalle/Fixtures`). Una sola fuente para las
// pruebas y para las previews: la preview los lee del árbol de fuentes por su ruta (`#filePath`), y por eso esto solo existe en Debug.

enum DetalleEjemplos {
    /// Las cinco sesiones del volcado: cuatro del plan y una importada de Salud, sin plan.
    enum Sesion: String, CaseIterable {
        case cinta = "cinta-4x1000"
        case remo = "remo-5x500"
        case sentadilla = "sentadilla-4x5"
        case trineos = "fuerza-trineos"
        case carreraDeSalud = "carrera-salud"
    }

    private static func datos(_ nombre: String) -> Data? {
        let raiz = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Detalle
            .deletingLastPathComponent()  // Analytics
            .deletingLastPathComponent()  // FAHYBRIK
            .deletingLastPathComponent()  // ios
        return try? Data(contentsOf: raiz.appendingPathComponent("FAHYBRIKTests/Analytics/Detalle/Fixtures/\(nombre).json"))
    }

    private static func decodifica<T: Decodable>(_ nombre: String) -> T? {
        datos(nombre).flatMap { try? APIClient.makeJSONDecoder().decode(T.self, from: $0) }
    }

    static func detalle(_ familia: FamiliaDeDetalle, _ atleta: AnaliticasEjemplos.Atleta) -> DetalleAnaliticas? {
        decodifica("detalle-\(familia.rawValue)-\(atleta.rawValue)-12s")
    }

    static func sesion(_ caso: Sesion) -> DetalleDeSesion? { decodifica("sesion-\(caso.rawValue)") }

    static func cumplimiento() -> CumplimientoAnaliticas? { decodifica("cumplimiento-lleno-12s") }
}

/// El marco común de la galería: lo que rodea al cuerpo en la pantalla de verdad.
private struct MarcoDeGaleria<Cuerpo: View>: View {
    let sobretitulo: String
    let titulo: String
    /// Nula = la pantalla no obedece a la ventana (una sesión es un día).
    var ventana: VentanaClave? = nil
    var ancho: CGFloat
    @ViewBuilder let cuerpo: (CGFloat) -> Cuerpo

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack { AtrasDia(texto: AppTab.analiticas.title, accion: {}); Spacer() }
                .padding(.horizontal, Theme.Spacing.s)
            AnaliticasCabecera(sobretitulo: sobretitulo, titulo: titulo)
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.bottom, Theme.Spacing.m)
            if let ventana {
                AnaliticasSelectorVentana(ventana: .constant(ventana))
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.m - 2)
            }
            cuerpo(ancho - 2 * Theme.Spacing.pantalla)
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
        }
        .frame(width: ancho, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .background(Theme.Color.background)
    }
}

/// El detalle de una familia, en plano.
struct AnaliticasFamiliaGaleria: View {
    let detalle: DetalleAnaliticas
    let familia: FamiliaDeDetalle
    var cumplimiento: CumplimientoAnaliticas? = nil
    var panel: PanelAnaliticas? = nil
    var ancho: CGFloat = 402

    var body: some View {
        MarcoDeGaleria(sobretitulo: detalle.ventana.clave.frase, titulo: TextosDeFamilia.titulo(familia), ventana: detalle.ventana.clave, ancho: ancho) { util in
            AnaliticasFamiliaCuerpo(
                detalle: detalle, familia: familia, cumplimiento: cumplimiento, panel: panel, ancho: util,
                maquina: familia.esErgo ? .constant(familia) : nil, onSalida: { _ in }
            )
        }
    }
}

/// El detalle de un bloque de la portada (Semana a semana, Récords, Carrera), en plano.
struct AnaliticasBloqueGaleria: View {
    let bloque: BloqueDelPanel
    let panel: PanelAnaliticas
    var cumplimiento: CumplimientoAnaliticas? = nil
    var ancho: CGFloat = 402

    var body: some View {
        MarcoDeGaleria(sobretitulo: panel.ventana.clave.frase, titulo: bloque.titulo, ventana: panel.ventana.clave, ancho: ancho) { util in
            AnaliticasBloqueDetalleCuerpo(bloque: bloque, panel: panel, cumplimiento: cumplimiento, ancho: util, onSalida: { _ in }, onAbrir: { _ in })
        }
    }
}

/// La sesión, en plano.
struct AnaliticasSesionGaleria: View {
    let lectura: LecturaDeSesion
    var ancho: CGFloat = 402

    var body: some View {
        MarcoDeGaleria(sobretitulo: lectura.sobretitulo, titulo: lectura.titulo, ancho: ancho) { util in
            AnaliticasCuerpoDeSesion(lectura: lectura, ancho: util)
        }
    }
}

// MARK: - Previews: un estado, una preview

/// Una preview no debe romper si el árbol de fuentes no está a mano: dice qué falta.
private struct ConEjemplo<Ejemplo, Contenido: View>: View {
    let ejemplo: Ejemplo?
    let nombre: String
    @ViewBuilder let contenido: (Ejemplo) -> Contenido

    var body: some View {
        if let ejemplo { ScrollView { contenido(ejemplo).frame(maxWidth: .infinity) } } else { Text("Sin fixture de \(nombre)").padding() }
    }
}

private func previewDeFamilia(_ familia: FamiliaDeDetalle, _ atleta: AnaliticasEjemplos.Atleta) -> some View {
    ConEjemplo(ejemplo: DetalleEjemplos.detalle(familia, atleta), nombre: "\(familia.rawValue) · \(atleta.rawValue)") { detalle in
        AnaliticasFamiliaGaleria(detalle: detalle, familia: familia, cumplimiento: DetalleEjemplos.cumplimiento(), panel: AnaliticasEjemplos.panel(atleta))
    }
}

private func previewDeSesion(_ caso: DetalleEjemplos.Sesion) -> some View {
    ConEjemplo(ejemplo: DetalleEjemplos.sesion(caso), nombre: caso.rawValue) { sesion in
        let cumplimiento = DetalleEjemplos.cumplimiento()
        let fila = cumplimiento?.sesiones.first { $0.executionId == sesion.executionId }
        AnaliticasSesionGaleria(lectura: LecturaDeSesion.desde(sesion, fila: fila, hoy: "2026-09-29"))
    }
}

#Preview("Correr · lleno") { previewDeFamilia(.correr, .lleno) }
#Preview("Correr · vacío") { previewDeFamilia(.correr, .vacio) }
#Preview("Correr · dato viejo") { previewDeFamilia(.correr, .viejo) }
#Preview("Ergo · remo") { previewDeFamilia(.remo, .lleno) }
#Preview("Ergo · bici declarada") { previewDeFamilia(.bici, .lleno) }
#Preview("Fuerza · lleno") { previewDeFamilia(.fuerza, .lleno) }
#Preview("Estaciones · lleno") { previewDeFamilia(.estaciones, .lleno) }
#Preview("Sesión · cinta 4×1000") { previewDeSesion(.cinta) }
#Preview("Sesión · sentadilla") { previewDeSesion(.sentadilla) }
#Preview("Sesión · carga que no se sabe") { previewDeSesion(.trineos) }
#Preview("Sesión · importada de Salud") { previewDeSesion(.carreraDeSalud) }
#Preview("Correr · lleno · club azul · oscuro") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    previewDeFamilia(.correr, .lleno).environment(\.colorScheme, .dark)
}
#Preview("Detalle · cargando") {
    ScrollView { AnaliticasDetalleEsqueleto().padding(Theme.Spacing.pantalla) }.background(Theme.Color.background)
}
#Preview("Detalle · error") {
    ScrollView {
        AnaliticasErrorDeCarga(kicker: "Correr", titulo: AnaliticasFamiliaView.tituloDelError, onReintentar: {}).padding(Theme.Spacing.pantalla)
    }
    .background(Theme.Color.background)
}
#endif
