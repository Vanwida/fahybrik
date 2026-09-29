import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA PORTADA DE ANALÍTICAS, RENDERIZADA DE VERDAD — la herramienta de REVISIÓN.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen: falla si una pieza revienta al
// pintarse, y deja los PNG donde se pueden abrir y COMPARAR con las capturas del doble
// (`analiticas-portada-*` en el doble vivo): los cinco atletas del motor en claro y en oscuro, con el
// acento de fábrica y con el de un club azul y uno amarillo, sobre el lienzo del iPhone 17 Pro (402 pt).
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`) y van
// además como adjuntos del resultado. `ImageRenderer` no ejecuta `onAppear` ni dibuja un `ScrollView`: por
// eso la galería es la pantalla en plano y el arco de la disposición se pide sin animar.
final class AnaliticasGaleriaRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

    /// Claro y oscuro con el acento de fábrica y con un azul (tinta clara) y un amarillo (tinta oscura): los
    /// extremos del abanico de clubes.
    private static let variantes: [Variante] = [
        Variante(nombre: "claro", esquema: .light, club: nil),
        Variante(nombre: "oscuro", esquema: .dark, club: nil),
        Variante(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        Variante(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
        Variante(nombre: "claro-amarillo", esquema: .light, club: .pruebaAmarillo),
        Variante(nombre: "oscuro-amarillo", esquema: .dark, club: .pruebaAmarillo),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    @MainActor
    private func renderiza(_ nombre: String, variantes: [Variante] = AnaliticasGaleriaRenderTests.variantes, @ViewBuilder _ vista: () -> some View) {
        for v in variantes {
            ClubThemeStore.update(v.club)
            let renderer = ImageRenderer(
                content: vista()
                    .frame(width: Self.ancho)
                    .background { Theme.Color.background }
                    .environment(\.colorScheme, v.esquema)
            )
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                XCTFail("\(nombre) no se pudo pintar en \(v.nombre)")
                continue
            }
            XCTAssertGreaterThan(imagen.size.height, 200, "\(nombre) en \(v.nombre) salió vacía")

            let etiqueta = "\(nombre)-\(v.nombre)"
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = etiqueta
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(etiqueta).png"))
            }
        }
    }

    @MainActor
    private func portada(_ atleta: AnaliticasFixtures.Atleta, _ ventana: VentanaClave = .doceSemanas, variantes: [Variante] = AnaliticasGaleriaRenderTests.variantes) throws {
        let panel = try AnaliticasFixtures.panel(atleta, ventana)
        renderiza("portada-\(atleta.rawValue)-\(ventana.rawValue)-a", variantes: variantes) { AnaliticasGaleria(panel: panel, tramo: .arriba, ancho: Self.ancho) }
        renderiza("portada-\(atleta.rawValue)-\(ventana.rawValue)-b", variantes: variantes) { AnaliticasGaleria(panel: panel, tramo: .abajo, ancho: Self.ancho) }
    }

    // MARK: - Los cinco atletas del motor, a 12 semanas

    @MainActor func testLleno() throws { try portada(.lleno) }
    @MainActor func testMixto() throws { try portada(.mixto) }
    @MainActor func testPoco() throws { try portada(.poco) }
    @MainActor func testVacio() throws { try portada(.vacio) }
    @MainActor func testViejo() throws { try portada(.viejo) }

    // MARK: - Las otras ventanas: todo obedece al selector (claro y oscuro de fábrica)

    @MainActor func testLlenoSieteDias() throws { try portada(.lleno, .sieteDias, variantes: Array(Self.variantes.prefix(2))) }
    @MainActor func testLlenoUnAno() throws { try portada(.lleno, .unAno, variantes: Array(Self.variantes.prefix(2))) }
    @MainActor func testLlenoTodo() throws { try portada(.lleno, .todo, variantes: Array(Self.variantes.prefix(2))) }

    // MARK: - Cargando y error

    @MainActor func testCargando() {
        renderiza("portada-cargando", variantes: Array(Self.variantes.prefix(2))) { AnaliticasPortadaEsqueleto().padding(Theme.Spacing.pantalla) }
    }

    @MainActor func testError() {
        renderiza("portada-error", variantes: Array(Self.variantes.prefix(2))) { AnaliticasPortadaError(onReintentar: {}).padding(Theme.Spacing.pantalla) }
    }

    // MARK: - La glosa, y el texto del sistema en sus dos extremos

    @MainActor func testGlosa() {
        renderiza("portada-glosa", variantes: Array(Self.variantes.prefix(2))) { AnaliticasGlosa(metodo: .porDefecto, onCerrar: {}).frame(height: 700) }
    }

    @MainActor func testSujetoYSeccionConElTextoDelSistemaEnSusDosExtremos() throws {
        let panel = try AnaliticasFixtures.panel(.lleno)
        let sujeto = SujetoEstado.desde(panel, bloque: .lleno)
        for (sufijo, tamano) in [("xs", DynamicTypeSize.xSmall), ("ax3", .accessibility3)] {
            ClubThemeStore.update(nil)
            let renderer = ImageRenderer(
                content: VStack(alignment: .leading, spacing: 30) {
                    AnaliticasSujeto(sujeto: sujeto, animado: false, onGlosa: {}, onSalida: { _ in })
                    AnaliticasSeccion(titulo: "Récords", pregunta: "7 marcas · 7 nuevas en esta ventana", onAbrir: {}) {
                        AnaliticasHueco(texto: AnaliticasEstados.pendiente, onSalida: { _ in })
                    }
                }
                .padding(Theme.Spacing.pantalla)
                .environment(\.dynamicTypeSize, tamano)
                .frame(width: Self.ancho)
                .fixedSize(horizontal: false, vertical: true)
                .background { Theme.Color.background }
            )
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else { XCTFail("no se pudo pintar a \(sufijo)"); continue }
            XCTAssertGreaterThan(imagen.size.height, 200)
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = "portada-sujeto-claro-\(sufijo)"
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("portada-sujeto-claro-\(sufijo).png"))
            }
        }
    }
}
