import Foundation

// LA ESTRUCTURA EN LÍNEAS DE DATO — funciones PURAS (P13; espejo de
// `kit-reloj/estructura.ts`, `aro.tsx`, `listas.tsx` y `avisoDeCierre` de
// `vivo.tsx`). La estructura REAL del coach sale de los pasos, no de un título.

extension Vivo {

    // MARK: - Cuánto dura un paso (solo para dibujar)

    private static let ritmoDibujoSKm: Double = 300
    private static let splitDibujoS: Double = 120
    private static let pasoNeutroS: Double = 60

    /// Cuánto dura un paso, estimado, para darle su parte de la tira.
    static func duracionEstimada(_ p: Paso) -> Double {
        let pr = p.medida.prescrito ?? 0
        if p.medida.tipo == .tiempo { return pr }
        if p.medida.tipo != .distancia { return pasoNeutroS }
        let o = principal(p)
        if p.medida.mide == .gps || p.medida.mide == .cinta {
            let ritmo = (o?.eje == .ritmo && o?.min != nil && o?.max != nil) ? (o!.min! + o!.max!) / 2 : ritmoDibujoSKm
            return pr / 1000 * ritmo
        }
        if p.medida.mide == .ergo {
            let split = (o?.eje == .split500 && o?.min != nil && o?.max != nil) ? (o!.min! + o!.max!) / 2 : splitDibujoS
            return pr / 500 * split
        }
        return pasoNeutroS
    }

    /// Duración estimada, como la diría un corredor: «55′».
    static func duracionHumana(_ pasos: [Paso]) -> String {
        let min = pasos.reduce(0) { $0 + duracionEstimada($1) } / 60
        let m = min >= 30 ? Int((min / 5).rounded()) * 5 : Swift.max(1, Int(min.rounded()))
        return "\(m)′"
    }

    struct ArcoDeTramo: Equatable {
        var trabajo: Bool
        var peso: Double
    }

    static func arcosDePlan(_ pasos: [Paso], duracion: ((Paso) -> Double)? = nil) -> [ArcoDeTramo] {
        pasos.map { ArcoDeTramo(trabajo: $0.rol == .trabajo && $0.fase == .principal, peso: (duracion ?? duracionEstimada)($0)) }
    }

    /// Avance dentro del paso, 0..1. Cero si nadie lo mide.
    static func fraccionDelPaso(_ p: Paso, _ l: Lecturas) -> Double {
        guard let pr = p.medida.prescrito, pr > 0, let f = faltaDe(p, l) else { return 0 }
        return Swift.min(1, Swift.max(0, 1 - f / pr))
    }

    // MARK: - Los grupos

    struct Grupo: Equatable {
        var paso: Paso
        var veces: Int
        var entre: Paso?
        var tandas: (veces: Int, porTanda: Int, descanso: Paso?)?
        var desde: Int
        var hasta: Int
        static func == (a: Grupo, b: Grupo) -> Bool {
            a.paso == b.paso && a.veces == b.veces && a.entre == b.entre && a.desde == b.desde && a.hasta == b.hasta
                && a.tandas?.veces == b.tandas?.veces && a.tandas?.porTanda == b.tandas?.porTanda && a.tandas?.descanso == b.tandas?.descanso
        }
    }

    private static func claveGrupo(_ p: Paso) -> String {
        let obj = p.objetivos.map { "\($0.eje.rawValue):\($0.min ?? -1):\($0.max ?? -1):\($0.papel.rawValue)" }.joined(separator: ",")
        return [p.posicion?.tanda != nil ? "tandas" : String(p.bloque ?? -1), p.posicion?.slot ?? "", p.nombre ?? p.clase.rawValue,
                p.medida.tipo.rawValue, String(p.medida.prescrito ?? -1), obj, String(p.carga?.kg ?? -1)].joined(separator: "|")
    }

    /// Los pasos planos, agrupados como los escribió el coach.
    static func filasDePasos(_ pasos: [Paso]) -> [Grupo] {
        var grupos: [Grupo] = []
        var porClave: [String: Int] = [:]
        var ultimo: Int? = nil
        for (j, p) in pasos.enumerated() {
            if p.rol != .trabajo {
                if p.clase == .descansoTandas, let u = ultimo, grupos[u].tandas != nil {
                    if grupos[u].tandas?.descanso == nil { grupos[u].tandas?.descanso = p }
                    grupos[u].hasta = Swift.max(grupos[u].hasta, j)
                }
                continue
            }
            let k = claveGrupo(p)
            let sig = j + 1 < pasos.count ? pasos[j + 1] : nil
            let entre: Paso? = (sig != nil && sig!.rol != .trabajo && sig!.clase != .descansoTandas) ? sig : nil
            let hasta = (sig != nil && sig!.rol != .trabajo) ? j + 1 : j
            if let gi = porClave[k] {
                grupos[gi].veces += 1
                grupos[gi].hasta = Swift.max(grupos[gi].hasta, hasta)
                if grupos[gi].entre == nil, let entre, p.fase == .principal { grupos[gi].entre = entre }
                ultimo = gi
                continue
            }
            let t = p.posicion?.tanda
            let nuevo = Grupo(paso: p, veces: 1, entre: p.fase == .principal ? entre : nil,
                              tandas: t.map { ($0.de, p.posicion?.serie?.de ?? 1, nil) }, desde: j, hasta: hasta)
            porClave[k] = grupos.count
            grupos.append(nuevo)
            ultimo = grupos.count - 1
        }
        return grupos
    }

