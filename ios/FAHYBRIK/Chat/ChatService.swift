import Foundation

// Athlete-side chat wire. Talks to the existing backend (shipped W2):
//   GET  /api/chat/threads                       → athlete's single thread (auto-created)
//   GET  /api/chat/threads/me/messages?cursor=   → messages, newest-first, cursor-paged
//   POST /api/chat/threads/me/messages           → send (inserts as sender_role='athlete')
//   POST /api/chat/threads/me/read               → mark coach messages read
//
// `me` is accepted by the backend as a synonym for the calling athlete's own id.
// Auth is the athlete bearer token. JSON is snake_case → camelCase via APIClient's
// keyDecodingStrategy, so the DTO uses Swift camelCase property names.

// MARK: - DTOs

// Codable (not just Decodable) so the message history can be cached to disk via
// AppDataStore's `chatMessages` slice (offline-first). It has no custom
// CodingKeys, so the synthesized encode/decode round-trips through the store's
// plain camelCase coder — independent of the API path's snake_case + ISO8601
// strategy used when it's decoded off the wire.
struct ChatMessageDTO: Codable, Identifiable, Equatable {
    let id: String
    let threadId: String
    let senderUserId: String
    let body: String?
    let attachmentUrl: String?
    let attachmentKind: String?
    let createdAt: Date
    let readAt: Date?
    let editedAt: Date?
}

struct ChatThreadDTO: Codable, Equatable {
    let threadId: String
    let coachId: String
    let athleteId: String
    let athleteName: String?
    let coachName: String?
    let lastMessageAt: Date?
    let unreadForAthlete: Int?
    /// Body of the latest message authored BY THE COACH (not the athlete). Drives
    /// the Today coach-note preview. Nil when the coach hasn't messaged yet, or
    /// when their latest message is an attachment with no text.
    let lastCoachMessage: String?
    /// Duration in milliseconds of the coach's latest VOICE note, when present in
    /// the message's attachment metadata. Nil when not a voice note / not stored.
    let lastCoachVoiceDurationMs: Int?

    /// The coach voice-note duration formatted as m:ss for a compact chip
    /// ("Nota de voz · 0:42"). Nil when there's no voice duration.
    var coachVoiceDurationLabel: String? {
        guard let ms = lastCoachVoiceDurationMs, ms > 0 else { return nil }
        let totalSeconds = ms / 1000
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }
}

// MARK: - Wire envelopes

private struct ThreadsResponse: Decodable {
    let threads: [ChatThreadDTO]
}

private struct MessagesResponse: Decodable {
    let threadId: String
    let messages: [ChatMessageDTO]
    let nextCursor: String?
}

private struct SendResponse: Decodable {
    let message: ChatMessageDTO
}

private struct SendBody: Encodable {
    let body: String
}

private struct ReadBody: Encodable {
    let upToMessageId: String
}

// MARK: - Service

enum ChatService {
    // `me` synonym keeps the path athlete-agnostic — the bearer identifies the caller.
    private static let messagesPath = "/api/chat/threads/me/messages"
    private static let readPath = "/api/chat/threads/me/read"
    private static let threadsPath = "/api/chat/threads"
    // Server-Sent Events feed of new messages for the calling principal. The
    // athlete subscribes to their single thread; the server emits one
    // `event: message` per new message (same MessageDTO shape as the REST list)
    // plus a `:` heartbeat every 30s. Consumed by ChatView for real-time
    // delivery, with the 3s REST poll as the automatic fallback.
    private static let streamPath = "/api/chat/stream"

    /// The athlete's single thread (auto-created server-side on first read).
    static func fetchThread(bearer: String) async throws -> ChatThreadDTO? {
        let resp: ThreadsResponse = try await APIClient.shared.get(path: threadsPath, bearer: bearer)
        return resp.threads.first
    }

