import HealthKit
import WorkoutKit
import XCTest
@testable import FAHYBRIK

// The WorkoutKit encoder (#48) — a coach-prescribed structured run turned into the
// workout that shows up in the Apple Watch's native Entrenamiento app.
//
// What these tests actually protect is the HONESTY of that translation, because a
// wrong number here does not crash: it silently makes the watch buzz at the athlete
// for the wrong reason, and poisons the analytics with work that was never
// prescribed. Three things are load-bearing:
//   · the pace→speed INVERSION (faster pace = fewer s/km = MORE m/s),
//   · zones leaving as ABSOLUTE bands, never as a zone number the watch reinterprets,
//   · anything the watch cannot measure (RPE, an unresolvable zone) leaving as an
//     OPEN step with the prescription in its name — never as an invented target.
final class AppleWorkoutMapperTests: XCTestCase {

    // MARK: - Helpers

    private func segment(
        kind: RunSegment.Kind = .work,
        measure: RunSegmentMeasure = .distance(m: 400),
        target: RunSegmentTarget? = nil,
        resolved: ResolvedIntensity? = nil,
        inclinePct: Double? = nil,
        cadenceSpm: Int? = nil,
        recoveryMode: RunRecoveryMode? = nil
    ) -> RunSegment {
        RunSegment(
            kind: kind,
            measure: measure,
            target: target,
            resolved: resolved,
            inclinePct: inclinePct,
            cadenceSpm: cadenceSpm,
            recoveryMode: recoveryMode
        )
    }

    private func leg(_ segment: RunSegment, role: RunPhaseRole = .main) -> RunLeg {
        RunLeg(segment, phaseRole: role)
    }

    /// A zone profile exactly as the SERVER sends it: absolute bands off a threshold
    /// of 170 ppm (0.82/0.88/0.89/0.94/0.95/1.02 · LTHR, the %LTHR model).
    private static func profile(estimated: Bool) -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170,
            estimated: estimated,
            source: estimated ? "from_age" : "lthr_measured",
            sourceLabel: estimated ? "Estimado por tu edad" : "Medido en tu test de umbral",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    private let measuredMax = profile(estimated: false)
    private let estimatedMax = profile(estimated: true)

    // MARK: - Pace → speed (the inversion trap)

    func testFasterPaceBecomesTheUPPERSpeedBound() {
        // 4:00/km (240 s) is FASTER than 4:20/km (260 s), so it must land on the
        // range's high side. Inverting this would tell the watch to slow down when
        // the athlete is running well.
        let band = AppleWorkoutMapper.speedAlert(for: PaceTarget(single: nil, fastS: 240, slowS: 260))
        let alert = try? XCTUnwrap(band as? SpeedRangeAlert)
        let range = try? XCTUnwrap(alert?.target)

        let lower = range?.lowerBound.converted(to: .metersPerSecond).value ?? 0
        let upper = range?.upperBound.converted(to: .metersPerSecond).value ?? 0

        XCTAssertEqual(lower, 1000.0 / 260.0, accuracy: 0.0001, "slow pace → low speed")
        XCTAssertEqual(upper, 1000.0 / 240.0, accuracy: 0.0001, "fast pace → high speed")
        XCTAssertLessThan(lower, upper)
    }

    func testPaceToSpeedConversion() {
        XCTAssertEqual(AppleWorkoutMapper.metersPerSecond(fromPaceSecPerKm: 240), 1000.0 / 240.0, accuracy: 0.0001)
        // A non-positive pace is not a pace — it must not become an infinite speed.
        XCTAssertEqual(AppleWorkoutMapper.metersPerSecond(fromPaceSecPerKm: 0), 0)
    }

    // MARK: - Closing the band

    func testSinglePaceWidensByTheSameToleranceTheAppJudgesWith() {
        // The wrist must alert exactly when our own HUD would call the athlete out of
        // target — so the widening reuses PaceTarget.singleToleranceSecPerKm.
        let band = AppleWorkoutMapper.closedPaceBand(PaceTarget(single: 300, fastS: nil, slowS: nil))
        let tolerance = PaceTarget.singleToleranceSecPerKm
        XCTAssertEqual(band?.fast, 300 - tolerance)
        XCTAssertEqual(band?.slow, 300 + tolerance)
    }

