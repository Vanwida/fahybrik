import Foundation
import HealthKit

struct PhoneMirrorFrameContext {
    var isTreadmillLive: () -> Bool
    var hapticCue: String?
    var hapticSeq: Int?
}

enum PhoneMirrorFrameBuilder {
    // MARK: - Frame building
    //
    // Reads the SAME accessors the live HUDs read, so the wrist never invents. All
    // content fields are optional — the wrist renders what's present.

    static func buildFrame(from session: WorkoutSession, context: PhoneMirrorFrameContext) -> MirrorStateFrame {
        let seg = session.currentSegment

        let phase: String
        if session.isFinished { phase = MirrorWire.Phase.finished }
        else if session.isAwaitingBlockStart { phase = MirrorWire.Phase.gate }
        else if session.isPaused { phase = MirrorWire.Phase.paused }
        // The structured-run 3-2-1 pre-roll is its OWN phase (the wrist renders
        // "Prepárate" + a CEIL count-in), distinct from the live active clock.
        else if session.isRunStructureActive && session.isRunCountIn { phase = MirrorWire.Phase.countIn }
        else { phase = MirrorWire.Phase.active }

        // Content lines. A structured run reads from the LEG CURSOR — a mirror of
        // ActiveWorkoutView.modalityHUD, which branches on isRunStructureActive BEFORE
        // the conditioning HUD. The folded-block seg.title / previewWorkLine are frozen
        // across every tramo, so reading them here would pin "tramo 1" on the wrist.
        let lineTitle: String?
        let detailLine: String?
        if session.isRunStructureActive, let leg = session.currentRunLeg {
            let lines = runLegLines(leg)
            lineTitle = lines.title
            detailLine = lines.detail
        } else {
            // #23 — a HYROX dobles relay station reads on the mirrored wrist as the
            // relay ("{partner} hace SkiErg" / "Recupera — siguiente: tú"), not as work
            // the athlete performs. A SHARED station (.split) carries the reparto pact
            // in detailLine ("Tú 60 / Guillem 40 · alterna 250m"); non-dobles keeps the
            // work line. partnerName / splitLine ride on the split when present.
            let relay = seg?.doblesSplit?.role == .partner
            let relayWho = seg?.doblesSplit?.partnerName ?? "Tu compañero"
            let relayStation = seg?.doblesSplit?.stationLabel ?? seg?.title ?? "estación"
            let splitLine = seg?.doblesSplit?.liveSplitLine
            if relay {
                lineTitle = "\(relayWho) hace \(relayStation)"
                detailLine = "Recupera — siguiente: tú"
            } else if session.isStationTramo {
                // A ROUTE (a For Time / HYROX sim walked station by station). The
                // folded segment title is every movement of the block joined with
                // dots and its work line is the block's — both frozen from the first
                // station to the last, so the wrist would say the same thing for
                // twenty minutes. The TRAMO says which station he is on and what it
                // asks for, and it changes the instant he moves — whether he tapped
                // or the monitor closed the piece for him.
                let tramo = session.currentTramo
                lineTitle = tramo.label
                detailLine = splitLine ?? tramo.workLine
            } else {
                lineTitle = seg?.title
                detailLine = splitLine ?? seg?.previewWorkLine
            }
        }

        // #56 — the current dobles turn (mine/partner/split + rep reparto), so the
        // wrist can render the turn hero AND fire the "entras tú" haptic on the flip
        // back from the partner's relay. Reuses the SAME DoblesTurn the phone hero
        // reads (seg.doblesTurn) — one projection, never a second interpretation.
        let dobles: MirrorDoblesTurn? = seg?.doblesTurn.map { t in
            MirrorDoblesTurn(
                role: t.who.rawValue,
                station: t.station,
                selfReps: t.selfReps,
                partnerReps: t.partnerReps,
                partnerName: t.partnerName,
                selfSharePct: t.selfSharePct
            )
        }

        // Live TREADMILL belt progress — ONLY a plain CONTINUOUS distance run, where the
        // segment IS the tramo (the belt accumulator equals the leg's covered distance).
        // Excluded: a #61 STRUCTURED run and a folded interval SERIES — there the belt
        // total spans multiple bouts while `targetDistanceMeters` is per-bout, so a ring
        // would overflow; per-leg covered distance doesn't live in the engine. Those keep
        // their per-leg measure / objetivo / TRAMO lines. This is exactly the HUD's own
        // continuous-leg condition (`!structured && !series`), so the wrist ring fires
        // when — and only when — the phone HUD treats it as one continuous leg. Covered
        // comes from the session's belt accumulator, target from the prescribed distance,
        // pace is the honest covered average; the zone rides on `targetZone` + local HR.
        let beltDistanceM: Double?
        let beltTargetM: Double?
        let beltPaceSecPerKm: Int?
        if let seg, context.isTreadmillLive(), seg.kind == .running,
           !session.isRunStructureActive, !TreadmillLegResolver.isRunSeries(seg),
           let target = seg.targetDistanceMeters, target > 0 {
            beltDistanceM = session.lapBeltDistanceMeters
            beltTargetM = target
            beltPaceSecPerKm = session.liveBeltPaceSecPerKm
        } else {
            beltDistanceM = nil
            beltTargetM = nil
            beltPaceSecPerKm = nil
        }

        return MirrorStateFrame(
            phase: phase,
            blockTitle: session.currentBlockRegion?.title,
            lineTitle: lineTitle,
            detailLine: detailLine,
            progressText: session.liveProgressText,
            sessionElapsed: session.elapsedSeconds,
            lapElapsed: session.lapElapsedSeconds,
            countdownRemaining: countdown(session),
            targetZone: seg?.targetZone?.rawValue,
            // El avance ACABA la sesión solo cuando este toque la acaba de verdad: no
            // hay bloque después, no estamos en la puerta de un bloque (ahí el avance
            // solo lo EMPIEZA), no queda tramo por delante dentro del bloque y no
            // queda serie por cerrar. Un entreno de fuerza libre mete todos los
            // ejercicios en UN bloque, así que con la regla vieja («no hay bloque
            // después») la muñeca rotulaba TERMINAR desde la primera serie del primer
            // ejercicio — y ese botón pide confirmación de fin de sesión.
            isFinalStep: !session.isAwaitingBlockStart
                && !session.hasBlockAfterCurrent
                && session.isLastSegment
                && session.pendingSetIndex == nil,
            restRemaining: session.restRemainingSeconds > 0 ? session.restRemainingSeconds : nil,
            dobles: dobles,
            beltDistanceM: beltDistanceM,
            beltTargetM: beltTargetM,
            beltPaceSecPerKm: beltPaceSecPerKm,
            hapticCue: context.hapticCue,
            hapticSeq: context.hapticSeq,
            tramo: buildTramo(session),
            // La serie abierta, del MISMO accesor del motor que lee el reloj en
            // solitario: contar no puede depender de por qué vía llegó el entreno.
            sensorWindow: {
                let w = session.sensorWindow
                return MirrorSensorWindow(key: w.key, modality: w.modality,
                                          name: w.name, resting: w.resting)
            }(),
            runEnvironment: session.runEnvironment
        )
    }

