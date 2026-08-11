import Foundation
import Observation

// EL HISTÓRICO DE APPLE SALUD — un barrido hacia atrás, con permiso y con memoria.
//
// POR QUÉ HACE FALTA UN CAMINO APARTE. El ancla de HealthKit marca la INSERCIÓN en
// el almacén, no la fecha de la muestra. Todo lo que YA estaba dentro cuando se creó
// el ancla no vuelve nunca por una consulta anclada: por eso hoy reconectar no
// rellena el pasado, y por eso la primera sincronización se queda en los 30 días que
// le pone su predicado de fecha. El import no toca los anclas — recorre VENTANAS DE
// FECHA hacia atrás, que es la única pregunta que devuelve lo viejo.
//
// LAS TRES REGLAS QUE LO GOBIERNAN:
//
//   1. CONSENTIMIENTO EXPLÍCITO, UN TOQUE, JAMÁS AUTOMÁTICO. Nadie se trae dos años
//      de la vida de nadie porque sí. `consentAndStart()` es el ÚNICO sitio del
//      código que escribe el consentimiento, y sólo lo llama un dedo.
//   2. NI SE RE-PREGUNTA NI SE OLVIDA. El consentimiento y el cursor sobreviven a
//      desconectar, reconectar y cerrar la app. Reanudar lo ya consentido no es
//      auto-conectar: es terminar lo que el atleta ya dijo que sí.
//   3. TECHO DECLARADO. Dos años, dicho en la propia tarjeta. Un import "hasta el
//      principio de los tiempos" no se puede prometer ni medir.
//
// LOS CORTES CAEN A MEDIODÍA, A PROPÓSITO. Una noche de sueño nunca cruza el
// mediodía, así que ninguna ventana parte un sueño en dos mitades que subirían como
// dos noches distintas (y se sumarían mal río abajo).

// MARK: - Estado persistido

/// Lo que hay que recordar entre lanzamientos para que el import sea reanudable.
/// Vive en el dispositivo, como los anclas: HealthKit sólo se lee desde el teléfono,
/// así que un espejo en el servidor nunca podría ser la verdad.
struct HealthHistoryImportState: Codable, Equatable {
    /// Cuándo dijo que sí. `nil` = nunca se ha ofrecido o nunca lo aceptó.
    var consentedAt: Date?
    /// Límite superior del barrido, congelado al arrancar. Lo de después ya lo cubre
    /// la sincronización viva, así que mover la cabeza sólo repetiría trabajo.
    var head: Date?
    /// Hasta dónde se baja. Se congela con la cabeza para que la barra de progreso
    /// no cambie de longitud a mitad de camino.
    var floor: Date?
    /// Límite inferior de la última ventana COMPLETAMENTE subida. `nil` = sin empezar.
    var cursor: Date?
    /// Cuándo se llegó al suelo.
    var completedAt: Date?

    static let empty = HealthHistoryImportState()

    var hasConsent: Bool { consentedAt != nil }
    var isComplete: Bool { completedAt != nil }
    /// Consentido, sin terminar: hay trabajo que reanudar.
    var isPending: Bool { hasConsent && !isComplete }
}

// MARK: - El plan (puro)

/// El reparto en ventanas, sin HealthKit, sin red y sin reloj: dadas la cabeza, el
/// suelo y el tamaño de lote, dice cuál es la siguiente ventana y cuánto se lleva
/// hecho. Es la pieza que se puede probar entera.
struct HealthHistoryImportPlan: Equatable {
    let head: Date
    let floor: Date
    let windowDays: Int

    /// La siguiente ventana a subir, `[start, end)`, dado el cursor actual
    /// (`nil` = no se ha empezado). Devuelve `nil` cuando ya no queda pasado.
    func nextWindow(after cursor: Date?) -> DateInterval? {
        // Un cursor por debajo del suelo (el suelo se acortó entre versiones) no
        // reabre trabajo: lo hecho, hecho está.
        let upper = min(cursor ?? head, head)
        guard upper > floor else { return nil }
        let lower = max(floor, upper.addingTimeInterval(-Double(windowDays) * 86_400))
        guard lower < upper else { return nil }
        return DateInterval(start: lower, end: upper)
    }

    /// Fracción del tramo ya cubierta, 0…1.
    func progress(cursor: Date?) -> Double {
        let total = head.timeIntervalSince(floor)
        guard total > 0 else { return 1 }
        let done = head.timeIntervalSince(min(cursor ?? head, head))
        return min(1, max(0, done / total))
    }
}

// MARK: - Persistencia

/// Guarda el estado del import en `UserDefaults`, UNA CLAVE POR ATLETA. Sin el
/// atleta en la clave, un teléfono que cambia de cuenta le diría al nuevo que su
/// histórico ya está importado y no volvería a ofrecérselo nunca.
enum HealthHistoryImportStore {
    static let keyPrefix = "fahybrik.hk.history_import."
    /// Clave para el dispositivo sin sesión (no debería usarse: el import se ofrece
    /// dentro de Perfil, que exige sesión). Existe para que `load` nunca falle.
    static let anonymousKey = keyPrefix + "anon"

