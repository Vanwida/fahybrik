import Foundation

// EL COMUNICADO — lo que el coach PUBLICA y RASTREA, del lado del atleta.
//
// La frontera con el chat es la razón entera de que esto exista: el chat
// CONVERSA (dos voces, un hilo, sin estado) y un comunicado se publica con
// ciclo de vida — publicado → visto → hecho/respondido. Hoy todo lo no-sesión
// viaja por el chat como texto libre y un push perdido es un mensaje perdido.
//
// Contrato: `shared/domain/coach-communications.ts` (el vocabulario y las
// reglas) y `web/lib/athlete/communications.ts` (los actos). El cable es
// snake_case y se decodifica con la estrategia compartida de APIClient
// (`.convertFromSnakeCase`), así que aquí los nombres van en camelCase.
//
// MECANISMO vs MÉTODO: los cinco tipos, las siete anclas y el ciclo de vida son
// MECANISMO y viven en código. Lo que el coach escribe dentro —los pasos de su
// calentamiento, las opciones de su pregunta— es su MÉTODO y es dato: nada de
// lo que él redacta se cablea aquí, ni su nombre (llega en `coach_name`).
//
// Este fichero no pinta nada: es Foundation puro para que el mecanismo se pueda
// probar sin levantar una vista.

// MARK: - Vocabulario

/// Cinco, y son cinco porque cada uno pide una cosa distinta del atleta:
/// marcar pasos · decidir · cerrar una acción con fecha · entender · recordar.
///
/// Los casos van en castellano (y no `protocol`, `question`…) por dos razones:
/// `protocol` es palabra reservada de Swift, y este ES el vocabulario que el
/// atleta lee en pantalla. El `rawValue` es el del cable.
enum ComunicadoTipo: String, Codable, CaseIterable {
    case protocolo = "protocol"
    case pregunta = "question"
    case tarea = "task"
    case nota = "note"
    case foco = "focus"

    /// Cara al atleta, en versales. Cero jerga de producto.
    var etiqueta: String {
        switch self {
        case .protocolo: return "PROTOCOLO"
        case .pregunta:  return "PREGUNTA"
        case .tarea:     return "TAREA"
        case .nota:      return "NOTA"
        case .foco:      return "FOCO"
        }
    }

    /// ¿Pide un acto? Es lo que decide si sube a «Para hacer» en la bandeja.
    var pideAccion: Bool {
        switch self {
        case .protocolo, .pregunta, .tarea: return true
        case .nota, .foco: return false
        }
    }

}

/// Dónde cuelga. El ancla no es una etiqueta: decide en qué superficie aflora.
enum ComunicadoAncla: String, Codable, CaseIterable {
    case plan
    case semana = "week"
    case sesion = "session"
    case test
    case carrera = "race"
    case checkin
    case general

    /// Dicho como lo diría el atleta. `general` no se pinta: un comunicado que
    /// no cuelga de nada no gana nada por decir «general».
    var etiqueta: String? {
        switch self {
        case .plan:    return "Tu plan"
        case .semana:  return "Esta semana"
        case .sesion:  return "La sesión"
        case .test:    return "Tus tests"
        case .carrera: return "Día de carrera"
        case .checkin: return "Tu check-in"
        case .general: return nil
        }
    }
}

/// El ciclo de vida en la mano del atleta. `visto` no es el final de nada: es
/// el paso intermedio que hoy la app confunde con el final.
enum ComunicadoEstado: String, Codable {
    case publicado = "published"
    case visto = "seen"
    case hecho = "done"
    case respondido = "answered"
}

/// La insignia que lleva en la lista. El vencimiento gana al estado: lo urgente
/// se ve antes que lo administrativo.
enum ComunicadoInsignia: Equatable {
    case nuevo
    case visto
    case hecho
    case respondido
    case venceHoy
    case vencida

    var etiqueta: String {
        switch self {
        case .nuevo:      return "NUEVO"
        case .visto:      return "VISTO"
        case .hecho:      return "HECHO"
        case .respondido: return "RESPONDIDO"
        case .venceHoy:   return "VENCE HOY"
        case .vencida:    return "VENCIDA"
        }
    }
}

/// Dónde cae la fecha límite de una tarea respecto de hoy.
enum ComunicadoVencimiento: Equatable {
    case sinFecha
    case vencida(dias: Int)
    case hoy
    case futura(dias: Int)
}

// MARK: - El comunicado

