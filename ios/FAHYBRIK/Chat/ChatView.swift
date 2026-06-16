import SwiftUI

// Chat tab — direct thread between the athlete and Pablo Casals (coach Fabrik).
// Backed by the live chat API (ChatService): messages load on appear, poll while
// the view is visible, and sends are optimistic with an offline queue fallback.
// Voice notes render a static waveform + duration. Castilian throughout.
struct ChatView: View {
    let bearer: String?

    @Environment(\.dismiss) private var dismiss

    @State private var messages: [ChatMessage] = []
    @State private var draft: String = ""
    @State private var isLoading: Bool = true
    @State private var loadFailed: Bool = false
    @FocusState private var inputFocused: Bool

    // The athlete's own user id, learned from the first message they send (the
    // POST response carries senderUserId). Persisted so sender attribution is
    // stable across launches without a backend round-trip for "who am I".
    @State private var myUserId: String? = UserDefaults.standard.string(forKey: Self.myUserIdKey)
    private static let myUserIdKey = "fahybrik.chat.myUserId"

    // Poll cadence while the conversation is on screen. Single source of truth
    // for the polling interval (no SSE on iOS yet; see note below). 3s halves
    // perceived reply latency vs the prior 6s without tripling backend load.
    // Long-term fix: consume the backend SSE stream (/api/chat/stream) instead
    // of polling — currently exposed server-side but ignored by iOS.
    private static let pollInterval: Duration = .seconds(3)

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Hairline()
                ScrollViewReader { proxy in
                    ScrollView {
                        if isLoading && messages.isEmpty {
                            loadingState
                        } else if messages.isEmpty {
                            emptyState
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                ForEach(messages) { msg in
                                    MessageRow(message: msg)
                                        .id(msg.id)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                        }
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last {
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
        .task {
            await loadInitial()
            await pollLoop()
        }
    }

    // MARK: - Data flow

    @MainActor
    private func loadInitial() async {
        guard let bearer else { isLoading = false; return }
        do {
            let dtos = try await ChatService.fetchMessages(bearer: bearer)
            messages = dtos.map { mapDTO($0) }
            loadFailed = false
            await markReadIfNeeded(dtos: dtos)
        } catch {
            loadFailed = true
        }
        isLoading = false
    }

    /// Poll for new messages while the view is alive. Cancelled automatically
    /// when the `.task` is torn down (view dismissed).
    private func pollLoop() async {
        guard bearer != nil else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: Self.pollInterval)
            if Task.isCancelled { return }
            await refresh()
        }
    }

    @MainActor
    private func refresh() async {
        guard let bearer else { return }
        do {
            let dtos = try await ChatService.fetchMessages(bearer: bearer)
            reconcile(with: dtos)
            loadFailed = false
            await markReadIfNeeded(dtos: dtos)
        } catch {
            // Transient poll failure — keep showing what we have.
        }
    }

    /// Merge server truth with any optimistic (still-sending) local messages.
    /// Server messages win; local pending ones not yet confirmed are appended.
    @MainActor
    private func reconcile(with dtos: [ChatMessageDTO]) {
        let serverMessages = dtos.map { mapDTO($0) }
        let serverBodies = Set(dtos.compactMap { $0.body })
        // Keep optimistic messages that the server hasn't echoed back yet.
        let pending = messages.filter { msg in
            if case .pending = msg.status, case let .text(body) = msg.kind {
                return !serverBodies.contains(body)
            }
            return false
        }
        messages = serverMessages + pending
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
            // Replace the optimistic row with the persisted one.
            if let idx = messages.firstIndex(where: { $0.id == localId }) {
                messages[idx] = mapDTO(saved)
            }
        } catch {
            await enqueueOffline(body: body, localId: localId)
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

    // MARK: - Sender attribution

    private func isMine(_ senderUserId: String) -> Bool {
        // Once we've learned our own id (from a sent message), trust it.
        if let mine = myUserId { return senderUserId == mine }
        // Cold start before the athlete has written: every existing message is
        // the coach's (backend creates the thread on coach's first message, so
        // the athlete never opens to their own un-attributed text).
        return false
    }

    private func mapDTO(_ dto: ChatMessageDTO) -> ChatMessage {
        let sender: ChatMessage.Sender = isMine(dto.senderUserId) ? .me : .coach
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

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: { Haptics.light(); dismiss() }) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 32, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar chat")
            ZStack {
                Circle().fill(Theme.Color.surface).frame(width: 36, height: 36)
                Text("PC")
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Pablo Casals")
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Coach Fabrik")
                    .scaledFont(10, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
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
        VStack(spacing: 8) {
            Text(loadFailed ? "No se pudo cargar el chat" : "Escribe a Pablo para empezar")
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
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
        .padding(.top, 80)
    }

    // MARK: - Input

    private var inputRow: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespaces).isEmpty
        return HStack(spacing: 8) {
            TextField("", text: $draft, prompt: Text("Escribe a Pablo…").foregroundColor(Theme.Color.muted))
                .focused($inputFocused)
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .submitLabel(.send)
                .onSubmit { send() }
                .accessibilityLabel("Mensaje para Pablo")

            Button(action: send) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(canSend ? Theme.Color.accent : Theme.Color.muted)
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .accessibilityLabel("Enviar mensaje")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
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
    enum Status { case sent, pending, sending }

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

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.sender == .me { Spacer(minLength: 40) }

            VStack(alignment: message.sender == .me ? .trailing : .leading, spacing: 4) {
                Text(metaLabel)
                    .font(.system(size: 9, design: .monospaced))
                    .tracking(1.0)
                    .foregroundStyle(Theme.Color.muted)
                bubble
            }

            if message.sender == .coach { Spacer(minLength: 40) }
        }
        // Read the whole row as one coherent VoiceOver element instead of
        // "meta, text" fragments. Voice notes set their own label on `bubble`.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(voiceOverLabel)
    }

    private var metaLabel: String {
        let who = message.sender == .me ? "tú" : "pablo"
        switch message.status {
        case .sending: return "enviando… · \(who)"
        case .pending, .sent: return "\(message.timestamp) · \(who)"
        }
    }

    /// Coherent VoiceOver summary: who, when, and the message content.
    private var voiceOverLabel: String {
        let who = message.sender == .me ? "Tú" : "Pablo"
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
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
                .clipShape(BubbleShape(isMe: message.sender == .me))
                .frame(maxWidth: 280, alignment: message.sender == .me ? .trailing : .leading)
                .opacity(message.status == .sent ? 1 : 0.6)
        case .voice(let durationLabel):
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.accent)
                Waveform(filledColor: message.sender == .me ? Theme.Color.accentOn : Theme.Color.foreground)
                    .frame(width: 90, height: 18)
                Text(durationLabel)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(message.sender == .me ? Theme.Color.accentOn : Theme.Color.muted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
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

private struct BubbleShape: Shape {
    let isMe: Bool
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 14
        let small: CGFloat = 4
        let topLeft     = isMe ? radius : radius
        let topRight    = isMe ? radius : radius
        let bottomLeft  = isMe ? radius : small
        let bottomRight = isMe ? small  : radius
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
