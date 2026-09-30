import Foundation

// LA LECTURA DE LA PESTAÑA PLAN — todo lo que decide qué pantalla toca, y solo eso.
//
// La vista PINTA una lectura ya resuelta; no decide (CONTRATO-UI §8). `LecturaPlan` es lo que la
// pestaña recibe —la semana publicada, las semanas hojeadas, el desglose de cada sesión, la pausa,
// el aviso del club— y `vista(_:)` es la escalera que dice qué toca: cargando → pausa → error →
// semana → sin plan. Puras y sin SwiftUI, para poder fijarlas con XCTest: son el espejo de
// `web/components/design-twin/kit-plan/{contrato,modelo}.ts`, y `PlanLecturaTests` es la traducción
// de sus pruebas, así que el doble y la app no pueden divergir sin que salte una.
//
// DONDE ESTA LECTURA CORRIGE AL SWIFT DE ANTES (los siete fallos que el doble encontró):
//  1. `contenido` decidía por la semana 0, no por la VISIBLE: el botón «Ver la semana que viene» del
//     vacío con inicio futuro no hacía nada. Ahora decide la visible.
//  2. Al cargar o fallar la semana que viene la app decía «Tu coach aún no ha llenado la semana»,
//     que es falso. Ahora hay `semanaCargando` y `semanaFalla`.
//  3. El sujeto de un día de dos sesiones es la PRIMERA PENDIENTE, no la primera del array.
//  4. «Ayer» y «Mañana» del descanso se rotulan por su distancia real, no «la última» y «la siguiente».
//  5. «Ver lo de mañana» dependía de si el atleta había tocado el chip de hoy. Ahora solo de que el
//     día mostrado sea hoy.
//  6. La card decía «por hacer» donde el carril decía «sin hacer» (`EstadoSesion.efectivo`).
//  7. El texto de pausa decía «mientras te recuperas» aunque el motivo fuera vacaciones.
//
// GENERALIZACIÓN QUE EL DOBLE NO MUESTRA, y que se conserva porque el Swift de antes ya la hacía:
// se puede seguir hojeando hacia delante mientras cada semana diga que hay una más (y el club la
// deje ver). El doble solo pinta un salto; aquí `hojeadas` es por semana (offset 1, 2…).

// MARK: - Lo que llega

/// Una semana hojeada (offset ≥ 1): llegó, o no se pudo cargar. Ausente = ni pedida ni bloqueada.
enum SemanaHojeada: Equatable {
    case llego(SemanaDelPlan)
    case falla
}

/// El coach pausó el plan. Ni error ni vacío: el atleta no ve sesiones caducadas. El CÓDIGO del
/// motivo (`paused_reason`) no viaja hasta aquí: lo que se dice es genérico (una pausa por
/// vacaciones no puede leerse «mientras te recuperas»).
struct PausaDelPlan: Equatable {
    /// ISO desde el que está en pausa, si el servidor lo sabe.
    let desde: String?
}

/// El desglose de una sesión llega aparte de la semana (una petición por día mostrado):
///  · `cargando`   → esqueleto con la forma de las partes (nada salta al llegar)
///  · `sinDetalle` → el servidor no lo sirvió: el sujeto enseña lo que sí sabe
///  · `listo`      → las partes reales
enum Desglose: Equatable {
    case cargando
    case sinDetalle
    case listo(DesgloseSesion)

    var listo: DesgloseSesion? {
        if case let .listo(d) = self { return d }
        return nil
    }
}

struct LecturaPlan: Equatable {
    /// `coach_name`. Nil → «tu coach».
    var coach: String?
    /// Nombre de pila de la pareja de dobles: enseña el chip «Dobles · Biel» en el cromo.
    var companero: String?
    /// `today_iso` del cable: el «hoy» del atleta.
    var hoyIso: String
    /// Arranque en frío: sin semana en memoria todavía. Cada pieza es un esqueleto con la forma final,
    /// NUNCA un vacío ni una invitación (aún no sabemos cuál toca).
    var cargando: Bool
    /// No cargó y no hay caché (instalación nueva sin red).
    var errorCarga: Bool
    var pausa: PausaDelPlan?
    /// Nil solo mientras carga o si falló sin caché.
    var actual: SemanaDelPlan?
    var hojeadas: [Int: SemanaHojeada] = [:]
    /// `plan_visibility.wall_message`. Nil → el texto por defecto.
    var muro: String?
    /// El servidor dice que el horizonte del club bloquea el siguiente salto. Solo cuenta cuando la semana que se
    /// mira aún no lo sabe (cargando, o falló): en cuanto llega, manda lo que ella diga (`peekBlockedByHorizon`).
    var horizonteBloquea = false
    /// Desglose por id de sesión. Una sesión sin entrada se lee como `sinDetalle`.
    var desgloses: [String: Desglose] = [:]

