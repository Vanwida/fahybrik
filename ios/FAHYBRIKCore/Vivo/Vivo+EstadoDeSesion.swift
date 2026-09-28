import Foundation

// EL ESTADO VIVO DESDE EL MOTOR — la mitad dinámica del adaptador (I1). De
// `WorkoutSession` (los cursores de sus tres motores, sus acumuladores y sus
// vueltas) a `Vivo.EstadoVivo`: el paso vivo, las lecturas de AHORA, los
// parciales de lo hecho y la sesión. Un pintor no lee el motor: lee esto.
//
// Lo que el motor no mide no se inventa: viaja nil y el pintor pone «—» o
// calla (I10). Lo que llega de un aparato que no ve el motor (el /500 del
// monitor, el ritmo instantáneo del GPS, los pasos por minuto del podómetro,
// el estado del GPS) entra por `LecturaExterna`, que rellena la vista.

extension Vivo {

    /// Lo que la app sabe y el motor no: el monitor, el GPS y el podómetro en
    /// vivo. Todo opcional; sin ello, lo que el motor acumula.
    struct LecturaExterna: Equatable {
        var split500: Double? = nil
        var vatios: Double? = nil
        var cadencia: Double? = nil
        var cal: Double? = nil
        /// Ritmo instantáneo (~10 s), s/km, del GPS o de la cinta.
        var ritmo: Double? = nil
        var gps: EstadoGps = .noAplica
        var viejos: [CampoVivo] = []
        var dispositivos: Dispositivos = Vivo.sinDispositivos
    }

    // MARK: - El paso vivo

    /// La ventana del cursor del motor, en el idioma del paso.
    static func ventanaDe(_ sesion: WorkoutSession) -> Origen.Ventana {
        let seg = sesion.currentSegment
        switch sesion.currentTramo.cursor {
        case .segment:
            // Una lista fija homogénea (rondas de una cosa) no tiene cursor propio: lo lleva `fixedRoundsDone`.
            if let seg, seg.isConditioningTimer, seg.formatScheme?.presentation == .fixed, !seg.fixedListIsStations,
               seg.formatScheme != .amrap, seg.formatScheme != .steady {
                return .ronda(Swift.min(Swift.max(0, sesion.fixedRoundsDone), Swift.max(0, sesion.fixedListTotal - 1)))
            }
            return .segmento
        case let .emomInterval(i): return .emom(i)
        case let .conditioningRound(i): return .ronda(i)
        case let .runLeg(i): return .pierna(i)
        case let .fixedStation(i): return .estacion(i)
        case let .strengthSet(i): return .serie(i)
        }
    }

    /// El índice del paso vivo en `pasos`. Nunca falla: cae al primer paso del
    /// segmento y, si no lo hay, al último del plan.
    static func indiceActual(_ pasos: [Paso], _ sesion: WorkoutSession) -> Int {
        let s = sesion.currentSegmentIndex
        var ventana = ventanaDe(sesion)
        var descanso = sesion.isTramoResting
        // El descanso de fuerza corre entre la serie cerrada y la siguiente: su paso cuelga de la serie que viene.
        if sesion.restRemainingSeconds > 0, sesion.currentSegment?.usesMultiSetStrength == true {
            descanso = true
            ventana = .serie(sesion.pendingSetIndex ?? sesion.setRecords.count)
        }
        if let i = pasos.firstIndex(where: { $0.origen?.segmento == s && $0.origen?.ventana == ventana && $0.origen?.descanso == descanso }) { return i }
        if let i = pasos.firstIndex(where: { $0.origen?.segmento == s && $0.origen?.ventana == ventana }) { return i }
        if let i = pasos.firstIndex(where: { $0.origen?.segmento == s }) { return i }
        return Swift.max(0, pasos.count - 1)
    }

    // MARK: - Las lecturas de ahora

