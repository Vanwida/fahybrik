import XCTest
@testable import FAHYBRIK

// EL BLOQUE DE MAÑANA (plantilla 687, card 101 — segunda vuelta): 8 movimientos
// alternos, Run 1.000 · SkiErg 500 · Run 1.000 · Burpee 40 · Run 1.000 · Row 500 ·
// Run 1.000 · Wall Balls 25. El motor pliega un bloque de modalidades MIXTAS en UN
// solo segmento (`mergedConditioningSegment`, WorkoutModels.swift): con más de un
// `SegmentKind` entre sus movimientos, `kind = .reps` — nunca `.running`, aunque la
// mitad del bloque sea correr.
//
// Eso rompía dos cosas por el MISMO mecanismo que el podómetro huérfano de
// `RunPhoneSensorPlanTests` — otra guarda preguntando «¿de qué tipo es el
// SEGMENTO?» en vez de «¿está corriendo la VENTANA activa?»:
//
//   1. `ActiveWorkoutView.isRunSegment` leía `segment.kind == .running` → false en
//      las cuatro estaciones de correr → podómetro, GPS propio y barómetro
//      apagados los cuatro tramos. Se arregló leyendo `session.tramoIsRun`, que SÍ
//      resuelve por la ventana — aquí se comprueba el motor que alimenta esa
//      propiedad, `tramoIsRun` mismo.
//   2. `WorkoutSession.tramoRunCoveredMeters`, fuera de una carrera estructurada,
//      devolvía el acumulado GPS del SEGMENTO entero (`liveRunDistanceMeters`) sin
//      restar ningún ancla por estación — la tercera carrera del bloque empezaba
//      mostrando lo que ya habían cubierto las dos anteriores en vez de cero. Se
//      arregló con `tramoGpsStartDistance`, el gemelo GPS de
//      `tramoErgStartDistance` / `tramoBeltStartDistance` (mismo patrón, ya
//      probado en `syncTramoIfNeeded`).
final class BloqueMixtoConCarreraTests: XCTestCase {