    static func key(athleteId: String?) -> String {
        guard let athleteId, !athleteId.isEmpty else { return anonymousKey }
        return keyPrefix + athleteId
    }

    static func load(athleteId: String?, defaults: UserDefaults = .standard) -> HealthHistoryImportState {
        guard let data = defaults.data(forKey: key(athleteId: athleteId)),
              let state = try? JSONDecoder().decode(HealthHistoryImportState.self, from: data) else {
            return .empty
        }
        return state
    }

    static func save(
        _ state: HealthHistoryImportState,
        athleteId: String?,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key(athleteId: athleteId))
    }
}

// MARK: - La fuente

/// Lo que el importador necesita del mundo real: subir todo lo que HealthKit guarde
/// en una ventana. Un protocolo para que el motor (consentimiento, cursor, ventanas,
/// progreso) se pruebe sin HealthKit y sin red.
protocol HealthHistoryWindowImporting: AnyObject {
    func importHistoryWindow(from: Date, to: Date) async throws
}

/// Por qué se paró un barrido. Todas dejan el cursor intacto: reanudar retoma la
/// ventana que se quedó a medias, y el servidor de-duplica lo que ya subió.
enum HealthHistoryImportError: Error, Equatable {
    /// El dispositivo no tiene HealthKit (simulador, iPad).
    case unavailable
    /// El lote no llegó a salir: se encoló para cuando vuelva la red. Seguir sería
    /// llenar la cola de meses de lotes que nadie va a poder entregar.
    case offline
    /// La sesión está muerta. La app ya está echando al atleta a la pantalla de
    /// entrar; subir dos años contra un token caducado no arregla nada.
    case unauthorized
    /// El servidor rechazó el lote de forma determinista (4xx). Reintentar da igual.
    case rejected
}

// MARK: - El importador

@MainActor
@Observable
final class HealthKitHistoryImporter {
    static let shared = HealthKitHistoryImporter()

    /// TECHO DECLARADO: dos años. Cubre dos temporadas completas —el «antes» que
    /// hace falta para comparar— sin prometer un pasado que ni el reloj ni el
    /// teléfono suelen tener. Se dice en la tarjeta, no se esconde en el código.
    static let floorDays = 730

    /// Tamaño de lote del barrido. Noventa días es el equilibrio: pocas ventanas que
    /// persistir (ocho por año) y una cantidad de muestras por ventana que cabe en
    /// memoria antes de trocearse en páginas de subida.
    static let windowDays = 90

    /// Respiro entre ventanas, para no monopolizar ni el disco de HealthKit ni la
    /// API mientras el atleta usa la app.
    static let defaultPauseBetweenWindows: Duration = .milliseconds(300)

    private let source: HealthHistoryWindowImporting
    private let pauseBetweenWindows: Duration
    private let defaults: UserDefaults
    private var athleteId: String?
    private var task: Task<Void, Never>?
    /// Sube con cada arranque y con cada parada, para que la limpieza final de un
    /// barrido viejo no pise el estado del que venga después.
    private var generation = 0

    private(set) var state: HealthHistoryImportState
    /// Un barrido en curso.
    private(set) var running = false
    /// El año que se está subiendo ahora mismo («2024»), para el «importando 2024…».
    private(set) var currentYear: String?
    /// Por qué se paró el último intento, en palabras del atleta. `nil` si no falló.
    private(set) var lastError: String?

    init(
        source: HealthHistoryWindowImporting = HealthKitHistoryWindowReader.shared,
        athleteId: String? = AuthState.persistedAthleteId(),
        defaults: UserDefaults = .standard,
        pauseBetweenWindows: Duration = HealthKitHistoryImporter.defaultPauseBetweenWindows
    ) {
        self.source = source
        self.pauseBetweenWindows = pauseBetweenWindows
        self.defaults = defaults
        self.athleteId = athleteId
        self.state = HealthHistoryImportStore.load(athleteId: athleteId, defaults: defaults)
    }

    /// Vuelve a leer el estado del atleta en sesión. El singleton nace antes de que
    /// haya sesión, así que sin esto se quedaría mirando la clave anónima para
    /// siempre. Lo llama la tarjeta al aparecer.
    func rebind(athleteId: String?) {
        guard athleteId != self.athleteId else { return }
        // CAMBIÓ EL ATLETA: lo que estuviera barriendo es el pasado de OTRA persona,
        // y el lote se sube con el bearer que tenga la sesión en ese momento. Se corta
        // antes de tocar nada, que si no el histórico de quien se fue acabaría subido
        // a la cuenta de quien entra.
        stop()
        self.athleteId = athleteId
        state = HealthHistoryImportStore.load(athleteId: athleteId, defaults: defaults)
        lastError = nil
    }

