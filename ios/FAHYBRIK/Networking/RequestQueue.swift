import Foundation

// Disk-backed FIFO queue for offline-first API submissions (onboarding submit,
// HealthKit sync batches, Apple auth callback). Each entry is a self-contained
// JSON envelope so we can replay regardless of in-memory state.
struct QueuedRequest: Codable, Identifiable {
    let id: UUID
    let path: String
    let bodyJson: Data
    let bearer: String?
    let createdAt: Date
    /// Un entreno terminado: si el servidor lo rechaza (4xx), no se tira — pasa a
    /// `rejected` (fase 1, «nada se pierde»). Opcional: las entradas escritas antes
    /// no lo llevan y siguen la regla de siempre.
    var keepOnReject: Bool? = nil
}

/// LO QUE EL SERVIDOR RECHAZÓ Y ERA DEL ATLETA. Una entrada con `keepOnReject` que
/// recibe un 4xx (que no es 401) no se tira: se guarda aquí, en la misma escritura
/// atómica que la saca de la cola, y quien pidió saberlo (`onRejection`) se entera.
/// Reintentarla no la arregla —por eso sale de la cola—, pero perderla falsea la
/// semana del atleta. Sin caducidad. El atleta lo ve como «Guardado en tu móvil» al
/// cerrar el resumen y como «Sin subir» en su historial (DECISIONS 2026-09-25).
///
/// Llega aquí por dos caminos, con la misma forma: al vaciar la cola (un GUARDAR
/// sin cobertura que luego se rechaza) y directamente desde el resumen, cuando el
/// primer envío ya vuelve con 4xx (`keepRejected`).
struct RejectedRequest: Codable, Identifiable {
    let request: QueuedRequest
    /// El código del rechazo. 0 = no se sabe (un fallo sin respuesta HTTP que tampoco
    /// se pudo encolar; no debería pasar).
    let status: Int
    let rejectedAt: Date
    /// Si ya se le contó a quien esperaba (`onRejection`).
    var told: Bool
    var id: UUID { request.id }
}

/// EL ACUSE DE UNA ENTREGA, guardado hasta que a quien le importaba se le ha dicho.
///
/// Existe por un caso concreto: la traza de una carrera necesita el `execution_id`
/// que sólo viene en la RESPUESTA del envío de la ejecución. Si esa ejecución se
/// encoló por falta de cobertura, la respuesta llega días después, dentro del
/// replay — y si la app muriera entre «entregado» y «avisado», el id se perdería y
/// la traza quedaría huérfana para siempre.
///
/// Por eso el acuse se escribe EN LA MISMA escritura atómica que borra la entrada:
/// tras cualquier caída, en disco está o la entrada (se reintenta) o el acuse (se
/// vuelve a avisar). Nunca ninguna de las dos, que es la única forma de perder algo.
struct DeliveryReceipt: Codable, Identifiable {
    let id: UUID
    let response: Data
    let deliveredAt: Date
}

/// El fichero de la cola. Antes era un array pelado de entradas; ahora lleva también
/// los acuses. `loadIfNeeded` acepta las dos formas, así que una app ya instalada con
/// entradas pendientes no las pierde al actualizar.
private struct QueueFile: Codable {
    var entries: [QueuedRequest]
    var receipts: [DeliveryReceipt]
    /// Opcional para leer los ficheros escritos antes de que existiera.
    var rejected: [RejectedRequest]?
}

