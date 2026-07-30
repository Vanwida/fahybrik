import SwiftUI
import UIKit

// Chat tab — direct thread between the athlete and their coach (coach identity
// is agnostic data, read from the chat thread payload — never hardcoded).
//
// Cache-first / SWR: the conversation is backed by the shared AppDataStore
// (`chatMessages` history + `chatThread` envelope). Opening the tab renders the
// cached conversation INSTANTLY from the store (no "pensando" spinner when a
// cache exists — only on a true cold first load), then the live ChatService SSE
// stream layers real-time updates ON TOP. Every canonical message (SSE-delivered
// or the athlete's own confirmed send) is folded back into the store cache, so
// the next open is instant and offline shows the latest exchange. Sends are
// optimistic with an offline queue fallback. Voice notes render a static
// waveform + duration. Castilian throughout.
//
// Presentation: Chat is a first-class TAB root (AppShell). It is ALSO raised as
// a sheet from the Plan header (which re-injects the store across the sheet
// boundary). We read `\.isPresented` to know which: as a sheet we show a close
// affordance; as the tab root the header is clean (no back chevron — the bottom
// bar owns nav), matching the handoff `chat` screen.
struct ChatView: View {
    let bearer: String?

    // The shared cache-first data layer. The conversation history lives in its
    // `chatMessages` slice and the coach identity in `chatThread`, so the screen
    // opens from memory/disk and revalidates silently — same engine as the other
    // tabs. Injected by AppShell (tab root) / re-injected by PlanView (sheet).
    @Environment(AppDataStore.self) private var store

    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented

    @State private var messages: [ChatMessage] = []
    @State private var draft: String = ""
    @State private var isLoading: Bool = true
    @State private var loadFailed: Bool = false
    @FocusState private var inputFocused: Bool

    // Coach identity is AGNOSTIC data from the chat thread payload (chat_threads
    // -> coaches.full_name), never hardcoded. In the demo this resolves to
    // "Coach Demo 1", not "Pablo". Neutral fallbacks below when it's absent — we
    // never fabricate a name.
    @State private var coachName: String? = nil

    // The athlete's own user id, learned from the first message they send (the
    // POST response carries senderUserId). Persisted so sender attribution is
    // stable across launches without a backend round-trip for "who am I".
    @State private var myUserId: String? = UserDefaults.standard.string(forKey: Self.myUserIdKey)
    private static let myUserIdKey = "fahybrik.chat.myUserId"

    // Real-time delivery is driven by the backend SSE stream (/api/chat/stream);
    // see `liveLoop()`. This interval is the FALLBACK cadence: it paces the REST
    // catch-up poll + reconnect attempt whenever the stream drops or can't be
    // established, so a server that doesn't speak SSE degrades cleanly to a 3s
    // poll. Single source of truth for that cadence.
    private static let pollInterval: Duration = .seconds(3)

    // MARK: Attachments (voice / photo / video / file)
    //
    // Which media source the composer's "＋" menu is currently presenting.
    @State private var showAttachMenu = false
    @State private var activeSheet: AttachmentSheet? = nil
    /// A friendly, dismissible error (over-limit, picker/encode failure).
    @State private var attachmentError: String? = nil
    /// The just-captured/recorded/picked attachment behind each optimistic row,
    /// keyed by its local id — the retry + upload source (never in render state).
    @State private var pendingAttachments: [String: ChatPickedAttachment] = [:]
    /// Remote proxy URL once uploaded, so a retry after a failed SEND skips the
    /// (already-done) upload.
    @State private var uploadedURLs: [String: String] = [:]
    /// A photo/video/file the athlete has PICKED but not yet sent — shown as a
    /// pending preview in the composer (thumbnail + discard ✕ + send ↑). Nothing
    /// is uploaded or sent until they tap send: picking never fires on its own.
    /// (Voice keeps its own in-sheet record→preview→send flow.)
    @State private var composerAttachment: ChatPickedAttachment? = nil

