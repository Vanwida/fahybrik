import Foundation

// EL PLAN DEL MOTOR, EN PASOS — la mitad estática del adaptador (I1 «un
// estado, dos pintores»): de `WorkoutPlan` (segmentos con su prescripción, tal
// como los pliega el motor de hoy) a la lista PLANA de `Vivo.Paso` que pintan
// el iPhone y la muñeca. No es un motor nuevo: cada paso lleva su `origen`
// (segmento + ventana del cursor del motor + si es el descanso que la sigue),
// y `Vivo.EstadoVivo(sesion:)` lo usa para decir cuál es el paso vivo.
//
// Lo que el motor de hoy no modela (M1–M8 del modelo de la muñeca: dos
// objetivos, modo de recuperación, entorno, tandas anidadas…) se rellena con
// el defecto honesto (nil), nunca se inventa.

extension Vivo {

    struct PlanVivo: Equatable {
        var pasos: [Paso]
        var zonas: ZonasCoach?
        var reglas: ReglasAviso = Vivo.reglasAvisoDefecto
    }

    // MARK: - De HRZoneProfile a las zonas del coach

    static func zonasDe(_ perfil: HRZoneProfile?) -> ZonasCoach? {
        guard let perfil, !perfil.zones.isEmpty else { return nil }
        return ZonasCoach(techos: perfil.zones.map { Double($0.maxBpm) }, nombres: perfil.zones.map(\.label))
    }

    // MARK: - El plan entero

    /// `test`: la sesión es una prueba (una marca): un paso suelto de máquina o de
    /// correr se marca como test, y la cabecera lo dice. `metodo`: hacia qué lado avisa
    /// un objetivo (`Vivo+SentidoAviso.swift`), dato del coach con defecto.
    static func planDe(_ plan: WorkoutPlan, zonas: HRZoneProfile?, entorno: RunEnvironment?, test: Bool = false, metodo: MetodoAviso = .defecto) -> PlanVivo {
        var pasos: [Paso] = []
        // La letra de cada superserie, en orden de sesión: A1/A2, luego B1/B2 (529).
        var superseries = 0
        for (s, seg) in plan.segments.enumerated() {
            let letra = letraDeSuperserie(superseries)
            if seg.usesMultiSetStrength, seg.supersetSlots != nil { superseries += 1 }
            let propios = pasosDe(seg, indice: s, entorno: entorno, test: test, ultimo: s == plan.segments.count - 1, letra: letra)
            // Dobles: la estación de la pareja es un relevo; la tuya o la repartida llevan su turno.
            pasos.append(contentsOf: doblesDe(seg).map { conDobles(propios, $0, segmento: s) } ?? propios)
        }
        // Un bloque continuo remo → ski → bici son N tramos de una pieza (familia circuito).
        marcarTramosContinuos(&pasos) { s in plan.segments[s].formatScheme?.presentation == .continuous }
        return PlanVivo(pasos: conSentidoDeAviso(pasos, metodo), zonas: zonasDe(zonas))
    }

    // MARK: - Un segmento → sus pasos

    /// «A», «B», … «Z», y después «AA»: la letra de la superserie número `n` (base 0).
    static func letraDeSuperserie(_ n: Int) -> String {
        let abc = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        return n < abc.count ? String(abc[n]) : String(repeating: String(abc[n % abc.count]), count: n / abc.count + 1)
    }

    /// `ultimo`: el segmento cierra el plan (tras él, el motor espera: ahí cabe la puntuación del AMRAP).
    static func pasosDe(_ seg: WorkoutSegment, indice s: Int, entorno: RunEnvironment?, test: Bool = false, ultimo: Bool = false, letra: String = "A") -> [Paso] {
        let fase = faseDe(seg.blockPhase)
        let bloque = seg.blockPosition ?? s
        if let legs = seg.runStructureLegs, !legs.isEmpty {
            return pasosDePiernas(legs, seg: seg, s: s, fase: fase, bloque: bloque, entorno: entorno)
        }
        if let plan = seg.emomPlan {
            return pasosDeEmom(plan, seg: seg, s: s, fase: fase, bloque: bloque, entorno: entorno)
        }
        // Un test (una marca) es UNA pieza: aunque el bloque venga como For Time, no es una ruta.
        if test, seg.declaredComponents.count <= 1, !seg.usesMultiSetStrength {
            return [pasoSuelto(seg, s: s, fase: fase, bloque: bloque, entorno: entorno, test: true)]
        }
        if seg.isConditioningTimer, let scheme = seg.formatScheme {
            return pasosDeReloj(scheme, seg: seg, s: s, fase: fase, bloque: bloque, entorno: entorno, ultimo: ultimo)
        }
        if seg.usesMultiSetStrength, let sets = seg.prescription?.sets, !sets.isEmpty {
            return pasosDeSeries(sets, seg: seg, s: s, fase: fase, bloque: bloque, letra: letra)
        }
        return [pasoSuelto(seg, s: s, fase: fase, bloque: bloque, entorno: entorno, test: test)]
    }

    // MARK: - Piezas comunes

