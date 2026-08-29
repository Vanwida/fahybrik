import XCTest
@testable import FAHYBRIK

// LO MEDIDO SE GUARDA AL TERMINAR, Y NO LLEVA UNA SOLA OPINIÓN.
//
// La carrera se escribía al pulsar GUARDAR, después de una lectura de carrera, un
// resumen, un RPE y un botón de compartir. En todo ese rato existía sólo en memoria:
// `finish()` ya había cerrado la instantánea de recuperación y el resumen no encola si
// falla, así que matar la app ahí se llevaba kilómetros, pulso y mapa.
//
// Estos tests clavan las dos mitades del reparto que lo arregla, y que existe porque
// `workout_executions` hace UPSERT por `assignment_id` con
// `coalesce(excluded.campo, campo)`: al terminar va lo MEDIDO con lo declarado en nil
// (así no puede pisar un RPE posterior), y en el resumen va lo DECLARADO.
final class MedidoAlTerminarTests: XCTestCase {

    private func carreraTerminada(metros: Double = 10_000) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Largo Z2", kind: .running,
                                 targetDistanceMeters: metros,
                                 blockTitle: "Carrera", blockPosition: 1)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Largo Z2", format: .steady, estimatedDurationSeconds: 3600,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.elapsedSeconds = 2_700
        s.lapElapsedSeconds = 2_700
        s.capturedRoutePolyline = "_p~iF~ps|U_ulLnnqC"
        s.finish(completeness: .full)
        return s
    }

    func testAlTerminarViajaLoMedidoYNadaDeclarado() throws {
        let s = carreraTerminada()
        let p = try XCTUnwrap(MedidoAlTerminar.payload(session: s, assignmentId: "173"))

        XCTAssertEqual(p.assignment_id, "173")
        XCTAssertEqual(p.total_duration_seconds, 2_700)
        XCTAssertEqual(p.completeness, "full")
        XCTAssertEqual(p.route_polyline, "_p~iF~ps|U_ulLnnqC")
        XCTAssertNotNil(p.started_at)
        XCTAssertNotNil(p.ended_at)

        // LO DECLARADO VA EN NIL. El coalesce del upsert lo respeta, así que esta
        // escritura no puede borrar el RPE ni las notas que llegan después.
        XCTAssertNil(p.perceived_exertion)
        XCTAssertNil(p.notes)
        XCTAssertNil(p.perceived_difficulty)
        XCTAssertNil(p.pain_area)
        XCTAssertNil(p.pain_note)
        // Y el uuid del HKWorkout tampoco: la muñeca lo contesta unos segundos después
        // de que se le pida cerrar, así que lo estampa el resumen.
        XCTAssertNil(p.source_workout_ref)
    }

    // Sin asignación no hay fila que actualizar. Un entreno libre la crea el servidor
    // al guardarlo, así que su carrera no puede pre-guardarse: se dice, no se finge.
    func testSinAsignacionNoSeEscribeNada() {
        let s = carreraTerminada()
        XCTAssertNil(MedidoAlTerminar.payload(session: s, assignmentId: nil))
        XCTAssertNil(MedidoAlTerminar.payload(session: s, assignmentId: ""))
    }

    // UN ENTRENO ABANDONADO EN LA PUERTA NO ES UNA CARRERA DE CERO METROS. Escribirlo
    // marcaría la asignación como hecha con un entreno que no existió.
    func testUnEsfuerzoSinMedirNoSeEscribe() {
        let seg = WorkoutSegment(order: 1, title: "Largo Z2", kind: .running,
                                 targetDistanceMeters: 10_000,
                                 blockTitle: "Carrera", blockPosition: 1)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Largo Z2", format: .steady, estimatedDurationSeconds: 3600,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.finish(completeness: .partial)                       // cero segundos medidos
        XCTAssertNil(MedidoAlTerminar.payload(session: s, assignmentId: "173"))
    }

    // Sin sello de final no ha terminado nadie: un registro a mano nunca corrió un
    // motor y no tiene nada medido que adelantar.
    func testSinSelloDeFinalNoSeEscribe() {
        let seg = WorkoutSegment(order: 1, title: "Largo Z2", kind: .running,
                                 blockTitle: "Carrera", blockPosition: 1)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Largo Z2", format: .steady, estimatedDurationSeconds: 3600,
            blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.elapsedSeconds = 2_700
        XCTAssertNil(MedidoAlTerminar.payload(session: s, assignmentId: "173"))
    }

    // Un abandono a media sesión se archiva PARCIAL, nunca como completado: el
    // backend traduce `completeness` al estado de la asignación.
    func testUnFinalTempranoViajaComoParcial() throws {
        let s = carreraTerminada()
        s.finishedAt = nil
        s.finish(completeness: .partial)
        let p = try XCTUnwrap(MedidoAlTerminar.payload(session: s, assignmentId: "173"))
        XCTAssertEqual(p.completeness, "partial")
    }
}