    static func lecturasDe(_ sesion: WorkoutSession, paso p: Paso, externo x: LecturaExterna) -> Lecturas {
        let enPiernas = sesion.isRunStructureActive
        // Segundos en el paso: en un descanso, lo que va de él (lo prescrito menos lo que queda).
        let t: Double
        if p.rol == .descanso || p.rol == .recuperacion {
            if sesion.restRemainingSeconds > 0 { t = Swift.max(0, sesion.restTotalSeconds - sesion.restRemainingSeconds) }
            else if enPiernas { t = sesion.runLegElapsed }
            else if let pr = p.medida.prescrito { t = Swift.max(0, pr - sesion.tramoRestRemaining) }
            else { t = sesion.tramoElapsedSeconds }
        } else if enPiernas {
            t = sesion.runLegElapsed
        } else if sesion.isConditioningActive, case .segment = sesion.currentTramo.cursor {
            t = sesion.condElapsed
        } else {
            t = sesion.tramoElapsedSeconds
        }

        var hecho: Double? = nil
        switch p.medida.tipo {
        case .tiempo: hecho = t
        case .distancia:
            if p.medida.mide == .ergo { hecho = sesion.tramoErgDistanceMeters }
            else if p.medida.mide == .gps || p.medida.mide == .cinta { hecho = sesion.tramoRunCoveredMeters }
        case .cal:
            hecho = sesion.tramoErgCalories.map(Double.init)
        case .reps:
            if p.medida.mide == .sensor, sesion.repsCurrentSegment > 0 { hecho = Double(sesion.repsCurrentSegment) }
        case .abierta: break
        }

        let ritmoMotor: Double? = (p.medida.mide == .gps || p.medida.mide == .cinta || esCarrera(p)) ? sesion.liveCoveredPaceSecPerKm.map(Double.init) : nil
        let esErgo = p.medida.mide == .ergo || p.maquina != nil && p.maquina?.tipo != .cinta
        return Lecturas(
            t: t,
            hecho: hecho,
            ritmo: x.ritmo ?? ritmoMotor,
            ppm: sesion.liveHRBpm.map(Double.init),
            ppmTendencia: tendenciaDe(sesion),
            split500: esErgo ? (x.split500 ?? sesion.lapErgPaceSamples.last) : nil,
            vatios: esErgo ? (x.vatios ?? sesion.lapErgPowerSamples.last) : nil,
            cadencia: esErgo ? (x.cadencia ?? sesion.lapErgSpmSamples.last) : (x.cadencia ?? sesion.lapRunCadenceSamples.last),
            cal: esErgo ? (x.cal ?? sesion.tramoErgCalories.map(Double.init)) : nil,
            gps: usaGps(p) ? x.gps : .noAplica,
            viejos: x.viejos
        )
    }

    /// El pulso sube o baja: las dos últimas muestras del tramo, sin inventar.
    private static func tendenciaDe(_ sesion: WorkoutSession) -> Tendencia? {
        let m = sesion.lapHRSamples
        guard m.count >= 6 else { return nil }
        let reciente = m.suffix(3).reduce(0, +) / 3
        let antes = m.suffix(6).prefix(3).reduce(0, +) / 3
        if reciente < antes - 1 { return .baja }
        if reciente > antes + 1 { return .sube }
        return .estable
    }

    // MARK: - Lo hecho: parciales y vueltas

    /// Un parcial por paso cerrado, desde las vueltas del motor.
    static func parcialesDe(_ pasos: [Paso], _ sesion: WorkoutSession) -> [Parcial] {
        var out: [Parcial] = []
        let segs = sesion.plan.segments
        for lap in sesion.laps {
            guard let s = segs.firstIndex(where: { $0.id == lap.segmentId }) else { continue }
            let i: Int?
            if let leg = lap.runLegIndex {
                i = pasos.firstIndex { $0.origen?.segmento == s && $0.origen?.ventana == .pierna(leg) }
            } else {
                i = pasos.firstIndex { $0.origen?.segmento == s && $0.origen?.descanso == false }
            }
            guard let i, !out.contains(where: { $0.i == i }) else { continue }
            out.append(Parcial(i: i, segundos: lap.durationSeconds, metros: lap.distanceCoveredMeters,
                               ppm: lap.avgHRBpm.map(Double.init), hecho: lap.repsCompleted.map(Double.init)))
        }
        // Las estaciones cerradas del segmento en curso (la ruta), aún sin vuelta del motor.
        let s = sesion.currentSegmentIndex
        for (k, split) in sesion.fixedRoundSplits.enumerated() {
            let ventana: Origen.Ventana = sesion.currentSegment?.fixedListIsStations == true ? .estacion(k) : .ronda(k)
            guard let i = pasos.firstIndex(where: { $0.origen?.segmento == s && $0.origen?.ventana == ventana && $0.origen?.descanso == false }),
                  !out.contains(where: { $0.i == i }) else { continue }
            out.append(Parcial(i: i, segundos: split.seconds, metros: split.meters, ppm: nil, hecho: split.calories.map(Double.init)))
        }
        return out.sorted { $0.i < $1.i }
    }