    private static func faseDe(_ f: BlockPhase) -> Fase {
        switch f {
        case .warmup: return .calentamiento
        case .cooldown: return .vuelta
        case .principal, .main: return .principal
        }
    }

    private static func entornoDe(_ e: RunEnvironment?) -> Entorno? {
        guard let e else { return nil }
        switch e {
        case .treadmill, .indoor: return .cinta
        case .outdoor: return .calle
        }
    }

    /// Con cinta conectada la mide la cinta; en una cinta sin conexión, nadie («lo dices tú»); en la calle, el GPS.
    private static func mideCorrer(_ e: RunEnvironment?) -> QuienMide {
        switch e {
        case .treadmill?: return .cinta
        case .indoor?: return .atleta
        default: return .gps
        }
    }

    private static func maquinaDe(_ m: PrescriptionModality?, ergKind: String? = nil) -> Maquina? {
        let mod = ergKind.flatMap(PrescriptionModality.init(rawValue:)) ?? m
        switch mod {
        case .row: return Maquina(tipo: .remo)
        case .ski: return Maquina(tipo: .ski)
        case .bike: return Maquina(tipo: .bici)
        default: return nil
        }
    }

    /// De la medida del motor a la del paso. `mide` según quién la cuenta.
    private static func medidaDe(_ m: Measure?, modalidad: PrescriptionModality?, entorno: RunEnvironment?) -> Medida {
        let quien: QuienMide
        switch modalidad {
        case .run: quien = mideCorrer(entorno)
        case .row, .ski, .bike: quien = .ergo
        default: quien = .atleta
        }
        switch m {
        case let .reps(v, _)?: return Medida(tipo: .reps, prescrito: Double(v), mide: .atleta)
        case let .distance(mt, _)?: return Medida(tipo: .distancia, prescrito: mt, mide: quien == .atleta ? .atleta : quien)
        // En una máquina el tiempo también lo lleva su monitor: sus lecturas (el /500,
        // las paladas) son del paso aunque lo cierre el reloj (espejo de planes.ts).
        case let .duration(sec, _)?: return Medida(tipo: .tiempo, prescrito: Double(sec), mide: quien == .ergo ? .ergo : .reloj)
        case let .calories(c, _)?: return Medida(tipo: .cal, prescrito: Double(c), mide: quien == .ergo ? .ergo : .atleta)
        case .repsToFailure?: return Medida(tipo: .abierta, prescrito: nil, mide: .atleta)
        default: return Medida(tipo: .abierta, prescrito: nil, mide: .atleta)
        }
    }

    /// Un objetivo del motor → objetivos del paso (0–2, M1). La carga de fuerza
    /// NO va aquí: va en la ficha.
    private static func objetivosDe(_ t: Target?, zona: HRZone? = nil, ritmoSKm: Int? = nil, vatios: Int? = nil, rpe: Double? = nil, maquina: Maquina?) -> [Objetivo] {
        var out: [Objetivo] = []
        switch t {
        case let .pace(unit, v, mn, mx)?:
            // En una máquina el dato viaja en s/500 m (la bici se ENSEÑA por 1000:
            // `fmtSplit`); el coach puede escribirlo por km o por milla.
            let enMaquina = maquina != nil
            let factor: Double
            switch unit {
            case .per500m: factor = 1
            case .perKm: factor = enMaquina ? 0.5 : 1
            case .perMile: factor = enMaquina ? 500 / 1609.344 : 1 / 1.609344
            }
            let eje: EjeObjetivo = (unit == .per500m || enMaquina) ? .split500 : .ritmo
            let lo = (v ?? mn).map { Double($0) * factor }
            let hi = (v ?? mx ?? mn).map { Double($0) * factor }
            if lo != nil || hi != nil { out.append(Objetivo(eje: eje, min: lo, max: hi, papel: .principal)) }
        case let .hrZone(v, mn, mx)?:
            let lo = v ?? mn, hi = v ?? mx ?? mn
            if lo != nil || hi != nil { out.append(Objetivo(eje: .zona, min: lo, max: hi, papel: .principal)) }
        case let .hrBpm(v, mn, mx)?:
            let lo = v ?? mn, hi = v ?? mx
            if lo == nil, let hi { out.append(Objetivo(eje: .ppm, min: nil, max: hi, papel: .techo)) }
            else if lo != nil || hi != nil { out.append(Objetivo(eje: .ppm, min: lo, max: hi ?? lo, papel: .principal)) }
        case let .rpe(v, mn, mx)?:
            let lo = v ?? mn, hi = v ?? mx ?? mn
            if lo != nil || hi != nil { out.append(Objetivo(eje: .rpe, min: lo, max: hi, papel: .principal)) }
        case let .rir(v, mn, mx)?:
            let lo = v ?? mn, hi = v ?? mx ?? mn
            if lo != nil || hi != nil { out.append(Objetivo(eje: .rir, min: lo, max: hi, papel: .principal)) }
        case let .watts(v, mn, mx)?:
            let lo = v ?? mn, hi = v ?? mx ?? mn
            if lo != nil || hi != nil { out.append(Objetivo(eje: .potencia, min: lo, max: hi, papel: .principal)) }
        default: break
        }
        if out.isEmpty, let z = zona { out.append(Objetivo(eje: .zona, min: Double(z.rawValue), max: Double(z.rawValue), papel: .principal)) }
        if out.isEmpty, let r = ritmoSKm, r > 0 {
            out.append(Objetivo(eje: maquina != nil ? .split500 : .ritmo, min: Double(r), max: Double(r), papel: .principal))
        }
        if out.isEmpty, let w = vatios, w > 0 { out.append(Objetivo(eje: .potencia, min: Double(w), max: Double(w), papel: .principal)) }
        if out.isEmpty, let rpe { out.append(Objetivo(eje: .rpe, min: rpe, max: rpe, papel: .principal)) }
        return out
    }

