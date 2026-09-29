import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE «PLAN» — cada caso del doble, pintado de verdad. Es la herramienta de REVISIÓN de la pestaña:
// no falla por una diferencia de imagen (una tipografía que se mueve medio punto no es un fallo, es lo que hay
// que MIRAR); falla si una pieza revienta al pintarse, y deja los PNG donde se pueden abrir y compararse con
// las capturas del doble (`scratchpad/hoy/plan/plan-rehecho-NN-…`).
//
// Cada caso sale en claro y en oscuro, con el acento de fábrica y con un club azul (tinta clara) y otro
// amarillo (tinta oscura): un componente que lleva el acento clavado solo se ve mal cuando un coach elige otro.
// Va sobre el lienzo del iPhone 17 Pro (402 pt de ancho y el alto que queda entre el cromo y la barra de
// pestañas) y cortado como lo corta la pantalla: lo que sobra es lo que se scrollea. Además, una vista COMPLETA
// (sin cortar) en claro y de fábrica, para revisar de un vistazo todo lo que un caso contiene.
//
// `ImageRenderer` no dibuja un `ScrollView` ni ejecuta `onAppear`: por eso la galería compone la MISMA columna
// que la app (`PlanColumna`) en un alto fijo, en vez de la pantalla con su `FillingScreen`.
//
// Los PNG van a `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`) y como adjuntos.

final class PlanGaleriaRenderTests: XCTestCase {

