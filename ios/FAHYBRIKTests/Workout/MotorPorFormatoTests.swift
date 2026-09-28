import XCTest
@testable import FAHYBRIK

// EL MOTOR, FORMATO A FORMATO (28-sep) — docs/DECISIONS.md 2026-09-28.
//
// Cada caso es un plan REAL de la base (formas leídas de producción el 28-sep):
//   · plantilla 86  «Ergómetros Z2»: un bloque tempo con remo 15′ + ski 15′ + bici 15′.
//   · plantilla 342 «SIMULACIÓN HYROX COMPLETA»: 16 bloques `hyrox_sim` de un
//     ejercicio `steady` cada uno.
//   · un Tabata 20/10 × 8 y un Death By, que se pintaban con la cara por rondas.
final class MotorPorFormatoTests: XCTestCase {

    // MARK: - Fixtures (el detalle como lo manda el servidor)

    private let sinParams = WorkoutItemParams(
        sets: nil, reps: nil, loadKg: nil, loadPct: nil, rpe: nil, restSeconds: nil,
        durationSeconds: nil, distanceKm: nil, distanceMeters: nil, paceSecPerKm: nil,
        cadenceSpm: nil, calories: nil, caloriesPerMin: nil, hrZone: nil, watts: nil
    )

    private func item(_ id: Int, _ name: String, category: String, slug: String,
                      rx: Prescription?) -> WorkoutItem {
        WorkoutItem(uid: "segment-\(id)", templateSegmentId: id, exerciseId: "e\(id)",
                    exerciseName: name, exerciseSlug: slug, exerciseCategory: category,
                    exerciseVideoUrl: nil, cues: nil, exerciseDescription: nil,
                    paramsJson: rx.map(WorkoutItemParams.init(derivedFrom:)) ?? sinParams,
                    prescription: rx, resolvedIntensity: nil, resolvedLoad: nil, notes: nil)
    }

    private func block(_ pos: Int, _ title: String, format: String, _ items: [WorkoutItem]) -> WorkoutBlock {
        WorkoutBlock(uid: "b\(pos)", title: title, format: format, blockPosition: pos,
                     coachNote: nil, configJson: nil, items: items)
    }

    private func detalle(_ blocks: [WorkoutBlock], dobles: StationAssignment? = nil) -> AssignmentDetail {
        AssignmentDetail(
            assignment: AssignmentInfo(id: "1", athleteId: "a", scheduledFor: "2026-09-28",
                                       status: "scheduled", slot: nil, templateId: nil,
                                       templateVersion: nil, completedAt: nil, perceivedExertion: nil,
                                       stationAssignment: dobles, myRole: dobles == nil ? nil : "a",
                                       storeResults: nil),
            workout: WorkoutDetail(name: "Test", focus: nil, coachNote: nil,
                                   estimatedDurationMinutes: nil, blocks: blocks, storeResults: nil),
            execution: nil, runCompliance: nil, clockPrescription: nil, clockFormat: nil
        )
    }

    private func rx(_ scheme: PrescriptionScheme, _ modality: PrescriptionModality?,
                    sets: [PrescriptionSet]? = nil, rounds: Int? = nil, workS: Int? = nil,
                    restS: Int? = nil, totalS: Int? = nil, target: Target? = nil,
                    start: Int? = nil, increment: Int? = nil) -> Prescription {
        Prescription(scheme: scheme, modality: modality, sets: sets, rounds: rounds,
                     workS: workS, restS: restS, totalS: totalS, target: target, note: nil,
                     start: start, increment: increment)
    }

    private func set(_ m: Measure, _ t: Target? = nil, _ mod: PrescriptionModality? = nil) -> PrescriptionSet {
        PrescriptionSet(measure: m, target: t, modality: mod, restS: nil, tempo: nil, note: nil)
    }