    private static func cargaDe(_ t: Target?) -> Carga? {
        if case let .kg(v, mn, _, n)? = t, let kg = v ?? mn { return Carga(kg: kg, implementos: n) }
        return nil
    }

    private static func tempoDe(_ s: String?) -> Tempo? {
        guard let s else { return nil }
        let partes = s.split(whereSeparator: { $0 == "-" || $0 == "/" || $0 == " " }).compactMap { Int($0) }
        guard partes.count >= 3 else { return nil }
        return Tempo(excentrica: partes[0], pausaAbajo: partes[1], concentrica: partes[2], pausaArriba: partes.count > 3 ? partes[3] : 0)
    }

    private static func tareaDe(_ set: PrescriptionSet?, nombre: String, seg: WorkoutSegment, entorno: RunEnvironment?) -> Tarea {
        let mod = set?.modality ?? seg.resolvedModality
        let medida = medidaDe(set?.measure ?? seg.scalarMeasure, modalidad: mod, entorno: entorno)
        var corporal: Bool? = nil
        if case .bodyweight? = set?.target { corporal = true }
        return Tarea(nombre: nombre, dosis: medida.tipo == .abierta ? nil : medida, carga: cargaDe(set?.target), corporal: corporal,
                     mide: medida.mide, corre: mod == .run ? true : nil)
    }

    private static func descanso(_ segundos: Int, id: String, fase: Fase, bloque: Int, origen: Origen, wod: InfoWod? = nil, posicion: Posicion? = nil) -> Paso {
        Paso(id: id, clase: .descanso, rol: .descanso, fase: fase, medida: Medida(tipo: .tiempo, prescrito: Double(segundos), mide: .reloj),
             posicion: posicion, cierre: .medida, bloque: bloque, wod: wod, origen: origen)
    }

    // MARK: - A · La carrera estructurada (piernas)

    private static func pasosDePiernas(_ legs: [RunLeg], seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, entorno: RunEnvironment?) -> [Paso] {
        let trabajoPrincipal = legs.filter { $0.isWork && $0.phaseRole == .main }.count
        var serieN = 0
        let medidas: [Medida] = legs.map { leg in
            switch leg.measure {
            case let .distance(m): return Medida(tipo: .distancia, prescrito: Double(m), mide: mideCorrer(entorno))
            case let .duration(sec): return Medida(tipo: .tiempo, prescrito: Double(sec), mide: .reloj)
            case .unknown: return Medida(tipo: .abierta, prescrito: nil, mide: mideCorrer(entorno))
            }
        }
        let objetivosDeLeg: [[Objetivo]] = legs.map { leg in
            var objetivos: [Objetivo] = []
            switch leg.runTarget {
            case let .pace(t):
                if let v = t.single { objetivos.append(Objetivo(eje: .ritmo, min: Double(v), max: Double(v), papel: .principal)) }
                else if t.hasBand { objetivos.append(Objetivo(eje: .ritmo, min: t.fastS.map(Double.init), max: t.slowS.map(Double.init), papel: .principal)) }
            case let .zone(z):
                objetivos.append(Objetivo(eje: .zona, min: Double(z.rawValue), max: Double(z.rawValue), papel: .principal))
            case .none:
                if case let .rpe(v, mn, mx)? = leg.target, let lo = v ?? mn { objetivos.append(Objetivo(eje: .rpe, min: lo, max: v ?? mx ?? lo, papel: .principal)) }
            }
            if let incl = leg.inclinePct, incl > 0 { objetivos.append(Objetivo(eje: .inclinacion, min: incl, max: incl, papel: .secundario)) }
            return objetivos
        }
        // Con gramática, la posición y la clase salen de sus «repetir» (`Vivo+Correr.swift`).
        let nombres = nombresDePiernas(legs, estructura: seg.prescription?.structure, medidas: medidas, objetivos: objetivosDeLeg)
        return legs.enumerated().map { k, leg in
            let faseLeg: Fase = leg.phaseRole == .warmup ? .calentamiento : leg.phaseRole == .cooldown ? .vuelta : .principal
            let medida = medidas[k]
            let objetivos = objetivosDeLeg[k]
            var posicion: Posicion? = nil
            var clase: Clase
            var rol: Rol = .trabajo
            var modo: ModoRecupera? = nil
            if leg.isRecovery {
                rol = .recuperacion
                clase = .recuperacion
                switch leg.recoveryMode {
                case .caminar?: modo = .andar
                case .parado?: modo = .parado
                default: modo = .trote
                }
                if nombres?[k]?.clase == .descansoTandas { clase = .descansoTandas }
            } else if faseLeg == .calentamiento {
                clase = .calentamiento
            } else if faseLeg == .vuelta {
                clase = .vueltaCalma
            } else if let n = nombres?[k] {
                clase = n.clase
                posicion = n.posicion
            } else if trabajoPrincipal > 1 {
                serieN += 1
                clase = .series
                posicion = Posicion(serie: Contador(n: serieN, de: trabajoPrincipal))
            } else {
                clase = claseContinua(medida, objetivos)
            }
            return Paso(id: "s\(s)-l\(k)", clase: clase, rol: rol, fase: faseLeg, medida: medida, objetivos: objetivos, posicion: posicion,
                        modoRecupera: modo, entorno: entornoDe(entorno),
                        cierre: medida.tipo == .abierta ? .atleta : .medida,
                        vueltaAutoM: (clase == .rodaje || clase == .tirada) ? 1000 : nil, bloque: bloque,
                        origen: Origen(segmento: s, ventana: .pierna(k)))
        }
    }

