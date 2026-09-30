import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL CONSTRUCTOR DE ENTRENO LIBRE, VISTO DE VERDAD — la herramienta de REVISIÓN de sus pantallas.
//
// Los pasos son cuerpos con scroll y un pie anclado, y `ImageRenderer` no dibuja `ScrollView`: se montan
// en una ventana del simulador (sin abrir ningún simulador con ventana) con `CapturaVentana`, se cosen
// enteras y se guardan en `FAHYBRIK_CAPTURAS`. Cada pantalla en claro y en oscuro, con el acento de
// fábrica y con un club azul (tinta clara), que es el caso que delata un naranja clavado. Falla si una
// vista revienta al pintarse; no compara píxeles.
final class ConstructorLibreRenderTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private struct Variante {
        let nombre: String
        let oscuro: Bool
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro-fabrica", oscuro: false, club: nil),
        Variante(nombre: "oscuro-fabrica", oscuro: true, club: nil),
        Variante(nombre: "claro-azul", oscuro: false, club: .pruebaAzul),
        Variante(nombre: "oscuro-azul", oscuro: true, club: .pruebaAzul),
    ]

    @MainActor
    private func captura(_ nombre: String, entera: Bool = true, @ViewBuilder _ vista: () -> some View) {
        for v in Self.variantes {
            let png = CapturaVentana.png(vista(), oscuro: v.oscuro, club: v.club, entera: entera)
            CapturaVentana.guarda(png, nombre: "libre-\(nombre)-\(v.nombre)", en: self)
        }
    }

    // MARK: - Datos de ejemplo (sólo para ver la pantalla; no son datos de nadie)

    private static func ejercicio(_ id: Int, _ nombre: String, _ categoria: String) -> FreeExercise {
        FreeExercise(id: id, name: nombre, slug: nombre.lowercased(), category: categoria, modality: nil)
    }

    private static let catalogo: [FreeExercise] = [
        ejercicio(1, "Sentadilla trasera", "strength"),
        ejercicio(2, "Peso muerto", "strength"),
        ejercicio(3, "Press banca", "strength"),
        ejercicio(4, "Wall balls", "functional"),
        ejercicio(5, "Burpees", "functional"),
        ejercicio(6, "Kettlebell swing", "functional"),
        ejercicio(7, "Sled push", "hyrox"),
    ]

    private static var medidoRemo: FreeWorkoutDraft {
        var d = FreeWorkoutDraft()
        d.selectModality(.row)
        return d
    }

    private static var medidoRemoSeries: FreeWorkoutDraft {
        var d = medidoRemo
        d.format = .series
        return d
    }

    private static var correr: FreeWorkoutDraft {
        var d = FreeWorkoutDraft()
        d.selectModality(.run)
        d.runPlan.calentamiento = FreeRunPlan.calentamientoPorDefecto
        d.runPlan.grupos = [FreeRunGrupo(repeticiones: 6, pasos: [
            FreeRunPaso(rol: .trabajo, medida: .distancia, metros: 800, objetivo: .zona, zona: 4),
            FreeRunPaso(rol: .recuperacion, medida: .tiempo, segundos: 90, objetivo: .zona, zona: 1, modo: .trote),
        ])]
        return d
    }

    private static var funcionalConMovimientos: FreeFunctionalDraft {
        var d = FreeFunctionalDraft()
        d.selectFormat(.amrap)
        d.add(catalogo[3])
        d.add(catalogo[4])
        return d
    }

    private static var fuerzaConEjercicios: FreeStrengthDraft {
        var d = FreeStrengthDraft()
        d.includeWarmup = true
        d.add(catalogo[0])
        d.add(catalogo[1])
        return d
    }

    // MARK: - El camino medido

    @MainActor
    func testModalidad() {
        captura("1-modalidad") { FreeWorkoutBuilderView(bearer: nil, onClose: {}) }
    }

    @MainActor
    func testFormato() {
        captura("2-formato") {
            FreeWorkoutBuilderView(bearer: nil, onClose: {}, draftInicial: Self.medidoRemo, pasoInicial: .format)
        }
    }

    @MainActor
    func testConfiguraMedido() {
        captura("3-configura-remo") {
            FreeWorkoutBuilderView(bearer: nil, onClose: {}, draftInicial: Self.medidoRemoSeries, pasoInicial: .bouts)
        }
    }

    @MainActor
    func testConfiguraCorrer() {
        captura("3-configura-correr") {
            FreeWorkoutBuilderView(bearer: nil, onClose: {}, draftInicial: Self.correr, pasoInicial: .bouts)
        }
    }

    @MainActor
    func testHojaDeUnTramo() {
        captura("hoja-tramo", entera: false) {
            FreeRunPasoSheet(paso: .constant(FreeRunPaso(rol: .recuperacion, medida: .tiempo, segundos: 90,
                                                         objetivo: .zona, zona: 1, modo: .trote)))
        }
    }

    @MainActor
    func testEdicionCargandoYFallo() {
        captura("edicion-cargando", entera: false) {
            PantallaConstructorLibre(salida: .cerrar, alSalir: {}) { EsqueletoConstructorLibre() }
        }
        // Sin sesión la carga falla al momento: es el estado de fallo con su reintento.
        captura("edicion-fallo", entera: false) {
            FreeWorkoutBuilderView(bearer: nil, editingAssignmentId: 1, onClose: {})
        }
    }

    // MARK: - Funcional y fuerza

    @MainActor
    func testFuncional() {
        captura("funcional-formato") {
            FreeFunctionalBuilderView(bearer: nil, onBack: {}, onStart: { _ in })
        }
        captura("funcional-configura") {
            FreeFunctionalBuilderView(bearer: nil, draft: .constant(Self.funcionalConMovimientos),
                                      onBack: {}, onStart: { _ in })
        }
    }

    @MainActor
    func testFuerza() {
        captura("fuerza-vacia") {
            FreeStrengthBuilderView(bearer: nil, onBack: {}, onStart: { _ in })
        }
        captura("fuerza-con-ejercicios") {
            FreeStrengthBuilderView(bearer: nil, draft: .constant(Self.fuerzaConEjercicios),
                                    onBack: {}, onStart: { _ in })
        }
    }

    // MARK: - El selector y «¿Qué hiciste?»

    @MainActor
    func testSelector() {
        captura("selector-lista", entera: false) {
            FreeExercisePickerView(bearer: nil, preferredCategory: "strength", onPick: { _ in }, onClose: {},
                                   catalogoInicial: Self.catalogo)
        }
        captura("selector-cargando", entera: false) {
            FreeExercisePickerView(bearer: nil, preferredCategory: "strength", onPick: { _ in }, onClose: {},
                                   faseInicial: .loading)
        }
        captura("selector-fallo", entera: false) {
            FreeExercisePickerView(bearer: nil, preferredCategory: "strength", onPick: { _ in }, onClose: {},
                                   faseInicial: .failed)
        }
        captura("selector-vacio", entera: false) {
            FreeExercisePickerView(bearer: nil, preferredCategory: "strength", onPick: { _ in }, onClose: {},
                                   catalogoInicial: [])
        }
    }

    @MainActor
    func testQueHiciste() {
        captura("que-hiciste-vacio", entera: false) {
            FreeDeclareMovementsSheet(bearer: nil, headerLine: "EMOM 10 · cada 1:00", onDone: { _ in }, onClose: {})
        }
    }

    // MARK: - Texto grande

    /// Con el texto del sistema en accesibilidad, la rejilla pasa a una columna y los selectores a
    /// columna en vez de cortarse.
    @MainActor
    func testTextoGrande() {
        let png = CapturaVentana.png(FreeWorkoutBuilderView(bearer: nil, onClose: {}), tamano: .accessibility3, entera: true)
        CapturaVentana.guarda(png, nombre: "libre-1-modalidad-ax3", en: self)
        let png2 = CapturaVentana.png(
            FreeWorkoutBuilderView(bearer: nil, onClose: {}, draftInicial: Self.medidoRemoSeries, pasoInicial: .bouts),
            tamano: .accessibility3, entera: true)
        CapturaVentana.guarda(png2, nombre: "libre-3-configura-remo-ax3", en: self)
    }
}
