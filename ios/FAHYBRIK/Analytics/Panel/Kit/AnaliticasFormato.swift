import Foundation

// UN FORMATEADOR POR UNIDAD — espejo de `kit-analiticas/fmt.ts`. El servidor
// manda el número y la unidad (§5) y AQUÍ se decide cómo se escribe cada una,
// una sola vez, sobre los canónicos de `Formato` / `FechaES` (CONTRATO-UI §2:
// nada de un segundo reloj ni de un `String(format:)` suelto en una pantalla).
enum AnaliticasFormato {

    /// El valor con su unidad, como se lee en una celda: «4:12/km», «62 ms», «7,1 h», «132 kg».
    static func formatear(_ valor: Double, _ unidad: UnidadLectura) -> String {
        switch unidad {
        case .sKm: return Formato.ritmo(valor, .porKm)
        case .s500m: return Formato.ritmo(valor, .por500m)
        case .segundos: return Formato.clock(valor)
        case .horas: return "\(Formato.esDecimal(valor)) h"
        case .ms: return Formato.entero(valor, "ms")
        case .bpm: return Formato.entero(valor, Vocab.ppm)
        case .kg: return Formato.kg(valor)
        case .metros: return metros(valor)
        case .mS: return "\(Formato.esDecimal(valor, decimals: 2)) m/s"
        case .pct: return "\(Int(valor.rounded())) %"
        case .ratio: return Formato.esDecimal(valor, decimals: 2)
        case .mlKgMin: return Formato.esDecimal(valor)
        case .watts: return Formato.entero(valor, "W")
        case .reps: return Formato.entero(valor, Vocab.reps)
        case .kcal: return "\(conMillar(valor)) kcal"
        case .sesiones: return Formato.entero(valor, "sesiones")
        case .dias: return Formato.entero(valor, "días")
        case .tss, .tssSemana, .puntos, .desconocida: return conMillar(valor)
        }
    }

    /// Solo la cifra, para cuando la unidad la pinta el layout aparte.
    static func cifra(_ valor: Double, _ unidad: UnidadLectura) -> String {
        switch unidad {
        case .sKm, .s500m, .segundos: return Formato.clock(valor)
        case .horas, .mlKgMin: return Formato.esDecimal(valor)
        case .ratio, .mS: return Formato.esDecimal(valor, decimals: 2)
        case .kg: return Formato.esDecimal(valor)
        case .metros: return valor >= 1000 ? Formato.esDecimal(valor / 1000, decimals: valor >= 10000 ? 0 : 1) : "\(Int(valor.rounded()))"
        default: return conMillar(valor)
        }
    }

    /// La unidad como sufijo corto, para pegarla a la cifra a 15 pt. Vacía cuando
    /// la cifra ya la lleva o no la necesita. Los metros son «m» bajo el kilómetro.
    static func unidadCorta(_ unidad: UnidadLectura, valor: Double? = nil) -> String {
        switch unidad {
        case .sKm: return "/km"
        case .s500m: return "/500m"
        case .horas: return "h"
        case .ms: return "ms"
        case .bpm: return Vocab.ppm
        case .kg: return "kg"
        case .metros: return (valor ?? 0) < 1000 ? "m" : "km"
        case .mS: return "m/s"
        case .pct: return "%"
        case .watts: return "W"
        case .reps: return Vocab.reps
        case .kcal: return "kcal"
        case .sesiones: return "sesiones"
        case .dias: return "días"
        case .mlKgMin: return "VO₂máx"
        case .segundos, .ratio, .tss, .tssSemana, .puntos, .desconocida: return ""
        }
    }

    /// ¿El delta es cero una vez escrito con la precisión de su unidad? Entonces se dice «igual», no «−0,0 h».
    static func esCero(_ delta: Double, _ unidad: UnidadLectura) -> Bool {
        let decimales: Double
        switch unidad {
        case .horas, .s500m, .mlKgMin, .kg: decimales = 1
        case .ratio, .mS: decimales = 2
        default: decimales = 0
        }
        return (abs(delta) * pow(10, decimales)).rounded() == 0
    }

