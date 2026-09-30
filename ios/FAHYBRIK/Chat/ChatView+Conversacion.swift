import SwiftUI
import UIKit

// LA CONVERSACIÓN — de dónde sale lo que se pinta.
//
// Cache-first / SWR: el historial vive en el `AppDataStore` compartido (`chatMessages` + `chatThread`). Abrir el chat
// pinta la conversación cacheada AL INSTANTE desde el almacén (sin esqueleto si hay copia; sólo en la primera carga en
// frío) y el stream SSE de `ChatService` va encima en tiempo real. Cada mensaje canónico (llegado por SSE o el propio
// enviado y confirmado) se pliega de vuelta en la caché del almacén, así que la próxima apertura es instantánea y sin
// red se ve el último intercambio. Aquí: sembrar desde caché, cargar, el bucle en vivo, reconciliar con lo optimista y
// atribuir cada mensaje a quien lo escribió.

extension ChatView {

    // MARK: - Flujo de datos

    /// La conversación a pintar. Prefiere la copia de trabajo viva (`messages`) y cae al historial cacheado del
    /// almacén, para que el PRIMER fotograma — antes de que `seedFromCache` lo copie a `messages` — ya enseñe la
    /// conversación cacheada y no un destello de esqueleto.
    var displayMessages: [ChatMessage] {
        if !messages.isEmpty { return messages }
        if let cached = store.chatMessages.value { return cached.map { mapDTO($0) } }
        return []
    }

    /// Pinta la conversación cacheada AL INSTANTE desde el almacén compartido, antes de tocar la red (cache-first).
    /// Sólo siembra la copia de trabajo si está vacía (una reconexión al enviar el primer mensaje re-lanza el `.task`
    /// pero conserva la lista viva). Resuelve el nombre del coach del sobre del hilo ya calentado. Si el historial
    /// ya se cargó (aunque venga legítimamente vacío) se acaba el esqueleto en frío.
    @MainActor
    func seedFromCache() {
        if coachName == nil { coachName = cachedCoachName() }
        guard messages.isEmpty else { return }
        if let cached = store.chatMessages.value, !cached.isEmpty {
            messages = cached.map { mapDTO($0) }
            isLoading = false
        } else if store.chatMessages.hasLoaded {
            // Cargado pero legítimamente vacío: se enseña el vacío, no el esqueleto.
            isLoading = false
        }
        // Si no: nunca se ha cargado → se mantiene el esqueleto en frío hasta que vuelva `loadInitial`.
    }

    @MainActor
    func loadInitial() async {
        guard bearer != nil else { isLoading = false; return }
        // Cache-first / SWR por el almacén compartido: revalida el historial y el sobre del hilo (la identidad del
        // coach) dentro de la ventana de caducidad y conserva el último valor bueno si falla. La lista cacheada ya
        // está en pantalla, así que esto es un refresco silencioso de fondo, no una carga que bloquee.
        await store.loadChat()
        if coachName == nil { coachName = cachedCoachName() }
        if let dtos = store.chatMessages.value {
            // Se RECONCILIA (no se sustituye) para que los mensajes aún optimistas o en cola sin red sobrevivan a
            // una recarga por reconexión.
            reconcile(with: dtos)
            loadFailed = false
            await markReadIfNeeded(dtos: dtos)
        } else if messages.isEmpty {
            // Nunca cargó y no hay copia: la revalidación en frío falló.
            loadFailed = true
        }
        isLoading = false
    }

    /// El nombre del coach del sobre del hilo en el almacén (la fuente de esta pantalla: chat_threads →
    /// coaches.full_name). Nil si falta, no ha cargado o el atleta no tiene coach → se pintan los textos neutros.
    /// Nunca se fabrica. El almacén calienta y revalida el hilo, así que aquí sólo se lee.
    func cachedCoachName() -> String? {
        IdentidadCoachChat(nombre: store.chatThread.value?.coachName).nombre
    }

