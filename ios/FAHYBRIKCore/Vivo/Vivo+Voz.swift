import Foundation

// LA VOZ — lo que se dice a los auriculares, en español (P5, §4; espejo de
// `kit-reloj/voz.ts`). Cada frase sale del DATO del paso, nunca de un texto
// escrito a mano.

extension Vivo {

    private static let unidades = [
        "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
        "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno",
        "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
    ]
    private static let decenas = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
    private static let centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]

    private static func hasta999(_ n: Int) -> String {
        if n < 30 { return unidades[n] }
        if n < 100 {
            let d = n / 10, u = n % 10
            return u == 0 ? decenas[d] : "\(decenas[d]) y \(unidades[u])"
        }
        if n == 100 { return "cien" }
        let c = n / 100, r = n % 100
        return r == 0 ? centenas[c] : "\(centenas[c]) \(hasta999(r))"
    }

    /// 1000 → «mil»; 3950 → «tres mil novecientos cincuenta».
    static func enLetras(_ n: Double) -> String {
        let x = Swift.max(0, Int(n.rounded()))
        if x < 1000 { return hasta999(x) }
        let miles = x / 1000, r = x % 1000
        var m: String
        if miles == 1 { m = "mil" } else {
            var h = hasta999(miles)
            if h.hasSuffix("uno") { h = String(h.dropLast(3)) + "ún" }
            m = "\(h) mil"
        }
        return r == 0 ? m : "\(m) \(hasta999(r))"
    }

    private static func mayus(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    /// La medida dicha: «mil metros», «90 segundos», «50 minutos».
    private static func medidaDicha(_ p: Paso) -> String {
        guard let pr = p.medida.prescrito else { return "" }
        switch p.medida.tipo {
        case .distancia: return "\(enLetras(pr)) metros"
        case .tiempo: return tiempoDicho(pr)
        case .reps: return "\(num(pr)) repeticiones"
        case .cal: return "\(num(pr)) calorías"
        case .abierta: return ""
        }
    }

    /// El objetivo dicho: «a 3:50», «en zona 2», «a RPE 7».
    private static func objetivoDicho(_ p: Paso) -> String {
        guard let o = principal(p) else { return "" }
        let centro: Double = (o.min != nil && o.max != nil) ? (o.min! + o.max!) / 2 : (o.min ?? o.max ?? 0)
        switch o.eje {
        case .ritmo: return "a \(fmtRitmo(centro))"
        case .split500: return "a \(fmtSplit(centro, p.maquina)) el \(esBici(p.maquina) ? "mil" : "quinientos")"
        case .zona:
            if let mn = o.min, let mx = o.max, mn != mx { return "en zona \(Int(mn)) a \(Int(mx))" }
            return "en zona \(Int(o.max ?? o.min ?? 0))"
        case .ppm: return o.papel == .techo ? "sin pasar de \(Int(o.max ?? 0))" : "a \(Int(centro.rounded())) pulsaciones"
        case .rpe: return "a RPE \(num(centro))"
        case .potencia: return "a \(Int(centro.rounded())) vatios"
        default: return ""
        }
    }

    private static func gerundio(_ m: ModoRecupera?) -> String {
        switch m ?? .trote {
        case .trote: return "trotando"
        case .andar: return "caminando"
        case .parado: return "parado"
        }
    }

    private static func tiempoDicho(_ sD: Double) -> String {
        let s = Int(sD.rounded())
        if s < 60 || s % 60 != 0 { return "\(s) segundos" }
        return s == 60 ? "un minuto" : "\(s / 60) minutos"
    }

    /// Cómo se cuenta el paso en voz y en el aviso de deshacer: «Serie 3», «Tramo 2».
    static func nombreCuenta(_ p: Paso) -> (nombre: String, femenino: Bool) {
        if p.posicion?.tramo != nil { return ("Tramo", false) }
        if p.clase == .ergo || p.clase == .estacion { return ("Serie", true) }
        return (nombreClase(p.clase), femeninoDefecto.contains(p.clase))
    }

    // MARK: - Empieza el trabajo (GO)

    private static func tareaDicha(_ t: Tarea, ventanaS: Double? = nil) -> String {
        let carga = t.carga.map { ", \(num($0.kg)) kilos" } ?? ""
        guard let d = t.dosis, d.tipo != .abierta else {
            return ventanaS != nil ? "\(t.nombre), \(ventanaS == 60 ? "todo el minuto" : "todo el intervalo")" : t.nombre
        }
        let n = Int((d.prescrito ?? 0).rounded())
        switch d.tipo {
        case .reps: return "\(n) \(t.nombre)\(carga)"
        case .distancia: return "\(t.nombre), \(n) metros\(carga)"
        case .cal: return "\(t.nombre), \(n) calorías"
        default: return "\(t.nombre)\(carga)"
        }
    }

    private static func vozWod(_ p: Paso) -> String? {
        let pos = p.posicion
        switch p.wod {
        case let .emom(tarea, _, ventanas, ventanaS):
            return "\(pos?.serie.map { String($0.n) } ?? "") de \(ventanas). \(tareaDicha(tarea, ventanaS: ventanaS))."
        case let .amrap(tareas, d):
            return "AMRAP, \(Int(d / 60)) minutos. \(tareas.map { tareaDicha($0) }.joined(separator: ", "))."
        case let .fortime(tarea?, _):
            let ronda = (pos?.ronda != nil && pos?.estacion?.n == 1) ? "Ronda \(pos!.ronda!.n) de \(pos!.ronda!.de). " : ""
            return "\(ronda)\(tareaDicha(tarea))."
        case let .pared(_, _, rondas):
            return "Ronda \(pos?.ronda.map { String($0.n) } ?? "") de \(rondas)."
        case .deathby:
            return vozDeathBy(p)
        default: return nil
        }
    }

    private static func cargaDicha(_ p: Paso, _ kg: Double?) -> String? {
        if let kg { return "\(num(kg)) kilos" }
        guard let f = p.fuerza, let r = kgDelPlan(f.carga) else { return nil }
        return r.0 == r.1 ? "\(num(r.0)) kilos" : "\(num(r.0)) a \(num(r.1)) kilos"
    }

    private static func vozSerie(_ p: Paso, _ kg: Double?) -> String {
        let f = p.fuerza!
        let s = p.posicion?.serie
        let quien = [p.posicion?.slot, p.nombre].compactMap { $0 }.joined(separator: ", ")
        let cabeza = "\(quien). \(f.aproximacion ? "Aproximación" : "Serie")\(s.map { " \($0.n) de \($0.de)" } ?? "")"
        if p.medida.tipo == .tiempo { return "\(cabeza): \(tiempoDicho(p.medida.prescrito ?? 0))." }
        let carga = cargaDicha(p, kg)
        let lado = f.porLado.map { " por \($0.rawValue)" } ?? ""
        let esfuerzo = f.esfuerzo.map { ", \(textoEsfuerzo($0))" } ?? ""
        return "\(cabeza): \(num(p.medida.prescrito ?? 0)) repeticiones\(lado)\(carga.map { " con \($0)" } ?? "")\(esfuerzo)."
    }

    private static func vozCorrer(_ p: Paso) -> String {
        let nombre = nombreClase(p.clase)
        let pos = p.posicion
        var partes: [String] = []
        if let t = pos?.tanda { partes.append("Tanda \(t.n) de \(t.de)") }
        if let s = pos?.serie { partes.append("\(pos?.tanda != nil ? nombre.lowercased() : nombre) \(s.n) de \(s.de)") }
        if let t = pos?.tramo { partes.append("\(nombre), tramo \(t.n) de \(t.de)") }
        if partes.isEmpty { partes.append(p.nombre ?? nombre) }
        let cuerpo = [medidaDicha(p), objetivoDicho(p)].filter { !$0.isEmpty }.joined(separator: " ")
        return "\(partes.joined(separator: ", ")).\(cuerpo.isEmpty ? "" : " \(mayus(cuerpo)).")"
    }

    private static func vozErgo(_ p: Paso) -> String {
        let pos = p.posicion
        let cuenta: String
        if let s = pos?.serie { cuenta = "\(s.n) de \(s.de)" }
        else if let t = pos?.tramo { cuenta = "tramo \(t.n) de \(t.de)" }
        else if let r = pos?.ronda { cuenta = "ronda \(r.n) de \(r.de)" }
        else { cuenta = "" }
        var q = p
        q.posicion = nil
        let frase = vozCorrer(q)
        guard !cuenta.isEmpty, let punto = frase.firstIndex(of: ".") else { return frase }
        return "\(frase[..<punto]), \(cuenta)\(frase[punto...])"
    }

    /// Al empezar un paso de trabajo (GO): «Serie 3 de 6. Mil metros a 3:50.»
    static func vozInicio(_ p: Paso, kg: Double? = nil) -> String {
        if let w = vozWod(p) { return w }
        if p.fuerza != nil { return vozSerie(p, kg) }
        if p.clase == .ergo { return vozErgo(p) }
        return vozCorrer(p)
    }

    // MARK: - Deja de trabajar y las transiciones

    static func vozRecupera(_ p: Paso, siguiente: Paso?) -> String {
        let luego = (siguiente?.rol == .trabajo) ? medidaDicha(siguiente!) : ""
        return "Recupera, \(medidaDicha(p)) \(gerundio(p.modoRecupera)).\(luego.isEmpty ? "" : " Luego \(luego).")"
    }

    static func vozDescanso(_ p: Paso) -> String {
        if case .pared = p.wod { return "Descanso." }
        return "\(nombreClase(p.clase)), \(medidaDicha(p))."
    }

    static func vozTransicion(_ p: Paso, siguiente: Paso?) -> String? {
        if p.roxzone == .salida { return nil }
        if p.roxzone == .entrada { return siguiente.map { "Roxzone. Entras a \($0.nombre ?? "")." } }
        if case let .puntuacion(tareas, _)? = p.wod {
            return tareas.count > 1 ? "Tiempo. Rondas y repeticiones." : "Tiempo. ¿Cuántas \(tareas.first?.nombre ?? "")?"
        }
        guard let n = siguiente?.nombre, !n.isEmpty else { return "Colócate." }
        return "Colócate: \(n.prefix(1).lowercased())\(n.dropFirst())."
    }

    // MARK: - El resultado, el km, el preaviso

    static func vozFinSerie(_ p: Paso, _ v: Vuelta) -> String {
        let nombre = nombreCuenta(p).nombre
        func palabra(_ x: Veredicto?) -> String {
            switch x { case .dentro: return "dentro"; case .porEncima: return "rápida"; case .porDebajo: return "lenta"; case nil: return "" }
        }
        let o = principal(p)
        if o?.eje == .split500, let m = v.metros, m > 0 {
            let juicio = palabra(v.veredicto)
            return "\(nombre) \(v.n): \(fmtSplit(v.segundos * 500 / m, p.maquina)) el \(esBici(p.maquina) ? "mil" : "quinientos")\(juicio.isEmpty ? "" : ", \(juicio)")."
        }
        let pulso = o?.eje == .zona || o?.eje == .ppm
        let juicio = pulso ? (v.veredicto == .dentro ? "dentro" : v.veredicto == .porEncima ? "pulso alto" : "pulso bajo") : palabra(v.veredicto)
        if pulso, p.medida.tipo == .tiempo, v.veredicto != nil { return "\(nombre) \(v.n): \(juicio)." }
        return "\(nombre) \(v.n): \(fmtReloj(v.segundos))\(juicio.isEmpty ? "" : ", \(juicio)")."
    }

    static func vozVueltaAuto(_ n: Int, _ vueltaM: Double?, _ segundos: Double) -> String { "\(nombreVueltaAuto(n, vueltaM)): \(fmtReloj(segundos))." }

    static func vozPreaviso(_ p: Paso, falta: Double) -> String {
        p.medida.tipo == .distancia ? "Quedan \(enLetras(falta))." : "Quedan \(enLetras(falta)) segundos."
    }

    static let vozSesion = "Sesión completada."
}
