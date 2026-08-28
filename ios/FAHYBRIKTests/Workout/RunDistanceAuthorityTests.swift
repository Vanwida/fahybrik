import XCTest
@testable import FAHYBRIK

// UNA DISTANCIA: cifra y mapa son el mismo stream.
//
// Calle → CoreLocation (`.gps`). Indoor / reloj solo → HealthKit.
// Un podómetro o un `.healthkit` en calle es el sustituto: se tira.

final class RunDistanceAuthorityTests: XCTestCase {

    // MARK: - La ley, en frío

    func testStreetAcceptsGpsAndDropsHealthKit() {
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .outdoor, beltOwns: false), .gps)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(
            source: .gps, environment: .outdoor, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(
            source: .healthkit, environment: .outdoor, beltOwns: false),
                       "HK en calle es un sustituto del stream del mapa")
        XCTAssertFalse(RunDistanceAuthority.acceptsTreadmill(environment: .outdoor))
    }

    func testWithoutASiteAppleStillSignsWatchAndTests() {
        XCTAssertEqual(RunDistanceAuthority.owner(beltOwns: false), .apple)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(source: .healthkit, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .gps, beltOwns: false),
                       "sin sitio no hay mapa: GPS no firma")
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .treadmill, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .strap, beltOwns: false))
    }

    func testAConnectedBeltRejectsAppleToo() {
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .healthkit, beltOwns: true))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .gps, beltOwns: true))
        XCTAssertEqual(RunDistanceAuthority.owner(beltOwns: true), .treadmill)
        XCTAssertEqual(RunDistanceAuthority.owner(beltOwns: false), .apple)
    }

    // MARK: - El motor

    func testTheSessionAcceptsGpsOnTheStreet() {
        let s = armedRun(environment: .outdoor)
        s.sampleRunDistance(deltaMeters: 400, source: .gps)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 400, accuracy: 0.001)
        XCTAssertEqual(s.livePicture.coveredMeters ?? 0, 400, accuracy: 0.001)
        let traces = s.trace.traces(startedAt: s.startedAt)
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces[0].source, "gps")
    }

    func testTheSessionDropsHealthKitOnTheStreet() {
        let s = armedRun(environment: .outdoor)
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        XCTAssertNil(s.liveRunDistanceMeters, "HK no sustituye al GPS de la calle")
        XCTAssertFalse(s.lapHadGPS)
        XCTAssertTrue(s.trace.traces(startedAt: s.startedAt).isEmpty)
    }

    func testTheSessionAcceptsAppleWhenThereIsNoMap() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 250, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 250, accuracy: 0.001)
        let traces = s.trace.traces(startedAt: s.startedAt)
        XCTAssertEqual(traces[0].source, "healthkit")
    }

    func testWithoutASampleThereIsNoNumber() {
        let s = armedRun()
        XCTAssertNil(s.liveRunDistanceMeters)
    }

    func testSampleDoesNotAddDuringRest() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 100, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 100, accuracy: 0.001)
        s.restRemainingSeconds = 45
        s.restTotalSeconds = 45
        XCTAssertTrue(s.isTramoResting)
        XCTAssertFalse(s.tramoMide)
        s.sampleRunDistance(deltaMeters: 200, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 100, accuracy: 0.001)
    }

    // MARK: - Una fuente: FTMS gana

    func testAConnectedBeltDropsAppleAndClearsWhatAppleHadStarted() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 80, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 80, accuracy: 0.001)

        s.claimTreadmillDistanceSource()
        XCTAssertNil(s.liveRunDistanceMeters)
        XCTAssertTrue(s.lapBeltOwnsDistance)

        s.sampleRunDistance(deltaMeters: 300, source: .healthkit)
        XCTAssertNil(s.liveRunDistanceMeters)
        XCTAssertEqual(s.lapBeltDistanceMeters, 0, accuracy: 0.001)

        s.sampleTreadmillDistance(deltaMeters: 120)
        XCTAssertEqual(s.lapBeltDistanceMeters, 120, accuracy: 0.001)
        XCTAssertNil(s.liveRunDistanceMeters)
    }

    func testClosingAStreetLapNamesGps() {
        let s = armedRun(environment: .outdoor)
        s.sampleRunDistance(deltaMeters: 1_000, source: .gps)
        s.lapElapsedSeconds = 240
        s.closeCurrentSegmentLap()
        XCTAssertEqual(s.laps.first?.distanceCoveredMeters ?? 0, 1_000, accuracy: 0.001)
        XCTAssertEqual(s.laps.first?.source, "gps")
    }

    func testClosingABeltLapKeepsTreadmillEvenIfAppleTried() {
        let s = armedRun()
        s.claimTreadmillDistanceSource()
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        s.sampleTreadmillDistance(deltaMeters: 800)
        s.lapElapsedSeconds = 240
        s.closeCurrentSegmentLap()
        XCTAssertEqual(s.laps.first?.distanceCoveredMeters ?? 0, 800, accuracy: 0.001)
        XCTAssertEqual(s.laps.first?.source, "treadmill")
    }

    func testTheMirrorDistancePacketIsAHealthKitDelta() {
        let sample = MirrorDistanceSample(deltaMeters: 12.5)
        let data = MirrorEnvelope.encoding(type: MirrorWire.MessageType.distance, sample)
        XCTAssertNotNil(data)
        let env = MirrorEnvelope.decoding(data!)
        XCTAssertEqual(env?.type, MirrorWire.MessageType.distance)
        XCTAssertEqual(env?.body(as: MirrorDistanceSample.self)?.deltaMeters ?? 0, 12.5, accuracy: 0.001)
    }

    @MainActor
    func testThePhoneFeedsTheMirrorDistanceIntoTheEngineIndoors() {
        let s = armedRun()
        s.runEnvironment = .indoor
        let mirror = PhoneMirrorService.shared
        defer { mirror.teardown() }
        mirror.begin(session: s, activityKind: "run")

        let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: 320)
        )
        XCTAssertNotNil(data)
        mirror.handleIncoming([data!])

        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 320, accuracy: 0.001)
    }

    @MainActor
    func testThePhoneDropsMirrorDistanceOnTheStreet() {
        let s = armedRun(environment: .outdoor)
        let mirror = PhoneMirrorService.shared
        defer { mirror.teardown() }
        mirror.begin(session: s, activityKind: "run")

        let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: 320)
        )
        XCTAssertNotNil(data)
        mirror.handleIncoming([data!])

        XCTAssertNil(s.liveRunDistanceMeters, "en calle la muñeca no sustituye al GPS")
    }

    // MARK: - El picker

    func testStreetIsGpsAndStartsNow() {
        XCTAssertTrue(RunEnvironment.outdoor.startsImmediately)
        XCTAssertFalse(RunEnvironment.outdoor.usesFTMS)
        XCTAssertTrue(RunEnvironment.outdoor.usesPhoneGPS)
        XCTAssertFalse(RunEnvironment.outdoor.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .outdoor, beltOwns: false), .gps)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(
            source: .gps, environment: .outdoor, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsTreadmill(environment: .outdoor))
    }

    func testPluggedBeltIsFTMSAndWaitsToConnect() {
        XCTAssertFalse(RunEnvironment.treadmill.startsImmediately)
        XCTAssertTrue(RunEnvironment.treadmill.usesFTMS)
        XCTAssertTrue(RunEnvironment.treadmill.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .treadmill, beltOwns: false), .none)
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(
            source: .healthkit, environment: .treadmill, beltOwns: false))
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .treadmill, beltOwns: true), .treadmill)
        XCTAssertTrue(RunDistanceAuthority.acceptsTreadmill(environment: .treadmill))
    }

    func testDumbBeltIsAppleIndoorAndStartsNow() {
        XCTAssertTrue(RunEnvironment.indoor.startsImmediately)
        XCTAssertFalse(RunEnvironment.indoor.usesFTMS)
        XCTAssertFalse(RunEnvironment.indoor.usesPhoneGPS)
        XCTAssertTrue(RunEnvironment.indoor.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .indoor, beltOwns: false), .apple)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(
            source: .healthkit, environment: .indoor, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(
            source: .gps, environment: .indoor, beltOwns: false))
    }

    func testAStreetSessionRejectsABeltClaim() {
        let s = armedRun(environment: .outdoor)
        s.claimTreadmillDistanceSource()
        XCTAssertFalse(s.lapBeltOwnsDistance)
        s.sampleTreadmillDistance(deltaMeters: 200)
        XCTAssertEqual(s.lapBeltDistanceMeters, 0, accuracy: 0.001)
        s.sampleRunDistance(deltaMeters: 300, source: .gps)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 300, accuracy: 0.001)
    }

    func testAPluggedBeltSessionHasNoAppleMetresUntilTheBeltClaims() {
        let s = armedRun(environment: .treadmill)
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        XCTAssertNil(s.liveRunDistanceMeters)
        s.claimTreadmillDistanceSource()
        s.sampleTreadmillDistance(deltaMeters: 150)
        XCTAssertEqual(s.lapBeltDistanceMeters, 150, accuracy: 0.001)
        XCTAssertNil(s.liveRunDistanceMeters)
    }

    func testADumbBeltSessionCountsAppleIndoor() {
        let s = armedRun(environment: .indoor)
        s.sampleRunDistance(deltaMeters: 220, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 220, accuracy: 0.001)
        s.sampleRunDistance(deltaMeters: 80, source: .gps)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 220, accuracy: 0.001)
    }

    // MARK: - Fixture

    private func armedRun(environment: RunEnvironment? = nil) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 5_000, blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                               estimatedDurationSeconds: 0, blockContext: "Carrera",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.runEnvironment = environment
        s.start(); s.beginBlock(); s.stop()
        return s
    }
}