    /// Las filas de la página Estructura del vivo para el paso `i`.
    static func estructuraDe(_ pasos: [Paso], i: Int) -> [FilaEstructura] {
        filasDePasos(pasos).map { g in
            FilaEstructura(fase: g.paso.fase,
                           veces: g.tandas != nil ? g.tandas!.porTanda : (g.veces > 1 ? g.veces : nil),
                           trabajo: g.paso,
                           recupera: (g.veces > 1 && g.entre != nil) ? g.entre : nil,
                           tandas: (g.tandas?.descanso != nil) ? (g.tandas!.veces, g.tandas!.descanso!) : nil,
                           estado: i > g.hasta ? .hecho : i >= g.desde ? .ahora : .pendiente)
        }
    }

    static func grupoPrincipal(_ grupos: [Grupo]) -> Grupo? {
        grupos.first { $0.paso.fase == .principal && $0.veces > 1 } ?? grupos.first { $0.paso.fase == .principal } ?? grupos.first
    }

    // MARK: - El brief y lo de hoy

    struct LineaBrief: Equatable {
        var linea: String
        var detalle: String?
        var cue: String?
        var principal: Bool
    }

    private static func dosis(_ p: Paso) -> String { p.medida.tipo == .reps ? (p.medida.prescrito.map(num) ?? "") : fmtPrescrito(p.medida) }
    private static func conObjetivo(_ o: Objetivo?) -> String { o.map { " \(textoObjetivo($0))" } ?? "" }
    private static func segundoObjetivo(_ p: Paso) -> String? { p.objetivos.first { $0.papel != .principal && $0.eje != .kg }.map { textoObjetivo($0) } }
    private static func modoCorto(_ m: ModoRecupera?) -> String { m == .andar ? "caminando" : m == .parado ? "parado" : "trote" }

    private static func recuperacion(_ e: Paso?) -> String? {
        guard let e, let pr = e.medida.prescrito else { return nil }
        let modo = e.rol == .recuperacion ? " \(modoCorto(e.modoRecupera))" : ""
        return "r \(fmtDuracion(pr))\(modo)\(conObjetivo(principal(e)))"
    }

    private static func cargaCorta(_ p: Paso) -> String? {
        if let c = p.carga { return "\(c.implementos.map { "\($0) × " } ?? "")\(num(c.kg)) kg" }
        if let kg = p.objetivos.first(where: { $0.eje == .kg }) { return fmtObjetivo(kg) }
        if let e = p.objetivos.first(where: { $0.eje == .rir || $0.eje == .rpe }) { return textoObjetivo(e) }
        return nil
    }

    static func lineaBrief(_ g: Grupo) -> LineaBrief {
        let p = g.paso
        let o = principal(p)
        let principalFase = p.fase == .principal
        if g.veces == 1 {
            let nombre = p.nombre ?? nombreClase(p.clase)
            return LineaBrief(linea: "\(nombre) \(fmtPrescrito(p.medida))\(conObjetivo(o))", detalle: segundoObjetivo(p), cue: p.cue, principal: principalFase)
        }
        if let nombre = p.nombre {
            let quien = p.posicion?.slot.map { "\($0) \(nombre)" } ?? nombre
            let r = g.entre?.medida.prescrito.map { "r \(fmtDuracion($0))" }
            let detalle = ["\(g.veces) × \(dosis(p))", cargaCorta(p), r].compactMap { $0 }.joined(separator: " · ")
            return LineaBrief(linea: quien, detalle: detalle, cue: p.cue, principal: principalFase)
        }
        let serie = "\(fmtPrescrito(p.medida))\(conObjetivo(o))"
        let t = g.tandas
        let d = t?.descanso
        let entreTandas = d?.medida.prescrito.map { "\(fmtDuracion($0))\(conObjetivo(principal(d!))) entre tandas" }
        let detalle = [segundoObjetivo(p), recuperacion(g.entre), entreTandas].compactMap { $0 }.joined(separator: " · ")
        return LineaBrief(linea: t != nil ? "\(t!.veces) × (\(t!.porTanda) × \(serie))" : "\(g.veces) × \(serie)",
                          detalle: detalle.isEmpty ? nil : detalle, cue: p.cue, principal: principalFase)
    }

