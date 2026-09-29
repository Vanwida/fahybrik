import Foundation

// LO QUE LA PORTADA RECIBE — y solo eso.
//
// Es el espejo, campo a campo, de `web/components/design-twin/kit-hoy/contrato.ts` (la
// `LecturaHoy` del doble): lo que Hoy lee del `AppDataStore` más su estado local, ya
// traducido a lo que se PINTA. Una portada pinta, no decide: qué sujeto toca, en qué orden
// van las filas y qué dice cada estado lo resuelven funciones puras sobre esta lectura
// (`MomentoHoy.swift`), con los mismos casos que el doble, y quien la construye desde la app
// es `LecturaHoy+Fuentes.swift`.
//
// Añade tres cosas que el contrato del doble no traía porque allí solo había un «cargando»
// global, y que la app real necesita porque cada dato llega por su cuenta y decir «no hay»
// antes de saberlo sería mentir (CONTRATO-UI §7): `Disposicion.cargando`, `MarcaHoy.cargando`
// y `Pasos.leyendo`. Y cuatro que la app tiene y el doble no modelaba: `total` de tests
// opcional (sin batería publicada no hay «de cuántos»), `hayMasPublicado` (un descanso al final
// de la semana no dice «nada publicado» si la que viene ya lo está), la tendencia de la marca
// con sus tres caras y la foto del avatar.
//
// MÉTODO DEL COACH: los cortes de las zonas de disposición y el nombre de la fase NO están
// aquí. Los cortes son `ReadinessZone` y la fase llega ya compuesta por el servidor
// (`macro.weekLabel`): la vista no escribe ni un 67 ni un «Construcción».

// MARK: - Cómo llegas hoy

/// La cifra de disposición, o por qué no hay.
enum Disposicion: Equatable {
    /// Todavía no ha contestado el servidor: ni cifra ni invitación, un esqueleto con la misma forma.
    case cargando
    case medida(score: Int, delta7d: Int?, senales: [Senal])
    case sinDatos(MotivoSinDatos)

    /// Por qué no hay número, porque de ello depende la salida.
    enum MotivoSinDatos: Equatable {
        /// Hacer el check-in: el camino más rápido a un número.
        case checkinPendiente
        /// Salud conectada, esperando muestras del reloj.
        case saludConectada
        /// Conectar Apple Salud o hacer el check-in.
        case saludSinConectar
    }
}

/// Una de las señales que alimentan el número: encendida si llegó, apagada si no.
struct Senal: Equatable {
    enum Clave: Equatable { case checkin, hrv, sueno, fcReposo }

    let clave: Clave
    /// «Check-in» · «HRV» · «Sueño» · `Vocab.fcReposo`.
    let etiqueta: String
    let activa: Bool
    /// Solo si hay valor real («7,4 h»). Sin valor, la señal se dice, no se cifra.
    let valor: String?
}

// MARK: - Camino a la carrera

/// La carrera objetivo, con lo que el coach dice de dónde estás en el camino.
struct CarreraDelCamino: Equatable {
    let nombre: String
    /// Días que faltan (ya en el «hoy» del atleta; nunca negativo).
    let dias: Int
    /// «sub 65 min» / «1:04:30». Nil si el atleta no fijó objetivo de tiempo.
    let meta: String?
    /// «Construcción · semana 4 de 12»: el nombre de la fase lo pone el COACH. Nil si el plan no
    /// tiene periodización.
    let fase: String?
    /// N de M, para la regleta. Nil si `fase` no se pudo leer.
    let semana: PosicionEnPlan?
    /// El nombre del asset de la foto de fondo (`BrandImagery`).
    let foto: String
}

struct PosicionEnPlan: Equatable {
    let n: Int
    let m: Int
}

enum CaminoEstado: Equatable {
    case fijada(CarreraDelCamino)
    /// Plan cargado y sin carrera objetivo: se invita a elegirla, con su salida.
    case sinObjetivo
}

/// La simulación HYROX: lo único que afila la previsión de carrera.
enum Simulacion: Equatable {
    /// `dia` ya lleva su artículo («el sábado»).
    case programada(dia: String, hoy: Bool)
    case abierta

    var esProgramada: Bool {
        if case .programada = self { return true }
        return false
    }
}

// MARK: - El entreno de hoy: ESTADO, nunca puerta

/// Los cubos canónicos de modalidad de la app (`Theme.Modality.Kind`).
typealias ModalidadHoy = Theme.Modality.Kind

enum EstadoSesion: Equatable {
    case pendiente, hecha, parcial, saltada
}

struct SesionHoy: Equatable {
    /// Solo hay franja cuando el día trae dos sesiones.
    enum Franja: String, Equatable { case am = "AM", pm = "PM" }

    var franja: Franja?
    var titulo: String
    var modalidad: ModalidadHoy
    var estado: EstadoSesion
    /// Una sesión que el atleta montó (no del coach): lleva la nota «Libre».
    var libre: Bool

    init(
        franja: Franja? = nil,
        titulo: String,
        modalidad: ModalidadHoy,
        estado: EstadoSesion = .pendiente,
        libre: Bool = false
    ) {
        self.franja = franja
        self.titulo = titulo
        self.modalidad = modalidad
        self.estado = estado
        self.libre = libre
    }
}