    // MARK: - B · El EMOM

    private static func pasosDeEmom(_ plan: EmomPlan, seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, entorno: RunEnvironment?) -> [Paso] {
        let sets = seg.prescription?.sets ?? []
        // «Row 1′» en un EMOM de 1′ es la ventana entera: «Row · todo el minuto», sin dosis que acabar antes que el reloj.
        func tareaEmom(_ set: PrescriptionSet?, _ nombre: String) -> Tarea {
            var t = tareaDe(set, nombre: nombre, seg: seg, entorno: entorno)
            if t.dosis?.tipo == .tiempo, t.dosis?.prescrito == Double(plan.intervalSeconds) { t.dosis = nil }
            if t.dosis == nil, maquinaDe(set?.modality ?? seg.resolvedModality) != nil { t.mide = .ergo }
            return t
        }
        let ciclo: [Tarea] = sets.isEmpty ? [tareaEmom(nil, seg.primaryMovement)]
            : sets.enumerated().map { i, set in tareaEmom(set, plan.interval(i)?.movement ?? seg.primaryMovement) }
        var out: [Paso] = []
        for i in 0..<plan.intervalCount {
            let set = seg.rotationSet(at: i)
            let tarea = tareaEmom(set, plan.interval(i)?.movement ?? seg.primaryMovement)
            let mod = set?.modality ?? seg.resolvedModality
            let maquina = maquinaDe(mod, ergKind: sets.isEmpty ? seg.ergKind : nil)
            out.append(Paso(id: "s\(s)-e\(i)", clase: .emom, rol: .trabajo, fase: fase,
                            medida: Medida(tipo: .tiempo, prescrito: Double(plan.workSeconds), mide: .reloj),
                            objetivos: objetivosDe(set?.target, maquina: maquina).filter { $0.eje != .rpe && $0.eje != .rir && $0.eje != .kg && $0.eje != .pctRM },
                            posicion: Posicion(serie: Contador(n: i + 1, de: plan.intervalCount)),
                            nombre: tarea.nombre, entorno: mod == .run ? entornoDe(entorno) : nil, carga: tarea.carga, maquina: maquina,
                            cierre: .atleta, bloque: bloque,
                            wod: .emom(tarea: tarea, ciclo: ciclo, ventanas: plan.intervalCount, ventanaS: Double(plan.intervalSeconds)),
                            origen: Origen(segmento: s, ventana: .emom(i))))
            if plan.hasTransition, i + 1 < plan.intervalCount {
                out.append(descanso(plan.restSeconds, id: "s\(s)-e\(i)-r", fase: fase, bloque: bloque,
                                    origen: Origen(segmento: s, ventana: .emom(i), descanso: true)))
            }
        }
        return out
    }

    // MARK: - C · Los formatos con reloj (AMRAP, For Time, rondas, tabata, death by, continuo)