    enum AttachmentSheet: Identifiable {
        case voice, cameraPhoto, cameraVideo, library, document
        var id: Int { hashValue }
    }

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            // TRES BANDAS (contrato §6): encabezado fijo · conversación ·
            // compositor anclado. El compositor ya era el último hijo de esta
            // pila, así que ya estaba anclado; lo que faltaba era que la banda
            // de en medio decidiera qué hacer con su hueco.
            VStack(spacing: 0) {
                header
                Hairline()
                conversationBand
                Hairline()
                inputRow
            }
        }
        // Cancelled automatically when the view is dismissed.
        .task {
            seedFromCache()
            await loadInitial()
            await liveLoop()
        }
        .confirmationDialog("Adjuntar", isPresented: $showAttachMenu, titleVisibility: .visible) {
            Button("Grabar nota de voz") { activeSheet = .voice }
            if cameraAvailable {
                Button("Hacer una foto") { activeSheet = .cameraPhoto }
                Button("Grabar vídeo") { activeSheet = .cameraVideo }
            }
            Button("Foto o vídeo de la galería") { activeSheet = .library }
            Button("Archivo") { activeSheet = .document }
            Button("Cancelar", role: .cancel) {}
        }
        .sheet(item: $activeSheet) { sheet in attachmentSheet(sheet) }
        .alert("No se pudo adjuntar", isPresented: Binding(
            get: { attachmentError != nil },
            set: { if !$0 { attachmentError = nil } }
        )) {
            Button("Entendido", role: .cancel) { attachmentError = nil }
        } message: {
            Text(attachmentError ?? "")
        }
    }

    // MARK: - Attachment sheets

    @ViewBuilder
    private func attachmentSheet(_ sheet: AttachmentSheet) -> some View {
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

    /// A picker/camera handed back an attachment — dismiss the sheet and park it
    /// as a PENDING preview in the composer. NOTHING is sent until the athlete
    /// taps send (review-then-send, matching the voice flow) — this is the safety
    /// fix: picking a photo no longer fires it off to the coach on its own.
    private func handlePicked(_ picked: ChatPickedAttachment) {
        activeSheet = nil
        // Replacing an earlier pending pick? Clean its temp file so we don't leak.
        if let prior = composerAttachment, prior.localURL != picked.localURL {
            try? FileManager.default.removeItem(at: prior.localURL)
        }
        composerAttachment = picked
        inputFocused = false
        Haptics.light()
    }

    /// Discard the pending (not-yet-sent) attachment and delete its temp file.
    private func discardComposerAttachment() {
        if let picked = composerAttachment {
            try? FileManager.default.removeItem(at: picked.localURL)
        }
        composerAttachment = nil
        Haptics.light()
    }

    /// Send the pending attachment now (the composer's send ↑). Clears the
    /// preview, then runs the normal optimistic upload→send.
    private func sendComposerAttachment() {
        guard let picked = composerAttachment else { return }
        composerAttachment = nil
        sendAttachment(picked)
    }

    private func presentAttachmentError(_ message: String) {
        activeSheet = nil
        attachmentError = message
    }

    // MARK: - Data flow

    /// The conversation to render. Prefers the live working copy (`messages`),
    /// falling back to the store's cached history so the FIRST frame — before
    /// `seedFromCache` has copied it into `messages` — already shows the cached
    /// conversation instead of a spinner flash.
    private var displayMessages: [ChatMessage] {
        if !messages.isEmpty { return messages }
        if let cached = store.chatMessages.value { return cached.map { mapDTO($0) } }
        return []
    }

    /// Render the cached conversation INSTANTLY from the shared store before any
    /// network — cache-first. Only seeds the working copy when it's empty (a
    /// first-message reconnect re-keys the `.task` but keeps the live list).
    /// Resolves the coach name from the already-warmed thread envelope. When the
    /// history has been loaded (even legitimately empty), the cold spinner ends.
    @MainActor
    private func seedFromCache() {
        if coachName == nil { coachName = cachedCoachName() }
        guard messages.isEmpty else { return }
        if let cached = store.chatMessages.value, !cached.isEmpty {
            messages = cached.map { mapDTO($0) }
            isLoading = false
        } else if store.chatMessages.hasLoaded {
            // Loaded but legitimately empty — show the empty state, not a spinner.
            isLoading = false
        }
        // else: never loaded → keep the cold spinner until loadInitial returns.
    }

    @MainActor
    private func loadInitial() async {
        guard bearer != nil else { isLoading = false; return }
        // Cache-first / SWR through the shared store: revalidates the history +
        // the thread envelope (coach identity) within the staleness window and
        // keeps the last good value on failure. The cached list is already on
        // screen, so this is a silent background refresh, not a blocking load.
        await store.loadChat()
        if coachName == nil { coachName = cachedCoachName() }
        if let dtos = store.chatMessages.value {
            // Reconcile (not replace) so any still-optimistic / offline-queued
            // messages survive a reconnect-triggered reload.
            reconcile(with: dtos)
            loadFailed = false
            await markReadIfNeeded(dtos: dtos)
        } else if messages.isEmpty {
            // Never loaded and nothing cached → the cold revalidation failed.
            loadFailed = true
        }
        isLoading = false
    }

    /// Coach display name from the store's chat-thread envelope (the in-surface
    /// source: chat_threads -> coaches.full_name), trimmed. Nil when absent / not
    /// loaded / the athlete has no coach → neutral fallbacks render. Never
    /// fabricated. The store warms + revalidates the thread, so this is read-only.
    private func cachedCoachName() -> String? {
        guard let name = store.chatThread.value?.coachName?
            .trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
        return name
    }

    /// Real-time loop: prefer the SSE stream; fall back to REST polling when it
    /// drops or can't connect, then retry the stream. While the stream is
    /// healthy we stay parked inside `streamMessages` (no polling at all). When
    /// it ends/errors we do one catch-up `refresh()`, wait one fallback
    /// interval, and reconnect — so a server with no SSE naturally degrades to a
    /// steady 3s poll. Cancelled automatically when the `.task` is torn down.
    private func liveLoop() async {
        guard let bearer else { return }
        while !Task.isCancelled {
            do {
                try await ChatService.streamMessages(
                    bearer: bearer,
                    onReady: { await onStreamReady() },
                    onMessage: { dto in await ingestFromStream(dto) }
                )
            } catch {
                // Connection/transport error → treat as a drop, fall through to
                // the polling fallback + reconnect.
            }
            if Task.isCancelled { return }
            await refresh()
            try? await Task.sleep(for: Self.pollInterval)
        }
    }

    /// Stream connected. One-time REST catch-up to close any gap between the
    /// initial snapshot and the stream opening (a message could have landed in
    /// between).
    @MainActor
    private func onStreamReady() async {
        await refresh()
    }

    /// Apply one streamed message, then mark it read if it's from the coach and
    /// we're on screen.
    @MainActor
    private func ingestFromStream(_ dto: ChatMessageDTO) async {
        ingest(dto)
        await markReadForIncoming(dto)
    }

    @MainActor
    private func refresh() async {
        guard bearer != nil else { return }
        // Force a fresh pull through the store (catch-up after the stream opens /
        // poll fallback). The store persists the result + keeps the last good value
        // on a transient failure, so we always reconcile against the best history.
        await store.refreshChatMessages(force: true)
        guard let dtos = store.chatMessages.value else { return }
        reconcile(with: dtos)
        loadFailed = false
        await markReadIfNeeded(dtos: dtos)
    }

    /// Merge server truth with any optimistic (still-sending / offline-queued)
    /// local messages. Server messages win; any un-`sent` local whose body the
    /// server hasn't echoed back yet is kept appended. This is also the dedup
    /// safety net behind the incremental SSE `ingest` — a full rebuild from
    /// server truth can never double a message.
    @MainActor
    private func reconcile(with dtos: [ChatMessageDTO]) {
        let serverMessages = dtos.map { mapDTO($0) }
        let serverIds = Set(dtos.map { $0.id })
        let serverBodies = Set(dtos.compactMap { $0.body })
        let serverAttachmentURLs = Set(dtos.compactMap { $0.attachmentUrl })
        // Keep any still-optimistic local row the server hasn't echoed yet — by
        // id, by text body, or (for attachments) by remote URL. A pending
        // attachment mid-upload (no remote URL yet) is always kept so it never
        // blinks out of the conversation.
        let pending = messages.filter { msg in
            guard msg.status != .sent else { return false }
            if serverIds.contains(msg.id) { return false }
            if case let .text(body) = msg.kind { return !serverBodies.contains(body) }
            if let url = msg.remoteAttachmentURL { return !serverAttachmentURLs.contains(url) }
            return true
        }
        messages = serverMessages + pending
    }

    /// Apply a single message (from the SSE stream or a send confirmation),
    /// deduped by id. Order of resolution:
    ///   1. We already have this id → update in place (read receipts /
    ///      now-known attribution). Never doubles.
    ///   2. It's the server echo of one of our own optimistic sends (an un-sent
    ///      local row with the same body) → replace that row, attribute it to
    ///      us, and learn our user id. Kills the "optimistic + echo" double even
    ///      when the echo beats the POST response.
    ///   3. Otherwise it's genuinely new → append.
    @MainActor
    private func ingest(_ dto: ChatMessageDTO) {
        // Whichever branch resolves the local working copy, always fold the
        // canonical message into the shared store cache (id-deduped) so the next
        // open is instant and offline shows the latest exchange.
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
        // Attachment echo of one of our own optimistic sends: match the un-sent
        // local row by its (now-known) remote URL — the same-body dedup above has
        // no text to key on for attachments. Kills the "optimistic + echo" double.
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

    /// Mark a freshly-arrived coach message read (view is on screen). No-op for
    /// our own messages.
    @MainActor
    private func markReadForIncoming(_ dto: ChatMessageDTO) async {
        guard let bearer, !isMine(dto.senderUserId) else { return }
        await ChatService.markRead(bearer: bearer, upToMessageId: dto.id)
    }

    @MainActor
    private func markReadIfNeeded(dtos: [ChatMessageDTO]) async {
        guard let bearer else { return }
        // Mark read up to the newest coach message (anything not from me).
        guard let newestCoach = dtos.last(where: { !isMine($0.senderUserId) }) else { return }
        await ChatService.markRead(bearer: bearer, upToMessageId: newestCoach.id)
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        draft = ""
        Haptics.light()

        let localId = "local-\(UUID().uuidString)"
        let optimistic = ChatMessage(
            id: localId,
            sender: .me,
            kind: .text(trimmed),
            timestamp: ChatMessage.todayLabel,
            status: .pending
        )
        messages.append(optimistic)

        Task { await deliver(body: trimmed, localId: localId) }
    }

    @MainActor
    private func deliver(body: String, localId: String) async {
        guard let bearer else {
            // No session — leave the message marked as sending; it'll surface
            // on next launch once auth is present (queue still records it).
            await enqueueOffline(body: body, localId: localId)
            return
        }
        do {
            let saved = try await ChatService.sendMessage(bearer: bearer, body: body)
            // Learn + persist my own user id from the confirmed message.
            if myUserId == nil {
                myUserId = saved.senderUserId
                UserDefaults.standard.set(saved.senderUserId, forKey: Self.myUserIdKey)
            }
            // Drop the optimistic row, then ingest the persisted message. ingest
            // is id-deduped, so if the SSE stream already echoed it, this just
            // updates in place — never a double.
            messages.removeAll { $0.id == localId }
            ingest(saved)
        } catch {
            // AUDIT — a deterministic 4xx won't succeed on retry: mark the message FAILED
            // (tap to reintentar) instead of queueing it to "enviando…" forever. A
            // transient failure (offline / 5xx / red) still queues for replay.
            switch ChatSendOutcome.forError(error) {
            case .queueForReplay: await enqueueOffline(body: body, localId: localId)
            case .markFailed:     markFailed(localId: localId)
            }
        }
    }

    @MainActor
    private func enqueueOffline(body: String, localId: String) async {
        if let data = ChatService.encodeSendBody(body) {
            await RequestQueue.shared.enqueue(path: ChatService.sendPath, body: data, bearer: bearer)
        }
        // Keep the message visible with a "sending…" affordance.
        if let idx = messages.firstIndex(where: { $0.id == localId }) {
            messages[idx].status = .sending
        }
    }

    /// AUDIT — a 4xx (deterministic): the message reads FAILED, not "enviando…", and is
    /// NOT queued. The row is tap-to-retry (`retry`).
    @MainActor
    private func markFailed(localId: String) {
        if let idx = messages.firstIndex(where: { $0.id == localId }) {
            messages[idx].status = .failed
        }
    }

    /// Tap-to-retry a failed message: flip it back to sending and redeliver.
    /// Text redelivers the body; an attachment re-runs upload+send (or just
    /// re-sends if the upload already succeeded).
    @MainActor
    private func retry(_ localId: String) {
        guard let idx = messages.firstIndex(where: { $0.id == localId }) else { return }
        if case let .text(body) = messages[idx].kind {
            messages[idx].status = .sending
            Task { await deliver(body: body, localId: localId) }
        } else {
            messages[idx].status = .sending
            Task { await deliverAttachment(localId: localId) }
        }
    }

    /// Discard a FAILED / un-sent local message instead of retrying it: drop the
    /// row and clean up any retained attachment file. Never touches the network —
    /// nothing was ever persisted server-side, so there's nothing to delete.
    @MainActor
    private func discard(_ localId: String) {
        if let picked = pendingAttachments[localId] {
            try? FileManager.default.removeItem(at: picked.localURL)
        }
        pendingAttachments[localId] = nil
        uploadedURLs[localId] = nil
        messages.removeAll { $0.id == localId }
        Haptics.light()
    }

    /// Delete one of the athlete's OWN sent messages. Removes it optimistically
    /// (locally + from the cache) then soft-deletes it server-side, author-scoped.
    /// On failure we re-sync so the message reappears rather than silently
    /// vanishing on this device while still living for the coach.
    @MainActor
    private func deleteSentMessage(_ id: String) {
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

    // MARK: - Attachment send

    /// Send a captured/recorded/picked attachment. Guards the client-side size
    /// limit first (friendly error, no wasted upload), then inserts an optimistic
    /// bubble that previews the LOCAL file instantly and drives upload → send.
    private func sendAttachment(_ picked: ChatPickedAttachment) {
        guard ChatAttachmentLimits.withinLimit(kind: picked.kind, bytes: picked.sizeBytes) else {
            Haptics.error()
            attachmentError = ChatAttachmentLimits.overLimitMessage(for: picked.kind)
            return
        }
        Haptics.light()
        let localId = "local-\(UUID().uuidString)"
        pendingAttachments[localId] = picked
        let optimistic = ChatMessage(
            id: localId,
            sender: .me,
            kind: attachmentKind(for: picked, source: ChatAttachmentSource(localURL: picked.localURL)),
            timestamp: ChatMessage.todayLabel,
            status: .pending
        )
        messages.append(optimistic)
        Task { await deliverAttachment(localId: localId) }
    }

    @MainActor
    private func deliverAttachment(localId: String) async {
        guard let bearer, let picked = pendingAttachments[localId] else {
            markFailed(localId: localId)
            return
        }
        setStatus(localId, .sending)
        do {
            // 1. Upload (unless a prior attempt already did) — streams from the file.
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
                // Reflect the remote URL on the optimistic row (the dedup key for
                // the SSE echo) and seed the loader so the server-echoed bubble
                // resolves from our local file instead of re-downloading it.
                setRemoteURL(localId, url)
                await seedLoader(url: url, picked: picked)
            }
            // 2. Send the message referencing the uploaded blob.
            let saved = try await ChatService.sendMessage(
                bearer: bearer, body: nil, attachmentUrl: url,
                attachmentKind: picked.kind, attachmentMeta: picked.meta
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
            // Attachments never enter the blind offline replay queue: the URL only
            // exists post-upload, and the raw-JSON replay can't re-upload the
            // bytes. So ANY failure marks the row failed → tap-to-retry re-runs the
            // (cheap, already-uploaded) send, or re-uploads from the retained file.
            markFailed(localId: localId)
        }
    }

    private func seedLoader(url: String, picked: ChatPickedAttachment) async {
        await ChatMediaLoader.shared.seedLocalFile(remoteURL: url, localFileURL: picked.localURL)
        if picked.kind == .image, let img = UIImage(contentsOfFile: picked.localURL.path) {
            await ChatMediaLoader.shared.seedImage(remoteURL: url, image: img)
        }
    }

    private func attachmentKind(for picked: ChatPickedAttachment, source: ChatAttachmentSource) -> ChatMessage.Kind {
        switch picked.kind {
        case .voice: return .voice(source: source, duration: picked.meta.durationSeconds)
        case .image: return .image(source: source, aspect: picked.meta.aspectRatio)
        case .video: return .video(source: source, duration: picked.meta.durationSeconds)
        case .file:  return .file(source: source, name: picked.filename, sizeBytes: picked.sizeBytes)
        }
    }

    @MainActor
    private func setStatus(_ localId: String, _ status: ChatMessage.Status) {
        if let idx = messages.firstIndex(where: { $0.id == localId }) { messages[idx].status = status }
    }

    /// Attach the uploaded remote URL to the optimistic row while KEEPING its
    /// local file for instant preview.
    @MainActor
    private func setRemoteURL(_ localId: String, _ url: String) {
        guard let idx = messages.firstIndex(where: { $0.id == localId }),
              let picked = pendingAttachments[localId] else { return }
        messages[idx].kind = attachmentKind(
            for: picked,
            source: ChatAttachmentSource(localURL: picked.localURL, remoteURL: url)
        )
    }

    // MARK: - Sender attribution

    private func isMine(_ senderUserId: String) -> Bool {
        // Once we've learned our own id (from a sent message), trust it.
        if let mine = myUserId { return senderUserId == mine }
        // Cold start before the athlete has written: every existing message is
        // the coach's (backend creates the thread on coach's first message, so
        // the athlete never opens to their own un-attributed text).
        return false
    }

    /// `forcedSender` overrides attribution when the caller already knows the
    /// message is ours (e.g. an SSE echo matched to a still-pending local send
    /// before `myUserId` is learned), sidestepping the cold-start race.
    private func mapDTO(_ dto: ChatMessageDTO, forcedSender: ChatMessage.Sender? = nil) -> ChatMessage {
        let sender: ChatMessage.Sender = forcedSender ?? (isMine(dto.senderUserId) ? .me : .coach)
        return ChatMessage(
            id: dto.id,
            sender: sender,
            kind: ChatView.kind(from: dto),
            timestamp: ChatView.relativeLabel(for: dto.createdAt),
            status: .sent
        )
    }

    /// Map a canonical DTO to a render kind. An attachment message (has a URL +
    /// a recognised kind) renders its media from the authenticated remote source;
    /// everything else is text. Voice/video duration + image aspect come from
    /// `attachment_meta` (real now — no more "audio" placeholder).
    private static func kind(from dto: ChatMessageDTO) -> ChatMessage.Kind {
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

    private static func relativeLabel(for date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return ChatMessage.todayLabel }
        if cal.isDateInYesterday(date) { return ChatMessage.yesterdayLabel }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.dateFormat = "d MMM"
        return fmt.string(from: date)
    }

    // MARK: - Coach identity (agnostic display)

    /// Full coach name for the header / empty state, with a neutral fallback.
    private var coachDisplayName: String { coachName ?? "Coach" }

    /// Up to two uppercased initials for the avatar. Empty when unknown →
    /// CoachAvatar renders a person glyph instead of fabricated initials.
    private var coachInitials: String {
        guard let name = coachName else { return "" }
        return name
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first }
            .map { String($0).uppercased() }
            .joined()
    }

    /// The coach's first name, preserving case. Used for the conversational
    /// empty-state prompt and per-message sender attribution. Nil → neutral copy.
    private var coachFirstName: String? {
        guard let first = coachName?.split(separator: " ").first else { return nil }
        return String(first)
    }

    /// Empty-state prompt addressed to the coach by first name, or neutral copy.
    private var emptyPrompt: String {
        if let name = coachFirstName { return "Escribe a \(name) para empezar" }
        return "Escríbele a tu coach para empezar"
    }

    // MARK: - Header
    //
    // Coach identity card (avatar + name + role), mirroring the handoff `chat`
    // header. We deliberately DON'T claim live presence ("en línea") — the
    // backend exposes no coach-presence signal, so asserting it would be
    // fabricated. The role line is the honest substitute. When raised as a
    // sheet, a trailing close button is shown; as the tab root it is omitted.
    private var header: some View {
        HStack(spacing: Theme.Spacing.m) {
            CoachAvatar(initials: coachInitials, size: 36)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(coachDisplayName)
                    .scaledFont(15, weight: .bold, relativeTo: .subheadline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Coach")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: Theme.Spacing.s)
            if isPresented {
                Button(action: { Haptics.light(); dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: 32, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cerrar chat")
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Conversación con \(coachDisplayName)")
    }

    // MARK: - La banda de en medio
    //
    // La estrategia de altura la decide el CONTENIDO, no la pantalla (§6.1): con
    // mensajes `llena` y scrollea; sin ellos el MISMO hueco se reparte y
    // `centra`. Antes el vacío colgaba de un `.padding(.top, 72)` fijo dentro
    // del scroll — ni centrado, ni scrolleable, y con ~460 pt muertos debajo.

    @ViewBuilder
    private var conversationBand: some View {
        if displayMessages.isEmpty {
            CenteredScreen {
                // Spinner ONLY on a true cold load — nothing on screen AND the
                // store has never loaded the history. A cached (even
                // legitimately-empty) conversation skips it.
                if isLoading && !store.chatMessages.hasLoaded {
                    loadingState
                } else if loadFailed {
                    errorState
                } else {
                    emptyState
                }
            }
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        ForEach(displayMessages) { msg in
                            MessageRow(message: msg, coachLabel: coachFirstName ?? "Coach",
                                       bearer: bearer,
                                       onRetry: { retry(msg.id) },
                                       onDiscard: { discard(msg.id) },
                                       onDelete: { deleteSentMessage(msg.id) })
                                .id(msg.id)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.l)
                }
                // Un chat se abre por el final: lo último dicho es lo que traes
                // en la cabeza. Antes sólo saltaba al final cuando LLEGABA un
                // mensaje nuevo, así que abrirlo te dejaba en el principio de
                // toda la historia.
                .onAppear {
                    guard let last = displayMessages.last else { return }
                    DispatchQueue.main.async { proxy.scrollTo(last.id, anchor: .bottom) }
                }
                .onChange(of: displayMessages.count) { _, _ in
                    if let last = displayMessages.last {
                        withAnimation(.easeOut(duration: 0.18)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.m) {
            ProgressView().tint(Theme.Color.muted)
            Text("Cargando conversación…")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyState: some View {
        ChatVacioState(coachInitials: coachInitials, prompt: emptyPrompt) {
            draft = ChatVacioState.conversationStarter
            inputFocused = true
        }
    }

    private var errorState: some View {
        ChatErrorState { Task { await retryLoad() } }
    }

    @MainActor
    private func retryLoad() async {
        isLoading = true
        loadFailed = false
        await loadInitial()
    }

    // MARK: - Input
    //
    // Composer: a pill text field + circular ORANGE send button, per the handoff.
    // Send glyph fills accent (enabled) / sunken (disabled). Wiring unchanged.
    @ViewBuilder
    private var inputRow: some View {
        Group {
            if let picked = composerAttachment {
                pendingAttachmentComposer(picked)
            } else {
                textComposer
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .background(Theme.Color.background)
    }

    /// Normal composer: ＋ attach · text field · orange send ↑.
    private var textComposer: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespaces).isEmpty
        return HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                inputFocused = false
                showAttachMenu = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 40, height: 40)
                    .background(Theme.Color.surface)
                    .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Adjuntar")

            TextField("", text: $draft, prompt: Text("Mensaje…").foregroundColor(Theme.Color.faint))
                .focused($inputFocused)
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(height: 40)
                .background(Theme.Color.surface)
                .overlay(
                    Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(Capsule())
                .submitLabel(.send)
                .onSubmit { send() }
                .accessibilityLabel(coachFirstName.map { "Mensaje para \($0)" } ?? "Mensaje para tu coach")

            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(canSend ? Theme.Color.accentOn : Theme.Color.faint)
                    .frame(width: 40, height: 40)
                    .background(canSend ? Theme.Color.accent : Theme.Color.surfaceElevated)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(!canSend)
            .accessibilityLabel("Enviar mensaje")
        }
    }

    /// Pending-attachment composer: a preview of what's about to be sent, with a
    /// discard ✕ and the orange send ↑. This is the "review then send" gate — the
    /// attachment only leaves the device when the athlete taps send.
    private func pendingAttachmentComposer(_ picked: ChatPickedAttachment) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            PendingAttachmentPreview(picked: picked)
            Spacer(minLength: Theme.Spacing.s)
            Button(action: discardComposerAttachment) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 40, height: 40)
                    .background(Theme.Color.surface)
                    .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Descartar adjunto")

            Button {
                Haptics.light()
                sendComposerAttachment()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(width: 40, height: 40)
                    .background(Theme.Color.accent)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Enviar adjunto")
        }
    }
}

// MARK: - Los dos estados sin conversación
//
// Piezas propias, no `private var` de la vista, por lo mismo que el vacío del
// hub de tests: son estados con vida propia y así se pueden RENDERIZAR en el
// arnés de capturas (§8). Y sobre todo porque son DOS estados, no uno con un
// ternario — que es como estaban, y por eso el error no tenía reintento.

/// El vacío gana SALIDA: un arranque que RELLENA el compositor y lo enfoca. No
/// lo envía — el atleta lo edita y decide. Escribirle al coach en frío es justo
/// lo que cuesta, y una primera frase ya escrita quita ese peso.
struct ChatVacioState: View {
    let coachInitials: String
    /// «Escribe a <coach> para empezar», ya resuelto con el nombre real (o la
    /// versión neutra cuando no lo sabemos — nunca uno inventado).
    let prompt: String
    let onArranque: () -> Void

    /// Primera frase del arranque. Abierta a propósito: el atleta la termina.
    static let conversationStarter = "Hoy me he encontrado…"

    var body: some View {
        RedesignEmptyState(
            title: prompt,
            message: "Aquí van dudas, sensaciones y molestias. Lo que le cuentes cambia el entreno de mañana.",
            exit: .action(title: "Contarle cómo he ido hoy", perform: onArranque),
            // No decimos «en línea»: el backend no expone presencia del coach y
            // afirmarla sería fabricarla (§7).
            note: "Te contesta cuando pueda."
        ) {
            CoachAvatar(initials: coachInitials, size: 56)
        }
    }
}

/// El error, con el reintento que no tenía: antes esta rama reutilizaba el
/// bloque del vacío cambiando sólo el copy, así que el atleta leía «revisa tu
/// conexión» y no tenía nada que tocar.
struct ChatErrorState: View {
    let onReintentar: () -> Void

    var body: some View {
        RedesignEmptyState(
            symbol: "arrow.clockwise",
            title: "No se pudo cargar el chat",
            message: "Revisa tu conexión. Lo que escribas ahora se guarda y sale solo en cuanto vuelvas a tener línea.",
            exit: .action(title: "Reintentar", perform: onReintentar)
        )
    }
}

// MARK: - Pending attachment preview (composer)

/// Compact preview of a picked-but-not-yet-sent attachment: an image thumbnail,
/// or a kind glyph for video/file/voice, plus a title + size/duration line.
/// Purely presentational; the composer owns discard/send.
private struct PendingAttachmentPreview: View {
    let picked: ChatPickedAttachment
    @State private var thumb: UIImage?

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .fill(Theme.Color.surfaceSunken)
                    .frame(width: 44, height: 44)
                if let thumb {
                    Image(uiImage: thumb)
                        .resizable().scaledToFill()
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                } else {
                    Image(systemName: glyph)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                if picked.kind == .video {
                    Image(systemName: "play.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(.black.opacity(0.42))
                        .clipShape(Circle())
                }
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).truncationMode(.middle)
                Text(subtitle)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .task(id: picked.localURL) { await loadThumb() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Adjunto listo para enviar: \(title)")
    }

    private var glyph: String {
        switch picked.kind {
        case .voice: return "waveform"
        case .image: return "photo"
        case .video: return "video.fill"
        case .file:  return "doc.fill"
        }
    }

    private var title: String {
        switch picked.kind {
        case .voice: return "Nota de voz"
        case .image: return "Foto"
        case .video: return "Vídeo"
        case .file:  return picked.filename
        }
    }

    private var subtitle: String {
        if let seconds = picked.meta.durationSeconds { return Formato.clock(seconds) }
        if picked.sizeBytes > 0 { return ByteCountLabel.format(picked.sizeBytes) }
        return "Listo para enviar"
    }

    @MainActor
    private func loadThumb() async {
        guard picked.kind == .image else { return }
        let path = picked.localURL.path
        thumb = await Task.detached { UIImage(contentsOfFile: path) }.value
    }
}

// MARK: - Models

private struct ChatMessage: Identifiable {
    enum Sender { case me, coach }
    enum Kind {
        case text(String)
        case voice(source: ChatAttachmentSource, duration: Double?)
        case image(source: ChatAttachmentSource, aspect: Double?)
        case video(source: ChatAttachmentSource, duration: Double?)
        case file(source: ChatAttachmentSource, name: String, sizeBytes: Int?)
    }
    enum Status: Equatable { case sent, pending, sending, failed }

    let id: String
    let sender: Sender
    // `var` so the optimistic row can gain its remote URL after upload.
    var kind: Kind
    let timestamp: String
    var status: Status

    static let todayLabel = "hoy"
    static let yesterdayLabel = "ayer"

    /// The remote (proxy) URL of this message's attachment, if any — the dedup
    /// key that matches an SSE echo of our own attachment to its optimistic row.
    var remoteAttachmentURL: String? {
        switch kind {
        case .text: return nil
        case .voice(let s, _), .image(let s, _), .video(let s, _): return s.remoteURL
        case .file(let s, _, _): return s.remoteURL
        }
    }

    var isText: Bool { if case .text = kind { return true }; return false }
}

// MARK: - Message row

private struct MessageRow: View {
    let message: ChatMessage
    /// Agnostic coach name (first name) for sender attribution. Provided by the
    /// parent from the chat thread payload, with a neutral fallback. The meta
    /// line lowercases it; VoiceOver uses it as-is.
    let coachLabel: String
    /// Athlete bearer — attachment bubbles need it to load remote media through
    /// the authenticated proxy.
    let bearer: String?
    /// AUDIT — invoked when a FAILED message is tapped, to resend it.
    var onRetry: (() -> Void)? = nil
    /// Long-press action on a FAILED message: discard it (drop the un-sent row)
    /// instead of retrying.
    var onDiscard: (() -> Void)? = nil
    /// Long-press action on the athlete's OWN sent message: delete it.
    var onDelete: (() -> Void)? = nil

    private var isFailed: Bool { message.status == .failed }
    private var isMe: Bool { message.sender == .me }
    /// The athlete may delete only their own, already-sent message.
    private var canDelete: Bool { isMe && message.status == .sent }

    var body: some View {
        HStack(alignment: .bottom, spacing: Theme.Spacing.s) {
            if isMe { Spacer(minLength: Theme.Spacing.xxl) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: Theme.Spacing.xs) {
                bubble
                Text(metaLabel)
                    .font(.system(size: 9, design: .monospaced))
                    .tracking(1.0)
                    .foregroundStyle(isFailed ? Theme.Color.danger : Theme.Color.faint)
            }
            // Long-press menu: retry/discard a failed row, or delete your own sent
            // message. Applied to the bubble column so the lifted preview is just
            // the bubble (iMessage-style), never the full-width row.
            .chatMessageActions(
                isFailed: isFailed,
                canDelete: canDelete,
                onRetry: { onRetry?() },
                onDiscard: { onDiscard?() },
                onDelete: { onDelete?() }
            )

            if message.sender == .coach { Spacer(minLength: Theme.Spacing.xxl) }
        }
        // A failed message is tap-to-retry across the whole row. Non-failed rows
        // add NO row-level gesture, so the interactive bubbles (play / open /
        // zoom) receive taps cleanly.
        .failedRowTap(isFailed) { onRetry?() }
        // Text reads as one combined VoiceOver element; attachment rows keep their
        // children individually reachable (the play / open buttons).
        .modifier(RowAccessibility(isText: message.isText, label: voiceOverLabel,
                                   hint: isFailed ? "No enviado. Toca dos veces para reintentar." : ""))
    }

    private var metaLabel: String {
        let who = isMe ? "tú" : coachLabel.lowercased()
        switch message.status {
        case .sending: return "enviando… · \(who)"
        case .failed:  return "no enviado · toca para reintentar"
        case .pending, .sent: return "\(message.timestamp) · \(who)"
        }
    }

    /// Coherent VoiceOver summary for text rows (attachment rows label their own
    /// bubbles).
    private var voiceOverLabel: String {
        let who = isMe ? "Tú" : coachLabel
        switch message.kind {
        case .text(let body): return "\(who), \(message.timestamp): \(body)"
        case .voice(_, let d):
            let dur = d.map { ", \(Formato.clock($0))" } ?? ""
            return "\(who), \(message.timestamp): nota de voz\(dur)"
        case .image: return "\(who), \(message.timestamp): foto"
        case .video: return "\(who), \(message.timestamp): vídeo"
        case .file(_, let name, _): return "\(who), \(message.timestamp): archivo \(name)"
        }
    }

    @ViewBuilder
    private var bubble: some View {
        switch message.kind {
        case .text(let body):
            Text(body)
                .scaledFont(14, relativeTo: .footnote)
                .foregroundStyle(isMe ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, Theme.Spacing.s)
                .chatBubbleSurface(isMe: isMe)
                .frame(maxWidth: 280, alignment: isMe ? .trailing : .leading)
                .opacity(message.status == .sent ? 1 : 0.6)
        case .voice(let source, let duration):
            ChatVoiceBubble(isMe: isMe, source: source, metaDuration: duration, bearer: bearer)
                .opacity(message.status == .sent ? 1 : 0.85)
        case .image(let source, let aspect):
            ChatImageBubble(isMe: isMe, source: source, aspect: aspect, bearer: bearer)
                .opacity(message.status == .sent ? 1 : 0.85)
        case .video(let source, let duration):
            ChatVideoBubble(isMe: isMe, source: source, metaDuration: duration, bearer: bearer)
                .opacity(message.status == .sent ? 1 : 0.85)
        case .file(let source, let name, let sizeBytes):
            ChatFileBubble(isMe: isMe, source: source, name: name, sizeBytes: sizeBytes, bearer: bearer)
                .opacity(message.status == .sent ? 1 : 0.85)
        }
    }
}

/// Applies the row-level tap only when the message failed, so a healthy row's
/// inner buttons (play / open / zoom) aren't intercepted.
private extension View {
    @ViewBuilder
    func failedRowTap(_ active: Bool, action: @escaping () -> Void) -> some View {
        if active {
            self.contentShape(Rectangle()).onTapGesture(perform: action)
        } else {
            self
        }
    }

    /// Long-press (context) menu for a message bubble. A FAILED row offers
    /// Reintentar + Descartar; the athlete's OWN sent row offers Eliminar. Any
    /// other row (coach's, still-sending) gets no menu, so the gesture never
    /// swallows taps on healthy bubbles' inner controls.
    @ViewBuilder
    func chatMessageActions(
        isFailed: Bool,
        canDelete: Bool,
        onRetry: @escaping () -> Void,
        onDiscard: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        if isFailed {
            self.contextMenu {
                Button { onRetry() } label: { Label("Reintentar", systemImage: "arrow.clockwise") }
                Button(role: .destructive) { onDiscard() } label: { Label("Descartar", systemImage: "trash") }
            }
        } else if canDelete {
            self.contextMenu {
                Button(role: .destructive) { onDelete() } label: { Label("Eliminar mensaje", systemImage: "trash") }
            }
        } else {
            self
        }
    }
}

/// Text rows combine into one VoiceOver element; attachment rows stay `.contain`
/// so their bubble's own controls remain individually accessible.
private struct RowAccessibility: ViewModifier {
    let isText: Bool
    let label: String
    let hint: String
    func body(content: Content) -> some View {
        if isText {
            content
                .accessibilityElement(children: .combine)
                .accessibilityLabel(label)
                .accessibilityHint(hint)
        } else {
            content.accessibilityElement(children: .contain)
        }
    }
}
