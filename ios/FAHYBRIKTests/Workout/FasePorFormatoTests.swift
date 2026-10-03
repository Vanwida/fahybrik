import XCTest
@testable import FAHYBRIK

// EL CASO REAL — plantilla 851, «Test running 3' + 9'» (la sesión que Alex abrió en TestFlight): el coach declara `warmup` un bloque que
// se llama «Movilidad general de cadera». El título no dice «calentamiento», así que el motor lo clasificaba por título y en el entreno en
// vivo era «Principal» (y en la ficha previa, trabajo: abría ahí y contaba «2 bloques»). Ahora el título manda y, si no dice nada, manda el
// formato que declaró el coach: UN criterio (`BlockPhase.classify(title:format:)`) para el vivo, el plegado de bloques y la ficha.
final class FasePorFormatoTests: XCTestCase {

    func test_unBloqueWarmupEsCalentamientoAunqueSeLlameMovilidad() throws {
        let detalle = EjemplosPrevia.testRunning
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detalle))

        // El vivo: la fase de cada tramo, por el bloque al que pertenece.
        let fases = Dictionary(grouping: plan.segments, by: { $0.blockTitle ?? "" }).mapValues { Set($0.map(\.blockPhase)) }
        XCTAssertEqual(fases["Movilidad general de cadera"], [.warmup], "un bloque `warmup` es calentamiento aunque el título no lo diga")
        XCTAssertEqual(fases["Calentamiento carrera"], [.warmup])
        XCTAssertEqual(fases["Test"], [.main])

        // El título sigue mandando sobre el formato.
        XCTAssertEqual(BlockPhase.classify(title: "Principal", format: "warmup"), .principal)

        // La ficha cuenta lo mismo que el vivo.
        let ficha = LecturaFicha.desde(plan: plan, detalle: detalle)
        XCTAssertEqual(ficha.bloques.map(\.rol), [.calentamiento, .calentamiento, .principal])
    }
}