actor RequestQueue {
    static let shared = RequestQueue()

    /// AUDIT — a 4xx is a DETERMINISTIC client error (bad request, 404 no_partner /
    /// not_found, 409): replaying it fails identically, so it must NOT enter the offline
    /// queue (it would sit there retrying forever). Only OFFLINE / network / server-5xx /
    /// timeout failures are transient and worth a replay. Every enqueue site gates on
    /// this. (A 2xx-with-bad-body `.decoding` is handled separately at the call site — the
    /// request SUCCEEDED, so it must never be replayed either.)
    nonisolated static func isRetriable(_ error: Error) -> Bool {
        if case APIError.http(let code, _) = error { return code >= 500 }
        return true
    }

    /// El código HTTP de un fallo, si lo trae (nil sin respuesta: sin red, timeout…).
    nonisolated static func httpStatus(_ error: Error) -> Int? {
        if case APIError.http(let code, _) = error { return code }
        return nil
    }

    /// Cómo se entrega una entrada. Es un punto de sustitución, no una capa: la única
    /// implementación real es `APIClient.shared`, y existe porque el camino que
    /// importa —una entrega que trae el `execution_id` del que cuelga la traza de una
    /// carrera guardada sin cobertura— no se puede comprobar de otra forma que
    /// fingiendo la respuesta del servidor.
    typealias Transport = @Sendable (_ path: String, _ body: Data, _ bearer: String?) async throws -> Data

    static let liveTransport: Transport = { path, body, bearer in
        try await APIClient.shared.postJSONData(path: path, data: body, bearer: bearer)
    }

    private let fileURL: URL
    private let transport: Transport
    private var entries: [QueuedRequest] = []
    private var receipts: [DeliveryReceipt] = []
    private var rejected: [RejectedRequest] = []
    private var loaded = false

    /// A quién se le cuenta que una entrada se entregó, con el cuerpo de su respuesta.
    /// Genérico a propósito: la cola no sabe qué es una traza, sólo que alguien pidió
    /// que le avisaran. Se instala una vez al arrancar la app (`AppShell`).
    private var deliveryObserver: (@Sendable (UUID, Data) async -> Void)?

    func onDelivery(_ observer: @escaping @Sendable (UUID, Data) async -> Void) {
        deliveryObserver = observer
    }

    /// A quién se le cuenta que una entrada con `keepOnReject` fue rechazada.
    private var rejectionObserver: (@Sendable (UUID) async -> Void)?

    func onRejection(_ observer: @escaping @Sendable (UUID) async -> Void) {
        rejectionObserver = observer
    }

    /// Cuántos acuses se guardan a la vez. Sin observador instalado no se escribe
    /// ninguno, así que este tope sólo acota un arranque raro en el que el observador
    /// tarde en aparecer; los más viejos se van antes que los recientes.
    private static let maxReceipts = 16

    init(filename: String = "request-queue.json", transport: @escaping Transport = RequestQueue.liveTransport) {
        self.transport = transport
        // Application Support is the canonical home; if the FS denies it
        // (sandbox edge cases, full disk), degrade to the temp dir so a queue
        // hiccup can never crash app launch.
        let dir: URL
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) {
            dir = support
        } else {
            dir = FileManager.default.temporaryDirectory
        }
        self.fileURL = dir.appendingPathComponent(filename)
    }

    /// LO QUE EL ATLETA HIZO NO CADUCA (fase 1, «nada se pierde»; auditoría: «los
    /// entrenos offline se tiran a las 72 h»). Antes una entrada de más de 72 h se
    /// tiraba sin decir nada, con la idea de no confundir la semana del coach. Pero el
    /// servidor coloca cada cosa por SU fecha (un entreno del viernes que llega el
    /// martes cae en el viernes): llegar tarde corrige la semana, perderlo la falsea.
    /// Solo sale de la cola lo entregado (2xx) o lo que el servidor rechaza por
    /// construcción (4xx que no es 401) — y eso queda en el registro técnico.
    ///
    /// Los ACUSES sí caducan: son avisos para quien esperaba la entrega (la traza que
    /// espera su `execution_id`), y pasado este plazo ya nadie los espera.
    private static let maxReceiptAge: TimeInterval = 7 * 24 * 3600

    /// Re-entrance guard: drain is fired from several places (launch, bearer
    /// change, foreground) and must never interleave two replay loops.
    private var draining = false

    /// Replays queued entries FIFO with the CURRENT session bearer (the stored
    /// one may have rotated or died since capture; a single-athlete device means
    /// the live token is always the right owner).
    ///
    /// This is the missing half of "offline-first": every feature enqueued its
    /// transient failures "for replay" but nothing ever drained the queue, so
    /// the file was durable capture with no delivery — data loss with extra
    /// steps (found 27-jul-2026 while tracing check-ins that never reached the
    /// server). Outcome per entry:
    ///   • 2xx → delivered, removed.
    ///   • deterministic 4xx (not 401) → poison, dropped (replaying forever
    ///     can't fix a bad request; matches the enqueue-side gate).
    ///   • 401 → the SESSION is dead, not the entry: stop, keep everything —
    ///     the next drain after re-auth delivers with the live token.
    ///   • offline / 5xx / timeout → transient: stop, keep order, retry on the
    ///     next drain.
    ///
    /// VARIAS RONDAS, no una. Avisar de una entrega puede ENCOLAR algo nuevo — la traza
    /// de una carrera, que estaba esperando el `execution_id` de la ejecución que
    /// acaba de subir. Con una sola ronda esa traza se quedaría en disco hasta el
    /// siguiente arranque; encadenando, sube en la misma pasada.
    ///
    /// El tope de rondas está para que un observador que encole sin parar no pueda
    /// dejar el bucle girando. Tres bastan para el único encadenado que existe
    /// (ejecución → acuse → traza → su propio acuse) y dejan el fichero limpio; algo
    /// más largo se espera al próximo drenado, sin perder nada.
    private static let maxRounds = 3

    func drain(bearer: String?) async {
        guard !draining else { return }
        draining = true
        defer { draining = false }

        await loadIfNeeded()
        for _ in 0..<Self.maxRounds {
            let delivered = await deliverEntries(bearer: bearer)
            // Los acuses se cuentan DESPUÉS de entregar, e incluyen los que quedaran
            // de una caída anterior — de ahí que la primera ronda ya los recoja.
            let told = await flushReceipts()
            await flushRejections()
            if !delivered && !told { break }
        }
    }

    /// Devuelve si entregó alguna entrada.
    @discardableResult
    private func deliverEntries(bearer: String?) async -> Bool {
        var delivered = false
        while let entry = entries.first {
            do {
                let response = try await transport(
                    entry.path,
                    entry.bodyJson,
                    bearer ?? entry.bearer
                )
                // UNA sola escritura atómica: la entrada desaparece y el acuse queda.
                // Separarlas es abrir la ventana en la que una caída pierde el id.
                DiagnosticsLog.shared.recordSave(.queueDelivered, path: entry.path, error: nil)
                entries.removeFirst()
                if deliveryObserver != nil {
                    receipts.append(
                        DeliveryReceipt(id: entry.id, response: response, deliveredAt: Date())
                    )
                    if receipts.count > Self.maxReceipts {
                        receipts.removeFirst(receipts.count - Self.maxReceipts)
                    }
                }
                persist()
                delivered = true
            } catch {
                if case APIError.http(let code, _) = error, (400..<500).contains(code) {
                    if code == 401 {
                        DiagnosticsLog.shared.recordSave(.queueFailed, path: entry.path, error: error, detail: "kept")
                        return delivered
                    }
                    entries.removeFirst()
                    if entry.keepOnReject == true {
                        // UNA escritura: sale de la cola y queda en los rechazados.
                        rejected.append(RejectedRequest(request: entry, status: code, rejectedAt: Date(), told: false))
                        DiagnosticsLog.shared.recordSave(.queueFailed, path: entry.path, error: error, detail: "rejected_kept")
                    } else {
                        DiagnosticsLog.shared.recordSave(.queueFailed, path: entry.path, error: error, detail: "dropped")
                    }
                    persist()
                    continue
                }
                DiagnosticsLog.shared.recordSave(.queueFailed, path: entry.path, error: error, detail: "kept")
                return delivered
            }
        }
        return delivered
    }

    /// Cuenta cada entrega pendiente y borra el acuse sólo DESPUÉS de que el
    /// observador haya vuelto. Devuelve si contó alguna, que es lo que decide si hace
    /// falta otra ronda de entregas.
    ///
    /// EL ORDEN ES EL PUNTO: avisar y luego borrar. Si la app muere durante el aviso,
    /// el acuse sigue en disco y el siguiente drain vuelve a contarlo. Eso exige que
    /// el observador sea idempotente — y lo es: la traza se guarda por (ejecución,
    /// señal, fuente), así que contarla dos veces actualiza la misma fila. Al revés
    /// (borrar y luego avisar) sería rápido y perdería el id en esa ventana.
    ///
    /// Un acuse caducado (`maxReceiptAge`) se tira: pasado ese plazo, quien lo
    /// esperaba ya no lo quiere.
    @discardableResult
    private func flushReceipts() async -> Bool {
        guard let observer = deliveryObserver, !receipts.isEmpty else { return false }
        var told = false
        while let receipt = receipts.first {
            if Date().timeIntervalSince(receipt.deliveredAt) <= Self.maxReceiptAge {
                await observer(receipt.id, receipt.response)
                told = true
            }
            receipts.removeAll { $0.id == receipt.id }
            persist()
        }
        return told
    }

    /// Cuenta cada rechazo guardado que nadie ha oído todavía; marca y guarda DESPUÉS
    /// de avisar (el mismo orden que `flushReceipts`, y por lo mismo: el observador
    /// es idempotente y una caída a medio aviso solo lo repite). El rechazado se
    /// queda: contarlo no lo resuelve.
    private func flushRejections() async {
        guard let observer = rejectionObserver else { return }
        for index in rejected.indices where !rejected[index].told {
            await observer(rejected[index].id)
            rejected[index].told = true
            persist()
        }
    }

    /// Lo rechazado que era del atleta, del más viejo al más nuevo.
    func rejectedRequests() async -> [RejectedRequest] {
        await loadIfNeeded()
        return rejected
    }

    /// UN RECHAZO QUE NO PASÓ POR LA COLA: el GUARDAR del resumen con cobertura, cuyo
    /// primer envío ya vuelve con 4xx. Antes el resumen se quedaba en REINTENTAR —y
    /// reintentar un 4xx da el mismo 4xx— con el entreno solo en memoria.
    ///
    /// Se guarda en el MISMO sitio y con la MISMA forma que un rechazo al vaciar la
    /// cola, para que el historial lo encuentre («Sin subir») venga por donde venga.
    /// `told: true` porque no hay nadie más a quien avisar: `onRejection` existe para
    /// los sobres del reloj que esperan su entrada de la cola, y este nunca la tuvo.
    ///
    /// `status` 0 = no se sabe (ver `RejectedRequest.status`).
    @discardableResult
    func keepRejected(path: String, body: Data, bearer: String?, status: Int = 0) async -> UUID {
        await loadIfNeeded()
        let request = QueuedRequest(
            id: UUID(),
            path: path,
            bodyJson: body,
            bearer: bearer,
            createdAt: Date(),
            keepOnReject: true
        )
        rejected.append(RejectedRequest(request: request, status: status, rejectedAt: Date(), told: true))
        persist()
        // Nosotros lo vemos en el registro técnico (DECISIONS 2026-09-25): el libre no
        // anota su rechazo en ningún otro sitio.
        DiagnosticsLog.shared.record(.save, .queueFailed, outcome: .failed,
                                     code: status > 0 ? status : nil,
                                     detail: "path=\(path) rejected_kept_direct")
        return request.id
    }

    /// Encola y devuelve el id de la entrada, que es con lo que quien encoló puede
    /// pedir que le cuenten su entrega (ver `onDelivery`). Descartable: casi todo el
    /// mundo encola y se olvida. `keepOnReject` es para lo que el atleta hizo (un
    /// entreno terminado): un rechazo del servidor lo guarda en vez de tirarlo.
    @discardableResult
    func enqueue(path: String, body: Data, bearer: String? = nil, keepOnReject: Bool = false) async -> UUID {
        await loadIfNeeded()
        let r = QueuedRequest(
            id: UUID(),
            path: path,
            bodyJson: body,
            bearer: bearer,
            createdAt: Date(),
            keepOnReject: keepOnReject ? true : nil
        )
        entries.append(r)
        persist()
        DiagnosticsLog.shared.record(.save, .queueEnqueued, detail: "path=\(path)")
        return r.id
    }

    func snapshot() async -> [QueuedRequest] {
        await loadIfNeeded()
        return entries
    }

    func remove(id: UUID) async {
        await loadIfNeeded()
        entries.removeAll { $0.id == id }
        persist()
    }

    /// Lee el fichero aceptando las DOS formas: la nueva (entradas + acuses) y la
    /// vieja (un array pelado de entradas). Sin ese apaño, actualizar la app con
    /// entradas pendientes las borraría — perder justo lo que la cola existe para no
    /// perder. La forma vieja se deja de escribir en el primer `persist`.
    private func loadIfNeeded() async {
        guard !loaded else { return }
        loaded = true
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        guard let data = try? Data(contentsOf: fileURL) else { return }
        if let file = try? JSONDecoder().decode(QueueFile.self, from: data) {
            entries = file.entries
            receipts = file.receipts
            rejected = file.rejected ?? []
        } else if let legacy = try? JSONDecoder().decode([QueuedRequest].self, from: data) {
            entries = legacy
        }
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(QueueFile(entries: entries, receipts: receipts, rejected: rejected))
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            // intentional swallow: a queue persist failure must not crash the app
        }
    }
}
