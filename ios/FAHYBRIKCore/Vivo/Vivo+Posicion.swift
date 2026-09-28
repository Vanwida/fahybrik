import Foundation

// LA POSICIÓN EN PALABRAS Y LO QUE VIENE — funciones PURAS (I5.1, I5.6 del
// modelo del iPhone; espejo de `kit-reloj/posicion.ts`).
//   posicionDe   la cabecera por partes: «Serie 3/6 · 1000 m», «Minuto 3/12»,
//                «Sled Push · Ronda 2/8 · Estación 2/8», «A1 · Back Squat · Serie 2/5».
//   textoViene   lo que viene, en corto, para «Luego ·» y «Viene:».
//   luegoDe      el siguiente paso y el «después» si lo que viene es recuperar.

extension Vivo {

    /// LA POSICIÓN DE LA CABECERA, por partes y por prioridad.
    static func posicionDe(_ p: Paso, _ x: ExtraFamilia = ExtraFamilia()) -> [String] {
        let s = p.posicion?.serie
        switch p.wod {
        case let .emom(_, _, _, ventanaS):
            if let s { return ["\(ventanaS == 60 ? "Minuto" : "Ventana") \(s.n)/\(s.de)"] }
        case let .amrap(tareas, _):
            if tareas.count > 1 { return [x.rondas.map { "Ronda \($0 + 1)" } ?? "AMRAP"] }
        case .puntuacion:
            return ["Puntuación"]
        case .deathby:
            return posicionDeathBy(p) ?? contextoDe(p)
        case .pared:
            if p.rol == .trabajo {
                let o = principal(p)
                return [p.nombre, p.posicion?.ronda.map { "Ronda \($0.n)/\($0.de)" }, o.map { fmtObjetivo($0) }].compactMap { $0 }
            }
        default: break
        }
        if p.clase == .roxzone { return contextoDe(p) + ["Roxzone"] }
        if p.rol == .descanso || p.rol == .recuperacion {
            let pr = fmtPrescrito(p.medida)
            return contextoDe(p) + (pr.isEmpty ? [] : [pr])
        }
        if p.rol == .transicion, p.clase == .fuerza {
            let pr = fmtPrescrito(p.medida)
            return ["Colócate"] + (pr.isEmpty ? [] : [pr])
        }
        if p.fuerza != nil, p.rol == .trabajo {
            let quien = [p.posicion?.slot, p.nombre].compactMap { $0 }.joined(separator: " · ")
            var partes = [quien.isEmpty ? nil : quien, quienSerie(p)].compactMap { $0 }
            if p.medida.tipo == .tiempo { partes.append(fmtPrescrito(p.medida)) }
            return partes
        }
        let nombre = p.nombre ?? nombreMaquinaCorto(p.maquina)
        let estacion = p.clase == .estacion || p.clase == .fortime
        if let nombre, estacion || p.clase == .ergo || p.clase == .test || p.clase == .carrera {
            let dosis = fmtPrescrito(p.medida)
            var partes = contextoDe(p).filter { c in
                !c.hasPrefix("Ergo") && !c.hasPrefix("Test") && !c.hasPrefix("Carrera") && !c.hasPrefix("For Time") && !(estacion && c == dosis)
            }
            if !estacion, let serie = p.posicion?.serie, !partes.contains(where: { $0.hasPrefix("Serie") }) {
                partes.insert("Serie \(serie.n)/\(serie.de)", at: 0)
            }
            return [nombre] + partes.filter { $0 != nombre }
        }
        return contextoDe(p)
    }

    private static func modoRecupera(_ m: ModoRecupera?) -> String {
        switch m ?? .trote {
        case .trote: return "trote"
        case .andar: return "caminando"
        case .parado: return "parado"
        }
    }

    /// ¿Este paso ABRE una ronda? Solo un paso de trabajo: el primero del plan
    /// con esa ronda.
    static func abreRonda(_ p: Paso, _ pasos: [Paso]? = nil, _ j: Int? = nil) -> Bool {
        guard p.rol == .trabajo, let r = p.posicion?.ronda else { return false }
        if let pasos, let j {
            return !pasos.prefix(j).contains { q in q.rol == .trabajo && q.posicion?.ronda?.n == r.n && (q.bloque ?? 0) == (p.bloque ?? 0) }
        }
        return (p.posicion?.estacion?.n ?? 1) == 1
    }

    /// Lo que viene, en corto (para «Luego ·» y «Viene:»).
    static func textoViene(_ p: Paso, arrastrada: Double? = nil, abre: Bool? = nil) -> String {
        let abre = abre ?? abreRonda(p)
        let pos = p.posicion
        if p.rol == .recuperacion { return "Recupera \(textoPasoCorto(p)) \(modoRecupera(p.modoRecupera))" }
        if p.clase == .roxzone { return "Roxzone" }
        if case .puntuacion = p.wod { return "Puntuación" }
        if p.rol == .transicion, p.clase == .fuerza { return "Colócate \(fmtPrescrito(p.medida))".trimmingCharacters(in: .whitespaces) }
        if case .deathby = p.wod { return vieneDeathBy(p) ?? textoPasoCorto(p) }
        if let f = p.fuerza, p.rol == .trabajo, p.medida.tipo == .reps {
            let quien = [pos?.slot, p.nombre].compactMap { $0 }.joined(separator: " · ")
            let kg: Double?
            if case .corporal = f.carga { kg = nil } else { kg = arrastrada ?? cargaDelPlan(f) }
            let reps = p.medida.prescrito.map(num) ?? "—"
            return "\(quien) · \(kg.map { "\(reps) × \(fmtKg($0))" } ?? "\(reps) reps")"
        }
        let corto = textoPasoCorto(p)
        if let t = pos?.tanda, pos?.serie?.n == 1, let s = pos?.serie { return "Tanda \(t.n)/\(t.de) · \(s.de) × \(corto)" }
        if abre, let r = pos?.ronda { return "Ronda \(r.n)/\(r.de) · \(corto)" }
        if let t = pos?.tramo, p.nombre == nil { return "Tramo \(t.n)/\(t.de) · \(corto)" }
        if let s = pos?.serie, principal(p) == nil {
            let cuenta: String
            if case .emom = p.wod { cuenta = "Minuto" } else { cuenta = nombreCuenta(p).nombre }
            return "\(cuenta) \(s.n)/\(s.de) · \(corto)"
        }
        if principal(p) == nil, p.nombre == nil, pos?.serie == nil, pos?.ronda == nil, pos?.tanda == nil, p.rol == .trabajo {
            return "\(nombreClase(p.clase)) · \(corto)"
        }
        return corto
    }

    struct LuegoVista: Equatable {
        var que: String
        var despues: String?
    }

    /// «Luego ·» del paso `i`: el siguiente paso con su objetivo y, si es una
    /// recuperación, un descanso o una transición, también el trabajo de detrás.
    static func luegoDe(_ pasos: [Paso], _ i: Int, cargaDe: ((Int) -> Double?)? = nil) -> LuegoVista? {
        guard i + 1 < pasos.count else { return nil }
        let sig = pasos[i + 1]
        let tras = i + 2 < pasos.count ? pasos[i + 2] : nil
        var despues: String? = nil
        if sig.rol != .trabajo, let tras, tras.rol == .trabajo {
            despues = textoViene(tras, arrastrada: cargaDe?(i + 2), abre: abreRonda(tras, pasos, i + 2))
        }
        return LuegoVista(que: textoViene(sig, arrastrada: cargaDe?(i + 1), abre: abreRonda(sig, pasos, i + 1)), despues: despues)
    }
}