    private static func pasosDeReloj(_ scheme: PrescriptionScheme, seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, entorno: RunEnvironment?, ultimo: Bool = false) -> [Paso] {
        let sets = seg.prescription?.sets ?? []
        let componentes = seg.declaredComponents
        switch scheme {
        case .amrap:
            let tareas = componentes.enumerated().map { i, c in tareaDe(i < sets.count ? sets[i] : nil, nombre: c.name, seg: seg, entorno: entorno) }
            let d = Double(seg.formatTotalSeconds ?? 0)
            let nombre = tareas.count == 1 ? tareas.first?.nombre : nil
            // La máquina del AMRAP: la del bloque o, en uno mixto, la de la tarea que va en máquina (el 250 m Row).
            let maquina = maquinaDe(seg.resolvedModality, ergKind: seg.ergKind) ?? sets.lazy.compactMap { maquinaDe($0.modality) }.first
            var out = [Paso(id: "s\(s)", clase: .amrap, rol: .trabajo, fase: fase,
                            medida: Medida(tipo: .tiempo, prescrito: d > 0 ? d : nil, mide: .reloj),
                            nombre: nombre, maquina: maquina,
                            cierre: d > 0 ? .medida : .atleta, bloque: bloque,
                            wod: .amrap(tareas: tareas, duracionS: d),
                            origen: Origen(segmento: s, ventana: .segmento))]
            // LA CAMPANA: la puntuación (rondas + reps) se dice al acabar. Solo cuando
            // el AMRAP cierra el plan: ahí el motor espera; en medio, pasa al bloque
            // siguiente y la puntuación queda la que contó (M: el motor no para).
            if ultimo, d > 0 {
                out.append(Paso(id: "s\(s)-p", clase: .amrap, rol: .transicion, fase: fase,
                                medida: Medida(tipo: .abierta, prescrito: nil, mide: .atleta),
                                nombre: nombre, cierre: .atleta, bloque: bloque,
                                wod: .puntuacion(tareas: tareas, duracionS: d),
                                origen: Origen(segmento: s, ventana: .segmento, puntuacion: true)))
            }
            return out

        case .tabata, .intervals:
            let rondas = Swift.max(1, seg.formatRounds ?? 1)
            let trabajoS = seg.formatWorkSeconds
            let descansoS = seg.formatRestSeconds ?? 0
            let esPared = scheme == .tabata
            var out: [Paso] = []
            for r in 0..<rondas {
                let set = seg.rotationSet(at: r)
                let mod = set?.modality ?? seg.resolvedModality
                let maquina = maquinaDe(mod, ergKind: seg.ergKind)
                var medida = medidaDe(set?.measure, modalidad: mod, entorno: entorno)
                if medida.tipo == .abierta || (medida.tipo == .reps && esPared), let w = trabajoS {
                    medida = Medida(tipo: .tiempo, prescrito: Double(w), mide: .reloj)
                }
                let nombre = seg.rotationTramo(segmentIndex: s, cursor: .conditioningRound(r), index: r, boxedSeconds: nil).label
                let wod: InfoWod? = esPared ? .pared(trabajoS: Double(trabajoS ?? 20), descansoS: Double(descansoS), rondas: rondas) : nil
                out.append(Paso(id: "s\(s)-r\(r)", clase: mod == .run && !esPared ? .series : esPared ? .series : (maquina != nil ? .ergo : .series),
                                rol: .trabajo, fase: fase, medida: medida,
                                objetivos: objetivosDe(set?.target ?? seg.prescription?.target, zona: seg.targetZone, ritmoSKm: seg.targetPaceSecondsPerKm, vatios: seg.targetPowerWatts, maquina: maquina),
                                posicion: esPared ? Posicion(ronda: Contador(n: r + 1, de: rondas)) : Posicion(serie: Contador(n: r + 1, de: rondas)),
                                nombre: esPared ? nombre : (maquina != nil ? nombreDeBox(nombre, maquina) : (mod == .run ? nil : nombre)),
                                entorno: mod == .run ? entornoDe(entorno) : nil, carga: cargaDe(set?.target), maquina: maquina,
                                cierre: medida.tipo == .tiempo || medida.mide == .ergo || (medida.mide == .gps || medida.mide == .cinta) ? .medida : .atleta,
                                bloque: bloque, wod: wod, origen: Origen(segmento: s, ventana: .ronda(r))))
                if descansoS > 0, r + 1 < rondas {
                    if esPared {
                        out.append(descanso(descansoS, id: "s\(s)-r\(r)-d", fase: fase, bloque: bloque,
                                            origen: Origen(segmento: s, ventana: .ronda(r), descanso: true), wod: wod))
                    } else {
                        // Entre series se RECUPERA: trotando si se corre, parado en la máquina (M2).
                        out.append(Paso(id: "s\(s)-r\(r)-d", clase: .recuperacion, rol: .recuperacion, fase: fase,
                                        medida: Medida(tipo: .tiempo, prescrito: Double(descansoS), mide: .reloj),
                                        modoRecupera: mod == .run ? .trote : .parado, entorno: mod == .run ? entornoDe(entorno) : nil,
                                        cierre: .medida, bloque: bloque,
                                        origen: Origen(segmento: s, ventana: .ronda(r), descanso: true)))
                    }
                }
            }
            return out

        case .deathBy:
            let tarea = tareaDe(sets.first, nombre: seg.primaryMovement, seg: seg, entorno: entorno)
            let escalera = EscaleraDeathBy(inicio: seg.deathByStart, incremento: seg.deathByIncrement,
                                           ventanaS: Double(seg.formatWorkSeconds ?? 60), tope: seg.formatRounds)
            return minutosDeathBy(tarea, escalera, id: { "s\(s)-r\($0)" }, bloque: bloque, origen: { Origen(segmento: s, ventana: .ronda($0)) })

        case .steady:
            return [pasoSuelto(seg, s: s, fase: fase, bloque: bloque, entorno: entorno)]

        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            return pasosDeRuta(scheme, seg: seg, s: s, fase: fase, bloque: bloque, entorno: entorno)

        default:
            return [pasoSuelto(seg, s: s, fase: fase, bloque: bloque, entorno: entorno)]
        }
    }

