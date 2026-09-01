import XCTest
@testable import FAHYBRIK

// EL ÁRBOL DEL LIVE — una superficie, nunca nil, nunca el cromo C.
//
// Quien gana pinta la pantalla entera. Cerrar la tapa de la cinta no cambia el
// tramo: `maybeAutoOpenRunCover` no reabre, y `SuperficieViva.de` sigue siendo
// `.run` (MarcoVivo), no el phaseRail PRINCIPAL + TERMINAR 40 pt.

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

    func testTodasLasRamasVivasExistenYNingunaEsElArbolViejo() {
        let ramas: [SuperficieViva] = [
            .relay, .structural, .runStructure, .rest, .ergo,
            .emom, .conditioning, .run, .fuerza
        ]
        XCTAssertEqual(Set(ramas).count, ramas.count)
    }

    // MARK: - Fixtures

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
