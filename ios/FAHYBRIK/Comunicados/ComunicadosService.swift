import Foundation

// El cable de los comunicados, lado atleta. Habla con lo ya desplegado:
//
//   GET  /api/athlete/communications                → LA BANDEJA (ya ordenada)
//   POST /api/athlete/communications/{id}/seen      → abierto
//   POST /api/athlete/communications/{id}/done      → tarea cerrada · protocolo entero
//   POST /api/athlete/communications/{id}/answer    → { item_id }
//   POST /api/athlete/communications/{id}/marks     → { item_id, done }
//
// Mismo patrón que `ChatService`: `enum` sin estado, bearer del atleta y decode
// snake_case → camelCase por la estrategia compartida de `APIClient`.
//
// El ORDEN de la bandeja lo pone el servidor (el dominio compartido decide qué
// es urgente) y aquí se pinta tal cual llega: reordenarlo en el cliente sería
// tener dos criterios de urgencia, y el del teléfono ganaría por accidente.

// MARK: - Cuerpos

// `item_id` explícito en snake_case: son los nombres que valida el servidor, y
// estos cuerpos también viajan por la cola sin conexión —donde se envían tal
// cual se guardaron, sin pasar por el codificador que convierte a snake_case.
private struct AnswerBody: Encodable {
    let item_id: String
}

private struct MarkBody: Encodable {
    let item_id: String
    let done: Bool
}

/// Un «visto» y un «hecho» no llevan cuerpo. El servidor acepta el vacío, pero
/// la cola sin conexión reenvía bytes guardados y necesita JSON válido: `{}`.
private struct EmptyBody: Encodable {}

// MARK: - Servicio

enum ComunicadosService {
    static let inboxPath = "/api/athlete/communications"

    /// LA BANDEJA. Lo que el coach ha publicado a este atleta y sigue vivo.
    static func fetchInbox(bearer: String) async throws -> ComunicadosInbox {
        try await APIClient.shared.get(path: inboxPath, bearer: bearer)
    }

    /// Abrirlo. No cierra nada: un push abierto no es una tarea hecha.
    static func markSeen(bearer: String, id: String) async throws -> ComunicadoRecipientState {
        try await APIClient.shared.post(path: actPath(id, "seen"), body: EmptyBody(), bearer: bearer)
    }

    /// Cerrar una tarea, o dar por hecho un protocolo entero.
    static func markDone(bearer: String, id: String) async throws -> ComunicadoRecipientState {
        try await APIClient.shared.post(path: actPath(id, "done"), body: EmptyBody(), bearer: bearer)
    }

    /// Elegir una opción. Es el acto que cierra una pregunta — nunca «hecho».
    static func answer(
        bearer: String,
        id: String,
        itemId: String
    ) async throws -> ComunicadoRecipientState {
        try await APIClient.shared.post(
            path: actPath(id, "answer"),
            body: AnswerBody(item_id: itemId),
            bearer: bearer
        )
    }

    /// Marcar o desmarcar UN paso del protocolo. Cuando no queda ninguno sin
    /// marcar, el protocolo queda hecho solo (lo deriva el servidor).
    static func setMark(
        bearer: String,
        id: String,
        itemId: String,
        done: Bool
    ) async throws -> ComunicadoRecipientState {
        try await APIClient.shared.post(
            path: actPath(id, "marks"),
            body: MarkBody(item_id: itemId, done: done),
            bearer: bearer
        )
    }

    // MARK: - Rutas y cuerpos para la cola sin conexión

    /// La ruta de un acto. El id viene del servidor (siempre dígitos), pero se
    /// escapa igual: construir una ruta concatenando texto sin escapar es cómo
    /// nace el primer bug de este tipo.
    static func actPath(_ id: String, _ acto: String) -> String {
        let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return "\(inboxPath)/\(escaped)/\(acto)"
    }

    /// Los cuerpos que la cola guarda en disco y reenvía VERBATIM. Se codifican
    /// aquí, con las mismas claves que el servidor valida, para que el reenvío
    /// no dependa de que el DTO en memoria siga existiendo.
    static func encodeEmptyBody() -> Data? { try? JSONEncoder().encode(EmptyBody()) }

    static func encodeAnswerBody(itemId: String) -> Data? {
        try? JSONEncoder().encode(AnswerBody(item_id: itemId))
    }

    static func encodeMarkBody(itemId: String, done: Bool) -> Data? {
        try? JSONEncoder().encode(MarkBody(item_id: itemId, done: done))
    }
}

// MARK: - Qué hacer con un acto que falla

/// Un acto sobre un comunicado que no llegó.
///
/// La misma lectura que hace el chat con un mensaje fallido, y por la misma
/// razón: un 4xx DETERMINISTA (el comunicado ya no existe, ese paso no es de
/// este comunicado, una nota no se marca hecha) fallaría idéntico al reenviarlo
/// y no puede entrar en la cola — se quedaría reintentando para siempre. Lo
/// transitorio (sin cobertura, 5xx, timeout) sí: el atleta marcó su
/// calentamiento en el pasillo de boxes, y ese acto tiene que llegar cuando
/// vuelva la señal.
enum ComunicadoActOutcome: Equatable {
    /// Se guarda y se reenvía sola en cuanto haya conexión.
    case queueForReplay
    /// No se puede reenviar: se deshace el cambio y se dice honestamente.
    case revert

    static func forError(_ error: Error) -> ComunicadoActOutcome {
        RequestQueue.isRetriable(error) ? .queueForReplay : .revert
    }
}