    /// EL TRAMO en dato — lo que deja a la muñeca elegir guion y pintar el sujeto
    /// del formato en vez de las tres frases ya redactadas de arriba.
    ///
    /// Todo sale de accesores que el motor YA resuelve; aquí no se decide nada
    /// nuevo, sólo se proyecta. Lo que no se sabe viaja nil: un cero mandado como
    /// si fuera medida es la clase de mentira que el §7 vino a matar.
    private static func buildTramo(_ session: WorkoutSession) -> MirrorTramo {
        let tramo = session.currentTramo
        let seg = session.currentSegment
        let descansando = session.isTramoResting

        // El ritmo del TRAMO, no la media del segmento: en una serie la media
        // atraviesa recuperaciones y describe un esfuerzo que no existió.
        let ritmo: Int? = session.liveCoveredPaceSecPerKm
        let objetivo = session.currentRunLeg.flatMap {
            RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: ritmo)
        }
        // FUERA DE UNA PIERNA DE CORRER, `objetivo` (arriba) SIEMPRE ES NIL — no
        // es una carencia, es que esa lógica es de ritmo y sólo tiene sentido
        // corriendo. Un intervalo funcional (el trineo, la plancha) tiene su
        // propio objetivo — RPE, no ritmo — y sin esto la muñeca nunca lo veía:
        // el segundo nivel de `GuionRelojDePared.intervals` (que ES el objetivo
        // cuando el coach escribió uno) se quedaba vacío siempre.
        let objetivoFuncional = PrescriptionRenderer.targetLoad(seg?.prescription?.target)