    /// Una lista FIJA: estaciones (una ruta) o rondas de una misma cosa.
    private static func pasosDeRuta(_ scheme: PrescriptionScheme, seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, entorno: RunEnvironment?) -> [Paso] {
        let componentes = seg.declaredComponents
        let cap = seg.formatTotalSeconds.map(Double.init)
        let esForTime = scheme == .forTime || scheme == .chipper || scheme == .ladder
        // Los descansos son los que el MOTOR aplica (`beginFixedRest`): al cerrar
        // una ronda entera, el del bloque; entre estaciones, el de cada set.
        let restBloque = seg.prescription?.restS ?? 0
        var out: [Paso] = []

        func estacion(k: Int, set: PrescriptionSet?, nombre: String, posicion: Posicion?, ventana: Origen.Ventana, roxzone: SentidoRoxzone? = nil) -> Paso {
            // La Roxzone que el coach escribe en la lista: un paso propio, abierto,
            // que se cierra con un toque («Empiezo», «Salgo a correr»). El motor no
            // detecta que vuelves a correr: no se finge.
            if let roxzone {
                return Paso(id: "s\(s)-t\(k)", clase: .roxzone, rol: .transicion, fase: fase,
                            medida: Medida(tipo: .abierta, prescrito: nil, mide: .atleta), posicion: posicion, nombre: nombre,
                            cierre: .atleta, bloque: bloque, roxzone: roxzone, origen: Origen(segmento: s, ventana: ventana))
            }
            let mod = set?.modality ?? seg.resolvedModality
            let maquina = maquinaDe(mod, ergKind: componentes.count <= 1 ? seg.ergKind : nil)
            let medida = medidaDe(set?.measure ?? (componentes.count <= 1 ? seg.scalarMeasure : nil), modalidad: mod, entorno: entorno)
            let corre = mod == .run
            let tarea = tareaDe(set, nombre: nombre, seg: seg, entorno: entorno)
            let cierra: Cierre = (medida.tipo == .tiempo || medida.mide == .ergo || (corre && medida.tipo == .distancia)) ? .medida : .atleta
            return Paso(id: "s\(s)-t\(k)", clase: corre ? .carrera : .estacion, rol: .trabajo, fase: fase, medida: medida,
                        objetivos: objetivosDe(set?.target, maquina: maquina).filter { $0.eje != .kg && $0.eje != .pctRM },
                        posicion: posicion, nombre: nombre, entorno: corre ? entornoDe(entorno) : nil,
                        carga: cargaDe(set?.target), maquina: maquina, cierre: cierra, bloque: bloque,
                        // La carrera de un For Time es un paso de correr (P10): sin tarea, se dice «Run · 800 m».
                        wod: esForTime ? .fortime(tarea: corre ? nil : tarea, capS: cap) : nil,
                        origen: Origen(segmento: s, ventana: ventana))
        }

        if seg.fixedListIsStations {
            let n = Swift.max(1, componentes.count)
            let rondas = Swift.max(1, seg.formatRounds ?? 1)
            let hyrox = scheme == .hyroxSim && rondas == 1
            // La familia circuito (rondas, HYROX): el Run no es estación, la Roxzone
            // es su paso, y en una lista «Run · estación · Run…» cada Run abre ronda.
            let circuito = formatoCircuitoDe(scheme) != nil
            let corre = (0..<n).map { (seg.rotationSet(at: $0)?.modality ?? seg.resolvedModality) == .run }
            let rox = (0..<n).map { circuito && componentes.indices.contains($0) && esRoxzone(componentes[$0].name) }
            let porCarrera = circuito && rondas == 1 ? posicionesPorCarrera(corre: corre, roxzone: rox, hyrox: hyrox) : nil
            let enRonda = circuito ? estacionesDeRonda(corre: corre, roxzone: rox) : []
            for r in 0..<rondas {
                for j in 0..<n {
                    let k = r * n + j
                    let set = seg.rotationSet(at: j)
                    var pos = Posicion()
                    if let porCarrera {
                        pos = porCarrera[j]
                    } else if circuito, corre.contains(true) || rox.contains(true) {
                        if rondas > 1 { pos.ronda = Contador(n: r + 1, de: rondas) }
                        pos.estacion = enRonda[j]
                    } else if hyrox {
                        let mitad = Swift.max(1, n / 2)
                        pos.ronda = Contador(n: j / 2 + 1, de: mitad)
                        if j % 2 == 1 { pos.estacion = Contador(n: j / 2 + 1, de: mitad) }
                    } else {
                        if rondas > 1 { pos.ronda = Contador(n: r + 1, de: rondas) }
                        pos.estacion = Contador(n: j + 1, de: n)
                    }
                    out.append(estacion(k: k, set: set, nombre: componentes[j].name, posicion: pos, ventana: .estacion(k),
                                        roxzone: rox.indices.contains(j) && rox[j] ? sentidoRoxzone(j, corre: corre) : nil))
                    let ultimaDeRonda = j == n - 1
                    let ultima = k == rondas * n - 1
                    let restSet = set?.restS ?? 0
                    let rest = (rondas > 1 && ultimaDeRonda) ? restBloque : restSet
                    if rest > 0, !ultima {
                        // En un circuito el descanso dice de qué ronda (y estación) viene.
                        out.append(descanso(rest, id: "s\(s)-t\(k)-d", fase: fase, bloque: bloque,
                                            origen: Origen(segmento: s, ventana: .estacion(k + 1), descanso: true),
                                            posicion: circuito ? pos : nil))
                    }
                }
            }
            return out
        }

        // Rondas de una misma cosa (o una sola estación): el cursor del motor es el segmento y la ronda, `fixedRoundsDone`.
        let total: Int
        switch scheme {
        case .chipper: total = Swift.max(1, componentes.count)
        default: total = Swift.max(1, seg.formatRounds ?? componentes.count)
        }
        for k in 0..<total {
            let set = seg.rotationSet(at: k)
            let nombre = seg.rotationTramo(segmentIndex: s, cursor: .conditioningRound(k), index: k, boxedSeconds: nil).label
            let pos: Posicion? = total > 1 ? Posicion(ronda: Contador(n: k + 1, de: total)) : nil
            out.append(estacion(k: k, set: set, nombre: nombre, posicion: pos, ventana: .ronda(k)))
            let rest = set?.restS ?? restBloque
            if rest > 0, k + 1 < total {
                out.append(descanso(rest, id: "s\(s)-t\(k)-d", fase: fase, bloque: bloque,
                                    origen: Origen(segmento: s, ventana: .ronda(k + 1), descanso: true)))
            }
        }
        return out
    }

