import XCTest
@testable import FAHYBRIK

// #63 — the PURE phrasing + priority-queue layer of live audio coaching. Asserts
// the exact es-ES strings the synthesizer speaks (no colons, natural numbers,
// every prescription objective covered) and the queue's priority / purge rules.
final class CoachSpeechTests: XCTestCase {

    // MARK: - clock (the single time voice: pace, splits, durations, total)

    func testClockSpellsTimesWithoutColons() {
        XCTAssertEqual(CoachSpeech.clock(265), "4 minutos 25 segundos")
        XCTAssertEqual(CoachSpeech.clock(240), "4 minutos")
        XCTAssertEqual(CoachSpeech.clock(15), "15 segundos")
        XCTAssertEqual(CoachSpeech.clock(60), "1 minuto")
        XCTAssertEqual(CoachSpeech.clock(0), "0 segundos")
        XCTAssertEqual(CoachSpeech.clock(3661), "1 hora 1 minuto 1 segundo")
        XCTAssertFalse(CoachSpeech.clock(265).contains(":"))   // never a clock-time colon
    }

    // MARK: - distance

    func testDistanceCollapsesWholeKilometres() {
        XCTAssertEqual(CoachSpeech.distance(800), "800 metros")
        XCTAssertEqual(CoachSpeech.distance(1000), "1 kilómetro")
        XCTAssertEqual(CoachSpeech.distance(2000), "2 kilómetros")
        XCTAssertEqual(CoachSpeech.distance(1200), "1200 metros")   // non-round stays in metres
    }

    // MARK: - objective phrase (every prescription target)

