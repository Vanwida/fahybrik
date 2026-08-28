import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL FARTLEK QUE NO SE PODÍA EMPEZAR (10-ago-2026) — con el payload REAL.
//
// El coach dictó por el conector MCP «16 series: 500 m fuerte en Z4 + 1 min suave en
// Z2», y quedó guardado como una prescripción de esquema `intervals` con UN set (500 m,
// rest 60), `rounds: 16` y —la verdad— una `structure` con un Repetir ×16 de
// trabajo(500 m, Z4) + recuperación(60 s, Z2, trote). En el móvil, la ficha se veía
// bien y al tocar EMPEZAR la pantalla salía EN BLANCO: sólo una franja de «LO QUE
// VIENE», sin título y sin el botón de EMPEZAR.
//
// LA RAÍZ, y por eso este test mide DOS cosas distintas:
//
//  1. QUIÉN CONDUCE. El motor da precedencia a la estructura (`onEnterSegment`), pero
//     la propiedad que leen las PANTALLAS —`isConditioningTimer`— sólo excluía el EMOM,
//     así que la carrera estructurada seguía diciendo «yo llevo reloj de
//     acondicionamiento» y `ActiveWorkoutView` le montaba debajo un `ForTimeLiveHUD`
//     con sus 16 rondas sin recortar. Ese HUD medía ~3 pantallas de alto, el `ZStack`
//     del entreno activo crecía con él, y la puerta del bloque —hermana suya en ese
//     mismo `ZStack`— quedaba centrada en un alto imposible: el título por encima del
//     borde y el EMPEZAR por debajo. De ahí «no deja empezar».
//     → Se fija midiendo que la pantalla entera CABE en el móvil.
//
//  2. QUÉ SE LEE. El aplanado dice «500 m · Z4 · descanso 1:00»: pierde el ×16 y llama
//     «descanso» a un minuto que se corre al trote en Z2. Un atleta que lee «descanso»
//     se queda parado.
//     → Se fija sobre la línea de dosis, que sale de UN formateador para toda la app.
final class CarreraEstructuradaFartlekTests: XCTestCase {

    /// El canvas del iPhone 17 Pro (puntos lógicos), que es el móvil de desarrollo.
    private static let lienzo = CGSize(width: 402, height: 874)

    /// `GET /api/athlete/assignments/411/detail` tal y como lo sirve
    /// `loadAssignmentDetail` para el atleta 64 (plantilla 609, 11-ago-2026): el
    /// `prescription_json` es la fila real de `template_segments` y los escalares son
    /// los que deriva `prescriptionToParams` (un solo set → `sets: 1`, y el ×16 vive
    /// SÓLO en `rounds` y en la estructura, que es la mitad del fallo de lectura).
    private static let payload = """
    {
      "assignment": {
        "id": "411", "athlete_id": "64", "scheduled_for": "2026-08-11",
        "status": "scheduled", "slot": null, "template_id": "609",
        "template_version": 1, "completed_at": null, "perceived_exertion": null,
        "station_assignment": null, "my_role": null, "store_results": []
      },
      "workout": {
        "name": "Fartlek 16 x 500m Z4", "focus": null, "coach_note": null,
        "estimated_duration_minutes": null,
        "blocks": [
          {
            "uid": "block-0", "title": "Fartlek 16 x 500m Z4", "format": "intervals",
            "block_position": 0, "coach_note": null, "config_json": {},
            "items": [
              {
                "uid": "segment-3147", "template_segment_id": 3147,
                "exercise_id": "3479", "exercise_name": "Run", "exercise_slug": "run",
                "exercise_category": "running", "exercise_video_url": null,
                "cues": null, "exercise_description": null,
                "params_json": {
                  "sets": 1, "rest_seconds": 60,
                  "distance_meters": 500, "distance_km": 0.5, "hr_zone": 4
                },
                "prescription_json": {
                  "sets": [{"rest_s": 60, "measure": {"kind": "distance", "meters": 500}}],
                  "rest_s": 60, "rounds": 16, "scheme": "intervals",
                  "target": {"kind": "hr_zone", "value": 4}, "modality": "run",
                  "structure": [
                    {
                      "role": "main",
                      "elements": [
                        {
                          "times": 16,
                          "elements": [
                            {"kind": "work", "target": {"type": "hr_zone", "zone": 4},
                             "measure": {"m": 500, "type": "distance"}},
                            {"kind": "recovery", "target": {"type": "hr_zone", "zone": 2},
                             "measure": {"s": 60, "type": "duration"},
                             "recovery_mode": "trote"}
                          ]
                        }
                      ]
                    }
                  ]
                },
                "resolved_intensity": null, "resolved_load": null,
                "notes": "16 series: 500m fuerte en Z4 (ON) + 1 min suave en Z2 (OFF) entre cada una."
              }
            ]
          }
        ]
      },
      "execution": null
    }
    """

