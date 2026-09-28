import XCTest
@testable import FAHYBRIK

// UN LIBRE ES EL MISMO OBJETO QUE UNO DEL COACH (28-sep) — docs/DECISIONS.md.
//
// Dos promesas, probadas formato a formato:
//   1. IDA Y VUELTA SIN PÉRDIDAS. Borrador → plan que viaja → detalle que devolverá
//      el servidor → borrador (editar) → plan que viaja: los dos planes son el mismo.
//      La auditoría encontró RPE → Z4, recuperación sin modo → trote, paso abierto
//      perdido, cuesta perdida, EMOM 45/15 y Tabata sin transición, For Time de una
//      ronda → tres y los números del último uso colándose.
//   2. EL VIVO DEL LIBRE SALE DE `WorkoutPlan.from`, como el del coach.
final class FreePlanHydrationRoundTripTests: XCTestCase {

    private let remo = FreeExercise(id: 11, name: "Remo", slug: "row", category: "cardio", modality: "row")
    private let burpees = FreeExercise(id: 12, name: "Burpees", slug: "burpee", category: "functional", modality: "functional")
    private let wallBalls = FreeExercise(id: 13, name: "Wall Balls", slug: "wall-balls", category: "hyrox_station", modality: "functional")
    private let sentadilla = FreeExercise(id: 21, name: "Sentadilla", slug: "back-squat", category: "strength", modality: "strength")
    private let plancha = FreeExercise(id: 22, name: "Plancha", slug: "plank", category: "core", modality: nil)
    private let zancada = FreeExercise(id: 23, name: "Zancada", slug: "lunge", category: "strength", modality: nil)

    override func tearDown() {
        // Las preferencias «último uso» que algún caso ensucia a propósito.
        for f in FreeFunctionalFormat.allCases {
            for eje in ["rounds", "cadence", "transition", "window", "cap", "rest", "seriesRest"] {
                UserDefaults.standard.removeObject(forKey: "free.functional.\(f.rawValue).\(eje)")
            }
        }
        super.tearDown()
    }

    // MARK: - Helpers

    /// El detalle que el servidor devolverá para este plan (sin conexión con él: el
    /// mismo espejo con el que el libre corre antes de tenerlo).
    private func detalle(_ p: FreePlanSavePayload, exercises: [FreeExercise]) -> AssignmentDetail {
        let scheme = p.prescription?.scheme ?? p.items?.first?.prescription.scheme ?? .forTime
        let items: [FreePlanItem] = zip(exercises, p.items ?? []).map {
            FreePlanItem(exercise: $0.0, prescription: $0.1.prescription, part: $0.1.part)
        }
        let medido = items.isEmpty && p.modality != PrescriptionModality.functional.rawValue
        let planItems = medido
            ? [FreePlanItem(exercise: FreePlanDetail.ejercicioMedido(FreeModality(rawValue: p.modality)!),
                            prescription: p.prescription!)]
            : items
        return FreePlanDetail.detail(title: p.title, modality: p.modality, scheme: scheme,
                                     items: planItems, clock: medido ? nil : p.prescription,
                                     focus: "Libre · no prescrito")
    }

    private func vueltaMedida(_ draft: FreeWorkoutDraft, file: StaticString = #filePath, line: UInt = #line) throws {
        let p1 = try XCTUnwrap(draft.buildPlanPayload(), file: file, line: line)
        guard case let .measured(de)? = FreePlanHydration.editTrack(from: detalle(p1, exercises: [])) else {
            return XCTFail("no se reabrió en el constructor medido", file: file, line: line)
        }
        let p2 = try XCTUnwrap(de.buildPlanPayload(), file: file, line: line)
        XCTAssertEqual(p2.title, p1.title, file: file, line: line)
        XCTAssertEqual(p2.modality, p1.modality, file: file, line: line)
        XCTAssertEqual(p2.prescription, p1.prescription, "la prescripción vuelve idéntica", file: file, line: line)
    }