    /// Bucle en tiempo real: prefiere el stream SSE y cae al sondeo REST cuando se corta o no conecta; luego reintenta
    /// el stream. Mientras el stream está sano nos quedamos aparcados dentro de `streamMessages` (cero sondeo). Cuando
    /// termina o falla hacemos un `refresh()` de recuperación, esperamos un intervalo y reconectamos — así un servidor
    /// sin SSE degrada solo a un sondeo estable cada 3 s. Se cancela solo al desmontar el `.task`.
    func liveLoop() async {
        guard let bearer else { return }
        while !Task.isCancelled {
            do {
                try await ChatService.streamMessages(
                    bearer: bearer,
                    onReady: { await onStreamReady() },
                    onMessage: { dto in await ingestFromStream(dto) }
                )
            } catch {
                // Error de conexión o de transporte → se trata como un corte: se sigue al sondeo de respaldo y a
                // la reconexión.
            }
            if Task.isCancelled { return }
            await refresh()
            try? await Task.sleep(for: Self.pollInterval)
        }
    }

    /// El stream conectó. Una recuperación REST única para cerrar el hueco entre la foto inicial y la apertura del
    /// stream (un mensaje pudo llegar entre medias).
    @MainActor
    func onStreamReady() async {
        await refresh()
    }

    /// Aplica un mensaje del stream y, si es del coach y estamos en pantalla, lo marca leído.
    @MainActor
    func ingestFromStream(_ dto: ChatMessageDTO) async {
        ingest(dto)
        await markReadForIncoming(dto)
    }

    @MainActor
    func refresh() async {
        guard bearer != nil else { return }
        // Fuerza una lectura fresca por el almacén (recuperación tras abrir el stream / sondeo de respaldo). El
        // almacén persiste el resultado y conserva el último valor bueno ante un fallo transitorio, así que siempre
        // se reconcilia contra el mejor historial.
        await store.refreshChatMessages(force: true)
        guard let dtos = store.chatMessages.value else { return }
        reconcile(with: dtos)
        loadFailed = false
        await markReadIfNeeded(dtos: dtos)
    }

    /// Mezcla la verdad del servidor con los mensajes locales optimistas (aún enviándose o en cola sin red). Gana el
    /// servidor; cualquier local no `sent` cuyo cuerpo el servidor aún no ha devuelto se conserva al final. Es también
    /// la red de seguridad contra duplicados del `ingest` incremental por SSE: reconstruir todo desde la verdad del
    /// servidor nunca duplica un mensaje.
    @MainActor
    func reconcile(with dtos: [ChatMessageDTO]) {
        let serverMessages = dtos.map { mapDTO($0) }
        let serverIds = Set(dtos.map { $0.id })
        let serverBodies = Set(dtos.compactMap { $0.body })
        let serverAttachmentURLs = Set(dtos.compactMap { $0.attachmentUrl })
        // Se conserva toda fila local aún optimista que el servidor no ha devuelto — por id, por cuerpo de texto o
        // (en adjuntos) por URL remota. Un adjunto pendiente a mitad de subida (aún sin URL remota) se conserva
        // siempre, para que no parpadee fuera de la conversación.
        let pending = messages.filter { msg in
            guard msg.status != .sent else { return false }
            if serverIds.contains(msg.id) { return false }
            if case let .text(body) = msg.kind { return !serverBodies.contains(body) }
            if let url = msg.remoteAttachmentURL { return !serverAttachmentURLs.contains(url) }
            return true
        }
        messages = serverMessages + pending
    }

    /// Aplica un mensaje suelto (del stream SSE o de la confirmación de un envío), deduplicado por id. Orden de
    /// resolución:
    ///   1. Ya tenemos ese id → se actualiza en su sitio (recibos de lectura / autoría ya conocida). Nunca duplica.
    ///   2. Es el eco del servidor de un envío optimista propio (una fila local sin enviar con el mismo cuerpo) → se
    ///      sustituye esa fila, se atribuye a nosotros y se aprende nuestro id de usuario. Mata el doble «optimista +
    ///      eco» incluso cuando el eco gana a la respuesta del POST.
    ///   3. Si no, es genuinamente nuevo → se añade.
    @MainActor
    func ingest(_ dto: ChatMessageDTO) {
        // Sea cual sea la rama que resuelva la copia de trabajo, el mensaje canónico se pliega siempre en la caché
        // del almacén compartido (deduplicado por id): la próxima apertura es instantánea y sin red se ve el último
        // intercambio.
        defer { store.appendChatMessage(dto) }
        if let idx = messages.firstIndex(where: { $0.id == dto.id }) {
            messages[idx] = mapDTO(dto)
            return
        }
        if let body = dto.body,
           let localIdx = messages.firstIndex(where: { msg in
               if case let .text(b) = msg.kind, msg.status != .sent { return b == body }
               return false
           }) {
            if myUserId == nil {
                myUserId = dto.senderUserId
                UserDefaults.standard.set(dto.senderUserId, forKey: Self.myUserIdKey)
            }
            messages[localIdx] = mapDTO(dto, forcedSender: .me)
            return
        }
        // Eco de un adjunto propio optimista: se empareja la fila local sin enviar por su URL remota (ya conocida) —
        // el emparejado por cuerpo de arriba no tiene texto al que agarrarse en un adjunto. Mata el doble
        // «optimista + eco».
        if let url = dto.attachmentUrl,
           let localIdx = messages.firstIndex(where: { $0.status != .sent && $0.remoteAttachmentURL == url }) {
            if myUserId == nil {
                myUserId = dto.senderUserId
                UserDefaults.standard.set(dto.senderUserId, forKey: Self.myUserIdKey)
            }
            messages[localIdx] = mapDTO(dto, forcedSender: .me)
            return
        }
        messages.append(mapDTO(dto))
    }

