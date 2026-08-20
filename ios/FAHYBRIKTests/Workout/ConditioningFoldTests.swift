import XCTest
@testable import FAHYBRIK

// `WorkoutBlock.conditioningFold` — the single fold that turns a multi-movement
// conditioning block's items into the ONE `Prescription` driving the live timer
// (WorkoutModels.swift, ~line 1680). Covers the CIRCUITO extension (2026-08-07
// DECISIONS, "«Circuito» pasa a ser un tipo de bloque real"):
//
//   · `pacing` GATES `workS` — "por_tarea" forces it nil (no clock cap exists),
//     "por_reloj" reads it from `work_seconds`. Absent `pacing` (every block
//     today) keeps the pre-existing legacy chain byte-for-byte.
//   · Two SEPARATE rest windows now travel through: `restS` (between stations,
//     its pre-existing meaning) and the new `restBetweenRoundsS` (after a full
//     round). `rest_seconds` (the EMOM/Tabata/intervals key) is untouched.
//   · The block-level HEADER `target` only survives when EVERY item genuinely
//     agrees — the "3:45/km huérfano" fix: a mixed circuit's Run station keeps
//     ITS pace, but that pace must not leak onto the whole block (read directly
//     by `RunTarget.resolve(from:)`, Devices/Treadmill/RunTargetResolver.swift,
//     with no per-station awareness).
final class ConditioningFoldTests: XCTestCase {

    // MARK: - Fixtures

    private let emptyParams = WorkoutItemParams(
        sets: nil, reps: nil, loadKg: nil, loadPct: nil, rpe: nil, restSeconds: nil,
        durationSeconds: nil, distanceKm: nil, distanceMeters: nil, paceSecPerKm: nil,
        cadenceSpm: nil, calories: nil, caloriesPerMin: nil, hrZone: nil, watts: nil
    )

    private func item(_ uid: String, name: String, category: String = "functional",
                      slug: String? = nil, prescription: Prescription? = nil) -> WorkoutItem {
        WorkoutItem(uid: uid, templateSegmentId: nil, exerciseId: uid, exerciseName: name,
                    exerciseSlug: slug ?? uid, exerciseCategory: category,
                    exerciseVideoUrl: nil, cues: nil, exerciseDescription: nil,
                    paramsJson: emptyParams, prescription: prescription,
                    resolvedIntensity: nil, resolvedLoad: nil, notes: nil)
    }

    private func block(items: [WorkoutItem], config: [String: JSONValue] = [:],
                       format: String = "circuit") -> WorkoutBlock {
        WorkoutBlock(uid: "b1", title: "Bloque", format: format, blockPosition: 1,
                    coachNote: nil, configJson: .object(config), items: items)
    }

    private func rx(workS: Int? = nil, restS: Int? = nil, target: Target? = nil) -> Prescription {
        Prescription(scheme: .rounds, modality: nil, sets: nil, rounds: nil, workS: workS,
                    restS: restS, totalS: nil, target: target, note: nil, start: nil, increment: nil)
    }

    private let pace345 = Target.pace(unit: .perKm, valueS: 225, minS: nil, maxS: nil) // 3:45/km
    private let paceOther = Target.pace(unit: .perKm, valueS: 300, minS: nil, maxS: nil) // 5:00/km

    // MARK: - El descanso del EJERCICIO sobrevive al plegado (card 110)

    /// El coach escribe «descanso 2:00» UNA vez en el movimiento, no repetido
    /// dentro de cada serie — así lo guarda el plan y así lo escribió para el
    /// simulacro del 21-ago. Al plegar, el descanso era el ÚNICO campo que no
    /// bajaba a mirar el nivel del ejercicio (la intensidad y la modalidad sí lo
    /// hacían), así que esas pausas desaparecían: ni cuenta atrás entre estaciones,
    /// ni aviso al acabarla.
    func testElDescansoDelEjercicioSobreviveAlPlegado() {
        let correr = item("run", name: "Run", category: "running", prescription: rx())
        let ski = item("ski", name: "SkiErg", category: "erg", prescription: rx(restS: 120))
        let b = block(items: [correr, ski], config: [
            "rounds": .number(4), "pacing": .string("por_tarea")
        ])
        let rotacion = b.conditioningFold?.sets
        XCTAssertEqual(rotacion?.count, 2)
        XCTAssertNil(rotacion?[0].restS, "correr no prescribe descanso: no se inventa uno")
        XCTAssertEqual(rotacion?[1].restS, 120,
                       "el ski prescribe 2:00 en el ejercicio y el plegado se los comía")
    }

    // MARK: - `pacing` gates `workS`

    func testPorTareaForcesWorkSNilEvenOverLegacyItemLeftover() {
        // A stray per-item `workS` (e.g. leftover from before the block was
        // authored as a circuit) must NOT resurrect a clock cap on a por_tarea
        // round — that is the exact "ventana trabajo" bug Alex reported.
        let sled = item("sled", name: "Sled Push", prescription: rx(workS: 40))
        let lunge = item("lunge", name: "Lunge")
        let b = block(items: [sled, lunge], config: [
            "rounds": .number(4), "pacing": .string("por_tarea")
        ])
        let folded = b.conditioningFold
        XCTAssertNotNil(folded)
        XCTAssertNil(folded?.workS, "por_tarea has no clock — workS must be nil, full stop")
        XCTAssertEqual(folded?.rounds, 4)
    }

