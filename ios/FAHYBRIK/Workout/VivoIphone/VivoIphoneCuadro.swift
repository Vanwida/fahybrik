import Foundation

// EL CUADRO DEL VIVO — todo lo que la anatomía pinta en un instante, decidido
// en un sitio a partir del estado (espejo de la parte de cálculo de
// `kit-iphone-vivo/Vivo.tsx#VistaIphone`). La vista solo pinta lo que hay aquí.
//
// Lo que la familia añade al paso (el total de un circuito, las rondas del
// AMRAP, la carga que está en la barra, la última serie anotada) sale del motor
// por `VivoIphoneCuadro.extra`; una sesión de familia que sepa más lo refina
// AQUÍ, nunca en la vista.

struct VivoIphoneCuadro {
    let estado: Vivo.EstadoVivo
    let paso: Vivo.Paso
    let familia: Vivo.Familia
    let heroe: Vivo.HeroeVista
    let lamina: Vivo.Lamina
    let banda: Vivo.BandaVista?
    let instruccion: String?
    let trabajo: Vivo.TrabajoVista?
    let metricas: [Vivo.Metrica]
    let posicion: [String]
    let formato: [String]
    let esTest: Bool
    let crono: VivoCrono
    let chips: [Vivo.ChipEnlace]
    let nota: String?
    let luego: Vivo.LuegoVista?
    let enDescanso: Bool
    let tinte: Int?
    let arcos: [Vivo.ArcoDeTramo]
    let fraccion: Double
    let conMapa: Bool
    let primaria: VivoPrimaria?
    let extra: Vivo.ExtraFamilia
    let registro: Vivo.Registro
    let seriesAnotables: [VivoSerieAnotable]
    let avisoCierre: String
    /// El 3-2-1 del final de un paso de tiempo que entra en trabajo (la
    /// recuperación parada, el descanso), con el paso al que se entra. El motor
    /// solo cuenta al arrancar el bloque; esto es la cuenta del kit
    /// (`Vivo.cuentaDeEntrada`). La carrera estructurada y el EMOM llevan la suya.
    let entrada: (n: Int, paso: Vivo.Paso)?
    /// Lo que el WOD pone sobre las celdas (la lista ±1, la puntuación); nil fuera del WOD.
    let apoyoWod: VivoApoyoWod?
    /// El detalle de «Sesión completada» (la puntuación del death by); nil = «guardando…».
    let detalleFin: String?