    func testOneSidedBandIsNotClosedWithAnInventedBound() {
        // "no más lento de 5:00" has no second bound. We refuse to make one up: the
        // tramo goes OPEN and the prescription survives in the step name.
        XCTAssertNil(AppleWorkoutMapper.closedPaceBand(PaceTarget(single: nil, fastS: nil, slowS: 300)))
        XCTAssertNil(AppleWorkoutMapper.closedPaceBand(PaceTarget(single: nil, fastS: 240, slowS: nil)))
        XCTAssertNil(AppleWorkoutMapper.closedPaceBand(PaceTarget(single: nil, fastS: nil, slowS: nil)))
    }

    // MARK: - HR zones leave as absolute bpm, and only from a MEASURED threshold

    func testHeartRateZoneResolvesToTheServersAbsoluteBand() {
        // The band is the server's, verbatim — the app does not compute one. A watch
        // cannot reinterpret 162–173 ppm, unlike "Z4", whose meaning it would derive
        // from its own FCmáx estimate.
        let alert = AppleWorkoutMapper.heartRateAlert(for: .z4, hrMax: measuredMax) as? HeartRateRangeAlert
        let range = try? XCTUnwrap(alert?.target)
        XCTAssertEqual(range?.lowerBound.value ?? 0, 162, accuracy: 0.5)
        XCTAssertEqual(range?.upperBound.value ?? 0, 173, accuracy: 0.5)
    }

    func testEstimatedThresholdEmitsNoHeartRateBand() {
        // An inferred threshold is a number nobody measured. Shown in-app it carries
        // an "estimado" caveat; pushed to the wrist as a hard target it would not —
        // so it is not pushed at all.
        XCTAssertNil(AppleWorkoutMapper.heartRateAlert(for: .z4, hrMax: estimatedMax))
        XCTAssertNil(AppleWorkoutMapper.heartRateAlert(for: .z4, hrMax: nil))
    }

    func testTheAppNeverDerivesABandOfItsOwn() {
        // Z1 has no floor, so it cannot become a two-sided target — and crucially the
        // app has no formula to invent one with. A zone the server did not send is a
        // zone the watch does not get.
        XCTAssertNil(measuredMax.bpmBand(for: .z1), "Z1 is open at the bottom")
        let empty = HRZoneProfile(
            lthrBpm: 170, estimated: false, source: "lthr_measured", sourceLabel: "", zones: []
        )
        XCTAssertNil(empty.bpmBand(for: .z4), "no band → no fabricated band")
        XCTAssertNil(AppleWorkoutMapper.heartRateAlert(for: .z4, hrMax: empty))
    }

    func testLiveClassifierReadsTheServersBands() {
        // The same beat must land in the same zone here and on the server. These are
        // the bands for a 170 ppm threshold.
        XCTAssertEqual(measuredMax.zone(forBpm: 100), .z1)
        XCTAssertEqual(measuredMax.zone(forBpm: 145), .z2)
        XCTAssertEqual(measuredMax.zone(forBpm: 155), .z3)
        XCTAssertEqual(measuredMax.zone(forBpm: 170), .z4)
        XCTAssertEqual(measuredMax.zone(forBpm: 180), .z5)
        XCTAssertEqual(measuredMax.zone(forBpm: 210), .z5, "above the cap is still Z5")
        XCTAssertNil(measuredMax.zone(forBpm: 0), "a nonsense reading gets no zone")
    }

    // MARK: - RPE is never fabricated into a goal

    func testRPEGoesToTheNameAndLeavesTheStepOpen() {
        let step = AppleWorkoutMapper.step(
            for: leg(segment(measure: .duration(s: 600), target: .rpe(value: nil, min: 7, max: 8))),
            hrMax: measuredMax
        )
        XCTAssertNil(step.alert, "no watch measures perception — nothing to alert on")
        XCTAssertEqual(step.goal, .time(600, .seconds), "the DURATION is still measurable")
        XCTAssertEqual(step.displayName?.contains("RPE"), true)
    }

    func testUnresolvedZoneKeepsItsLabelInsteadOfBecomingAFakeBand() {
        // A pace zone the backend could not resolve (athlete never tested that
        // modality) has no absolute band. The step goes open and says "Z4".
        let step = AppleWorkoutMapper.step(for: leg(segment(target: .paceZone(4))), hrMax: measuredMax)
        XCTAssertNil(step.alert)
        XCTAssertEqual(step.displayName?.contains("Z4"), true)
    }