    func testObjectivePhraseCoversEveryTargetKind() {
        XCTAssertEqual(CoachSpeech.objectivePhrase(.pace(valueS: nil, minS: 265, maxS: 275)),
                       "ritmo entre 4 minutos 25 segundos y 4 minutos 35 segundos")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.pace(valueS: 270, minS: nil, maxS: nil)),
                       "ritmo 4 minutos 30 segundos")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.paceZone(2)), "en zona 2")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.hrZone(3)), "en zona 3")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.rpe(value: 8, min: nil, max: nil)), "esfuerzo 8")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.rpe(value: nil, min: 8, max: 9)), "esfuerzo entre 8 y 9")
        XCTAssertEqual(CoachSpeech.objectivePhrase(.rpe(value: 8.5, min: nil, max: nil)), "esfuerzo 8 y medio")
        XCTAssertNil(CoachSpeech.objectivePhrase(nil))            // done by feel
        XCTAssertNil(CoachSpeech.objectivePhrase(.unknown))
    }

    // MARK: - leg text (work bouts, every phase / measure / objective combo)

    func testWorkLegDistanceWithPaceBand() {
        let leg = CueLeg(number: 3, total: 14, isWork: true, phase: .main,
                         measure: .distance(m: 800),
                         target: .pace(valueS: nil, minS: 265, maxS: 275), recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg),
                       "Tramo 3 de 14. 800 metros, ritmo entre 4 minutos 25 segundos y 4 minutos 35 segundos.")
    }

    func testWarmupLegDurationWithZone() {
        let leg = CueLeg(number: 1, total: 14, isWork: true, phase: .warmup,
                         measure: .duration(s: 600), target: .hrZone(2), recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg), "Calentamiento. 10 minutos, en zona 2.")
    }

    func testCooldownLegNoObjective() {
        let leg = CueLeg(number: 14, total: 14, isWork: true, phase: .cooldown,
                         measure: .duration(s: 300), target: nil, recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg), "Vuelta a la calma. 5 minutos.")
    }

    func testWorkLegDistanceWithRpe() {
        let leg = CueLeg(number: 4, total: 21, isWork: true, phase: .main,
                         measure: .distance(m: 400), target: .rpe(value: 8, min: nil, max: nil),
                         recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg), "Tramo 4 de 21. 400 metros, esfuerzo 8.")
    }

    func testWorkLegNoMeasureFallsBackToObjectiveSentence() {
        // Heterogeneous-pyramid degrade: no scalar measure, but a pace objective.
        let leg = CueLeg(number: 3, total: 11, isWork: true, phase: .main,
                         measure: .unknown, target: .pace(valueS: 250, minS: nil, maxS: nil),
                         recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg), "Tramo 3 de 11. Ritmo 4 minutos 10 segundos.")
    }

    func testWorkLegNoMeasureNoObjectiveIsJustTheTramo() {
        let leg = CueLeg(number: 3, total: 14, isWork: true, phase: .main,
                         measure: .unknown, target: nil, recoveryMode: nil)
        XCTAssertEqual(CoachSpeech.legText(leg), "Tramo 3 de 14.")
    }

    // MARK: - recovery text (measure × mode)

    func testRecoveryTimedTrote() {
        let leg = CueLeg(number: 4, total: 14, isWork: false, phase: .main,
                         measure: .duration(s: 120), target: nil, recoveryMode: .trote)
        XCTAssertEqual(CoachSpeech.legText(leg), "Recuperación. 2 minutos trote suave.")
    }

    func testRecoveryTimedCaminarAndParado() {
        // 90 s decomposes to "1 minuto 30 segundos" — the same consistent time voice
        // as pace / splits / durations (no special sub-2-min "90 segundos" form).
        let cam = CueLeg(number: 5, total: 21, isWork: false, phase: .main,
                         measure: .duration(s: 90), target: nil, recoveryMode: .caminar)
        XCTAssertEqual(CoachSpeech.legText(cam), "Recuperación. 1 minuto 30 segundos caminando.")
        let par = CueLeg(number: 5, total: 21, isWork: false, phase: .main,
                         measure: .duration(s: 90), target: nil, recoveryMode: .parado)
        XCTAssertEqual(CoachSpeech.legText(par), "Recuperación. 1 minuto 30 segundos parado.")
    }

    func testRecoveryDistanceTrote() {
        let leg = CueLeg(number: 6, total: 12, isWork: false, phase: .main,
                         measure: .distance(m: 200), target: nil, recoveryMode: .trote)
        XCTAssertEqual(CoachSpeech.legText(leg), "Recuperación. 200 metros trote suave.")
    }

    func testOpenRecoveryUsesImperativeOrStaysBrief() {
        let cam = CueLeg(number: 2, total: 20, isWork: false, phase: .main,
                         measure: .unknown, target: nil, recoveryMode: .caminar)
        XCTAssertEqual(CoachSpeech.legText(cam), "Recuperación. Camina.")
        let trote = CueLeg(number: 2, total: 20, isWork: false, phase: .main,
                           measure: .unknown, target: nil, recoveryMode: .trote)
        XCTAssertEqual(CoachSpeech.legText(trote), "Recuperación. Trota suave.")
        let parado = CueLeg(number: 2, total: 20, isWork: false, phase: .main,
                            measure: .unknown, target: nil, recoveryMode: .parado)
        XCTAssertEqual(CoachSpeech.legText(parado), "Recuperación.")
    }

    // MARK: - pace correction / split / countdown / finish

    func testPaceCorrectionText() {
        XCTAssertEqual(CoachSpeech.paceCorrection(status: .tooFast, deltaSec: 15), "")
        XCTAssertEqual(CoachSpeech.paceCorrection(status: .tooFast, deltaSec: nil), "")
        XCTAssertEqual(CoachSpeech.paceCorrection(status: .tooSlow, deltaSec: 12), "")
    }

    func testSplitAndCountdownAndFinish() {
        XCTAssertEqual(CoachSpeech.split(km: 3, splitSec: 282), "Kilómetro 3. 4 minutos 42 segundos.")
        XCTAssertEqual(CoachSpeech.countdown, "10 segundos")
        XCTAssertEqual(CoachSpeech.finish(totalSeconds: 2538), "Entreno completado. Tiempo total 42 minutos 18 segundos.")
    }

    // MARK: - CueQueue priority + purge

    func testQueueOrdersByPriorityThenFIFO() {
        var q = CueQueue()
        q.enqueue(CoachUtterance(text: "split", priority: .split))
        q.enqueue(CoachUtterance(text: "pace", priority: .pace))
        // pace (higher) jumps ahead of the queued split.
        XCTAssertEqual(q.next()?.text, "pace")
        XCTAssertEqual(q.next()?.text, "split")
        XCTAssertNil(q.next())
    }

    func testQueueFIFOWithinSamePriority() {
        var q = CueQueue()
        q.enqueue(CoachUtterance(text: "p1", priority: .pace))
        q.enqueue(CoachUtterance(text: "p2", priority: .pace))
        XCTAssertEqual(q.next()?.text, "p1")
        XCTAssertEqual(q.next()?.text, "p2")
    }

    func testTransitionPurgesPendingPaceAndSplit() {
        var q = CueQueue()
        q.enqueue(CoachUtterance(text: "pace", priority: .pace))
        q.enqueue(CoachUtterance(text: "split", priority: .split))
        q.enqueue(CoachUtterance(text: "tramo", priority: .transition))
        // The new tramo makes the stale pace/split worthless — only it survives.
        XCTAssertEqual(q.count, 1)
        XCTAssertEqual(q.next()?.text, "tramo")
        XCTAssertNil(q.next())
    }

    func testTransitionKeepsOtherPendingTransitions() {
        var q = CueQueue()
        q.enqueue(CoachUtterance(text: "t1", priority: .transition))
        q.enqueue(CoachUtterance(text: "t2", priority: .transition))
        XCTAssertEqual(q.count, 2)
        XCTAssertEqual(q.next()?.text, "t1")
        XCTAssertEqual(q.next()?.text, "t2")
    }
}
