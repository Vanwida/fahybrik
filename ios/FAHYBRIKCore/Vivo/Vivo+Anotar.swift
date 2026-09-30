import Foundation

// ANOTAR LA SERIE — lo que se declara en el propio descanso (P11; espejo de
// `kit-reloj/anotar.ts`).
//
// La regla de honestidad: lo que se propone (reps, carga y esfuerzo
// prescritos, o la carga arrastrada de la serie anterior) NO cuenta como
// declarado hasta que el atleta lo confirma o lo toca. Tres estados por dato:
//   propuesto  sale del plan (o de la serie anterior): gris, «sin confirmar»
//   medido     lo midió el reloj (reps del sensor)
//   declarado  lo dijo el atleta
// Solo lo declarado se GUARDA (`Registro`). La carga va en CASCADA.

extension Vivo {

    enum EstadoDato: String, Equatable { case propuesto, medido, declarado }
    enum CampoAnotar: String, Equatable, Codable { case reps, kg, esfuerzo }

    struct Dato: Equatable {
        var valor: Double?
        var estado: EstadoDato
    }

    struct Anotacion: Equatable {
        var reps: Dato
        /// nil = no hay carga que anotar (peso corporal).
        var kg: Dato?
        /// nil = el coach no prescribió esfuerzo.
        var esfuerzo: Dato?
    }

    struct Declarado: Equatable {
        var reps: Double? = nil
        var kg: Double? = nil
        var esfuerzo: Double? = nil
    }

    /// Lo declarado, por id de paso. Lo único que se guarda.
    typealias Registro = [String: Declarado]

    struct MedidaSerie: Equatable {
        var segundos: Double
        var reps: Double?
    }

    private static func alPaso(_ n: Double, _ paso: Double) -> Double { paso > 0 ? (n / paso).rounded() * paso : n }

    /// La carga que propone el PLAN: el centro de lo prescrito, cargable en la barra; o la de la última vez.
    static func cargaDelPlan(_ f: FichaFuerza) -> Double? {
        if let r = kgDelPlan(f.carga) { return alPaso((r.0 + r.1) / 2, f.pasoKg) }
        switch f.carga {
        case let .rm(pMin, pMax, rm?): return alPaso(rm * (pMin + pMax) / 200, f.pasoKg)
        case let .tuya(ultima, _): return ultima
        default: return nil
        }
    }

    private static func mismaCarga(_ a: CargaFuerza, _ b: CargaFuerza) -> Bool {
        switch (a, b) {
        case let (.kg(a1, a2), .kg(b1, b2)): return a1 == b1 && a2 == b2
        case let (.rm(a1, a2, _), .rm(b1, b2, _)): return a1 == b1 && a2 == b2
        case let (.tuya(_, la), .tuya(_, lb)): return la == lb
        case (.corporal, .corporal): return true
        default: return false
        }
    }

    /// ¿La carga declarada en `de` es la propuesta de `a`? Mismo ejercicio, las
    /// dos de trabajo, y LA MISMA PRESCRIPCIÓN de carga.
    static func heredaCarga(_ a: Paso, de: Paso) -> Bool {
        guard let fa = a.fuerza, let fd = de.fuerza else { return false }
        if fa.ejercicio != fd.ejercicio || fa.aproximacion || fd.aproximacion { return false }
        return mismaCarga(fa.carga, fd.carga)
    }

    /// La carga ARRASTRADA: la última declarada en una serie anterior del mismo ejercicio.
    static func cargaArrastrada(_ pasos: [Paso], _ j: Int, _ registro: Registro) -> Double? {
        guard j >= 0, j < pasos.count, pasos[j].fuerza != nil else { return nil }
        var k = j - 1
        while k >= 0 {
            let q = pasos[k]
            if q.fuerza != nil, heredaCarga(pasos[j], de: q), let kg = registro[q.id]?.kg { return kg }
            k -= 1
        }
        return nil
    }

    /// Los números de serie a los que llega la carga declarada en `j`.
    static func seriesQueHeredan(_ pasos: [Paso], _ j: Int, _ registro: Registro) -> [Int] {
        guard j >= 0, j < pasos.count, pasos[j].fuerza != nil else { return [] }
        var out: [Int] = []
        for k in (j + 1)..<pasos.count {
            let q = pasos[k]
            guard q.fuerza != nil, heredaCarga(q, de: pasos[j]) else { continue }
            if registro[q.id]?.kg != nil { break }
            if let s = q.posicion?.serie { out.append(s.n) }
        }
        return out
    }

    /// La última serie DECLARADA del mismo ejercicio antes de `j`, en palabras.
    static func ultimaSerieAnotada(_ pasos: [Paso], _ j: Int, _ registro: Registro) -> String? {
        guard j >= 0, j < pasos.count, let f = pasos[j].fuerza else { return nil }
        var k = j - 1
        while k >= 0 {
            let q = pasos[k]
            if let fq = q.fuerza, fq.ejercicio == f.ejercicio, !fq.aproximacion, registro[q.id] != nil {
                return anotacionDe(pasos, k, registro, medida: nil).map { textoAnotacion($0, fq) }
            }
            k -= 1
        }
        return nil
    }

    private static func centroEsfuerzo(_ f: FichaFuerza) -> Double? {
        guard let e = f.esfuerzo else { return nil }
        return alPaso((e.min + e.max) / 2, e.eje == .rpe ? 0.5 : 1)
    }

