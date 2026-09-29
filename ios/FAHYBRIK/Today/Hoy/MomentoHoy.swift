import Foundation

// EL MOMENTO DEL DÍA — qué es el sujeto de la portada AHORA.
//
// La tesis de «Hoy · El día»: el atleta no abre la app para ver el mismo panel siempre, abre
// para saber qué le toca ahora, y eso cambia a lo largo del día. Estas funciones son PURAS
// sobre la `LecturaHoy`: la pantalla pinta lo que decidan, no decide nada por su cuenta.
// Espejo de `screens/hoy-dia/momento.ts`; lo fijan los mismos 36 casos
// (`MomentoHoyTests`), así que la app y el doble no pueden divergir.
//
// Precedencia OBJETIVA (no es gusto: cada paso tapa a los de debajo porque sin él los de
// debajo no se pueden leer o no se pueden hacer):
//   1. cargando            → esqueleto (aún no sabemos cuál de los demás toca)
//   2. error de carga      → «No pudimos cargar tu plan» con «Reintentar»
//   3. sin coach           → montar el entreno de hoy (no hay plan que contar)
//   4. plan en pausa       → la pausa, dicha con calma (no una sesión vieja)
//   5. entreno a medias    → retomarlo (es la MISMA sesión, ya empezada)
//   6. check-in pendiente  → el check-in (el camino más corto a un número)
//   7. sesión pendiente    → la primera pendiente, como ESTADO (la puerta es el Plan)
//   8. sesiones cerradas   → «Hecho hoy», con hecha / a medias / sin hacer
//   9. descanso            → «Hoy descansas» y qué toca después; sin nada publicado y sin
//                            ningún dato, es el primer día.

enum MomentoHoy: Equatable {
    case cargando
    case error
    case libre
    case pausa
    /// `sesion` es la de hoy con el mismo título, si la hay (para su modalidad).
    case retoma(titulo: String, desde: String, sesion: SesionHoy?)
    case checkin
    /// `delDia` son TODAS las de hoy (para decir la otra franja sin hacerla héroe).
    case sesion(SesionHoy, delDia: [SesionHoy])
    case hecho([SesionHoy])
    case descanso(manana: Manana?, hayMasPublicado: Bool)
    case primerDia

    /// Solo el tipo, sin la carga: lo que comparan los casos.
    enum Tipo: Equatable {
        case cargando, error, libre, pausa, retoma, checkin, sesion, hecho, descanso, primerDia
    }

    var tipo: Tipo {
        switch self {
        case .cargando: return .cargando
        case .error: return .error
        case .libre: return .libre
        case .pausa: return .pausa
        case .retoma: return .retoma
        case .checkin: return .checkin
        case .sesion: return .sesion
        case .hecho: return .hecho
        case .descanso: return .descanso
        case .primerDia: return .primerDia
        }
    }
}

extension LecturaHoy {

    /// Las sesiones de hoy, en el orden del día (AM, PM). Vacío si hoy no las trae.
    var sesionesDeHoy: [SesionHoy] {
        if case .sesiones(let s)? = hoy { return s }
        return []
    }

    /// El entreno guardado para luego, si lo hay.
    fileprivate var aMedias: (titulo: String, desde: String)? {
        for r in reclamos {
            if case .aMedias(let titulo, let desde) = r { return (titulo, desde) }
        }
        return nil
    }

    /// Los tests que el primer día se lleva el sujeto («empieza por tus tests»). Solo si faltan: una
    /// batería completa no es por dónde empezar. Sin batería publicada (`total` nil) también faltan.
    var testsDelPrimerDia: (hechos: Int, total: Int?)? {
        for r in reclamos {
            if case .tests(let hechos, let total) = r {
                guard hechos < (total ?? Int.max) else { return nil }
                return (hechos, total)
            }
        }
        return nil
    }

    /// El primer día: nada publicado después de hoy Y ningún dato del atleta todavía (ni número de
    /// disposición ni una marca). Un veterano al final de lo publicado NO es un primer día: es un
    /// descanso sin «mañana» todavía.
    private var esPrimerDia: Bool {
        guard case .sinDatos = disposicion, case .ninguna = marca else { return false }
        return true
    }

    /// Lo que toca a continuación cuando hoy no hay nada; y si algo más está publicado aunque no entre
    /// en la semana que se ve.
    private var siguiente: (manana: Manana?, hayMasPublicado: Bool) {
        if case .descanso(let manana, let hayMas)? = hoy { return (manana, hayMas) }
        return (nil, false)
    }

    var momento: MomentoHoy {
        if cargando { return .cargando }
        if case .errorCarga? = hoy { return .error }
        if !conCoach { return .libre }
        if case .pausado? = hoy { return .pausa }

        let sesiones = sesionesDeHoy
        if let medias = aMedias {
            let sesion = sesiones.first { $0.titulo == medias.titulo }
            return .retoma(titulo: medias.titulo, desde: medias.desde, sesion: sesion)
        }
        if checkinPendiente { return .checkin }

        if let pendiente = sesiones.first(where: { $0.estado == .pendiente }) {
            return .sesion(pendiente, delDia: sesiones)
        }
        if !sesiones.isEmpty { return .hecho(sesiones) }

        // Con coach y sin `hoy` (o una lista vacía) es lo mismo que un día sin nada.
        let (manana, hayMas) = siguiente
        if manana == nil, !hayMas, esPrimerDia { return .primerDia }
        return .descanso(manana: manana, hayMasPublicado: hayMas)
    }
}

