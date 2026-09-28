import Foundation

// LO QUE LA FAMILIA WOD SABE Y EL PASO NO — funciones PURAS (espejo de lo que
// `screens/iphone-vivo-wod/vistas.tsx` pone encima del kit). El motor lleva el
// reloj de cada formato; lo que el atleta MARCA (la tarea del EMOM hecha, las
// reps de este minuto del death by, la puntuación dicha en la campana) no lo
// guarda nadie más, y vive aquí como dato:
//
//   · EMOM y death by: «Hecho» marca la ventana, NO la cierra. Lo que queda
//     del minuto es respiro; el reloj la cierra solo.
//   · Death by: un minuto que el reloj cierra sin «Hecho» es el último (te
//     cazó); la puntuación son los minutos marcados (`cazadoEn`, `resultadoDeathBy`).
//   · AMRAP: «+1 ronda» cuenta rondas; en la campana, las rondas y las reps de
//     la ronda a medias se dicen con el dial (`girarPuntuacion`) y se guardan.
//
// Nada de esto decide cómo se pinta: lo recoge `VivoIphoneCuadro`.

extension Vivo {

    /// El estado de la familia: lo marcado y lo dicho. Vacío al empezar.
    struct EstadoWod: Equatable {
        /// Por id de paso, el segundo de la ventana en que se marcó «Hecho».
        var hechas: [String: Double] = [:]
        /// La puntuación que se está diciendo; nil = aún la que dejó el motor.
        var dial: Dial? = nil
        /// El dato de la puntuación que mueven los ±.
        var foco: CampoPuntuacion = .reps
    }

    // MARK: - La ventana que se marca (EMOM, death by)

    /// ¿La ventana de este paso se marca a mano? Un EMOM con dosis y un death
    /// by. «Row · todo el minuto» no: no hay nada que acabar antes que el reloj.
    static func seMarca(_ p: Paso) -> Bool {
        switch p.wod {
        case let .emom(tarea, _, _, _)?: return tarea.dosis != nil && tarea.dosis?.tipo != .abierta
        case .deathby?: return true
        default: return false
        }
    }

    /// Cuánto tardó la MISMA tarea la última vez que se marcó (por nombre, hacia
    /// atrás): «la vez anterior» del EMOM y del death by.
    static func ultimaVezDe(_ pasos: [Paso], _ i: Int, _ hechas: [String: Double]) -> Double? {
        guard i >= 0, i < pasos.count else { return nil }
        let nombre = pasos[i].nombre
        for k in stride(from: i - 1, through: 0, by: -1) where pasos[k].nombre == nombre {
            if let t = hechas[pasos[k].id] { return t }
        }
        return nil
    }

    /// El héroe con la marca encima: EMOM hecho → «respiro»; death by hecho →
    /// «hecho en 0:22 · respiro».
    static func heroeWod(_ p: Paso, _ base: HeroeVista, _ w: EstadoWod) -> HeroeVista {
        guard let t = w.hechas[p.id] else { return base }
        if deathByDe(p) != nil { return heroeDeathBy(p, hechaEn: t) ?? base }
        if case .emom? = p.wod {
            var h = base
            h.etiqueta = "respiro"
            return h
        }
        return base
    }

    /// LA ACCIÓN PRIMARIA DEL WOD sobre la del kit (vocabulario cerrado).
    ///   EMOM / death by: «Hecho» mientras la ventana no esté marcada; luego, nada (manda el reloj).
    ///   AMRAP de varias tareas: «+1 ronda»; de una sola, nada (no hay rondas que contar).
    ///   Puntuación: «Guardar».
    static func primariaWod(_ p: Paso, porDefecto: ClavePrimaria?, _ w: EstadoWod) -> ClavePrimaria? {
        switch p.wod {
        case .emom?, .deathby?:
            if p.rol != .trabajo { return porDefecto }
            return seMarca(p) && w.hechas[p.id] == nil ? .hecho : nil
        case let .amrap(tareas, _)?: return tareas.count > 1 ? .rondaHecha : nil
        case .puntuacion?: return .guardar
        default: return porDefecto
        }
    }

    /// El aviso de deshacer de lo que la familia marca: «Bench Press hecho»,
    /// «7 Burpee hechos», «Ronda 4 anotada» (`ronda` = la que se acaba de anotar).
    static func avisoWod(_ p: Paso, ronda: Int? = nil) -> String? {
        if let w = deathByDe(p) {
            let reps = w.tarea.dosis?.prescrito.map { num($0) }
            return [reps, w.tarea.nombre, "hechos"].compactMap { $0 }.joined(separator: " ")
        }
        switch p.wod {
        case let .emom(tarea, _, _, _)?: return "\(tarea.nombre) hecho"
        case .amrap?: return ronda.map { "Ronda \($0) anotada" }
        default: return nil
        }
    }

    // MARK: - Death by: el reloj te caza

    /// Los minutos completos: los marcados.
    static func completosDeathBy(_ pasos: [Paso], _ hechas: [String: Double]) -> Int {
        pasos.filter { deathByDe($0) != nil && hechas[$0.id] != nil }.count
    }

    /// Lo que dice «Sesión completada» al acabar un death by.
    static func resultadoDeathBy(_ pasos: [Paso], _ hechas: [String: Double]) -> String? {
        guard let w = pasos.lazy.compactMap({ deathByDe($0) }).first else { return nil }
        return resultadoDeathBy(completos: completosDeathBy(pasos, hechas), tope: w.tope)
    }

    // MARK: - La puntuación del AMRAP

    /// La puntuación de partida en la campana: las rondas que contó el motor; las
    /// reps, las que alguien contó (sin contar = «—», nunca 0).
    static func dialDelMotor(rondas: Int?, reps: Int?) -> Dial {
        Dial(rondas: Swift.max(0, rondas ?? 0), reps: reps)
    }

    /// Las tareas de la ronda del paso (AMRAP o su puntuación).
    static func tareasAmrap(_ p: Paso) -> [Tarea] {
        switch p.wod {
        case let .amrap(tareas, _)?, let .puntuacion(tareas, _)?: return tareas
        default: return []
        }
    }

    /// Lo que la tarjeta de la puntuación dice a la derecha: «reps sin decir»,
    /// «ronda entera» o dónde te quedaste («hasta Row + 15 Wall Ball»).
    static func textoPuntuacion(_ d: Dial, _ tareas: [Tarea]) -> String {
        guard let reps = d.reps else { return "reps sin decir" }
        guard tareas.count > 1, reps > 0 else { return "ronda entera" }
        return "hasta \(desgloseReps(tareas, reps))"
    }

    /// ¿El motor espera la puntuación del AMRAP? Acabó el trabajo prescrito y
    /// lo último fue un AMRAP: el vivo la pide antes de cerrar la sesión.
    static func esperaPuntuacion(_ sesion: WorkoutSession) -> Bool {
        sesion.isAwaitingFinishDecision && !sesion.isFinished && sesion.currentSegment?.formatScheme == .amrap
    }
}
