import Foundation

// EL WOD EN LA MUÑECA: AMRAP, EMOM, For Time, Tabata y Death by (P12; espejo de `screens/reloj-wod/`).
// Cada formato contesta UNA pregunta y su cara la pone en el héroe:
//
//   EMOM       ¿cuánto queda de este minuto y qué hago en él?  Héroe = lo que queda de la ventana; debajo, la
//              tarea con su carga y lo que viene. «Hecho» NO cierra la ventana: la convierte en respiro.
//   AMRAP      ¿cuántas rondas llevo?  Héroe = las rondas, que cuentas tú («ronda hecha»); un AMRAP de UN
//              movimiento no tiene rondas que contar y su héroe es lo que queda. Las reps de la ronda a medias se
//              dicen en la campana, con la corona (`caraPuntuacion`).
//   For Time   el crono total ES la puntuación y no se va nunca (héroe), con el cap en el contexto.
//   Tabata     ¿trabajo o descanso y cuánto queda? Manda el reloj: sin acción, una marca por ronda.
//   Death by   ¿cuántas reps este minuto? Héroe = las reps de este minuto; el reloj te caza al cerrar uno sin marcar.
//
// Lo que el atleta marca (la ventana hecha, las rondas, la puntuación) vive en `EstadoWod` y lo guarda quien lleva la
// muñeca; aquí solo se LEE. Nada de esto decide cómo se pinta: lo hace la cara común (`caraDeFamilia`).

extension Vivo {

    // MARK: - Lo que la muñeca marca

    /// La acción del momento de un paso de WOD: la del kit, salvo el Tabata (manda el reloj, sin acción).
    static func clavePrimariaWod(_ p: Paso, _ w: EstadoWod) -> ClavePrimaria? {
        if case .pared? = p.wod { return nil }
        return primariaWod(p, porDefecto: clavePorDefecto(p), w)
    }

    /// La puntuación de partida en la campana: las rondas que contó la muñeca en el AMRAP anterior y las reps sin decir.
    static func dialDeCampana(_ e: EstadoVivo, _ w: EstadoWod) -> Dial {
        if let d = w.dial { return d }
        let amrap = e.pasos[..<e.i].last { if case .amrap? = $0.wod { return true } else { return false } }
        return Dial(rondas: amrap.map { w.rondas[$0.id]?.count ?? 0 } ?? 0, reps: nil)
    }

    // MARK: - La cara

    /// La cara de un paso de WOD, o `nil` si es lo común (un descanso, una recuperación).
    static func caraWod(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ w: EstadoWod, _ x: EntornoMuneca) -> CaraMuneca? {
        let p = e.paso
        switch p.wod {
        case let .puntuacion(tareas, duracionS)?: return .puntuacion(caraPuntuacion(e, l, tareas, duracionS, w, x.medidas))
        case .pared?: return .paso(caraPared(e, l, x))
        default: break
        }
        guard p.rol == .trabajo else { return nil }
        switch p.wod {
        case let .emom(tarea, _, _, ventanaS)?: return .paso(caraEmom(e, l, w, x, tarea: tarea, ventanaS: ventanaS))
        case let .amrap(tareas, duracionS)?: return .paso(caraAmrap(e, l, w, x, tareas: tareas, duracionS: duracionS))
        case let .fortime(tarea, capS)?:
            // La carrera de un For Time es la cara de correr con el total en el contexto, como en un circuito (P10).
            guard let tarea else { return .paso(caraCarreraConTotal(e, l, lam, x, cap: capS)) }
            return .paso(caraForTime(e, l, w, x, tarea: tarea, capS: capS))
        case .deathby?: return .paso(caraDeathBy(e, l, w, x))
        default: return nil
        }
    }

    // MARK: EMOM