    private func vueltaFuncional(_ draft: FreeFunctionalDraft, file: StaticString = #filePath, line: UInt = #line) throws {
        let p1 = try XCTUnwrap(draft.buildPlanPayload(), file: file, line: line)
        // El último uso del formato, sucio a propósito: no se puede colar.
        let sucio = FreeFunctionalDraft()
        sucio.rounds = 7; sucio.capSeconds = 900; sucio.cadenceSeconds = 75
        sucio.transitionSeconds = 25; sucio.windowSeconds = 1500; sucio.restSeconds = 200
        sucio.seriesRestSeconds = 40
        if let f = draft.format { FreeFunctionalPrefs.remember(sucio, format: f) }

        guard case let .functional(de)? = FreePlanHydration.editTrack(
            from: detalle(p1, exercises: draft.movements.map(\.exercise))) else {
            return XCTFail("no se reabrió en el constructor funcional", file: file, line: line)
        }
        let p2 = try XCTUnwrap(de.buildPlanPayload(), file: file, line: line)
        XCTAssertEqual(p2.title, p1.title, file: file, line: line)
        XCTAssertEqual(p2.prescription, p1.prescription, file: file, line: line)
        XCTAssertEqual(p2.items, p1.items, "cada movimiento vuelve con su estructura y su dosis", file: file, line: line)
    }

    // MARK: - Medido

    func testSeriesDeRemoConRitmo() throws {
        let d = FreeWorkoutDraft()
        d.selectModality(.row); d.format = .series
        d.rounds = 6; d.distanceMeters = 750; d.restSeconds = 75; d.targetKind = .pace; d.paceSeconds = 108
        try vueltaMedida(d)
    }

    func testContinuoPorTiempoConZona() throws {
        let d = FreeWorkoutDraft()
        d.selectModality(.bike); d.format = .continuo
        d.measureKind = .time; d.workSeconds = 1800; d.targetKind = .hrZone; d.hrZone = 2
        try vueltaMedida(d)
    }

    func testEmomAmrapForTimeYRondasMedidos() throws {
        for f in [FreeFormat.emom, .amrap, .forTime, .rounds] {
            let d = FreeWorkoutDraft()
            d.selectModality(.ski); d.format = f
            d.measureKind = .calories; d.calories = 12; d.rounds = 9; d.cadenceSeconds = 90
            d.windowSeconds = 720; d.restSeconds = 45; d.targetKind = .hrZone; d.hrZone = 4
            try vueltaMedida(d)
        }
    }

    func testSinObjetivoVuelveSinObjetivo() throws {
        // Un plan sin «cómo de fuerte» no se reabre con el ritmo por defecto.
        let d = FreeWorkoutDraft()
        d.selectModality(.row); d.format = .forTime
        d.distanceMeters = 2000; d.targetKind = nil
        try vueltaMedida(d)
    }

    func testCarreraConTodosLosPasos() throws {
        let d = FreeWorkoutDraft()
        d.selectModality(.run)
        d.runPlan = FreeRunPlan(
            calentamiento: FreeRunPaso(rol: .trabajo, medida: .tiempo, segundos: 600, objetivo: .zona, zona: 2),
            grupos: [
                FreeRunGrupo(repeticiones: 6, pasos: [
                    FreeRunPaso(rol: .trabajo, medida: .distancia, metros: 400, objetivo: .ritmo,
                                ritmoSegPorKm: 235, cuestaPct: 6),
                    // Recuperación SIN modo y SIN objetivo: vuelve así, no como trote Z4.
                    FreeRunPaso(rol: .recuperacion, medida: .tiempo, segundos: 90, objetivo: .ninguno, modo: nil),
                ]),
                // Un paso ABIERTO por RPE: no desaparece ni se vuelve Z4.
                FreeRunGrupo(repeticiones: 1, pasos: [
                    FreeRunPaso(rol: .trabajo, medida: .abierto, objetivo: .rpe, rpe: 7.5),
                ]),
                FreeRunGrupo(repeticiones: 3, pasos: [
                    FreeRunPaso(rol: .trabajo, medida: .distancia, metros: 200, objetivo: .zona, zona: 5),
                    FreeRunPaso(rol: .recuperacion, medida: .distancia, metros: 200, objetivo: .zona,
                                zona: 1, modo: .caminar),
                ]),
            ],
            vuelta: FreeRunPaso(rol: .trabajo, medida: .tiempo, segundos: 300, objetivo: .ninguno)
        )
        try vueltaMedida(d)
    }

