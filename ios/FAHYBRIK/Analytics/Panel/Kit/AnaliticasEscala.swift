import Foundation

// LAS FECHAS Y LA ESCALA DE LOS EJES — espejo de la parte pura de
// `kit-analiticas/mecanismo.ts` (fechas, `escalaBonita`, pasos de tiempo) y de
// `graficos.tsx#rotulosX`. Todo determinista, todo con test.
//
// La aritmética va sobre el ISO `YYYY-MM-DD` en UTC a propósito: el huso del
// aparato no decide en qué día cae una carrera, y un panel pedido «a fecha de»
// se pinta igual desde cualquier sitio.

enum AnaliticasFechas {
    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let calendario: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    /// Los meses como los escribe el doble (`kit-composicion/formato.ts`): «sep» y no
    /// el «sept» de ICU, para que el eje diga lo mismo que el contrato.
    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    static func fecha(_ iso: String) -> Date? { Self.iso.date(from: iso) }
    static func iso(_ fecha: Date) -> String { Self.iso.string(from: fecha) }

    /// `b − a` en días (positivo si b es después). Nulo si alguno no se lee.
    static func diasEntre(_ a: String, _ b: String) -> Int? {
        guard let da = fecha(a), let db = fecha(b) else { return nil }
        return calendario.dateComponents([.day], from: da, to: db).day
    }

    static func sumarDias(_ iso: String, _ n: Int) -> String? {
        guard let d = fecha(iso), let s = calendario.date(byAdding: .day, value: n, to: d) else { return nil }
        return Self.iso(s)
    }

    /// El lunes de la semana de `iso`.
    static func lunes(_ iso: String) -> String? {
        guard let d = fecha(iso) else { return nil }
        let dow = calendario.component(.weekday, from: d) // 1 = domingo … 7 = sábado
        let desdeLunes = dow == 1 ? 6 : dow - 2
        return sumarDias(iso, -desdeLunes)
    }

    /// «8 jul». Si el ISO no se lee, el ISO tal cual: antes un eje raro que uno vacío.
    static func corta(_ iso: String) -> String {
        let partes = iso.split(separator: "-")
        guard partes.count == 3, let m = Int(partes[1]), let d = Int(partes[2]), (1...12).contains(m) else { return iso }
        return "\(d) \(meses[m - 1])"
    }

    /// «sep» — la marca de mes de un eje temporal.
    static func mesCorto(_ iso: String) -> String {
        let partes = iso.split(separator: "-")
        guard partes.count == 3, let m = Int(partes[1]), (1...12).contains(m) else { return iso }
        return meses[m - 1]
    }

    /// Los días entre dos ISO (ambos incluidos), en orden.
    static func dias(desde: String, hasta: String) -> [String] {
        guard let n = diasEntre(desde, hasta), n >= 0 else { return [] }
        return (0...n).compactMap { sumarDias(desde, $0) }
    }
}

// MARK: - Escala «bonita»: números redondos, siempre

struct EscalaEje: Equatable {
    let min: Double
    let max: Double
    let ticks: [Double]
}

enum AnaliticasEscala {
    /// Los pasos que un eje de TIEMPO admite: 5 s, 10 s, 15 s, 30 s, 1, 2, 5, 10,
    /// 15, 30 min, 1 h. Un eje de ritmo a «2:30 · 3:20 · 4:10» no lo lee nadie.
    static let pasosTiempo: [Double] = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

    private static func pasoBonito(_ bruto: Double, permitidos: [Double]?) -> Double {
        guard bruto > 0, bruto.isFinite else { return 1 }
        if let permitidos, !permitidos.isEmpty {
            return permitidos.first { $0 >= bruto } ?? permitidos[permitidos.count - 1]
        }
        let exp = floor(log10(bruto))
        let f = bruto / pow(10, exp)
        let nice: Double = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
        return nice * pow(10, exp)
    }

