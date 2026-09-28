import Foundation

// LA LÁMINA DEL PASO — la regla P3 como UNA función pura (espejo de
// `kit-reloj/lamina.ts`).
//
// P3 · El objetivo manda. El número grande es lo que el coach pide controlar:
// ritmo si el paso va a ritmo; pulso y zona si va a zona; si va a RPE, lo que
// falta con la instrucción del RPE; sin objetivo, lo que falta. El veredicto
// lleva dirección (▲ rápido / ▼ lento) en la banda y en palabra, no solo color.

extension Vivo {

    enum ClaseHeroe: String, Equatable { case ritmo, pulso, split, potencia, cadencia, falta, crono }

    struct ZonaVista: Equatable {
        var n: Int
        /// Hex del espectro del coach.
        var color: UInt32
    }

    struct HeroeVista: Equatable {
        var clase: ClaseHeroe
        /// «—» cuando no hay lectura: jamás un cero inventado.
        var texto: String
        var unidad: String? = nil
        /// «quedan» / «llevas»: solo cuando el héroe es tiempo o distancia.
        var etiqueta: String? = nil
        var zona: ZonaVista? = nil
    }

    struct AvisoLinea: Equatable {
        var marca: String
        var texto: String
    }

    struct LineaVista: Equatable {
        var etiqueta: String? = nil
        var valor: String
        var unidad: String? = nil
        var glifo: Bool = false
        var tendencia: Tendencia? = nil
        var zona: ZonaVista? = nil
        /// Fuera de un techo (M1): «▲ alto».
        var aviso: AvisoLinea? = nil
    }

    struct BandaZonas: Equatable {
        var colores: [UInt32]
        var objetivo: (Int, Int)
        static func == (a: BandaZonas, b: BandaZonas) -> Bool { a.colores == b.colores && a.objetivo == b.objetivo }
    }

    struct BandaVista: Equatable {
        var eje: EjeObjetivo
        /// Todo en una escala 0..1 de INTENSIDAD: a la izquierda lo suave.
        var desde: Double
        var hasta: Double
        /// Dónde estás. `nil` = sin lectura.
        var marca: Double?
        var veredicto: Veredicto?
        var rotulo: String
        var palabra: PalabraVeredicto?
        /// Solo en pasos a zona: el espectro del coach bajo la banda.
        var zonas: BandaZonas? = nil
    }

    struct Lamina: Equatable {
        var contexto: [String]
        var heroe: HeroeVista
        var banda: BandaVista?
        /// La instrucción que no es un número vivo: «RPE 7 · fuerte», «RIR 2».
        var instruccion: String?
        var segundo: LineaVista?
        var tercero: LineaVista?
        var nota: String?
        /// Zona de fondo (solo pasos a zona, P6). El pintor pone el color.
        var tinte: Int?
    }

    // MARK: - P3 · el héroe

    /// EL NÚMERO GRANDE DEL PASO (P3). Una función, un sitio.
    static func heroeDelPaso(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?) -> HeroeVista {
        if p.rol == .trabajo, let o = principal(p) {
            let v = valorDeEje(o.eje, l)
            switch o.eje {
            case .ritmo:
                if let v { return HeroeVista(clase: .ritmo, texto: fmtRitmo(v), unidad: "/km") }
            case .zona, .ppm:
                return HeroeVista(clase: .pulso, texto: v.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm",
                                  zona: (v != nil && zonas != nil) ? zonaVista(v!, zonas!) : nil)
            case .split500:
                if let v { return HeroeVista(clase: .split, texto: fmtSplit(v, p.maquina), unidad: unidadSplit(p.maquina)) }
            case .potencia:
                if let v { return HeroeVista(clase: .potencia, texto: String(Int(v.rounded())), unidad: "W") }
            case .cadencia:
                if let v { return HeroeVista(clase: .cadencia, texto: String(Int(v.rounded())), unidad: "pasos") }
            default: break
            }
        }
        return heroeFalta(p, l)
    }