    // MARK: - Fuerza

    func testFuerzaConCalentamientoCargaYPesoCorporal() throws {
        let d = FreeStrengthDraft()
        d.includeWarmup = true
        var calentar = FreeStrengthItem(exercise: zancada)
        calentar.series = 2; calentar.reps = 10
        d.warmupItems = [calentar]
        var squat = FreeStrengthItem(exercise: sentadilla)
        squat.series = 5; squat.reps = 5; squat.loadKind = .kg; squat.kgUnits = 40; squat.restSeconds = 180
        var plank = FreeStrengthItem(exercise: plancha)
        plank.series = 3; plank.measure = .time; plank.seconds = 45
        d.items = [squat, plank]

        let p1 = try XCTUnwrap(d.buildPlanPayload())
        guard case let .strength(de)? = FreePlanHydration.editTrack(
            from: detalle(p1, exercises: [zancada, sentadilla, plancha])) else {
            return XCTFail("no se reabrió en el constructor de fuerza")
        }
        let p2 = try XCTUnwrap(de.buildPlanPayload())
        XCTAssertEqual(p2.items, p1.items)
        XCTAssertTrue(de.includeWarmup)
    }

    // MARK: - Funcional

    func testForTimeDeUnaRondaVuelveConUna() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.forTime)
        d.rounds = 1; d.capSeconds = 0
        var m = FreeFunctionalMovement(exercise: remo); m.dose = .meters; m.meters = 2000
        d.movements = [m]
        try vueltaFuncional(d)
    }

    func testEmom45_15ConservaLaTransicion() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.emom)
        d.apply(.fortyFive15); d.rounds = 12
        var b = FreeFunctionalMovement(exercise: burpees); b.reps = 10
        var w = FreeFunctionalMovement(exercise: wallBalls); w.reps = 15
        d.movements = [b, w]
        try vueltaFuncional(d)
    }

    func testTabataConservaLaTransicion() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.emom)
        d.apply(.tabata)
        var b = FreeFunctionalMovement(exercise: burpees); b.dose = .time; b.seconds = 20
        d.movements = [b]
        try vueltaFuncional(d)
    }

    func testRondasConSusDosDescansos() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.rounds)
        d.rounds = 5; d.restSeconds = 60; d.seriesRestSeconds = 30
        var r = FreeFunctionalMovement(exercise: remo); r.dose = .calories; r.calories = 15
        var b = FreeFunctionalMovement(exercise: burpees); b.reps = 12
        var w = FreeFunctionalMovement(exercise: wallBalls); w.reps = 20
        d.movements = [r, b, w]
        try vueltaFuncional(d)
    }

    func testAmrap() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.amrap)
        d.windowSeconds = 720
        var b = FreeFunctionalMovement(exercise: burpees); b.reps = 8
        var w = FreeFunctionalMovement(exercise: wallBalls); w.reps = 12
        d.movements = [b, w]
        try vueltaFuncional(d)
    }

    func testCronometroSinMovimientos() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.emom)
        d.rounds = 10; d.cadenceSeconds = 60; d.transitionSeconds = 0
        try vueltaFuncional(d)
    }

    // MARK: - El tipo sale de la modalidad guardada, no del primer ejercicio

    func testUnWodQueEmpiezaRemandoNoSeReabreComoRemo() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.forTime)
        var r = FreeFunctionalMovement(exercise: remo); r.dose = .meters; r.meters = 500
        var b = FreeFunctionalMovement(exercise: burpees); b.reps = 20
        d.movements = [r, b]
        let p = try XCTUnwrap(d.buildPlanPayload())
        let conModalidad = detalle(p, exercises: [remo, burpees])
        XCTAssertEqual(FreePlanHydration.tipo(of: conModalidad), .funcional)

        // Un servidor que aún no expone la modalidad: se deduce del plan ENTERO.
        var sinModalidad = conModalidad
        let w = try XCTUnwrap(conModalidad.workout)
        sinModalidad = AssignmentDetail(
            assignment: conModalidad.assignment,
            workout: WorkoutDetail(name: w.name, focus: w.focus, coachNote: nil,
                                   estimatedDurationMinutes: nil, blocks: w.blocks,
                                   storeResults: nil, modality: nil),
            execution: nil, runCompliance: nil, clockPrescription: nil, clockFormat: nil)
        XCTAssertEqual(FreePlanHydration.tipo(of: sinModalidad), .funcional)
    }

    // MARK: - El vivo del libre sale de WorkoutPlan.from

    func testSeriesDeRemoCorrenComoLasDelCoach() throws {
        let d = FreeWorkoutDraft()
        d.selectModality(.row); d.format = .series
        d.rounds = 5; d.distanceMeters = 500; d.restSeconds = 90; d.targetKind = .pace; d.paceSeconds = 112
        let seg = try XCTUnwrap(d.buildContext()?.plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .intervals)
        XCTAssertEqual(seg.ergKind, "row")
        XCTAssertEqual(seg.targetPaceSecondsPerKm, 224, "1:52/500m → 3:44/km, como lo deriva el servidor")
        XCTAssertEqual(seg.targetDistanceMeters, 500)
        XCTAssertEqual(seg.sourceItemIndex, 0)
        XCTAssertNil(seg.templateSegmentId, "sin plan guardado aún, sin id")
    }

    func testUnForTimeDeRemoLibreDetectaElMonitor() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.forTime)
        var m = FreeFunctionalMovement(exercise: remo); m.dose = .meters; m.meters = 2000
        d.movements = [m]
        let plan = try XCTUnwrap(d.buildContext()?.plan)
        let tramo = try XCTUnwrap(plan.segments.first?.tramo(segmentIndex: 0))
        XCTAssertTrue(tramo.isErg, "la modalidad funcional forzada tapaba el PM5")
        XCTAssertEqual(tramo.modality, .row)
        XCTAssertFalse(PreWorkoutDeviceEligibility.devices(for: plan.segments).isEmpty)
    }

    func testCalentamientoVacioEsUnPasoSinEjercicio() throws {
        let d = FreeStrengthDraft()
        d.includeWarmup = true
        d.items = [FreeStrengthItem(exercise: sentadilla)]
        let plan = try XCTUnwrap(d.buildContext()?.plan)
        XCTAssertEqual(plan.segments.first?.title, "Calentamiento")
        XCTAssertNil(plan.segments.first?.sourceItemIndex, "no es un ejercicio del plan")
        XCTAssertEqual(plan.segments.last?.sourceItemIndex, 0)
        XCTAssertEqual(plan.blockRegions.count, 2)
    }

    func testElPlanSeGuardaAntesSalvoElCronometro() throws {
        let medido = FreeWorkoutDraft()
        medido.selectModality(.row); medido.format = .continuo; medido.measureKind = .time
        XCTAssertNotNil(medido.buildContext()?.planPayload)

        let reloj = FreeFunctionalDraft()
        reloj.selectFormat(.amrap)
        XCTAssertNil(reloj.buildContext()?.planPayload, "un cronómetro pelado se guarda al final")
    }

    // MARK: - La respuesta del plan guardado

    func testElPlanDevueltoTraeLosIdsEnOrden() throws {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let conSegmentos = try d.decode(FreePlanBinding.self, from: Data("""
        { "saved": true, "assignment_id": "812", "origin": "self",
          "segments": [ { "id": 5, "position": 0, "block_position": 0 },
                        { "id": "7", "position": 1, "block_position": 0 } ] }
        """.utf8))
        XCTAssertEqual(conSegmentos, FreePlanBinding(assignmentId: "812", segmentIds: [5, 7]))
        let viejo = try d.decode(FreePlanBinding.self, from: Data("""
        { "saved": true, "assignment_id": 812, "origin": "self" }
        """.utf8))
        XCTAssertEqual(viejo.segmentIds, [], "un servidor viejo: el entreno se guarda igual, sin ids")
    }
}
