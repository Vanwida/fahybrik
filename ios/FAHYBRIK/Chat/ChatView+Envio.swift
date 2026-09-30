import SwiftUI
import UIKit

// EL ENVÍO — texto y adjuntos, con su fila optimista, su cola sin red y su reintento.
//
// Los envíos son optimistas: la fila aparece al instante y se confirma (o cae) después. Un fallo transitorio (sin red,
// 5xx) encola para reenviar; uno determinista (4xx) marca el mensaje como caído y lo deja para reintentar o descartar.
// Los adjuntos NUNCA entran en la cola ciega: la URL sólo existe tras subirlos y el reenvío en crudo no puede volver a
// subir los bytes, así que cualquier fallo los deja caídos y el reintento repite la subida desde el fichero retenido.

extension ChatView {

    // MARK: - Las hojas de adjuntar

    @ViewBuilder
    func attachmentSheet(_ sheet: AttachmentSheet) -> some View {
        switch sheet {
        case .voice:
            VoiceRecorderView(onSend: { picked in sendAttachment(picked) })
        case .cameraPhoto:
            ChatCameraPicker(mode: .photo,
                             onPicked: { handlePicked($0) },
                             onCancel: { activeSheet = nil },
                             onError: { presentAttachmentError($0) })
                .ignoresSafeArea()
        case .cameraVideo:
            ChatCameraPicker(mode: .video,
                             onPicked: { handlePicked($0) },
                             onCancel: { activeSheet = nil },
                             onError: { presentAttachmentError($0) })
                .ignoresSafeArea()
        case .library:
            ChatMediaLibraryPicker(onPicked: { handlePicked($0) },
                                   onCancel: { activeSheet = nil },
                                   onError: { presentAttachmentError($0) })
                .ignoresSafeArea()
        case .document:
            ChatDocumentPicker(onPicked: { handlePicked($0) },
                               onCancel: { activeSheet = nil },
                               onError: { presentAttachmentError($0) })
                .ignoresSafeArea()
        }
    }

    /// Un selector o la cámara devolvió un adjunto: se cierra la hoja y queda como vista previa PENDIENTE en el
    /// compositor. NO se envía nada hasta que el atleta toca enviar (revisar y luego enviar, igual que la nota de
    /// voz): elegir una foto no la manda al coach por su cuenta.
    func handlePicked(_ picked: ChatPickedAttachment) {
        activeSheet = nil
        // ¿Sustituye a un adjunto pendiente anterior? Se borra su temporal para no dejarlo colgando.
        if let prior = composerAttachment, prior.localURL != picked.localURL {
            try? FileManager.default.removeItem(at: prior.localURL)
        }
        composerAttachment = picked
        inputFocused = false
        Haptics.light()
    }

    /// Descarta el adjunto pendiente (aún sin enviar) y borra su temporal.
    func discardComposerAttachment() {
        if let picked = composerAttachment {
            try? FileManager.default.removeItem(at: picked.localURL)
        }
        composerAttachment = nil
        Haptics.light()
    }

    /// Envía ya el adjunto pendiente (el ↑ del compositor): quita la vista previa y corre el envío optimista normal
    /// (subir → enviar).
    func sendComposerAttachment() {
        guard let picked = composerAttachment else { return }
        composerAttachment = nil
        sendAttachment(picked)
    }

    /// Un adjunto no se pudo elegir o supera el límite: el aviso de fallo del día, que se queda hasta descartarlo.
    func presentAttachmentError(_ message: String) {
        activeSheet = nil
        aviso = .init(tono: .fallo, texto: message)
    }

    // MARK: - Enviar texto

    func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        // El sujeto se suelta del compositor al enviar (viaja con ESTE mensaje, no con el siguiente) pero se retiene
        // para el reintento.
        let sobre = contexto
        draft = ""
        contexto = nil
        Haptics.light()

        let localId = "local-\(UUID().uuidString)"
        let optimistic = ChatMessage(
            id: localId,
            sender: .me,
            kind: .text(trimmed),
            timestamp: ChatMessage.todayLabel,
            status: .pending,
            contexto: sobre?.provisional
        )
        messages.append(optimistic)