    static func heroeFalta(_ p: Paso, _ l: Lecturas) -> HeroeVista {
        guard let f = faltaDe(p, l) else { return HeroeVista(clase: .crono, texto: fmtReloj(l.t), etiqueta: "llevas") }
        let v = valorFalta(p, f)
        return HeroeVista(clase: .falta, texto: v.texto, unidad: v.unidad, etiqueta: "quedan")
    }

    static func valorFalta(_ p: Paso, _ f: Double) -> (texto: String, unidad: String?) {
        switch p.medida.tipo {
        case .distancia:
            let d = fmtDistancia(f)
            return (d.valor, d.unidad)
        case .reps: return (String(Int(f.rounded(.up))), "reps")
        case .cal: return (String(Int(f.rounded(.up))), "cal")
        default: return (fmtReloj(f.rounded(.up)), nil)
        }
    }

    static func zonaVista(_ ppm: Double, _ z: ZonasCoach) -> ZonaVista {
        let n = zonaDe(ppm, z)
        return ZonaVista(n: n, color: colorZona(n, z.techos.count))
    }

    // MARK: - La banda del objetivo

    private static func acotar(_ x: Double) -> Double { Swift.min(1, Swift.max(0, x)) }

    /// La banda de un objetivo numérico sobre su escala de intensidad.
    static func bandaDe(_ o: Objetivo, _ valor: Double?, _ zonas: ZonasCoach?, holgura: Double = 0, maquina: Maquina? = nil) -> BandaVista? {
        let v = valor
        // Un objetivo de valor único se juzga con la holgura del coach como banda.
        let unico = o.eje != .zona && o.min != nil && o.min == o.max && holgura > 0
        var oj = o
        if unico { oj.min = o.min! - holgura; oj.max = o.max! + holgura }
        let veredicto = v.map { veredictoDe(o, $0, holgura: holgura, zonas: zonas) }
        let palabra = veredicto.map { palabraVeredicto(o.eje, $0) }

        if o.eje == .zona, let zonas {
            let n = zonas.techos.count
            let zMin = o.papel == .techo ? 1 : Int(o.min ?? 1)
            let zMax = Int(o.max ?? Double(n))
            var marca: Double? = nil
            if let v {
                let k = zonaDe(v, zonas)
                let (lo, hi) = limitesZona(k, zonas)
                marca = acotar((Double(k - 1) + acotar((v - lo) / Swift.max(1, hi - lo))) / Double(n))
            }
            return BandaVista(eje: o.eje, desde: Double(zMin - 1) / Double(n), hasta: Double(zMax) / Double(n), marca: marca,
                              veredicto: veredicto, rotulo: v == nil ? fmtObjetivo(o) : posicionZona(v!, o, zonas), palabra: palabra,
                              zonas: BandaZonas(colores: espectroZonas(n), objetivo: (zMin, zMax)))
        }

        let (lo, hi) = oj.eje == .ppm ? rangoPpm(oj, zonas) : (oj.min, oj.max)
        if lo == nil, hi == nil { return nil }
        let a = lo ?? (hi! - 20)
        let b = hi ?? (lo! + 20)
        let margen = Swift.max(10, b - a)
        let bajo = a - margen
        let alto = b + margen
        let inverso = o.eje == .ritmo || o.eje == .split500
        func pos(_ x: Double) -> Double { acotar(inverso ? (alto - x) / (alto - bajo) : (x - bajo) / (alto - bajo)) }
        let ps = [pos(a), pos(b)].sorted()
        return BandaVista(eje: o.eje, desde: lo == nil ? 0 : ps[0], hasta: hi == nil ? 1 : ps[1], marca: v.map(pos),
                          veredicto: veredicto, rotulo: fmtObjetivo(o, maquina), palabra: palabra)
    }

    // MARK: - Las líneas de apoyo

