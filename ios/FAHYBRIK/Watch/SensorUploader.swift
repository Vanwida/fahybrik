import Foundation

// EL SUBIDOR DEL MOVIMIENTO DE LA MUÑECA (DECISIONS 2026-09-25, «el subidor»).
//
// Sube lo que espera en el buzón (`SensorCaptureInbox`) cuando el atleta ha dicho que
// sí y el servidor ya lo sabe (`SensorCaptureConsent.canUpload`). Por archivo, tres
// pasos:
//   1. DÓNDE — `POST upload-url` con la asignación. El servidor resuelve la ejecución
//      y firma un destino en el almacén. 404 = el entreno aún no ha llegado (viaja en
//      la cola del móvil): se espera, sin gastar nada.
//   2. LOS BYTES — `PUT` directo al almacén, desde el fichero. Hecho esto se apunta
//      la ruta: si lo siguiente falla, el reintento solo registra.
//   3. EL REGISTRO — `POST sensor-capture` con lo que dice la cabecera del archivo.
//      El servidor guarda una fila por ejecución, así que repetirlo no duplica.
//
// Sin el sí no sale nada, y se vuelve a mirar antes de cada paso: el atleta puede
// apagarlo en Perfil mientras esto sube. La retirada espera a que la pasada en curso
// acabe (`settle`) antes de pedir el borrado, para que ningún archivo aterrice en el
// almacén DESPUÉS de borrar lo del atleta.
//
// Cuándo corre: al abrir la app y al volver a primer plano (tras la cola y el
// permiso), al llegar un archivo del reloj, al guardarse un entreno del reloj y al
// decir que sí.

/// Qué hacer con un archivo según lo que contestó un paso.
enum SensorUploadOutcome: Equatable {
    /// Subido y registrado: fuera del buzón.
    case done
    /// Todavía no (el entreno aún no está en el servidor, o el almacén rechazó este
    /// intento): se queda y se prueba en la próxima pasada.
    case wait
    /// No va a subir nunca así (archivo ilegible, demasiado grande, el entreno ya no
    /// existe): se tira, y queda en el registro técnico.
    case drop(String)
    /// Sin red, sin sesión o el servidor caído: se para la pasada y se deja todo.
    case stop
    /// El servidor no tiene el sí que el móvil cree confirmado: se vuelve a mandar el
    /// sí (`SensorConsentSync`) y no sube nada hasta entonces.
    case serverLacksConsent
}

enum SensorUploadStep: String {
    case target, bytes, register
}

@MainActor
final class SensorUploader {
    static let shared = SensorUploader()

    static let uploadURLPath = "/api/sync/sensor-capture/upload-url"
    static let registerPath = "/api/sync/sensor-capture"

    var inbox = SensorCaptureInbox()

    private var current: Task<Void, Never>?
    private var again = false

    private init() {}

    /// Una pasada. Si ya corre una, esta pide otra vuelta al terminar (algo cambió
    /// mientras subía: llegó un archivo, se guardó un entreno) y espera a que acabe.
    func run(bearer: String? = nil) async {
        if let current {
            again = true
            await current.value
            return
        }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            repeat {
                self.again = false
                await self.pass(bearer: bearer)
            } while self.again
        }
        current = task
        await task.value
        current = nil
    }

    /// Lanza una pasada sin esperarla.
    func kick() {
        Task { await run() }
    }

    /// Espera a que acabe la pasada en curso, sin empezar otra.
    func settle() async {
        await current?.value
    }

    // MARK: - La pasada

    private func pass(bearer: String?) async {
        guard SensorCaptureConsent.canUpload,
              let bearer = bearer ?? KeychainTokenStore.shared.read(), !bearer.isEmpty
        else { return }
        let now = Date()
        let athleteId = AuthState.persistedAthleteId()
        SensorFileReceiver.shared.purge(now: now)
        for row in SensorCaptureInbox.mine(inbox.load(), athleteId: athleteId) {
            guard SensorCaptureConsent.canUpload else { return }
            let outcome = await upload(row, bearer: bearer)
            record(outcome, row: row)
            switch outcome {
            case .done, .drop:
                SensorFileReceiver.shared.remove(row)
            case .wait:
                continue
            case .stop:
                return
            case .serverLacksConsent:
                SensorCaptureConsent.store.update { $0.serverLacksGrant(current: SensorCaptureConsent.currentVersion) }
                return
            }
        }
    }

    private func upload(_ row: SensorPendingCapture, bearer: String) async -> SensorUploadOutcome {
        guard let url = SensorFileReceiver.fileURL(named: row.fileName) else { return .drop("file_missing") }
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe),
              let capture = SensorCaptureRegistration(fileData: data)
        else { return .drop("unreadable") }

        var executionId = row.executionId
        var pathname = row.storagePathname
        if !row.bytesUploaded {
            let target: SensorUploadTarget
            do {
                target = try await APIClient.shared.post(
                    path: Self.uploadURLPath,
                    body: SensorUploadTargetBody(assignmentId: row.assignmentId, sizeBytes: data.count),
                    bearer: bearer
                )
            } catch {
                return Self.outcome(status: RequestQueue.httpStatus(error), step: .target)
            }
            guard SensorCaptureConsent.canUpload else { return .stop }
            do {
                try await Self.put(fileAt: url, to: target)
            } catch {
                return Self.outcome(status: RequestQueue.httpStatus(error), step: .bytes)
            }
            executionId = target.executionId
            pathname = target.storagePathname
            inbox.update(fileName: row.fileName) {
                $0.executionId = target.executionId
                $0.storagePathname = target.storagePathname
            }
            guard SensorCaptureConsent.canUpload else { return .stop }
        }
        guard let executionId, let pathname else { return .drop("no_target") }
        do {
            let _: Empty = try await APIClient.shared.post(
                path: Self.registerPath,
                body: capture.body(
                    executionId: executionId,
                    storagePathname: pathname,
                    byteSize: data.count,
                    consentVersion: SensorCaptureConsent.currentVersion
                ),
                bearer: bearer
            )
        } catch {
            return Self.outcome(status: RequestQueue.httpStatus(error), step: .register)
        }
        return .done
    }

    /// Directo al almacén, desde el fichero (sin cargar horas de señal en memoria).
    /// El Content-Type tiene que ser EXACTAMENTE el firmado, o el almacén lo rechaza.
    private static func put(fileAt url: URL, to target: SensorUploadTarget) async throws {
        guard let destination = URL(string: target.uploadUrl) else { throw APIError.invalidResponse }
        var request = URLRequest(url: destination)
        request.httpMethod = "PUT"
        request.setValue(target.contentType, forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: url)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode, data) }
    }

    /// La regla, pura. `status` nil = no hubo respuesta HTTP (sin red, timeout).
    nonisolated static func outcome(status: Int?, step: SensorUploadStep) -> SensorUploadOutcome {
        guard let status else { return .stop }
        switch status {
        case 401, 429, 500...:
            return .stop
        case 403 where step != .bytes:
            return .serverLacksConsent
        case 404 where step == .target:
            return .wait
        default:
            // El almacén rechazó este intento (firma caducada, un Content-Type que no
            // casa): la próxima pasada pide otro destino.
            if step == .bytes { return .wait }
            return .drop("\(step.rawValue)_\(status)")
        }
    }

    private func record(_ outcome: SensorUploadOutcome, row: SensorPendingCapture) {
        let detail = "assignment=\(row.assignmentId)"
        switch outcome {
        case .done:
            DiagnosticsLog.shared.record(.save, .sensorCaptureUpload, outcome: .ok, detail: detail)
        case .drop(let reason):
            DiagnosticsLog.shared.record(.save, .sensorCaptureUpload, outcome: .failed,
                                         domain: reason, detail: "\(detail) dropped")
        case .serverLacksConsent:
            DiagnosticsLog.shared.record(.save, .sensorCaptureUpload, outcome: .failed,
                                         code: 403, detail: "\(detail) no_consent")
        case .wait, .stop:
            break
        }
    }
}