        Task { await deliver(body: trimmed, localId: localId, context: sobre?.target) }
    }

    @MainActor
    func deliver(body: String, localId: String, context: ChatContextTarget? = nil) async {
        guard let bearer else {
            // Sin sesión: el mensaje queda marcado como «enviando» y saldrá en el próximo arranque, cuando haya
            // sesión (la cola lo sigue registrando).
            await enqueueOffline(body: body, localId: localId, context: context)
            return
        }
        do {
            let saved = try await ChatService.sendMessage(bearer: bearer, body: body, context: context)
            // Se aprende y se guarda mi propio id de usuario del mensaje confirmado.
            if myUserId == nil {
                myUserId = saved.senderUserId
                UserDefaults.standard.set(saved.senderUserId, forKey: Self.myUserIdKey)
            }
            // Se tira la fila optimista y se ingiere el mensaje guardado. `ingest` deduplica por id, así que si el
            // stream SSE ya lo devolvió sólo se actualiza en su sitio: nunca un doble.
            messages.removeAll { $0.id == localId }
            ingest(saved)
        } catch {
            // Un 4xx es determinista y no saldrá al reintentar: el mensaje queda CAÍDO (se toca para reintentar) en
            // vez de encolarlo en «enviando…» para siempre. Un fallo transitorio (sin red / 5xx) sí se encola.
            switch ChatSendOutcome.forError(error) {
            case .queueForReplay: await enqueueOffline(body: body, localId: localId, context: context)
            case .markFailed:     markFailed(localId: localId)
            }
        }
    }

    @MainActor
    func enqueueOffline(body: String, localId: String, context: ChatContextTarget? = nil) async {
        if let data = ChatService.encodeSendBody(body, context: context) {
            await RequestQueue.shared.enqueue(path: ChatService.sendPath, body: data, bearer: bearer)
        }
        // El mensaje sigue visible con su «enviando…».
        if let idx = messages.firstIndex(where: { $0.id == localId }) {
            messages[idx].status = .sending
        }
    }

    /// Un 4xx (determinista): el mensaje se lee CAÍDO, no «enviando…», y NO se encola. La fila se reintenta al tocarla
    /// (`retry`).
    @MainActor
    func markFailed(localId: String) {
        if let idx = messages.firstIndex(where: { $0.id == localId }) {
            messages[idx].status = .failed
        }
    }

    /// Reintenta un mensaje caído: lo devuelve a «enviando» y lo reenvía. El texto reenvía su cuerpo; un adjunto repite
    /// subida y envío (o sólo el envío si la subida ya salió bien).
    @MainActor
    func retry(_ localId: String) {
        guard let idx = messages.firstIndex(where: { $0.id == localId }) else { return }
        if case let .text(body) = messages[idx].kind {
            messages[idx].status = .sending
            // El reintento se lleva el sujeto: una pregunta que llegara suelta al coach es justo lo que esto venía a
            // evitar.
            let sobre = messages[idx].contexto?.target
            Task { await deliver(body: body, localId: localId, context: sobre) }
        } else {
            messages[idx].status = .sending
            Task { await deliverAttachment(localId: localId) }
        }
    }

    /// Descarta un mensaje local CAÍDO o sin enviar en vez de reintentarlo: tira la fila y limpia el fichero del adjunto
    /// retenido. No toca la red: nada se guardó nunca en el servidor, así que no hay nada que borrar allí.
    @MainActor
    func discard(_ localId: String) {
        if let picked = pendingAttachments[localId] {
            try? FileManager.default.removeItem(at: picked.localURL)
        }
        pendingAttachments[localId] = nil
        uploadedURLs[localId] = nil
        messages.removeAll { $0.id == localId }
        Haptics.light()
    }

    /// Borra uno de los mensajes ya enviados del PROPIO atleta. Lo quita de forma optimista (en local y de la caché) y
    /// luego lo borra en el servidor (borrado lógico, sólo del autor). Si falla se resincroniza: el mensaje reaparece en
    /// vez de desaparecer en silencio de este dispositivo mientras sigue vivo para el coach.
    @MainActor
    func deleteSentMessage(_ id: String) {
        guard let bearer else { return }
        messages.removeAll { $0.id == id }
        store.removeChatMessage(id: id)
        Haptics.light()
        Task {
            do {
                try await ChatService.deleteMessage(bearer: bearer, messageId: id)
            } catch {
                await refresh()
            }
        }
    }

    // MARK: - Enviar un adjunto

    /// Envía un adjunto capturado, grabado o elegido. Primero el límite de tamaño en el cliente (error amable, sin
    /// subida en balde) y luego una burbuja optimista que previsualiza el fichero LOCAL al instante y conduce
    /// subir → enviar.
    func sendAttachment(_ picked: ChatPickedAttachment) {
        guard ChatAttachmentLimits.withinLimit(kind: picked.kind, bytes: picked.sizeBytes) else {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: ChatAttachmentLimits.overLimitMessage(for: picked.kind))
            return
        }
        Haptics.light()
        let localId = "local-\(UUID().uuidString)"
        pendingAttachments[localId] = picked
        // El sujeto acompaña también a una foto o a una nota de voz, y se suelta del compositor igual que con el
        // texto: viaja con ESTE mensaje.
        let sobre = contexto
        contexto = nil
        let optimistic = ChatMessage(
            id: localId,
            sender: .me,
            kind: attachmentKind(for: picked, source: ChatAttachmentSource(localURL: picked.localURL)),
            timestamp: ChatMessage.todayLabel,
            status: .pending,
            contexto: sobre?.provisional
        )
        messages.append(optimistic)
        Task { await deliverAttachment(localId: localId) }
    }

    @MainActor
    func deliverAttachment(localId: String) async {
        guard let bearer, let picked = pendingAttachments[localId] else {
            markFailed(localId: localId)
            return
        }
        setStatus(localId, .sending)
        do {
            // 1. Subir (salvo que un intento previo ya lo hiciera), en streaming desde el fichero.
            let url: String
            if let existing = uploadedURLs[localId] {
                url = existing
            } else {
                let result = try await ChatService.uploadAttachment(
                    bearer: bearer, kind: picked.kind, fileURL: picked.localURL,
                    filename: picked.filename, mimeType: picked.mimeType
                )
                url = result.url
                uploadedURLs[localId] = url
                // La URL remota pasa a la fila optimista (la clave de deduplicación del eco SSE) y se siembra el
                // cargador para que la burbuja que devuelve el servidor se resuelva desde nuestro fichero local en
                // vez de descargarlo otra vez.
                setRemoteURL(localId, url)
                await seedLoader(url: url, picked: picked)
            }
            // 2. Enviar el mensaje que referencia lo subido. El sujeto lo lleva la fila optimista desde que se eligió,
            // así que un reintento lo recupera de ahí en vez de haberlo perdido.
            let saved = try await ChatService.sendMessage(
                bearer: bearer, body: nil, attachmentUrl: url,
                attachmentKind: picked.kind, attachmentMeta: picked.meta,
                context: messages.first(where: { $0.id == localId })?.contexto?.target
            )
            if myUserId == nil {
                myUserId = saved.senderUserId
                UserDefaults.standard.set(saved.senderUserId, forKey: Self.myUserIdKey)
            }
            messages.removeAll { $0.id == localId }
            pendingAttachments[localId] = nil
            uploadedURLs[localId] = nil
            ingest(saved)
        } catch {
            // Los adjuntos NUNCA entran en la cola ciega sin red: la URL sólo existe tras la subida y el reenvío en
            // crudo no puede volver a subir los bytes. Así que CUALQUIER fallo deja la fila caída → al reintentar se
            // repite el envío (barato, ya subido) o la subida desde el fichero retenido.
            markFailed(localId: localId)
        }
    }

    func seedLoader(url: String, picked: ChatPickedAttachment) async {
        await ChatMediaLoader.shared.seedLocalFile(remoteURL: url, localFileURL: picked.localURL)
        if picked.kind == .image, let img = UIImage(contentsOfFile: picked.localURL.path) {
            await ChatMediaLoader.shared.seedImage(remoteURL: url, image: img)
        }
    }

    func attachmentKind(for picked: ChatPickedAttachment, source: ChatAttachmentSource) -> ChatMessage.Kind {
        switch picked.kind {
        case .voice: return .voice(source: source, duration: picked.meta.durationSeconds)
        case .image: return .image(source: source, aspect: picked.meta.aspectRatio)
        case .video: return .video(source: source, duration: picked.meta.durationSeconds)
        case .file:  return .file(source: source, name: picked.filename, sizeBytes: picked.sizeBytes)
        }
    }

    @MainActor
    func setStatus(_ localId: String, _ status: ChatMessage.Status) {
        if let idx = messages.firstIndex(where: { $0.id == localId }) { messages[idx].status = status }
    }

    /// Pone la URL remota subida en la fila optimista CONSERVANDO su fichero local para la vista previa instantánea.
    @MainActor
    func setRemoteURL(_ localId: String, _ url: String) {
        guard let idx = messages.firstIndex(where: { $0.id == localId }),
              let picked = pendingAttachments[localId] else { return }
        messages[idx].kind = attachmentKind(
            for: picked,
            source: ChatAttachmentSource(localURL: picked.localURL, remoteURL: url)
        )
    }
}
