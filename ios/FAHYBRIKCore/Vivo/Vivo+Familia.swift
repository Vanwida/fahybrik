import Foundation

// LA FAMILIA DEL PASO Y SU FORMATO — funciones PURAS (I4 del modelo del
// iPhone; espejo de `kit-reloj/familia.ts`). Qué pintor pinta el paso (una
// pregunta por familia) y cómo se llama su formato en castellano de box.

extension Vivo {

    /// Lo que haces, para elegir el pintor (I4). No es la clase del paso ni el
    /// formato del bloque: un SkiErg en una estación de HYROX es `ski`.
    enum Familia: String, Equatable {
        case correr, cinta, remo, ski, bici, fuerza, emom, amrap, fortime, pared, deathby
        case estacion, roxzone, movilidad, recupera, descanso, transicion
    }

    private static func familiaMaquina(_ t: Maquina.Tipo) -> Familia {
        switch t {
        case .remo: return .remo
        case .ski: return .ski
        case .bici: return .bici
        case .cinta: return .cinta
        }
    }

    static func familiaDe(_ p: Paso) -> Familia {
        if p.rol == .recuperacion { return .recupera }
        if p.rol == .descanso { return .descanso }
        if p.clase == .roxzone { return .roxzone }
        let w = p.wod
        if p.rol == .transicion { return w?.formato == .puntuacion ? .amrap : .transicion }
        switch w {
        case let .emom(tarea, _, _, _): return tarea.corre == true ? .cinta : .emom
        case .amrap: return .amrap
        case .fortime: return .fortime
        case .pared: return .pared
        case .deathby: return .deathby
        default: break
        }
        if esFuerza(p) || p.clase == .fuerza { return .fuerza }
        if p.clase == .movilidad { return .movilidad }
        if let m = p.maquina, p.medida.mide == .ergo || p.clase == .ergo || p.clase == .test || m.tipo == .cinta {
            return familiaMaquina(m.tipo)
        }
        if p.entorno == .cinta || p.medida.mide == .cinta { return .cinta }
        if p.clase == .estacion { return .estacion }
        if esCarrera(p) { return .correr }
        return .estacion
    }

    /// ¿Es un test? La cabecera lo marca.
    static func esTest(_ p: Paso) -> Bool { p.clase == .test }

    /// CÓMO SE LLAMA EL FORMATO EN LA PANTALLA — castellano de box, desde UN
    /// sitio. Método del coach con defecto (HARD RULE Nº0).
    struct NombresFormato: Equatable {
        var emom = "EMOM"
        var amrap = "AMRAP"
        var fortime = "For Time"
        var pared = "Tabata"
        var deathby = "Death by"
        var circuito = "Circuito"
        var test = "Test"
    }

    static let nombresFormatoDefecto = NombresFormato()

    /// El formato del paso con su tamaño: «EMOM 12′», «AMRAP 15′», «For Time ·
    /// cap 20′», «Tabata 8 × 20″/10″», «Circuito»; si no, el nombre de su clase.
    static func formatoDe(_ p: Paso, nombres: NombresFormato = nombresFormatoDefecto) -> String {
        switch p.wod {
        case let .emom(_, _, ventanas, ventanaS): return "\(nombres.emom) \(fmtDuracion(Double(ventanas) * ventanaS))"
        case let .amrap(_, d), let .puntuacion(_, d): return "\(nombres.amrap) \(fmtDuracion(d))"
        case let .fortime(_, capS): return capS.map { "\(nombres.fortime) · cap \(fmtDuracion($0))" } ?? nombres.fortime
        case let .pared(t, d, r): return "\(nombres.pared) \(r) × \(fmtDuracion(t))/\(fmtDuracion(d))"
        case .deathby: return formatoDeathBy(p, nombres: nombres) ?? nombres.deathby
        case nil: break
        }
        if esTest(p) { return nombres.test }
        if p.clase == .estacion || p.clase == .roxzone || (p.clase == .carrera && p.posicion?.ronda != nil) { return nombres.circuito }
        if p.clase == .series { return "Series" }
        if p.clase == .fuerza { return "Fuerza" }
        // «Ergo» no es palabra de box: el formato es por series o continuo.
        if p.clase == .ergo { return p.posicion?.serie != nil ? "Series" : "Continuo" }
        return nombreClase(p.clase)
    }

    /// Ergo y cinta admiten horizontal (§3 del modelo).
    static func admiteHorizontal(_ f: Familia) -> Bool {
        f == .remo || f == .ski || f == .bici || f == .cinta
    }
}