    /// El delta con signo tipográfico y en la unidad que lo juzga: «−4 s/km»,
    /// «+3 ms», «+2,5 kg», «+0,3 h», «+12». Sobre segundos se escribe en
    /// segundos, nunca en formato reloj: «−0:04» no lo lee nadie.
    static func formatearDelta(_ delta: Double, _ unidad: UnidadLectura) -> String {
        let signo = delta > 0 ? "+" : delta < 0 ? "\u{2212}" : "±"
        let a = abs(delta)
        switch unidad {
        case .sKm: return "\(signo)\(Int(a.rounded())) s/km"
        case .s500m: return "\(signo)\(Formato.esDecimal(a)) s/500m"
        case .segundos: return a >= 60 ? "\(signo)\(Formato.clock(a))" : "\(signo)\(Int(a.rounded())) s"
        case .horas: return "\(signo)\(Formato.esDecimal(a)) h"
        case .ms: return "\(signo)\(Int(a.rounded())) ms"
        case .bpm: return "\(signo)\(Int(a.rounded())) \(Vocab.ppm)"
        case .kg: return "\(signo)\(Formato.esDecimal(a)) kg"
        case .metros: return a >= 1000 ? "\(signo)\(Formato.esDecimal(a / 1000)) km" : "\(signo)\(Int(a.rounded())) m"
        case .pct: return "\(signo)\(Int(a.rounded())) pt"
        case .ratio: return "\(signo)\(Formato.esDecimal(a, decimals: 2))"
        case .mlKgMin: return "\(signo)\(Formato.esDecimal(a))"
        case .watts: return "\(signo)\(Int(a.rounded())) W"
        case .mS: return "\(signo)\(Formato.esDecimal(a, decimals: 2)) m/s"
        default: return "\(signo)\(conMillar(a))"
        }
    }

    /// ¿Menos es mejor? Depende de la unidad: menos segundos por km es mejor; más vatios, mejor.
    static func menosEsMejor(_ unidad: UnidadLectura) -> Bool {
        switch unidad {
        case .sKm, .s500m, .segundos, .bpm: return true
        default: return false
        }
    }

    /// «vs 12 sem antes» · «vs 7 d antes» · «vs 6 m antes»: contra qué periodo se compara.
    static func etiquetaPeriodo(_ periodo: ComparacionDeLectura.Periodo) -> String {
        guard let dias = AnaliticasFechas.diasEntre(periodo.desde, periodo.hasta).map({ $0 + 1 }) else { return "vs antes" }
        switch dias {
        case 7: return "vs 7 d antes"
        case 28: return "vs 4 sem antes"
        case 84: return "vs 12 sem antes"
        case 182: return "vs 6 m antes"
        case 364: return "vs 1 a antes"
        default: return dias % 7 == 0 ? "vs \(dias / 7) sem antes" : "vs \(dias) d antes"
        }
    }

    /// Contra qué se lee una referencia (`referencia.de`), en palabras del atleta.
    /// Nulo cuando la referencia no añade nada que decir (el cero del equilibrio).
    static func etiquetaReferencia(_ r: ReferenciaDeLectura, _ unidad: UnidadLectura) -> String? {
        switch r.de {
        case "equilibrio": return nil
        case "aviso_del_coach": return "aviso a partir de \(cifra(r.valor, unidad))"
        case "minimo_del_coach": return "mínimo \(formatear(r.valor, unidad))"
        case "hace_7d": return "vs hace 7 días"
        default:
            if r.de.hasPrefix("basal") { return "vs tu basal \(cifra(r.valor, unidad))" }
            if r.de.hasPrefix("objetivo") { return "objetivo \(formatear(r.valor, unidad))" }
            return "vs \(formatear(r.valor, unidad))"
        }
    }

    /// Fecha corta con año solo si no es el de hoy: «12 sep», «3 nov 2025».
    static func fechaLegible(_ iso: String, hoy: String) -> String {
        let corta = AnaliticasFechas.corta(iso)
        return iso.prefix(4) == hoy.prefix(4) ? corta : "\(corta) \(iso.prefix(4))"
    }

    /// «en 13 días», «mañana», «hoy», «hace 4 días».
    static func enDias(_ dias: Int) -> String {
        switch dias {
        case 0: return "hoy"
        case 1: return "mañana"
        case -1: return "ayer"
        case 2...: return "en \(dias) días"
        default: return "hace \(-dias) días"
        }
    }

    /// Tiempo AGREGADO: «8h 10min» · «42 min». Distinto de `clock`, que es la duración de UN esfuerzo.
    static func horasYMin(_ segundos: Double) -> String {
        let totalMin = Int((segundos / 60).rounded())
        let h = totalMin / 60, m = totalMin % 60
        return h > 0 ? "\(h)h \(m)min" : "\(m) min"
    }

    /// Millar con punto español: `1234` → `1.234`.
    static func conMillar(_ n: Double) -> String {
        let v = max(0, Int(n.rounded()))
        guard v >= 1000 else { return "\(v)" }
        return "\(v / 1000).\(String(format: "%03d", v % 1000))"
    }

    private static func metros(_ v: Double) -> String {
        guard v >= 1000 else { return "\(Int(v.rounded())) m" }
        if v.truncatingRemainder(dividingBy: 1000) == 0 { return "\(Int(v / 1000)) km" }
        return "\(Formato.esDecimal(v / 1000, decimals: v >= 10000 ? 0 : 1)) km"
    }
}
