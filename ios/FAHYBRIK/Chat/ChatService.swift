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

// AUDIT — how a FAILED chat send is treated. A DETERMINISTIC 4xx marks the message
// failed (visible, tap-to-retry) WITHOUT queueing it (it would replay forever); a
// TRANSIENT failure (offline / network / 5xx / timeout) queues for offline replay.
// Pure so the transition is unit-tested.
enum ChatSendOutcome: Equatable {
    case queueForReplay
    case markFailed

    static func forError(_ error: Error) -> ChatSendOutcome {
        RequestQueue.isRetriable(error) ? .queueForReplay : .markFailed
    }
}

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
    /// Attachment metadata (duration/size/mime/dimensions). Optional + all-optional
    /// fields, so it decodes both off the wire (snake_case) and from the disk cache
    /// (camelCase) — see ChatAttachmentMeta. Absent on text-only messages.
    let attachmentMeta: ChatAttachmentMeta?
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
    @LossyArray var threads: [ChatThreadDTO]
}

private struct MessagesResponse: Decodable {
    let threadId: String
    /// AUDIT-B3 — a single message with a malformed date/shape is dropped, not the
    /// whole conversation history.
    @LossyArray var messages: [ChatMessageDTO]
    let nextCursor: String?
}

private struct SendResponse: Decodable {
    let message: ChatMessageDTO
}

// Mirrors sendMessageSchema (web/lib/chat/schema.ts): body OR attachment_url
// required; attachment_kind required when attachment_url is present. Nil fields
// are omitted by the synthesized encoder (encodeIfPresent), so a text send emits
// just `body` and an attachment send emits `attachment_url/kind/meta`. The
// APIClient encoder's convertToSnakeCase maps every key (incl. nested meta:
// durationMs→duration_ms) to the wire shape.
private struct SendBody: Encodable {
    let body: String?
    let attachmentUrl: String?
    let attachmentKind: String?
    let attachmentMeta: ChatAttachmentMeta?
}

// POST /api/chat/upload response — { url, mime_type, size_bytes, kind }.
struct ChatUploadResult: Decodable, Equatable {
    let url: String
    let mimeType: String
    let sizeBytes: Int
    let kind: String
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
    // Multipart attachment upload — returns a proxy URL the message then references.
    private static let uploadPath = "/api/chat/upload"
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

    /// Send a message — text and/or an already-uploaded attachment. Returns the
    /// persisted DTO (real id + server timestamp + the athlete's own
    /// senderUserId). For an attachment, pass the `attachment_url` returned by
    /// `uploadAttachment` plus its kind + meta; body may be nil.
    static func sendMessage(
        bearer: String,
        body: String? = nil,
        attachmentUrl: String? = nil,
        attachmentKind: ChatAttachmentKind? = nil,
        attachmentMeta: ChatAttachmentMeta? = nil
    ) async throws -> ChatMessageDTO {
        let resp: SendResponse = try await APIClient.shared.post(
            path: messagesPath,
            body: SendBody(
                body: body,
                attachmentUrl: attachmentUrl,
                attachmentKind: attachmentKind?.rawValue,
                attachmentMeta: attachmentMeta
            ),
            bearer: bearer
        )
        return resp.message
    }

    /// Upload an attachment file to /api/chat/upload (multipart: `file` + `kind`
    /// + `filename`). The multipart envelope is written to a temp file and
    /// STREAMED via `upload(for:fromFile:)`, so a 200 MB video is never buffered
    /// in memory. Returns the proxy `url` + server-confirmed size/mime, which the
    /// caller then references in `sendMessage`.
    static func uploadAttachment(
        bearer: String,
        kind: ChatAttachmentKind,
        fileURL: URL,
        filename: String,
        mimeType: String
    ) async throws -> ChatUploadResult {
        let boundary = "Boundary-\(UUID().uuidString)"
        let bodyFile = try buildMultipartBodyFile(
            boundary: boundary, kind: kind.rawValue,
            filename: filename, mimeType: mimeType, payloadURL: fileURL
        )
        defer { try? FileManager.default.removeItem(at: bodyFile) }

        var req = URLRequest(url: APIBase.url.appendingPathComponent(uploadPath))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")

        let (data, resp) = try await URLSession.shared.upload(for: req, fromFile: bodyFile)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode, data) }
        return try uploadDecoder.decode(ChatUploadResult.self, from: data)
    }

    private static let uploadDecoder = APIClient.makeJSONDecoder()

    /// Streams a `multipart/form-data` envelope to a temp file: the `kind` +
    /// `filename` text fields, then the `file` part with the payload copied in
    /// 1 MB chunks (never fully in memory). Caller uploads the returned file.
    private static func buildMultipartBodyFile(
        boundary: String, kind: String, filename: String, mimeType: String, payloadURL: URL
    ) throws -> URL {
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("chat-upload-\(UUID().uuidString).multipart")
        FileManager.default.createFile(atPath: tmp.path, contents: nil)
        let out = try FileHandle(forWritingTo: tmp)
        defer { try? out.close() }

        func write(_ s: String) throws { try out.write(contentsOf: Data(s.utf8)) }
        // Quotes would break the Content-Disposition header.
        let safeName = filename.replacingOccurrences(of: "\"", with: "")

        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\n\(kind)\r\n")
        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"filename\"\r\n\r\n\(safeName)\r\n")
        try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: \(mimeType)\r\n\r\n")

        let reader = try FileHandle(forReadingFrom: payloadURL)
        defer { try? reader.close() }
        while let chunk = try reader.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            try out.write(contentsOf: chunk)
        }
        try write("\r\n--\(boundary)--\r\n")
        return tmp
    }

    static var sendPath: String { messagesPath }

    /// Serialize a TEXT send for the offline replay queue (attachment sends aren't
    /// queued — their bytes can't be re-uploaded blind). `{"body": "..."}` matches
    /// sendMessageSchema directly; body needs no snake_case conversion.
    static func encodeSendBody(_ body: String) -> Data? {
        try? JSONEncoder().encode(["body": body])
    }

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
