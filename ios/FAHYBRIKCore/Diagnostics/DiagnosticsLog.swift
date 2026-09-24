import Foundation
import os

// EL REGISTRO TÉCNICO DEL APARATO — lo que el móvil y el reloj cuentan del enlace,
// de la sesión de entreno y de los guardados (DECISIONS 2026-09-24).
//
// Existe porque un «a veces no conecta» no dejaba rastro: el log del aparato se
// pierde al cerrarlo y el Xcode del gimnasio no está en cada entreno. Es la fase 0
// del diseño Watch-first: la primera prueba en aparato tiene que quedar registrada
// y leerse desde el servidor.
//
// DISCO ANTES QUE NADA. Cada evento se escribe en una línea de `events.jsonl` en
// Application Support en el momento en que pasa; enviarlo es otra cosa y viene
// después. El reloj se lo pasa al móvil (`transferUserInfo`, que el sistema entrega
// en orden aunque la app esté cerrada); el móvil lo sube a `/api/devices/events` y
// solo lo da por entregado con un 2xx. Un cierre inesperado a mitad de un envío no
// pierde nada: lo no confirmado se vuelve a mandar y el servidor descarta el repetido
// (atleta + instalación + seq).
//
// SOLO TÉCNICO (decisión de Alex): nombres de evento, estados, códigos de error y
// versiones. Nunca salud, ubicación, nombres ni notas en `detail`.
//
// Sin WatchConnectivity ni red aquí dentro: es disco y nada más, compartido por los
// dos targets; así lo que importa —que el evento aguanta— se prueba con tests.

struct DiagEvent: Codable, Equatable, Sendable {
    enum Device: String, Codable, Sendable { case phone, watch }
    enum Kind: String, Codable, Sendable { case link, session, save, lifecycle, diagnostic }
    enum Outcome: String, Codable, Sendable { case ok, failed }

    var installId: UUID
    var seq: Int64
    var device: Device
    var kind: Kind
    var name: String
    /// ISO 8601 con milisegundos: el orden fino entre los dos aparatos importa (la
    /// prueba T1 mide del toque en Empezar al primer frame en la muñeca).
    var at: String
    var workoutId: UUID?
    var outcome: Outcome?
    var code: Int?
    var domain: String?
    var detail: String?
    var appVersion: String?
    var appBuild: String?
    var osVersion: String?
    var deviceModel: String?
}

final class DiagnosticsLog: @unchecked Sendable {

    #if os(watchOS)
    static let shared = DiagnosticsLog(device: .watch)
    #else
    static let shared = DiagnosticsLog(device: .phone)
    #endif

    /// Lo que se guarda en el aparato. Más que esto no hace falta para diagnosticar
    /// (un entreno deja decenas) y el fichero no puede crecer sin techo.
    static let keepLast = 2000
    static let compactAt = 2500
    static let maxDetail = 300

    private struct State: Codable {
        var installId: UUID
        var nextSeq: Int64
        /// Por instalación, el último seq ya entregado (subido en el móvil, pasado al
        /// sistema en el reloj). Las del reloj viven en el log del móvil con su propio id.
        var delivered: [String: Int64]
    }

    let device: DiagEvent.Device
    let directory: URL
    private let queue = DispatchQueue(label: "diagnostics.log")
    private var state: State
    private var lineCount: Int?
    private let clock: () -> Date
    private static let logger = Logger(subsystem: Marca.subsistemaLog("diag"), category: "events")

    private var eventsURL: URL { directory.appendingPathComponent("events.jsonl") }
    private var stateURL: URL { directory.appendingPathComponent("state.json") }
    private var markerURL: URL { directory.appendingPathComponent("running.json") }