    // MARK: - Measure → goal

    func testDistanceAndDurationBecomeTheirGoals() {
        XCTAssertEqual(
            AppleWorkoutMapper.step(for: leg(segment(measure: .distance(m: 800))), hrMax: nil).goal,
            .distance(800, .meters)
        )
        XCTAssertEqual(
            AppleWorkoutMapper.step(for: leg(segment(measure: .duration(s: 90))), hrMax: nil).goal,
            .time(90, .seconds)
        )
        // An unknown / zero measure is an OPEN tramo the athlete closes by hand —
        // never a fabricated distance.
        XCTAssertEqual(AppleWorkoutMapper.step(for: leg(segment(measure: .unknown)), hrMax: nil).goal, .open)
        XCTAssertEqual(AppleWorkoutMapper.step(for: leg(segment(measure: .distance(m: 0))), hrMax: nil).goal, .open)
    }

    // MARK: - One alert per step: cadence never displaces the objetivo

    func testCadenceYieldsToPaceAndTravelsInTheName() {
        let resolved = ResolvedIntensity(zoneLabel: "Z3", rangeLabel: "4:00–4:20/km",
                                         fastS: 240, slowS: 260, paceUnit: "per_km", needsReview: false)
        let step = AppleWorkoutMapper.step(
            for: leg(segment(target: .paceZone(3), resolved: resolved, cadenceSpm: 180)),
            hrMax: measuredMax
        )
        XCTAssertTrue(step.alert is SpeedRangeAlert, "the objetivo keeps the single alert")
        XCTAssertEqual(step.displayName?.contains("180 spm"), true, "cadence is not lost, it is written down")
    }

    func testCadenceTakesTheAlertWhenNothingElseClaimsIt() {
        let step = AppleWorkoutMapper.step(for: leg(segment(cadenceSpm: 180)), hrMax: measuredMax)
        let alert = step.alert as? CadenceRangeAlert
        let range = try? XCTUnwrap(alert?.target)
        let tolerance = Double(AppleWorkoutMapper.cadenceToleranceSpm)
        XCTAssertEqual(range?.lowerBound.value ?? 0, 180 - tolerance, accuracy: 0.5)
        XCTAssertEqual(range?.upperBound.value ?? 0, 180 + tolerance, accuracy: 0.5)
    }

    // MARK: - Step names

    func testRecoveryStepNamesItsModeAndInclineTravelsAsText() {
        let step = AppleWorkoutMapper.step(
            for: leg(segment(kind: .recovery, measure: .duration(s: 120), recoveryMode: .caminar)),
            hrMax: nil
        )
        XCTAssertEqual(step.displayName?.contains("caminando"), true)

        // WorkoutKit has no incline target; the prescription survives as text.
        let incline = AppleWorkoutMapper.step(for: leg(segment(inclinePct: 6)), hrMax: nil)
        XCTAssertEqual(incline.displayName?.contains("6%"), true)
    }

    func testNameIsClampedWithoutCuttingAWordInHalf() {
        let long = "Serie larguísima de referencia con muchísimas palabras encadenadas"
        let clamped = AppleWorkoutMapper.clampName(long)
        XCTAssertLessThanOrEqual(clamped.count, AppleWorkoutMapper.stepNameMaxLength)
        XCTAssertFalse(clamped.hasSuffix(" "))
        XCTAssertTrue(long.hasPrefix(clamped), "clamping only trims, never rewrites")
    }

    // MARK: - Structure → CustomWorkout shape

