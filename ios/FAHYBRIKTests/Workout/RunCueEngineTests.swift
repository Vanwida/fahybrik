import XCTest
@testable import FAHYBRIK

// #63 — the stateful cue engine (pace hysteresis, km splits, once-per-leg
// countdown, finish gating) and the AudioCoach drain/ducking wiring driven with a
// mock speaker + mock audio session (no AVFoundation).
final class RunCueEngineTests: XCTestCase {

    private func sampleLeg() -> CueLeg {
        CueLeg(number: 2, total: 14, isWork: true, phase: .main,
               measure: .distance(m: 800), target: .pace(valueS: nil, minS: 265, maxS: 275),
               recoveryMode: nil)
    }

    // MARK: - Leg entry

    func testAnnounceLegIsTransitionAndArmsFinish() {
        let engine = RunCueEngine()
        XCTAssertFalse(engine.didAnnounceRun)
        let u = engine.announceLeg(sampleLeg())
        XCTAssertEqual(u.priority, .transition)
        XCTAssertEqual(u.text, "Tramo 2 de 14. 800 metros, ritmo entre 4 minutos 25 segundos y 4 minutos 35 segundos.")
        XCTAssertTrue(engine.didAnnounceRun)
    }

    // MARK: - Pace hysteresis

    func testPaceCorrectionWaitsForDwellThenFires() {
        let engine = RunCueEngine(minCorrectionInterval: 30, correctionDwell: 10)
        XCTAssertNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 0))   // dwell not met
        XCTAssertNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 5))
        let fired = engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 10)    // dwell met
        XCTAssertEqual(fired?.text, "Vas 15 segundos rápido.")
        XCTAssertEqual(fired?.priority, .pace)
    }

    func testPaceNeverNagsSameDirectionTwiceWithoutAChange() {
        let engine = RunCueEngine(minCorrectionInterval: 30, correctionDwell: 10)
        _ = engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 0)
        XCTAssertNotNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 10))
        // Still too fast → no repeat, even past the min interval.
        XCTAssertNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 50))
        XCTAssertNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 90))
    }

    func testReturnToBandClearsLockAndAllowsSameDirectionAgain() {
        let engine = RunCueEngine(minCorrectionInterval: 30, correctionDwell: 10)
        _ = engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 0)                // episode starts
        XCTAssertNotNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 10))  // dwell met → fires
        XCTAssertNil(engine.onPaceSample(status: .inTarget, deltaSec: nil, now: 20))   // back in band → lock cleared
        XCTAssertNil(engine.onPaceSample(status: .tooFast, deltaSec: 12, now: 21))     // new episode, dwell not met
        let again = engine.onPaceSample(status: .tooFast, deltaSec: 12, now: 45)       // dwell + interval met, lock cleared
        XCTAssertEqual(again?.text, "")
    }

    func testDirectionFlipIsAChangeButStillWaitsMinInterval() {
        let engine = RunCueEngine(minCorrectionInterval: 30, correctionDwell: 10)
        _ = engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 0)                // episode starts
        XCTAssertNotNil(engine.onPaceSample(status: .tooFast, deltaSec: 15, now: 10))  // fires (lastCorrection @10)
        // Flip to slow: a "change", but the min interval since the last correction still applies.
        XCTAssertNil(engine.onPaceSample(status: .tooSlow, deltaSec: 12, now: 12))   // new episode, dwell not met
        XCTAssertNil(engine.onPaceSample(status: .tooSlow, deltaSec: 12, now: 22))   // dwell met, but < 30s since last
        let slow = engine.onPaceSample(status: .tooSlow, deltaSec: 12, now: 45)      // dwell + interval met
        XCTAssertEqual(slow?.text, "")
    }

    // MARK: - Km splits

    func testSplitsFireOncePerKilometreFromLegDistance() {
        let engine = RunCueEngine()
        XCTAssertNil(engine.onDistance(distanceM: 500, elapsedS: 150))              // km 0
        XCTAssertEqual(engine.onDistance(distanceM: 1000, elapsedS: 300)?.text, "Kilómetro 1. 5 minutos.")
        XCTAssertNil(engine.onDistance(distanceM: 1500, elapsedS: 450))            // still km 1
        XCTAssertEqual(engine.onDistance(distanceM: 2000, elapsedS: 610)?.text, "Kilómetro 2. 5 minutos 10 segundos.")
    }

    func testResetSplitsRestartsTheKilometreCursor() {
        let engine = RunCueEngine()
        _ = engine.onDistance(distanceM: 1000, elapsedS: 300)
        _ = engine.onDistance(distanceM: 2000, elapsedS: 600)
        engine.resetSplits()   // new continuous-run leg
        XCTAssertEqual(engine.onDistance(distanceM: 1000, elapsedS: 300)?.text, "Kilómetro 1. 5 minutos.")
    }

    func testSplitPriorityIsLowest() {
        let engine = RunCueEngine()
        XCTAssertEqual(engine.onDistance(distanceM: 1000, elapsedS: 300)?.priority, .split)
    }

    // MARK: - Countdown

    func testCountdownFiresOnceAtTenSecondsPerLeg() {
        let engine = RunCueEngine(countdownAtSeconds: 10)
        XCTAssertNil(engine.onTimeRemaining(11, legKey: "a"))
        XCTAssertEqual(engine.onTimeRemaining(10, legKey: "a")?.text, "10 segundos")
        XCTAssertNil(engine.onTimeRemaining(9, legKey: "a"))       // already fired for this leg
        XCTAssertEqual(engine.onTimeRemaining(10, legKey: "b")?.text, "10 segundos")   // new leg
        XCTAssertNil(engine.onTimeRemaining(0, legKey: "c"))       // no cue at/under zero
    }

    // MARK: - Finish gating

    func testFinishOnlyAfterARunWasAnnounced() {
        let engine = RunCueEngine()
        XCTAssertNil(engine.announceFinish(totalSeconds: 2538))    // no run → silent
        _ = engine.announceLeg(sampleLeg())
        XCTAssertEqual(engine.announceFinish(totalSeconds: 2538)?.text,
                       "Entreno completado. Tiempo total 42 minutos 18 segundos.")
        engine.reset()
        XCTAssertNil(engine.announceFinish(totalSeconds: 2538))    // reset clears engagement
    }

    // MARK: - AudioCoach drain + ducking (mock speaker / session)

    private final class MockSpeaker: CoachSpeaker {
        var onFinish: (() -> Void)?
        private(set) var spoken: [String] = []
        private(set) var stopCount = 0
        func speak(_ text: String) { spoken.append(text) }
        func stop() { stopCount += 1 }
        /// Simulate the synthesizer finishing the current utterance.
        func finishCurrent() { onFinish?() }
    }

    private final class MockSession: VoiceAudioSession {
        private(set) var calls: [Bool] = []
        func setVoiceActive(_ active: Bool) { calls.append(active) }
        var last: Bool? { calls.last }
    }

    override func setUp() {
        super.setUp()
        UserDefaults.standard.set(true, forKey: AudioCoachSettings.enabledKey)
    }
    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: AudioCoachSettings.enabledKey)
        super.tearDown()
    }

    func testCoachSpeaksFirstCueDucksAndDrainsInOrder() {
        let speaker = MockSpeaker(); let session = MockSession()
        let coach = AudioCoach(engine: RunCueEngine(), speaker: speaker, audioSession: session, now: { 0 })

        coach.distanceUpdate(distanceM: 1000, elapsedS: 300)   // split → speaks immediately, ducks
        XCTAssertEqual(speaker.spoken, ["Kilómetro 1. 5 minutos."])
        XCTAssertEqual(session.last, true)

        coach.distanceUpdate(distanceM: 2000, elapsedS: 600)   // second split → queued, not spoken yet
        XCTAssertEqual(speaker.spoken.count, 1)

        speaker.finishCurrent()                                 // first done → drain the second
        XCTAssertEqual(speaker.spoken, ["Kilómetro 1. 5 minutos.", "Kilómetro 2. 5 minutos."])

        speaker.finishCurrent()                                 // queue empty → un-duck / release
        XCTAssertEqual(session.last, false)
    }

    func testCoachRespectsDisabledSetting() {
        UserDefaults.standard.set(false, forKey: AudioCoachSettings.enabledKey)
        let speaker = MockSpeaker(); let session = MockSession()
        let coach = AudioCoach(engine: RunCueEngine(), speaker: speaker, audioSession: session, now: { 0 })
        coach.distanceUpdate(distanceM: 1000, elapsedS: 300)
        XCTAssertTrue(speaker.spoken.isEmpty)
        XCTAssertTrue(session.calls.isEmpty)
    }

    func testFinishWorkoutSpeaksThroughCoachWhenEngaged() {
        let speaker = MockSpeaker(); let session = MockSession()
        let engine = RunCueEngine()
        let coach = AudioCoach(engine: engine, speaker: speaker, audioSession: session, now: { 0 })
        _ = engine.announceLeg(sampleLeg())                    // engage the run on this engine
        coach.finishWorkout(totalSeconds: 2538)
        XCTAssertEqual(speaker.spoken, ["Entreno completado. Tiempo total 42 minutos 18 segundos."])
    }

    func testStopSpeakingSilencesAndReleases() {
        let speaker = MockSpeaker(); let session = MockSession()
        let coach = AudioCoach(engine: RunCueEngine(), speaker: speaker, audioSession: session, now: { 0 })
        coach.distanceUpdate(distanceM: 1000, elapsedS: 300)   // speaking
        coach.stopSpeaking()
        XCTAssertEqual(speaker.stopCount, 1)
        XCTAssertEqual(session.last, false)
    }
}
