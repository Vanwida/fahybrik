import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE «PERFIL», RENDERIZADA DE VERDAD — la herramienta de REVISIÓN de la pestaña.
//
// No es una prueba de píxeles y NO falla por una diferencia de imagen (una tipografía que se mueve medio
// punto no es un fallo, es lo que hay que MIRAR). Falla si una pieza revienta al pintarse, y de paso deja
// los PNG donde se pueden abrir: cada uno de los veinte casos del doble en claro y en oscuro, con el
// acento de fábrica y con el de un club azul y uno amarillo, sobre el lienzo del iPhone 17 Pro (402 pt),
// para ponerlos al lado de las capturas del doble.
//
// Los PNG se escriben en `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`), y
// van además como adjuntos del resultado de la prueba. Se fotografía la pestaña montada como la monta la
// app (`FillingScreen` + su cuerpo) en una ventana de verdad; ver `CapturaVentana`.
final class GaleriaPerfilRenderTests: XCTestCase {

    /// El alto de un iPhone 17 Pro: la ventana es del tamaño de la pantalla y el scroll hace el resto.
    private static let altoDelTelefono: CGFloat = 874

    private struct Variante {
        let nombre: String
        let oscuro: Bool
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro", oscuro: false, club: nil),
        Variante(nombre: "oscuro", oscuro: true, club: nil),
        Variante(nombre: "claro-azul", oscuro: false, club: .pruebaAzul),
        Variante(nombre: "oscuro-amarillo", oscuro: true, club: .pruebaAmarillo),
    ]

    /// Los acentos de prueba solo hacen falta donde el acento pesa: el sujeto, el tinte de una tesela o de
    /// la fila de COROS, el vacío de las cifras.
    private static let casosConClub: Set<String> = ["veterano", "alta", "tests-a-medias", "coros", "denso", "libre-alta"]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    /// La pestaña como la monta la app: el cuerpo dentro de `FillingScreen`. Los casos con aviso de COROS
    /// lo llevan sobre la parte de abajo, como sale sobre la barra de pestañas.
    private func pestana(_ caso: CasoPerfil) -> some View {
        FillingScreen { PerfilContenido(lectura: caso.lectura) }
            .background(Theme.Color.background)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let aviso = caso.aviso {
                    AvisoDia(tono: aviso.tono == .ok ? .ok : .fallo, texto: aviso.texto, alCerrar: {})
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.bottom, Theme.Spacing.m)
                }
            }
    }

    // MARK: Los veinte casos

    @MainActor
    func testLosVeinteCasosEnClaroYOscuroYConOtrosAcentosDeClub() {
        for (i, caso) in CasosPerfil.todos.enumerated() {
            for v in Self.variantes {
                if v.club != nil, !Self.casosConClub.contains(caso.id) { continue }
                // Con un aviso sobre las pestañas la captura es la primera pantalla, que es donde sale.
                let png = CapturaVentana.png(
                    pestana(caso), alto: Self.altoDelTelefono, oscuro: v.oscuro, club: v.club, entera: caso.aviso == nil
                )
                CapturaVentana.guarda(png, nombre: String(format: "%02d-%@-%@", i + 1, caso.id, v.nombre), en: self)
            }
        }
    }

    /// Los tamaños de texto extremos del sistema: nada se sale ni se parte por la mitad de una palabra. A
    /// «Accesibilidad 3» un cuerpo entero pasa del límite de alto de una imagen, así que ahí solo se mira
    /// la primera pantalla.
    @MainActor
    func testLosCasosClaveATamanosDeTextoExtremos() {
        for id in ["veterano", "alta", "largos", "coros"] {
            let png = CapturaVentana.png(pestana(CasosPerfil.caso(id)), alto: Self.altoDelTelefono, tamano: .xSmall, entera: true)
            CapturaVentana.guarda(png, nombre: "xs-\(id)", en: self)
        }
        for id in ["veterano", "alta", "largos", "coros", "cargando", "error"] {
            let png = CapturaVentana.png(pestana(CasosPerfil.caso(id)), alto: Self.altoDelTelefono, tamano: .accessibility3, entera: false)
            CapturaVentana.guarda(png, nombre: "ax3-\(id)", en: self)
        }
    }

    // MARK: Lo que la captura no dice

    /// El nombre largo baja de tamaño en vez de ganar una tercera línea: una captura lo enseña, esto lo
    /// mide (el sujeto ocupa más o menos según cuántas líneas tenga el título).
    @MainActor
    func testUnNombreLargoNoGanaUnaTerceraLinea() {
        func alto(_ texto: String) -> CGFloat {
            let anfitrion = UIHostingController(
                rootView: TituloDia(texto, ajuste: .reduce()).environment(\.tonoDia, .acento).frame(width: 318)
            )
            return anfitrion.sizeThatFits(in: CGSize(width: 318, height: 10_000)).height
        }
        let unaLinea = alto("Nora")
        let largo = alto("Alejandro Sánchez-Villanueva Ortega")
        XCTAssertGreaterThan(largo, unaLinea, "un nombre de 35 letras ocupa más que uno corto")
        XCTAssertLessThan(largo, unaLinea * 2.6, "…pero como mucho dos líneas: \(largo) contra \(unaLinea) de una")
    }
}
