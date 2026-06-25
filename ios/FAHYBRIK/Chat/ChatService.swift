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

struct ChatMessageDTO: Decodable, Identifiable, Equatable {
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

struct ChatThreadDTO: Decodable, Equatable {
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
}
