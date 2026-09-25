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
        // Quien ya dijo que no (en la hoja o en Perfil) no acumula en el móvil un
        // archivo de ~1 MB por hora que nunca va a salir: el temporal se va con el
        // retorno y no se copia. Sin contestar todavía sí se guarda — es lo que hace
        // que la hoja salga al abrir la app tras un entreno solo con el reloj.
        if SensorCaptureConsent.state.hasDeclined { return }
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
    ///
    /// SIN EL SÍ NO SALE NADA. El permiso se mira antes de empezar y otra vez antes de
    /// cada fichero: el atleta puede apagarlo en Perfil mientras esto sube, y desde
    /// ese toque no sale ni uno más. Mientras el sí (o la retirada) no ha llegado al
    /// servidor tampoco: el servidor contestaría 403 sin la versión en su fila, y con
    /// una retirada pendiente subir sería justo lo contrario de lo que se pidió.
    func drainPending(upload: @escaping (URL, [String: Any]) async throws -> Void) async {
        guard SensorCaptureConsent.canUpload else { return }
        var sent: Set<String> = []
        for item in loadPending() {
            guard SensorCaptureConsent.canUpload else { break }
            guard let url = Self.fileURL(of: item) else { continue }
            do {
                try await upload(url, item)
                try? FileManager.default.removeItem(at: url)
                sent.insert(url.lastPathComponent)
            } catch {
                continue
            }
        }
        // Se relee la lista en vez de guardar la que se leyó al empezar: lo que llegó
        // de la muñeca mientras se subía (o lo que se borró al retirar el permiso) no
        // se pisa con una foto vieja.
        savePending(loadPending().filter { item in
            guard let url = Self.fileURL(of: item) else { return false }
            return !sent.contains(url.lastPathComponent)
        })
    }

    /// Hay al menos un archivo de la muñeca esperando en el móvil. Es lo que dice que
    /// el atleta ya ha entrenado con el reloj aunque el móvil no viera el entreno.
    var hasPendingCaptures: Bool {
        loadPending().contains { Self.fileURL(of: $0) != nil }
    }

    /// Retirar el permiso borra también lo que espera en el móvil: nunca tuvo un sí
    /// que lo dejara salir, y es del atleta. Se vacía el buzón entero, no solo lo
    /// apuntado, para no dejar un fichero cuyo apunte aún no había llegado.
    func discardPending() {
        let fm = FileManager.default
        if let files = try? fm.contentsOfDirectory(at: Self.inboxDirectory, includingPropertiesForKeys: nil) {
            for file in files { try? fm.removeItem(at: file) }
        }
        savePending([])
    }

    /// El fichero de un apunte, si sigue en el buzón. Se busca POR NOMBRE dentro del
    /// buzón de hoy y no por la ruta absoluta guardada: iOS puede mover el contenedor
    /// de la app al actualizarla, y la ruta vieja apuntaría a un sitio que ya no existe.
    private static func fileURL(of item: [String: Any]) -> URL? {
        guard let path = item["path"] as? String else { return nil }
        let url = inboxDirectory.appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
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

// MARK: - Consent
//
// EL PERMISO PARA SUBIR EL MOVIMIENTO DEL RELOJ (DECISIONS 2026-09-25). El reloj
// graba siempre y cuenta en vivo diga el atleta lo que diga; lo único que depende
// del sí es que el archivo SALGA del móvil. Se pregunta una vez, en una hoja, tras
// el primer entreno grabado en la muñeca (`SensorConsentPrompt`), y se cambia en
// Perfil › Privacidad.
//
// Lo que decide el atleta vive aquí; lo que sabe el servidor, en
// `athletes.sensor_capture_consent_version`. Entre los dos hay un hueco (sin
// cobertura, la app muerta a medias) y lo cubren dos banderas persistidas que se
// reintentan al abrir y al volver a primer plano (`SensorConsentSync`):
//   · `pendingGrant`: el sí aún no ha llegado. El servidor rechaza toda subida sin
//     la versión en su fila, así que hasta que llegue no sale nada.
//   · `pendingWithdrawal`: la retirada aún no ha llegado. Retirar BORRA lo subido
//     (Alex, 25-09): es una promesa al atleta y se reintenta hasta que se cumple.
//
// Por atleta, como el import del histórico de Salud: otra cuenta en el mismo
// teléfono no hereda ni el sí, ni el «ya te lo pregunté», ni una retirada que
// habría que mandar con SU sesión.

/// El estado del permiso — valor puro, para probar la máquina sin red ni disco.
struct SensorConsentState: Codable, Equatable {
    /// La versión del texto a la que el atleta dijo que sí. Nil = no ha dicho que sí
    /// o lo retiró.
    var grantedVersion: String?
    /// Ya contestó, en la hoja o en Perfil. «Ahora no» cuenta: no se vuelve a preguntar.
    var asked = false
    /// El sí aún no está en el servidor.
    var pendingGrant = false
    /// La retirada (y el borrado de lo subido) aún no está en el servidor.
    var pendingWithdrawal = false
    /// Sube con cada decisión del atleta. Una respuesta del servidor solo cierra el
    /// sí que se mandó si nada ha cambiado desde que salió (ver `confirm`).
    var revision = 0

    private enum CodingKeys: String, CodingKey {
        case grantedVersion, asked, pendingGrant, pendingWithdrawal, revision
    }

    /// Lo que hay que contarle al servidor.
    enum Call: Equatable {
        case grant(version: String)
        case withdraw
    }

    func isGranted(current: String) -> Bool {
        grantedVersion == current
    }

    /// Contestó y no hay sí: «Ahora no» o el interruptor apagado.
    var hasDeclined: Bool {
        asked && grantedVersion == nil
    }

    /// Solo con el sí a ESTE texto y el servidor al día.
    func canUpload(current: String) -> Bool {
        isGranted(current: current) && !pendingGrant && !pendingWithdrawal
    }

    /// Hay que preguntar: nunca contestó. Quien dijo «Ahora no» no vuelve a ver la hoja.
    ///
    /// OJO al subir `currentVersion`: un sí a un texto anterior deja de valer (el
    /// servidor ya no lo acepta) y aquí NO se vuelve a preguntar solo. Qué hacer con
    /// ese atleta — preguntarle otra vez, y qué hace entonces «Ahora no» con lo que
    /// subió — está sin decidir y se decide con el cambio de texto.
    func needsAnswer(current: String) -> Bool {
        !asked
    }

    /// La próxima llamada, retirada primero: si el atleta apagó y volvió a encender
    /// sin cobertura, se cumple el borrado que pidió y después se da el sí nuevo.
    func nextCall(current: String) -> Call? {
        if pendingWithdrawal { return .withdraw }
        if pendingGrant, let grantedVersion, grantedVersion == current {
            return .grant(version: grantedVersion)
        }
        return nil
    }

    mutating func markAsked() {
        asked = true
    }

    mutating func grant(version: String) {
        guard grantedVersion != version else { return }
        grantedVersion = version
        pendingGrant = true
        revision += 1
    }

    /// Siempre manda la retirada, aunque el sí no llegara a salir: el DELETE es
    /// idempotente y es lo único que garantiza que en el servidor no queda nada.
    mutating func withdraw() {
        grantedVersion = nil
        pendingGrant = false
        pendingWithdrawal = true
        revision += 1
    }

    /// El servidor contestó 2xx a `call`, que salió con `revision`.
    ///
    /// La retirada se cierra siempre: mientras estuvo pendiente no subió nada, así que
    /// lo que borró el servidor es todo lo que había. El sí solo si nada cambió desde
    /// que salió: si en medio el atleta apagó y volvió a encender, el DELETE de ese
    /// apagado va detrás y hará falta otro PUT después.
    mutating func confirm(_ call: Call, revision sentAt: Int) {
        switch call {
        case .withdraw:
            pendingWithdrawal = false
        case .grant(let version):
            if sentAt == revision, grantedVersion == version { pendingGrant = false }
        }
    }
}

extension SensorConsentState {
    /// Tolerante a campos que falten: un campo nuevo en una versión futura no puede
    /// tirar lo que ya había (volver a preguntar a quien dijo «Ahora no», o perder
    /// una retirada pendiente).
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init()
        grantedVersion = try container.decodeIfPresent(String.self, forKey: .grantedVersion)
        asked = try container.decodeIfPresent(Bool.self, forKey: .asked) ?? false
        pendingGrant = try container.decodeIfPresent(Bool.self, forKey: .pendingGrant) ?? false
        pendingWithdrawal = try container.decodeIfPresent(Bool.self, forKey: .pendingWithdrawal) ?? false
        revision = try container.decodeIfPresent(Int.self, forKey: .revision) ?? 0
    }
}

