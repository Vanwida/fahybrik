import Foundation

// SOBRE QUÉ va un mensaje del chat.
//
// El chat sigue siendo UNO y sigue siendo una conversación; lo único que gana es
// saber de qué cosa se habla. Eso entra por sitios que YA existen (el «+» del
// compositor y los menús de pulsación larga), nunca por un control nuevo en cada
// pantalla — el coste en pantalla era la restricción del encargo, no un detalle
// de acabado. Ver docs/DECISIONS.md, 12-ago «El chat aprende SOBRE QUÉ va».

/// Los tres tipos de cosa que un mensaje puede señalar.
///
/// `session` con `sub` es «el back squat DE ese entreno»; sin `sub`, el entreno
/// entero. `exercise` es el ejercicio del catálogo en abstracto. La ambigüedad de
/// meter las dos cosas en un solo tipo se resolvió a propósito partiéndolas.
enum ChatContextKind: String, Codable, Sendable {
    case session
    case exercise
    case race
}

/// La referencia que VIAJA al servidor. Sin etiqueta: la redacta él.
struct ChatContextTarget: Codable, Equatable, Sendable {
    let kind: ChatContextKind
    /// El ancla navegable: assignment, ejercicio del catálogo o carrera.
    let ref: String
    /// Solo con `kind == .session`: el ejercicio DENTRO de ese entreno.
    let sub: String?

    static func entreno(_ assignmentId: String, ejercicio: String? = nil) -> Self {
        .init(kind: .session, ref: assignmentId, sub: ejercicio)
    }

    static func ejercicio(_ exerciseId: String) -> Self {
        .init(kind: .exercise, ref: exerciseId, sub: nil)
    }

    static func carrera(_ raceId: String) -> Self {
        .init(kind: .race, ref: raceId, sub: nil)
    }
}

/// La referencia tal como VUELVE en un mensaje ya guardado.
///
/// `kind` es String y no el enum A PROPÓSITO: un tipo nuevo servido a un binario
/// viejo no puede tumbar la decodificación del mensaje entero (y con
/// `@LossyArray` eso significaría un mensaje que desaparece del historial). Se
/// pinta con su etiqueta, que es lo único que la pantalla necesita.
struct ChatContextRef: Codable, Equatable, Sendable {
    let kind: String
    let ref: String
    let sub: String?
    /// Sello legible congelado al enviar, escrito por el servidor.
    let label: String

    var conocido: ChatContextKind? { ChatContextKind(rawValue: kind) }

    /// Lo que hay que volver a mandar si el envío falló y se reintenta. Nil si el
    /// tipo no lo conoce este binario: reenviar a ciegas algo que no entiende
    /// sería peor que reenviar la pregunta sola.
    var target: ChatContextTarget? {
        guard let conocido else { return nil }
        return .init(kind: conocido, ref: ref, sub: sub)
    }
}

/// El contexto ELEGIDO y aún sin enviar.
///
/// Lleva su propia etiqueta porque el chip tiene que decir de qué va ANTES de
/// que exista el mensaje, y la etiqueta de verdad la escribe el servidor al
/// guardarlo. Esta es de pantalla y no viaja nunca: así no hay dos redactores
/// del mismo texto en el hilo.
struct ChatContextChoice: Equatable, Sendable, Identifiable {
    let target: ChatContextTarget
    let etiqueta: String

    var id: String { "\(target.kind.rawValue):\(target.ref):\(target.sub ?? "")" }

    /// Cómo se pinta el sujeto mientras el mensaje aún no existe: la misma forma
    /// que devolverá el servidor, con la etiqueta local. En cuanto el envío
    /// confirma, la fila optimista se sustituye por la del servidor y con ella la
    /// etiqueta definitiva.
    var provisional: ChatContextRef {
        .init(kind: target.kind.rawValue, ref: target.ref, sub: target.sub, label: etiqueta)
    }
}

/// Un ejercicio DENTRO de un entreno, señalable desde su fila.
///
/// El id que viaja es el `template_segments.id` de ESA línea de la sesión, no el
/// del ejercicio en el catálogo: el coach tiene que poder llegar a la línea
/// concreta, y un entreno puede repetir el mismo ejercicio dos veces con dosis
/// distintas. Es también lo que el servidor valida (`web/lib/chat/context.ts`) y
/// lo mismo que la ejecución ya devuelve para atribuir prescrito-vs-hecho.
///
/// Nil cuando esa línea no mapea a ningún segmento prescrito (un entreno libre):
/// entonces se señala el entreno entero, que es verdad, en vez de inventar una
/// referencia fina que el servidor rechazaría.
struct EjercicioSeñalado: Equatable, Sendable {
    let segmentoId: String?
    let nombre: String
}

