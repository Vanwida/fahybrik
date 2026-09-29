import Foundation

// LA SESIÓN, LEÍDA — lo que la pantalla «qué pasó en esa sesión» pinta (`screens/analiticas-sesion`) sobre el sobre que sirve
// `cargarSesion`. Puro y con test: las palabras, el orden y las decisiones (qué es el sujeto, cómo se llama un tramo, cómo se
// dice lo hecho, si hay sello) viven aquí; la vista solo pinta.
//
// EL SUJETO DE UNA SESIÓN ES SU CARGA: lo que pesó, contra lo planificado, y de qué peldaño sale la cifra (potencia › ritmo ›
// pulso › esfuerzo). Cuando un tramo no tiene peldaño (sin ritmo, vatios, pulso ni RPE), su carga NO SE SABE y cuenta contra la
// cobertura: se dice, jamás se pinta como cero.
//
// Lo que el doble firmó y el servidor NO sirve, y por tanto se degrada con honestidad (declarado en el informe):
//   · el sello de cada tramo — el detalle lo declara `pendientes: ['cumplimiento']`; lo trae el cumplimiento, cruzado por el id
//     del tramo (`VeredictosDeSesion`), y sin él el tramo se pinta sin sello, no con uno inventado
//   · la franja pedida dibujada sobre la curva — el servidor manda la frase de lo pedido (`texto_es`), no su banda numérica
//   · la línea del pulso medio — la curva viaja «para dibujar, nunca fuente de un cálculo»
//   · la curva de vatios o de split de un ergo — solo viajan el ritmo y el pulso de la traza

/// La carga de UN tramo tal como se pinta a la derecha de su fila: la cifra y de dónde sale, o «?» si no se sabe.
struct CargaDeTramoVista: Equatable {
    /// Nula = no se sabe (no hay peldaño para preciarla).
    let tss: Double?
    let peldano: String?

    static let noSeSabe = CargaDeTramoVista(tss: nil, peldano: nil)

    init(tss: Double?, peldano: String?) {
        self.tss = tss
        self.peldano = peldano
    }

    init(_ c: CargaDeTramo?) {
        guard let c, let tss = c.tss else { self = .noSeSabe; return }
        self.init(tss: tss, peldano: c.peldano?.nombre)
    }
}

/// Una fila de «Tramo a tramo».
struct FilaDeTramoVista: Equatable, Identifiable {
    let id: String
    let nombre: String
    /// «Pedido: …», la frase que escribe el servidor con la gramática del plan. Nulo en un tramo sin prescripción.
    let pedido: String?
    /// Lo hecho, ya escrito: «3:49/km · 163 ppm · 178 pasos/min».
    let hecho: String?
    let marca: MarcaDeCumplimiento
    let carga: CargaDeTramoVista
    /// Una recuperación entre series: se enseña y se etiqueta, no se cuenta como trabajo.
    let esRecuperacion: Bool
}

/// El sujeto de la pantalla: la carga de la sesión.
struct SujetoDeSesion: Equatable {
    let familia: FamiliaLectura
    /// Nula = la carga no se sabe.
    let tss: Double?
    /// La planificada, solo cuando se sabe entera.
    let plan: Double?
    /// El peldaño que precia más tiempo de la sesión.
    let peldano: PeldanoDeCarga?
    let ancla: AnclaDeLectura?
    /// Qué parte del tiempo no se pudo preciar («No se sabe el 45 % del tiempo…»). Nula cuando todo se preció.
    let avisoSinSaber: String?
    /// «3 de 4 tramos dentro de lo pedido», o de dónde sale la sesión si no tiene plan.
    let resumen: String?
}

struct ParcialVista: Equatable, Identifiable {
    let id: Int
    let etiqueta: String
    let segundos: Double
    /// El más rápido o el más lento de los kilómetros completos: van en tinta, los demás atenuados.
    let destacado: Bool
}

struct ZonaVista: Equatable, Identifiable {
    /// 1…5.
    let zona: Int
    let etiqueta: String
    let pct: Double
    var id: Int { zona }
}

