import Foundation

// EL MENSAJE DE LA CONVERSACIÓN tal como lo pinta el chat.
//
// No es el DTO del servidor (`ChatMessageDTO`): es lo que la pantalla necesita para dibujar UNA fila, y por eso
// admite lo que el servidor no conoce todavía (una fila optimista, un adjunto que aún sube, un envío caído).
// Vive fuera de `ChatView` porque lo leen la fila, la lista y la lectura pura (`ChatLectura`).

struct ChatMessage: Identifiable {
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
    /// `var` porque la fila optimista gana su URL remota cuando el adjunto termina de subir.
    var kind: Kind
    let timestamp: String
    var status: Status
    /// Sobre qué es. Con etiqueta local mientras el mensaje es optimista, con la del servidor en cuanto se
    /// confirma. Nil en una conversación a secas.
    var contexto: ChatContextRef? = nil

    static let todayLabel = "hoy"
    static let yesterdayLabel = "ayer"

    /// La URL remota (proxy) del adjunto, si lo hay: la clave que empareja el eco SSE de un adjunto propio con su
    /// fila optimista.
    var remoteAttachmentURL: String? {
        switch kind {
        case .text: return nil
        case .voice(let s, _), .image(let s, _), .video(let s, _): return s.remoteURL
        case .file(let s, _, _): return s.remoteURL
        }
    }

    var isText: Bool { if case .text = kind { return true }; return false }

    var esMio: Bool { sender == .me }
}