// MARK: - La línea del día — el instante en el que estás, sin inventar horarios

enum PasoDelDia: Int, CaseIterable, Equatable {
    case antes, entreno, despues

    var etiqueta: String {
        switch self {
        case .antes: return "Antes"
        case .entreno: return "Entreno"
        case .despues: return "Después"
        }
    }
}

enum InstanteDelDia: Equatable {
    /// Un día con sesiones: dónde estás respecto a ellas. `cerradas` de `total`.
    case recorrido(ahora: PasoDelDia, cerradas: Int, total: Int)
    /// Un día sin sesiones que recorrer: se dice qué día es, no se dibuja un recorrido vacío.
    case rotulo(String)
}

extension LecturaHoy {

    /// Dónde estás en el día. Sale del ESTADO de las sesiones (y de si hay una empezada), jamás de una
    /// hora del plan: el plan no la tiene y la hora del reloj no dice si ya entrenaste. Nil cuando no hay
    /// día que contar (cargando, error o sin coach).
    var instanteDelDia: InstanteDelDia? {
        guard !cargando, conCoach, let hoy else { return nil }
        switch hoy {
        case .errorCarga: return nil
        case .pausado: return .rotulo("Plan en pausa")
        case .sesiones, .descanso: break
        }

        let empezado = aMedias != nil
        let sesiones = sesionesDeHoy
        if sesiones.isEmpty {
            if empezado { return .rotulo("Entreno a medias") }
            let (manana, hayMas) = siguiente
            return .rotulo(manana == nil && !hayMas && esPrimerDia ? "Primer día" : "Día de descanso")
        }

        let total = sesiones.count
        let cerradas = sesiones.filter { $0.estado != .pendiente }.count
        let ahora: PasoDelDia = empezado ? .entreno : cerradas == 0 ? .antes : cerradas == total ? .despues : .entreno
        return .recorrido(ahora: ahora, cerradas: cerradas, total: total)
    }
}

// MARK: - El saludo por la hora

/// Los cortes del saludo (los de siempre de Inicio: 6-13 días, 13-21 tardes, el resto noches).
enum SaludoDeLaHora {
    static let amanece = 6
    static let mediodia = 13
    static let anochece = 21

    /// `hora` es «7:40»; una hora que no se lee cae a la noche, que es el corte por defecto de siempre.
    static func texto(hora: String, nombre: String?) -> String {
        let h = Int(hora.split(separator: ":").first ?? "") ?? -1
        let base: String
        switch h {
        case amanece..<mediodia: base = "Buenos días"
        case mediodia..<anochece: base = "Buenas tardes"
        default: base = "Buenas noches"
        }
        guard let nombre, !nombre.isEmpty else { return base }
        return "\(base), \(nombre)"
    }
}

extension LecturaHoy {
    /// El saludo. En frío el nombre es relleno: solo el de la hora, que es del dispositivo.
    var saludo: String {
        SaludoDeLaHora.texto(hora: hora, nombre: cargando ? nil : nombre)
    }
}

// MARK: - «Contigo» — lo que te reclama, en el orden en que caduca

enum ItemContigo: Equatable {
    case reclamo(Reclamo)
    case comunicados(Int)

    var clave: ClaveContigo {
        switch self {
        case .reclamo(let r): return r.clave
        case .comunicados: return .comunicados
        }
    }
}

extension LecturaHoy {

    /// Orden de lo que reclama: primero lo que caduca en minutos (tu pareja está entrenando AHORA),
    /// luego lo empezado, luego lo que tiene fecha, luego lo que espera sin prisa. Es mecanismo de la
    /// portada, no método del coach.
    func itemsContigo(_ m: MomentoHoy) -> [ItemContigo] {
        if cargando { return [] }
        var pausado = false
        if case .pausado? = hoy { pausado = true }
        let primerDiaConTests: Bool = { if case .primerDia = m { return testsDelPrimerDia != nil }; return false }()
        var enMedias = false
        if case .retoma = m { enMedias = true }

        var items: [ItemContigo] = reclamos.compactMap { r in
            switch r {
            // Lo empezado ya es el sujeto cuando toca; si otro momento lo tapa, se queda aquí.
            case .aMedias: return enMedias ? nil : .reclamo(r)
            // Sin coach no hay revisión, ni batería, ni pareja de dobles (la crea el coach).
            case _ where !conCoach: return nil
            // Con el plan en pausa no hay tests que hacer, y el primer día se los lleva el sujeto.
            case .tests: return pausado || primerDiaConTests ? nil : .reclamo(r)
            default: return .reclamo(r)
            }
        }
        if conCoach, comunicados > 0 { items.append(.comunicados(comunicados)) }
        return items.sorted { $0.clave < $1.clave }
    }

    /// «Únete en vivo» solo cuando tienes TU sesión pendiente hoy y el plan no está en pausa. Unirse lleva
    /// al Plan, que es la única puerta que empieza un entreno.
    var puedeUnirse: Bool {
        sesionesDeHoy.contains { $0.estado == .pendiente }
    }
}

// MARK: - Vocabulario — el de la app, no uno nuevo

extension ModalidadHoy {
    /// `Theme.Modality.Kind.label` con mayúscula inicial: «Carrera», «Ergómetro»…
    var nombre: String {
        label.prefix(1).uppercased() + label.dropFirst()
    }
}