    /// Escala que cubre [min, max] con ~`n` marcas redondas. Nunca más de n + 2
    /// marcas: si el paso bonito deja demasiadas, se dobla.
    static func bonita(_ min: Double, _ max: Double, n: Int = 4, desdeCero: Bool = false, pasos: [Double]? = nil) -> EscalaEje {
        var lo = desdeCero ? Swift.min(0, min) : min
        var hi = desdeCero ? Swift.max(0, max) : max
        if !lo.isFinite || !hi.isFinite { lo = 0; hi = 1 }
        if hi == lo { hi = lo + 1 }
        func construir(_ paso: Double) -> EscalaEje {
            let niceMin = floor(lo / paso) * paso
            let niceMax = ceil(hi / paso) * paso
            var ticks: [Double] = []
            var v = niceMin
            while v <= niceMax + paso / 2 {
                ticks.append((v * 1e6).rounded() / 1e6)
                v += paso
            }
            return EscalaEje(min: niceMin, max: niceMax, ticks: ticks)
        }
        var paso = pasoBonito((hi - lo) / Double(Swift.max(1, n - 1)), permitidos: pasos)
        var escala = construir(paso)
        var vueltas = 0
        while escala.ticks.count > n + 2, vueltas < 6 {
            if let pasos { paso = pasos.first { $0 > paso } ?? paso * 2 } else { paso *= 2 }
            escala = construir(paso)
            vueltas += 1
        }
        return escala
    }

    /// Qué fechas rotular en X: la primera, la última y los cambios de mes que
    /// quepan. `ancho` en pt; `cuerpo` el del texto del eje.
    struct RotuloX: Equatable {
        let i: Int
        let texto: String
    }

    static func rotulosX(_ fechas: [String], ancho: CGFloat, cuerpo: CGFloat) -> [RotuloX] {
        guard let primera = fechas.first else { return [] }
        let minSep = cuerpo * 4.2
        // El último rótulo («28 sep») se ancla a la derecha y crece hacia la izquierda: pide más sitio.
        let minSepUltimo = cuerpo * 6.5
        var out = [RotuloX(i: 0, texto: AnaliticasFechas.corta(primera))]
        let paso = ancho / CGFloat(Swift.max(1, fechas.count - 1))
        if fechas.count > 2 {
            for i in 1..<(fechas.count - 1) {
                let f = fechas[i], anterior = fechas[i - 1]
                let dia = f.dropFirst(8).prefix(2), mes = f.dropFirst(5).prefix(2), mesAnterior = anterior.dropFirst(5).prefix(2)
                let esMes = dia <= "07" && mes != mesAnterior
                guard esMes, let ultimo = out.last else { continue }
                if CGFloat(i - ultimo.i) * paso < (ultimo.i == 0 ? minSepUltimo : minSep) { continue }
                if CGFloat(fechas.count - 1 - i) * paso < minSepUltimo { continue }
                out.append(RotuloX(i: i, texto: AnaliticasFechas.mesCorto(f)))
            }
        }
        if fechas.count > 1 { out.append(RotuloX(i: fechas.count - 1, texto: AnaliticasFechas.corta(fechas[fechas.count - 1]))) }
        return out
    }

    /// Cuántos puntos por grupo para que cada columna tenga al menos `minAncho` pt:
    /// 1, 2 o 4 (un mes). 12 semanas caben una a una en el iPhone; 26 van de dos
    /// en dos; 52 de cuatro en cuatro.
    static func agrupacion(puntos: Int, ancho: CGFloat, minAncho: CGFloat = 20) -> Int {
        guard puntos > 0 else { return 1 }
        let caben = Swift.max(1, Int(ancho / minAncho))
        let g = Int(ceil(Double(puntos) / Double(caben)))
        return g <= 1 ? 1 : g <= 2 ? 2 : 4
    }

    /// Agrupa `tamano` puntos consecutivos (semanas → bloques de 4 semanas). Un
    /// grupo todo a nulo sigue a nulo: el hueco no se tapa.
    static func agrupar(_ puntos: [PuntoDeSerie], _ tamano: Int, media: Bool = false) -> [PuntoDeSerie] {
        guard tamano > 1 else { return puntos }
        var out: [PuntoDeSerie] = []
        var i = 0
        while i < puntos.count {
            let grupo = Array(puntos[i..<Swift.min(puntos.count, i + tamano)])
            let vals = grupo.compactMap(\.v)
            let v: Double? = vals.isEmpty ? nil : media ? vals.reduce(0, +) / Double(vals.count) : vals.reduce(0, +)
            out.append(PuntoDeSerie(t: grupo[0].t, v: v))
            i += tamano
        }
        return out
    }
}