    private func sesion(_ plan: WorkoutPlan) -> WorkoutSession {
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    // MARK: - 7 · Alias del servidor

    func testLosAliasDelServidorSeReconocen() {
        XCTAssertEqual(PrescriptionScheme(canonicalizing: "simulation"), .hyroxSim)
        XCTAssertEqual(PrescriptionScheme(canonicalizing: "superserie"), .superset)
    }

    // MARK: - 4 · Un bloque continuo con varias máquinas son N tramos

    private var plantilla86: AssignmentDetail {
        detalle([block(0, "Ergómetros Z2", format: "tempo", [
            item(422, "Row", category: "rowing", slug: "row", rx: rx(.steady, .row, totalS: 900)),
            item(423, "SkiErg", category: "ski_erg", slug: "ski-erg", rx: rx(.steady, .ski, totalS: 900)),
            item(424, "BikeErg", category: "bike_erg", slug: "bike-erg", rx: rx(.steady, .bike, totalS: 900)),
        ])])
    }

    func testBloqueContinuoMultiMaquinaEsUnTramoPorMaquina() throws {
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: plantilla86))
        XCTAssertEqual(plan.segments.count, 3, "remo 15′ + ski 15′ + bici 15′ son tres piezas")
        XCTAssertEqual(plan.segments.map(\.ergKind), ["row", "ski", "bike"])
        XCTAssertEqual(plan.segments.map(\.templateSegmentId), [422, 423, 424])
        XCTAssertEqual(plan.segments.compactMap(\.formatTotalSeconds).reduce(0, +), 2700,
                       "el bloque dura la SUMA, no lo del ítem más largo")
        XCTAssertEqual(plan.segments.map { $0.tramo(segmentIndex: 0).modality }, [.row, .ski, .bike],
                       "cada tramo con SU máquina, no la del primero")
        XCTAssertEqual(plan.segments.map(\.sourceItemIndex), [0, 1, 2])
        // Mismo bloque → sin puerta entre máquina y máquina.
        XCTAssertEqual(plan.blockRegions.count, 1)
    }

    // MARK: - 5 · HYROX por bloques = una ruta

    private func hyroxPorBloques(dobles: StationAssignment? = nil) -> AssignmentDetail {
        let pace = Target.pace(unit: .perKm, valueS: nil, minS: 220, maxS: 230)
        return detalle([
            block(0, "Run 1", format: "hyrox_sim", [item(2168, "Run", category: "running", slug: "run",
                rx: rx(.steady, .run, sets: [set(.distance(meters: 1000), pace)]))]),
            block(1, "Estación 1 · SkiErg", format: "hyrox_sim", [item(2169, "SkiErg", category: "ski_erg", slug: "ski-erg",
                rx: rx(.steady, .ski, sets: [set(.distance(meters: 1000))]))]),
            block(2, "Run 2", format: "hyrox_sim", [item(2170, "Run", category: "running", slug: "run",
                rx: rx(.steady, .run, sets: [set(.distance(meters: 1000), pace)]))]),
            block(3, "Estación 8 · Wall Balls", format: "hyrox_sim", [item(2183, "Wall Balls", category: "functional",
                slug: "hyrox-wall-balls", rx: rx(.steady, .functional, sets: [set(.reps(100), .kg(value: 9, min: nil, max: nil))]))]),
        ], dobles: dobles)
    }

    func testHyroxPorBloquesCorreComoUnaRutaSinPuertas() throws {
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: hyroxPorBloques()))
        XCTAssertEqual(plan.segments.count, 1, "16 bloques de simulacro son UNA carrera")
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .hyroxSim)
        XCTAssertTrue(seg.fixedListIsStations)
        XCTAssertEqual(plan.format, .hyroxSim)
        XCTAssertEqual(seg.stationSources?.map(\.templateSegmentId), [2168, 2169, 2170, 2183])
        XCTAssertEqual(seg.stationSources?.map(\.itemIndex), [0, 1, 2, 3])

        let s = sesion(plan)
        s.primaryAdvance()   // salta el 3-2-1
        for _ in 0..<3 {
            XCTAssertFalse(s.isAwaitingBlockStart, "ninguna puerta «Arrancar bloque» entre estaciones")
            s.markRoundDone()
        }
        s.markRoundDone()    // la última cierra la carrera
        XCTAssertNotNil(s.capturedScoreTimeSeconds, "el tiempo final se captura como puntuación")

        // Un lap por ESTACIÓN, con su ejercicio y su máquina — no una vuelta mezclada.
        XCTAssertEqual(s.laps.count, 4)
        XCTAssertEqual(s.laps.map(\.templateSegmentId), [2168, 2169, 2170, 2183])
        XCTAssertEqual(s.laps.map(\.modality), ["run", "ski", "run", "functional"])
        XCTAssertEqual(s.laps.map(\.itemIndex), [0, 1, 2, 3])
        XCTAssertEqual(s.laps.map(\.roundIndex), [0, 0, 0, 0])

        let iso = ISO8601DateFormatter()
        let dtos = SegmentPayloadBuilder.build(laps: s.laps, iso: iso)
        XCTAssertEqual(Set(dtos.map(\.position)).count, 4, "posiciones únicas: el servidor no funde filas")
        XCTAssertEqual(dtos.map(\.item_index), [0, 1, 2, 3])
        XCTAssertEqual(dtos.map(\.leg_index), [0, 1, 2, 3])
    }

    func testDeshacerUnaEstacionBorraSuLap() throws {
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: hyroxPorBloques()))
        let s = sesion(plan)
        s.primaryAdvance()
        s.markRoundDone()
        s.markRoundDone()
        XCTAssertEqual(s.laps.count, 2)
        s.unmarkLastRound()
        XCTAssertEqual(s.laps.count, 1, "la estación deshecha no queda grabada")
        XCTAssertEqual(s.laps.last?.templateSegmentId, 2168)
    }

    func testTerminarAMitadGuardaLaEstacionAbiertaYNoMezcla() throws {
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: hyroxPorBloques()))
        let s = sesion(plan)
        s.primaryAdvance()
        s.markRoundDone()
        s.lapElapsedSeconds += 30          // 30 s dentro de la estación 2 (SkiErg)
        s.finish(completeness: .partial)
        XCTAssertEqual(s.laps.map(\.templateSegmentId), [2168, 2169],
                       "la estación abierta se graba sola; ninguna vuelta de bloque mezclada")
    }

    func testEnDoblesLaSimulacionNoSeUne() throws {
        let dobles = StationAssignment(stations: [], partnerFirstName: nil)
        // Sin estaciones repartidas no hay reparto que conservar: se une.
        XCTAssertEqual(WorkoutPlan.from(detail: hyroxPorBloques(dobles: dobles))?.segments.count, 1)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let conReparto = try decoder.decode(StationAssignment.self, from: Data("""
        { "stations": [ { "assigned_to": "a", "template_segment_id": 2169 } ] }
        """.utf8))
        XCTAssertEqual(WorkoutPlan.from(detail: hyroxPorBloques(dobles: conReparto))?.segments.count, 4,
                       "el reparto de la pareja va estación a estación")
    }

    func testUnBloquePuntuableDeUnEjercicioCorreConElFormatoDelBloque() throws {
        // «2K remo a fondo» en un bloque `test` (→ For Time): una prueba que se puntúa por tiempo.
        let prueba = detalle([block(0, "2K remo a fondo", format: "test", [
            item(1, "Row", category: "rowing", slug: "row",
                 rx: rx(.steady, .row, sets: [set(.distance(meters: 2000))])),
        ])])
        XCTAssertEqual(WorkoutPlan.from(detail: prueba)?.segments.first?.formatScheme, .forTime)

        // Un circuito con 4×4 de fuerza: la estructura es del ejercicio y se respeta.
        let fuerza = detalle([block(0, "C · Core", format: "circuit", [
            item(2, "Turkish get-up", category: "strength", slug: "tgu",
                 rx: rx(.sets, .strength, sets: Array(repeating: set(.reps(4)), count: 4))),
        ])])
        XCTAssertEqual(WorkoutPlan.from(detail: fuerza)?.segments.first?.formatScheme, .sets)

        // Un test de 30′ (steady con ventana) en un bloque de intervalos: no se toca.
        let test30 = detalle([block(0, "TEST 30'", format: "intervals", [
            item(3, "Run", category: "running", slug: "run", rx: rx(.steady, .run, totalS: 1800)),
        ])])
        XCTAssertEqual(WorkoutPlan.from(detail: test30)?.segments.first?.formatScheme, .steady)
    }

    // MARK: - 9 · Una ruta de solo correr no hereda la primera pierna

    func testRutaDeSoloCorrerNoHeredaLaDosisDeLaPrimera() throws {
        let z = { (n: Double) in Target.hrZone(value: n, min: nil, max: nil) }
        let d = detalle([block(0, "Progresivo", format: "for_time", [
            item(1, "Run", category: "running", slug: "run", rx: rx(.steady, .run, sets: [set(.distance(meters: 3000), z(2))])),
            item(2, "Run", category: "running", slug: "run", rx: rx(.steady, .run, sets: [set(.distance(meters: 3000), z(3))])),
            item(3, "Run", category: "running", slug: "run", rx: rx(.steady, .run, sets: [set(.distance(meters: 3000), z(4))])),
        ])])
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: d)?.segments.first)
        XCTAssertNil(seg.targetZone, "Z2 era de la primera pierna, no del bloque")
        XCTAssertEqual(seg.rotationSet(at: 2)?.target, z(4), "cada pierna lleva SU objetivo")
    }

    // MARK: - 6 · Tabata y Death By: la ronda la lleva el motor

    private func planDe(_ p: Prescription, kind: SegmentKind = .reps) -> WorkoutPlan {
        let seg = WorkoutSegment(order: 1, title: "Burpees", kind: kind,
                                 blockTitle: "Metcon", blockPosition: 1, prescription: p)
        return WorkoutPlan(id: UUID(), name: "T", format: p.scheme, estimatedDurationSeconds: 240,
                           blockContext: "", zoneTargets: [], equipment: [], segments: [seg],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }

    func testTabataLaCaraLeeLaRondaDelMotorYSuCuentaAtras() throws {
        let s = sesion(planDe(rx(.tabata, nil, rounds: 8, workS: 20, restS: 10)))
        XCTAssertEqual(s.relojRotativo?.fase, .preparate)
        s.primaryAdvance()   // salta el 3-2-1
        var r = try XCTUnwrap(s.relojRotativo)
        XCTAssertEqual(r.fase, .trabajo)
        XCTAssertEqual(r.ronda, 1)
        XCTAssertEqual(r.rondas, 8)
        XCTAssertEqual(r.segundos, 20, accuracy: 0.01)
        XCTAssertNil(r.reps, "sin contar no es cero")

        s.tabataAddRep()
        s.tabataAddRep()
        XCTAssertEqual(s.relojRotativo?.reps, 2)

        s.tickConditioning(dt: 20)   // fin del trabajo → descanso
        XCTAssertEqual(s.relojRotativo?.fase, .descanso)
        s.tickConditioning(dt: 10)   // fin del descanso → ronda 2
        r = try XCTUnwrap(s.relojRotativo)
        XCTAssertEqual(r.ronda, 2, "la ronda la mueve el reloj; antes se quedaba en 1/8")
        XCTAssertEqual(r.fase, .trabajo)
    }

    func testDeathByDiceElObjetivoDelMinuto() throws {
        let s = sesion(planDe(rx(.deathBy, nil, sets: [set(.reps(2))], workS: 60, start: 2, increment: 2)))
        s.primaryAdvance()
        var r = try XCTUnwrap(s.relojRotativo)
        XCTAssertEqual(r.ronda, 1)
        XCTAssertNil(r.rondas, "Death By no tiene final escrito")
        XCTAssertEqual(r.objetivo, "2 reps")
        s.tickConditioning(dt: 60)
        r = try XCTUnwrap(s.relojRotativo)
        XCTAssertEqual(r.ronda, 2)
        XCTAssertEqual(r.objetivo, "4 reps", "el objetivo sube con cada minuto")
    }

    func testUnContinuoSinMaquinaCuentaLoQueQueda() throws {
        let s = sesion(planDe(rx(.steady, .mobility, totalS: 600)))
        s.primaryAdvance()
        let r = try XCTUnwrap(s.relojRotativo)
        XCTAssertEqual(r.fase, .continuo)
        XCTAssertEqual(r.segundos, 600, accuracy: 0.5)
    }

    // MARK: - 10 · «Luego» es el siguiente TRAMO

    func testLuegoAnunciaLaSiguienteEstacionDeLaRuta() throws {
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: hyroxPorBloques()))
        let s = sesion(plan)
        s.primaryAdvance()
        let luego = try XCTUnwrap(s.nextTramoLine)
        XCTAssertTrue(luego.contains("SkiErg"), "en el Run 1 lo siguiente es el SkiErg, no otro bloque: \(luego)")
        XCTAssertNil(s.nextTramoZone)
    }

    // MARK: - 12 · El esfuerzo de la serie se pregunta en su escala

    func testElEsfuerzoSePreguntaEnLaEscalaQuePrescribioElCoach() {
        let rir = Target.rir(value: 2, min: nil, max: nil)
        let conRir = WorkoutSegment(order: 1, title: "Sentadilla", kind: .strength,
                                    blockTitle: "Fuerza", blockPosition: 1,
                                    prescription: rx(.sets, .strength,
                                                     sets: Array(repeating: set(.reps(5), rir), count: 3)))
        let s = sesion(WorkoutPlan(id: UUID(), name: "F", format: .sets, estimatedDurationSeconds: 600,
                                   blockContext: "", zoneTargets: [], equipment: [], segments: [conRir],
                                   coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        XCTAssertEqual(s.escalaDeEsfuerzo(serie: 0), .rir)
        s.anotarEsfuerzo(serie: 0, 2)
        XCTAssertEqual(s.setRecords.first?.rir, 2)
        XCTAssertNil(s.setRecords.first?.rpe)
        XCTAssertEqual(s.esfuerzoAnotado(serie: 0), 2)
    }

    // MARK: - El cable enlaza por el orden del plan

    func testUnLapSinIdSeEnlazaPorSuPosicionEnElPlan() {
        var lap = LapRecord(id: UUID(), segmentId: UUID(), templateSegmentId: nil, position: 1,
                            modality: "row", startedAt: Date(), endedAt: Date(), durationSeconds: 60,
                            avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: [:], repsCompleted: nil,
                            distanceCoveredMeters: nil, avgPaceSecPer500m: nil, avgPaceSecPerKm: nil,
                            avgPowerWatts: nil, strokeRateSpm: nil, calories: nil, weightUsedKg: nil,
                            source: "manual")
        lap.itemIndex = 1
        let iso = ISO8601DateFormatter()
        let sinPlan = SegmentPayloadBuilder.build(laps: [lap], iso: iso)
        XCTAssertNil(sinPlan.first?.template_segment_id)
        XCTAssertEqual(sinPlan.first?.item_index, 1)
        let conPlan = SegmentPayloadBuilder.build(laps: [lap], iso: iso, planSegmentIds: [70, 71])
        XCTAssertEqual(conPlan.first?.template_segment_id, 71, "por el ORDEN devuelto, no por position")
    }

    // MARK: - 11 · La BikeErg no se lee como un remo

    func testLaBikeErgSeLeePorMilMetrosYRpm() {
        let bici = LecturaErgo.de(.bike)
        XCTAssertEqual(bici.unidadRitmo, "/1000m")
        XCTAssertEqual(bici.unidadFrecuencia, "rpm")
        XCTAssertEqual(bici.ritmo(desdePor500: 60), 120, accuracy: 0.001)
        XCTAssertEqual(LecturaErgo.de(.row).unidadRitmo, "/500m")
        XCTAssertEqual(LecturaErgo.de(.row).ritmo(desdePor500: 110), 110, accuracy: 0.001)
    }
}