    func desglose(de sesionId: String) -> Desglose { desgloses[sesionId] ?? .sinDetalle }

    /// La semana que se mira: la actual (offset 0) o una hojeada que llegó.
    func semanaVisible(offset: Int) -> SemanaDelPlan? {
        if offset == 0 { return actual }
        if case let .llego(s) = hojeadas[offset] { return s }
        return nil
    }

    /// Hay una semana más adelante que ver desde la que se mira (contenido + horizonte del club, FH-27).
    func puedeAvanzar(offset: Int) -> Bool {
        semanaVisible(offset: offset)?.hasNextWeek ?? false
    }

    /// La hay, pero el club no deja verla todavía: el «›» lleva candado y al tocarlo dice por qué.
    func bloqueadaPorElClub(offset: Int) -> Bool {
        semanaVisible(offset: offset)?.peekBlockedByHorizon ?? horizonteBloquea
    }
}

// MARK: - Qué pantalla toca

struct NavegacionPlan: Equatable {
    /// 0 = esta semana; 1+ = hojeando hacia delante.
    var offset = 0
    /// El día elegido a mano dentro de la semana visible. Nil = el que toca por defecto.
    var seleccion: String?
    /// La semana visible se está pidiendo (efímero).
    var cargando = false
}

enum MotivoSinPlan: Equatable {
    /// El plan YA está programado y empieza más adelante: se dice la fecha exacta.
    case empiezaDespues
    /// No hay nada programado: se está preparando.
    case preparando
}

enum CuerpoPlan: Equatable {
    case sesion(dia: DiaDelPlan, principal: AthleteWeekDaySession, otras: [AthleteWeekDaySession], estado: EstadoSesion)
    /// `conContexto`: el día mostrado es hoy de verdad, así que ayer y mañana sitúan.
    case descanso(dia: DiaDelPlan, conContexto: Bool)
    case semanaCargando
    case semanaFalla
    /// La semana llegó y no trae nada que mostrar (el coach aún no la llenó).
    case semanaVacia
}

enum VistaPlan: Equatable {
    case cargando
    case error
    case pausa(desde: String?)
    case sinPlan(motivo: MotivoSinPlan, inicio: String?)
    case semana(offset: Int, semana: SemanaDelPlan?, cuerpo: CuerpoPlan)
}

extension LecturaPlan {

    /// La escalera de qué pantalla toca. Es la de `PlanView.contenido`, con el orden que ya tenía y
    /// una corrección: decide por la semana VISIBLE. Quien hojea la que viene desde un vacío con
    /// inicio futuro llega a ella (antes se quedaba en el vacío).
    func vista(_ nav: NavegacionPlan) -> VistaPlan {
        if cargando && actual == nil { return .cargando }
        if let pausa { return .pausa(desde: pausa.desde) }
        if errorCarga && actual == nil { return .error }

        if nav.offset == 0 {
            guard let s = actual, s.tieneAlgunaSesion else {
                return .sinPlan(
                    motivo: actual?.planStartsOn != nil ? .empiezaDespues : .preparando,
                    inicio: actual?.planStartsOn
                )
            }
            return .semana(offset: 0, semana: s, cuerpo: cuerpo(de: s, nav: nav))
        }

        if nav.cargando { return .semana(offset: nav.offset, semana: nil, cuerpo: .semanaCargando) }
        if hojeadas[nav.offset] == .falla { return .semana(offset: nav.offset, semana: nil, cuerpo: .semanaFalla) }
        guard let s = semanaVisible(offset: nav.offset) else {
            return .semana(offset: nav.offset, semana: nil, cuerpo: .semanaVacia)
        }
        return .semana(offset: nav.offset, semana: s, cuerpo: cuerpo(de: s, nav: nav))
    }

    private func cuerpo(de semana: SemanaDelPlan, nav: NavegacionPlan) -> CuerpoPlan {
        // Sin día que mostrar: solo pasa con una semana hojeada que llegó vacía (la de hoy sin sesiones ya es «sin plan»).
        guard let dia = semana.diaMostrado(seleccion: nav.seleccion) else { return .semanaVacia }
        guard let principal = dia.sesionPrincipal else {
            return .descanso(dia: dia, conContexto: dia.esHoy && nav.offset == 0)
        }
        return .sesion(
            dia: dia,
            principal: principal,
            otras: dia.secundarias(de: principal),
            estado: principal.estado.efectivo(enDia: dia.isoDate, hoy: hoyIso)
        )
    }
}

