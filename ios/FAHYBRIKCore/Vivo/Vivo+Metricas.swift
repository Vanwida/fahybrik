import Foundation

// EL HÉROE, EL TRABAJO Y LA REJILLA DEL PASO — funciones PURAS (I4, I5 y §4 del
// modelo del iPhone; espejo de `kit-reloj/metricas.ts`).
//   · el HÉROE con las reglas de familia encima de P3 (`heroeDeFamilia`);
//   · el TRABAJO (§10.6): lo que falta o la tarea, nunca en gris (`trabajoDe`);
//   · la REJILLA de 2–4 métricas propias, el pulso siempre (`metricasDelPaso`).

extension Vivo {

    /// Lo que el héroe, el trabajo y la rejilla necesitan además del paso y las
    /// lecturas, y que vive en el motor o en la familia. Sin él, la métrica que
    /// lo pide no sale (no se inventa).
    struct ExtraFamilia: Equatable {
        var metrosPaso: Double? = nil
        var total: Double? = nil
        var rondas: Int? = nil
        var cargaKg: Double? = nil
        var ultimaSerie: String? = nil
        var repsRonda: Int? = nil
        var repsMinuto: Int? = nil
        var descansoS: Double? = nil
        var siguienteNombre: String? = nil
        var rondaS: Double? = nil
        var totalEnCabecera: Bool = false
        var ultimaVentana: Double? = nil
        var repsSueltas: Int? = nil
        var anterior: (paso: Paso, parcial: Parcial)? = nil

        static func == (a: ExtraFamilia, b: ExtraFamilia) -> Bool {
            a.metrosPaso == b.metrosPaso && a.total == b.total && a.rondas == b.rondas && a.cargaKg == b.cargaKg
                && a.ultimaSerie == b.ultimaSerie && a.repsRonda == b.repsRonda && a.repsMinuto == b.repsMinuto
                && a.descansoS == b.descansoS && a.siguienteNombre == b.siguienteNombre && a.rondaS == b.rondaS
                && a.totalEnCabecera == b.totalEnCabecera && a.ultimaVentana == b.ultimaVentana && a.repsSueltas == b.repsSueltas
                && a.anterior?.paso == b.anterior?.paso && a.anterior?.parcial == b.anterior?.parcial
        }
    }

    // MARK: - El héroe de la familia (I4)

    /// La carga en la barra: la declarada (cascada) o la que propone el plan.
    private static func kgEnBarra(_ p: Paso, _ x: ExtraFamilia) -> Double? {
        guard let f = p.fuerza else { return nil }
        return x.cargaKg ?? cargaDelPlan(f)
    }

    /// Las reps las cuenta el sensor y ya está contando.
    private static func cuentaElSensor(_ p: Paso, _ l: Lecturas) -> Bool { p.medida.mide == .sensor && l.hecho != nil }

    /// EL HÉROE CON LAS REGLAS DE FAMILIA ENCIMA DE P3.
    static func heroeDeFamilia(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ x: ExtraFamilia = ExtraFamilia()) -> HeroeVista {
        let f = familiaDe(p)
        if f == .fortime, let total = x.total { return HeroeVista(clase: .crono, texto: fmtReloj(total), etiqueta: "total") }
        if f == .amrap, case let .amrap(tareas, _)? = p.wod, tareas.count > 1, let r = x.rondas {
            return HeroeVista(clase: .crono, texto: String(r), unidad: r == 1 ? "ronda" : "rondas")
        }
        if f == .amrap, case let .puntuacion(tareas, _)? = p.wod {
            let reps = x.repsSueltas.map(String.init) ?? "—"
            if tareas.count > 1, let r = x.rondas { return HeroeVista(clase: .crono, texto: "\(r) + \(reps)", etiqueta: "rondas + reps") }
            return HeroeVista(clase: .crono, texto: reps, unidad: "reps", etiqueta: tareas.first?.nombre ?? "puntuación")
        }
        if f == .deathby { return heroeDeathBy(p) ?? heroeDelPaso(p, l, zonas) }
        if f == .pared {
            let falta = faltaDe(p, l)
            return HeroeVista(clase: .falta, texto: fmtReloj((falta ?? l.t).rounded(.up)), etiqueta: p.rol == .trabajo ? "trabajo" : "descanso")
        }
        if f == .fuerza, let fi = p.fuerza, p.rol == .trabajo, p.medida.tipo == .reps {
            let reps = p.medida.prescrito.map(num) ?? "—"
            let kg: Double?
            if case .corporal = fi.carga { kg = nil } else { kg = kgEnBarra(p, x) }
            let esfuerzo = fi.esfuerzo.map(textoEsfuerzo)
            let pct = textoPct(fi.carga)
            var etiqueta: String? = [pct, esfuerzo].compactMap { $0 }.joined(separator: " · ")
            if etiqueta?.isEmpty == true {
                if case .tuya = fi.carga { etiqueta = "carga tuya" } else if case .corporal = fi.carga { etiqueta = "peso corporal" } else { etiqueta = nil }
            }
            if cuentaElSensor(p, l) {
                return HeroeVista(clase: .falta, texto: num(l.hecho ?? 0), unidad: "de \(reps)", etiqueta: kg.map(fmtKg) ?? etiqueta)
            }
            if let kg { return HeroeVista(clase: .falta, texto: "\(reps) × \(num(kg))", unidad: "kg", etiqueta: etiqueta) }
            return HeroeVista(clase: .falta, texto: reps, unidad: "reps", etiqueta: etiqueta)
        }
        var base = heroeDelPaso(p, l, zonas)
        if f == .roxzone {
            base.etiqueta = p.roxzone == .entrada ? "Roxzone\(x.siguienteNombre.map { " · entras a \($0)" } ?? "")" : "Roxzone · sigue sola al correr"
            return base
        }
        if base.clase == .crono, [.estacion, .remo, .ski, .bici].contains(f), p.medida.mide == .atleta {
            base.etiqueta = "lo dices tú"
            return base
        }
        return base
    }

