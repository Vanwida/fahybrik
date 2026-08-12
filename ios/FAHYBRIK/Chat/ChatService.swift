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
    /// Sobre qué es el mensaje, cuando el que lo escribió lo señaló. Ausente en
    /// una conversación a secas, que es la mayoría — y era el caso único hasta
    /// hoy, así que los mensajes viejos decodifican igual. Sus claves son de una
    /// sola palabra (kind/ref/sub/label), así que atraviesan sin cambios tanto el
    /// coder snake_case del cable como el camelCase plano del caché en disco.
    let context: ChatContextRef?
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
        return Formato.clock(ms / 1000)
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
    /// Sobre qué va. Nunca lleva etiqueta: la escribe el servidor, que es quien
    /// ya carga la entidad para comprobar que es de este atleta.
    let context: ChatContextTarget?
}

/// What `uploadAttachment` hands back to the send path: the authenticated proxy
/// URL the message references, plus the confirmed mime/size.
// Decodable is kept (the app builds this value by hand since the move to presigned
// PUTs, but the wire shape is still asserted in ChatAttachmentTests — dropping the
// conformance silently broke the whole iOS test target's compilation).
struct ChatUploadResult: Equatable, Decodable {
    let url: String
    let mimeType: String
    let sizeBytes: Int
    let kind: String
}

// POST /api/chat/upload-url response — the server validates the announced file
// and presigns a direct-to-storage PUT. `uploadUrl` is where the bytes go;
// `attachmentUrl` is what the message references; `contentType` is the EXACT
// Content-Type the PUT must declare (it is baked into the signature).
private struct ChatUploadTarget: Decodable {
    let uploadUrl: String
    let attachmentUrl: String
    let contentType: String
}

// Mirrors uploadUrlSchema (web/app/api/chat/upload-url/route.ts). The athlete
// principal derives the folder from the bearer, so no athlete_id is sent.
private struct UploadUrlBody: Encodable {
    let kind: String
    let filename: String
    let mimeType: String
    let sizeBytes: Int
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
    // Presigned attachment upload: ask for a one-shot upload URL, then PUT the
    // bytes DIRECTLY to storage. They can't travel through our API — the
    // platform caps any function body at ~4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE),
    // which is why the old multipart route could never carry a big photo, let
    // alone a video.
    private static let uploadUrlPath = "/api/chat/upload-url"
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
        attachmentMeta: ChatAttachmentMeta? = nil,
        context: ChatContextTarget? = nil
    ) async throws -> ChatMessageDTO {
        let resp: SendResponse = try await APIClient.shared.post(
            path: messagesPath,
            body: SendBody(
                body: body,
                attachmentUrl: attachmentUrl,
                attachmentKind: attachmentKind?.rawValue,
                attachmentMeta: attachmentMeta,
                context: context
            ),
            bearer: bearer
        )
        return resp.message
    }

    /// Upload an attachment in two steps: ask /api/chat/upload-url for a
    /// presigned target (the server validates kind/extension/size and pins the
    /// destination path), then PUT the file DIRECTLY to storage — streamed via
    /// `upload(for:fromFile:)`, so a 200 MB video is never buffered in memory.
    /// Returns the proxy `url` + confirmed size/mime, which the caller then
    /// references in `sendMessage`.
    static func uploadAttachment(
        bearer: String,
        kind: ChatAttachmentKind,
        fileURL: URL,
        filename: String,
        mimeType: String
    ) async throws -> ChatUploadResult {
        let sizeBytes = (try? FileManager.default
            .attributesOfItem(atPath: fileURL.path)[.size] as? Int).flatMap { $0 } ?? 0

        // 1. The server validates the announced file and presigns the destination.
        let target: ChatUploadTarget = try await APIClient.shared.post(
            path: uploadUrlPath,
            body: UploadUrlBody(
                kind: kind.rawValue, filename: filename,
                mimeType: mimeType, sizeBytes: sizeBytes
            ),
            bearer: bearer
        )
        guard let uploadURL = URL(string: target.uploadUrl) else { throw APIError.invalidResponse }

        // 2. Bytes go straight to storage. The Content-Type must be EXACTLY the
        // one the server signed, or storage rejects the PUT.
        var put = URLRequest(url: uploadURL)
        put.httpMethod = "PUT"
        put.setValue(target.contentType, forHTTPHeaderField: "Content-Type")
        let (data, resp) = try await URLSession.shared.upload(for: put, fromFile: fileURL)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode, data) }

        return ChatUploadResult(
            url: target.attachmentUrl,
            mimeType: target.contentType,
            sizeBytes: sizeBytes,
            kind: kind.rawValue
        )
    }

    static var sendPath: String { messagesPath }

    /// Serialize a TEXT send for the offline replay queue (attachment sends aren't
    /// queued — their bytes can't be re-uploaded blind). `{"body": "..."}` matches
    /// sendMessageSchema directly; body needs no snake_case conversion.
    static func encodeSendBody(_ body: String, context: ChatContextTarget? = nil) -> Data? {
        // Sin contexto se mantiene EXACTAMENTE el cuerpo de siempre. Con contexto
        // viaja también, porque un reintento que perdiera el sujeto entregaría al
        // coach una pregunta suelta — justo lo que esto venía a arreglar. Las
        // claves ya son las del cable (una palabra cada una), así que este
        // codificador no necesita la conversión a snake_case del APIClient.
        guard let context else { return try? JSONEncoder().encode(["body": body]) }
        return try? JSONEncoder().encode(EncoladoConContexto(body: body, context: context))
    }

    private struct EncoladoConContexto: Encodable {
        let body: String
        let context: ChatContextTarget
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

    /// Delete one of the athlete's OWN messages (author-scoped soft delete). The
    /// backend verifies the caller authored the message AND that it belongs to
    /// their thread, so this can only ever remove the athlete's own message.
    /// Throws on any non-2xx (caller restores on failure). `me` keeps the path
    /// athlete-agnostic; the bearer identifies the author.
    static func deleteMessage(bearer: String, messageId: String) async throws {
        let encoded = messageId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? messageId
        let _: Empty = try await APIClient.shared.delete(
            path: "\(messagesPath)/\(encoded)",
            body: Optional<Empty>.none,
            bearer: bearer
        )
    }

    // MARK: - Real-time stream (SSE)

    /// Open the chat SSE stream and drive two callbacks:
    ///   * `onReady()` once, when the server confirms the subscription. The
    ///     server subscribes us by OWNER (this athlete), not by a list of thread
    ///     ids resolved at connect time, so a thread created afterwards — our own
    ///     first message — is covered without reconnecting.
    ///   * `onMessage(dto)` for every `event: message` frame.
    ///
    /// Returns normally when the stream closes (server ended / cancelled) and
    /// THROWS on any connection or transport error — the caller treats both as
    /// "realtime dropped" and falls back to REST polling, then retries. The
    /// connection is long-lived; the server's 30s heartbeat keeps it under the
    /// URLSession inter-packet timeout, so we leave the default timeouts alone.
    static func streamMessages(
        bearer: String,
        onReady: () async -> Void,
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
                    await onReady()
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
}