struct LecturaDeSesion: Equatable {
    /// «22 sep · Series · 31 min».
    let sobretitulo: String
    let titulo: String
    let sujeto: SujetoDeSesion
    let tramos: [FilaDeTramoVista]
    /// Bajo el título de «Tramo a tramo».
    let preguntaDeTramos: String
    /// La carga del rato que ningún tramo cubre, si pesó algo: la fila de la izquierda no sumaría el sujeto sin ella.
    let notaDelResto: String?
    let ritmo: [PuntoDeTiempo]
    let pulso: [PuntoDeTiempo]
    let parciales: [ParcialVista]
    let zonas: [ZonaVista]
    let rpe: Double?
    let duracionS: Double?
    /// Cuánto dura la sesión, para el eje del tiempo de las curvas.
    let duracionDeLasCurvas: Double

    static let idCarga = "sesion.carga"
    static let idDuracion = "sesion.duracion"
    static let idZonas = "sesion.zonas"
    /// Un tiempo o una carga que no se sabe: la parte del reparto de la carga que ningún peldaño precia.
    static let parteSinSaber = "sin_saber"
    /// La carga contra la planificada (`referencia.de`).
    static let referenciaPlan = "plan"

    /// - Parameter fila: la sesión en el cumplimiento de su ventana, si está a mano: trae el veredicto de cada tramo. Sin ella
    ///   (una sesión libre, o el cumplimiento aún sin cargar) no hay sellos.
    static func desde(_ s: DetalleDeSesion, fila: FilaDeSesion?, hoy: String) -> LecturaDeSesion {
        let veredictos = VeredictosDeSesion(fila)
        let tienePlan = s.assignmentId != nil && s.fueraDelPlan == nil
        let duracion = s.lectura(idDuracion)?.dato?.valor
        let elSujeto = sujeto(s, fila: fila)
        let trabajo = ordinalesDeTrabajo(s.tramos)
        return LecturaDeSesion(
            sobretitulo: sobretitulo(s, duracion: duracion, hoy: hoy),
            titulo: s.tituloEs ?? "Entreno libre",
            sujeto: elSujeto,
            tramos: s.tramos.map { filaDeTramo($0, ordinal: trabajo[$0.id], veredictos: veredictos, tienePlan: tienePlan) },
            preguntaDeTramos: elSujeto.resumen ?? (tienePlan ? "Lo pedido frente a lo hecho" : "Sin plan: lo que fue"),
            notaDelResto: notaDelResto(s.resto),
            ritmo: s.traza.ritmo?.puntos ?? [],
            pulso: s.traza.pulso?.puntos ?? [],
            parciales: parciales(s.traza.parcialesKm),
            zonas: zonas(s.lectura(idZonas)),
            rpe: s.rpe,
            duracionS: duracion,
            duracionDeLasCurvas: duracion ?? max(s.traza.ritmo?.offsetsS.last ?? 0, s.traza.pulso?.offsetsS.last ?? 0)
        )
    }

    // MARK: Cabecera