    /// Newest-first page from the backend; returned oldest-first for the UI.
    static func fetchMessages(bearer: String, cursor: String? = nil) async throws -> [ChatMessageDTO] {
        var path = messagesPath
        if let cursor, !cursor.isEmpty,
           let encoded = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "?cursor=\(encoded)"
        }
        let resp: MessagesResponse = try await APIClient.shared.get(path: path, bearer: bearer)
        return resp.messages.sorted { $0.createdAt < $1.createdAt }
    }

    /// Send a text message. Returns the persisted DTO (carries the real id +
    /// server timestamp + the athlete's own senderUserId).
    static func sendMessage(bearer: String, body: String) async throws -> ChatMessageDTO {
        let resp: SendResponse = try await APIClient.shared.post(
            path: messagesPath,
            body: SendBody(body: body),
            bearer: bearer
        )
        return resp.message
    }

    /// Encode the send body for the offline RequestQueue (snake_case to match
    /// the backend Zod schema; the queue replays the raw bytes verbatim).
    static func encodeSendBody(_ body: String) -> Data? {
        try? JSONEncoder().encode(["body": body])
    }

    static var sendPath: String { messagesPath }

    /// Mark all coach messages up to `messageId` read. Best-effort.
    /// (APIClient encodes with convertToSnakeCase → `up_to_message_id`.)
    static func markRead(bearer: String, upToMessageId: String) async {
        do {
            try await APIClient.shared.postRaw(
                path: readPath,
                body: ReadBody(upToMessageId: upToMessageId),
                bearer: bearer
            )
        } catch {
            // Read receipts are non-critical — never surface to the user.
        }
    }

    // MARK: - Real-time stream (SSE)

    /// Open the chat SSE stream and drive two callbacks:
    ///   * `onReady(threadCount)` once, when the server confirms the
    ///     subscription (carries how many threads the principal is subscribed
    ///     to — 0 means the thread doesn't exist yet, e.g. a brand-new athlete).
    ///   * `onMessage(dto)` for every `event: message` frame.
    ///
    /// Returns normally when the stream closes (server ended / cancelled) and
    /// THROWS on any connection or transport error — the caller treats both as
    /// "realtime dropped" and falls back to REST polling, then retries. The
    /// connection is long-lived; the server's 30s heartbeat keeps it under the
    /// URLSession inter-packet timeout, so we leave the default timeouts alone.
    static func streamMessages(
        bearer: String,
        onReady: (Int) async -> Void,
        onMessage: (ChatMessageDTO) async -> Void
    ) async throws {
        var req = URLRequest(url: APIBase.url.appendingPathComponent(streamPath))
        req.httpMethod = "GET"
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")

        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }

        // Minimal SSE frame parser: accumulate `event:` / `data:` field lines
        // until a blank line dispatches the frame. `:`-prefixed lines are
        // comments (heartbeats) and are ignored. Multiple `data:` lines join
        // with "\n" per the SSE spec.
        var event = ""
        var data = ""
        for try await line in bytes.lines {
            if line.isEmpty {
                switch event {
                case "ready":
                    await onReady(parseReadyThreadCount(data))
                case "message":
                    if let dto = decodeStreamMessage(data) { await onMessage(dto) }
                default:
                    break
                }
                event = ""
                data = ""
                continue
            }
            if line.hasPrefix(":") { continue } // heartbeat / comment
            guard let colon = line.firstIndex(of: ":") else { continue }
            let field = String(line[line.startIndex..<colon])
            var value = String(line[line.index(after: colon)...])
            if value.hasPrefix(" ") { value.removeFirst() }
            switch field {
            case "event": event = value
            case "data":  data += data.isEmpty ? value : "\n" + value
            default:      break
            }
        }
    }

    /// Reuses the shared snake_case + lenient-ISO8601 decode strategy so SSE
    /// frames decode identically to the REST payloads.
    private static let streamDecoder = APIClient.makeJSONDecoder()

    private static func decodeStreamMessage(_ json: String) -> ChatMessageDTO? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? streamDecoder.decode(ChatMessageDTO.self, from: data)
    }

    private static func parseReadyThreadCount(_ json: String) -> Int {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ids = obj["thread_ids"] as? [Any] else { return 0 }
        return ids.count
    }
}