    init(device: DiagEvent.Device, directoryName: String = "diagnostics", clock: @escaping () -> Date = Date.init) {
        self.device = device
        self.clock = clock
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent(directoryName, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("state.json")
        if let data = try? Data(contentsOf: url), let saved = try? JSONDecoder().decode(State.self, from: data) {
            state = saved
        } else {
            state = State(installId: UUID(), nextSeq: 0, delivered: [:])
        }
    }

    var installId: UUID { queue.sync { state.installId } }

    // MARK: - Escribir

    /// Anota un evento de ESTE aparato. Vuelve enseguida; el disco se escribe en orden
    /// en la cola del registro.
    func record(
        _ kind: DiagEvent.Kind,
        _ name: DiagName,
        workoutId: UUID? = nil,
        outcome: DiagEvent.Outcome? = nil,
        code: Int? = nil,
        domain: String? = nil,
        detail: String? = nil
    ) {
        let at = clock()
        queue.async {
            let event = DiagEvent(
                installId: self.state.installId,
                seq: self.state.nextSeq,
                device: self.device,
                kind: kind,
                name: name.rawValue,
                at: DiagnosticsLog.stamp(at),
                workoutId: workoutId,
                outcome: outcome,
                code: code,
                domain: domain,
                detail: detail.map { String($0.prefix(Self.maxDetail)) },
                appVersion: AppBundleMetadata.marketingVersion,
                appBuild: AppBundleMetadata.buildNumber,
                osVersion: DiagnosticsLog.osVersion,
                deviceModel: DiagnosticsLog.deviceModel
            )
            self.state.nextSeq += 1
            self.saveState()
            self.append([event])
            // Al log del aparato también (Xcode / Consola), en público: solo es técnico.
            let line = [kind.rawValue, name.rawValue, outcome?.rawValue ?? "", code.map { String($0) } ?? "",
                        domain ?? "", event.detail ?? ""].joined(separator: " ")
            Self.logger.info("\(line, privacy: .public)")
        }
    }

    /// Anota un error de Apple o de red con su dominio y código.
    func record(_ kind: DiagEvent.Kind, _ name: DiagName, workoutId: UUID? = nil, error: Error?, detail: String? = nil) {
        guard let error else {
            record(kind, name, workoutId: workoutId, outcome: .ok, detail: detail)
            return
        }
        let ns = error as NSError
        record(kind, name, workoutId: workoutId, outcome: .failed, code: ns.code, domain: ns.domain,
               detail: detail ?? ns.localizedDescription)
    }

    /// Los eventos del reloj que llegan al móvil: se guardan tal cual, con su
    /// instalación y su seq, para subirlos con los propios.
    func ingest(_ events: [DiagEvent]) {
        guard !events.isEmpty else { return }
        queue.async { self.append(events) }
    }

    // MARK: - Entregar

    /// Lo que falta por entregar, en orden por instalación y seq.
    func pending(limit: Int) -> [DiagEvent] {
        queue.sync {
            readAll()
                .filter { $0.seq > (state.delivered[$0.installId.uuidString] ?? -1) }
                .sorted { ($0.installId.uuidString, $0.seq) < ($1.installId.uuidString, $1.seq) }
                .prefix(limit)
                .map { $0 }
        }
    }

    /// El lote ya está en el otro lado: no se vuelve a mandar.
    func markDelivered(_ events: [DiagEvent]) {
        guard !events.isEmpty else { return }
        queue.sync {
            for e in events {
                let key = e.installId.uuidString
                state.delivered[key] = max(state.delivered[key] ?? -1, e.seq)
            }
            saveState()
        }
    }

    /// El sistema no pudo entregar un lote que ya se dio por pasado (en el reloj,
    /// `didFinish userInfoTransfer` con error): vuelve a estar pendiente.
    func markUndelivered(_ events: [DiagEvent]) {
        guard !events.isEmpty else { return }
        queue.sync {
            for (install, group) in Dictionary(grouping: events, by: { $0.installId.uuidString }) {
                guard let first = group.map(\.seq).min() else { continue }
                state.delivered[install] = min(state.delivered[install] ?? -1, first - 1)
            }
            saveState()
        }
    }

    /// Cuántos faltan por entregar (la cabecera de la pantalla de diagnóstico).
    func pendingCount() -> Int { pending(limit: Int.max).count }

    /// Lo último, más reciente primero: la pantalla «Diagnóstico del reloj».
    func recent(limit: Int) -> [DiagEvent] {
        queue.sync { Array(readAll().sorted { $0.at > $1.at }.prefix(limit)) }
    }

    // MARK: - Salida no limpia

    /// Hay una sesión de entreno en marcha en este aparato. Si la app muere sin
    /// `markStopped()`, el siguiente arranque lo cuenta (`reportUncleanExit`). En el
    /// reloj es la ÚNICA pista de un cierre: MetricKit no existe en watchOS.
    func markRunning(workoutId: UUID?, role: String) {
        let body = RunningMarker(workoutId: workoutId, role: role, since: DiagnosticsLog.stamp(clock()))
        queue.async {
            if let data = try? JSONEncoder().encode(body) { try? data.write(to: self.markerURL, options: .atomic) }
        }
    }

    func markStopped() {
        queue.async { try? FileManager.default.removeItem(at: self.markerURL) }
    }

    /// Al arrancar: si la marca sigue ahí, la sesión anterior no terminó limpia.
    func reportUncleanExit() {
        let marker: RunningMarker? = queue.sync {
            guard let data = try? Data(contentsOf: markerURL) else { return nil }
            try? FileManager.default.removeItem(at: markerURL)
            return try? JSONDecoder().decode(RunningMarker.self, from: data)
        }
        guard let marker else { return }
        record(.lifecycle, .uncleanExit, workoutId: marker.workoutId, outcome: .failed,
               detail: "role=\(marker.role) since=\(marker.since)")
    }

    private struct RunningMarker: Codable {
        var workoutId: UUID?
        var role: String
        var since: String
    }

    // MARK: - Disco (siempre en `queue`)

    private func append(_ events: [DiagEvent]) {
        let encoder = JSONEncoder()
        var blob = Data()
        for e in events {
            guard let line = try? encoder.encode(e) else { continue }
            blob.append(line)
            blob.append(0x0A)
        }
        if let handle = try? FileHandle(forWritingTo: eventsURL) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: blob)
        } else {
            try? blob.write(to: eventsURL, options: .atomic)
        }
        // Lo ya escrito se cuenta una vez al leer el fichero; luego se lleva la cuenta.
        let count: Int
        if let known = lineCount {
            count = known + events.count
        } else {
            count = readAll().count
        }
        lineCount = count
        if count > Self.compactAt { compact() }
    }

    private func readAll() -> [DiagEvent] {
        guard let data = try? Data(contentsOf: eventsURL) else { return [] }
        let decoder = JSONDecoder()
        return data.split(separator: 0x0A).compactMap { try? decoder.decode(DiagEvent.self, from: Data($0)) }
    }

    private func compact() {
        let kept = Array(readAll().suffix(Self.keepLast))
        let encoder = JSONEncoder()
        var blob = Data()
        for e in kept {
            guard let line = try? encoder.encode(e) else { continue }
            blob.append(line)
            blob.append(0x0A)
        }
        try? blob.write(to: eventsURL, options: .atomic)
        lineCount = kept.count
    }

    private func saveState() {
        if let data = try? JSONEncoder().encode(state) { try? data.write(to: stateURL, options: .atomic) }
    }

    // MARK: - Sellos

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func stamp(_ date: Date) -> String { isoFormatter.string(from: date) }

    static let osVersion: String = {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }()

    /// El identificador de hardware (`iPhone17,1`, `Watch7,5`): dice el modelo sin
    /// decir nada de la persona.
    static let deviceModel: String = {
        var info = utsname()
        uname(&info)
        let size = MemoryLayout.size(ofValue: info.machine)
        return withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: size) { String(cString: $0) }
        }
    }()
}