    private static func caraEmom(_ e: EstadoVivo, _ l: Lecturas, _ w: EstadoWod, _ x: EntornoMuneca, tarea: Tarea, ventanaS: Double) -> CaraPaso {
        let p = e.paso
        let hecha = w.hechas[p.id]
        let falta = faltaDe(p, l) ?? 0
        var d = PartesDeCara(contexto: contextoDe(p),
                             heroe: HeroeVista(clase: .crono, texto: fmtReloj(falta.rounded(.up)), etiqueta: hecha != nil ? "respiro" : "quedan"))
        d.instruccion = hecha.map { "✓ \(tarea.nombre) en \(fmtReloj($0))" } ?? textoTarea(tarea, ventanaS: ventanaS)
        if case let .emom(siguiente, _, _, v)? = e.siguiente?.wod { d.luego = ("Luego ·", textoTareaCorto(siguiente, ventanaS: v)) }
        // La ventana entera en una máquina o en la cinta: lo que la máquina y la cinta dicen de ahora.
        if tarea.corre == true {
            d.segundo = LineaVista(valor: fmtRitmo(l.ritmo), unidad: "/km")
        } else if tarea.dosis == nil, let s = l.split500 {
            d.segundo = LineaVista(valor: fmtSplit(s, p.maquina), unidad: unidadSplit(p.maquina))
        }
        d.accion = clavePrimariaWod(p, w)?.rawValue
        d.pulso = lineaPulso(p, l, e.zonas, e.reglas)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    // MARK: AMRAP

    /// Lo que viene tras la campana de un AMRAP de un chipper: «Run · 800 m a RPE 8».
    private static func trasElAmrap(_ e: EstadoVivo) -> Paso? {
        guard let sig = e.siguiente else { return nil }
        let tras: Paso? = { if case .puntuacion? = sig.wod { return e.pasos.indices.contains(e.i + 2) ? e.pasos[e.i + 2] : nil } else { return sig } }()
        return tras?.rol == .trabajo ? tras : nil
    }

    private static func caraAmrap(_ e: EstadoVivo, _ l: Lecturas, _ w: EstadoWod, _ x: EntornoMuneca, tareas: [Tarea], duracionS: Double) -> CaraPaso {
        let p = e.paso
        let falta = fmtReloj((faltaDe(p, l) ?? 0).rounded(.up))
        let pulso = lineaPulso(p, l, e.zonas, e.reglas)
        let nombre = nombresFormatoDefecto.amrap
        // Un solo movimiento: nada que contar en vivo; manda lo que queda.
        if tareas.count == 1, let t = tareas.first {
            let ronda = p.posicion?.ronda.map { "Ronda \($0.n)/\($0.de)" }
            var d = PartesDeCara(contexto: [ronda, "\(nombre) \(fmtDuracion(duracionS))"].compactMap { $0 },
                                 heroe: HeroeVista(clase: .crono, texto: falta, etiqueta: "quedan"))
            d.instruccion = [t.nombre, cargaTarea(t)].compactMap { $0 }.joined(separator: " · ")
            d.bajo = "reps: al final, con la corona"
            d.luego = trasElAmrap(e).map { ("Luego ·", textoPasoCorto($0)) }
            d.pulso = pulso
            return caraDeFamilia(d, x.medidas, accion: x.accion)
        }
        let rondas = w.rondas[p.id] ?? []
        var d = PartesDeCara(contexto: [nombre, "quedan \(falta)"],
                             heroe: HeroeVista(clase: .crono, texto: String(rondas.count), unidad: rondas.count == 1 ? "ronda" : "rondas"))
        d.segundo = LineaVista(etiqueta: "ronda \(rondas.count + 1)", valor: fmtReloj(Swift.max(0, l.t - (rondas.last ?? 0))))
        if let ultima = rondas.last { d.bajo = "anterior · \(fmtReloj(ultima - (rondas.dropLast().last ?? 0)))" }
        d.accion = clavePrimariaWod(p, w)?.rawValue
        d.pulso = pulso
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    // MARK: La campana: la puntuación

    /// La puntuación del AMRAP: las rondas (contadas en vivo) y las reps de la ronda a medias, que se dicen con la
    /// corona. Lo que no se dice es «—», nunca 0. Un movimiento solo no tiene rondas: son las reps totales.
    private static func caraPuntuacion(_ e: EstadoVivo, _ l: Lecturas, _ tareas: [Tarea], _ duracionS: Double, _ w: EstadoWod, _ m: MedidasMuneca) -> CaraPuntuacion {
        let dial = dialDeCampana(e, w)
        let multi = tareas.count > 1
        let sinDecir = dial.reps == nil
        var texto: [String] = []
        if multi { texto.append((sinDecir || dial.reps == 0) ? "reps de la ronda \(dial.rondas + 1)" : desgloseReps(tareas, dial.reps ?? 0)) }
        texto.append(sinDecir ? "gira la corona" : "sin guardar")
        let notas = texto.map { notaVista($0, ancho: m.anchoUtil) }
        let pista = notaVista("doble toque · \(ClavePrimaria.guardar.rawValue)", ancho: m.anchoUtil)

        let reps = dial.reps.map(String.init) ?? "—"
        let heroe = multi ? HeroeVista(clase: .crono, texto: "\(dial.rondas) + \(reps)", etiqueta: "rondas + reps")
            : HeroeVista(clase: .crono, texto: reps, unidad: "reps", etiqueta: tareas.first?.nombre)
        var filas: [Fila] = [.contexto] + notas.map(filaDeNota)
        filas.append(filaDeNota(pista))
        filas.append(.tercero)
        return CaraPuntuacion(
            contexto: contextoQueCabe(["Puntuación", "\(nombresFormatoDefecto.amrap) \(fmtDuracion(duracionS))"], m),
            heroe: heroeMuneca(heroe, filas: filas, m),
            rondas: multi ? dial.rondas : nil,
            reps: dial.reps,
            notas: notas,
            pista: pista,
            // La campana es «deja de trabajar»: monocroma, como Recupera (P6).
            pulso: lineaDeDato(pulsoMonocromo(e.paso, l, e), cuerpo: TipoMuneca.tercero, ancho: m.anchoPie)
        )
    }

    // MARK: For Time

    private static func caraForTime(_ e: EstadoVivo, _ l: Lecturas, _ w: EstadoWod, _ x: EntornoMuneca, tarea: Tarea, capS: Double?) -> CaraPaso {
        let p = e.paso
        let ronda = p.posicion?.ronda
        let medido = tarea.mide != .atleta
        var quedan = "—"
        if let f = faltaDe(p, l) {
            let v = valorFalta(p, f)
            quedan = [v.texto, v.unidad].compactMap { $0 }.joined(separator: " ")
        }
        var d = PartesDeCara(contexto: [ronda.map { "Ronda \($0.n)/\($0.de)" } ?? nombresFormatoDefecto.fortime, capS.map { "cap \(fmtReloj($0))" }].compactMap { $0 },
                             heroe: HeroeVista(clase: .crono, texto: fmtReloj(totalDelBloque(e))))
        d.instruccion = medido ? "\(tarea.nombre) · quedan \(quedan)" : textoTarea(tarea)
        if let sig = e.siguiente { d.luego = ("Luego ·", textoViene(sig)) } else { d.bajo = "último movimiento" }
        // Lo que mide una máquina se cierra solo: nada que hacer con el dedo.
        d.accion = medido ? nil : clavePrimariaWod(p, w)?.rawValue
        d.pulso = lineaPulso(p, l, e.zonas, e.reglas)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    /// Un For Time que se corre (una contrarreloj de 5 km, o las carreras de un chipper): la cara de correr con el
    /// total, que es la puntuación, siempre debajo del contexto.
    private static func caraCarreraConTotal(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ x: EntornoMuneca, cap: Double?) -> CaraPaso {
        caraPaso(conRitmoConRpe(lam, l), e, l, x.medidas,
                 contexto: [nombresFormatoDefecto.fortime] + lam.contexto, total: lineaTotal(totalDelBloque(e), cap: cap))
    }

    /// Si el objetivo es un RPE («RPE 8 · ritmo de carrera») la palabra del coach habla de ritmo, y sin él no se puede
    /// cumplir: el ritmo ACTUAL va debajo.
    static func conRitmoConRpe(_ lam: Lamina, _ l: Lecturas) -> Lamina {
        guard lam.segundo == nil, lam.instruccion != nil else { return lam }
        var q = lam
        q.segundo = LineaVista(valor: fmtRitmo(l.ritmo), unidad: "/km")
        return q
    }

    // MARK: Death by

    private static func caraDeathBy(_ e: EstadoVivo, _ l: Lecturas, _ w: EstadoWod, _ x: EntornoMuneca) -> CaraPaso {
        let p = e.paso
        let hecha = w.hechas[p.id]
        let falta = fmtReloj((faltaDe(p, l) ?? 0).rounded(.up))
        var d = PartesDeCara(contexto: (posicionDeathBy(p) ?? contextoDe(p)) + ["quedan \(falta)"],
                             heroe: heroeDeathBy(p, hechaEn: hecha) ?? heroeDelPaso(p, l, e.zonas))
        d.bajo = ultimaVezDe(e.pasos, e.i, w.hechas).map { "la vez anterior · \(fmtReloj($0))" }
        d.luego = e.siguiente.flatMap(vieneDeathBy).map { ("Luego ·", $0) }
        d.accion = clavePrimariaWod(p, w)?.rawValue
        d.pulso = lineaPulso(p, l, e.zonas, e.reglas)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    // MARK: Tabata

    /// Trabajo y descanso en la misma cara: los dice la PALABRA encima del número, no un color (P6). La ronda de un
    /// descanso es la que acaba de terminar.
    private static func caraPared(_ e: EstadoVivo, _ l: Lecturas, _ x: EntornoMuneca) -> CaraPaso {
        let p = e.paso
        guard case let .pared(trabajoS, descansoS, rondas)? = p.wod else { return caraPaso(laminaDelPaso(p, l, e.zonas, e.reglas), e, l, x.medidas) }
        let trabajo = p.rol == .trabajo
        let ronda = trabajo ? (p.posicion?.ronda?.n ?? 1) : (anteriorTrabajo(e.pasos, e.i).flatMap { e.pasos[$0].posicion?.ronda?.n } ?? 0)
        let falta = (faltaDe(p, l) ?? 0).rounded(.up)
        var d = PartesDeCara(contexto: [trabajo ? "Ronda \(ronda)/\(rondas)" : "Quedan \(rondas - ronda) rondas", "\(fmtDuracion(trabajoS))/\(fmtDuracion(descansoS))"],
                             heroe: HeroeVista(clase: .falta, texto: fmtReloj(falta), etiqueta: trabajo ? "trabajo" : "descanso"))
        if trabajo {
            let texto = [p.nombre, principal(p).map { fmtObjetivo($0) }].compactMap { $0 }.joined(separator: " · ")
            d.instruccion = texto.isEmpty ? nil : texto
        } else if let sig = e.siguiente {
            d.luego = ("Viene:", "Ronda \(ronda + 1)/\(rondas) · \(sig.nombre ?? "")")
        }
        d.marcas = MarcasRonda(total: rondas, hechas: trabajo ? ronda - 1 : ronda, ahora: trabajo)
        d.pulso = trabajo ? lineaPulso(p, l, e.zonas, e.reglas) : pulsoMonocromo(p, l, e)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    // MARK: - Las páginas del WOD

    /// EMOM y death by: Paso → Estructura → Minutos → Datos; el AMRAP de varias tareas: Ronda → Tarea → Rondas → Datos;
    /// For Time y Tabata: Paso → Estructura → Datos.
    static func paginasDeWod(_ p: Paso) -> [PaginaMuneca] {
        switch p.wod {
        case .emom?, .deathby?: return [.paso, .estructura, .vueltas, .datos]
        case let .amrap(tareas, _)? where tareas.count > 1: return [.paso, .estructura, .vueltas, .datos]
        default: return [.paso, .estructura, .datos]
        }
    }

    /// La página Tarea de un AMRAP de varias tareas: las reps y la carga de la ronda, en la muñeca.
    static func paginaTareasDelAmrap(_ p: Paso) -> PaginaEstructuraMuneca? {
        guard case let .amrap(tareas, _)? = p.wod, tareas.count > 1 else { return nil }
        let filas = tareas.map { t in
            FilaLista(linea: [t.dosis.map { fmtPrescrito($0) }, t.nombre].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " "),
                      detalle: cargaTarea(t), estado: .pendiente)
        }
        return PaginaEstructuraMuneca(titulo: ["Ronda", "\(repsPorRonda(tareas)) reps"], filas: filas)
    }

    /// Las rondas del AMRAP o los minutos del EMOM y del death by, el último arriba; `nil` = otra familia.
    static func paginaVueltasWod(_ e: EstadoVivo, _ w: EstadoWod) -> PaginaVueltasMuneca? {
        let p = e.paso
        switch p.wod {
        case let .amrap(tareas, _)? where tareas.count > 1:
            let rondas = w.rondas[p.id] ?? []
            let filas = rondas.enumerated().map { k, cierre in FilaSplit(n: String(k + 1), valor: fmtReloj(cierre - (k > 0 ? rondas[k - 1] : 0))) }
            let media = rondas.last.map { $0 / Double(rondas.count) }
            let enCurso = FilaSplit(n: String(rondas.count + 1), valor: fmtReloj(Swift.max(0, e.lecturas.t - (rondas.last ?? 0))), detalle: palabraAhora)
            return PaginaVueltasMuneca(titulo: media.map { ["Rondas", "media \(fmtReloj($0))"] } ?? ["Rondas"], enCurso: enCurso,
                                       filas: Array(filas.reversed().prefix(3)), vacia: nil)
        case .emom?, .deathby?:
            let cuenta: (Paso) -> Int = { $0.posicion?.serie?.n ?? 0 }
            let pasados = e.pasos[..<e.i].filter { $0.origen?.segmento == p.origen?.segmento && $0.wod != nil && $0.rol == .trabajo }
            let filas = pasados.reversed().prefix(3).map { x in
                FilaSplit(n: String(cuenta(x)), valor: w.hechas[x.id].map { fmtReloj($0) } ?? "—", detalle: x.nombre)
            }
            let enCurso = FilaSplit(n: String(cuenta(p)), valor: fmtReloj(e.lecturas.t), detalle: palabraAhora)
            let hechos = pasados.filter { w.hechas[$0.id] != nil }.count
            let conTarea = pasados.filter { seMarca($0) }.count
            return PaginaVueltasMuneca(titulo: conTarea > 0 ? ["Minutos", "\(hechos)/\(conTarea) a tiempo"] : ["Minutos"], enCurso: enCurso,
                                       filas: Array(filas), vacia: nil)
        default: return nil
        }
    }

    /// Los Datos de la sesión: el total (del bloque, con el cap si lo hay), lo propio de cada formato y el pulso.
    static func filasDeDatosWod(_ e: EstadoVivo, _ l: Lecturas, _ w: EstadoWod) -> [FilaDatoVista] {
        let p = e.paso
        var filas: [FilaDatoVista]
        switch p.wod {
        case .fortime(_, let cap)?:
            let hechas = (p.posicion?.ronda?.n ?? 1) - 1
            filas = [FilaDatoVista(valor: fmtReloj(totalDelBloque(e)), unidad: cap.map { "de cap \(fmtReloj($0))" } ?? "total"),
                     FilaDatoVista(valor: String(hechas), unidad: hechas == 1 ? "ronda hecha" : "rondas hechas")]
        case .amrap?:
            let n = w.rondas[p.id]?.count ?? 0
            filas = [FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total"), FilaDatoVista(valor: String(n), unidad: n == 1 ? "ronda" : "rondas")]
        case .deathby?:
            let n = completosDeathBy(e.pasos, w.hechas)
            filas = [FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total"), FilaDatoVista(valor: String(n), unidad: n == 1 ? "minuto completo" : "minutos completos")]
        case .pared(_, _, let rondas)?:
            let hechas = e.pasos[..<e.i].filter { $0.rol == .trabajo && $0.origen?.segmento == p.origen?.segmento }.count
            filas = [FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total"), FilaDatoVista(valor: "\(hechas)/\(rondas)", unidad: "rondas hechas")]
        default:
            filas = [FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total")]
        }
        filas.append(filaDePulso(e, l))
        return filas
    }
}

// MARK: - Lo que la muñeca marca: los gestos sobre `EstadoWod`

extension Vivo.EstadoWod {

    /// «Hecho» en una ventana que se marca (EMOM, death by): la marca, no el cierre; `t` es el segundo de la ventana.
    mutating func marcar(_ p: Vivo.Paso, t: Double) { hechas[p.id] = t }

    mutating func desmarcar(_ p: Vivo.Paso) { hechas[p.id] = nil }

    /// «Ronda hecha» de un AMRAP: la ronda se cierra en el segundo `t` del paso.
    mutating func anotarRonda(_ p: Vivo.Paso, t: Double) { rondas[p.id, default: []].append(t) }

    /// Deshacer la última ronda anotada.
    mutating func quitarRonda(_ p: Vivo.Paso) { _ = rondas[p.id]?.popLast() }

    /// La corona en la campana: mueve las reps de la puntuación (arriba es «más»). Las reps de más de una ronda
    /// entera pasan a rondas.
    mutating func girarReps(_ dir: Int, _ e: Vivo.EstadoVivo) {
        let d = Vivo.dialDeCampana(e, self)
        dial = Vivo.girarPuntuacion(d, campo: .reps, delta: dir, porRonda: Vivo.repsPorRonda(Vivo.tareasAmrap(e.paso)))
    }
}
