import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE «EL DÍA», RENDERIZADA DE VERDAD — la herramienta de REVISIÓN del kit.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen (una tipografía que se mueve
// medio punto no es un fallo, es lo que hay que MIRAR). Falla si una pieza revienta al pintarse, y de
// paso deja los PNG donde se pueden abrir: cada sección del kit en claro y en oscuro, con el acento de
// fábrica y con otro de club, sobre el lienzo del iPhone 17 Pro (402 pt dentro del área segura).
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`),
// y van además como adjuntos del resultado de la prueba.
//
// `ImageRenderer` no dibuja `ScrollView` ni ejecuta `onAppear`: por eso las secciones de la galería
// son pilas planas y el anillo se pide `animado: false`.

final class GaleriaDiaRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

    /// Claro y oscuro, con el acento de fábrica y con un azul (tinta clara) y un amarillo (tinta oscura,
    /// texto de acento que no se lee sobre blanco): los tres extremos del abanico.
    private static let variantes: [Variante] = [
        Variante(nombre: "claro-fabrica", esquema: .light, club: nil),
        Variante(nombre: "oscuro-fabrica", esquema: .dark, club: nil),
        Variante(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        Variante(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
        Variante(nombre: "claro-amarillo", esquema: .light, club: .pruebaAmarillo),
        Variante(nombre: "oscuro-amarillo", esquema: .dark, club: .pruebaAmarillo),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    // MARK: - Una sección en todas las variantes

    @MainActor
    private func renderiza(_ seccion: String, @ViewBuilder _ vista: () -> some View) {
        for v in Self.variantes {
            ClubThemeStore.update(v.club)
            let renderer = ImageRenderer(
                content: vista()
                    .padding(Theme.Spacing.pantalla)
                    .frame(width: Self.ancho)
                    .background { Theme.Color.background }
                    .environment(\.colorScheme, v.esquema)
            )
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                XCTFail("\(seccion) no se pudo pintar en \(v.nombre)")
                continue
            }
            XCTAssertGreaterThan(imagen.size.height, 40, "\(seccion) en \(v.nombre) salió vacía")

            let nombre = "\(seccion)-\(v.nombre)"
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
    }

    /// Una sección a un tamaño de texto concreto: las dos puntas del sistema (Muy pequeño y accesibilidad 3),
    /// para ver que ni el suelo de 15 pt ni el bloque del sujeto se rompen. Sólo claro y de fábrica: es una
    /// prueba de MEDIDAS, no de color.
    @MainActor
    private func renderizaATamanos(_ seccion: String, @ViewBuilder _ vista: () -> some View) {
        let tamanos: [(String, DynamicTypeSize)] = [("xs", .xSmall), ("ax3", .accessibility3)]
        ClubThemeStore.update(nil)
        for (sufijo, tamano) in tamanos {
            let renderer = ImageRenderer(
                content: vista()
                    .padding(Theme.Spacing.pantalla)
                    .frame(width: Self.ancho)
                    .background { Theme.Color.background }
                    .environment(\.dynamicTypeSize, tamano)
            )
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                XCTFail("\(seccion) no se pudo pintar a tamaño \(sufijo)")
                continue
            }
            XCTAssertGreaterThan(imagen.size.height, 40)
            let nombre = "\(seccion)-claro-fabrica-\(sufijo)"
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
    }

    // MARK: - Las secciones

    @MainActor func testEscalaTipografica() { renderiza("01-tipos") { GaleriaDia.Tipos() } }
    @MainActor func testSujetosDeMomento() { renderiza("02-sujetos-momento") { GaleriaDia.SujetosActivos() } }
    @MainActor func testSujetosDeEstado() { renderiza("03-sujetos-estado") { GaleriaDia.SujetosDeEstado() } }
    @MainActor func testCabeceraYLineaDelDia() { renderiza("04-cabecera") { GaleriaDia.Cabecera() } }
    @MainActor func testDisposicionYContigo() { renderiza("05-disposicion-contigo") { GaleriaDia.Disposicion() } }
    @MainActor func testTeselasPastillasYRegletas() { renderiza("06-teselas") { GaleriaDia.Teselas() } }
    @MainActor func testPosters() { renderiza("07-posters") { GaleriaDia.Posters() } }
    @MainActor func testAvisos() { renderiza("08-avisos") { GaleriaDia.Avisos() } }
    @MainActor func testSujetosATamanosDeTextoExtremos() {
        renderizaATamanos("10-sujetos-tamanos") { GaleriaDia.SujetosActivos() }
        renderizaATamanos("11-teselas-tamanos") { GaleriaDia.Teselas() }
    }
    @MainActor func testPantallaCorta() { renderiza("09-pantalla-corta") { GaleriaDia.PantallaCorta() } }
}