    /// La línea del pulso (con su zona y «▲ alto» si el techo está pasado).
    static func lineaPulso(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso = reglasAvisoDefecto) -> LineaVista {
        let v = valorDeEje(.ppm, l)
        var aviso: AvisoLinea? = nil
        if v != nil, let techo = objetivoDe(p, .techo), techo.eje == .ppm || techo.eje == .zona, techoPasado(p, l, zonas, reglas) {
            aviso = AvisoLinea(marca: "▲", texto: "alto")
        }
        return LineaVista(valor: v.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm", glifo: true,
                          tendencia: l.ppmTendencia == .baja ? .baja : l.ppmTendencia == .sube ? .sube : nil,
                          zona: (v != nil && zonas != nil) ? zonaVista(v!, zonas!) : nil, aviso: aviso)
    }

    private static func lineaRitmo(_ l: Lecturas) -> LineaVista {
        LineaVista(valor: fmtRitmo(valorDeEje(.ritmo, l)), unidad: "/km")
    }

    private static func lineaFalta(_ p: Paso, _ l: Lecturas) -> LineaVista {
        guard let f = faltaDe(p, l) else { return LineaVista(etiqueta: "quedan", valor: "—") }
        let v = valorFalta(p, f)
        return LineaVista(etiqueta: "quedan", valor: v.texto, unidad: v.unidad)
    }

    static func notaDe(_ p: Paso, _ l: Lecturas) -> String? {
        if !l.viejos.isEmpty { return "sin enlace · la muñeca sigue grabando" }
        if l.gps == .buscando, esCarrera(p) { return "GPS · buscando" }
        if let cue = p.cue { return "Coach · \(cue)" }
        if p.entorno == .cinta {
            let incl = objetivoDe(p, .secundario)
            let pct = incl?.eje == .inclinacion ? " · \(num(incl?.min ?? 0)) %" : ""
            return "Cinta\(pct)"
        }
        if p.entorno == .pista { return "Pista" }
        return nil
    }

    // MARK: - La lámina entera

    /// TODO lo que pinta un paso de trabajo, decidido aquí. La vista solo pinta.
    static func laminaDelPaso(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso = reglasAvisoDefecto) -> Lamina {
        let heroe = heroeDelPaso(p, l, zonas)
        let o = principal(p)
        let esObjetivo = heroe.clase != .falta && heroe.clase != .crono

        var banda: BandaVista? = nil
        var instruccion: String? = nil
        if let o, p.rol == .trabajo {
            if o.eje == .rpe { instruccion = "\(fmtObjetivo(o)) · \(palabraRpe(o))" }
            else if [.kg, .pctRM, .rir, .inclinacion].contains(o.eje) { instruccion = fmtObjetivo(o) }
            else {
                banda = bandaDe(o, valorDeEje(o.eje, l), zonas, holgura: holguraDe(o.eje, reglas), maquina: p.maquina)
                let ver = veredictoPrincipal(p, l, zonas, reglas)
                if banda != nil {
                    banda!.veredicto = ver
                    banda!.palabra = ver.map { palabraVeredicto(o.eje, $0) }
                }
            }
        }

        let segundo: LineaVista?
        let tercero: LineaVista?
        if esObjetivo {
            segundo = lineaFalta(p, l)
            tercero = heroe.clase == .pulso ? (esCarrera(p) ? lineaRitmo(l) : nil) : lineaPulso(p, l, zonas, reglas)
        } else {
            segundo = (instruccion == nil && banda == nil && esCarrera(p)) ? lineaRitmo(l) : nil
            tercero = lineaPulso(p, l, zonas, reglas)
        }

        return Lamina(contexto: contextoDe(p), heroe: heroe, banda: banda, instruccion: instruccion,
                      segundo: segundo, tercero: tercero, nota: notaDe(p, l), tinte: tinteDelPaso(p, l, zonas))
    }
}