    // MARK: - D · La fuerza por series (y la superserie)

    /// `rmKg`: la RM que el servidor resolvió para el ejercicio de esta serie (`FichaDeSerie`).
    private static func fichaDe(_ set: PrescriptionSet, seg: WorkoutSegment, ejercicio: String, rmKg: Double? = nil) -> FichaFuerza {
        var carga: CargaFuerza
        switch set.target {
        case let .kg(v, mn, mx, _)?:
            let lo = v ?? mn ?? 0
            carga = .kg(min: lo, max: v ?? mx ?? lo)
        case let .percentRM(v, mn, mx)?:
            let lo = v ?? mn ?? 0
            let hi = v ?? mx ?? lo
            // La RM resuelta por el servidor llega como kilos del segmento (`loadKg` = minKg del %): se deshace la regla de tres, no se inventa.
            var rm: Double? = rmKg
            if rm == nil, let kg = seg.loadKg, lo > 0, seg.usesMultiSetStrength, !seg.isSuperset { rm = kg / lo * 100 }
            carga = .rm(pctMin: lo, pctMax: hi, rmKg: rm)
        case .bodyweight?:
            carga = .corporal
        default:
            carga = .tuya(ultimaKg: nil, lastre: false)
        }
        var esfuerzo: EsfuerzoFuerza? = nil
        for t in [set.target, seg.prescription?.target] {
            if esfuerzo != nil { break }
            switch t {
            case let .rir(v, mn, mx)?: if let lo = v ?? mn { esfuerzo = EsfuerzoFuerza(eje: .rir, min: lo, max: v ?? mx ?? lo) }
            case let .rpe(v, mn, mx)?: if let lo = v ?? mn { esfuerzo = EsfuerzoFuerza(eje: .rpe, min: lo, max: v ?? mx ?? lo) }
            default: break
            }
        }
        if esfuerzo == nil, let rpe = seg.targetRpe { esfuerzo = EsfuerzoFuerza(eje: .rpe, min: rpe, max: rpe) }
        return FichaFuerza(ejercicio: ejercicio, carga: carga, esfuerzo: esfuerzo, aproximacion: set.isApproach ?? false)
    }

    private static func pasosDeSeries(_ sets: [PrescriptionSet], seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, letra: String = "A") -> [Paso] {
        let slots = seg.supersetSlots
        var movimientos: [String] = []
        if let slots { for sl in slots where !movimientos.contains(sl.movement) { movimientos.append(sl.movement) } }
        var out: [Paso] = []
        for (k, set) in sets.enumerated() {
            let slot = slots.flatMap { $0.indices.contains(k) ? $0[k] : nil }
            let nombre = slot?.movement ?? seg.title
            var pos = Posicion()
            if let slot {
                pos.slot = "\(letra)\((movimientos.firstIndex(of: slot.movement) ?? 0) + 1)"
                pos.serie = Contador(n: slot.round, de: slot.rounds)
            } else {
                pos.serie = Contador(n: k + 1, de: sets.count)
            }
            let medida: Medida
            switch set.measure {
            case let .duration(sec, _)?: medida = Medida(tipo: .tiempo, prescrito: Double(sec), mide: .reloj)
            case let .reps(v, _)?: medida = Medida(tipo: .reps, prescrito: Double(v), mide: .atleta)
            case .repsToFailure?: medida = Medida(tipo: .abierta, prescrito: nil, mide: .atleta)
            default: medida = Medida(tipo: .reps, prescrito: seg.targetReps.map(Double.init), mide: .atleta)
            }
            // «Colócate» delante de una serie por tiempo que no viene de un descanso:
            // el motor lo corre como el descanso de la serie anterior (misma ventana).
            if necesitaColocate(seg, serie: k) {
                out.append(Paso(id: "s\(s)-q\(k)-c", clase: .fuerza, rol: .transicion, fase: fase,
                                medida: Medida(tipo: .tiempo, prescrito: colocateSDefecto, mide: .reloj),
                                cierre: .medida, bloque: bloque,
                                origen: Origen(segmento: s, ventana: .serie(k), descanso: true)))
            }
            let ficha = seg.fichasPorSerie.flatMap { $0.indices.contains(k) ? $0[k] : nil }
            out.append(Paso(id: "s\(s)-q\(k)", clase: .fuerza, rol: .trabajo, fase: fase, medida: medida, posicion: pos, nombre: nombre,
                            tempo: tempoDe(set.tempo), cue: ficha?.nota, cierre: medida.tipo == .tiempo ? .medida : .atleta, bloque: bloque,
                            fuerza: fichaDe(set, seg: seg, ejercicio: nombre, rmKg: ficha?.rmKg),
                            origen: Origen(segmento: s, ventana: .serie(k))))
            // El descanso que el MOTOR abre (la última serie no hereda el del bloque).
            let rest = descansoTrasSerie(seg, k)
            if rest > 0 {
                out.append(descanso(rest, id: "s\(s)-q\(k)-d", fase: fase, bloque: bloque,
                                    origen: Origen(segmento: s, ventana: .serie(k + 1), descanso: true)))
            }
        }
        return out
    }

