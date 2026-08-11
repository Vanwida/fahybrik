import Foundation

// QUE LA CARRERA LLEGUE, AUNQUE NO HAYA COBERTURA.
//
// El problema: la traza cuelga de un `execution_id` que sólo existe DESPUÉS de que
// el servidor haya guardado la ejecución. Si el atleta termina en un valle sin línea,
// la ejecución se encola y ese id no llega hasta días después, dentro del replay.
// Sin un sitio donde esperar, la traza se perdería justo en el caso que más importa:
// la tirada larga lejos de casa.
//
// EL MECANISMO, EN TRES PASOS Y UNA INVARIANTE:
//
//   1. La traza se APARCA EN DISCO antes de tocar la red. Todavía no tiene id.
//   2. Se envía la ejecución. Si contesta, la traza coge su id y sube (y si el envío
//      de la traza falla por red, se encola con el cuerpo ya completo: a partir de
//      ahí es una petición normal, con los reintentos y la caducidad de siempre).
//      Si la ejecución se encoló, la traza se ATA a esa entrada y espera.
//   3. Cuando la cola entrega esa entrada, cuenta la respuesta (`RequestQueue`
//      guarda un acuse para eso) y la traza coge por fin su id.
//
// LA INVARIANTE, que es lo que se puede afirmar sin trampa: **la traza no se pierde
// salvo que se pierda también la sesión entera.** El único hueco es que la app muera
// DURANTE el envío de la ejecución — y en ese hueco la ejecución tampoco se ha
// guardado ni encolado, así que no hay sesión a la que colgar nada. No existe ningún
// caso en el que el entreno llegue y su traza no.
//
// Lo que sí se declara: pasadas 72 h aparcada (la misma ventana de replay que el
// resto de la cola) una traza sin resolver se tira. Un mes offline no se recupera, y
// preferimos decirlo a fingir que sí.

#if !os(watchOS)

/// Una traza esperando su `execution_id`.
struct ParkedTrace: Codable, Identifiable {
    let id: UUID
    /// La ejecución de la que cuelga, en cuanto se sabe cuál es. Se escribe en disco
    /// ANTES de intentar subirla: así, si la app muere entre saberlo y enviarlo, el
    /// barrido del siguiente arranque termina el trabajo en vez de perder la traza.
    var executionId: Int?
    /// La entrada de la cola cuya respuesta traerá el id. `nil` mientras el envío de
    /// la ejecución sigue en vuelo.
    var awaitingRequestId: UUID?
    let traces: [WorkoutTraceDTO]
    let createdAt: Date
}

/// El aparcamiento en disco. Mismo patrón que `RequestQueue` / `WorkoutStateStore`:
/// Application Support, escritura atómica, y un fallo de disco jamás tumba la app.
actor ParkedTraceStore {
    static let shared = ParkedTraceStore()

    /// La misma ventana de replay que la cola: lo que lleva más de esto esperando ya
    /// no le sirve a nadie.
    static let maxAge: TimeInterval = 72 * 3600

    private let fileURL: URL
    private var parked: [ParkedTrace] = []
    private var loaded = false

    init(filename: String = "parked-traces.json") {
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

    func park(_ traces: [WorkoutTraceDTO], at instant: Date = Date()) -> UUID {
        load()
        let entry = ParkedTrace(
            id: UUID(), executionId: nil, awaitingRequestId: nil,
            traces: traces, createdAt: instant
        )
        parked.append(entry)
        persist()
        return entry.id
    }

    func link(parkId: UUID, to requestId: UUID) {
        load()
        guard let index = parked.firstIndex(where: { $0.id == parkId }) else { return }
        parked[index].awaitingRequestId = requestId
        persist()
    }

    /// Sella la ejecución en disco y devuelve la traza ya lista para subir. Sellar
    /// ANTES de enviar es lo que convierte «lo perdimos» en «lo termina el barrido».
    func stamp(parkId: UUID, executionId: Int) -> ParkedTrace? {
        load()
        guard let index = parked.firstIndex(where: { $0.id == parkId }) else { return nil }
        parked[index].executionId = executionId
        persist()
        return parked[index]
    }

    func find(awaiting requestId: UUID) -> ParkedTrace? {
        load()
        return parked.first { $0.awaitingRequestId == requestId }
    }

    /// Lo que ya sabe de qué ejecución cuelga y sigue aquí: o el envío falló por red,
    /// o la app murió entre sellarlo y enviarlo. En ambos casos se reintenta.
    func resolvable() -> [ParkedTrace] {
        load()
        return parked.filter { $0.executionId != nil }
    }

    func remove(id: UUID) {
        load()
        parked.removeAll { $0.id == id }
        persist()
    }

    /// Todo lo aparcado, para inspeccionarlo.
    func all() -> [ParkedTrace] {
        load()
        return parked
    }

    /// Tira lo caducado. Se llama al arrancar y al volver a primer plano, con el
    /// mismo gesto que drena la cola.
    func purgeExpired(now: Date = Date()) {
        load()
        let cutoff = now.addingTimeInterval(-Self.maxAge)
        let before = parked.count
        parked.removeAll { $0.createdAt < cutoff }
        if parked.count != before { persist() }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let data = try? Data(contentsOf: fileURL) else { return }
        parked = (try? JSONDecoder().decode([ParkedTrace].self, from: data)) ?? []
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(parked)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            // Un fallo de disco no puede tumbar el guardado del entreno.
        }
    }
}

enum WorkoutTraceUploader {
    static let path = "/api/sync/workout-traces"

