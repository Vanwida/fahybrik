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
// y van además como adjuntos del resultado de la prueba. Se fotografía la pestaña montada como la monta
// la app (cromo fijo + `FillingScreen`) en una ventana de verdad; ver `CapturaVentana`.
final class GaleriaCarrerasRenderTests: XCTestCase {

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

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    /// La pestaña como la monta la app: el cromo fijo y el cuerpo dentro de `FillingScreen`.
    private func pestana(_ l: LecturaCarreras) -> some View {
        VStack(spacing: 0) {
            CromoCarreras(conCoach: l.conCoach, noLeidos: l.noLeidosChat, alChat: {})
            FillingScreen { CarrerasContenido(lectura: l) }
        }
        .background(Theme.Color.background)
    }

    // MARK: Los veinte casos

    @MainActor
    func testLosVeinteCasosEnClaroYOscuroYConOtrosAcentosDeClub() {
        for (i, caso) in CasosCarreras.todos.enumerated() {
            for v in Self.variantes {
                // Los acentos de prueba solo hacen falta donde el acento pesa: el lleno, el vacío, el de
                // ayer y el que no tiene tiempo fijado.
                if v.club != nil, !["lleno", "vacio", "ayer", "sin-coach", "solo-historial"].contains(caso.id) { continue }
                let png = CapturaVentana.png(pestana(caso.lectura), alto: Self.altoDelTelefono, oscuro: v.oscuro, club: v.club, entera: true)
                CapturaVentana.guarda(png, nombre: String(format: "%02d-%@-%@", i + 1, caso.id, v.nombre), en: self)
            }
        }
    }

    /// Los tamaños de texto extremos del sistema: nada se sale ni se parte por la mitad de una palabra.
    /// A «Accesibilidad 3» un cuerpo entero pasa del límite de alto de una imagen, así que ahí solo se
    /// miran los casos cortos (el vacío, el esqueleto y el error, que son un sujeto solo).
    @MainActor
    func testLosCasosClaveATamanosDeTextoExtremos() {
        for id in ["lleno", "vacio", "ayer", "varios"] {
            let png = CapturaVentana.png(pestana(CasosCarreras.caso(id).lectura), alto: Self.altoDelTelefono, tamano: .xSmall, entera: true)
            CapturaVentana.guarda(png, nombre: "xs-\(id)", en: self)
        }
        for id in ["vacio", "cargando", "error"] {
            let png = CapturaVentana.png(pestana(CasosCarreras.caso(id).lectura), alto: Self.altoDelTelefono, tamano: .accessibility3, entera: true)
            CapturaVentana.guarda(png, nombre: "ax3-\(id)", en: self)
        }
    }
}
