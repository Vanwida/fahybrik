import Foundation
import WatchConnectivity

/// iPhone side of fase 0 archive delivery.
///
/// The watch finishes a session, writes the sensor file, and hands it over with
/// WCSession.transferFile. We park it on disk, then upload via the same
/// presigned-blob pattern as chat attachments — never through the API body.
@MainActor
final class SensorFileReceiver {
    static let shared = SensorFileReceiver()

    private let pendingKey = "fahybrik.sensor.pendingUploads.v1"

    /// El buzón en disco. `static` porque la recepción del fichero corre fuera del
    /// actor principal (ver `didReceive`) y necesita la ruta sin tocar el actor.
    nonisolated static let inboxDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent("sensor-captures", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private init() {}

    /// Called from WCSessionDelegate when a file arrives from the wrist.
    ///
    /// `nonisolated` A PROPÓSITO, y es un arreglo: WatchConnectivity BORRA el fichero
    /// del buzón temporal en cuanto el delegado retorna, así que la copia tiene que
    /// pasar dentro de la llamada. Estando esto aislado al actor principal, el
    /// delegado sólo podía invocarlo desde un `Task`, que corre DESPUÉS del retorno —
    /// es decir, la copia llegaba a un fichero que el sistema ya había borrado. Ahora
    /// se copia síncrono y sólo el apunte de pendientes salta al hilo principal.
    nonisolated func didReceive(file: WCSessionFile) {
        let meta = file.metadata ?? [:]
        let localId = (meta["execution_local_id"] as? String) ?? UUID().uuidString
        let dest = Self.inboxDirectory.appendingPathComponent("\(localId).fhsc")
        let src = file.fileURL
        do {
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: src, to: dest)
        } catch {
            // El fichero temporal se va con el retorno; no hay nada que reintentar.
            return
        }
        Task { @MainActor in
            self.enqueuePending(path: dest.path, meta: meta)
        }
    }

    /// Attempt to upload every parked capture that has an execution_id.
    func drainPending(upload: @escaping (URL, [String: Any]) async throws -> Void) async {
        let pending = loadPending()
        var remaining: [[String: Any]] = []
        for item in pending {
            guard let path = item["path"] as? String else { continue }
            let url = URL(fileURLWithPath: path)
            guard FileManager.default.fileExists(atPath: path) else { continue }
            do {
                try await upload(url, item)
                try? FileManager.default.removeItem(at: url)
            } catch {
                remaining.append(item)
            }
        }
        savePending(remaining)
    }

    // MARK: - pending store

    private func enqueuePending(path: String, meta: [String: Any]) {
        var items = loadPending()
        var row: [String: Any] = ["path": path]
        for (k, v) in meta { row[k] = v }
        items.append(row)
        savePending(items)
    }

    private func loadPending() -> [[String: Any]] {
        (UserDefaults.standard.array(forKey: pendingKey) as? [[String: Any]]) ?? []
    }

    private func savePending(_ items: [[String: Any]]) {
        UserDefaults.standard.set(items, forKey: pendingKey)
    }
}

// MARK: - Consent (local, until the profile surface ships)

enum SensorCaptureConsent {
    private static let key = "fahybrik.sensor.captureConsent.v1"
    /// Bump when the legal text changes; archive rows store this version.
    static let currentVersion = "2026-08-06.v1"

    static var isGranted: Bool {
        UserDefaults.standard.string(forKey: key) == currentVersion
    }

    static func grant() {
        UserDefaults.standard.set(currentVersion, forKey: key)
    }

    static func revoke() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