    /// Lo de hoy en dos líneas (complicación y Smart Stack).
    static func hoyDe(_ pasos: [Paso]) -> (titulo: String, sub: String?, dur: String)? {
        guard let g = grupoPrincipal(filasDePasos(pasos)) else { return nil }
        let p = g.paso
        let o = principal(p)
        let r = g.entre?.medida.prescrito.map { "r \(fmtDuracion($0))" }
        let veces = g.tandas.map { "\($0.veces) × (\($0.porTanda) × \(fmtPrescrito(p.medida)))" }
        let titulo = veces ?? (g.veces > 1 ? "\(g.veces) × \(p.nombre != nil ? "\(dosis(p)) \(p.nombre!)" : fmtPrescrito(p.medida))" : "\(p.nombre ?? nombreClase(p.clase)) \(fmtPrescrito(p.medida))")
        let sub = [o.map { textoObjetivo($0) }, r].compactMap { $0 }.joined(separator: " · ")
        return (titulo, sub.isEmpty ? nil : sub, duracionHumana(pasos))
    }

    // MARK: - Las filas de la página Estructura en palabras (listas.tsx)

    /// «6 × 1000 m» · «a 3:45–3:55 · r 90″ trote»: la fila de un bloque.
    static func textoFila(_ f: FilaEstructura) -> (linea: String, detalle: String?) {
        if let d = filaDeathBy(f.trabajo) { return (d.linea, d.detalle) }
        let p = f.trabajo
        let o = principal(p)
        let nombre = p.nombre ?? nombreClase(p.clase)
        let pr = fmtPrescrito(p.medida)
        var linea: String
        if let t = f.tandas, let v = f.veces { linea = "\(t.veces) × (\(v) × \(pr))" }
        else if let v = f.veces { linea = p.nombre != nil ? "\(v) × \(dosis(p)) \(nombre)" : "\(v) × \(pr)" }
        else { linea = "\(nombre)\(pr.isEmpty ? "" : " · \(pr)")" }
        var detalle: [String] = []
        if let o { detalle.append(textoObjetivo(o, p.maquina)) }
        if let r = recuperacion(f.recupera) { detalle.append(r) }
        if let t = f.tandas, let pr = t.descanso.medida.prescrito { detalle.append("\(fmtDuracion(pr)) entre tandas") }
        if let c = cargaCorta(p), p.nombre != nil { detalle.append(c) }
        return (linea, detalle.isEmpty ? nil : detalle.joined(separator: " · "))
    }

    /// El veredicto de una vuelta en palabras, y si está fuera.
    static func juicioDe(_ v: Vuelta) -> (texto: String, fuera: Bool)? {
        guard let ver = v.veredicto else { return nil }
        let p = palabraVeredicto(v.eje ?? .ritmo, ver)
        return ("\(p.marca.map { "\($0) " } ?? "")\(p.texto)", ver != .dentro)
    }

    // MARK: - El aviso de deshacer (vivo.tsx)

    /// «Serie 3 cerrada», «Recuperación cortada», «A1 · serie 3 hecha», «Sled Push hecho».
    static func avisoDeCierre(_ paso: Paso, cabe: (String) -> Bool = { anchoTexto($0, 15) <= 160 }) -> String {
        if paso.rol == .recuperacion { return "Recuperación cortada" }
        if paso.rol == .descanso { return "Descanso cortado" }
        if paso.fuerza != nil { return avisoSerie(paso) }
        switch paso.wod {
        case .puntuacion: return "Puntuación guardada"
        case .emom: return "Minuto \(paso.posicion?.serie.map { String($0.n) } ?? "") saltado"
        case .amrap: return "AMRAP cortado"
        default: break
        }
        if paso.rol == .transicion { return paso.roxzone != nil ? "Roxzone cerrada" : "Colócate cortado"}
        if let t = paso.posicion?.tramo { return "Tramo \(t.n) cerrado" }
        if let s = paso.posicion?.serie {
            let c = nombreCuenta(paso)
            return "\(c.nombre) \(s.n) \(c.femenino ? "cerrada" : "cerrado")"
        }
        if let n = paso.nombre {
            let hecho = "\(n) hecho"
            if cabe(hecho) { return hecho }
            return paso.clase == .estacion ? "Estación hecha" : "Paso cerrado"
        }
        return "Paso cerrado"
    }
}