    func testPorRelojReadsWorkSecondsFromConfig() {
        let clean = item("pc", name: "Power Clean")
        let box = item("bj", name: "Box Jump")
        let b = block(items: [clean, box], config: [
            "rounds": .number(5), "pacing": .string("por_reloj"), "work_seconds": .number(120)
        ])
        let folded = b.conditioningFold
        XCTAssertEqual(folded?.workS, 120)
        XCTAssertEqual(folded?.rounds, 5)
    }

    func testNoPacingKeepsLegacyItemWorkSFallback() {
        // config_json carries no `pacing` at all — the overwhelming majority of
        // blocks today, and every non-circuit format forever. Behavior must be
        // BYTE IDENTICAL to before this change: the item's own workS still wins.
        let a = item("a", name: "A", prescription: rx(workS: 45))
        let bItem = item("b", name: "B")
        let blk = block(items: [a, bItem], config: [:])
        XCTAssertEqual(blk.conditioningFold?.workS, 45)
    }

    func testNoPacingKeepsLegacyConfigWorkSecondsFallback() {
        // No item carries a workS, config has the legacy `work_seconds` key with
        // no `pacing` alongside it (e.g. an old AMRAP-shaped block) — still read,
        // exactly as before.
        let a = item("a", name: "A")
        let bItem = item("b", name: "B")
        let blk = block(items: [a, bItem], config: ["work_seconds": .number(30)])
        XCTAssertEqual(blk.conditioningFold?.workS, 30)
    }

    // MARK: - Two separate rest windows

    func testCircuitCarriesBothRestWindowsSeparately() {
        let a = item("a", name: "A")
        let bItem = item("b", name: "B")
        let blk = block(items: [a, bItem], config: [
            "rounds": .number(4), "pacing": .string("por_tarea"),
            "rest_between_stations_seconds": .number(15),
            "rest_between_rounds_seconds": .number(90)
        ])
        let folded = blk.conditioningFold
        XCTAssertEqual(folded?.restS, 15, "restS keeps its existing meaning: between stations")
        XCTAssertEqual(folded?.restBetweenRoundsS, 90, "the NEW field: after a full round")
    }

    func testRestFallsBackToLegacyRestSecondsWhenNoCircuitKeys() {
        // A Tabata/intervals-shaped block (its existing consumer) — no circuit
        // rest keys, only the legacy singular `rest_seconds`. Untouched.
        let a = item("a", name: "A")
        let bItem = item("b", name: "B")
        let blk = block(items: [a, bItem], config: ["rest_seconds": .number(20)], format: "tabata")
        let folded = blk.conditioningFold
        XCTAssertEqual(folded?.restS, 20)
        XCTAssertNil(folded?.restBetweenRoundsS)
    }

    func testItemLevelRestStillWinsOverConfigKeys() {
        // Legacy precedence preserved: an authored per-item rest still beats
        // whatever config_json says (unchanged ordering, itemFirst first).
        let a = item("a", name: "A", prescription: rx(restS: 10))
        let bItem = item("b", name: "B")
        let blk = block(items: [a, bItem], config: ["rest_between_stations_seconds": .number(15)])
        XCTAssertEqual(blk.conditioningFold?.restS, 10)
    }

    // MARK: - The orphaned header target ("3:45/km huérfano")

    func testUniformTargetSurvivesWhenEveryItemAgrees() {
        // A legitimately uniform block ("5×400m @ threshold") — every item
        // shares the identical target, so the block-level header IS honest.
        let a = item("a", name: "400m #1", prescription: rx(target: pace345))
        let bItem = item("b", name: "400m #2", prescription: rx(target: pace345))
        let blk = block(items: [a, bItem], config: [:], format: "intervals")
        XCTAssertEqual(blk.conditioningFold?.target, pace345)
    }

    func testOrphanedTargetDroppedWhenOneItemHasNoneOfItsOwn() {
        // The exact reported shape: item 0 (a Run station) carries its own real
        // pace; item 1 (Wallballs) carries none. The block header must NOT
        // borrow item 0's pace — `RunTarget.resolve` would show it as the
        // CURRENT target while the athlete is on Wallballs.
        let run = item("run", name: "Run 400m", category: "running", prescription: rx(target: pace345))
        let wallballs = item("wb", name: "Wallballs")
        let blk = block(items: [run, wallballs])
        XCTAssertNil(blk.conditioningFold?.target)
    }

    func testOrphanedTargetDroppedWhenItemsDisagree() {
        let run1 = item("r1", name: "Run 400m", category: "running", prescription: rx(target: pace345))
        let run2 = item("r2", name: "Run 800m", category: "running", prescription: rx(target: paceOther))
        let blk = block(items: [run1, run2], format: "intervals")
        XCTAssertNil(blk.conditioningFold?.target)
    }

    // MARK: - Regression: empty config_json (today's default) is untouched

    func testEmptyConfigJsonMatchesLegacyBehaviorAcrossTheBoard() {
        let sled = item("sled", name: "Sled Push", prescription: rx(workS: 40, restS: 12))
        let lunge = item("lunge", name: "Lunge")
        // No `configJson` at all (nil, not even `{}`) — the pre-circuit wire shape.
        let blk = WorkoutBlock(uid: "b2", title: "Bloque", format: "circuit", blockPosition: 1,
                                coachNote: nil, configJson: nil, items: [sled, lunge])
        let folded = blk.conditioningFold
        XCTAssertEqual(folded?.workS, 40, "no pacing key at all → legacy itemFirst chain")
        XCTAssertEqual(folded?.restS, 12)
        XCTAssertNil(folded?.restBetweenRoundsS)
        XCTAssertNil(folded?.rounds)
    }
}
