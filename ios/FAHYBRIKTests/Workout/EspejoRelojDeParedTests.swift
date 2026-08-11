import XCTest
@testable import FAHYBRIK

// EL RELOJ DE PARED, DE CABO A RABO: motor → trama → cable → guion → páginas.
//
// Los tests de `GuionRelojDeParedTests` comprueban el guion puro contra un
// `Estado` hecho a mano. Éstos comprueban lo único que no se ve desde ahí: que
// el MOTOR y el CABLE de verdad rellenan ese `Estado` con los números que
// tocan — el mismo tramo del recorrido donde vivían los tres bloqueantes que
// cazó el revisor esta noche (el numeral congelado, las calorías en el sitio
// de los metros, la parada inalcanzable del EMOM). Ninguno de los tres lo veía
// un test del guion solo.
@MainActor
final class EspejoRelojDeParedTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    private func paginasEnLaMuneca(_ s: WorkoutSession) throws -> [WatchPagina] {
        let enviada = mirror.buildFrame(from: s)
        let bytes = try MirrorWire.encoder.encode(enviada)
        let recibida = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
        return GuionDelEspejo.paginas(recibida, bpm: nil, elapsed: 0, avanzar: {})
    }

    // MARK: - Death By: plantilla 462 — 10 rondas de 60 s a burpees, sin máquina

    private func deathBySession() -> WorkoutSession {
        let rx = Prescription(scheme: .deathBy, modality: .functional, sets: nil, rounds: nil,
                              workS: 60, restS: nil, totalS: nil, target: nil, note: nil,
                              start: 5, increment: 2)
        let seg = WorkoutSegment(order: 1, title: "Burpees", kind: .reps,
                                 blockTitle: "Death by", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Death by burpees", format: .deathBy, estimatedDurationSeconds: 600,
            blockContext: "Metcon", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    /// Minuto 1: `start` reps, ni una más — el motor no inventa el arranque.
    func testMinutoUnoEnseñaLasRepsDeArranque() throws {
        let s = deathBySession()
        // Salta el 3-2-1 SIN loguear ningún minuto (el mismo camino que ya usan
        // los tests del run estructurado para llegar al primer tramo de trabajo).
        s.primaryAdvance()
        XCTAssertEqual(s.deathByTarget, 5, "arranque = start, ronda 0 completada")

        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.contexto, "Minuto 1")
        XCTAssertEqual(p.sujeto, "5")
        XCTAssertEqual(p.unidad, "reps")
        XCTAssertEqual(p.accion, "Al fallar · toca")
    }

    /// Minuto 2: `start + increment`, y el sujeto CAMBIA — es el caso que el
    /// numeral congelado de anoche no habría superado.
    func testMinutoDosSubeElIncrementoYElSujetoCambia() throws {
        let s = deathBySession()
        s.primaryAdvance()                 // salta el 3-2-1 → minuto 1
        let minuto1 = try XCTUnwrap(try paginasEnLaMuneca(s).first).sujeto

        s.primaryAdvance()                 // minuto 1 CUMPLIDO → minuto 2
        XCTAssertEqual(s.deathByTarget, 7, "start(5) + increment(2) × 1 ronda hecha")

        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.contexto, "Minuto 2")
        XCTAssertEqual(p.sujeto, "7")
        XCTAssertNotEqual(p.sujeto, minuto1, "el sujeto tiene que cambiar de minuto a minuto")
    }

    /// `deathByFail()` es llamable desde el estado que el cable puede alcanzar
    /// (justo tras saltar el 3-2-1, en pleno minuto) y no revienta. La
    /// afirmación de `GuionDelEspejo.relojDePared` —que no hay una trama
    /// intermedia «acabas de fallar» que capturar, porque el motor cierra el
    /// bloque en el mismo tick del toque— sale de leer `closeConditioningAndAdvance`
    /// (`WorkoutSession.swift`); el detalle EXACTO de a qué estado se mueve
    /// (`isAwaitingFinishDecision` / `isFinished` / la re-apertura de
    /// `clearConditioning`) queda pendiente de un test propio — no lo cierro
    /// aquí con una aserción que no he podido verificar con solidez.
    func testFallarNoRevienta() throws {
        let s = deathBySession()
        s.primaryAdvance()
        XCTAssertTrue(s.isConditioningActive)
        s.deathByFail()
    }

    // MARK: - Tabata: 20/10 × 8 a burpees, mismo caso sin máquina

    private func tabataSession() -> WorkoutSession {
        let rx = Prescription(scheme: .tabata, modality: .functional, sets: nil, rounds: 8,
                              workS: 20, restS: 10, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Burpees", kind: .reps,
                                 blockTitle: "Tabata", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Tabata burpees", format: .tabata, estimatedDurationSeconds: 300,
            blockContext: "Metcon", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    /// El caso que cerraba anoche el hueco: un tabata SIN GPS y SIN máquina hoy
    /// caía al suelo genérico (crono del bloque). Aquí tiene que llegar a la
    /// pantalla nueva, con la ronda —no un crono— como sujeto.
    func testTabataLlegaALaPantallaDelRelojDeParedYNoAlSueloGenerico() throws {
        let s = tabataSession()
        s.primaryAdvance()                 // salta el 3-2-1 → ronda 1, trabajando

        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.id, "tabata", "si cae al suelo genérico, el id es \"espejo\"")
        XCTAssertEqual(p.contexto, "Trabaja")
        XCTAssertEqual(p.sujeto, "1")
        XCTAssertEqual(p.segundoValor, "de 8 rondas")
    }

    /// EL FALLO QUE CAZÓ ESCRIBIR ESTE ADAPTADOR: `objetivoLabel` en el cable
    /// SÓLO salía de una pierna de correr (`session.currentRunLeg`), que en un
    /// intervalo funcional siempre es nil. El segundo nivel de «intervals» —el
    /// objetivo del coach— nunca llegaba a la muñeca en espejo, pese a que el
    /// propio diseño lo señala como una de las dos cosas que separan esta
    /// pantalla del EMOM.
    func testIntervalsFuncionalMandaElRPEPorElCable() throws {
        let rx = Prescription(scheme: .intervals, modality: .functional, sets: nil, rounds: 5,
                              workS: 180, restS: 60, totalS: nil,
                              target: .rpe(value: 9, min: nil, max: nil), note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Empuje de trineo", kind: .reps,
                                 blockTitle: "Intervalos", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Trineo", format: .intervals, estimatedDurationSeconds: 1_200,
            blockContext: "Metcon", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()

        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.segundoValor, "RPE 9", "el objetivo del bloque, no el de una pierna de correr que aquí no existe")
    }

    // MARK: - EN SOLITARIO: mismo guion, sin cable de por medio
    //
    // `GuionRelojDePared.estadoSolitario` es el adaptador que usa
    // `RelojDeParedLiveView` cuando el reloj lleva el motor él solo. Aquí no
    // hay trama que perder nada por el camino, así que estos tests comprueban
    // lo que el espejo tenía que ADIVINAR y el solitario no: el total real de
    // la ventana de trabajo.

    func testSolitarioMinutoUnoIgualQueElEspejo() throws {
        let s = deathBySession()
        s.primaryAdvance()
        let e = GuionRelojDePared.estadoSolitario(s)
        let p = try XCTUnwrap(GuionRelojDePared.paginas(e, GuionRelojDePared.gestosSolitario(s)).first)
        XCTAssertEqual(p.contexto, "Minuto 1")
        XCTAssertEqual(p.sujeto, "5")
    }

    /// El intervalo funcional con RPE — el caso que el adaptador del CABLE
    /// nunca podía pintar hasta esta noche, porque leía el objetivo de una
    /// pierna de correr que aquí no existe. En solitario nunca tuvo ese
    /// problema (no había cable de por medio), pero el mismo `Estado` prueba
    /// que la fuente correcta (el target del bloque) es la que hay que leer.
    func testSolitarioIntervalsConRPEEnSegundoNivel() throws {
        let rx = Prescription(scheme: .intervals, modality: .functional, sets: nil, rounds: 5,
                              workS: 180, restS: 60, totalS: nil,
                              target: .rpe(value: 9, min: nil, max: nil), note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Empuje de trineo", kind: .reps,
                                 blockTitle: "Intervalos", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Trineo", format: .intervals, estimatedDurationSeconds: 1_200,
            blockContext: "Metcon", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()

        let e = GuionRelojDePared.estadoSolitario(s)
        XCTAssertEqual(e.objetivo, "RPE 9")
        let p = try XCTUnwrap(GuionRelojDePared.paginas(e).first)
        XCTAssertEqual(p.segundoValor, "RPE 9")
        XCTAssertEqual(p.nota, WatchNota.loDicesTu)
    }
}