// MARK: - El tono del sujeto: el color dice el MOMENTO y nunca lleva el texto

extension VistaPlan {

    /// El acento sólido es solo «haz esto ahora»: hoy y por hacer. Un día por hacer que no es hoy lleva
    /// el acento suave (es lo que viene, no lo de ahora); todo lo demás va en tintes suaves. Un día
    /// sin hacer es un HECHO («no quedó nada registrado»), no un fallo: gris, nunca rojo.
    var tono: TonoDia {
        switch self {
        case .cargando, .pausa:
            return .neutro
        case .error:
            return .peligro
        case let .sinPlan(motivo, _):
            return motivo == .empiezaDespues ? .acento : .neutro
        case let .semana(_, _, cuerpo):
            switch cuerpo {
            case .descanso:
                return .soporte
            case .semanaFalla:
                return .peligro
            case .semanaCargando, .semanaVacia:
                return .neutro
            case let .sesion(dia, _, _, estado):
                switch estado {
                case .pendiente: return dia.esHoy ? .accion : .acento
                case .hecha:     return .ok
                case .parcial:   return .aviso
                case .saltada:   return .neutro
                }
            }
        }
    }
}

// MARK: - La acción anclada: UNA, y siempre la misma puerta

enum AccionAnclada: Equatable {
    case empezar(sesion: AthleteWeekDaySession, dia: DiaDelPlan)
    case verHecho(sesion: AthleteWeekDaySession, dia: DiaDelPlan)
    /// `cuando`: «mañana» o «del viernes».
    case verSiguiente(sesion: AthleteWeekDaySession, dia: DiaDelPlan, cuando: String)
    case escribirAlCoach
    case reintentar
    case verSemanaQueViene
    case volverAEstaSemana

    /// La palabra de la acción. El nombre del coach es un DATO (HARD RULE Nº0), jamás una constante.
    func texto(coach: String?) -> String {
        switch self {
        case .empezar:                return "Empezar"
        case .verHecho:               return "Ver lo que hiciste"
        case let .verSiguiente(_, _, cuando): return "Ver lo de \(cuando)"
        case .escribirAlCoach:        return coach.map { "Escribir a \($0)" } ?? "Escribir a tu coach"
        case .reintentar:             return "Reintentar"
        case .verSemanaQueViene:      return "Ver la semana que viene"
        case .volverAEstaSemana:      return "Volver a esta semana"
        }
    }

    /// La acción anclada abre el menú «···» solo cuando hay una sesión delante.
    var conMenu: Bool {
        switch self {
        case .empezar, .verHecho: return true
        default: return false
        }
    }
}

extension VistaPlan {

    /// Qué puede hacer el atleta AHORA con lo que la card enseña. Sigue al día MOSTRADO: actuar sobre
    /// una sesión que no es la de la pantalla sería la propia mentira que este botón existe para evitar.
    /// Sin sesión ni siguiente no hay una tercera acción que inventar: el cromo ya lleva al ciclo.
    func accion(en l: LecturaPlan) -> AccionAnclada? {
        switch self {
        case .cargando:
            return nil
        case .error:
            return .reintentar
        case .pausa:
            return .escribirAlCoach
        case let .sinPlan(motivo, _):
            if motivo == .preparando { return .escribirAlCoach }
            return l.actual?.hasNextWeek == true ? .verSemanaQueViene : nil
        case let .semana(_, semana, cuerpo):
            switch cuerpo {
            case let .sesion(dia, principal, _, _):
                return principal.estado.trabajada
                    ? .verHecho(sesion: principal, dia: dia)
                    : .empezar(sesion: principal, dia: dia)
            case let .descanso(_, conContexto):
                guard conContexto, let semana, let sig = semana.sesionDeManana else { return nil }
                return .verSiguiente(
                    sesion: sig.sesion, dia: sig.dia,
                    cuando: FechasDelPlan.cuandoDeSiguiente(sig.dia.isoDate, hoy: l.hoyIso)
                )
            case .semanaFalla:
                return .reintentar
            case .semanaVacia:
                return .volverAEstaSemana
            case .semanaCargando:
                return nil
            }
        }
    }
}

// MARK: - La cabecera: dónde estás dentro del bloque

/// El título de la semana que se mira. Con posición del servidor, esa; sin ella (plan sin bloque) se
/// nombra por su distancia a hoy, que es un hecho.
func tituloDeSemana(_ posicion: PosicionEnBloque?, offset: Int) -> String {
    if let posicion { return posicion.texto }
    if offset == 0 { return "Esta semana" }
    if offset == 1 { return "Semana que viene" }
    return "En \(offset) semanas"
}

