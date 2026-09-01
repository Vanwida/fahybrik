import XCTest
@testable import FAHYBRIK

// Card 114 — Alex, sesión del 20-ago: «Al entrar en estaciones no estaba claro
// si eran 3 seguidas de cada ejercicio o 1 y 1 y 1. El atleta lo hizo mal».
// `BlockPacing.resolve` es la decisión pura detrás del badge de la puerta de
// bloque. El modelo (fijado con team-lead tras una primera vuelta): rondas con
// varios movimientos NO es ambiguo — significa uno de cada por vuelta, así que
// es CIRCUITO; lo que de verdad significa «todas las series de un ejercicio
// antes del siguiente» es el esquema `sets`, que es SEGUIDO; y una superserie
// no es ninguna de las dos, es ALTERNANDO.
final class BlockPacingTests: XCTestCase {

    private func movimiento(_ nombre: String) -> PrescriptionSet {
        PrescriptionSet(measure: .reps(10), target: nil, modality: nil,
                        restS: nil, tempo: nil, note: nombre)
    }

    private func segmento(scheme: PrescriptionScheme, rounds: Int?, sets: [PrescriptionSet],
                          kind: SegmentKind = .reps) -> WorkoutSegment {
        let p = Prescription(scheme: scheme, modality: nil, sets: sets,
                             rounds: rounds, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: 1, title: "WOD", kind: kind,
                              blockTitle: "Principal", blockPosition: 1,
                              prescription: p)
    }

    // Una ruta de estaciones distintas, una sola vuelta (sin rounds declarados):
    // el caso que ya sabe distinguir `fixedListIsStations`.
    func testRutaDeEstacionesEsCircuito() {
        let seg = segmento(scheme: .rounds, rounds: nil,
                           sets: [movimiento("Wall Balls"), movimiento("Box Jumps")])
        XCTAssertEqual(BlockPacing.resolve([seg]), .circuito)
    }

    // Un solo movimiento repetido ronda tras ronda: no hay orden de estación
    // que confundir porque solo hay UN ejercicio.
    func testUnSoloMovimientoRepetidoPorRondasEsSeguido() {
        let seg = segmento(scheme: .rounds, rounds: 5, sets: [movimiento("Burpees")])
        XCTAssertEqual(BlockPacing.resolve([seg]), .seguido)
    }

    // EL CASO REAL de Alex: rondas declaradas con VARIOS movimientos. NO es
    // ambiguo — en este modelo significa "uno de cada por vuelta", que es
    // exactamente circuito. Decir esto es lo que arregla su queja.
    func testVariosMovimientosConRondasEsCircuitoUnoDeCada() {
        let seg = segmento(scheme: .rounds, rounds: 3,
                           sets: [movimiento("Wall Balls"), movimiento("Box Jumps")])
        XCTAssertEqual(BlockPacing.resolve([seg]), .circuito)
    }

    // La tabla de hierro (kind .strength, esquema `sets`) es, por definición,
    // todas las series de un ejercicio antes de pasar al siguiente.
    func testTablaDeHierroEsSeguido() {
        let seg = segmento(scheme: .sets, rounds: nil,
                           sets: [movimiento("Sentadilla"), movimiento("Sentadilla")],
                           kind: .strength)
        XCTAssertEqual(BlockPacing.resolve([seg]), .seguido)
    }

    // Una superserie no es ni seguido ni circuito: va y viene entre ejercicios.
    func testSuperserieEsAlternando() {
        let seg = segmento(scheme: .superset, rounds: nil,
                           sets: [movimiento("Press banca"), movimiento("Curl")])
        XCTAssertEqual(BlockPacing.resolve([seg]), .alternando)
    }

    // Un EMOM es rotativo (no de presentación fija) y ya lleva su propia
    // cabecera de formato — aquí no hay nada honesto que añadir.
    func testEMOMNoDiceNada() {
        let seg = segmento(scheme: .emom, rounds: 10, sets: [movimiento("Burpees")])
        XCTAssertNil(BlockPacing.resolve([seg]))
    }

    // Un bloque puede traer varios segmentos (p. ej. un EMOM de calentamiento
    // seguido del WOD real); el primero que NO da una lectura cierta se salta,
    // y gana la primera lectura cierta que aparezca.
    func testSeQuedaConLaPrimeraLecturaCiertaDeVariosSegmentos() {
        let calentamiento = segmento(scheme: .emom, rounds: 5, sets: [movimiento("Jumping Jacks")])
        let ruta = segmento(scheme: .forTime, rounds: nil,
                            sets: [movimiento("Run"), movimiento("Row")])
        XCTAssertEqual(BlockPacing.resolve([calentamiento, ruta]), .circuito)
    }
}