    /// `declaradas`: los campos que el atleta confirmó o tocó en la anotación
    /// (por id de paso); lo demás sigue propuesto (I7).
    /// `wod`: lo que el atleta marcó en el WOD (las ventanas hechas, la puntuación dicha).
    init(estado e: Vivo.EstadoVivo, sesion s: WorkoutSession, dispositivos: Vivo.Dispositivos, test: Bool, declaradas: [String: Set<Vivo.CampoAnotar>],
         wod: Vivo.EstadoWod = Vivo.EstadoWod()) {
        estado = e
        let p = e.paso
        paso = p
        let f = Vivo.familiaDe(p)
        familia = f
        let zonas = e.zonas
        let seg = s.currentSegment

        // ── lo extra de la familia, del motor ────────────────────────────
        var x = Vivo.ExtraFamilia()
        x.metrosPaso = e.metrosPaso
        let fijo = seg?.isConditioningTimer == true && [PrescriptionScheme.forTime, .chipper, .ladder, .rounds, .hyroxSim].contains(seg?.formatScheme)
        // Un test es la sesión entera: su crono es el de la sesión, no un «total» de WOD.
        if fijo, s.condCountInRemaining <= 0, !Vivo.esTest(p) { x.total = s.condElapsed }
        x.totalEnCabecera = x.total != nil
        if seg?.formatScheme == .amrap { x.rondas = s.fixedRoundsDone; x.repsSueltas = s.repsCurrentSegment > 0 ? s.repsCurrentSegment : nil }
        if fijo, p.posicion?.ronda != nil { x.rondaS = Swift.max(0, s.condElapsed - s.roundsHUDClosedElapsed) }
        x.siguienteNombre = e.siguiente?.nombre
        // WOD: la vez anterior de la misma tarea (EMOM, death by) y, en la campana, la puntuación que se dice.
        x.ultimaVentana = Vivo.ultimaVezDe(e.pasos, e.i, wod.hechas)
        let dial = wod.dial ?? Vivo.dialDelMotor(rondas: s.capturedScoreRounds, reps: s.capturedScoreReps)
        if case .puntuacion = p.wod { x.rondas = dial.rondas; x.repsSueltas = dial.reps }
        if let anterior = e.parciales.last(where: { $0.i < e.i && e.pasos[$0.i].rol == .trabajo }) { x.anterior = (e.pasos[anterior.i], anterior) }
        // Fuerza: lo declarado por el atleta (la cascada de la carga), del motor y de lo confirmado aquí.
        var registro: Vivo.Registro = [:]
        for q in e.pasos where q.fuerza != nil {
            guard let o = q.origen, o.segmento == s.currentSegmentIndex, case let .serie(k) = o.ventana, s.setRecords.indices.contains(k) else { continue }
            let r = s.setRecords[k]
            let campos = declaradas[q.id] ?? []
            guard !campos.isEmpty else { continue }
            registro[q.id] = Vivo.Declarado(reps: campos.contains(.reps) ? r.repsActual.map(Double.init) : nil,
                                            kg: campos.contains(.kg) ? r.loadActualKg : nil,
                                            esfuerzo: campos.contains(.esfuerzo) ? (r.rir ?? r.rpe) : nil)
        }
        self.registro = registro
        if f == .fuerza || p.rol == .descanso {
            x.cargaKg = Vivo.cargaArrastrada(e.pasos, e.i, registro)
            x.ultimaSerie = Vivo.ultimaSerieAnotada(e.pasos, e.i, registro)
            if let o = p.origen, case let .serie(k) = o.ventana {
                let sets = seg?.prescription?.sets ?? []
                if let rest = (sets.indices.contains(k) ? sets[k].restS : nil) ?? seg?.prescription?.restS, rest > 0 { x.descansoS = Double(rest) }
            }
        }
        extra = x

        // ── lo que se pinta, todo del kit compartido ─────────────────────
        let h = Vivo.heroeWod(p, Vivo.heroeDeFamilia(p, e.lecturas, zonas, x), wod)
        heroe = h
        let lam = Vivo.laminaDelPaso(p, e.lecturas, zonas, e.reglas)
        lamina = lam
        banda = p.rol == .trabajo ? lam.banda : nil
        instruccion = (p.rol == .trabajo && lam.banda == nil && p.wod == nil && f != .fuerza) ? lam.instruccion : nil
        let ch = Vivo.enlacesDe(dispositivos, p, e.lecturas)
        chips = ch
        nota = Vivo.notaEnlace(ch) ?? p.cue.map { "Coach · \($0)" }
        metricas = Vivo.metricasDelPaso(p, e.lecturas, heroe: h.clase, zonas, x, e.reglas)
        let lu = Vivo.luegoDe(e.pasos, e.i, cargaDe: { j in Vivo.cargaArrastrada(e.pasos, j, registro) })
        luego = lu
        let descanso = p.rol == .descanso || p.rol == .recuperacion
        enDescanso = descanso
        let tKit = Vivo.trabajoDe(p, e.lecturas, heroe: h.clase)
        // «1:52–1:56» no se parte por el guion: el rango viaja entero a la línea siguiente.
        if descanso, let lu { trabajo = Vivo.TrabajoVista(etiqueta: "viene", valor: lu.que.replacingOccurrences(of: "–", with: "\u{2060}–\u{2060}"), texto: true) }
        else if tKit?.etiqueta == "tempo" { trabajo = nil }
        else { trabajo = tKit }
        posicion = Vivo.posicionDe(p, x)
        esTest = Vivo.esTest(p)
        let total = x.total
        crono = (total != nil && h.etiqueta != "total") ? VivoCrono(valor: Vivo.fmtReloj(total!), etiqueta: "total") : VivoCrono(valor: Vivo.fmtReloj(e.sesion.t), etiqueta: "sesión")
        // El formato del bloque que se está haciendo (no «Descanso»); si solo repite el nombre de lo que haces, fuera.
        let pasoFormato: Vivo.Paso = p.rol == .trabajo ? p : (e.pasos[(e.i + 1)...].first { $0.rol == .trabajo } ?? e.pasos[..<e.i].last { $0.rol == .trabajo } ?? p)
        let fKit = Vivo.formatoDe(pasoFormato)
        var partesFormato: [String] = (Vivo.posicionDe(p, x).first?.hasPrefix(fKit) ?? false) ? [] : [fKit]
        // Dónde estás, solo si la posición de arriba no lo dice ya (un dato, un sitio).
        let arriba = Vivo.posicionDe(p, x)
        if let r = p.posicion?.ronda, f != .pared, p.wod == nil, !arriba.contains("Ronda \(r.n)/\(r.de)") { partesFormato.append("Ronda \(r.n)/\(r.de)") }
        if let est = p.posicion?.estacion, !arriba.contains("Estación \(est.n)/\(est.de)") { partesFormato.append("Estación \(est.n)/\(est.de)") }
        formato = partesFormato
        tinte = Vivo.tinteDelPaso(p, e.lecturas, zonas)
        arcos = Vivo.arcosDePlan(e.pasos)
        fraccion = Vivo.fraccionDelPaso(p, e.lecturas)
        conMapa = e.pasos.contains(where: Vivo.usaGps)
        avisoCierre = Vivo.avisoWod(p, ronda: (x.rondas ?? 0) + 1) ?? Vivo.avisoDeCierre(p)
        switch p.wod {
        case .fortime? where p.rol == .trabajo: apoyoWod = .lista(Vivo.alrededorDe(e.pasos, e.i, e.parciales))
        case .puntuacion?: apoyoWod = .puntuacion(dial, tareas: Vivo.tareasAmrap(p), foco: wod.foco)
        default: apoyoWod = nil
        }
        detalleFin = Vivo.deathByDe(p) != nil ? Vivo.resultadoDeathBy(e.pasos, wod.hechas) : nil
        let cuentaPropia = s.isRunStructureActive || seg?.isEMOM == true
        entrada = (e.cuenta == nil && !cuentaPropia && !e.pausado) ? Vivo.cuentaDeEntrada(e.pasos, e.i, e.lecturas) : nil

        // ── la anotación del descanso de fuerza (I7) ─────────────────────
        var series: [VivoSerieAnotable] = []
        if descanso {
            for j in Vivo.seriesDelDescanso(e.pasos, e.i) {
                if let a = Vivo.anotacionDe(e.pasos, j, registro, medida: nil) { series.append(VivoSerieAnotable(paso: e.pasos[j], anot: a)) }
            }
        }
        seriesAnotables = series

        // ── la acción primaria (vocabulario cerrado) ─────────────────────
        if e.terminado { primaria = nil }
        else if s.currentBlockIsStructural { primaria = VivoPrimaria(clave: .hecho) }
        else if descanso, !series.isEmpty, series.contains(where: { Vivo.pendiente($0.anot) }) { primaria = VivoPrimaria(clave: .confirmar) }
        // El WOD decide sobre la del kit: «Hecho» marca (no cierra), «+1 ronda», «Guardar».
        else if p.wod != nil { primaria = Vivo.primariaWod(p, porDefecto: Vivo.clavePorDefecto(p), wod).map { VivoPrimaria(clave: $0) } }
        else if let c = Vivo.clavePorDefecto(p) { primaria = VivoPrimaria(clave: c) }
        else { primaria = nil }
    }
}
