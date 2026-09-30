import Foundation

// LO QUE EL CHAT DECIDE, FUERA DE LA VISTA.
//
// Las vistas del chat PINTAN lo que aquí se resuelve: qué banda ocupa el hueco de en medio, cómo se llama el coach
// (y qué se pone cuando no lo sabemos), qué dice el pie de cada mensaje y qué lee VoiceOver. Son funciones puras
// para poder probarlas sin montar una pantalla (`ChatLecturaTests`).

// MARK: - La banda de en medio

/// Lo que ocupa el hueco entre la cabecera y el compositor.
enum BandaChat: Equatable {
    /// Primera carga en frío: nada en pantalla y el almacén nunca ha cargado el historial.
    case cargando
    /// La carga en frío falló y no hay copia que enseñar: el error lleva su reintento.
    case error
    /// Hilo sin estrenar (o vacío de verdad): un arranque que rellena el compositor.
    case vacio
    /// Hay conversación: se lee y se scrollea.
    case conversacion

    /// - Parameters:
    ///   - hayMensajes: la conversación a pintar (copia de trabajo o, en el primer fotograma, la del almacén) no
    ///     está vacía.
    ///   - cargando: el chat está en su primera carga.
    ///   - historialCargado: el almacén ya cargó el historial alguna vez (aunque viniera vacío).
    ///   - fallo: la carga en frío falló.
    static func resolver(hayMensajes: Bool, cargando: Bool, historialCargado: Bool, fallo: Bool) -> BandaChat {
        guard !hayMensajes else { return .conversacion }
        // El esqueleto SOLO en una carga en frío de verdad: una conversación cacheada (aunque esté legítimamente
        // vacía) no lo enseña.
        if cargando && !historialCargado { return .cargando }
        if fallo { return .error }
        return .vacio
    }
}

// MARK: - Quién es el coach

/// El coach tal como lo dice la cabecera, el vacío y el pie de cada mensaje.
///
/// El nombre es un DATO del hilo (`chat_threads` → `coaches.full_name`), nunca un literal: sin él se cae a un texto
/// neutro y jamás se fabrican iniciales ni un nombre propio.
struct IdentidadCoachChat: Equatable {
    /// El nombre limpio, o nil si no lo sabemos (ausente, vacío o solo espacios).
    let nombre: String?

    init(nombre: String?) {
        let limpio = nombre?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.nombre = (limpio?.isEmpty == false) ? limpio : nil
    }

    static let neutro = "Coach"

    /// El nombre completo para la cabecera.
    var nombreCompleto: String { nombre ?? Self.neutro }

    /// Hasta dos iniciales en mayúscula. Vacío si no hay nombre: el avatar dibuja entonces una silueta.
    var iniciales: String {
        guard let nombre else { return "" }
        return nombre.split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    }

    /// El nombre de pila, con sus mayúsculas.
    var nombrePila: String? {
        nombre?.split(separator: " ").first.map(String.init)
    }

    /// Cómo se rotula al coach en el pie de sus mensajes.
    var rotuloDeAutor: String { nombrePila ?? Self.neutro }

    /// El título del vacío, dirigido al coach por su nombre de pila.
    var invitacion: String {
        if let nombrePila { return "Escribe a \(nombrePila) para empezar" }
        return "Escríbele a tu coach para empezar"
    }

    /// Lo que lee VoiceOver en el campo del compositor.
    var destinoDelMensaje: String {
        if let nombrePila { return "Mensaje para \(nombrePila)" }
        return "Mensaje para tu coach"
    }
}

// MARK: - El pie y la lectura de una fila

/// El pie que va bajo cada burbuja: cuándo y de quién, o qué le pasa al envío.
struct PieMensajeChat: Equatable {
    let texto: String
    /// El envío cayó: la fila ofrece Reintentar.
    let fallido: Bool

    static func de(_ mensaje: ChatMessage, coach: String) -> PieMensajeChat {
        let quien = mensaje.esMio ? "tú" : coach.lowercased()
        switch mensaje.status {
        case .sending: return PieMensajeChat(texto: "enviando… · \(quien)", fallido: false)
        case .failed: return PieMensajeChat(texto: "No enviado", fallido: true)
        case .pending, .sent: return PieMensajeChat(texto: "\(mensaje.timestamp) · \(quien)", fallido: false)
        }
    }
}

extension ChatMessage {
    /// El resumen coherente que lee VoiceOver de una fila de TEXTO. Las filas con adjunto etiquetan sus propias
    /// burbujas (sus botones de reproducir y abrir siguen siendo alcanzables uno a uno).
    func lecturaParaVoz(coach: String) -> String {
        let quien = esMio ? "Tú" : coach
        switch kind {
        case .text(let cuerpo): return "\(quien), \(timestamp): \(cuerpo)"
        case .voice(_, let duracion):
            let dur = duracion.map { ", \(Formato.clock($0))" } ?? ""
            return "\(quien), \(timestamp): nota de voz\(dur)"
        case .image: return "\(quien), \(timestamp): foto"
        case .video: return "\(quien), \(timestamp): vídeo"
        case .file(_, let nombre, _): return "\(quien), \(timestamp): archivo \(nombre)"
        }
    }
}

// MARK: - A dónde lleva la tarjeta de contexto

/// A dónde lleva una tarjeta de contexto.
///
/// Lo HECHO se mira (la lectura de lo que pasó) y lo PENDIENTE se estudia (el índice de técnica de la sesión): abrir
/// el contenedor de entreno desde una conversación invitaría a empezar a entrenar por accidente, que no es lo que
/// pide quien está preguntando algo.
enum DestinoDeContexto: Identifiable, Equatable {
    case entrenoHecho(assignmentId: String, titulo: String)
    case entrenoPorHacer(assignmentId: String, titulo: String)

    var id: String {
        switch self {
        case .entrenoHecho(let id, _): return "hecho-\(id)"
        case .entrenoPorHacer(let id, _): return "porhacer-\(id)"
        }
    }

    /// Resuelve el destino, o nil si no hay ninguno honesto.
    ///
    /// Sin `exists` confirmado por el servidor no se ofrece toque (una fila optimista, o un mensaje de antes de que
    /// el servidor lo dijera). Sin `state` tampoco: no sabríamos en qué modo abrirlo, y elegir por sorteo es peor
    /// que no ofrecerlo. Una carrera y un ejercicio de catálogo enseñan su dato pero no navegan todavía — el
    /// detalle de carrera necesita el objeto entero de la carrera, no su id.
    static func para(_ ref: ChatContextRef) -> DestinoDeContexto? {
        guard ref.sigueExistiendo, ref.conocido == .session else { return nil }
        let titulo = ref.label.components(separatedBy: " · ").first ?? ref.label
        switch ref.state {
        case "done": return .entrenoHecho(assignmentId: ref.ref, titulo: titulo)
        case "pending": return .entrenoPorHacer(assignmentId: ref.ref, titulo: titulo)
        default: return nil
        }
    }
}