    // MARK: - El trabajo (§10.6)

    struct TrabajoVista: Equatable {
        var etiqueta: String
        var valor: String
        var unidad: String? = nil
        /// Un valor que no es cifra: en texto, sin numeral.
        var texto: Bool = false
    }

    private static func enTexto(_ etiqueta: String, _ valor: String) -> TrabajoVista { TrabajoVista(etiqueta: etiqueta, valor: valor, texto: true) }

    private static func faltaVista(_ p: Paso, _ l: Lecturas) -> TrabajoVista? {
        guard let falta = faltaDe(p, l) else { return nil }
        switch p.medida.tipo {
        case .distancia:
            let d = fmtDistancia(falta)
            return TrabajoVista(etiqueta: "quedan", valor: d.valor, unidad: d.unidad)
        case .reps: return TrabajoVista(etiqueta: "quedan", valor: String(Int(falta.rounded(.up))), unidad: "reps")
        case .cal: return TrabajoVista(etiqueta: "quedan", valor: String(Int(falta.rounded(.up))), unidad: "cal")
        default: return TrabajoVista(etiqueta: "quedan", valor: fmtReloj(falta.rounded(.up)))
        }
    }

    /// La dosis de una estación con su carga: «50 m · 152 kg».
    private static func dosisEstacion(_ p: Paso) -> String? {
        let pr = fmtPrescrito(p.medida)
        let partes = [pr.isEmpty ? nil : pr, textoCargaImplemento(p.carga)].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// LA FILA DEL TRABAJO (I5.4): lo que falta del paso y la dosis, nunca en gris.
    static func trabajoDe(_ p: Paso, _ l: Lecturas, heroe: ClaseHeroe) -> TrabajoVista? {
        let f = familiaDe(p)
        switch f {
        case .fuerza:
            if p.fuerza != nil, p.medida.mide == .sensor { return faltaVista(p, l) }
            return p.tempo.map { enTexto("tempo", textoTempo($0)) }
        case .emom:
            if case let .emom(tarea, _, _, ventanaS)? = p.wod { return enTexto("tarea", textoTarea(tarea, ventanaS: ventanaS)) }
            return nil
        case .amrap, .deathby:
            return faltaDe(p, l).map { TrabajoVista(etiqueta: "quedan", valor: fmtReloj($0.rounded(.up))) }
        case .fortime:
            if case let .fortime(tarea?, _)? = p.wod {
                return enTexto("estación", [textoTarea(tarea), tarea.carga != nil ? nil : cargaTarea(tarea)].compactMap { $0 }.joined(separator: " · "))
            }
            return nil
        case .estacion, .roxzone:
            return dosisEstacion(p).map { enTexto("dosis", $0) }
        case .pared, .descanso, .recupera, .transicion, .movilidad:
            return nil
        default: break
        }
        if heroe == .falta || heroe == .crono { return nil }
        return faltaVista(p, l)
    }

    // MARK: - La rejilla de apoyo (§4)

    enum ClaveMetrica: String, Equatable {
        case pulso, ritmo, distancia, cadencia, inclinacion, split, vatios, cal, serie, tempo, descanso, ultima, tarea
        case minuto, repsRonda, cap, parcial, total, ronda, objetivo, carga, esfuerzo, rondaS, reps
    }

    struct Metrica: Equatable, Identifiable {
        var clave: ClaveMetrica
        var etiqueta: String
        var valor: String
        var unidad: String? = nil
        var zona: ZonaVista? = nil
        var glifo: Bool = false
        var tendencia: Tendencia? = nil
        var aviso: AvisoLinea? = nil
        var texto: Bool = false
        var id: String { "\(clave.rawValue)-\(etiqueta)" }
    }

    static let rejillaMin = 2
    static let rejillaMax = 4

    private static func entero(_ v: Double?) -> String { v.map { String(Int($0.rounded())) } ?? "—" }

    /// Un dato que alguien mide existe; uno que nadie mide no se pinta. Solo «—»
    /// cuando se MEDÍA y se ha perdido.
    private static func medido(_ l: Lecturas, _ v: Double?, _ campo: CampoVivo) -> Bool { v != nil || l.viejo(campo) }

    private static func pulso(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso) -> Metrica {
        let x = lineaPulso(p, l, zonas, reglas)
        return Metrica(clave: .pulso, etiqueta: "pulso", valor: x.valor, unidad: x.unidad, zona: x.zona, glifo: true, tendencia: x.tendencia, aviso: x.aviso)
    }

    private static func ritmo(_ l: Lecturas) -> Metrica { Metrica(clave: .ritmo, etiqueta: "ritmo", valor: fmtRitmo(valorDeEje(.ritmo, l)), unidad: "/km") }

    private static func distancia(_ x: ExtraFamilia) -> Metrica? {
        guard let m = x.metrosPaso else { return nil }
        let d = fmtDistancia(m)
        return Metrica(clave: .distancia, etiqueta: "distancia", valor: d.valor, unidad: d.unidad)
    }

    private static func cadencia(_ l: Lecturas, _ unidad: String) -> Metrica? {
        guard medido(l, l.cadencia, .cadencia) else { return nil }
        return Metrica(clave: .cadencia, etiqueta: "cadencia", valor: entero(valorDeEje(.cadencia, l)), unidad: unidad)
    }

    private static func split(_ p: Paso, _ l: Lecturas) -> Metrica {
        Metrica(clave: .split, etiqueta: "ritmo", valor: fmtSplit(valorDeEje(.split500, l), p.maquina), unidad: unidadSplit(p.maquina))
    }

    private static func vatios(_ l: Lecturas) -> Metrica? {
        guard medido(l, l.vatios, .vatios) else { return nil }
        return Metrica(clave: .vatios, etiqueta: "potencia", valor: entero(valorDeEje(.potencia, l)), unidad: "W")
    }

    private static func cal(_ l: Lecturas) -> Metrica? {
        guard medido(l, l.cal, .cal) else { return nil }
        return Metrica(clave: .cal, etiqueta: "calorías", valor: l.viejo(.cal) ? "—" : entero(l.cal), unidad: "cal")
    }

    private static func inclinacion(_ p: Paso) -> Metrica? {
        guard let o = p.objetivos.first(where: { $0.eje == .inclinacion }) else { return nil }
        return Metrica(clave: .inclinacion, etiqueta: "inclinación", valor: num(o.min ?? o.max ?? 0), unidad: "%")
    }

    private static func totalDe(_ x: ExtraFamilia) -> Metrica? {
        guard let t = x.total, !x.totalEnCabecera else { return nil }
        return Metrica(clave: .total, etiqueta: "total", valor: fmtReloj(t))
    }

    private static func rondaDe(_ p: Paso, _ x: ExtraFamilia) -> Metrica? {
        guard let r = p.posicion?.ronda, let s = x.rondaS else { return nil }
        return Metrica(clave: .rondaS, etiqueta: "ronda \(r.n)", valor: fmtReloj(s))
    }

    private static func texto(_ clave: ClaveMetrica, _ etiqueta: String, _ valor: String) -> Metrica {
        Metrica(clave: clave, etiqueta: etiqueta, valor: valor, texto: true)
    }

    private static func ultimaVentana(_ x: ExtraFamilia) -> Metrica? {
        x.ultimaVentana.map { Metrica(clave: .ultima, etiqueta: "la vez anterior", valor: fmtReloj($0)) }
    }

    private static func rondaAnterior(_ x: ExtraFamilia) -> Metrica? {
        guard let a = x.anterior, let r = a.paso.posicion?.ronda, let ppm = a.parcial.ppm else { return nil }
        return Metrica(clave: .ultima, etiqueta: "ronda \(r.n)", valor: String(Int(ppm.rounded())), unidad: "ppm medio")
    }

    /// LA REJILLA DE APOYO DEL PASO (§4): 2–4 métricas propias de la familia o de
    /// la máquina, el pulso siempre (salvo que sea el héroe), sin repetir lo que
    /// ya dicen el héroe y la fila del trabajo.
    static func metricasDelPaso(_ p: Paso, _ l: Lecturas, heroe: ClaseHeroe, _ zonas: ZonasCoach?, _ x: ExtraFamilia = ExtraFamilia(), _ reglas: ReglasAviso = reglasAvisoDefecto) -> [Metrica] {
        let f = familiaDe(p)
        let conPulso = heroe != .pulso
        var m: [Metrica?] = []

        switch f {
        case .correr:
            if heroe != .ritmo { m.append(ritmo(l)) }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            m.append(contentsOf: [distancia(x), rondaDe(p, x), cadencia(l, "pasos")])
        case .cinta:
            if heroe != .ritmo, medido(l, l.ritmo, .ritmo) { m.append(ritmo(l)) }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            m.append(contentsOf: [inclinacion(p), distancia(x)])
        case .remo, .ski, .bici:
            if heroe != .split, p.medida.mide == .ergo { m.append(split(p, l)) }
            m.append(cadencia(l, f == .bici ? "rpm" : "s/min"))
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            m.append(contentsOf: [p.medida.tipo == .cal ? nil : cal(l), vatios(l)])
        case .fuerza:
            if let s = p.posicion?.serie { m.append(texto(.serie, p.fuerza?.aproximacion == true ? "aproximación" : "serie", "\(s.n)/\(s.de)")) }
            if let fi = p.fuerza {
                let rango = kgDelPlan(fi.carga)
                let enBarra = kgEnBarra(p, x)
                if let kg = textoKgPlan(fi.carga), case .rm = fi.carga, let rango, rango.0 != rango.1 || rango.0 != enBarra {
                    m.append(texto(.carga, "carga del plan", kg))
                }
                let heroeLlevaEsfuerzo = p.medida.tipo == .reps && !cuentaElSensor(p, l)
                if let e = fi.esfuerzo, !fi.aproximacion, !heroeLlevaEsfuerzo { m.append(texto(.esfuerzo, "esfuerzo", textoEsfuerzo(e))) }
            }
            if let t = p.tempo { m.append(texto(.tempo, "tempo", textoTempo(t))) }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            if let u = x.ultimaSerie { m.append(texto(.ultima, "última serie", u)) }
            if let d = x.descansoS { m.append(texto(.descanso, "descanso", fmtDuracion(d))) }
        case .emom:
            var maquina = false
            if case .emom = p.wod, let mq = p.maquina, mq.tipo != .cinta, p.medida.mide != .atleta { maquina = true }
            if case .emom = p.wod {
                if let r = x.repsMinuto { m.append(Metrica(clave: .reps, etiqueta: "reps", valor: String(r))) }
                if maquina { m.append(contentsOf: [split(p, l), distancia(x)]) } else { m.append(ultimaVentana(x)) }
            }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            if maquina { m.append(cal(l)) }
        case .deathby:
            m.append(ultimaVentana(x))
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
        case .amrap:
            if case let .amrap(tareas, _)? = p.wod {
                if let t = tareas.first { m.append(texto(.tarea, tareas.count > 1 ? "la ronda empieza por" : "tarea", textoTarea(t))) }
                if let mq = p.maquina, mq.tipo != .cinta { m.append(split(p, l)) }
                else if tareas.count > 1 { m.append(Metrica(clave: .repsRonda, etiqueta: "reps por ronda", valor: String(repsPorRonda(tareas)))) }
            }
            if case let .puntuacion(tareas, _)? = p.wod, tareas.count > 1 {
                m.append(Metrica(clave: .repsRonda, etiqueta: "reps por ronda", valor: String(repsPorRonda(tareas))))
            }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
        case .fortime:
            if case let .fortime(_, capS)? = p.wod {
                if let cap = capS {
                    if let t = x.total {
                        let hasta = Swift.max(0, cap - t)
                        m.append(Metrica(clave: .cap, etiqueta: hasta > 0 ? "cap en" : "cap pasado", valor: fmtReloj(hasta)))
                    } else {
                        m.append(Metrica(clave: .cap, etiqueta: "cap", valor: fmtDuracion(cap)))
                    }
                }
                m.append(Metrica(clave: .parcial, etiqueta: "esta estación", valor: fmtReloj(l.t)))
                if p.maquina != nil, p.medida.mide == .ergo { m.append(split(p, l)) }
            }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
        case .pared:
            if let r = x.repsRonda { m.append(Metrica(clave: .repsRonda, etiqueta: "reps", valor: String(r))) }
            m.append(rondaAnterior(x))
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
        case .estacion, .roxzone:
            if let o = objetivoDe(p, .principal) { m.append(texto(.objetivo, "objetivo", fmtObjetivo(o, p.maquina))) }
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            m.append(contentsOf: [rondaDe(p, x), totalDe(x)])
        case .recupera, .descanso, .transicion, .movilidad:
            if conPulso { m.append(pulso(p, l, zonas, reglas)) }
            if f == .recupera, medido(l, l.ritmo, .ritmo) { m.append(ritmo(l)) }
            m.append(totalDe(x))
        }

        return Array(m.compactMap { $0 }.prefix(rejillaMax))
    }
}