    // MARK: - E/F · Un paso suelto (rodaje, ergo continuo, calentamiento, un ejercicio)

    private static func pasoSuelto(_ seg: WorkoutSegment, s: Int, fase: Fase, bloque: Int, entorno: RunEnvironment?, test: Bool = false) -> Paso {
        let mod = seg.resolvedModality
        let maquina = maquinaDe(mod, ergKind: seg.ergKind)
        let set = seg.prescription?.sets?.first
        var medida = medidaDe(seg.scalarMeasure ?? set?.measure, modalidad: mod, entorno: entorno)
        let esCorrer = mod == .run
        var clase: Clase
        let estructural = fase != .principal
        if estructural, !esCorrer, maquina == nil, seg.kind != .running {
            // Una movilidad o un calentamiento sin correr ni máquina no es una
            // carrera: con `.calentamiento` salía familia correr y página de Mapa (529).
            clase = .movilidad
        } else if estructural {
            clase = fase == .calentamiento ? .calentamiento : .vueltaCalma
        } else if test, esCorrer || maquina != nil {
            clase = .test
        } else if esCorrer {
            clase = seg.formatScheme == .steady && seg.targetPaceSecondsPerKm != nil ? .tempo : .rodaje
        } else if maquina != nil {
            clase = .ergo
        } else if mod == .mobility {
            clase = .movilidad
        } else if seg.kind == .strength {
            clase = .fuerza
        } else if seg.kind == .sled {
            clase = .estacion
        } else if seg.kind == .reps {
            clase = fase == .principal ? .estacion : .movilidad
        } else {
            clase = .estacion
        }
        if estructural, medida.tipo != .abierta, medida.mide == .atleta, !esCorrer, maquina == nil {
            // Un calentamiento de lista lo cierra el atleta aunque tenga dosis.
            medida.mide = .atleta
        }
        let objetivos = objetivosDe(seg.prescription?.target ?? set?.target, zona: seg.targetZone, ritmoSKm: seg.targetPaceSecondsPerKm,
                                    vatios: seg.targetPowerWatts, rpe: clase == .fuerza ? nil : seg.targetRpe, maquina: maquina)
            .filter { clase == .fuerza ? false : ($0.eje != .kg && $0.eje != .pctRM && $0.eje != .rir) }
        // Un rodaje largo es una tirada (umbral del coach, `UmbralesCorrer`).
        if clase == .rodaje { clase = claseContinua(medida, objetivos) }
        var ficha: FichaFuerza? = nil
        if clase == .fuerza {
            if let set { ficha = fichaDe(set, seg: seg, ejercicio: seg.title) }
            else {
                let carga: CargaFuerza = seg.loadKg.map { .kg(min: $0, max: $0) } ?? .tuya(ultimaKg: nil, lastre: false)
                ficha = FichaFuerza(ejercicio: seg.title, carga: carga, esfuerzo: seg.targetRpe.map { EsfuerzoFuerza(eje: .rpe, min: $0, max: $0) })
            }
        }
        let cierre: Cierre = (medida.tipo == .tiempo || medida.mide == .ergo || (esCorrer && medida.tipo == .distancia)) ? .medida : .atleta
        return Paso(id: "s\(s)", clase: clase, rol: .trabajo, fase: fase, medida: medida, objetivos: objetivos,
                    nombre: (esCorrer && !estructural) ? nil : (maquina != nil && !estructural ? nombreDeBox(seg.title, maquina) : seg.title),
                    entorno: esCorrer ? entornoDe(entorno) : nil, carga: clase == .fuerza ? nil : cargaDe(set?.target) ?? seg.loadKg.map { Carga(kg: $0) },
                    maquina: maquina, tempo: tempoDe(set?.tempo), cierre: cierre,
                    vueltaAutoM: (clase == .rodaje || clase == .tirada) ? 1000 : nil, bloque: bloque, fuerza: ficha,
                    origen: Origen(segmento: s, ventana: .segmento))
    }
}