// MARK: - Los entrenos que se pueden señalar

/// Una fila del selector de «¿sobre qué entreno?».
struct EntrenoElegible: Identifiable, Equatable, Sendable {
    let assignmentId: String
    let titulo: String
    /// «hoy» · «ayer» · «mar 12».
    let cuando: String
    /// Lo que desempata dos «Fuerza A» en la misma lista.
    let pie: String?
    let hecho: Bool

    var id: String { assignmentId }

    var eleccion: ChatContextChoice {
        .init(target: .entreno(assignmentId), etiqueta: "\(titulo) · \(cuando)")
    }
}

/// De la semana del plan a las filas del selector.
///
/// No hay endpoint nuevo para esto: se lee la MISMA `/api/athlete/plan/week` que
/// ya alimenta Inicio y Plan (offset 0 llega cacheada en el store; la anterior
/// solo se pide si el atleta abre el selector).
enum EntrenosSeñalables {
    /// Un día del plan es señalable si tiene sesiones; los días vacíos no salen.
    static func filas(de semana: AthleteWeekPayload) -> [EntrenoElegible] {
        semana.days.flatMap { dia in
            dia.sessions.map { sesion in
                EntrenoElegible(
                    assignmentId: sesion.assignmentId,
                    titulo: sesion.title,
                    cuando: cuando(iso: dia.isoDate, hoyIso: semana.todayIso),
                    pie: pie(de: sesion),
                    hecho: sesion.status == "completed"
                )
            }
        }
    }

    /// Las secciones tal como se ofrecen: hoy primero, luego el resto de la
    /// semana en orden, y al final lo de antes (lo más reciente arriba).
    ///
    /// Los PENDIENTES también se ofrecen: preguntar antes de entrenar («¿el sled
    /// va a 100?») es la mitad de los casos, y dejarlos fuera obligaría a esperar
    /// a haber entrenado para poder preguntar.
    static func secciones(
        semana: AthleteWeekPayload?,
        anterior: AthleteWeekPayload?
    ) -> [(titulo: String, entrenos: [EntrenoElegible])] {
        guard let semana else { return [] }
        let deEstaSemana = filas(de: semana)
        let hoy = deEstaSemana.filter { $0.cuando == etiquetaHoy }
        let resto = deEstaSemana.filter { $0.cuando != etiquetaHoy }
        let antes = (anterior.map(filas(de:)) ?? []).reversed()

        var out: [(titulo: String, entrenos: [EntrenoElegible])] = []
        if !hoy.isEmpty { out.append((titulo: "Hoy", entrenos: hoy)) }
        if !resto.isEmpty { out.append((titulo: "Esta semana", entrenos: resto)) }
        if !antes.isEmpty { out.append((titulo: "Antes", entrenos: Array(antes))) }
        return out
    }

    static let etiquetaHoy = "hoy"
    static let etiquetaAyer = "ayer"

    /// Cómo se lee una fecha desde hoy. Display-only (ver `ChatContextChoice`).
    static func cuando(iso: String, hoyIso: String) -> String {
        if iso == hoyIso { return etiquetaHoy }
        guard let dia = StatsDateParser.parse(iso), let hoy = StatsDateParser.parse(hoyIso) else {
            return iso
        }
        let dias = Calendar(identifier: .gregorian).dateComponents([.day], from: dia, to: hoy).day
        if dias == 1 { return etiquetaAyer }
        return StatsDateParser.dayShort(dia)
    }

    /// «Empuje · 4 bloques» — lo que ya escribe el plan, sin recalcular nada.
    private static func pie(de sesion: AthleteWeekDaySession) -> String? {
        var trozos: [String] = []
        if let corta = sesion.shortPrescription, !corta.isEmpty { trozos.append(corta) }
        if let bloques = sesion.blocksCount, bloques > 0 {
            trozos.append(bloques == 1 ? "1 bloque" : "\(bloques) bloques")
        }
        return trozos.isEmpty ? nil : trozos.joined(separator: " · ")
    }
}
