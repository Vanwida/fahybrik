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
        let environments: [RunEnvironment?] = [.outdoor, .treadmill, nil]
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
            detailJson: nil
        )
    }
}