        // La forma de la parte que se corre, para el aro de la muñeca. Se calcula
        // con la MISMA función que usa el reloj en solitario: dos vías que dibujan
        // el mismo entreno no pueden tener dos reglas de reparto.
        let forma = FormaDelAro.fase(legs: session.currentRunLegs ?? [], indice: session.runLegIndex)

        // En una serie de correr se cuentan SERIES, no piernas: un 3×1000 con sus
        // dos recuperaciones son cinco tramos y tres series, y «tramo 4 de 5» no
        // le dice nada a nadie. La regla vive en RunLegDisplay para que el móvil y
        // las dos vías del reloj cuenten igual.
        let ronda: (n: Int, total: Int)? = {
            if let legs = session.currentRunLegs, !legs.isEmpty {
                return RunLegDisplay.serie(legs: legs, indice: session.runLegIndex)
            }
            guard session.tramoRoundTotal > 0 else { return nil }
            return (n: session.tramoRoundIndex + 1, total: session.tramoRoundTotal)
        }()

        // La serie EN CURSO, no la primera. `previewWorkLine` congela la primera
        // los cinco sets, que es justo lo que la muñeca lleva enseñando.
        let set = session.pendingSetIndex.flatMap { i in
            session.setRecords.indices.contains(i) ? session.setRecords[i] : nil
        }

        // LO CUBIERTO EN ESTA VENTANA — y OBJETIVO Y MEDIDA VIAJAN EMPAREJADOS.
        //
        // Aquí había dos fallos que la muñeca no podía detectar, porque los dos
        // números llegaban bien formados:
        //
        // 1. Se leía el acumulador de la CINTA para todo lo que no fuera ergo. Al
        //    aire libre eso es nil, así que una serie de 1.000 m en la calle
        //    pintaba «te faltan 1000» los cuatro minutos enteros, sin moverse. El
        //    dato bueno estaba dos accesores más abajo, en el mismo fichero del
        //    motor: los metros de la pierna salen del GPS cuando no hay cinta.
        //
        // 2. Objetivo y medida se resolvían por separado con dos `??`, así que un
        //    tramo de «12 cal» de ski cogía el objetivo en calorías y la medida en
        //    METROS — el PM5 reporta distancia haya o no objetivo de distancia. La
        //    muñeca pintaba «te faltan 0 m» desde la primera palada y el aro salía
        //    lleno. El motor ya los empareja bien en `tramoProgress`; era el cable
        //    el que divergía de él, y ahora usa la misma pareja.
        let objetivoMedida: Double?
        let hecho: Double?
        let objetivoEsCalorias: Bool
        if tramo.isErg, let cal = tramo.targetCalories, cal > 0 {
            // La unidad la manda el OBJETIVO: si la pieza se mide en calorías, lo
            // hecho son calorías. Nunca los metros que el monitor reporta igual.
            objetivoMedida = Double(cal)
            hecho = session.tramoErgCalories.map { Double($0) }
            objetivoEsCalorias = true
        } else if tramo.isErg {
            objetivoMedida = tramo.targetDistanceMeters
            hecho = session.tramoErgDistanceMeters
            objetivoEsCalorias = false
        } else if let metros = tramo.targetDistanceMeters {
            objetivoMedida = metros
            // Correr: la cinta si la hay, el GPS si no. Es la MISMA regla que usa
            // el motor para el ritmo de la pierna, así que ritmo y metros no
            // pueden contar cosas distintas.
            hecho = session.tramoBeltDistanceMeters ?? session.tramoRunCoveredMeters
            objetivoEsCalorias = false
        } else if let cal = tramo.targetCalories {
            objetivoMedida = Double(cal)
            hecho = session.tramoBeltDistanceMeters ?? session.tramoRunCoveredMeters
            objetivoEsCalorias = true
        } else {
            objetivoMedida = nil
            hecho = session.tramoBeltDistanceMeters ?? session.tramoRunCoveredMeters
            objetivoEsCalorias = false
        }