/// Un paso de protocolo, una opción de pregunta o una sección de nota. Las tres
/// son una lista ORDENADA de contenido del coach, y por eso son un solo tipo.
struct ComunicadoItem: Codable, Identifiable, Equatable {
    let id: String
    let position: Int
    /// Marca temporal del paso o cabecera de sección. Nula en las opciones.
    let label: String?
    let content: String
    /// Qué pasa si eliges esta opción. Solo en preguntas.
    let consequence: String?
    /// ¿Lleva casilla? NADA SE OBLIGA: lo marcable es del PASO y no del tipo,
    /// porque lo que el coach escribe la víspera de una carrera (cuánta agua,
    /// cómo comer) es texto para leer, y ponerle un círculo no mide si comió:
    /// mide si tocó un círculo.
    ///
    /// Solo significa algo en un protocolo. Por defecto SÍ, para que una
    /// respuesta anterior al campo no se quede sin una sola casilla.
    @DefaultTrue var checkable: Bool = true

    // Lo que hace de una sección de NOTA algo más que un párrafo (migración
    // 0163). Los tres son inertes fuera de una nota, y los tres tienen que
    // poder faltar: una respuesta anterior al campo se comporta como antes.
    // El vocabulario y las reglas, en `ComunicadoFormas.swift`.

    /// Cómo se pinta, tal y como llega. Cadena y no enum a propósito: una forma
    /// que este binario no conozca se lee como texto (`forma`) en vez de tirar
    /// la sección, que dejaría un capítulo en blanco en medio del briefing.
    var display: String? = nil
    /// Los trozos de un reparto, en orden. Vacío en todo lo demás.
    @LossyArray var segments: [TrozoReparto] = []
    /// La espina del plan de ESE atleta, resuelta al servir — nunca guardada:
    /// si se guardara, el día que le cambien el plan la nota seguiría contando
    /// el viejo. Nil cuando la sección no es un camino o cuando no hay plan, y
    /// entonces no se pinta nada en vez de dibujar un camino inventado.
    var camino: CaminoDelPlan? = nil
    /// Sus semanas en zonas, con los rangos que el coach marcó encima. Se
    /// resuelve al servir por lo mismo que el camino: lo que se guardó fue la
    /// CONFIG (ventana, filtro, rangos) y no la imagen, así que la nota de julio
    /// se sigue dibujando con lo que hoy sabemos de aquellas semanas.
    ///
    /// Nil cuando la sección no es una gráfica, o cuando de ese atleta todavía
    /// no hay una sola semana medida.
    var grafica: GraficaDeZonas? = nil
    /// Config + informe de ESA ocurrencia. El informe se resuelve al servir.
    var testResult: TestResultEmbed? = nil
}

struct TestResultEmbed: Codable, Equatable {
    let assignmentId: String
    let report: CmjReportDTO?
}

/// El comunicado más MI estado con él.
///
/// `Codable` (no solo `Decodable`) porque la bandeja se cachea en disco a
/// través de `AppDataStore`: sin `CodingKeys` propias, la codificación
/// sintetizada round-trip por el coder plano del store, independiente de la
/// estrategia snake_case del cable.
struct Comunicado: Codable, Identifiable, Equatable {
    let id: String
    let kind: ComunicadoTipo
    let title: String
    let body: String?
    let finalNote: String?
    let anchorKind: ComunicadoAncla
    let anchorRef: String?
    /// «YYYY-MM-DD». Cadena y no `Date` a propósito: la estrategia de fechas del
    /// cable espera un ISO 8601 completo y una fecha suelta tumbaría la fila.
    let dueDate: String?
    let expiresAt: Date?
    let blocks: Bool
    let publishedAt: Date
    /// El nombre REAL del coach, del servidor. Jamás se cablea uno aquí.
    let coachName: String?
    /// Una fila mal formada se cae sola en vez de llevarse la bandeja entera.
    @LossyArray var items: [ComunicadoItem]

    // La voz del coach. UNA por comunicado, opcional, y en los CINCO tipos: la
    // explicación hablada es la mitad del valor de un feedback, y hoy vive en un
    // audio de mensajería que nadie vuelve a encontrar. Los dos campos pueden
    // faltar (una respuesta anterior al campo se comporta igual que antes).

    /// Dónde están los bytes. Se reproduce DENTRO del comunicado, sin salir a
    /// ningún sitio.
    var audioUrl: String? = nil
    /// Cuánto dura, para poder decirlo antes de descargarlo. Nil = se sabrá al
    /// abrirlo; nunca se inventa un «0:00».
    var audioSeconds: Int? = nil

