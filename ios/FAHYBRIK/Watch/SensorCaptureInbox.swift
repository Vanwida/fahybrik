import Foundation

// EL BUZÓN DEL MOVIMIENTO EN EL MÓVIL (DECISIONS 2026-09-25, «el subidor»).
//
// Cada entreno que el reloj lleva él solo deja un archivo con el movimiento de la
// muñeca (~3 MB por hora). Llega al móvil por `transferFile`, se copia aquí
// (`SensorFileReceiver`) y espera a que `SensorUploader` lo suba. Lo que se apunta de
// cada uno es lo mínimo para subirlo sin volver a preguntar a nadie:
//   · a qué ASIGNACIÓN pertenece — lo único que sabe el reloj; la ejecución la
//     resuelve el servidor, así que el orden entre el sobre del entreno y el archivo
//     deja de importar;
//   · de QUÉ ATLETA es — solo sube con su sesión;
//   · si los bytes YA están en el almacén — entonces solo falta registrarlos, y el
//     reintento no sube otra copia.

/// Un archivo de la muñeca esperando a subir.
struct SensorPendingCapture: Codable, Equatable {
    /// El fichero dentro del buzón. Por nombre y no por ruta: iOS puede mover el
    /// contenedor de la app al actualizarla.
    let fileName: String
    /// La asignación del entreno (`execution_local_id` en la metadata del reloj).
    let assignmentId: Int
    /// Quién tenía la sesión cuando llegó.
    let athleteId: String?
    let receivedAt: Date
    /// Los bytes ya están en el almacén; falta el registro. Los dos o ninguno.
    var executionId: Int?
    var storagePathname: String?

    var bytesUploaded: Bool { executionId != nil && storagePathname != nil }
}

/// Dónde vive la lista. `UserDefaults` como antes (es pequeña: un apunte por entreno);
/// los ficheros van en `SensorFileReceiver.inboxDirectory`.
struct SensorCaptureInbox {
    static let key = "fahybrik.sensor.inbox.v2"
    /// La lista de la fase 0: diccionarios sueltos con la ruta y la metadata del reloj.
    static let legacyKey = "fahybrik.sensor.pendingUploads.v1"

    /// Un archivo que en un mes no ha podido colgarse de su entreno ya no lo hará: el
    /// entreno no llegó al servidor (rechazado, o perdido con el móvil). Se tira para
    /// no ocupar ~3 MB por hora para siempre. Mecanismo, no método: ningún coach
    /// decide esto.
    static let maxAge: TimeInterval = 30 * 24 * 3600

    var defaults: UserDefaults = .standard

    func load(migratingFor athleteId: String? = AuthState.persistedAthleteId(), now: Date = Date()) -> [SensorPendingCapture] {
        if let legacy = defaults.array(forKey: Self.legacyKey) as? [[String: Any]] {
            var rows = decoded()
            for item in legacy {
                guard let row = Self.migrated(item, athleteId: athleteId, now: now),
                      !rows.contains(where: { $0.fileName == row.fileName })
                else { continue }
                rows.append(row)
            }
            save(rows)
            defaults.removeObject(forKey: Self.legacyKey)
            return rows
        }
        return decoded()
    }

    func save(_ rows: [SensorPendingCapture]) {
        guard let data = try? JSONEncoder().encode(rows) else { return }
        defaults.set(data, forKey: Self.key)
    }

    /// Apunta un archivo. Si ya había uno con el mismo nombre (el reloj lo mandó otra
    /// vez), el fichero en disco es el nuevo y lo subido del viejo ya no vale.
    func add(_ row: SensorPendingCapture) {
        var rows = load()
        rows.removeAll { $0.fileName == row.fileName }
        rows.append(row)
        save(rows)
    }

    func update(fileName: String, _ change: (inout SensorPendingCapture) -> Void) {
        var rows = load()
        guard let index = rows.firstIndex(where: { $0.fileName == fileName }) else { return }
        change(&rows[index])
        save(rows)
    }

    func remove(fileName: String) {
        var rows = load()
        rows.removeAll { $0.fileName == fileName }
        save(rows)
    }

    // MARK: - Reglas puras

    /// Lo de este atleta. Otra cuenta en el mismo teléfono no sube lo de nadie.
    static func mine(_ rows: [SensorPendingCapture], athleteId: String?) -> [SensorPendingCapture] {
        rows.filter { $0.athleteId == athleteId }
    }

    static func isExpired(_ row: SensorPendingCapture, now: Date) -> Bool {
        now.timeIntervalSince(row.receivedAt) > maxAge
    }

    /// El `execution_local_id` del reloj como asignación. Sin asignación el archivo no
    /// tiene de qué entreno colgarse (el reloj no guarda entrenos sin ella).
    static func assignmentId(fromMetadata raw: Any?) -> Int? {
        let value: Int?
        if let text = raw as? String {
            value = Int(text)
        } else {
            value = (raw as? NSNumber)?.intValue
        }
        guard let value, value > 0 else { return nil }
        return value
    }

    /// Un apunte de la fase 0. Sin asignación legible no se puede subir nunca: se
    /// descarta (su fichero lo barre `SensorFileReceiver.purge`).
    static func migrated(_ item: [String: Any], athleteId: String?, now: Date) -> SensorPendingCapture? {
        guard let path = item["path"] as? String,
              let assignmentId = assignmentId(fromMetadata: item["execution_local_id"])
        else { return nil }
        return SensorPendingCapture(
            fileName: URL(fileURLWithPath: path).lastPathComponent,
            assignmentId: assignmentId,
            athleteId: athleteId,
            receivedAt: now
        )
    }

    private func decoded() -> [SensorPendingCapture] {
        guard let data = defaults.data(forKey: Self.key),
              let rows = try? JSONDecoder().decode([SensorPendingCapture].self, from: data)
        else { return [] }
        return rows
    }
}
