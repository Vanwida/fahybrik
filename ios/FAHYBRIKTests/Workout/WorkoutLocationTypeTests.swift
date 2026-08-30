import XCTest
import HealthKit
@testable import FAHYBRIK

// CALLE O CINTA, DICHO Y NO ADIVINADO.
//
// `locationType` es la pista con la que watchOS decide si la distancia la MIDE con el
// GPS del reloj o la ESTIMA con el acelerómetro. Estaba en `.unknown` en la sesión
// del reloj a solas —entregando esa decisión a una heurística— y en el espejo se daba
// por hecho que toda carrera es en calle, así que una sesión de cinta arrancaba
// declarando exterior. Estas pruebas fijan la regla única que usan los dos.
final class WorkoutLocationTypeTests: XCTestCase {

    // Lo que el atleta contestó MANDA, en los dos sentidos.
    func testTheAthletesAnswerWins() {
        XCTAssertEqual(
            WorkoutLocationType.resolve(activityKind: "running", environment: .outdoor),
            .outdoor
        )
        XCTAssertEqual(
            WorkoutLocationType.resolve(activityKind: "running", environment: .treadmill),
            .indoor,
            "una carrera en cinta no puede arrancar el GPS declarando exterior"
        )
        XCTAssertEqual(
            WorkoutLocationType.resolve(activityKind: "running", environment: .indoor),
            .indoor,
            "cinta tonta: HKWorkout indoor del reloj, GPS prohibido"
        )
    }

    // EL DEFECTO CUANDO NADIE CONTESTÓ (la muñeca a solas, que no tiene esa pregunta):
    // calle. Deliberado — `.outdoor` enciende el GPS y bajo techo watchOS cae solo a la
    // estimación, mientras que `.indoor` PROHÍBE el GPS. Equivocarse hacia calle cuesta
    // batería; equivocarse hacia cinta destruye la medida de una carrera de verdad.
    func testUnknownEnvironmentDefaultsToTheStreetForRunning() {
        XCTAssertEqual(
            WorkoutLocationType.resolve(activityKind: "running", environment: nil),
            .outdoor
        )
    }

    // Y NUNCA `.unknown`, que era el fallo: sea cual sea la combinación, sale una
    // respuesta. Dejar decidir a la heurística es lo que estamos quitando.
    func testItNeverAnswersUnknown() {
        let kinds: [String?] = ["running", "strength", "hyrox", "mixed", "other", nil, ""]
        let environments: [RunEnvironment?] = [.outdoor, .treadmill, .indoor, nil]
        for kind in kinds {
            for environment in environments {
                XCTAssertNotEqual(
                    WorkoutLocationType.resolve(activityKind: kind, environment: environment),
                    .unknown,
                    "«\(kind ?? "nil")» + «\(environment?.rawValue ?? "nil")» se quedó sin decidir"
                )
            }
        }
    }

    // Lo que no es correr es bajo techo, conteste lo que conteste: la pregunta
    // calle/cinta sólo existe para correr.
    func testEverythingThatIsNotRunningIsIndoor() {
        for kind in ["strength", "hyrox", "mixed", "other"] {
            XCTAssertEqual(
                WorkoutLocationType.resolve(activityKind: kind, environment: .outdoor),
                .indoor,
                "\(kind) no se corre por la calle"
            )
        }
        XCTAssertEqual(WorkoutLocationType.resolve(activityKind: nil, environment: nil), .indoor)
    }

    // El reloj a solas lee la regla a través del payload, sin una segunda copia que
    // pueda divergir de la del espejo.
    func testTheWatchPayloadReadsTheSameRule() {
        let run = WatchTodayPayload.minimalTest(activityKind: "running")
        let gym = WatchTodayPayload.minimalTest(activityKind: "strength")

        XCTAssertEqual(run.healthKitLocationType, .outdoor)
        XCTAssertEqual(gym.healthKitLocationType, .indoor)
        XCTAssertEqual(run.healthKitActivityType, .running)
    }

    // MARK: - Lo que el teléfono escribe en Salud

    // El escritor del teléfono ya lo tenía bien y esta prueba lo deja clavado: la
    // respuesta del atleta decide, y sólo correr admite exterior.
    func testThePhoneWriterAlreadyTellsTheTruth() {
        XCTAssertTrue(HealthKitWorkoutWriter.isIndoor(modality: "run", treadmill: true))
        XCTAssertFalse(HealthKitWorkoutWriter.isIndoor(modality: "run", treadmill: false))
        // Fuerza y funcional son bajo techo aunque nadie conteste nada.
        XCTAssertTrue(HealthKitWorkoutWriter.isIndoor(modality: "strength", treadmill: false))
        XCTAssertTrue(HealthKitWorkoutWriter.isIndoor(modality: "functional", treadmill: false))
    }
}

// CLASE 1 — el aviso que existe para cuando `startWatchApp` no levanta la app
// tiene que LLEVAR con qué arrancar, no un `true`. Un Bool no pone a la muñeca
// a grabar. Estas pruebas clavan el sobre y la resolución del legado.
final class WatchLiveStartTests: XCTestCase {

    func testResolvingMissingKeyIsNil() {
        XCTAssertNil(WatchLiveStart.resolving(from: [:], today: nil))
    }

    func testLegacyTrueFallsBackToOutdoorRunWhenNoDay() {
        let start = WatchLiveStart.resolving(
            from: [WatchWireKeys.liveStart: true],
            today: nil
        )
        XCTAssertEqual(start?.activityKind, "running")
        XCTAssertEqual(start?.location, "outdoor")
        XCTAssertEqual(start?.configuration.activityType, .running)
        XCTAssertEqual(start?.configuration.locationType, .outdoor)
    }