    static func sobretitulo(_ s: DetalleDeSesion, duracion: Double?, hoy: String) -> String {
        [
            AnaliticasFormato.fechaLegible(s.dia, hoy: hoy),
            s.formato.flatMap { PrescriptionScheme(canonicalizing: $0)?.nombreEs },
            duracion.flatMap { Formato.duracion(Int(($0 / 60).rounded())) },
        ].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: El sujeto

    static func sujeto(_ s: DetalleDeSesion, fila: FilaDeSesion?) -> SujetoDeSesion {
        let carga = s.lectura(idCarga)
        let medida = carga?.estado == .medida ? carga : nil
        let partes = medida?.reparto?.partes ?? []
        let peldano = partes.filter { $0.code != parteSinSaber }.max { $0.valor < $1.valor }.flatMap { PeldanoDeCarga(rawValue: $0.code) }
        let sinSaber = partes.first { $0.code == parteSinSaber }?.pct.flatMap { $0 > 0 ? $0 : nil }
        let referencia = medida?.dato?.referencia
        return SujetoDeSesion(
            familia: s.tramos.first?.familia ?? fila?.lineas.first?.familia ?? .otro,
            tss: medida?.dato?.valor,
            plan: referencia?.de == referenciaPlan ? referencia?.valor : nil,
            peldano: peldano.flatMap { $0 == .desconocido ? nil : $0 },
            ancla: carga?.procedencia.ancla,
            avisoSinSaber: sinSaber.map { "No se sabe el \(Int($0.rounded())) % del tiempo: sin ritmo, vatios, pulso ni esfuerzo no hay con qué preciarlo." },
            resumen: resumen(s, fila: fila)
        )
    }

    /// «3 de 4 tramos dentro de lo pedido» (los que el motor juzgó: un calentamiento con su ritmo pedido también cuenta, y las
    /// recuperaciones van aparte); sin plan, de dónde sale la sesión.
    private static func resumen(_ s: DetalleDeSesion, fila: FilaDeSesion?) -> String? {
        if let t = fila?.tramos, t.detalle == "tramos", t.evaluables > 0 {
            return "\(t.dentro) de \(t.evaluables) \(t.evaluables == 1 ? "tramo" : "tramos") dentro de lo pedido"
        }
        return s.fueraDelPlan != nil ? "Sin plan: lo que fue" : nil
    }

    // MARK: Los tramos

    /// El número de orden de cada serie de trabajo de la parte principal de una carrera de series: «Serie 3».
    private static func ordinalesDeTrabajo(_ tramos: [TramoDeSesion]) -> [String: Int] {
        var n = 0
        var out: [String: Int] = [:]
        for t in tramos where t.ejercicioEs == nil && t.papel == "work" && t.fase == "main" {
            n += 1
            out[t.id] = n
        }
        return out
    }

    static func nombreDeTramo(_ t: TramoDeSesion, ordinal: Int?) -> String {
        if let e = t.ejercicioEs { return t.ronda > 0 ? "\(e) · ronda \(t.ronda)" : e }
        if t.fase == "warmup" { return "Calentamiento" }
        if t.fase == "cooldown" { return "Vuelta a la calma" }
        if t.papel == "recovery" { return "Recuperación" }
        if let ordinal { return "Serie \(ordinal)" }
        return t.familia.nombre
    }

    private static func filaDeTramo(_ t: TramoDeSesion, ordinal: Int?, veredictos: VeredictosDeSesion, tienePlan: Bool) -> FilaDeTramoVista {
        FilaDeTramoVista(
            id: t.id,
            nombre: nombreDeTramo(t, ordinal: ordinal),
            pedido: t.prescrito?.textoEs,
            hecho: t.hecho.flatMap { hechoEnPalabras($0, segundosDelTramo: t.segundos) },
            marca: veredictos.marca(de: t.id, tienePlan: tienePlan && t.prescrito != nil),
            carga: CargaDeTramoVista(t.carga),
            esRecuperacion: t.papel == "recovery"
        )
    }

    private static func notaDelResto(_ resto: CargaDeTramo?) -> String? {
        guard let tss = resto?.tss, tss >= 0.5 else { return nil }
        return "El resto de la sesión (calentar, descansos) suma \(Int(tss.rounded())) de carga."
    }

    // MARK: Lo hecho, en palabras

    /// Lo que se hizo en un tramo, con las cifras de su modalidad y en el orden en que se lee: lo que se movió, a qué ritmo y
    /// con qué pulso. Nulo si no se midió nada (no se inventa una frase).
    static func hechoEnPalabras(_ h: SegmentActualDTO, segundosDelTramo: Double?) -> String? {
        var partes: [String] = []
        let f = AnaliticasFormato.self
        let tiempo = (h.durationSeconds.map(Double.init) ?? segundosDelTramo).flatMap { $0 > 0 ? $0 : nil }
        // Un EMOM ya dice sus minutos («10 de 12 minutos»): repetir el tiempo total sería decirlo dos veces.
        let tiempoSiNoHayDistancia = h.emomRoundsCompleted == nil ? tiempo : nil
        switch h.modality {
        case "strength":
            if let series = seriesEnPalabras(h) { partes.append(series) }
        case "run":
            if let m = h.distanceMeters, m > 0 { partes.append(f.formatear(m, .metros)) }
            else if let s = tiempo { partes.append(f.formatear(s, .segundos)) }
            if let p = h.avgPaceSPerKm, p > 0 { partes.append(f.formatear(p, .sKm)) }
            if let c = h.runCadenceSpm, c > 0 { partes.append("\(c) pasos/min") }
        case "row", "ski":
            if let m = h.distanceMeters, m > 0 { partes.append(f.formatear(m, .metros)) }
            else if let s = tiempoSiNoHayDistancia { partes.append(f.formatear(s, .segundos)) }
            if let p = h.avgPaceSPer500m, p > 0 { partes.append(f.formatear(p, .s500m)) }
            if let w = h.avgPowerW, w > 0 { partes.append(f.formatear(w, .watts)) }
            if let c = h.strokeRateSpm, c > 0 { partes.append(f.formatear(c, .spm)) }
        case "bike":
            if let m = h.distanceMeters, m > 0 { partes.append(f.formatear(m, .metros)) }
            else if let s = tiempoSiNoHayDistancia { partes.append(f.formatear(s, .segundos)) }
            if let w = h.avgPowerW, w > 0 { partes.append(f.formatear(w, .watts)) }
            if let c = h.strokeRateSpm, c > 0 { partes.append(f.formatear(c, .rpm)) }
        default:
            if let s = tiempo { partes.append(f.formatear(s, .segundos)) }
        }
        if let hecho = h.emomRoundsCompleted, let pedido = h.emomRoundsPrescribed {
            partes.append("\(hecho) de \(pedido) minutos")
        }
        if h.modality != "strength", let r = h.repsCompleted, r > 0 { partes.append(f.formatear(Double(r), .reps)) }
        if let kcal = h.calories, kcal > 0 { partes.append("\(Int(kcal.rounded())) kcal") }
        if let hr = h.avgHr, hr > 0 { partes.append(f.formatear(Double(hr), .bpm)) }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// Las series de fuerza en palabras: «5 × 100 kg · 5 × 105 kg · RIR 3 · 2 · 1». Las iguales seguidas se juntan («4 × 5 a 100 kg»).
    private static func seriesEnPalabras(_ h: SegmentActualDTO) -> String? {
        let hechas = (h.sets ?? []).filter { $0.status != "skipped" && ($0.reps ?? 0) > 0 }
        if hechas.isEmpty {
            guard let reps = h.repsCompleted, reps > 0 else { return nil }
            return [String(reps), h.weightUsedKg.map { "× \(AnaliticasFormato.formatear($0, .kg))" }].compactMap { $0 }.joined(separator: " ")
        }
        var grupos: [(reps: Int, kg: Double?, n: Int)] = []
        for s in hechas {
            if let ultimo = grupos.last, ultimo.reps == s.reps, ultimo.kg == s.kg { grupos[grupos.count - 1].n += 1 }
            else { grupos.append((s.reps ?? 0, s.kg, 1)) }
        }
        let carga = grupos.map { g -> String in
            let base = g.n > 1 ? "\(g.n) × \(g.reps)" : "\(g.reps)"
            return g.kg.map { "\(base) a \(AnaliticasFormato.formatear($0, .kg))" } ?? "\(base) reps"
        }
        var texto = carga.joined(separator: " · ")
        let rirs = hechas.compactMap(\.rir)
        if !rirs.isEmpty { texto += " · RIR " + rirs.map { Formato.esDecimal($0) }.joined(separator: " · ") }
        return texto
    }

    // MARK: Parciales y zonas

    /// Los kilómetros con tiempo. El más rápido y el más lento de los completos van destacados.
    static func parciales(_ km: [ParcialDeKm]) -> [ParcialVista] {
        let conTiempo = km.compactMap { p -> (ParcialDeKm, Double)? in p.durationS.map { (p, $0) } }
        let completos = conTiempo.filter { !$0.0.partial }
        let rapido = completos.min { $0.1 < $1.1 }?.0.index
        let lento = completos.max { $0.1 < $1.1 }?.0.index
        return conTiempo.map { p, s in
            ParcialVista(
                id: p.index,
                etiqueta: p.partial ? AnaliticasFormato.formatear(p.distanceM, .metros) : "\(p.index) km",
                segundos: s,
                destacado: completos.count > 1 && (p.index == rapido || p.index == lento)
            )
        }
    }

    /// Las zonas del pulso de la sesión, con su parte del tiempo. Sin las que no pisó.
    static func zonas(_ l: LecturaAnalitica?) -> [ZonaVista] {
        guard let l, l.estado == .medida, let partes = l.reparto?.partes else { return [] }
        return partes.compactMap { p in
            guard p.code.hasPrefix("z"), let z = Int(p.code.dropFirst()), let pct = p.pct, pct > 0 else { return nil }
            return ZonaVista(zona: z, etiqueta: p.etiquetaEs, pct: pct)
        }
    }
}
