import Foundation

// LA SERIE DE FUERZA EN PALABRAS — funciones PURAS sobre la ficha (P11, M1;
// espejo de `kit-reloj/fuerza.ts`).

extension Vivo {

    /// ¿Es una serie de fuerza con su ficha?
    static func esFuerza(_ p: Paso?) -> Bool { p?.fuerza != nil }

    /// 127.5 → «127,5 kg».
    static func fmtKg(_ n: Double) -> String { "\(num(n)) kg" }

    private static func rangoF(_ min: Double, _ max: Double, _ f: (Double) -> String) -> String {
        min == max ? f(min) : "\(f(min))–\(f(max))"
    }

    /// La RM resuelta en kg, redondeada al kilo: 65–70 % de 186,5 → 121–131.
    static func kgDelPlan(_ c: CargaFuerza) -> (Double, Double)? {
        switch c {
        case let .kg(min, max): return (min, max)
        case let .rm(pMin, pMax, rm):
            guard let rm, rm > 0 else { return nil }
            return ((rm * pMin / 100).rounded(), (rm * pMax / 100).rounded())
        default: return nil
        }
    }

    /// «121–131 kg», «156 kg»; nil si el plan no da kilos.
    static func textoKgPlan(_ c: CargaFuerza) -> String? {
        guard let r = kgDelPlan(c) else { return nil }
        return "\(rangoF(r.0, r.1, num)) kg"
    }

    /// «65–70 % RM».
    static func textoPct(_ c: CargaFuerza) -> String? {
        if case let .rm(pMin, pMax, _) = c { return "\(rangoF(pMin, pMax, num)) % RM" }
        return nil
    }

    /// «RIR 3», «RPE 7,5», «RIR 2–3».
    static func textoEsfuerzo(_ e: EsfuerzoFuerza) -> String {
        "\(e.eje == .rir ? "RIR" : "RPE") \(rangoF(e.min, e.max, num))"
    }

    /// 3-1-1-0 → «3-1-1»; la pausa arriba solo si la hay.
    static func textoTempo(_ t: Tempo) -> String {
        let base = "\(t.excentrica)-\(t.pausaAbajo)-\(t.concentrica)"
        return t.pausaArriba > 0 ? "\(base)-\(t.pausaArriba)" : base
    }

    /// Lo que se hace en UNA serie, sin la carga: «8», «20″».
    static func cantidadSerie(_ p: Paso) -> String {
        let pr = p.medida.prescrito ?? 0
        return p.medida.tipo == .tiempo ? fmtDuracion(pr) : num(pr)
    }

    /// La carga de la línea de la serie: la arrastrada, la del plan o «carga tuya».
    static func textoCarga(_ f: FichaFuerza, arrastrada: Double?) -> String? {
        if case .corporal = f.carga { return nil }
        if let a = arrastrada {
            if case let .tuya(_, lastre) = f.carga, lastre { return "+\(fmtKg(a))" }
            return fmtKg(a)
        }
        if case let .tuya(ultima, lastre) = f.carga {
            let que = lastre ? "lastre tuyo" : "carga tuya"
            return ultima.map { "\(que) · última \(fmtKg($0))" } ?? que
        }
        return textoKgPlan(f.carga) ?? textoPct(f.carga)
    }

    /// Una serie en corto: «8 × 125 kg», «6 reps», «20″».
    static func dosisSerie(_ p: Paso, arrastrada: Double?) -> String {
        guard let f = p.fuerza else { return cantidadSerie(p) }
        if p.medida.tipo == .tiempo { return cantidadSerie(p) }
        let kg: String?
        if let a = arrastrada { kg = fmtKg(a) } else {
            switch f.carga {
            case .tuya, .corporal: kg = nil
            default: kg = textoKgPlan(f.carga)
            }
        }
        return kg.map { "\(cantidadSerie(p)) × \($0)" } ?? "\(cantidadSerie(p)) reps"
    }

    /// El ejercicio entero en corto: «4 × 8 · RIR 3», «4 × 8 · 65–70 % RM».
    static func dosisEjercicio(_ p: Paso, series: Int) -> String {
        guard let f = p.fuerza else { return "\(series) × \(cantidadSerie(p))" }
        let eje = f.esfuerzo.map(textoEsfuerzo) ?? (textoPct(f.carga) ?? textoKgPlan(f.carga))
        return ["\(series) × \(cantidadSerie(p))", eje].compactMap { $0 }.joined(separator: " · ")
    }

    /// «A1 · serie 3 hecha» — el aviso de deshacer.
    static func avisoSerie(_ p: Paso) -> String {
        let s = p.posicion?.serie
        let que = p.fuerza?.aproximacion == true ? "aproximación" : "serie"
        let texto = "\(que)\(s.map { " \($0.n)" } ?? "") hecha"
        if let slot = p.posicion?.slot { return "\(slot) · \(texto)" }
        return texto.prefix(1).uppercased() + texto.dropFirst()
    }

    /// «Serie 2/4» o «Aproximación 1/2».
    static func quienSerie(_ p: Paso) -> String {
        let que = p.fuerza?.aproximacion == true ? "Aproximación" : "Serie"
        guard let s = p.posicion?.serie else { return que }
        return "\(que) \(s.n)/\(s.de)"
    }
}