    func testRepeatBecomesAnIntervalBlockWithIterations() {
        // 5 × (400 m + 200 m rec) must stay a repeat of TWO steps, not ten flat steps:
        // that is what makes the wrist count rounds.
        let structure: RunStructure = [
            RunPhase(role: .warmup, elements: [.segment(segment(measure: .duration(s: 600)))]),
            RunPhase(role: .main, elements: [
                .repeatBlock(times: 5, elements: [
                    .segment(segment(measure: .distance(m: 400))),
                    .segment(segment(kind: .recovery, measure: .distance(m: 200), recoveryMode: .trote))
                ])
            ]),
            RunPhase(role: .cooldown, elements: [.segment(segment(measure: .duration(s: 300)))])
        ]

        let workout = AppleWorkoutMapper.customWorkout(structure: structure, name: "Series 5×400", hrMax: nil)
        let custom = try? XCTUnwrap(workout)

        XCTAssertNotNil(custom?.warmup)
        XCTAssertNotNil(custom?.cooldown)
        XCTAssertEqual(custom?.blocks.count, 1)
        XCTAssertEqual(custom?.blocks.first?.iterations, 5)
        XCTAssertEqual(custom?.blocks.first?.steps.count, 2)
        XCTAssertEqual(custom?.blocks.first?.steps.first?.purpose, .work)
        XCTAssertEqual(custom?.blocks.first?.steps.last?.purpose, .recovery)
        XCTAssertEqual(custom?.displayName, "Series 5×400")
    }

    func testExtraWarmupTramosAreKeptAsABlockInsteadOfBeingDropped() {
        // `CustomWorkout.warmup` holds ONE step, but a coach's warm-up can have
        // several tramos. The rest must survive as a block — losing one would mean
        // the athlete does less work than prescribed.
        let structure: RunStructure = [
            RunPhase(role: .warmup, elements: [
                .segment(segment(measure: .duration(s: 600))),
                .segment(segment(measure: .distance(m: 100))),
                .segment(segment(measure: .distance(m: 100)))
            ]),
            RunPhase(role: .main, elements: [.segment(segment(measure: .distance(m: 5000)))])
        ]

        let custom = try? XCTUnwrap(AppleWorkoutMapper.customWorkout(structure: structure, name: "Rodaje", hrMax: nil))
        XCTAssertNotNil(custom?.warmup)
        // block 0 = the two leftover warm-up tramos, block 1 = the main run.
        XCTAssertEqual(custom?.blocks.first?.steps.count, 2)
        let total = (custom?.blocks.reduce(0) { $0 + $1.steps.count * $1.iterations } ?? 0) + 1
        XCTAssertEqual(total, 4, "every prescribed tramo survives the trip")
    }

    func testEmptyStructureProducesNoWorkout() {
        XCTAssertNil(AppleWorkoutMapper.customWorkout(structure: [], name: "Vacío", hrMax: nil))
    }

    // MARK: - Deterministic, recognisable plan identity (reconciliation depends on it)

    func testPlanIDIsStableForTheSameAssignment() {
        // A re-sync must recognise what it already scheduled instead of duplicating.
        XCTAssertEqual(
            FahybrikWorkoutPlanID.planID(forAssignmentId: "12345"),
            FahybrikWorkoutPlanID.planID(forAssignmentId: "12345")
        )
        XCTAssertNotEqual(
            FahybrikWorkoutPlanID.planID(forAssignmentId: "12345"),
            FahybrikWorkoutPlanID.planID(forAssignmentId: "12346")
        )
    }

    func testOnlyOurPlansAreRecognisedAsOurs() {
        // This is what stops us from removing a workout another app scheduled.
        XCTAssertTrue(FahybrikWorkoutPlanID.isOurs(FahybrikWorkoutPlanID.planID(forAssignmentId: "1")))
        XCTAssertFalse(FahybrikWorkoutPlanID.isOurs(UUID()))
    }

    // MARK: - Date helpers (the schedule key)

    func testIsoDateHelpers() {
        XCTAssertEqual(AppleWatchWorkoutScheduler.dateComponents(fromIso: "2026-07-25")?.day, 25)
        XCTAssertNil(AppleWatchWorkoutScheduler.dateComponents(fromIso: "no-es-fecha"))
        XCTAssertEqual(AppleWatchWorkoutScheduler.isoDate("2026-07-25", plusDays: 7), "2026-08-01")
        // Month and year rollovers — the horizon must not silently truncate.
        XCTAssertEqual(AppleWatchWorkoutScheduler.isoDate("2026-12-28", plusDays: 7), "2027-01-04")
    }

    // MARK: - Elegibilidad: qué sesión llega a la muñeca y cuál se queda en la app