    func testLegacyTrueUsesTodaysActivityAndResolvedLocation() {
        let today = WatchTodayPayload.minimalTest(activityKind: "strength")
        let start = WatchLiveStart.resolving(
            from: [WatchWireKeys.liveStart: true],
            today: today
        )
        XCTAssertEqual(start?.activityKind, "strength")
        XCTAssertEqual(start?.location, "indoor")
        XCTAssertEqual(start?.configuration.activityType, .functionalStrengthTraining)
        XCTAssertEqual(start?.configuration.locationType, .indoor)
    }

    func testEncodedPayloadRoundtripsAndWinsOverToday() throws {
        let sent = WatchLiveStart(activityKind: "running", locationType: .outdoor)
        let data = try WatchWire.encoder.encode(sent)
        let today = WatchTodayPayload.minimalTest(activityKind: "strength")
        let start = WatchLiveStart.resolving(
            from: [WatchWireKeys.liveStart: data],
            today: today
        )
        XCTAssertEqual(start, sent)
        XCTAssertEqual(start?.configuration.activityType, .running)
        XCTAssertEqual(start?.configuration.locationType, .outdoor)
    }

    func testIndoorStrengthConfiguration() {
        let start = WatchLiveStart(activityKind: "strength", locationType: .indoor)
        XCTAssertEqual(start.location, "indoor")
        XCTAssertEqual(start.configuration.activityType, .functionalStrengthTraining)
        XCTAssertEqual(start.configuration.locationType, .indoor)
    }

    func testGarbageDataFallsBack() {
        let start = WatchLiveStart.resolving(
            from: [WatchWireKeys.liveStart: Data("no soy el sobre".utf8)],
            today: nil
        )
        XCTAssertEqual(start?.activityKind, "running")
        XCTAssertEqual(start?.location, "outdoor")
    }

    func testActivityTypeTableMatchesTheDayPayload() {
        XCTAssertEqual(WatchLiveStart.activityType(for: "running"), .running)
        XCTAssertEqual(WatchLiveStart.activityType(for: "strength"), .functionalStrengthTraining)
        XCTAssertEqual(WatchLiveStart.activityType(for: "hyrox"), .functionalStrengthTraining)
        XCTAssertEqual(WatchLiveStart.activityType(for: "mixed"), .mixedCardio)
        XCTAssertEqual(WatchLiveStart.activityType(for: "otro"), .other)
        XCTAssertEqual(WatchLiveStart.activityType(for: nil), .other)
    }

    func testMergedContextKeepsTodayAndLiveStart() throws {
        let start = WatchLiveStart(activityKind: "running", locationType: .outdoor)
        let startData = try WatchWire.encoder.encode(start)
        let today = WatchTodayPayload.minimalTest(activityKind: "strength")
        let todayData = try WatchWire.encoder.encode(today)
        let dict = WatchApplicationContext.dictionary(today: todayData, liveStart: startData)
        XCTAssertNotNil(dict[WatchWireKeys.today] as? Data)
        XCTAssertNotNil(dict[WatchWireKeys.liveStart] as? Data)
        let resolved = WatchLiveStart.resolving(from: dict, today: today)
        XCTAssertEqual(resolved, start, "liveStart del contexto gana sobre el día")
    }

    func testTodayOnlyContextDoesNotInventAStart() {
        let today = WatchTodayPayload.minimalTest(activityKind: "running")
        let todayData = try? WatchWire.encoder.encode(today)
        let dict = WatchApplicationContext.dictionary(today: todayData, liveStart: nil)
        XCTAssertNil(WatchLiveStart.resolving(from: dict, today: today))
    }

    func testPendingStoreSurvivesARelaunch() {
        WatchLiveStartStore.clear()
        let start = WatchLiveStart(activityKind: "running", locationType: .outdoor)
        WatchLiveStartStore.persist(start)
        XCTAssertEqual(WatchLiveStartStore.load(), start)
        WatchLiveStartStore.clear()
        XCTAssertNil(WatchLiveStartStore.load())
    }

    func testStalePendingStoreIsIgnored() {
        WatchLiveStartStore.clear()
        let start = WatchLiveStart(activityKind: "running", locationType: .outdoor)
        WatchLiveStartStore.persist(start)
        UserDefaults.standard.set(
            Date().timeIntervalSince1970 - WatchLiveStartStore.freshness - 1,
            forKey: WatchLiveStartStore.atKey
        )
        XCTAssertNil(WatchLiveStartStore.load())
        WatchLiveStartStore.clear()
    }

    func testConfigurationRoundtripKind() {
        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor
        let start = WatchLiveStart(configuration: config)
        XCTAssertEqual(start.activityKind, "running")
        XCTAssertEqual(start.location, "outdoor")
        XCTAssertEqual(start.configuration.activityType, .running)
    }
}

private extension WatchTodayPayload {
    /// Un payload mínimo para preguntarle por su `locationType`. El resto de campos no
    /// intervienen en esa decisión.
    static func minimalTest(activityKind: String) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: WatchDayKind.session,
            assignmentId: "1",
            title: "Rodaje",
            focus: nil,
            estDurationMinutes: nil,
            intensityLabel: nil,
            activityKind: activityKind,
            athleteHrZones: nil,
            readinessScore: nil,
            readinessDelta7d: nil,
            readinessWorstDriver: nil,
            isDone: false,
            doneCompleteness: nil,
            isDoubles: false,
            partnerFirstName: nil,
            partnerVisibility: nil,
            detailJson: nil,
            clubAccent: nil
        )
    }
}