    private func planReal() throws -> WorkoutPlan {
        let detalle = try APIClient.makeJSONDecoder()
            .decode(AssignmentDetail.self, from: Data(Self.payload.utf8))
        return try XCTUnwrap(WorkoutPlan.from(detail: detalle),
                             "el payload real tiene que dar un entreno ejecutable")
    }

    // MARK: - El guion: 32 tramos, y cada uno con SU medida y SU objetivo

    func testElGuionTiene32TramosConSuMedidaYSuObjetivo() throws {
        let plan = try planReal()
        XCTAssertEqual(plan.segments.count, 1, "un bloque de un solo ejercicio es UN tramo")
        let seg = plan.segments[0]
        XCTAssertEqual(seg.kind, .running)

        let legs = try XCTUnwrap(seg.runStructureLegs, "la estructura tiene que llegar al motor")
        XCTAssertEqual(legs.count, 32, "16 de trabajo + 16 de recuperación")
        XCTAssertEqual(legs.filter(\.isWork).count, 16)
        XCTAssertEqual(legs.filter(\.isRecovery).count, 16)

        let trabajo = legs[0]
        XCTAssertEqual(trabajo.measure, .distance(m: 500))
        XCTAssertEqual(trabajo.target, .hrZone(4))
        XCTAssertEqual(trabajo.phaseRole, .main)

        let off = legs[1]
        XCTAssertEqual(off.measure, .duration(s: 60))
        XCTAssertEqual(off.target, .hrZone(2))
        XCTAssertEqual(off.recoveryMode, .trote)
        XCTAssertTrue(off.recuperaEnMovimiento, "el OFF de un fartlek se corre, no se para")
    }

    // MARK: - Quién conduce el tramo (la raíz del blanco)

    func testLaCarreraEstructuradaNoEsUnRelojDeAcondicionamiento() throws {
        let seg = try planReal().segments[0]
        XCTAssertTrue(seg.hasRunStructure)
        XCTAssertFalse(
            seg.isConditioningTimer,
            "la estructura manda sobre el rotativo en el MOTOR; si las pantallas leen lo "
            + "contrario, a la carrera le montan encima el HUD de otro formato"
        )
        // Y el motor sigue arrancando el cursor de tramos, no el rotativo.
        let s = WorkoutSession(plan: try planReal(), hrZones: nil)
        s.start(); s.beginBlock()
        XCTAssertTrue(s.isRunStructureActive)
        XCTAssertEqual(s.runLegTotal, 32)
        XCTAssertFalse(s.isConditioningActive)
        s.stop()
    }

    /// EL BLANCO, MEDIDO: la pantalla del entreno activo, parada en la puerta del
    /// bloque, tiene que CABER en el móvil. Con el fallo pedía ~3 veces el alto de la
    /// pantalla (16 filas de ronda que nadie recortaba), el `ZStack` crecía con ella y
    /// la puerta quedaba centrada en ese alto: sin título arriba y sin EMPEZAR abajo.
    @MainActor
    func testLaPantallaDeEmpezarCabeEnElMovil() throws {
        let s = WorkoutSession(plan: try planReal(), hrZones: nil)
        s.start()
        s.runEnvironment = .outdoor          // ya contestó «¿dónde corres?» en la previa
        XCTAssertTrue(s.isAwaitingBlockStart, "el caso es la puerta del bloque, antes de EMPEZAR")

        let host = UIHostingController(rootView:
            ActiveWorkoutView(session: s, onFinish: {}, onExit: {})
                .environment(\.colorScheme, .dark)
        )
        host.view.frame = CGRect(origin: .zero, size: Self.lienzo)
        host.view.layoutIfNeeded()
        let alto = host.sizeThatFits(in: Self.lienzo).height
        XCTAssertLessThanOrEqual(
            alto, Self.lienzo.height + 1,
            "la pantalla pide \(Int(alto)) pt en un móvil de \(Int(Self.lienzo.height)): "
            + "lo que se salga por abajo es el botón de EMPEZAR"
        )
        s.stop()
    }