/// Dónde vive el estado de cada atleta.
struct SensorConsentStore {
    static let keyPrefix = "fahybrik.sensor.consent.v2."
    /// Sin sesión (no debería pasar: la hoja y Perfil exigen sesión). Existe para que
    /// `load` nunca falle.
    static let anonymousKey = keyPrefix + "anon"

    let athleteId: String?
    var defaults: UserDefaults = .standard

    var key: String {
        guard let athleteId, !athleteId.isEmpty else { return Self.anonymousKey }
        return Self.keyPrefix + athleteId
    }

    func load() -> SensorConsentState {
        guard let data = defaults.data(forKey: key),
              let state = try? JSONDecoder().decode(SensorConsentState.self, from: data) else {
            return SensorConsentState()
        }
        return state
    }

    func save(_ state: SensorConsentState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }

    func update(_ change: (inout SensorConsentState) -> Void) {
        var state = load()
        change(&state)
        save(state)
    }
}

/// El permiso del atleta con sesión, leído y escrito en su sitio.
enum SensorCaptureConsent {
    /// Bump when the consent text changes; archive rows store this version. Tiene que
    /// ser la misma que `SENSOR_CAPTURE_CONSENT_VERSION` en el servidor
    /// (web/lib/sync/ingest-sensor-capture.ts) y que `VERSION_CONSENTIMIENTO` en el
    /// doble (consentimiento-sensores/texto.ts).
    static let currentVersion = "2026-09-25.v1"

    static var store: SensorConsentStore {
        SensorConsentStore(athleteId: AuthState.persistedAthleteId())
    }

    static var state: SensorConsentState { store.load() }

    /// El atleta dijo que sí a este texto (aunque aún no haya llegado al servidor).
    static var isGranted: Bool { state.isGranted(current: currentVersion) }

    /// Puede salir un archivo ahora mismo.
    static var canUpload: Bool { state.canUpload(current: currentVersion) }

    static var hasBeenAsked: Bool { state.asked }

    static var pendingGrant: Bool { state.pendingGrant }

    static var pendingWithdrawal: Bool { state.pendingWithdrawal }

    static func markAsked() {
        store.update { $0.markAsked() }
    }

    /// Da el sí (local). Lo lleva al servidor `SensorConsentSync`.
    static func grant() {
        store.update { $0.grant(version: currentVersion) }
    }

    /// Retira el sí (local). La retirada al servidor la lleva `SensorConsentSync`; el
    /// borrado de lo que espera en el móvil, `SensorConsentPrompt.setUpload`.
    static func revoke() {
        store.update { $0.withdraw() }
    }
}