    /// El iPhone 17 Pro: 402 pt dentro del área segura, y el alto que queda entre el cromo y la barra de pestañas.
    private static let ancho: CGFloat = 402
    private static let altoDePantalla: CGFloat = 736

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

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
        for caso in EjemplosPlan.casosPlan {
            for dia in caso.lectura.actual?.dias ?? [] { for s in dia.sesiones { CompletedAssignmentsStore.unmark(s.assignmentId) } }
        }
        super.tearDown()
    }

    // MARK: - La pantalla de un caso, sin ScrollView

    /// Cromo + columna + anclaje. Con `alto` es la pantalla cortada como la corta el iPhone: la columna pide, como
    /// dentro de un `FillingScreen`, al menos el alto que queda (para que el sujeto se lleve el sobrante) y, si su
    /// contenido es más alto, lo es (lo que sobra es lo que se scrollea). Sin `alto`, la vista entera.
    @ViewBuilder
    private func pantalla(_ caso: CasoPlan, alto: CGFloat?) -> some View {
        let v = caso.lectura.vista(caso.nav)
        let acciones = AccionesDePlan()
        let hayAnclaje = PlanAnclaje.hay(v, caso.lectura)
        // Cromo (56) y anclaje (56 de acción + 12 y 8 de aire + el filete).
        let visible = alto.map { $0 - 56 - (hayAnclaje ? 77 : 0) }
        VStack(spacing: 0) {
            PlanCromoDeLectura(l: caso.lectura, v: v, acciones: acciones)
            Group {
                if let visible {
                    PlanColumna(l: caso.lectura, v: v, acciones: acciones)
                        .frame(maxWidth: .infinity, minHeight: visible, alignment: .top)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(height: visible, alignment: .top)
                        .clipped()
                } else {
                    // Sin alto que llenar la columna mide lo suyo: `ImageRenderer` propone el alto que le da la gana a
                    // un hijo con `maxHeight: .infinity`, y el sujeto se quedaba en su mínimo.
                    PlanColumna(l: caso.lectura, v: v, acciones: acciones)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if hayAnclaje {
                VStack(spacing: 0) {
                    Hairline()
                    PlanAnclaje(l: caso.lectura, v: v, acciones: acciones)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.m)
                        .padding(.bottom, Theme.Spacing.s)
                }
            }
        }
        .frame(width: Self.ancho, alignment: .top)
        .background { Theme.Color.background }
        .environment(\.enCaptura, true)
    }

    @MainActor
    private func pinta(_ caso: CasoPlan, variante v: Variante, nombre: String, alto: CGFloat?) {
        pintaVista(pantalla(caso, alto: alto), id: caso.id, variante: v, nombre: nombre)
    }

    @MainActor
    private func pintaVista(_ vista: some View, id: String, variante v: Variante, nombre: String) {
        ClubThemeStore.update(v.club)
        let renderer = ImageRenderer(content: vista.environment(\.colorScheme, v.esquema))
        renderer.scale = 2
        guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
            return XCTFail("\(id) no se pudo pintar en \(v.nombre)")
        }
        XCTAssertGreaterThan(imagen.size.height, 200, "\(id) en \(v.nombre) salió vacía")
        adjunta(png, nombre: nombre)
    }

    private func adjunta(_ png: Data, nombre: String) {
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    // MARK: - Los dieciocho casos con coach

    @MainActor
    func testCadaCasoConCoachEnCadaVariante() {
        for (i, caso) in EjemplosPlan.casosPlan.enumerated() {
            let n = String(format: "%02d", i + 1)
            for v in Self.variantes {
                pinta(caso, variante: v, nombre: "plan-\(n)-\(caso.id)-\(v.nombre)", alto: Self.altoDePantalla)
            }
            // Y entero, sin cortar, para revisar todo lo que contiene.
            pinta(caso, variante: Self.variantes[0], nombre: "plan-\(n)-\(caso.id)-completa", alto: nil)
        }
    }

    /// Los días hojeados: el mismo caso lleno, con la card mostrando cada uno de sus días (hecho, sin hacer,
    /// hoy, un día que viene y el descanso), que es como se ve al tocar el carril.
    @MainActor
    func testElCasoLlenoHojeadoDiaADia() {
        let base = EjemplosPlan.casoPlan("lleno")
        let isos = base.lectura.actual!.dias.map(\.isoDate)
        for (i, iso) in isos.enumerated() {
            var caso = base
            caso.nav = NavegacionPlan(offset: 0, seleccion: iso)
            for v in [Self.variantes[0], Self.variantes[1]] {
                pinta(caso, variante: v, nombre: "plan-dia-\(i + 1)-\(v.nombre)", alto: Self.altoDePantalla)
            }
        }
    }

    // MARK: - Los cuatro casos sin coach

    /// La pantalla del atleta libre: sin cromo, columna y anclaje. Mismas reglas de alto que la de con coach.
    @ViewBuilder
    private func pantallaLibre(_ caso: CasoLibre, alto: CGFloat?) -> some View {
        let l = caso.lectura
        let acciones = AccionesDeLibre()
        let hayAnclaje = PlanLibreAnclaje.hay(l)
        let visible = alto.map { $0 - (hayAnclaje ? 77 : 0) }
        VStack(spacing: 0) {
            Group {
                if let visible {
                    PlanLibreColumna(l: l, acciones: acciones, seleccion: .constant(nil))
                        .frame(maxWidth: .infinity, minHeight: visible, alignment: .top)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(height: visible, alignment: .top)
                        .clipped()
                } else {
                    PlanLibreColumna(l: l, acciones: acciones, seleccion: .constant(nil))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if hayAnclaje {
                VStack(spacing: 0) {
                    Hairline()
                    PlanLibreAnclaje(l: l, acciones: acciones)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.m)
                        .padding(.bottom, Theme.Spacing.s)
                }
            }
        }
        .frame(width: Self.ancho, alignment: .top)
        .background { Theme.Color.background }
        .environment(\.enCaptura, true)
    }

    @MainActor
    func testCadaCasoSinCoachEnCadaVariante() {
        for (i, caso) in EjemplosPlan.casosLibre.enumerated() {
            let n = String(format: "%02d", i + 19)
            for v in Self.variantes {
                pintaVista(pantallaLibre(caso, alto: Self.altoDePantalla + 56), id: caso.id, variante: v, nombre: "plan-\(n)-\(caso.id)-\(v.nombre)")
            }
            pintaVista(pantallaLibre(caso, alto: nil), id: caso.id, variante: Self.variantes[0], nombre: "plan-\(n)-\(caso.id)-completa")
        }
    }

    // MARK: - Tamaños de texto extremos

    @MainActor
    func testElCasoLlenoYElDensoATamanosDeTextoExtremos() {
        ClubThemeStore.update(nil)
        for id in ["lleno", "denso", "descanso"] {
            for (sufijo, tamano) in [("xs", DynamicTypeSize.xSmall), ("ax3", .accessibility3)] {
                let caso = EjemplosPlan.casoPlan(id)
                let renderer = ImageRenderer(content: pantalla(caso, alto: nil).environment(\.dynamicTypeSize, tamano))
                renderer.scale = 2
                guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                    XCTFail("\(id) no se pudo pintar a tamaño \(sufijo)")
                    continue
                }
                XCTAssertGreaterThan(imagen.size.height, 200)
                adjunta(png, nombre: "plan-tamano-\(id)-\(sufijo)")
            }
        }
    }
}
