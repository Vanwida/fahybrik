import SwiftUI

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

    // Bumped to force the live connection (.task below) to tear down and
    // reconnect. Used when the athlete sends their FIRST message: the stream may
    // have connected before the thread existed (0 subscriptions), so we
    // re-subscribe once the thread is created server-side.
    @State private var streamEpoch: Int = 0
    // How many threads the SSE `ready` event reported we're subscribed to. 0
    // until a thread exists (brand-new athlete who hasn't messaged yet).
    @State private var subscribedThreadCount: Int = 0

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Hairline()
                ScrollViewReader { proxy in
                    ScrollView {
                        if displayMessages.isEmpty {
                            // Spinner ONLY on a true cold load — nothing on screen
                            // AND the store has never loaded the history. A cached
                            // (even legitimately-empty) conversation skips it.
                            if isLoading && !store.chatMessages.hasLoaded {
                                loadingState
                            } else {
                                emptyState
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                ForEach(displayMessages) { msg in
                                    MessageRow(message: msg, coachLabel: coachFirstName ?? "Coach",
                                               onRetry: { retry(msg.id) })
                                        .id(msg.id)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                            .padding(.bottom, 14)
                        }
                    }
                    .onChange(of: displayMessages.count) { _, _ in
                        if let last = displayMessages.last {
                            withAnimation(.easeOut(duration: 0.18)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
                Hairline()
                inputRow
            }
        }
        // Keyed on streamEpoch so a first-message reconnect (see `deliver`) tears
        // the live connection down and re-establishes it against the now-existing
        // thread. Cancelled automatically when the view is dismissed.
        .task(id: streamEpoch) {
            seedFromCache()
            await loadInitial()
            await liveLoop()
        }
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
                    onReady: { count in await onStreamReady(threadCount: count) },
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

    /// Stream connected. Record the subscription count and do a one-time REST
    /// catch-up to close any gap between the initial snapshot and the stream
    /// opening (a message could have landed in between).
    @MainActor
    private func onStreamReady(threadCount: Int) async {
        subscribedThreadCount = threadCount
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
        let serverBodies = Set(dtos.compactMap { $0.body })
        let pending = messages.filter { msg in
            guard msg.status != .sent, case let .text(body) = msg.kind else { return false }
            return !serverBodies.contains(body)
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
            // First message for a brand-new athlete: the stream connected before
            // the thread existed (0 subscriptions), so reconnect to subscribe to
            // the freshly-created thread and receive the coach's replies live.
            if subscribedThreadCount == 0 { streamEpoch += 1 }
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
    @MainActor
    private func retry(_ localId: String) {
        guard let idx = messages.firstIndex(where: { $0.id == localId }),
              case let .text(body) = messages[idx].kind else { return }
        messages[idx].status = .sending
        Task { await deliver(body: body, localId: localId) }
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
        let kind: ChatMessage.Kind
        if dto.attachmentKind == "voice" {
            kind = .voice(durationLabel: ChatView.voiceDurationLabel(from: dto))
        } else {
            kind = .text(dto.body ?? "")
        }
        return ChatMessage(
            id: dto.id,
            sender: sender,
            kind: kind,
            timestamp: ChatView.relativeLabel(for: dto.createdAt),
            status: .sent
        )
    }

    private static func voiceDurationLabel(from dto: ChatMessageDTO) -> String {
        // Voice metadata isn't decoded into the DTO yet; show a neutral marker.
        "audio"
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
        HStack(spacing: 12) {
            CoachAvatar(initials: coachInitials, size: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text(coachDisplayName)
                    .scaledFont(15, weight: .bold, relativeTo: .subheadline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Coach")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 8)
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
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Conversación con \(coachDisplayName)")
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: 10) {
            ProgressView().tint(Theme.Color.muted)
            Text("Cargando conversación…")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            CoachAvatar(initials: coachInitials, size: 56)
            Text(loadFailed ? "No se pudo cargar el chat" : emptyPrompt)
                .scaledFont(15, weight: .bold, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text(loadFailed
                 ? "Revisa tu conexión. Tus mensajes se enviarán cuando vuelvas."
                 : "Tu coach responde aquí. Dudas, RPE, sensaciones.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 72)
    }

    // MARK: - Input
    //
    // Composer: a pill text field + circular ORANGE send button, per the handoff.
    // Send glyph fills accent (enabled) / sunken (disabled). Wiring unchanged.
    private var inputRow: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespaces).isEmpty
        return HStack(spacing: 10) {
            TextField("", text: $draft, prompt: Text("Mensaje…").foregroundColor(Theme.Color.faint))
                .focused($inputFocused)
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, 16)
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
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .background(Theme.Color.background)
    }
}

// MARK: - Models

private struct ChatMessage: Identifiable {
    enum Sender { case me, coach }
    enum Kind {
        case text(String)
        case voice(durationLabel: String)
    }
    enum Status: Equatable { case sent, pending, sending, failed }

    let id: String
    let sender: Sender
    let kind: Kind
    let timestamp: String
    var status: Status

    static let todayLabel = "hoy"
    static let yesterdayLabel = "ayer"
}

// MARK: - Message row

private struct MessageRow: View {
    let message: ChatMessage
    /// Agnostic coach name (first name) for sender attribution. Provided by the
    /// parent from the chat thread payload, with a neutral fallback. The meta
    /// line lowercases it; VoiceOver uses it as-is.
    let coachLabel: String
    /// AUDIT — invoked when a FAILED message is tapped, to resend it.
    var onRetry: (() -> Void)? = nil

    private var isFailed: Bool { message.status == .failed }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.sender == .me { Spacer(minLength: 40) }

            VStack(alignment: message.sender == .me ? .trailing : .leading, spacing: 4) {
                bubble
                Text(metaLabel)
                    .font(.system(size: 9, design: .monospaced))
                    .tracking(1.0)
                    .foregroundStyle(isFailed ? Theme.Color.danger : Theme.Color.faint)
            }

            if message.sender == .coach { Spacer(minLength: 40) }
        }
        // A failed message is tap-to-retry; other statuses ignore the tap.
        .contentShape(Rectangle())
        .onTapGesture { if isFailed { onRetry?() } }
        // Read the whole row as one coherent VoiceOver element instead of
        // "meta, text" fragments. Voice notes set their own label on `bubble`.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(voiceOverLabel)
        .accessibilityHint(isFailed ? "No enviado. Toca dos veces para reintentar." : "")
    }

    private var metaLabel: String {
        let who = message.sender == .me ? "tú" : coachLabel.lowercased()
        switch message.status {
        case .sending: return "enviando… · \(who)"
        case .failed:  return "no enviado · toca para reintentar"
        case .pending, .sent: return "\(message.timestamp) · \(who)"
        }
    }

    /// Coherent VoiceOver summary: who, when, and the message content.
    private var voiceOverLabel: String {
        let who = message.sender == .me ? "Tú" : coachLabel
        switch message.kind {
        case .text(let body):
            return "\(who), \(message.timestamp): \(body)"
        case .voice(let duration):
            return "\(who), \(message.timestamp): nota de voz, \(duration)"
        }
    }

    @ViewBuilder
    private var bubble: some View {
        switch message.kind {
        case .text(let body):
            Text(body)
                .scaledFont(14, relativeTo: .footnote)
                .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
                .overlay {
                    // Received bubbles get a hairline seam (handoff `#283341`
                    // border); sent bubbles are a solid orange fill, no border.
                    if message.sender == .coach {
                        BubbleShape(isMe: false).stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                    }
                }
                .clipShape(BubbleShape(isMe: message.sender == .me))
                .frame(maxWidth: 280, alignment: message.sender == .me ? .trailing : .leading)
                .opacity(message.status == .sent ? 1 : 0.6)
        case .voice(let durationLabel):
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.accentText)
                Waveform(filledColor: message.sender == .me ? Theme.Color.accentOn : Theme.Color.foreground)
                    .frame(width: 90, height: 18)
                Text(durationLabel)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.muted)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
            .overlay {
                if message.sender == .coach {
                    BubbleShape(isMe: false).stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                }
            }
            .clipShape(BubbleShape(isMe: message.sender == .me))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Nota de voz, \(durationLabel)")
        }
    }
}

private struct Waveform: View {
    let filledColor: Color
    private static let bars: [CGFloat] = [0.32, 0.55, 0.82, 0.65, 0.42, 0.74, 0.52, 0.88, 0.62, 0.45, 0.72, 0.55]

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(Array(Self.bars.enumerated()), id: \.offset) { _, h in
                Capsule()
                    .fill(filledColor.opacity(0.85))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .scaleEffect(y: h, anchor: .center)
            }
        }
    }
}

// Asymmetric bubble matching the handoff: the "tail" corner is the TOP corner
// on the speaker's side — received = top-leading flattened (4pt), sent =
// top-trailing flattened (4pt). All other corners 14pt.
private struct BubbleShape: Shape {
    let isMe: Bool
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 14
        let small: CGFloat = 4
        let topLeft     = isMe ? radius : small
        let topRight    = isMe ? small  : radius
        let bottomLeft  = radius
        let bottomRight = radius
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + topLeft, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - topRight, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - topRight, y: rect.minY + topRight),
                 radius: topRight, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottomRight))
        p.addArc(center: CGPoint(x: rect.maxX - bottomRight, y: rect.maxY - bottomRight),
                 radius: bottomRight, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY - bottomLeft),
                 radius: bottomLeft, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeft))
        p.addArc(center: CGPoint(x: rect.minX + topLeft, y: rect.minY + topLeft),
                 radius: topLeft, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}