    /// Fracción hecha, 0…1. Sin plan (nunca arrancó) es 0.
    var progress: Double {
        guard let plan = plan else { return state.isComplete ? 1 : 0 }
        return plan.progress(cursor: state.cursor)
    }

    /// Hasta qué fecha llegó el barrido. Es lo que se le enseña al terminar.
    var reachedBack: Date? { state.cursor }

    private var plan: HealthHistoryImportPlan? {
        guard let head = state.head, let floor = state.floor else { return nil }
        return HealthHistoryImportPlan(head: head, floor: floor, windowDays: Self.windowDays)
    }

    // MARK: Arranque

    /// EL TOQUE. Único sitio del código que concede el consentimiento, y sólo lo
    /// llama el botón de la tarjeta. Congela la cabeza y el suelo del barrido y
    /// arranca.
    func consentAndStart(now: Date = Date()) {
        guard !running else { return }
        var next = state
        if next.consentedAt == nil { next.consentedAt = now }
        if next.head == nil { next.head = Self.noonBoundary(onOrBefore: now) }
        if next.floor == nil {
            next.floor = (next.head ?? now).addingTimeInterval(-Double(Self.floorDays) * 86_400)
        }
        persist(next)
        run()
    }

    /// Retoma un import ya consentido que se quedó a medias — al reconectar Apple
    /// Salud, al abrir la app o al volver a la tarjeta. NO concede consentimiento y
    /// NO pregunta nada: si nadie dijo que sí, no hace absolutamente nada.
    func resumeIfConsented() {
        guard state.isPending, !running else { return }
        run()
    }

    /// El punto de entrada de los caminos AUTOMÁTICOS (arranque de la app y
    /// reconexión de Apple Salud), que no saben qué atleta hay en sesión: el
    /// singleton nace antes que la sesión, así que sin este enganche miraría para
    /// siempre la clave anónima y no reanudaría nada.
    static func resumeForCurrentAthlete() {
        let importer = shared
        importer.rebind(athleteId: AuthState.persistedAthleteId())
        importer.resumeIfConsented()
    }

    /// Para el barrido donde esté. El cursor queda en la última ventana entera, así
    /// que continuar retoma exactamente ahí.
    func stop() {
        task?.cancel()
        task = nil
        // Invalida el barrido en curso: su limpieza final ya no puede apagarle la
        // luz a un barrido posterior que el atleta arranque acto seguido.
        generation += 1
        running = false
        currentYear = nil
    }

    private func run() {
        guard plan != nil, !running else { return }
        running = true
        lastError = nil
        generation += 1
        let mine = generation
        task = Task { [weak self] in await self?.sweep(generation: mine) }
    }

    private func sweep(generation mine: Int) async {
        defer {
            if generation == mine {
                running = false
                currentYear = nil
                task = nil
            }
        }
        guard let plan = plan else { return }
        while !Task.isCancelled {
            guard let window = plan.nextWindow(after: state.cursor) else {
                var done = state
                done.completedAt = Date()
                persist(done)
                return
            }
            currentYear = Self.yearLabel(for: window.start)
            do {
                try await source.importHistoryWindow(from: window.start, to: window.end)
            } catch {
                lastError = Self.message(for: error)
                return
            }
            // El cursor sólo baja cuando la ventana ENTERA subió. Si se corta a
            // mitad, se repite esa ventana al reanudar y el servidor de-duplica.
            var advanced = state
            advanced.cursor = window.start
            persist(advanced)
            try? await Task.sleep(for: pauseBetweenWindows)
        }
    }

    private func persist(_ next: HealthHistoryImportState) {
        state = next
        HealthHistoryImportStore.save(next, athleteId: athleteId, defaults: defaults)
    }

    // MARK: Etiquetas

    static func yearLabel(for date: Date) -> String {
        String(Calendar.current.component(.year, from: date))
    }

    /// El mediodía de ese día (o el anterior si aún no ha llegado), que es donde
    /// caen todos los cortes de ventana.
    static func noonBoundary(onOrBefore date: Date) -> Date {
        let calendar = Calendar.current
        guard let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: date) else {
            return date
        }
        return noon <= date ? noon : calendar.date(byAdding: .day, value: -1, to: noon) ?? noon
    }

    /// El fallo, en palabras del atleta: qué pasó y qué puede hacer.
    static func message(for error: Error) -> String {
        switch error {
        case HealthHistoryImportError.offline:
            return "Se cortó la conexión. Seguimos donde lo dejamos cuando vuelvas a tener red."
        case HealthHistoryImportError.unauthorized:
            return "Tu sesión ha caducado. Vuelve a entrar y seguimos."
        case HealthHistoryImportError.unavailable:
            return "Este dispositivo no tiene Apple Salud."
        default:
            return "No pudimos seguir importando. Inténtalo de nuevo."
        }
    }
}