    /// Construye un detalle desde JSON, el MISMO camino que usa la app de verdad
    /// (`convertFromSnakeCase`), en vez de instanciar los modelos a mano: así el
    /// test también protege el decodificado, no solo la lógica.
    private func detail(items: [(category: String, withStructure: Bool)]) -> AssignmentDetail {
        let runStructure = """
        [{"role":"main","elements":[{"kind":"work","measure":{"type":"distance","m":400},"target":null}]}]
        """
        let itemsJson = items.enumerated().map { idx, it in
            let prescription = it.withStructure
                ? "{\"scheme\":\"intervals\",\"modality\":\"run\",\"structure\":\(runStructure)}"
                : "null"
            return """
            {"uid":"i\(idx)","template_segment_id":null,"exercise_id":"1","exercise_name":"X",
             "exercise_slug":"x","exercise_category":"\(it.category)","exercise_video_url":null,
             "cues":null,"exercise_description":null,"params_json":{},
             "prescription_json":\(prescription),"resolved_intensity":null,"notes":null}
            """
        }.joined(separator: ",")

        let json = """
        {"assignment":{"id":"1","athlete_id":"70","scheduled_for":"2026-07-26","status":"scheduled",
          "slot":null,"template_id":null,"template_version":null,"completed_at":null,
          "perceived_exertion":null},
         "workout":{"name":"Series 1 km","focus":null,"coach_note":null,
          "estimated_duration_minutes":null,
          "blocks":[{"uid":"b0","title":"Series","format":"intervals","block_position":0,"coach_note":null,
                     "config_json":{},"items":[\(itemsJson)]}]}}
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        return try! decoder.decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    func testElJsonDePruebaDecodificaLaEstructura() {
        // Guarda-raíl del propio andamiaje: si el JSON de arriba dejara de decodificar
        // la estructura, TODOS los tests de elegibilidad pasarían a fallar por el
        // motivo equivocado (noRunStructure) y parecería un bug del filtro.
        let d = detail(items: [(category: "running", withStructure: true)])
        let item = d.workout!.blocks.flatMap(\.items).first!
        XCTAssertNotNil(item.prescription, "la prescripción no decodifica")
        XCTAssertNotNil(item.prescription?.structure, "la estructura no decodifica")
        XCTAssertFalse(item.prescription?.structure?.expandedLegs().isEmpty ?? true)
    }

    func testUnaCarreraConCalentamientoYVueltaSIViajaAlReloj() {
        // El caso REAL: medido contra la biblioteca, las sesiones de carrera del
        // coach asignadas a un atleta con un solo ejercicio son CERO. Todas llevan
        // su movilidad al lado. Exigir un único item dejaba esto en cero sesiones.
        let d = detail(items: [
            (category: "running", withStructure: true),
            (category: "mobility", withStructure: false),
        ])
        guard case .eligible = AppleWorkoutMapper.eligibility(of: d) else {
            return XCTFail("una carrera con movilidad al lado debe llegar al reloj")
        }
    }

    func testUnTroteDeCalentamientoSinEstructuraNoLaDescalifica() {
        let d = detail(items: [
            (category: "running", withStructure: false),  // trote suave, forma plana
            (category: "running", withStructure: true),   // las series
            (category: "mobility", withStructure: false),
        ])
        guard case .eligible = AppleWorkoutMapper.eligibility(of: d) else {
            return XCTFail("otra línea de carrera sin estructura no es trabajo ajeno")
        }
    }

    func testUnaSimulacionConEstacionesNOViajaAlReloj() {
        // Aquí correr es un tramo dentro de otra cosa. Mandarlo como "carrera"
        // le mentiría al atleta sobre lo que va a hacer.
        let d = detail(items: [
            (category: "running", withStructure: true),
            (category: "functional", withStructure: false),
        ])
        XCTAssertEqual(
            AppleWorkoutMapper.eligibility(of: d),
            .notEligible(.sessionHasNonRunWork)
        )
    }

    func testFuerzaJuntoALaCarreraTampocoViaja() {
        let d = detail(items: [
            (category: "running", withStructure: true),
            (category: "strength", withStructure: false),
        ])
        XCTAssertEqual(
            AppleWorkoutMapper.eligibility(of: d),
            .notEligible(.sessionHasNonRunWork)
        )
    }

    func testUnErgoJuntoALaCarreraTampocoViaja() {
        let d = detail(items: [
            (category: "running", withStructure: true),
            (category: "rowing", withStructure: false),
        ])
        XCTAssertEqual(
            AppleWorkoutMapper.eligibility(of: d),
            .notEligible(.sessionHasNonRunWork)
        )
    }
}