    /// Las vueltas de series y tramos, juzgadas contra su objetivo.
    static func vueltasDe(_ pasos: [Paso], parciales: [Parcial], zonas: ZonasCoach?, reglas: ReglasAviso) -> [Vuelta] {
        parciales.compactMap { x in
            guard x.i < pasos.count else { return nil }
            let p = pasos[x.i]
            guard p.rol == .trabajo, p.fase == .principal, let cuenta = p.posicion?.serie ?? p.posicion?.tramo else { return nil }
            let ritmo: Double? = (x.metros ?? 0) > 50 ? x.segundos / ((x.metros ?? 0) / 1000) : nil
            var veredicto: Veredicto? = nil
            if let o = principal(p) {
                if o.eje == .ritmo, let r = ritmo { veredicto = veredictoDe(o, r, holgura: holguraDe(.ritmo, reglas), zonas: zonas) }
                else if o.eje == .split500, let m = x.metros, m > 0 { veredicto = veredictoDe(o, x.segundos * 500 / m, holgura: holguraDe(.split500, reglas), zonas: zonas) }
                else if o.eje == .zona || o.eje == .ppm, let ppm = x.ppm { veredicto = veredictoDe(o, ppm, holgura: holguraDe(o.eje, reglas), zonas: zonas) }
            }
            return Vuelta(n: cuenta.n, tanda: p.posicion?.tanda?.n, clase: p.posicion?.tramo != nil ? .tramo : .serie,
                          segundos: x.segundos, metros: x.metros, ritmo: ritmo, ppm: x.ppm, veredicto: veredicto, eje: principal(p)?.eje)
        }
    }

    // MARK: - El estado entero

    static func estadoDe(_ sesion: WorkoutSession, plan: PlanVivo, externo: LecturaExterna = LecturaExterna()) -> EstadoVivo {
        let pasos = plan.pasos
        let i = indiceActual(pasos, sesion)
        let paso = pasos[Swift.min(i, Swift.max(0, pasos.count - 1))]
        let lecturas = lecturasDe(sesion, paso: paso, externo: externo)
        let parciales = parcialesDe(pasos, sesion)
        let segs = sesion.plan.segments
        var corridos: Double = 0
        var ergo: Double = 0
        for lap in sesion.laps {
            guard let s = segs.firstIndex(where: { $0.id == lap.segmentId }) else { continue }
            let m = lap.distanceCoveredMeters ?? 0
            if segs[s].resolvedModality == .run || lap.runLegIndex != nil { corridos += m } else if segs[s].involvesErg { ergo += m }
        }
        if let m = sesion.tramoRunCoveredMeters { corridos += m }
        if let m = sesion.tramoErgDistanceMeters { ergo += m }
        // La del motor (el arranque) manda; si no, la de entrada a la parte principal (kit: `cuentaDe`).
        let motor: Int? = sesion.isTramoCountIn ? Swift.max(1, Swift.min(3, Int(sesion.tramoCountInRemaining.rounded(.up)))) : nil
        let enPausa = sesion.isPaused || sesion.isFinished
        let cuenta: Int? = motor ?? (enPausa ? nil : cuentaDe(pasos, i, lecturas))
        return EstadoVivo(
            pasos: pasos,
            i: i,
            lecturas: lecturas,
            sesion: Sesion(t: sesion.elapsedSeconds, metros: corridos > 0 ? corridos : nil,
                           ritmoMedio: corridos > 50 ? sesion.elapsedSeconds / (corridos / 1000) : nil, ppmMedio: nil),
            zonas: plan.zonas,
            reglas: plan.reglas,
            pausado: sesion.isPaused,
            vueltas: vueltasDe(pasos, parciales: parciales, zonas: plan.zonas, reglas: plan.reglas),
            parciales: parciales,
            metrosPaso: lecturas.hecho != nil && paso.medida.tipo == .distancia ? lecturas.hecho : (paso.medida.mide == .ergo ? sesion.tramoErgDistanceMeters : sesion.tramoRunCoveredMeters),
            sesionErgoM: ergo,
            cuenta: cuenta,
            go: cuenta == nil && !enPausa && goDe(pasos, i, lecturas),
            terminado: sesion.isFinished
        )
    }
}
