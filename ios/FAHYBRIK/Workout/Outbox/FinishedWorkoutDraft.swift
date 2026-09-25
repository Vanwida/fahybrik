import Foundation

// EL ENTRENO SE GUARDA AL TERMINAR, NO AL PULSAR «GUARDAR» (auditoría B-02; fase 1,
// «nada se pierde»).
//
// Tras «Terminar» el entreno vivía solo en memoria durante el resumen (RPE, notas,
// molestias) hasta que el servidor contestaba a GUARDAR. Si iOS mataba la app en
// ese rato —el atleta mira otra app, un cierre forzado, un fallo— el entreno se
// perdía entero. Es el modelo de Garmin o Strava: la actividad queda guardada al
// parar; subirla y revisarla son pasos aparte.
//
// Cómo: al aparecer el resumen se escribe en disco lo que se enviaría en ese momento
// (sin RPE aún). GUARDAR, con 2xx o encolado, lo borra. Si la app muere antes, el
// siguiente ARRANQUE lo pasa a la cola offline, que lo entrega. «Terminar» ya es la
// intención de guardar (descartar es ABANDONAR, que no pasa por aquí).
//
// Solo lo de un arranque ANTERIOR: el borrador lleva el id del proceso que lo
// escribió. El arranque de la app se repite en el mismo proceso (un cambio de token
// vuelve a lanzarlo) con el resumen todavía en pantalla, y encolar ese borrador
// —sin RPE— podría llegar después del GUARDAR bueno.
//
// Reenviar es seguro: el servidor trata un reenvío del mismo entreno como el mismo
// (una ejecución por sesión asignada; las de fuera del plan y las libres, por su
// hora de inicio).

enum FinishedWorkoutDraft {
    struct Draft: Codable, Equatable {
        let launchId: UUID
        let path: String
        let body: Data
        let stagedAt: Date
    }

    /// Este proceso. Un borrador con otro id es de un arranque anterior.
    static let launchId = UUID()

    static var defaultURL: URL {
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("finished-workout-draft.json")
    }

    /// El resumen ha aparecido: lo que se enviaría ahora queda en disco.
    static func stage(path: String, body: Data, at url: URL = defaultURL, launch: UUID = launchId) {
        let draft = Draft(launchId: launch, path: path, body: body, stagedAt: Date())
        guard let data = try? JSONEncoder().encode(draft) else { return }
        try? data.write(to: url, options: .atomic)
        DiagnosticsLog.shared.record(.save, .draftStaged, detail: "path=\(path) bytes=\(body.count)")
    }

    /// GUARDAR llegó al servidor o a la cola: el borrador ya no hace falta.
    static func clear(at url: URL = defaultURL) {
        try? FileManager.default.removeItem(at: url)
    }

    static func load(at url: URL = defaultURL) -> Draft? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Draft.self, from: data)
    }

    typealias Enqueue = @Sendable (_ path: String, _ body: Data, _ bearer: String?) async -> Void

    /// Al arrancar: un borrador de un proceso anterior es un entreno terminado que no
    /// llegó a GUARDAR. Pasa a la cola offline (que lo entrega) y se borra.
    @discardableResult
    static func recoverIntoQueue(
        bearer: String?,
        at url: URL = defaultURL,
        launch: UUID = launchId,
        enqueue: Enqueue = { path, body, bearer in
            // Un entreno terminado: si el servidor lo rechaza, se guarda, no se tira.
            await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer, keepOnReject: true)
        }
    ) async -> Bool {
        guard let draft = load(at: url), draft.launchId != launch else { return false }
        await enqueue(draft.path, draft.body, bearer)
        clear(at: url)
        let ageMinutes = Int(Date().timeIntervalSince(draft.stagedAt) / 60)
        DiagnosticsLog.shared.record(.save, .draftRecovered, outcome: .ok,
                                     detail: "path=\(draft.path) age_min=\(ageMinutes)")
        return true
    }
}