    /// La forma EXACTA del bloque de mañana: 8 estaciones, sin descanso prescrito
    /// (una simulación va seguida, el reloj no para), plegadas en un único
    /// segmento `.reps` — la forma que produce un fold real de HYROX sim.
    private func bloqueDeManana() -> WorkoutSession {
        func set(_ m: Measure, _ modalidad: PrescriptionModality, _ nota: String) -> PrescriptionSet {
            PrescriptionSet(measure: m, target: nil, modality: modalidad,
                            restS: nil, tempo: nil, note: nota)
        }
        let p = Prescription(
            scheme: .forTime, modality: nil,
            sets: [
                set(.distance(meters: 1_000), .run, "Run"),
                set(.distance(meters: 500), .ski, "SkiErg"),
                set(.distance(meters: 1_000), .run, "Run"),
                set(.reps(40), .functional, "Burpee"),
                set(.distance(meters: 1_000), .run, "Run"),
                set(.distance(meters: 500), .row, "Row"),
                set(.distance(meters: 1_000), .run, "Run"),
                set(.reps(25), .functional, "Wall Balls"),
            ],
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "HYROX sim", kind: .reps,
                                 blockTitle: "HYROX sim", blockPosition: 1, prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "HYROX sim", format: .forTime,
                               estimatedDurationSeconds: 3600, blockContext: "HYROX sim",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()   // salta el 3-2-1 → estación 0 (Run)
        return s
    }

    // MARK: - 1. El segmento plegado no dice la verdad; la ventana sí

    func testLasCuatroEstacionesDeCorrerSonCorrerAunqueElSegmentoSeaMixto() {
        let s = bloqueDeManana()
        // El segmento entero se pliega a `.reps` — NUNCA `.running` — y eso no
        // cambia al cruzar estaciones: es exactamente la guarda vieja de
        // `isRunSegment`, que daba `false` en las cuatro estaciones de correr.
        let esCorrer: [Bool] = [true, false, true, false, true, false, true, false]
        for (i, corre) in esCorrer.enumerated() {
            XCTAssertEqual(s.currentSegment?.kind, .reps,
                           "estación \(i): el segmento plegado sigue siendo mixto")
            XCTAssertEqual(s.tramoIsRun, corre,
                           "estación \(i): la VENTANA activa decide, no el segmento plegado")
            if i < esCorrer.count - 1 { s.markRoundDone() }
        }
    }

    // MARK: - 2. Los metros de la tercera carrera no arrastran las dos anteriores

    func testElTercerTramoDeCorrerEmpiezaEnCeroNoArrastraLosAnteriores() {
        let s = bloqueDeManana()

        // Se queda 1 m CORTO en cada carrera a propósito: así este test sigue
        // midiendo sólo el anclaje. Llegar a los 1.000 cierra la estación sola
        // (ver el test del cierre automático más abajo), y entonces el avance
        // manual de aquí saltaría una estación de más.
        // Estación 0 — primera carrera del bloque.
        XCTAssertTrue(s.tramoIsRun)
        s.sampleRunDistance(deltaMeters: 999, source: .healthkit)
        XCTAssertEqual(s.tramoRunCoveredMeters ?? -1, 999, accuracy: 0.5)

        s.markRoundDone()   // → estación 1: SkiErg (no es correr)
        XCTAssertFalse(s.tramoIsRun)
        XCTAssertNil(s.tramoRunCoveredMeters, "fuera de una ventana de correr no hay metros de correr")

        s.markRoundDone()   // → estación 2: segunda carrera
        XCTAssertTrue(s.tramoIsRun)
        XCTAssertEqual(s.tramoRunCoveredMeters ?? -1, 0, accuracy: 0.5,
                       "empieza en cero, no en los 999 que ya llevaba la primera")
        s.sampleRunDistance(deltaMeters: 999, source: .healthkit)
        XCTAssertEqual(s.tramoRunCoveredMeters ?? -1, 999, accuracy: 0.5)

        s.markRoundDone()   // → estación 3: Burpees
        s.markRoundDone()   // → estación 4: TERCERA carrera — el caso del informe
        XCTAssertTrue(s.tramoIsRun)
        XCTAssertEqual(s.tramoRunCoveredMeters ?? -1, 0, accuracy: 0.5,
                       "el bug: sin `tramoGpsStartDistance` esto leía 2.000-y-pico, el "
                       + "acumulado GPS de las dos carreras anteriores del mismo segmento")
        s.sampleRunDistance(deltaMeters: 999, source: .healthkit)
        XCTAssertEqual(s.tramoRunCoveredMeters ?? -1, 999, accuracy: 0.5)
    }

    // MARK: - 3. La estación de correr se cierra sola al llegar a sus metros

    // El desajuste que esto arregla: el ski y el remo se cerraban solos al llegar a
    // su dosis y la cinta obligaba a pulsar los cuatro kilómetros a mano. La misma
    // pregunta —¿ha llegado esta estación a su dosis?— con dos respuestas según el
    // aparato.
    func testLaEstacionDeCorrerSeCierraSolaAlLlegarASusMetros() {
        let s = bloqueDeManana()
        XCTAssertTrue(s.tramoIsRun, "estación 0: Run 1.000")

        // Un metro corto: NO se cierra. La dosis es llegar, no acercarse.
        s.sampleRunDistance(deltaMeters: 999, source: .healthkit)
        XCTAssertTrue(s.tramoIsRun, "a 999 m la estación sigue abierta")

        // Y al cruzar los 1.000 se cierra sola: la siguiente estación es el SkiErg.
        s.sampleRunDistance(deltaMeters: 1, source: .healthkit)
        XCTAssertFalse(s.tramoIsRun, "al llegar a los 1.000 m la estación se cierra sola")
        XCTAssertEqual(s.currentTramo.modality, .ski, "la que entra es el SkiErg de 500 m")
    }

    // Cerrar es haber CRUZADO el objetivo, no estar por encima: una muestra más
    // dentro de la estación siguiente no puede volver a dispararlo.
    func testElCierreAutomaticoNoSeDisparaDosVeces() {
        let s = bloqueDeManana()
        s.sampleRunDistance(deltaMeters: 1_000, source: .healthkit)
        XCTAssertEqual(s.currentTramo.modality, .ski)
        // Metros de correr llegando fuera de una ventana de correr: se ignoran, y
        // desde luego no avanzan otra estación.
        s.sampleRunDistance(deltaMeters: 500, source: .healthkit)
        XCTAssertEqual(s.currentTramo.modality, .ski, "sigue en el ski; no ha saltado nada")
    }

    // La cinta cierra igual que la muñeca: es la MISMA ley, no dos. Aquí los metros
    // entran por la cinta FTMS en vez de por Apple.
    func testLaCintaTambienCierraLaEstacionAlLlegar() {
        let s = bloqueDeManana()
        s.runEnvironment = .treadmill
        XCTAssertTrue(s.tramoIsRun)
        s.sampleTreadmillDistance(deltaMeters: 999)
        XCTAssertTrue(s.tramoIsRun, "a 999 m sigue abierta")
        s.sampleTreadmillDistance(deltaMeters: 2)
        XCTAssertFalse(s.tramoIsRun, "la cinta cierra la estación igual que el remo")
    }

    // Y el segundo kilómetro se cierra por SUS propios metros, no por los del
    // primero: sin el reanclaje por estación, la segunda carrera nacería ya cruzada.
    func testElSegundoKilometroSeCierraPorSusPropiosMetros() {
        let s = bloqueDeManana()
        s.sampleRunDistance(deltaMeters: 1_000, source: .healthkit)   // cierra la 1ª
        s.markRoundDone()                                             // ski → burpees… no: → estación 2
        XCTAssertTrue(s.tramoIsRun, "estación 2: segunda carrera")
        s.sampleRunDistance(deltaMeters: 999, source: .healthkit)
        XCTAssertTrue(s.tramoIsRun, "999 propios: sigue abierta, no hereda los 1.000 de la primera")
        s.sampleRunDistance(deltaMeters: 1, source: .healthkit)
        XCTAssertFalse(s.tramoIsRun, "y se cierra al completar SUS 1.000")
    }
}