    /// Marca leído un mensaje del coach recién llegado (la vista está en pantalla). No hace nada con los propios.
    @MainActor
    func markReadForIncoming(_ dto: ChatMessageDTO) async {
        guard let bearer, !isMine(dto.senderUserId) else { return }
        await ChatService.markRead(bearer: bearer, upToMessageId: dto.id)
    }

    @MainActor
    func markReadIfNeeded(dtos: [ChatMessageDTO]) async {
        guard let bearer else { return }
        // Se marca leído hasta el último mensaje del coach (todo lo que no es mío).
        guard let newestCoach = dtos.last(where: { !isMine($0.senderUserId) }) else { return }
        await ChatService.markRead(bearer: bearer, upToMessageId: newestCoach.id)
    }

    // MARK: - Autoría

    func isMine(_ senderUserId: String) -> Bool {
        // Una vez aprendido nuestro propio id (de un mensaje enviado), se confía en él.
        if let mine = myUserId { return senderUserId == mine }
        // Arranque en frío, antes de que el atleta haya escrito: todo mensaje existente es del coach (el backend crea
        // el hilo con el primer mensaje del coach, así que el atleta nunca abre su propio texto sin atribuir).
        return false
    }

    /// `forcedSender` fuerza la autoría cuando quien llama ya sabe que el mensaje es nuestro (p. ej. un eco SSE
    /// emparejado con un envío local pendiente antes de aprender `myUserId`), esquivando la carrera del arranque en
    /// frío.
    func mapDTO(_ dto: ChatMessageDTO, forcedSender: ChatMessage.Sender? = nil) -> ChatMessage {
        let sender: ChatMessage.Sender = forcedSender ?? (isMine(dto.senderUserId) ? .me : .coach)
        return ChatMessage(
            id: dto.id,
            sender: sender,
            kind: ChatView.kind(from: dto),
            timestamp: ChatView.relativeLabel(for: dto.createdAt),
            status: .sent,
            contexto: dto.context
        )
    }

    /// Traduce un DTO canónico a lo que se pinta. Un mensaje con adjunto (URL + tipo reconocido) enseña su medio desde
    /// la fuente remota autenticada; todo lo demás es texto. La duración de la voz o el vídeo y la proporción de la
    /// foto salen de `attachment_meta`.
    static func kind(from dto: ChatMessageDTO) -> ChatMessage.Kind {
        guard let urlStr = dto.attachmentUrl,
              let kindStr = dto.attachmentKind,
              let kind = ChatAttachmentKind(rawValue: kindStr) else {
            return .text(dto.body ?? "")
        }
        let source = ChatAttachmentSource(remoteURL: urlStr)
        let meta = dto.attachmentMeta
        switch kind {
        case .voice: return .voice(source: source, duration: meta?.durationSeconds)
        case .image: return .image(source: source, aspect: meta?.aspectRatio)
        case .video: return .video(source: source, duration: meta?.durationSeconds)
        case .file:  return .file(
            source: source,
            name: ChatAttachmentInfer.receivedFileName(remoteURLString: urlStr),
            sizeBytes: meta?.sizeBytes
        )
        }
    }

    static func relativeLabel(for date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return ChatMessage.todayLabel }
        if cal.isDateInYesterday(date) { return ChatMessage.yesterdayLabel }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.dateFormat = "d MMM"
        return fmt.string(from: date)
    }
}