    /// Aparca la traza ANTES de intentar nada por red. Devuelve el resguardo con el
    /// que resolverla, o `nil` si no había nada que guardar (sesión sin sensores, o
    /// un registro «Ya lo hice» que nunca midió).
    static func park(_ traces: [WorkoutTraceDTO]) async -> UUID? {
        guard !traces.isEmpty else { return nil }
        return await ParkedTraceStore.shared.park(traces)
    }

    /// El envío de la ejecución se resolvió. O trajo el id —y la traza sube ya— o se
    /// encoló, y la traza se ata a esa entrada para cogerlo cuando llegue.
    ///
    /// Ninguna de las dos cosas: la ejecución se perdió (4xx determinista, o un 2xx
    /// con un cuerpo ilegible), así que no hay ejecución de la que colgar la traza y
    /// el resguardo se retira. Sin sesión no hay archivo que guardar.
    static func resolve(
        parkId: UUID?,
        executionId: Int?,
        queuedRequestId: UUID?,
        bearer: String?
    ) async {
        guard let parkId else { return }
        if let executionId {
            guard let entry = await ParkedTraceStore.shared.stamp(parkId: parkId, executionId: executionId)
            else { return }
            await send(entry, bearer: bearer)
            return
        }
        if let queuedRequestId {
            await ParkedTraceStore.shared.link(parkId: parkId, to: queuedRequestId)
            return
        }
        await ParkedTraceStore.shared.remove(id: parkId)
    }

    /// La cola entregó una ejecución que llevaba días esperando: aquí está lo que
    /// contestó el servidor. Si había una traza atada a esa entrada, ya tiene id.
    ///
    /// Idempotente a propósito — `RequestQueue` sólo borra el acuse DESPUÉS de que
    /// esto vuelva, así que una caída a media faena hace que se vuelva a contar. La
    /// traza se guarda por (ejecución, señal, fuente), así que repetirla actualiza la
    /// misma fila y nunca duplica.
    static func executionDelivered(requestId: UUID, responseBody: Data, bearer: String?) async {
        guard let entry = await ParkedTraceStore.shared.find(awaiting: requestId) else { return }
        guard let executionId = executionId(inResponse: responseBody) else {
            // El entreno se guardó pero la respuesta no dice de cuál: sin id no hay
            // dónde colgar la traza, y esperar más no la va a arreglar.
            await ParkedTraceStore.shared.remove(id: entry.id)
            return
        }
        _ = await ParkedTraceStore.shared.stamp(parkId: entry.id, executionId: executionId)
        // Encolar, no enviar: esto corre DENTRO del drenado de la cola, y una petición
        // anidada ahí sería una llamada de red dentro de otra. Encolada sube en la
        // misma pasada, porque el drenado da una segunda ronda justo para esto.
        guard let body = encoded(executionId: executionId, traces: entry.traces) else {
            await ParkedTraceStore.shared.remove(id: entry.id)
            return
        }
        await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
        await ParkedTraceStore.shared.remove(id: entry.id)
    }

    /// El barrido: termina lo que quedó a medias y tira lo caducado. Se llama con el
    /// mismo gesto que drena la cola — al arrancar y al volver a primer plano.
    ///
    /// Lo que recoge: una traza que ya sabe de qué ejecución cuelga pero sigue
    /// aparcada. O el envío falló por red y ni siquiera pudo encolarse, o la app murió
    /// entre sellar el id y enviarlo. En los dos casos el dato está entero en disco y
    /// sólo hace falta volver a intentarlo.
    static func sweep(bearer: String?) async {
        await ParkedTraceStore.shared.purgeExpired()
        for entry in await ParkedTraceStore.shared.resolvable() {
            await send(entry, bearer: bearer)
        }
    }

    // MARK: - Envío

    /// Sube la traza, y si falla por red la encola con el cuerpo ya completo — a
    /// partir de ahí es una petición normal de la cola, con sus reintentos y su
    /// caducidad. Un 4xx no se encola nunca: reintentarlo da exactamente el mismo
    /// error para siempre.
    ///
    /// El resguardo se retira al final pase lo que pase: o llegó, o la lleva la cola,
    /// o era un 4xx que va a dar el mismo error para siempre. Lo único que lo deja
    /// aparcado es que la app muera aquí en medio — y para eso está el barrido.
    private static func send(_ entry: ParkedTrace, bearer: String?) async {
        guard let executionId = entry.executionId,
              let body = encoded(executionId: executionId, traces: entry.traces) else {
            await ParkedTraceStore.shared.remove(id: entry.id)
            return
        }
        do {
            try await APIClient.shared.postJSONData(path: path, data: body, bearer: bearer)
        } catch {
            if RequestQueue.isRetriable(error) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
        await ParkedTraceStore.shared.remove(id: entry.id)
    }

    /// El cuerpo, codificado con un encoder pelado: las claves del DTO ya van en
    /// snake_case explícito, así que ninguna estrategia puede desincronizarlas.
    private static func encoded(executionId: Int, traces: [WorkoutTraceDTO]) -> Data? {
        guard !traces.isEmpty else { return nil }
        let payload = WorkoutTracesPayload(execution_id: executionId, traces: traces)
        return try? JSONEncoder().encode(payload)
    }

    /// Saca el `execution_id` de la respuesta de una ejecución. Viaja como texto y el
    /// endpoint de trazas lo pide numérico, así que la conversión se hace aquí, una
    /// vez — y si no es un entero positivo no se sube nada, antes que colgar la traza
    /// de una ejecución inventada.
    static func executionId(inResponse body: Data) -> Int? {
        guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        let raw = json["execution_id"]
        let value: Int?
        if let text = raw as? String { value = Int(text) } else { value = (raw as? NSNumber)?.intValue }
        guard let value, value > 0 else { return nil }
        return value
    }
}

#endif