    /// La anotación de la serie `j`: lo declarado, lo medido o lo propuesto, campo a campo.
    static func anotacionDe(_ pasos: [Paso], _ j: Int, _ registro: Registro, medida: MedidaSerie?) -> Anotacion? {
        guard j >= 0, j < pasos.count, let f = pasos[j].fuerza else { return nil }
        let p = pasos[j]
        let r = registro[p.id] ?? Declarado()
        let reps: Dato
        if let v = r.reps { reps = Dato(valor: v, estado: .declarado) }
        else if let v = medida?.reps { reps = Dato(valor: v, estado: .medido) }
        else { reps = Dato(valor: p.medida.prescrito, estado: .propuesto) }
        var kg: Dato? = nil
        if case .corporal = f.carga { kg = nil }
        else if let v = r.kg { kg = Dato(valor: v, estado: .declarado) }
        else { kg = Dato(valor: cargaArrastrada(pasos, j, registro) ?? cargaDelPlan(f), estado: .propuesto) }
        var esfuerzo: Dato? = nil
        if f.esfuerzo != nil {
            if let v = r.esfuerzo { esfuerzo = Dato(valor: v, estado: .declarado) } else { esfuerzo = Dato(valor: centroEsfuerzo(f), estado: .propuesto) }
        }
        return Anotacion(reps: reps, kg: kg, esfuerzo: esfuerzo)
    }

    static func pendiente(_ a: Anotacion) -> Bool { !camposPendientes(a).isEmpty }

    static func camposPendientes(_ a: Anotacion) -> [CampoAnotar] {
        var out: [CampoAnotar] = []
        if a.reps.estado == .propuesto { out.append(.reps) }
        if a.kg?.estado == .propuesto { out.append(.kg) }
        if a.esfuerzo?.estado == .propuesto { out.append(.esfuerzo) }
        return out
    }

    /// Confirmar = escribir lo que se ve como declarado.
    static func confirmar(_ registro: Registro, _ id: String, _ a: Anotacion) -> Registro {
        var r = registro[id] ?? Declarado()
        if let v = a.reps.valor { r.reps = v }
        if let v = a.kg?.valor { r.kg = v }
        if let v = a.esfuerzo?.valor { r.esfuerzo = v }
        var out = registro
        out[id] = r
        return out
    }

    // MARK: - Los ± (la corona en la muñeca)

    /// Hasta dónde llega el ± al anotar. MÉTODO, dato con defecto.
    struct RangoAnotar: Equatable {
        var repsDeMas = 10.0
        var rpe = (min: 5.0, max: 10.0, paso: 0.5)
        var rir = (min: 0.0, max: 6.0, paso: 1.0)
        var kgMax = 500.0
        static func == (a: RangoAnotar, b: RangoAnotar) -> Bool {
            a.repsDeMas == b.repsDeMas && a.rpe == b.rpe && a.rir == b.rir && a.kgMax == b.kgMax
        }
    }

    static let rangoAnotarDefecto = RangoAnotar()

    /// Paso, suelo y techo del ± en cada campo.
    static func girar(_ p: Paso, campo: CampoAnotar, actual: Double?, dir: Int, rango: RangoAnotar = rangoAnotarDefecto) -> Double {
        guard let f = p.fuerza else { return actual ?? 0 }
        let d = Double(dir)
        switch campo {
        case .reps:
            let techo = (p.medida.prescrito ?? 10) + rango.repsDeMas
            return Swift.min(techo, Swift.max(0, (actual ?? p.medida.prescrito ?? 0) + d))
        case .kg:
            guard let actual else {
                if case let .tuya(_, lastre) = f.carga, lastre { return f.pasoKg }
                return f.vaciaKg ?? fichaFuerzaDefecto.vaciaKg
            }
            return Swift.min(rango.kgMax, Swift.max(0, alPaso(actual + d * f.pasoKg, f.pasoKg / 2)))
        case .esfuerzo:
            let escala = f.esfuerzo?.eje == .rpe ? rango.rpe : rango.rir
            let base = actual ?? centroEsfuerzo(f) ?? (f.esfuerzo?.eje == .rpe ? 7 : 2)
            return Swift.min(escala.max, Swift.max(escala.min, base + d * escala.paso))
        }
    }

    /// Las series que se anotan en el descanso `i`: las de trabajo desde el
    /// descanso anterior (la ronda entera en una superserie), sin aproximaciones
    /// ni isometrías.
    static func seriesDelDescanso(_ pasos: [Paso], _ i: Int) -> [Int] {
        var out: [Int] = []
        var j = i - 1
        while j >= 0 {
            let p = pasos[j]
            if p.rol == .transicion { j -= 1; continue }
            if p.rol != .trabajo { break }
            if let f = p.fuerza, !f.aproximacion, p.medida.tipo == .reps { out.insert(j, at: 0) }
            j -= 1
        }
        return out
    }

    // MARK: - Textos

    /// «8 × 125 kg · RIR 3», «6 reps», «8 × — kg».
    static func textoAnotacion(_ a: Anotacion, _ f: FichaFuerza, conEsfuerzo: Bool = true) -> String {
        let reps = a.reps.valor.map(num) ?? "—"
        var partes = [a.kg != nil ? "\(reps) × \(a.kg?.valor.map(fmtKg) ?? "— kg")" : "\(reps) reps"]
        if conEsfuerzo, let e = a.esfuerzo, let fe = f.esfuerzo { partes.append("\(fe.eje == .rir ? "RIR" : "RPE") \(fmtValor(e.valor))") }
        return partes.joined(separator: " · ")
    }

    /// 6.5 → «6,5»; nil → «—».
    static func fmtValor(_ n: Double?) -> String {
        guard let n else { return "—" }
        return num(n)
    }
}
