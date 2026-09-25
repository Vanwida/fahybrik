import XCTest
@testable import FAHYBRIK

// EL SUBIDOR DEL MOVIMIENTO, SIN RED (DECISIONS 2026-09-25, «el subidor»).
//
// Lo que se fija aquí:
//   • qué se hace con cada respuesta de cada paso — un 404 al pedir destino espera
//     (el entreno aún viaja en la cola), un 403 vuelve a pedir el sí, un archivo
//     imposible se tira y sin red no se toca nada;
//   • que el registro sale de la cabecera que escribió el reloj, con las claves que
//     pide el servidor;
//   • que el buzón es de cada atleta, caduca a los 30 días y recoge lo de la fase 0.

@MainActor
final class SensorUploaderTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "test.sensor.inbox.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    // MARK: - Qué hacer con cada respuesta

    func testOutcomeTruthTable() {
        typealias U = SensorUploader
        // Sin respuesta HTTP (sin red, timeout): se para y no se toca nada.
        XCTAssertEqual(U.outcome(status: nil, step: .target), .stop)
        XCTAssertEqual(U.outcome(status: nil, step: .bytes), .stop)
        XCTAssertEqual(U.outcome(status: nil, step: .register), .stop)
        // Sesión caducada, servidor caído o saturado: igual.
        for status in [401, 429, 500, 502, 503] {
            XCTAssertEqual(U.outcome(status: status, step: .target), .stop, "\(status)")
            XCTAssertEqual(U.outcome(status: status, step: .register), .stop, "\(status)")
        }
        // El entreno aún no está en el servidor: se espera, el archivo se queda.
        XCTAssertEqual(U.outcome(status: 404, step: .target), .wait)
        // El servidor no tiene el sí: se vuelve a mandar.
        XCTAssertEqual(U.outcome(status: 403, step: .target), .serverLacksConsent)
        XCTAssertEqual(U.outcome(status: 403, step: .register), .serverLacksConsent)
        // El almacén rechazó este intento (firma caducada…): otro destino la próxima vez.
        XCTAssertEqual(U.outcome(status: 403, step: .bytes), .wait)
        XCTAssertEqual(U.outcome(status: 400, step: .bytes), .wait)
        // Imposible tal cual: fuera, con el motivo para el registro técnico.
        XCTAssertEqual(U.outcome(status: 400, step: .target), .drop("target_400"))
        XCTAssertEqual(U.outcome(status: 400, step: .register), .drop("register_400"))
        // Registrar contra una ejecución que ya no existe.
        XCTAssertEqual(U.outcome(status: 404, step: .register), .drop("register_404"))
    }

    // MARK: - El registro, desde la cabecera

    func testRegistrationComesFromTheWatchHeader() throws {
        let samples = (0..<100).map { i in
            SensorSample(t: Double(i) / 50, ax: 0.1, ay: 0.2, az: 0.3, gx: 0, gy: 0, gz: 0, grx: 0, gry: 0, grz: -1)
        }
        let header = SensorFileHeader(
            formatVersion: 2,
            executionLocalId: "812",
            startedAt: "2026-09-25T08:00:00.000Z",
            sampleHz: 50,
            channels: SensorFileFormat.channels,
            captureMode: "classic",
            watchModel: "Watch7,1",
            wrist: nil,
            appVersion: nil,
            windows: [],
            sampleCount: 0
        )
        let data = try SensorFileCodec.encode(header: header, samples: samples)

        let capture = try XCTUnwrap(SensorCaptureRegistration(fileData: data))
        XCTAssertEqual(capture.durationS, 2, accuracy: 0.0001, "100 muestras a 50 Hz")
        XCTAssertEqual(capture.channels, SensorFileFormat.channels)
        XCTAssertEqual(capture.captureMode, "classic")

        let body = capture.body(executionId: 41, storagePathname: "sensor/7/2026/09/41-x.fhsc",
                                byteSize: data.count, consentVersion: SensorCaptureConsent.currentVersion)
        XCTAssertEqual(body.endedAt, "2026-09-25T08:00:02.000Z")

        // Las claves del cable, con el mismo codificador que APIClient.
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoder.encode(body)) as? [String: Any])
        for key in ["execution_id", "storage_pathname", "byte_size", "format_version", "sample_hz",
                    "channels", "capture_mode", "duration_s", "started_at", "ended_at", "consent_version"] {
            XCTAssertNotNil(json[key], key)
        }
        XCTAssertNil(json["wrist"], "sin muñeca conocida no se manda")
    }

    func testAnUnreadableFileHasNoRegistration() {
        XCTAssertNil(SensorCaptureRegistration(fileData: Data("no es un archivo".utf8)))
    }

    // MARK: - El buzón

    private func row(_ name: String, athlete: String?, at date: Date = Date()) -> SensorPendingCapture {
        SensorPendingCapture(fileName: name, assignmentId: Int(name.prefix { $0.isNumber }) ?? 1,
                             athleteId: athlete, receivedAt: date)
    }

    func testTheInboxIsPerAthlete() {
        let inbox = SensorCaptureInbox(defaults: defaults)
        inbox.add(row("1.fhsc", athlete: "42"))
        inbox.add(row("2.fhsc", athlete: "77"))

        let rows = inbox.load(migratingFor: "42")
        XCTAssertEqual(SensorCaptureInbox.mine(rows, athleteId: "42").map(\.fileName), ["1.fhsc"])
        XCTAssertEqual(SensorCaptureInbox.mine(rows, athleteId: "77").map(\.fileName), ["2.fhsc"])
    }

    func testTheSameFileAgainStartsOver() {
        let inbox = SensorCaptureInbox(defaults: defaults)
        inbox.add(row("1.fhsc", athlete: "42"))
        inbox.update(fileName: "1.fhsc") {
            $0.executionId = 9
            $0.storagePathname = "sensor/42/x.fhsc"
        }
        XCTAssertTrue(inbox.load(migratingFor: "42")[0].bytesUploaded)

        // El reloj lo mandó otra vez: el fichero es otro y lo subido ya no vale.
        inbox.add(row("1.fhsc", athlete: "42"))
        let rows = inbox.load(migratingFor: "42")
        XCTAssertEqual(rows.count, 1)
        XCTAssertFalse(rows[0].bytesUploaded)
    }

    func testExpiresAfterThirtyDays() {
        let now = Date()
        XCTAssertFalse(SensorCaptureInbox.isExpired(row("1.fhsc", athlete: nil, at: now.addingTimeInterval(-29 * 86400)), now: now))
        XCTAssertTrue(SensorCaptureInbox.isExpired(row("1.fhsc", athlete: nil, at: now.addingTimeInterval(-31 * 86400)), now: now))
    }

    func testPhaseZeroRowsAreCarriedOver() {
        defaults.set([
            ["path": "/var/old/Application Support/sensor-captures/812.fhsc", "execution_local_id": "812", "sample_hz": 50.0],
            ["path": "/var/old/Application Support/sensor-captures/B7.fhsc", "execution_local_id": "B7"],
        ], forKey: SensorCaptureInbox.legacyKey)
        let inbox = SensorCaptureInbox(defaults: defaults)

        let rows = inbox.load(migratingFor: "42")

        // Por nombre, no por ruta; y la que no tiene asignación legible no puede subir.
        XCTAssertEqual(rows.map(\.fileName), ["812.fhsc"])
        XCTAssertEqual(rows.first?.assignmentId, 812)
        XCTAssertEqual(rows.first?.athleteId, "42")
        XCTAssertNil(defaults.array(forKey: SensorCaptureInbox.legacyKey), "se migra una vez")
    }

    func testAssignmentFromWatchMetadata() {
        XCTAssertEqual(SensorCaptureInbox.assignmentId(fromMetadata: "812"), 812)
        XCTAssertEqual(SensorCaptureInbox.assignmentId(fromMetadata: NSNumber(value: 812)), 812)
        XCTAssertNil(SensorCaptureInbox.assignmentId(fromMetadata: nil))
        XCTAssertNil(SensorCaptureInbox.assignmentId(fromMetadata: "x"))
        XCTAssertNil(SensorCaptureInbox.assignmentId(fromMetadata: "0"))
    }
}