    // MARK: - Qué se lee (el OFF activo)

    func testLaDosisDiceLas16SeriesYElOffSeCorre() throws {
        let seg = try planReal().segments[0]
        XCTAssertEqual(
            seg.previewWorkLine,
            "16 × 500 m · Z4 · recuperación 1:00 suave en Z2",
            "la estructura sabe las 16 series y sabe que el minuto se trota"
        )
    }

    func testUnDescansoDeVerdadSigueDiciendoseDescanso() throws {
        // `parado` y el modo que NO SE SABE (lo que trae una prescripción plana, donde
        // el número nació de un `rest_s`) conservan la palabra de siempre.
        for modo in [RunRecoveryMode.parado, nil] {
            let leg = RunLeg(kind: .recovery, measure: .duration(s: 90), target: nil,
                             resolved: nil, inclinePct: nil, cadenceSpm: nil,
                             recoveryMode: modo, phaseRole: .main)
            XCTAssertEqual(PrescriptionRenderer.fraseDeRecuperacion(leg), "descanso 1:30",
                           "modo \(String(describing: modo))")
        }
        let caminando = RunLeg(kind: .recovery, measure: .duration(s: 90), target: .hrZone(1),
                               resolved: nil, inclinePct: nil, cadenceSpm: nil,
                               recoveryMode: .caminar, phaseRole: .main)
        XCTAssertEqual(PrescriptionRenderer.fraseDeRecuperacion(caminando),
                       "recuperación 1:30 caminando en Z1")
    }

    /// Una PIRÁMIDE no se colapsa a su primer tramo, y una estructura sin recuperaciones
    /// no se queda sin el descanso que sí trae el plano.
    func testUnaPiramideDiceLaSecuenciaYRespetaElDescansoPlano() throws {
        func trabajo(_ m: Int) -> RunElement {
            .segment(RunSegment(kind: .work, measure: .distance(m: m), target: .paceZone(4),
                                resolved: nil, inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
        }
        let p = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 3,
                             workS: nil, restS: 120, totalS: nil, target: nil, note: nil,
                             start: nil, increment: nil,
                             structure: [RunPhase(role: .main,
                                                  elements: [trabajo(1200), trabajo(1000), trabajo(800)])])
        let linea = try XCTUnwrap(PrescriptionRenderer.structuredRunLine(p))
        XCTAssertEqual(linea.headline, "1200/1000/800 m")
        XCTAssertEqual(linea.zone, .z4)
        XCTAssertEqual(linea.detail, "descanso 2:00")
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertEqual(legs.count, 5, "3 work + 2 rest del plano")
        XCTAssertEqual(legs[1].durationSeconds, 120)
        XCTAssertTrue(legs[1].isRecovery)
        XCTAssertTrue(legs.last?.isWork == true)
    }

    /// Sin estructura, la línea es la de siempre — byte por byte.
    func testSinEstructuraElAplanadoNoSeToca() throws {
        let bout = PrescriptionSet(measure: .distance(meters: 1000), target: nil,
                                   modality: .run, restS: 120, tempo: nil, note: nil)
        let p = Prescription(scheme: .intervals, modality: .run, sets: [bout, bout, bout],
                             rounds: 3, workS: nil, restS: 120, totalS: nil,
                             target: .hrZone(value: 3, min: nil, max: nil), note: nil,
                             start: nil, increment: nil)
        XCTAssertNil(PrescriptionRenderer.structuredRunLine(p))
        let linea = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(linea.headline, "3 × 1 km")
        XCTAssertEqual(linea.zone, .z3)
        XCTAssertEqual(linea.detail, "descanso 2:00")
    }
}