    /// ¿Trae voz? Un `audio_url` vacío es lo mismo que no traerla: la fila del
    /// reproductor no se pinta para no prometer un audio que no suena.
    var tieneAudio: Bool {
        !(audioUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    // Los sellos del destinatario. `var` porque un acto del atleta los mueve
    // localmente antes de que el servidor conteste (y sin conexión, sin que
    // conteste nunca) — ver `aplicar…`.
    var state: ComunicadoEstado
    var seenAt: Date?
    var doneAt: Date?
    var answeredItemId: String?
    var answeredAt: Date?
    var markedItemIds: [String]

    /// Lo que el SERVIDOR dice que sigue reclamando. No se pinta con esto: en
    /// cuanto el atleta marca algo estando sin conexión, el dato del servidor es
    /// de hace un rato. Se pinta con `reclama`, que aplica la MISMA regla sobre
    /// el estado local — y un test comprueba que las dos coinciden.
    let claimsAttention: Bool

    /// A qué otro comunicado apunta éste, con MI estado con él. Sólo llega si a
    /// mí también me lo publicaron: si no, el pie me estaría enseñando que
    /// existe algo que no puedo abrir.
    var linked: ComunicadoEnlazado? = nil
}

// MARK: - Mecanismo: estado, lo que reclama, y el orden

extension Comunicado {
    /// El estado derivado de los sellos. Una sola verdad, la misma que el
    /// servidor (`communicationState`).
    static func estado(seenAt: Date?, doneAt: Date?, answeredAt: Date?) -> ComunicadoEstado {
        if answeredAt != nil { return .respondido }
        if doneAt != nil { return .hecho }
        if seenAt != nil { return .visto }
        return .publicado
    }

    /// Lo que aún te reclama: sin ver, sin responder o sin hacer.
    ///
    /// Un protocolo o una nota ya vistos NO reclaman: leerlos ERA el acto (el
    /// protocolo además se cierra solo al marcar su último paso). El foco no se
    /// cierra nunca y por eso tampoco reclama: si lo hiciera, la bandeja no
    /// podría estar en calma jamás.
    static func reclama(kind: ComunicadoTipo, state: ComunicadoEstado) -> Bool {
        if state == .publicado { return true }
        if kind == .pregunta { return state != .respondido }
        if kind == .tarea { return state != .hecho }
        return false
    }

    var reclama: Bool { Self.reclama(kind: kind, state: state) }

    /// Los pasos que de verdad se marcan. Un protocolo puede no tener ninguno
    /// (la casilla es del paso, no del tipo) y entonces se lee y ya está: ni la
    /// barra de avance ni el «hecho» derivado tienen nada que contar.
    var pasosMarcables: [ComunicadoItem] { items.filter(\.checkable) }

    /// ¿Hay algo que marcar aquí? Es lo que decide si la pantalla enseña avance
    /// y botón de cerrar, o si es una lectura y punto.
    var tienePasosMarcables: Bool { items.contains(where: \.checkable) }

    /// Un protocolo está hecho cuando no le queda ninguna CASILLA sin marcar, y
    /// deja de estarlo en cuanto vuelve a quedar una. Es la regla del servidor
    /// (`stampDone`) traída aquí para que el estado sin conexión sea el mismo
    /// que el que acabará teniendo la fila: un «hecho» declarado por un lado y
    /// unos pasos a medias por otro serían dos verdades del mismo hecho.
    ///
    /// Los pasos de lectura no cuentan: no se marcan nunca, así que contarlos
    /// dejaría el protocolo abierto para siempre.
    static func protocoloCompleto(items: [ComunicadoItem], marcados: [String]) -> Bool {
        let casillas = items.filter(\.checkable)
        guard !casillas.isEmpty else { return false }
        let marcados = Set(marcados)
        return casillas.allSatisfy { marcados.contains($0.id) }
    }

    var protocoloCompleto: Bool {
        Self.protocoloCompleto(items: items, marcados: markedItemIds)
    }

    /// Cuántas casillas llevas. Solo dice algo en un protocolo.
    var pasosHechos: Int {
        let marcados = Set(markedItemIds)
        return pasosMarcables.filter { marcados.contains($0.id) }.count
    }

    /// ¿Se puede cerrar desde la pantalla? Una tarea sí mientras no lo esté; un
    /// protocolo solo si tiene alguna casilla —uno de pura lectura se cierra con
    /// haberlo leído, y enseñarle un botón de «hecho» sería pedirle al atleta
    /// que confirme lo que acaba de hacer. Lo demás no se cierra nunca.
    var puedeMarcarseHecho: Bool {
        switch kind {
        case .tarea:     return state != .hecho
        case .protocolo: return tienePasosMarcables
        case .pregunta, .nota, .foco: return false
        }
    }

    /// La opción elegida, cuando ya se respondió.
    var opcionElegida: ComunicadoItem? {
        guard let answeredItemId else { return nil }
        return items.first { $0.id == answeredItemId }
    }
}

// MARK: - Mecanismo: el vencimiento

extension Comunicado {
    static func vencimiento(dueDate: String?, hoy: Date = Date()) -> ComunicadoVencimiento {
        guard let dueDate, let fecha = FechaES.fecha(dueDate) else { return .sinFecha }
        let cal = Calendar.current
        let dias = cal.dateComponents(
            [.day],
            from: cal.startOfDay(for: hoy),
            to: cal.startOfDay(for: fecha)
        ).day ?? 0
        if dias == 0 { return .hoy }
        return dias < 0 ? .vencida(dias: -dias) : .futura(dias: dias)
    }

    func vencimiento(hoy: Date = Date()) -> ComunicadoVencimiento {
        Self.vencimiento(dueDate: dueDate, hoy: hoy)
    }

    /// La insignia que le toca. Una tarea vencida o que vence hoy manda sobre el
    /// estado: que se te haya pasado la fecha importa más que si lo abriste.
    func insignia(hoy: Date = Date()) -> ComunicadoInsignia {
        if kind == .tarea, state != .hecho {
            switch vencimiento(hoy: hoy) {
            case .vencida: return .vencida
            case .hoy: return .venceHoy
            case .futura, .sinFecha: break
            }
        }
        switch state {
        case .publicado:  return .nuevo
        case .visto:      return .visto
        case .hecho:      return .hecho
        case .respondido: return .respondido
        }
    }
}

// MARK: - Los actos, aplicados en local

extension Comunicado {
    /// Vuelve a derivar el estado de los sellos actuales.
    private mutating func resellar() {
        state = Self.estado(seenAt: seenAt, doneAt: doneAt, answeredAt: answeredAt)
    }

    /// Abrirlo. Se sella la PRIMERA vez y no se vuelve a tocar: la fecha en que
    /// lo abriste es un hecho, no un contador de aperturas.
    mutating func aplicarVisto(ahora: Date = Date()) {
        guard seenAt == nil else { return }
        seenAt = ahora
        resellar()
    }

    /// Marcar o desmarcar UNA casilla. Marcar también es abrirlo, y el «hecho»
    /// del protocolo se deriva de las casillas, nunca se declara aparte.
    ///
    /// Un paso de lectura no se marca: el servidor lo rechaza con un 409, y
    /// aquí se ignora en vez de pintar un cambio que va a rebotar.
    mutating func aplicarMarca(itemId: String, hecho: Bool, ahora: Date = Date()) {
        guard items.first(where: { $0.id == itemId })?.checkable == true else { return }
        if hecho {
            if !markedItemIds.contains(itemId) { markedItemIds.append(itemId) }
        } else {
            markedItemIds.removeAll { $0 == itemId }
        }
        seenAt = seenAt ?? ahora
        // Sin casillas no hay nada de lo que derivar y el sello se queda como
        // esté (misma salvaguarda que el servidor): derivarlo borraría el
        // «hecho» que el atleta declaró.
        if tienePasosMarcables {
            doneAt = protocoloCompleto ? (doneAt ?? ahora) : nil
        }
        resellar()
    }

    /// Dar por hecho: una tarea, o un protocolo entero — lo que marca todas sus
    /// CASILLAS, igual que hace el servidor. Los pasos de lectura no se tocan:
    /// marcarlos sería inventarse un dato que nadie pidió.
    mutating func aplicarHecho(ahora: Date = Date()) {
        if kind == .protocolo {
            markedItemIds = pasosMarcables.map(\.id)
        }
        seenAt = seenAt ?? ahora
        doneAt = doneAt ?? ahora
        resellar()
    }

    /// Responder. Elegir también es abrirla.
    mutating func aplicarRespuesta(itemId: String, ahora: Date = Date()) {
        answeredItemId = itemId
        answeredAt = ahora
        seenAt = seenAt ?? ahora
        resellar()
    }

    /// La verdad del servidor tras un acto: pisa los sellos locales enteros.
    mutating func aplicar(_ estado: ComunicadoRecipientState) {
        seenAt = estado.seenAt
        doneAt = estado.doneAt
        answeredItemId = estado.answeredItemId
        answeredAt = estado.answeredAt
        markedItemIds = estado.markedItemIds
        state = estado.state
    }
}

/// Lo que devuelve cada acto: el estado del destinatario tal y como queda.
struct ComunicadoRecipientState: Codable, Equatable {
    let communicationId: String
    let state: ComunicadoEstado
    let seenAt: Date?
    let doneAt: Date?
    let answeredItemId: String?
    let answeredAt: Date?
    let markedItemIds: [String]
}