/// Lo que toca a continuación cuando hoy no hay nada.
struct Manana: Equatable {
    let titulo: String
    let modalidad: ModalidadHoy
    /// «mañana» · «el jueves».
    let dia: String
}

enum EntrenoHoy: Equatable {
    case sesiones([SesionHoy])
    /// El plan cargó y hoy no hay nada. `hayMasPublicado`: lo que sigue está publicado aunque no
    /// entre en la semana que se ve (domingo con la semana que viene ya en el plan).
    case descanso(manana: Manana?, hayMasPublicado: Bool)
    /// El coach pausó el plan del atleta: se dice, no se enseña una sesión vieja.
    case pausado
    /// Aún sin plan cargado y sin caché (instalación nueva con fallo de red).
    case errorCarga
}

// MARK: - Lo que reclama al atleta

enum Reclamo: Equatable {
    /// La batería de calibración del coach. Un CONTADOR se pinta también en cero (§6.2 bis).
    /// `total` es nil cuando el coach aún no ha publicado batería: no hay «de cuántos» que inventar.
    case tests(hechos: Int, total: Int?)
    /// Revisión 1:1 recurrente: el coach propone y el atleta elige hueco, o ya está reservada.
    case revision(EstadoRevision, cuando: String?, minutos: Int?, enlace: URL?)
    /// Su pareja de dobles está entrenando ahora. `detalle` es lo que hace («Metcon 20' · RONDA 3/5»).
    case parejaEnVivo(nombre: String, detalle: String)
    /// Un entreno guardado para luego (pausado, en disco).
    case aMedias(titulo: String, desde: String)

    enum EstadoRevision: Equatable { case propuesta, reservada }

    /// La clave estable de la fila (orden y accesibilidad).
    var clave: ClaveContigo {
        switch self {
        case .tests: return .tests
        case .revision: return .revision
        case .parejaEnVivo: return .parejaEnVivo
        case .aMedias: return .aMedias
        }
    }
}

/// Las claves de lo que reclama, en el orden en que CADUCA (ver `itemsContigo`).
enum ClaveContigo: Int, Equatable, Comparable {
    case parejaEnVivo, aMedias, revision, tests, comunicados

    static func < (a: ClaveContigo, b: ClaveContigo) -> Bool { a.rawValue < b.rawValue }
}

/// Una marca reciente como prueba. Una sola, la que tenga.
struct MarcaReciente: Equatable {
    let titulo: String
    let valor: String
    let tendencia: Tendencia

    /// Cómo va contra la primera prueba. Con una sola no hay tendencia que afirmar; con dos iguales
    /// tampoco es mejor ni peor.
    enum Tendencia: Equatable {
        case primeraPrueba
        case mejora(String)
        case empeora(String)
        case igual
    }
}

enum MarcaHoy: Equatable {
    case cargando
    /// Sin marca: es un hueco que el atleta llena con un acto (medirse), así que se declara con su salida.
    case ninguna
    case reciente(MarcaReciente)
}

enum Pasos: Equatable {
    /// Salud todavía no ha contestado: no es lo mismo que no tener pasos.
    case leyendo
    case cifra(String)
    /// Salud no está conectada: la salida es conectarla (Perfil).
    case conectar
    /// Salud conectada y sin muestras de hoy: no es un cero medido, se dice.
    case sinDatos
}

// MARK: - La lectura entera de la portada

struct LecturaHoy: Equatable {
    /// Primer nombre. Nil → el saludo de la hora sin nombre.
    var nombre: String?
    /// «Martes 29 sep». Fecha larga capitalizada.
    var fecha: String
    /// Hora local en la que se ve la portada, «7:40». Solo la usa el saludo de la hora.
    var hora: String
    /// Con coach o sin él. SIN coach (tier libre): no hay plan, ni chat, ni comunicados, ni revisión, ni
    /// batería de tests; el sujeto natural es montar un entreno. Ninguna pieza de coach se pinta, ni
    /// siquiera vacía.
    var conCoach: Bool
    /// El primer nombre del coach, para «tu entrenador ha…». Nil sin coach o si el plan no lo trae.
    var coach: String?
    /// Iniciales del avatar.
    var iniciales: String
    /// La foto de perfil, si el atleta la tiene: se pinta sobre las iniciales.
    var fotoURL: String?
    /// Sin leer en el chat (globito). 0 = sin globito.
    var noLeidosChat: Int
    /// Comunicados del coach que reclaman (globito de la bandeja «Del coach»).
    var comunicados: Int
    /// El check-in matinal de hoy sigue por hacer.
    var checkinPendiente: Bool
    /// Arranque en frío: todavía no sabemos nada del plan y no hay caché. Cada pieza que depende del plan
    /// se pinta como esqueleto, NUNCA como un vacío ni con una invitación.
    var cargando: Bool

    var disposicion: Disposicion
    /// Nil = no aplica (sin coach: no hay plan ni carrera de plan) o el plan no ha llegado.
    var camino: CaminoEstado?
    var simulacion: Simulacion?
    /// Nil = no aplica (sin coach: el sujeto natural es montar un entreno).
    var hoy: EntrenoHoy?
    var reclamos: [Reclamo]
    var marca: MarcaHoy
    var pasos: Pasos
}
