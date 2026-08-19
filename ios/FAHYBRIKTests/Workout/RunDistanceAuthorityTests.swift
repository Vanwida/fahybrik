import XCTest
@testable import FAHYBRIK

// CARRERA: CUENTA APPLE, NO NUESTROS METROS.
//
// Si alguien vuelve a sumar un salto de GPS, un podómetro o un integrador de
// velocidad en `sampleRunDistance`, estas pruebas fallan. Una fuente. Sin reloj
// y sin cinta, no hay cifra.

final class RunDistanceAuthorityTests: XCTestCase {

    // MARK: - La ley, en frío

    func testAppleIsTheOnlyAcceptedRunSample() {
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(source: .healthkit, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .gps, beltOwns: false),
                       "sumar GPS crudo es inventar metros")
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .treadmill, beltOwns: false),
                       "la cinta entra por sampleTreadmillDistance, no por aquí")
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .strap, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .concept2, beltOwns: false))
    }

    func testAConnectedBeltRejectsAppleToo() {
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .healthkit, beltOwns: true),
                       "FTMS conectada gana: una fuente")
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .gps, beltOwns: true))
        XCTAssertEqual(RunDistanceAuthority.owner(beltOwns: true), .treadmill)
        XCTAssertEqual(RunDistanceAuthority.owner(beltOwns: false), .apple)
    }

    // MARK: - El motor no acepta metros inventados

    func testTheSessionDropsAGpsDelta() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 400, source: .gps)
        XCTAssertNil(s.liveRunDistanceMeters, "sin Apple no hay cifra")
        XCTAssertFalse(s.lapHadGPS)
        XCTAssertTrue(s.trace.traces(startedAt: s.startedAt).isEmpty,
                      "un metro inventado no se archiva")
    }

    func testTheSessionAcceptsAppleAndTagsItHealthKit() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 250, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 250, accuracy: 0.001)
        XCTAssertTrue(s.lapHadGPS)
        let traces = s.trace.traces(startedAt: s.startedAt)
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces[0].source, "healthkit")
        XCTAssertNotEqual(traces[0].source, "gps")
        XCTAssertEqual(traces[0].values, [250])
    }

    func testWithoutAWatchThereIsNoNumber() {
        let s = armedRun()
        XCTAssertNil(s.liveRunDistanceMeters, "sin reloj y sin cinta: no se inventa un 0")
    }

    // MARK: - Una fuente: FTMS gana

    func testAConnectedBeltDropsAppleAndClearsWhatAppleHadStarted() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 80, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 80, accuracy: 0.001)

        s.claimTreadmillDistanceSource()
        XCTAssertNil(s.liveRunDistanceMeters, "al reclamar la cinta, Apple deja de firmar")
        XCTAssertTrue(s.lapBeltOwnsDistance)

        s.sampleRunDistance(deltaMeters: 300, source: .healthkit)
        XCTAssertNil(s.liveRunDistanceMeters)
        XCTAssertEqual(s.lapBeltDistanceMeters, 0, accuracy: 0.001)

        s.sampleTreadmillDistance(deltaMeters: 120)
        XCTAssertEqual(s.lapBeltDistanceMeters, 120, accuracy: 0.001)
        XCTAssertNil(s.liveRunDistanceMeters, "el HUD de calle no mezcla la cinta")
    }

    func testClosingAStreetLapNamesHealthKitNotGps() {
        let s = armedRun()
        s.sampleRunDistance(deltaMeters: 1_000, source: .healthkit)
        s.lapElapsedSeconds = 240
        s.closeCurrentSegmentLap()
        XCTAssertEqual(s.laps.first?.distanceCoveredMeters ?? 0, 1_000, accuracy: 0.001)
        XCTAssertEqual(s.laps.first?.source, "healthkit",
                       "estos metros los contó Apple, no un integrador nuestro")
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

    // MARK: - El cable del espejo habla Apple, no GPS

    func testTheMirrorDistancePacketIsAHealthKitDelta() {
        let sample = MirrorDistanceSample(deltaMeters: 12.5)
        let data = MirrorEnvelope.encoding(type: MirrorWire.MessageType.distance, sample)
        XCTAssertNotNil(data)
        let env = MirrorEnvelope.decoding(data!)
        XCTAssertEqual(env?.type, MirrorWire.MessageType.distance)
        XCTAssertEqual(env?.body(as: MirrorDistanceSample.self)?.deltaMeters ?? 0, 12.5, accuracy: 0.001)
        XCTAssertNotEqual(MirrorWire.MessageType.distance, MirrorWire.MessageType.hr)
    }

    // MARK: - El picker: tres sitios, tres fuentes

    func testStreetIsAppleOutdoorAndStartsNow() {
        XCTAssertTrue(RunEnvironment.outdoor.startsImmediately)
        XCTAssertFalse(RunEnvironment.outdoor.usesFTMS)
        XCTAssertTrue(RunEnvironment.outdoor.usesPhoneGPS)
        XCTAssertFalse(RunEnvironment.outdoor.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .outdoor, beltOwns: false), .apple)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(source: .healthkit, environment: .outdoor, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsTreadmill(environment: .outdoor),
                       "en la calle la cinta no firma")
    }

    func testPluggedBeltIsFTMSAndWaitsToConnect() {
        XCTAssertFalse(RunEnvironment.treadmill.startsImmediately)
        XCTAssertTrue(RunEnvironment.treadmill.usesFTMS)
        XCTAssertTrue(RunEnvironment.treadmill.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .treadmill, beltOwns: false), .none,
                       "enchufada sin cinta: no se inventa")
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .healthkit, environment: .treadmill, beltOwns: false))
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .treadmill, beltOwns: true), .treadmill)
        XCTAssertTrue(RunDistanceAuthority.acceptsTreadmill(environment: .treadmill))
    }

    func testDumbBeltIsAppleIndoorAndStartsNow() {
        XCTAssertTrue(RunEnvironment.indoor.startsImmediately)
        XCTAssertFalse(RunEnvironment.indoor.usesFTMS)
        XCTAssertFalse(RunEnvironment.indoor.usesPhoneGPS)
        XCTAssertFalse(RunEnvironment.indoor.usesPhonePedometer)
        XCTAssertTrue(RunEnvironment.indoor.isIndoorForHealthKit)
        XCTAssertEqual(RunDistanceAuthority.owner(environment: .indoor, beltOwns: false), .apple)
        XCTAssertTrue(RunDistanceAuthority.acceptsRunSample(source: .healthkit, environment: .indoor, beltOwns: false))
        XCTAssertFalse(RunDistanceAuthority.acceptsRunSample(source: .gps, environment: .indoor, beltOwns: false),
                       "pasos o GPS crudo no entran en cinta tonta")
    }

    func testAStreetSessionRejectsABeltClaim() {
        let s = armedRun(environment: .outdoor)
        s.claimTreadmillDistanceSource()
        XCTAssertFalse(s.lapBeltOwnsDistance)
        s.sampleTreadmillDistance(deltaMeters: 200)
        XCTAssertEqual(s.lapBeltDistanceMeters, 0, accuracy: 0.001)
        s.sampleRunDistance(deltaMeters: 300, source: .healthkit)
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 300, accuracy: 0.001)
    }

    func testAPluggedBeltSessionHasNoAppleMetresUntilTheBeltClaims() {
        let s = armedRun(environment: .treadmill)
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit)
        XCTAssertNil(s.liveRunDistanceMeters, "enchufada sin cinta: no hay cifra")
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
        XCTAssertEqual(s.liveRunDistanceMeters ?? 0, 220, accuracy: 0.001,
                       "GPS crudo no suma en cinta tonta")
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
