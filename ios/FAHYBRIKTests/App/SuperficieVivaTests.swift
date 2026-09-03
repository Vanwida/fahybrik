import XCTest
@testable import FAHYBRIK

// EL ÁRBOL DEL LIVE — una superficie, nunca nil, nunca el cromo C.
//
// Quien gana pinta la pantalla entera. Correr (`.run` / `.runStructure`) monta
// Outdoor/Treadmill EN SITIO (`RunLiveChrome`); no hay tapa encima de otro HUD.

final class SuperficieVivaTests: XCTestCase {

    func testBikeErgNoCaeAlCromoAntiguo() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "BikeErg", kind: .rowOrSki,
            targetDistanceMeters: 1000,
            blockTitle: "Principal", blockPosition: 1,
            prescription: Prescription(scheme: .steady, modality: .bike, sets: nil,
                                       rounds: nil, workS: nil, restS: nil, totalS: 600,
                                       target: nil, note: nil, start: nil, increment: nil),
            ergKind: "bike"
        ), nombre: "BikeErg", formato: .steady)
        XCTAssertTrue(s.tramoIsErg)
        XCTAssertEqual(SuperficieViva.de(s), .ergo)
        XCTAssertFalse(SuperficieViva.de(s).montaMarcoPropio)
    }

    func testEmomDeBurpeesSigueSiendoEmom() {
        let s = sesionDeEmom(skiPrimero: false)
        XCTAssertEqual(SuperficieViva.de(s), .emom)
        XCTAssertTrue(SuperficieViva.de(s).montaMarcoPropio)
    }

    func testElMinutoDeSkiDeUnEmomEsErgoNoEmomNiCromoC() {
        let s = sesionDeEmom(skiPrimero: true)
        XCTAssertTrue(s.currentSegment?.isEMOM == true)
        XCTAssertTrue(s.tramoIsErg, "El tramo decide la lectura: este minuto es máquina")
        XCTAssertEqual(SuperficieViva.de(s), .ergo)
    }

    func testCerrarLaTapaDeLaCintaNoCambiaLaSuperficie() {
        let s = sesionDeRodaje()
        // La trampa: `.steady` dispara el timer continuo. El rodaje no es un
        // AMRAP — `de()` tiene que seguir siendo `.run` con tapa y sin ella.
        XCTAssertEqual(s.currentSegment?.kind, .running)
        XCTAssertTrue(s.currentSegment?.isConditioningTimer == true)
        s.runEnvironment = .treadmill
        XCTAssertEqual(SuperficieViva.de(s), .run)
        // dismiss() de la tapa no mueve el tramo. La misma sesión, sin cover,
        // sigue siendo `.run` dentro de MarcoVivo — no hay rama que pinte C.
        s.runEnvironment = .treadmill
        XCTAssertEqual(SuperficieViva.de(s), .run)
    }

    func testUnaSerieDeIntervalosEnCarreraSigueSiendoElSujetoDeFormato() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "Series", kind: .running,
            blockTitle: "Principal", blockPosition: 1,
            prescription: Prescription(scheme: .intervals, modality: .run, sets: nil,
                                       rounds: nil, workS: nil, restS: nil, totalS: nil,
                                       target: nil, note: nil, start: nil, increment: nil)
        ), nombre: "Series", formato: .intervals)
        XCTAssertTrue(s.currentSegment?.isConditioningTimer == true)
        XCTAssertTrue(s.currentSegment.map(TreadmillLegResolver.isRunSeries) == true)
        XCTAssertEqual(SuperficieViva.de(s), .conditioning)
    }

    func testElDescansoTieneSuperficiePropiaDentroDelMismoMarco() {
        let s = sesionDeEmom(skiPrimero: false, conTransicion: true)
        s.emomCountInRemaining = 0
        s.emomPhase = .rest
        s.emomPhaseRemaining = 15
        XCTAssertTrue(s.isTramoResting)
        XCTAssertEqual(SuperficieViva.de(s), .rest)
    }

    func testAmrapEligeElSujetoNoUnCromo() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "AMRAP 12", kind: .reps,
            blockTitle: "Principal", blockPosition: 1,
            prescription: Prescription(scheme: .amrap, modality: nil, sets: nil,
                                       rounds: nil, workS: nil, restS: nil, totalS: 720,
                                       target: nil, note: nil, start: nil, increment: nil)
        ), nombre: "AMRAP 12", formato: .amrap)
        XCTAssertTrue(s.currentSegment?.isConditioningTimer == true)
        XCTAssertEqual(SuperficieViva.de(s), .conditioning)
    }

    func testFuerzaSigueEnSuMarco() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "Back Squat", kind: .strength,
            targetReps: 5, loadKg: 100,
            blockTitle: "Fuerza", blockPosition: 1,
            prescription: Prescription(scheme: .sets, modality: nil, sets: nil,
                                       rounds: nil, workS: nil, restS: nil, totalS: nil,
                                       target: nil, note: nil, start: nil, increment: nil)
        ), nombre: "Fuerza", formato: .sets)
        XCTAssertEqual(SuperficieViva.de(s), .fuerza)
    }

    func testCalentamientoEsEstructuralDentroDelMarco() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "Movilidad", kind: .reps,
            blockTitle: "Calentamiento", blockPosition: 1
        ), nombre: "Calentamiento", formato: .warmup)
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertEqual(SuperficieViva.de(s), .structural)
    }

    func testElRelevoDeDoblesNoCaeAlCromoAntiguo() {
        var tramo = WorkoutSegment(
            order: 1, title: "SkiErg", kind: .rowOrSki,
            blockTitle: "Principal", blockPosition: 1
        )
        tramo.doblesSplit = SegmentDoblesSplit(
            role: .partner, selfShare: 0, note: nil,
            stationLabel: "SkiErg", partnerName: "Guillem"
        )
        let s = sesion(tramo: tramo, nombre: "Dobles", formato: .hyroxSim)
        XCTAssertTrue(s.currentSegmentIsPartnerRelay)
        XCTAssertEqual(SuperficieViva.de(s), .relay)
    }

    func testLaCarreraEstructuradaGanaAlDescansoGenerico() {
        let work = RunElement.segment(RunSegment(
            kind: .work, measure: .distance(m: 1000), target: nil, resolved: nil,
            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil
        ))
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil,
                              rounds: nil, workS: nil, restS: nil, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: [work])])
        let tramo = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: rx)
        let s = WorkoutSession(plan: plan([tramo], nombre: "Series", formato: .intervals))
        s.start()
        s.beginBlock()
        s.stop()
        XCTAssertTrue(s.isRunStructureActive)
        XCTAssertEqual(SuperficieViva.de(s), .runStructure)
    }

    /// Bloque Calentamiento (jog) + Principal (carrera): el calentamiento YA
    /// es el cromo nuevo. Al cerrar el bloque, la carrera sigue en el mismo.
    func testCalentamientoQueAbreCarreraEsElMismoCromo() {
        let s = sesionCalentamientoMasCarrera(jog: true)
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(s.calentamientoEnLaCarrera)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        XCTAssertTrue(SuperficieViva.de(s).esCarrera)
        XCTAssertEqual(RunLiveChrome.de(s), .host,
                       "sin calle/cinta el host espera la puerta — no una tapa")
        s.runEnvironment = .outdoor
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        s.completeStructuralBlock()
        XCTAssertEqual(s.currentSegment?.title, "5K")
        XCTAssertFalse(s.currentBlockIsStructural)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
    }

    func testCalentamientoDeMovilidadAntesDeCarreraUsaElMismoCromo() {
        let s = sesionCalentamientoMasCarrera(jog: false)
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(s.calentamientoEsListaEnLaCarrera)
        XCTAssertEqual(SuperficieViva.de(s), .run,
                       "no el host estructural: el live es calle/cinta")
        s.runEnvironment = .treadmill
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: false))
        s.completeStructuralBlock()
        XCTAssertEqual(s.currentSegment?.kind, .running)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: false))
    }

    /// Las tapas Outdoor/Treadmill ya no existen: el cromo en sitio es el live.
    /// kind == .running durante un calentamiento estructural no abre un cover.
    func testCalentamientoEstructuralCorriendoNoEsUnaTapaEncima() {
        let s = sesionCalentamientoMasCarrera(jog: true)
        s.start(); s.beginBlock(); s.stop()
        s.runEnvironment = .outdoor
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(s.calentamientoEnLaCarrera)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        XCTAssertNotEqual(SuperficieViva.de(s), .structural,
                          "un jog de calentamiento no pinta HostVivo debajo")
    }

    func testCalentamientoSinCarreraSigueSiendoEstructural() {
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "Movilidad", kind: .reps,
            blockTitle: "Calentamiento", blockPosition: 1
        ), nombre: "Solo movilidad", formato: .warmup)
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertFalse(s.calentamientoEnLaCarrera)
        XCTAssertFalse(s.calentamientoCorridoPorTramos)
        XCTAssertEqual(SuperficieViva.de(s), .structural)
    }

    /// FH-55: el jog YA es el live de correr. El toque es el tramo, no el bloque.
    func testJogDeCalentamientoSeCierraPorTramo() {
        let s = sesionCalentamientoMasCarrera(jog: true)
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(s.calentamientoEnLaCarrera)
        XCTAssertFalse(s.calentamientoEsListaEnLaCarrera)
        XCTAssertTrue(s.calentamientoCorridoPorTramos)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        s.primaryAdvance()
        XCTAssertEqual(s.currentSegment?.title, "5K")
        XCTAssertFalse(s.currentBlockIsStructural)
    }

    /// La lista de movilidad sigue siendo un hecho de bloque.
    func testListaDeCalentamientoNoSeCierraPorTramo() {
        let s = sesionCalentamientoMasCarrera(jog: false)
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(s.calentamientoEsListaEnLaCarrera)
        XCTAssertFalse(s.calentamientoCorridoPorTramos)
    }

    /// Captura 53: Tramo 1 de 17 · Run Technique. Un toque avanza UN tramo.
    /// `completeStructuralBlock` se saltaría los 16 que quedan.
    func testRunTechniqueEnCalentamientoAvanzaUnTramo() {
        let s = sesionRunTechniqueEnCalentamiento(tramos: 17)
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(s.calentamientoCorridoPorTramos)
        XCTAssertEqual(SuperficieViva.de(s), .runStructure)
        XCTAssertEqual(s.runLegTotal, 17)
        s.primaryAdvance()
        XCTAssertFalse(s.isRunCountIn)
        XCTAssertEqual(s.runLegNumber, 1)
        s.primaryAdvance()
        XCTAssertTrue(s.currentBlockIsStructural, "sigue en el calentamiento")
        XCTAssertEqual(s.runLegNumber, 2)
        XCTAssertEqual(s.currentSegment?.title, "Run Technique")
    }

    /// Libre + calentamiento: UN cromo (calle/cinta), no HostVivo debajo y tapa
    /// encima. El calentamiento es la primera pierna de la misma estructura.
    func testLibreRunConCalentamientoEsUnSoloCromoEnSitio() {
        let s = sesionLibreConCalentamiento(blockTitle: "Principal")
        s.start()
        s.beginBlock()
        s.stop()
        XCTAssertEqual(s.currentRunLeg?.phaseRole, .warmup)
        XCTAssertEqual(SuperficieViva.de(s), .runStructure)
        XCTAssertEqual(RunLiveChrome.de(s), .host,
                       "sin calle/cinta el host espera la puerta — no una tapa")
        s.runEnvironment = .outdoor
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        s.runEnvironment = .indoor
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: true))
        s.runEnvironment = .treadmill
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: false))
    }

    /// Owner model: bloque titulado Calentamiento + `kind == .running` (Libre
    /// con calentamiento). El test de «Principal» queda verde sin reproducirlo.
    /// UN presentador: la puerta no monta el live debajo.
    func testLibreCalentamientoTituladoNoApilaPuertaYLive() {
        let s = sesionLibreConCalentamiento(blockTitle: "Calentamiento")
        s.runEnvironment = .outdoor
        s.start()
        XCTAssertTrue(s.isAwaitingBlockStart)
        XCTAssertEqual(PresentadorVivo.de(s), .puerta,
                       "la puerta es el único canal — el cromo no vive debajo")
        XCTAssertEqual(SuperficieViva.de(s), .runStructure,
                       "el árbol ya sabe que es carrera; no pinta HostVivo estructural")
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        XCTAssertTrue(SuperficieViva.de(s).esCarrera)
        s.beginBlock()
        s.stop()
        XCTAssertEqual(PresentadorVivo.de(s), .live(.runStructure))
        XCTAssertEqual(s.currentRunLeg?.phaseRole, .warmup)
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
    }

    func testCalentamientoQueSeCorreNoMontaLiveBajoLaPuerta() {
        let s = sesionCalentamientoMasCarrera(jog: true)
        s.runEnvironment = .outdoor
        s.start()
        XCTAssertTrue(s.isAwaitingBlockStart)
        XCTAssertEqual(PresentadorVivo.de(s), .puerta)
        XCTAssertEqual(SuperficieViva.de(s), .run)
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        s.beginBlock()
        s.stop()
        XCTAssertEqual(PresentadorVivo.de(s), .live(.run))
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
    }

    func testTodasLasRamasVivasExistenYNingunaEsElArbolViejo() {
        let ramas: [SuperficieViva] = [
            .relay, .structural, .runStructure, .rest, .ergo,
            .emom, .conditioning, .run, .fuerza
        ]
        XCTAssertEqual(Set(ramas).count, ramas.count)
    }

    // MARK: - Fixtures


    // MARK: - FH-60 sala 5:00 remo + 5:00 run

    func testSalaRemoRunArrancaEnErgoNoEnStripDeRondas() {
        let s = salaViva()
        XCTAssertEqual(s.currentTramo.modality, .row)
        XCTAssertTrue(s.tramoIsErg)
        XCTAssertEqual(SuperficieViva.de(s), .ergo)
        XCTAssertFalse(s.tramoIsRun)
    }

    func testSalaRemoRunALos300sEsRunNoErgLiveStrip() {
        let s = salaViva()
        s.lapElapsedSeconds = s.tramoStartElapsed + 300
        s.advanceStationIfClockGoalMet()
        XCTAssertEqual(s.currentTramo.modality, .run)
        XCTAssertTrue(s.tramoIsRun)
        XCTAssertFalse(s.tramoIsErg)
        XCTAssertEqual(SuperficieViva.de(s), .run,
                       "sin cinta: RunLiveHUD / Watch indoor / manual, no strip de remo")
        s.runEnvironment = nil
        XCTAssertEqual(SuperficieViva.de(s), .run)
    }

    private func salaViva() -> WorkoutSession {
        let remo = PrescriptionSet(measure: .duration(seconds: 300), target: nil,
                                   modality: .row, restS: nil, tempo: nil, note: "Rowing")
        let run = PrescriptionSet(measure: .duration(seconds: 300), target: nil,
                                  modality: .run, restS: nil, tempo: nil, note: "Run")
        let p = Prescription(scheme: .rounds, modality: .functional, sets: [remo, run],
                             rounds: 10, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let s = sesion(tramo: WorkoutSegment(
            order: 1, title: "Rowing · Run", kind: .reps,
            blockTitle: "Principal", blockPosition: 1, prescription: p
        ), nombre: "Libre rondas", formato: .rounds)
        s.start(); s.beginBlock(); s.stop()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }
        return s
    }


    private func sesionLibreConCalentamiento(blockTitle: String) -> WorkoutSession {
        let calentamiento = RunElement.segment(RunSegment(
            kind: .work, measure: .duration(s: 600), target: .hrZone(2), resolved: nil,
            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil
        ))
        let principal = RunElement.segment(RunSegment(
            kind: .work, measure: .distance(m: 5000), target: .hrZone(3), resolved: nil,
            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil
        ))
        let rx = Prescription(scheme: .steady, modality: .run, sets: nil,
                              rounds: nil, workS: nil, restS: nil, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil,
                              structure: [
                                RunPhase(role: .warmup, elements: [calentamiento]),
                                RunPhase(role: .main, elements: [principal]),
                              ])
        let tramo = WorkoutSegment(order: 1, title: "Libre", kind: .running,
                                   blockTitle: blockTitle, blockPosition: 1,
                                   prescription: rx)
        return WorkoutSession(plan: plan([tramo], nombre: "Libre", formato: .steady))
    }

    private func sesionRunTechniqueEnCalentamiento(tramos: Int) -> WorkoutSession {
        let elementos = (0..<tramos).map { _ in
            RunElement.segment(RunSegment(
                kind: .work, measure: .duration(s: 480), target: nil, resolved: nil,
                inclinePct: nil, cadenceSpm: nil, recoveryMode: nil
            ))
        }
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil,
                              rounds: nil, workS: nil, restS: nil, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil,
                              structure: [RunPhase(role: .warmup, elements: elementos)])
        let tecnica = WorkoutSegment(order: 1, title: "Run Technique", kind: .running,
                                     blockTitle: "Calentamiento", blockPosition: 1,
                                     prescription: rx)
        let principal = WorkoutSegment(order: 2, title: "5K", kind: .running,
                                       targetDistanceMeters: 5000,
                                       blockTitle: "Principal", blockPosition: 2)
        return WorkoutSession(plan: plan([tecnica, principal],
                                         nombre: "Run Technique", formato: .intervals))
    }

    private func sesionCalentamientoMasCarrera(jog: Bool) -> WorkoutSession {
        let wu = jog
            ? WorkoutSegment(order: 1, title: "Jog", kind: .running,
                             targetDurationSeconds: 600,
                             blockTitle: "Calentamiento", blockPosition: 1)
            : WorkoutSegment(order: 1, title: "Movilidad", kind: .reps,
                             blockTitle: "Calentamiento", blockPosition: 1)
        let run = WorkoutSegment(order: 2, title: "5K", kind: .running,
                                 targetDistanceMeters: 5000,
                                 blockTitle: "Principal", blockPosition: 2)
        return WorkoutSession(plan: plan([wu, run], nombre: "Hoy", formato: .steady))
    }

    private func sesionDeRodaje() -> WorkoutSession {
        sesion(tramo: WorkoutSegment(
            order: 1, title: "Rodaje Z2", kind: .running,
            targetDurationSeconds: 1800,
            blockTitle: "Principal", blockPosition: 1,
            prescription: Prescription(scheme: .steady, modality: .run, sets: nil,
                                       rounds: nil, workS: nil, restS: nil, totalS: 1800,
                                       target: nil, note: nil, start: nil, increment: nil)
        ), nombre: "Rodaje Z2", formato: .steady)
    }

    private func sesionDeEmom(skiPrimero: Bool, conTransicion: Bool = false) -> WorkoutSession {
        func set(_ reps: Int, _ nombre: String, _ mod: PrescriptionModality?) -> PrescriptionSet {
            PrescriptionSet(measure: .reps(reps), target: nil, modality: mod,
                            restS: nil, tempo: nil, note: nombre)
        }
        let sets = skiPrimero
            ? [set(12, "SkiErg", .ski), set(10, "Burpees", .functional)]
            : [set(10, "Burpees", .functional), set(12, "Wall balls", .functional)]
        let p = Prescription(scheme: .emom, modality: nil, sets: sets, rounds: 12,
                             workS: 45, restS: conTransicion ? 15 : nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        return sesion(tramo: WorkoutSegment(
            order: 1, title: "EMOM 12", kind: .reps, targetReps: 10,
            blockTitle: "Principal", blockPosition: 1, prescription: p
        ), nombre: "EMOM 12", formato: .emom)
    }

    private func sesion(tramo: WorkoutSegment, nombre: String,
                        formato: PrescriptionScheme) -> WorkoutSession {
        WorkoutSession(plan: plan([tramo], nombre: nombre, formato: formato))
    }

    private func plan(_ segmentos: [WorkoutSegment], nombre: String,
                      formato: PrescriptionScheme) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: nombre, format: formato,
                    estimatedDurationSeconds: 900, blockContext: "Principal",
                    zoneTargets: [], equipment: [], segments: segmentos,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
}