// MARK: - El cable

/// `POST upload-url`. El APIClient pasa las claves a snake_case.
struct SensorUploadTargetBody: Encodable {
    let assignmentId: Int
    let sizeBytes: Int
}

struct SensorUploadTarget: Decodable {
    let executionId: Int
    let uploadUrl: String
    let storagePathname: String
    let contentType: String
}

/// Lo que el registro pide, leído de la cabecera del archivo. Nada de esto lo
/// inventa el móvil: frecuencia, canales, inicio y nº de muestras los escribió el
/// reloj al grabar.
struct SensorCaptureRegistration: Equatable {
    let formatVersion: Int
    let sampleHz: Double
    let channels: [String]
    let captureMode: String
    let watchModel: String?
    let wrist: String?
    let startedAt: Date
    let durationS: Double

    init?(fileData: Data) {
        guard let parsed = try? SensorFileCodec.header(fileData) else { return nil }
        self.init(header: parsed.header, version: parsed.version)
    }

    init?(header: SensorFileHeader, version: UInt16) {
        guard header.sampleHz > 0, header.sampleCount > 0,
              let startedAt = ISO8601DateFormatters.parse(header.startedAt)
        else { return nil }
        formatVersion = Int(version)
        sampleHz = header.sampleHz
        channels = header.channels.isEmpty
            ? (version >= 2 ? SensorFileFormat.channels : SensorFileFormat.channelsV1)
            : header.channels
        // El servidor solo conoce estos dos modos; uno desconocido se registra como el
        // clásico antes que perder el archivo por un nombre.
        captureMode = SensorCaptureMode(rawValue: header.captureMode)?.rawValue ?? SensorCaptureMode.classic.rawValue
        watchModel = header.watchModel.map { String($0.prefix(64)) }
        wrist = header.wrist == "left" || header.wrist == "right" ? header.wrist : nil
        self.startedAt = startedAt
        durationS = Double(header.sampleCount) / header.sampleHz
    }

    func body(executionId: Int, storagePathname: String, byteSize: Int, consentVersion: String) -> Body {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return Body(
            executionId: executionId,
            storagePathname: storagePathname,
            byteSize: byteSize,
            formatVersion: formatVersion,
            sampleHz: sampleHz,
            channels: channels,
            captureMode: captureMode,
            watchModel: watchModel,
            wrist: wrist,
            durationS: durationS,
            startedAt: iso.string(from: startedAt),
            endedAt: iso.string(from: startedAt.addingTimeInterval(durationS)),
            consentVersion: consentVersion
        )
    }

    /// `POST /api/sync/sensor-capture` (`sensorCaptureRegisterSchema`).
    struct Body: Encodable, Equatable {
        let executionId: Int
        let storagePathname: String
        let byteSize: Int
        let formatVersion: Int
        let sampleHz: Double
        let channels: [String]
        let captureMode: String
        let watchModel: String?
        let wrist: String?
        let durationS: Double
        let startedAt: String
        let endedAt: String
        let consentVersion: String
    }
}
