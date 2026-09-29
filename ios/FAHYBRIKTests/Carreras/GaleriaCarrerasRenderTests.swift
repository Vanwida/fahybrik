import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE «CARRERAS», RENDERIZADA DE VERDAD — la herramienta de REVISIÓN de la pestaña.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen (una tipografía que se mueve medio
// punto no es un fallo, es lo que hay que MIRAR). Falla si una pieza revienta al pintarse, y de paso
// deja los PNG donde se pueden abrir: cada uno de los veinte casos del doble en claro y en oscuro, con
// el acento de fábrica y con el de un club azul, sobre el lienzo del iPhone 17 Pro (402 pt), para
// ponerlos al lado de las capturas del doble.
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`),
// y van además como adjuntos del resultado de la prueba.
//
// `ImageRenderer` no dibuja `ScrollView` ni ejecuta `onAppear`: por eso se renderiza el CUERPO de la
// pestaña (`CarrerasContenido`, una pila plana que no sabe de dónde salen sus datos) y no la pestaña
// entera, con su cromo fijo encima.
final class GaleriaCarrerasRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro", esquema: .light, club: nil),
        Variante(nombre: "oscuro", esquema: .dark, club: nil),
        Variante(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        Variante(nombre: "oscuro-amarillo", esquema: .dark, club: .pruebaAmarillo),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    @MainActor
    private func guarda(_ vista: some View, nombre: String, tamano: DynamicTypeSize? = nil, esquema: ColorScheme, club: ClubTheme?) {
        ClubThemeStore.update(club)
        let renderer = ImageRenderer(
            content: vista
                .frame(width: Self.ancho)
                .background { Theme.Color.background }
                .environment(\.colorScheme, esquema)
                .environment(\.dynamicTypeSize, tamano ?? .large)
        )
        renderer.scale = 2
        guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
            return XCTFail("\(nombre) no se pudo pintar")
        }
        XCTAssertGreaterThan(imagen.size.height, 100, "\(nombre) salió vacía")
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    /// La pestaña como se ve: el cromo fijo y el cuerpo.
    private func pestana(_ l: LecturaCarreras) -> some View {
        VStack(spacing: 0) {
            CromoCarreras(conCoach: l.conCoach, noLeidos: l.noLeidosChat, alChat: {})
            CarrerasContenido(lectura: l)
        }
    }

    // MARK: Los veinte casos

    @MainActor
    func testLosVeinteCasosEnClaroYOscuroYConOtrosAcentosDeClub() {
        for (i, caso) in CasosCarreras.todos.enumerated() {
            for v in Self.variantes {
                // Los acentos de prueba solo hacen falta donde el acento pesa: el lleno, el vacío, el de
                // ayer y el que no tiene tiempo fijado.
                if v.club != nil, !["lleno", "vacio", "ayer", "sin-coach", "solo-historial"].contains(caso.id) { continue }
                guarda(pestana(caso.lectura), nombre: String(format: "%02d-%@-%@", i + 1, caso.id, v.nombre), esquema: v.esquema, club: v.club)
            }
        }
    }

    /// Los tamaños de texto extremos del sistema: nada se sale ni se parte por la mitad de una palabra.
    /// A «Accesibilidad 3» un cuerpo entero pasa del límite de alto de una imagen, así que ahí solo se
    /// miran los casos cortos (el vacío, el esqueleto y el error, que son un sujeto solo).
    @MainActor
    func testLosCasosClaveATamanosDeTextoExtremos() {
        for id in ["lleno", "vacio", "ayer", "varios"] {
            guarda(pestana(CasosCarreras.caso(id).lectura), nombre: "xs-\(id)", tamano: .xSmall, esquema: .light, club: nil)
        }
        for id in ["vacio", "cargando", "error"] {
            guarda(pestana(CasosCarreras.caso(id).lectura), nombre: "ax3-\(id)", tamano: .accessibility3, esquema: .light, club: nil)
        }
    }
}