        return MirrorTramo(
            formato: seg?.formatScheme?.rawValue,
            modalidad: tramo.modality.rawValue,
            etiqueta: tramo.label,
            dosis: tramo.workLine,
            rondaN: ronda?.n,
            rondaTotal: ronda?.total,
            enDescanso: descansando,
            cierre: cierreDelTramo(tramo, session: session, descansando: descansando),
            objetivoMedida: objetivoMedida,
            hechoMedida: hecho,
            objetivoEsCalorias: objetivoEsCalorias,
            // TIME rest sends remaining. DISTANCE / open rest send nil — never a
            // fabricated 0 that the wrist would treat as "clock done".
            ventanaQueda: ventanaQuedaDelTramo(session, tramo, descansando: descansando),
            ventanaTotal: tramo.boxedSeconds.map { Double($0) },
            enTramoS: session.tramoElapsedSeconds,
            ritmoSecPorKm: ritmo,
            objetivoLabel: objetivo?.label ?? objetivoFuncional,
            objetivoEstado: objetivo.map { estadoWire($0.status) },
            zonaViva: session.liveZone?.rawValue,
            siguiente: session.nextTramoLine,
            cargaKg: set.flatMap { $0.loadActualKg ?? $0.loadPrescribedKg },
            // `reps` es fuerza cuando hay serie en curso, y las repeticiones DEL
            // MINUTO en un death by cuando no la hay — los dos formatos son
            // mutuamente excluyentes, así que un solo campo basta para los dos.
            reps: set != nil
                ? set.flatMap { $0.repsActual ?? $0.repsPrescribed }
                : (seg?.formatScheme == .deathBy ? session.deathByTarget : nil),
            // EMOM: la ronda de AHORA, no si el móvil reporta metros — así una
            // ronda de ski sin cinta/PM5 conectado sigue siendo `.ojeada`.
            tareaEsErgo: seg?.emomPlan?.interval(session.tramoRoundIndex)?.isErg ?? false,
            recuperacionEnMovimiento: session.isTramoRecuperandoEnMovimiento,
            forma: forma?.arcos.map { MirrorArco(trabajo: $0.trabajo, peso: $0.peso) },
            formaIndice: forma?.enCurso,
            parte: session.currentRunLeg?.phaseRole.rawValue
        )
    }

    /// QUIÉN CIERRA esta ventana, sea de la modalidad que sea.
    ///
    /// NO sale de `ErgCounterPolicy`: esa tabla resuelve el contador del PM5 y
    /// devuelve `athleteTap` para todo lo que no sea un ergo (`resolve` sale por
    /// arriba si `!tramo.isErg`). Mandar eso por el cable hacía que una serie de
    /// 500 m corriendo — con su hito de distancia, que lo cierra el GPS — viajara
    /// como «la cierras tú», y la muñeca cambiaba el sujeto: en vez de los metros
    /// que faltan pintaba los que llevas, y ofrecía un toque que no hace falta.
    ///
    /// La regla verdadera es la del tramo y es la misma de `LiveTramo`: metros o
    /// calorías → lo sabe la medida; segundos → lo sabe el reloj; nada de eso →
    /// no lo sabe nadie y lo dice el atleta.
    private static func cierreDelTramo(_ tramo: LiveTramo, session: WorkoutSession, descansando: Bool) -> String {
        // Recupera of a structured run uses the SAME closer as work. Forcing
        // sessionClock on every rest made a DISTANCE / open recovery look like
        // TIME already at 0. Iron / EMOM / station rest stay on the clock —
        // this ticket does not retouch that chrome.
        if descansando {
            if session.isRunStructureActive {
                if session.currentRunLeg?.isTimed == true { return "sessionClock" }
                if tramo.targetDistanceMeters != nil || tramo.targetCalories != nil { return "machineGoal" }
                return "athleteTap"
            }
            return "sessionClock"
        }
        if tramo.targetDistanceMeters != nil || tramo.targetCalories != nil { return "machineGoal" }
        if tramo.boxedSeconds != nil || tramo.targetDurationSeconds != nil { return "sessionClock" }
        return "athleteTap"
    }

    /// Clock remaining only when a clock closes the window. A DISTANCE recovery
    /// has `runLegRemaining == 0` — that 0 is not a deadline.
    private static func ventanaQuedaDelTramo(
        _ session: WorkoutSession, _ tramo: LiveTramo, descansando: Bool
    ) -> Double? {
        if descansando {
            if session.isRunStructureActive {
                guard session.currentRunLeg?.isTimed == true,
                      session.tramoRestRemaining > 0 else { return nil }
                return session.tramoRestRemaining
            }
            return session.tramoRestRemaining
        }
        return session.tramoWorkRemaining
    }

    private static func estadoWire(_ status: TargetStatus) -> String {
        switch status {
        case .inTarget: return "inTarget"
        case .tooFast:  return "tooFast"
        case .tooSlow:  return "tooSlow"
        case .unknown:  return "unknown"
        }
    }

    // A structured-run leg → the wrist's work line + objetivo line, from the SAME leg
    // cursor the phone HUD drives. Reuses the shared RunLegDisplay / RunPaceModel
    // formatting (never a fabricated string): a WORK leg reads its measure + objetivo
    // ("800 m" / "4:25–4:35 /km"); a RECOVERY reads "Recupera <modo>" + its measure.
    private static func runLegLines(_ leg: RunLeg) -> (title: String, detail: String?) {
        let measure = RunLegDisplay.measureLabel(leg)
        if leg.isRecovery {
            let mode = RunLegDisplay.recoveryModeWord(leg.recoveryMode)
            return (mode.isEmpty ? "Recupera" : "Recupera \(mode)",
                    measure.isEmpty ? nil : measure)
        }
        return (measure.isEmpty ? "Corre" : measure, leg.objetivoLabel)
    }

    // The fields that gate a resend: everything EXCEPT the free-running clocks
    // (elapsed / countdown value / rest value), which the wrist ticks locally. A
    // countdown or rest merely APPEARING or CLEARING is structural; its value is not.
    // The TRAMO index rides in `progressText` ("TRAMO 2/3"), so a leg change flips the
    // key and resends a fresh frame the instant the tramo advances. Internal so the
    // frame-builder test can assert the leg boundary changes the key.
    static func structuralKey(_ f: MirrorStateFrame) -> String {
        // #56 — the dobles turn (role + station) is structural: a station handoff
        // (partner → mine) flips the key so a fresh frame is resent the instant the turn
        // changes, driving the wrist's "entras tú" haptic on the very next tick.
        let doblesKey = f.dobles.map { "\($0.role):\($0.station)" } ?? ""
        // The belt target is structural; the covered distance must UPDATE the ring as it
        // fills (the wrist can't tick distance locally — it doesn't know the belt speed),
        // so the covered metres ride in the key AL METRO: it resends as meters accrue,
        // at most once per frame (`frameInterval` ya lo capa a una por segundo), never
        // per centimetre. Pace rides along on the resend. Iban en cubos de 10 m y a
        // ritmo de carrera eso es un refresco cada tres segundos — el numeral se
        // clavaba y luego saltaba de diez en diez.
        let beltTargetKey = f.beltTargetM.map { String(Int($0)) } ?? ""
        let beltBucketKey = f.beltDistanceM.map { String(Int($0)) } ?? ""
        // Every whole second of a countdown / rest forces a frame so the wrist
        // can fire local 3-2-1 ticks even if a dedicated haptic packet is lost,
        // and so the re-based clock never drifts more than ~1 s.
        let countdownSec = f.countdownRemaining.map { String(max(0, Int(ceil($0)))) } ?? ""
        let restSec = f.restRemaining.map { String(max(0, Int(ceil($0)))) } ?? ""
        let hapticKey = f.hapticSeq.map(String.init) ?? ""
        // Del TRAMO sólo entra lo que cambia de FORMA, nunca lo que corre solo: la
        // ronda, si estás en descanso, qué tarea toca, quién cierra la ventana y la
        // dosis. El ritmo, los metros y los relojes se quedan fuera — si entraran,
        // cada segundo forzaría una trama y el canal se inunda. Los metros ya tienen
        // su cubo grueso arriba (la cinta), y el resto la muñeca lo tickea local.
        // El veredicto del ritmo SÍ es estructural: pasar de «en objetivo» a «lento»
        // cambia lo que se pinta, y son cuatro valores, no un número continuo.
        let tramoKey: String = {
            guard let t = f.tramo else { return "" }
            var campos: [String] = []
            campos.append(t.formato ?? "")
            campos.append(t.etiqueta ?? "")
            campos.append(t.dosis ?? "")
            campos.append(t.rondaN.map(String.init) ?? "")
            campos.append(t.rondaTotal.map(String.init) ?? "")
            campos.append(t.enDescanso ? (t.recuperacionEnMovimiento ? "trote" : "rest") : "work")
            campos.append(t.cierre ?? "")
            campos.append(t.objetivoLabel ?? "")
            campos.append(t.objetivoEstado ?? "")
            campos.append(t.zonaViva.map(String.init) ?? "")
            campos.append(t.cargaKg.map { String(Int($0 * 10)) } ?? "")
            campos.append(t.reps.map(String.init) ?? "")
            // Lo medido en la ventana, AL METRO. Iba en cubos de 10 m, y corriendo
            // eso es un refresco cada tres segundos: el numeral de «te faltan» se
            // quedaba clavado y luego pegaba un salto de diez, que es exactamente
            // la sensación de «no está contando» que dio la serie del 8-ago. Al
            // metro no inunda nada, porque el emisor ya está capado a una trama por
            // segundo (`frameInterval`) — el cubo grueso nunca ahorró tramas por
            // debajo de ese techo, sólo las quitaba donde hacían falta.
            campos.append(t.hechoMedida.map { String(Int($0)) } ?? "")
            // El RELOJ de la ventana, al segundo. La muñeca NO lo tickea local — pinta
            // `ventanaQueda` tal cual llega (GuionDelEspejo) — así que dejándolo fuera
            // de la clave solo se refrescaba con el latido de 5 s: la cuenta atrás se
            // congelaba y saltaba de cinco en cinco, y el reloj se veía desincronizado
            // del móvil en CUALQUIER entreno con ventana (el minuto del EMOM, el
            // descanso de intervalos, el del circuito). Al segundo, como ya hacían
            // `countdownSec` y `restSec` arriba: una trama por segundo como mucho, que
            // es exactamente lo que esos dos ya aceptaban.
            campos.append(t.ventanaQueda.map { String(max(0, Int(ceil($0)))) } ?? "")
            // La FORMA del aro y dónde estás dentro de ella: cambia una vez por
            // tramo, y es lo único que mueve el on/off del bisel. Del reparto
            // basta el número de arcos —los pesos no cambian dentro de una parte—
            // y la parte en curso, que decide cómo se llama la pantalla.
            campos.append(t.forma.map { String($0.count) } ?? "")
            campos.append(t.formaIndice.map(String.init) ?? "")
            campos.append(t.parte ?? "")
            return campos.joined(separator: ",")
        }()
        let parts: [String] = [
            f.phase,
            f.blockTitle ?? "",
            f.lineTitle ?? "",
            f.detailLine ?? "",
            f.progressText ?? "",
            f.targetZone.map(String.init) ?? "",
            f.countdownRemaining != nil ? "cd" : "",
            countdownSec,
            f.restRemaining != nil ? "rest" : "",
            restSec,
            doblesKey,
            beltTargetKey,
            beltBucketKey,
            hapticKey,
            tramoKey,
        ]
        return parts.joined(separator: "|")
    }

    // The active format countdown (count-in, EMOM interval, AMRAP/steady window, or
    // a rotating phase), in seconds — nil when the format runs an open count-up.
    private static func countdown(_ session: WorkoutSession) -> Double? {
        // A structured run: the 3-2-1 pre-roll first, then a TIME tramo's count-down;
        // a DISTANCE tramo has NO countdown (nil → the wrist hero shows elapsed/measure,
        // not a fabricated clock). Painting the pre-roll here is what removes the ~3s
        // offset — the phone excludes the count-in from the leg clock, so the wrist must
        // too, instead of counting up a lapElapsed that accrued during the pre-roll.
        if session.isRunStructureActive {
            if session.runCountInRemaining > 0 { return session.runCountInRemaining }
            return session.currentRunLeg?.isTimed == true ? session.runLegRemaining : nil
        }
        let seg = session.currentSegment
        if seg?.isEMOM == true {
            if session.emomCountInRemaining > 0 { return session.emomCountInRemaining }
            return session.emomPhaseRemaining > 0 ? session.emomPhaseRemaining : nil
        }
        if session.isConditioningActive, let scheme = seg?.formatScheme {
            if session.condCountInRemaining > 0 { return session.condCountInRemaining }
            switch scheme.presentation {
            case .fixed, .continuous:
                if seg?.formatTotalSeconds != nil { return session.condRemaining }
            case .rotating:
                return session.rotPhaseRemaining > 0 ? session.rotPhaseRemaining : nil
            default:
                break
            }
        }
        return nil
    }

    // MARK: - Activity mapping
    //
    // MUST match WatchTodayPayload.healthKitActivityType (the watch's standalone map)
    // so a mirrored session produces the SAME HKWorkout type the wrist would alone.
    static func activityType(for activityKind: String) -> HKWorkoutActivityType {
        switch activityKind {
        case "running":  return .running
        case "strength": return .functionalStrengthTraining
        case "hyrox":    return .functionalStrengthTraining
        case "mixed":    return .mixedCardio
        default:         return .other
        }
    }
}
