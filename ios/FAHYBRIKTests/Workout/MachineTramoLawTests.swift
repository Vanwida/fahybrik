import XCTest
@testable import FAHYBRIK

// LEY DEL TRAMO EN MÁQUINA. Un remo y una cinta por esquema: si el motor no
// abre ventana de máquina, el sample no entra y el HUD miente. Remo = ski =
// bike = PM5; cinta = FTMS. Conectar no es empezar.
final class MachineTramoLawTests: XCTestCase {

    // MARK: - Carriles

    func testRemoSkiBikeSonPM5YCintaEsFTMS() {
        XCTAssertEqual(MachineTramoLaw.lane(for: .row), .pm5)
        XCTAssertEqual(MachineTramoLaw.lane(for: .ski), .pm5)
        XCTAssertEqual(MachineTramoLaw.lane(for: .bike), .pm5)
        XCTAssertEqual(MachineTramoLaw.lane(for: .run), .ftms)
        XCTAssertNil(MachineTramoLaw.lane(for: .strength))
        XCTAssertNil(MachineTramoLaw.lane(for: .functional))
    }

    func testTodosLosEsquemasTrabajanLaMaquina() {
        for scheme in PrescriptionScheme.allCases {
            XCTAssertTrue(MachineTramoLaw.worksMachine(scheme),
                          "\(scheme.rawValue) tiene que decidir, no caer fuera")
        }
    }

    // MARK: - Un remo y una cinta por esquema

    func testElMotorAbreTramoDeRemoEnTodosLosEsquemas() {
        for scheme in PrescriptionScheme.allCases {
            let s = session(scheme: scheme, modality: .row)
            let tramo = s.currentTramo
            XCTAssertTrue(
                MachineTramoLaw.recordsPM5(tramo: tramo, segment: s.currentSegment),
                "\(scheme.rawValue) remo: el PM5 no entra en la ventana (\(tramo.cursor), \(tramo.modality))"
            )
            XCTAssertFalse(
                MachineTramoLaw.recordsFTMS(tramo: tramo, segment: s.currentSegment),
                "\(scheme.rawValue) remo no es cinta"
            )
        }
    }

    func testElMotorAbreTramoDeCintaEnTodosLosEsquemas() {
        for scheme in PrescriptionScheme.allCases {
            let s = session(scheme: scheme, modality: .run)
            let tramo = s.currentTramo
            XCTAssertTrue(
                MachineTramoLaw.recordsFTMS(tramo: tramo, segment: s.currentSegment),
                "\(scheme.rawValue) cinta: el FTMS no entra en la ventana (\(tramo.cursor), \(tramo.modality))"
            )
            XCTAssertFalse(
                MachineTramoLaw.recordsPM5(tramo: tramo, segment: s.currentSegment),
                "\(scheme.rawValue) cinta no es remo"
            )
        }
    }

    func testSkiAbreElMismoCarrilQueRemo() {
        let s = session(scheme: .emom, modality: .ski)
        XCTAssertTrue(MachineTramoLaw.recordsPM5(tramo: s.currentTramo,
                                                segment: s.currentSegment))
        XCTAssertEqual(MachineTramoLaw.lane(for: s.currentTramo.modality), .pm5)
    }

    // MARK: - Conectar ≠ empezar

    func testConectarNoCuentaAntesDeEmpezar() {
        let s = parked(scheme: .intervals, modality: .row)
        XCTAssertTrue(s.isAwaitingBlockStart)
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: 250, caloriesKcal: 10)
        XCTAssertNil(s.lapErgLastDistance, "el sample de previa no entra")
        XCTAssertNil(s.tramoErgDistanceMeters)

