import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA PORTADA DE HOY, RENDERIZADA DE VERDAD — la herramienta de REVISIÓN contra el doble.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen (medio punto de tipografía no es un
// fallo, es lo que hay que MIRAR). Falla si una pantalla revienta al pintarse, y de paso deja los PNG
// donde se pueden abrir: los catorce casos del doble (más los estados que solo tiene la app), cada uno en
// claro y en oscuro, con el acento de fábrica y con otros dos de club (un azul de tinta clara y un
// amarillo de tinta oscura, los dos extremos del abanico), sobre el ancho del iPhone 17 Pro (402 pt).
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`), y
// van además como adjuntos del resultado. `ImageRenderer` no dibuja `ScrollView` ni ejecuta `onAppear`:
// por eso se pinta `HoyCasos.Pantalla` —el cromo y el cuerpo sin scroll— a la altura del lienzo útil del
// iPhone, donde el sobrante entra en el sujeto igual que dentro del `FillingScreen` real.

final class HoyGaleriaRenderTests: XCTestCase {

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
        Variante(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
        Variante(nombre: "claro-amarillo", esquema: .light, club: .pruebaAmarillo),
        Variante(nombre: "oscuro-amarillo", esquema: .dark, club: .pruebaAmarillo),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private func guarda(_ png: Data, nombre: String) {
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    @MainActor
    private func pinta(
        _ caso: CasoHoy, indice: String, variante v: Variante,
        tamano: DynamicTypeSize? = nil, llenaHasta alto: CGFloat? = nil, sufijo: String = ""
    ) {
        ClubThemeStore.update(v.club)
        // Sin `alto`, la pantalla a su altura natural (lo que el `ScrollView` real le da: nada la aprieta).
        // Con `alto`, un lienzo más alto que ella: el sobrante tiene que entrar en el sujeto.
        let pantalla = HoyCasos.Pantalla(lectura: caso.lectura).frame(width: Self.ancho, alignment: .top)
        var contenido = AnyView(
            Group {
                if let alto {
                    pantalla.frame(minHeight: alto, alignment: .top)
                } else {
                    pantalla.fixedSize(horizontal: false, vertical: true)
                }
            }
            .background { Theme.Color.background }
            .environment(\.colorScheme, v.esquema)
        )
        if let tamano { contenido = AnyView(contenido.environment(\.dynamicTypeSize, tamano)) }
        let renderer = ImageRenderer(content: contenido)
        renderer.scale = 2
        guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
            return XCTFail("\(caso.id) no se pudo pintar en \(v.nombre)")
        }
        XCTAssertGreaterThan(imagen.size.height, 300, "\(caso.id) en \(v.nombre) salió vacío")
        guarda(png, nombre: "hoy-\(indice)-\(caso.id)-\(v.nombre)\(sufijo)")
    }

    // MARK: - Los catorce del doble, en las seis variantes

    @MainActor
    func testLosCatorceCasosSePintanEnClaroYOscuroConTresAcentes() {
        for (i, caso) in HoyCasos.todos.enumerated() {
            for v in Self.variantes {
                pinta(caso, indice: String(format: "%02d", i + 1), variante: v)
            }
        }
    }

    // MARK: - Los estados que solo tiene la app

    @MainActor
    func testLosEstadosExtraDeLaAppSePintan() {
        for (i, caso) in HoyCasos.extras.enumerated() {
            for v in Self.variantes.prefix(2) {
                pinta(caso, indice: String(format: "x%02d", i + 1), variante: v)
            }
        }
    }

    // MARK: - Las dos puntas del texto del sistema

    /// Una prueba de MEDIDAS, no de color: con «Muy pequeño» y «Accesibilidad 3» ni el suelo de 15 pt ni el
    /// bloque del sujeto se rompen. Solo claro y de fábrica.
    @MainActor
    func testLosMomentosMasCargadosAguantanLosTamanosDeTextoExtremos() {
        let claro = Self.variantes[0]
        for id in ["listo", "manana", "doble", "avisos", "alta", "libre"] {
            guard let caso = HoyCasos.todos.first(where: { $0.id == id }) else { return XCTFail(id) }
            pinta(caso, indice: "t", variante: claro, tamano: .xSmall, sufijo: "-xs")
            pinta(caso, indice: "t", variante: claro, tamano: .accessibility3, sufijo: "-ax3")
        }
    }

    // MARK: - El sobrante entra en el sujeto

    /// La estrategia `llena` (CONTRATO-UI §6.1): en una pantalla más alta que su contenido, el sobrante lo
    /// absorbe el sujeto —entre su título y su acción— y no una cola muerta debajo. Se pinta a 1.000 pt, más
    /// alto que el caso más corto.
    @MainActor
    func testElSobranteEntraEnElSujetoYNoEnUnaColaMuerta() {
        let claro = Self.variantes[0]
        for id in ["libre", "descanso", "listo"] {
            guard let caso = HoyCasos.todos.first(where: { $0.id == id }) else { return XCTFail(id) }
            pinta(caso, indice: "alto", variante: claro, llenaHasta: 1000, sufijo: "-1000")
        }
    }
}
