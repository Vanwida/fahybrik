import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA HERRAMIENTA DE REVISIÓN DE LAS GALERÍAS — una sola para la portada y para los detalles de Analíticas.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen: falla si una pieza revienta al pintarse (o sale vacía), y deja
// los PNG donde se pueden abrir y COMPARAR con las capturas del doble, sobre el lienzo del iPhone 17 Pro (402 pt).
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`) y van además como adjuntos del
// resultado. `ImageRenderer` no ejecuta `onAppear` ni dibuja un `ScrollView`: por eso las galerías son la pantalla en plano.

struct VarianteDeGaleria {
    let nombre: String
    let esquema: ColorScheme
    let club: ClubTheme?

    /// Claro y oscuro con el acento de fábrica y con un azul (tinta clara) y un amarillo (tinta oscura): los extremos del abanico de
    /// clubes.
    static let todas: [VarianteDeGaleria] = [
        VarianteDeGaleria(nombre: "claro", esquema: .light, club: nil),
        VarianteDeGaleria(nombre: "oscuro", esquema: .dark, club: nil),
        VarianteDeGaleria(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        VarianteDeGaleria(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
        VarianteDeGaleria(nombre: "claro-amarillo", esquema: .light, club: .pruebaAmarillo),
        VarianteDeGaleria(nombre: "oscuro-amarillo", esquema: .dark, club: .pruebaAmarillo),
    ]

    /// Fábrica y azul, en claro y en oscuro: lo que se revisa pantalla a pantalla.
    static let cuatro: [VarianteDeGaleria] = Array(todas.prefix(4))
    /// Las dos de fábrica.
    static let dos: [VarianteDeGaleria] = Array(todas.prefix(2))
    /// Los dos extremos de tinta del acento (la clara sobre claro y la oscura sobre oscuro no son la misma tinta).
    static let extremos: [VarianteDeGaleria] = Array(todas.suffix(2))
}

extension XCTestCase {
    /// Dónde dejar los PNG; nulo si no se ha pedido.
    var carpetaDeCapturas: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    /// Pinta `vista` en cada variante, comprueba que no sale vacía y la deja como PNG y como adjunto.
    @MainActor
    func renderizaGaleria(
        _ nombre: String,
        variantes: [VarianteDeGaleria] = VarianteDeGaleria.todas,
        ancho: CGFloat = 402,
        tamanoDeTexto: DynamicTypeSize? = nil,
        @ViewBuilder _ vista: () -> some View
    ) {
        defer { ClubThemeStore.clear() }
        for v in variantes {
            ClubThemeStore.update(v.club)
            let renderer = ImageRenderer(
                content: vista()
                    .environment(\.dynamicTypeSize, tamanoDeTexto ?? .large)
                    .frame(width: ancho)
                    .fixedSize(horizontal: false, vertical: true)
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
            if let carpetaDeCapturas {
                try? FileManager.default.createDirectory(at: carpetaDeCapturas, withIntermediateDirectories: true)
                try? png.write(to: carpetaDeCapturas.appendingPathComponent("\(etiqueta).png"))
            }
        }
    }
}