        s.beginBlock()
        s.stop()
        s.primaryAdvance()
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: 250, caloriesKcal: 10)
        XCTAssertEqual(s.tramoErgDistanceMeters ?? 0, 0, accuracy: 0.001,
                       "el primer sample ancla, no suma")
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: 500, caloriesKcal: 18)
        XCTAssertEqual(s.tramoErgDistanceMeters ?? 0, 250, accuracy: 0.001)
    }

    func testConectarNoCuentaCintaAntesDeEmpezar() {
        let s = parked(scheme: .emom, modality: .run)
        XCTAssertTrue(s.isAwaitingBlockStart)
        s.sampleTreadmillDistance(deltaMeters: 80)
        XCTAssertEqual(s.lapBeltDistanceMeters, 0, accuracy: 0.001)

        s.beginBlock()
        s.stop()
        s.sampleTreadmillDistance(deltaMeters: 80)
        XCTAssertEqual(s.tramoBeltDistanceMeters ?? 0, 80, accuracy: 0.001)
    }

    func testPausaTampocoComeSample() {
        let s = session(scheme: .steady, modality: .row)
        s.togglePause()
        XCTAssertTrue(s.isPaused)
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: 400, caloriesKcal: 12)
        XCTAssertNil(s.lapErgLastDistance)
        s.togglePause()
        s.sampleErg(paceSecPer500m: 120, powerWatts: 200, strokeRate: 28,
                    distanceMeters: 400, caloriesKcal: 12)
        XCTAssertNotNil(s.lapErgLastDistance)
    }

    // MARK: - HUD y cursor

    func testElHUDLoDueñaElTramoNoElSegmentoPlegado() {
        let remo = session(scheme: .emom, modality: .row)
        XCTAssertTrue(MachineTramoLaw.machineOwnsHUD(tramo: remo.currentTramo))
        XCTAssertEqual(remo.currentTramo.modality, .row)

        let cinta = session(scheme: .warmup, modality: .run)
        XCTAssertTrue(MachineTramoLaw.machineOwnsHUD(tramo: cinta.currentTramo))
        XCTAssertEqual(cinta.currentTramo.modality, .run)

        let hierro = LiveTramo(segmentIndex: 0, cursor: .strengthSet(0),
                               label: "Sentadilla", modality: .strength,
                               measure: .reps(10), boxedSeconds: nil)
        XCTAssertFalse(MachineTramoLaw.machineOwnsHUD(tramo: hierro))
    }

    func testSuperserieRemoTrasSentadillaSoloCuentaElRemo() {
        let squat = PrescriptionSet(measure: .reps(8), target: nil,
                                    modality: .strength, restS: 90,
                                    tempo: nil, note: "Sentadilla")
        let remo = PrescriptionSet(measure: .distance(meters: 250), target: nil,
                                   modality: .row, restS: 90,
                                   tempo: nil, note: "Remo")
        let p = Prescription(scheme: .superset, modality: nil,
                             sets: [squat, remo], rounds: nil, workS: nil,
                             restS: 90, totalS: nil, target: nil, note: nil,
                             start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "A1/A2", kind: .strength,
                                 blockTitle: "Principal", blockPosition: 1,
                                 prescription: p)
        let squatTramo = seg.rotationTramo(segmentIndex: 0,
                                           cursor: .strengthSet(0),
                                           index: 0, boxedSeconds: nil)
        let remoTramo = seg.rotationTramo(segmentIndex: 0,
                                          cursor: .strengthSet(1),
                                          index: 1, boxedSeconds: nil)
        XCTAssertFalse(MachineTramoLaw.recordsPM5(tramo: squatTramo, segment: seg))
        XCTAssertTrue(MachineTramoLaw.recordsPM5(tramo: remoTramo, segment: seg))
        XCTAssertTrue(MachineTramoLaw.machineOwnsHUD(tramo: remoTramo))
        XCTAssertFalse(MachineTramoLaw.machineOwnsHUD(tramo: squatTramo))
    }

    func testAMRAPLibreConRemoGrabaAunqueElTramoSeaElSegmento() {
        let s = session(scheme: .amrap, modality: .row)
        XCTAssertEqual(s.currentTramo.cursor, .segment)
        XCTAssertTrue(MachineTramoLaw.recordsPM5(tramo: s.currentTramo,
                                                segment: s.currentSegment))
    }

    func testCalentamientoDeCintaNoEsChecklistMudo() {
        let s = session(scheme: .warmup, modality: .run)
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(MachineTramoLaw.machineOwnsHUD(tramo: s.currentTramo))
        XCTAssertTrue(MachineTramoLaw.recordsFTMS(tramo: s.currentTramo,
                                                 segment: s.currentSegment))
        s.sampleTreadmillDistance(deltaMeters: 120)
        XCTAssertEqual(s.tramoBeltDistanceMeters ?? 0, 120, accuracy: 0.001)
    }

    // MARK: - Builders

    /// Sesión ya dentro del bloque, reloj parado. El tramo está vivo.
    private func session(scheme: PrescriptionScheme,
                         modality: PrescriptionModality) -> WorkoutSession {
        let s = parked(scheme: scheme, modality: modality)
        s.beginBlock()
        s.stop()
        if s.isTramoCountIn { s.primaryAdvance() }
        return s
    }

    /// Tras `start`: previa armada, reloj parado. Conectar aquí no cuenta.
    private func parked(scheme: PrescriptionScheme,
                        modality: PrescriptionModality) -> WorkoutSession {
        let s = WorkoutSession(plan: plan(scheme: scheme, modality: modality))
        s.start()
        s.stop()
        return s
    }

    private func plan(scheme: PrescriptionScheme,
                      modality: PrescriptionModality) -> WorkoutPlan {
        // El fold real aplasta EMOM / For Time / warmup a `.reps`. El kind
        // dedicado no es el caso que este test existe para cazar.
        let kind: SegmentKind = (scheme == .sets || scheme == .superset)
            ? .strength
            : .reps
        let measure: Measure = (modality == .run || scheme == .warmup || scheme == .cooldown)
            ? .duration(seconds: 360)
            : .distance(meters: 500)
        let set = PrescriptionSet(measure: measure, target: nil,
                                  modality: modality, restS: restS(scheme),
                                  tempo: nil, note: nil)
        let p = Prescription(scheme: scheme,
                             modality: nil,
                             sets: [set],
                             rounds: rounds(scheme),
                             workS: workS(scheme),
                             restS: restS(scheme),
                             totalS: totalS(scheme),
                             target: nil, note: nil,
                             start: scheme == .deathBy ? 1 : nil,
                             increment: scheme == .deathBy ? 1 : nil)
        let title = scheme == .warmup ? "Calentamiento"
            : (scheme == .cooldown ? "Vuelta a la calma" : "Máquina")
        let seg = WorkoutSegment(
            order: 1, title: title, kind: kind,
            targetDistanceMeters: measure.targetDistance,
            targetDurationSeconds: measure.targetDuration,
            blockTitle: title, blockPosition: 1,
            prescription: p
        )
        return WorkoutPlan(id: UUID(), name: title, format: scheme,
                           estimatedDurationSeconds: 900, blockContext: title,
                           zoneTargets: [], equipment: [], segments: [seg],
                           coachNote: nil, warmupChecklist: [])
    }

    private func rounds(_ scheme: PrescriptionScheme) -> Int? {
        switch scheme {
        case .emom: return 12
        case .intervals, .tabata: return 8
        case .deathBy: return 10
        case .amrap, .rounds: return 3
        default: return nil
        }
    }

    private func workS(_ scheme: PrescriptionScheme) -> Int? {
        switch scheme {
        case .emom: return 60
        case .tabata: return 20
        case .deathBy: return 60
        default: return nil
        }
    }

    private func restS(_ scheme: PrescriptionScheme) -> Int? {
        switch scheme {
        case .intervals: return 90
        case .tabata: return 10
        default: return nil
        }
    }

    private func totalS(_ scheme: PrescriptionScheme) -> Int? {
        switch scheme {
        case .amrap, .steady, .warmup, .cooldown: return 360
        default: return nil
        }
    }

    // MARK: - FH-60 inner cursor coexists with outer rounds (sala 5:00 remo + 5:00 run)

    func testRondasRemoRunConRoundsEsListaDeEstaciones() {
        let s = salaRemoRun(rondas: 10)
        XCTAssertTrue(s.currentSegment?.fixedListIsStations == true,
                      "N>1 movimientos son estaciones aunque formatRounds > 0")
        XCTAssertEqual(s.fixedListTotal, 20, "N × R strikes, no formatRounds")
        XCTAssertEqual(s.fixedStationCount, 2)
        XCTAssertTrue(s.fixedHasOuterRounds)
        XCTAssertEqual(s.currentTramo.modality, .row)
        XCTAssertTrue(s.currentTramo.isFixedStation)
        XCTAssertTrue(MachineTramoLaw.recordsPM5(tramo: s.currentTramo, segment: s.currentSegment))
        XCTAssertFalse(MachineTramoLaw.recordsFTMS(tramo: s.currentTramo, segment: s.currentSegment))
    }

    func testALos300sSinTapPasaARunYCambiaDeCarril() {
        let s = salaRemoRun(rondas: 10)
        let remo = s.currentTramo
        XCTAssertEqual(remo.modality, .row)
        XCTAssertEqual(remo.boxedSeconds, 300)
        XCTAssertFalse(remo.closesOnClock(elapsedInTramo: 299))
        XCTAssertTrue(remo.closesOnClock(elapsedInTramo: 300))

        s.lapElapsedSeconds = s.tramoStartElapsed + 300
        s.advanceStationIfClockGoalMet()

        XCTAssertEqual(s.fixedRoundsDone, 1, "el reloj cierra el remo, no hace falta markRoundDone")
        XCTAssertEqual(s.currentTramo.modality, .run)
        XCTAssertTrue(MachineTramoLaw.recordsFTMS(tramo: s.currentTramo, segment: s.currentSegment))
        XCTAssertFalse(MachineTramoLaw.recordsPM5(tramo: s.currentTramo, segment: s.currentSegment),
                       "en Run el PM5 no firma el tramo")
        XCTAssertEqual(s.fixedOuterRoundIndex, 0, "sigue la ronda 1; el cursor interior avanzó")
    }

    func testDiezStrikesDeDosMovimientosNoCierranCincoRondas() {
        let s = salaRemoRun(rondas: 10)
        for _ in 0..<10 { s.markRoundDone() }
        XCTAssertEqual(s.fixedRoundsDone, 10)
        XCTAssertEqual(s.fixedOuterRoundIndex, 5)
        XCTAssertFalse(s.isFinished)
        XCTAssertTrue(s.isConditioningActive)
        XCTAssertEqual(s.currentTramo.modality, .row, "ronda 6, de nuevo remo")
    }

    func testRondasHomogeneasDeUnMovimientoNoSonEstaciones() {
        let set = PrescriptionSet(measure: .duration(seconds: 300), target: nil,
                                  modality: .row, restS: nil, tempo: nil, note: "Rowing")
        let p = Prescription(scheme: .rounds, modality: .functional, sets: [set],
                             rounds: 10, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Rowing", kind: .reps,
                                 blockTitle: "Principal", blockPosition: 1, prescription: p)
        XCTAssertFalse(seg.fixedListIsStations,
                       "un solo movimiento con rounds sigue siendo ronda, no estación")
        let s = vivo(seg, formato: .rounds)
        XCTAssertEqual(s.fixedListTotal, 10)
        XCTAssertFalse(s.currentTramo.isFixedStation)
        XCTAssertTrue(MachineTramoLaw.recordsPM5(tramo: s.currentTramo, segment: s.currentSegment))
    }

    private func salaRemoRun(rondas: Int) -> WorkoutSession {
        vivo(Self.salaSegmento(rondas: rondas), formato: .rounds)
    }

    private func vivo(_ seg: WorkoutSegment, formato: PrescriptionScheme) -> WorkoutSession {
        let plan = WorkoutPlan(id: UUID(), name: seg.title, format: formato,
                               estimatedDurationSeconds: 3600, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }
        return s
    }

    static func salaSegmento(rondas: Int) -> WorkoutSegment {
        func set(_ m: Measure, _ mod: PrescriptionModality, _ nota: String) -> PrescriptionSet {
            PrescriptionSet(measure: m, target: nil, modality: mod, restS: nil, tempo: nil, note: nota)
        }
        let p = Prescription(
            scheme: .rounds, modality: .functional,
            sets: [
                set(.duration(seconds: 300), .row, "Rowing"),
                set(.duration(seconds: 300), .run, "Run"),
            ],
            rounds: rondas, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: 1, title: "Rowing · Run", kind: .reps,
                              blockTitle: "Principal", blockPosition: 1, prescription: p)
    }


}

private extension Measure {
    var targetDistance: Double? {
        if case let .distance(m, _) = self { return m }
        return nil
    }
    var targetDuration: Int? {
        if case let .duration(s, _) = self { return s }
        return nil
    }
}
