import Foundation

// EL HIERRO: precargar el tramo desde la prescripción (carga, reps, series, Rx) y
// registrar serie a serie lo que de verdad se hizo, más el descanso que dispara
// cada cierre.
//
// Una precarga es el PLAN, no una medida: por eso cada precargado deja su testigo
// (`primedLoadKg`, `repsPrimedSegmentIndex`, `setsPrimedSegmentIndex`) y solo lo
// que el atleta toca cuenta como declarado. Es lo que impide que una prescripción
// de 100 kg vuelva al coach como «levantó 100».
extension WorkoutSession {
    /// Pre-fills the manual load field for the current strength/sled segment from
    /// the prescription. Called when a segment becomes current so the athlete
    /// only has to adjust, not type from scratch. Idempotent: won't clobber a
    /// value the athlete already edited for this same segment.
    ///
    /// The primed value is remembered in `primedLoadKg` so `loadConfirmed` can
    /// tell "the coach wrote 100" from "the athlete says 100" — priming feeds the
    /// HUD, it never feeds the record. Mirrors `primeRepsIfNeeded`.
    func primeManualLoadIfNeeded() {
        guard manualLoadKg == nil,
              let seg = currentSegment,
              seg.kind == .strength || seg.kind == .sled,
              let kg = seg.loadKg else { return }
        manualLoadKg = kg
        primedLoadKg = kg
    }

    /// Pre-fills the current segment's reps from the prescription so an untouched
    /// advance records the PRESCRIBED value (confirmed=false), never a fabricated
    /// 0. Idempotent per segment (the `repsPrimedSegmentIndex` sentinel), so it
    /// never clobbers an athlete edit or a reopened lap. Open-score (AMRAP) and
    /// target-less reps are NOT primed — there reps count up from a legal 0.
    /// Mirrors `primeManualLoadIfNeeded`.
    func primeRepsIfNeeded() {
        guard repsPrimedSegmentIndex != currentSegmentIndex, let seg = currentSegment else { return }
        repsPrimedSegmentIndex = currentSegmentIndex
        repsConfirmed = false
        repsSkipped = false
        guard seg.repsArePrimable, let prescribed = seg.prescribedRepsForLog else { return }
        repsCurrentSegment = prescribed
    }

    /// Builds the per-set strength records for a multi-set segment. Reps default to
    /// the prescribed value (confirmed=false until touched — the rep rule); the
    /// ACTUAL LOAD starts nil, because a load nobody declared is not a load that was
    /// lifted. The prescription stays visible in `loadPrescribedKg` (the HUD reads it
    /// for display), and `confirmSet` promotes it to actual on the athlete's tap.
    /// Idempotent per segment; clears the list for non-multi-set segments.
    func primeSetsIfNeeded() {
        guard setsPrimedSegmentIndex != currentSegmentIndex else { return }
        setsPrimedSegmentIndex = currentSegmentIndex
        // La pausa es del tramo que tienes delante: al cambiar de ejercicio se
        // olvida, o el primer «Pausa» del curl heredaría el reloj de la banca.
        lastSetClosedElapsed = nil
        guard let seg = currentSegment, seg.usesMultiSetStrength,
              let sets = seg.prescription?.sets else {
            setRecords = []
            return
        }
        setRecords = sets.enumerated().map { i, s in
            SetRecord(
                setIndex: i + 1,
                repsPrescribed: s.prescribedReps,
                repsPrescribedMax: s.prescribedRepsMax, // la banda, solo para enseñarla
                repsActual: s.prescribedReps,          // default = did as written (el SUELO)
                loadPrescribedKg: s.prescribedLoadKg,
                loadActualKg: nil,                     // unknown until the athlete says so
                rpe: nil,                              // collected only if entered
                rir: nil,
                status: "done",                        // assumed until touched/skipped
                confirmed: false,
                tempo: s.tempo,
                // EL DESCANSO DEL BLOQUE VALE PARA SUS SERIES (card 110).
                //
                // El coach escribe «descanso 2:00» UNA vez para el ejercicio, no
                // repetido en cada serie: así lo guarda el plan y así se lee. Aquí
                // solo se miraba el descanso de la serie, que en un plan normal
                // viene vacío — y sin segundos no arranca la cuenta atrás, así que
                // no había ni descanso visible ni aviso al acabarlo. El 20-ago Alex
                // hizo peso muerto con 120 s prescritos y no vio ninguno.
                //
                // El de la serie sigue mandando cuando existe: una serie puede pedir
                // su propio descanso (la última de una bajada, por ejemplo) y eso es
                // más específico que el del bloque.
                restS: s.restS ?? seg.prescription?.restS,
                // La aproximación viaja desde la prescripción hasta el registro: si
                // no llega aquí, la analítica no puede separarla del trabajo real,
                // que es todo el motivo de que exista (card 151).
                isApproach: s.isApproach ?? false
            )
        }
    }

    /// Defaults the block-scoped Rx/Scaled to "rx" for a metcon-family block (the
    /// athlete switches to "scaled" if they deviated); nil for non-metcon blocks.
    /// Only sets a default when unset, so it stays stable across the block's segments.
    func primeRxScaledIfNeeded() {
        if currentSegmentIsMetcon {
            if rxScaled == nil { rxScaled = "rx" }
        } else {
            rxScaled = nil
            scaledNote = nil
        }
    }

    // MARK: - Per-set strength logging

    /// Confirm a set "as written" — marks it confirmed, recomputes done/scaled,
    /// and fires the rest timer from its prescribed rest. One tap = did as prescribed.
    ///
    /// This tap is the DECLARATION: only here does the prescribed load become the
    /// actual one. Priming never does it (see `primeSetsIfNeeded`), so a set the
    /// athlete never touched reaches the coach with `load_actual_kg` null instead
    /// of echoing the plan back as if it had been measured.
    func confirmSet(_ index: Int) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].confirmed = true
        if setRecords[index].loadActualKg == nil {
            setRecords[index].loadActualKg = setRecords[index].loadPrescribedKg
        }
        // Stamp latest sensor velocity onto the set being closed (fase 3).
        if let c = sensorConclusions {
            stampVelocity(on: index, from: c)
            // Provenance: sensor prefill then athlete confirm → sensor_corrected;
            // pure athlete → athlete_tap; pure sensor (no touch of reps) stays sensor.
            if setRecords[index].repsSource == RepsSource.sensor.rawValue {
                setRecords[index].repsSource = RepsSource.sensorCorrected.rawValue
            } else if setRecords[index].repsSource == nil {
                setRecords[index].repsSource = RepsSource.athleteTap.rawValue
            }
        } else if setRecords[index].repsSource == nil {
            setRecords[index].repsSource = RepsSource.athleteTap.rawValue
        }
        recomputeSetStatus(index)
        registerFirstWorkingSet()
        lastSetClosedElapsed = elapsedSeconds
        startRest(setRecords[index].restS)
        // Next set is a new tramo: remo after squat must re-zero now, not on
        // the next PM5 sample (that sample would still belong to the squat).
        syncTramoIfNeeded()
    }

    /// El último avance de fuerza: la serie que acabas de cerrar vuelve a pendiente.
    /// Las anteriores se quedan. El descanso de esa serie se apaga.
    func unconfirmLastSet() {
        guard let i = setRecords.lastIndex(where: { $0.confirmed }) else { return }
        if setRecords[i].status == "skipped" {
            setRecords[i].repsActual = setRecords[i].repsPrescribed
            setRecords[i].loadActualKg = nil
        } else if setRecords[i].loadActualKg == setRecords[i].loadPrescribedKg {
            setRecords[i].loadActualKg = nil
        }
        setRecords[i].confirmed = false
        setRecords[i].status = "done"
        setRecords[i].repsSource = nil
        setRecords[i].repsConfidence = nil
        setRecords[i].meanVelocityFirstMs = nil
        setRecords[i].meanVelocityLastMs = nil
        setRecords[i].velocityLossPct = nil
        setRecords[i].velocityConfidence = nil
        if !setRecords.contains(where: { $0.confirmed }) {
            lastSetClosedElapsed = nil
        }
        dismissRest()
        Haptics.light()
        syncTramoIfNeeded()
    }

    /// CUÁNTO LLEVAS DESDE QUE SOLTASTE LA BARRA. Sigue corriendo cuando el descanso
    /// prescrito se agota, que es justo cuando el atleta deja de tener referencia.
    ///
    /// Sustituye a la «vuelta» en el hierro: `lapElapsedSeconds` cuenta desde que se
    /// abrió el TRAMO, así que en un 4×10 sumaba las cuatro series y sus tres
    /// descansos sin reiniciar nunca — un número que no contesta ninguna pregunta que
    /// el atleta se haga («suma rara, poco útil»). El total de la sesión, que sí
    /// contesta una, se queda donde estaba.
    var secondsSinceLastSet: Double? {
        guard let t = lastSetClosedElapsed else { return nil }
        return Swift.max(0, elapsedSeconds - t)
    }

    func setSetReps(_ index: Int, _ reps: Int) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].repsActual = max(0, reps)
        setRecords[index].confirmed = true
        recomputeSetStatus(index)
        registerFirstWorkingSet()
    }

    func setSetLoad(_ index: Int, _ kg: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].loadActualKg = kg.map { max(0, $0) }
        setRecords[index].confirmed = true
        recomputeSetStatus(index)
        registerFirstWorkingSet()
    }

    /// Ajustar la carga EN VIVO con herencia (IMG_2385: "en la siguiente serie
    /// quiero subir de peso"): fija la carga de `index` y la HEREDAN todas las
    /// series posteriores aún no hechas ni saltadas. Las hechas conservan su peso
    /// real — el registro que ve el coach es lo que de verdad se levantó. Solo la
    /// serie editada se marca confirmada; las herederas siguen pendientes con el
    /// nuevo objetivo.
    func setSetLoadCascade(_ index: Int, _ kg: Double?) {
        setSetLoad(index, kg)
        guard let value = kg.map({ max(0, $0) }) else { return }
        for i in setRecords.indices where i > index
            && !setRecords[i].confirmed && setRecords[i].status != "skipped" {
            setRecords[i].loadActualKg = value
        }
    }

    func setSetRPE(_ index: Int, _ rpe: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].rpe = rpe
        setRecords[index].confirmed = true
    }

    func setSetRIR(_ index: Int, _ rir: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].rir = rir
        setRecords[index].confirmed = true
    }

    func setSetSkipped(_ index: Int, _ skipped: Bool) {
        guard setRecords.indices.contains(index) else { return }
        if skipped {
            setRecords[index].status = "skipped"
            setRecords[index].repsActual = nil
            setRecords[index].loadActualKg = nil
        } else {
            // Un-skip: restore prescribed defaults and recompute.
            setRecords[index].repsActual = setRecords[index].repsPrescribed
            setRecords[index].loadActualKg = setRecords[index].loadPrescribedKg
            recomputeSetStatus(index)
        }
        setRecords[index].confirmed = true
    }

    /// done when reps AND load match the prescription, else scaled. A skipped set
    /// stays skipped (only `setSetSkipped` clears it).
    private func recomputeSetStatus(_ index: Int) {
        guard setRecords.indices.contains(index) else { return }
        guard setRecords[index].status != "skipped" else { return }
        let s = setRecords[index]
        let repsDiff = s.repsPrescribed != nil && s.repsActual != s.repsPrescribed
        let loadDiff = s.loadPrescribedKg != nil && s.loadActualKg != nil
            && s.loadActualKg != s.loadPrescribedKg
        setRecords[index].status = (repsDiff || loadDiff) ? "scaled" : "done"
    }

    // MARK: - Rest timer (per-set strength)

    /// Start a rest countdown from a set's prescribed rest. No-op when there's no
    /// prescribed rest. Drives off the same 0.25s tick as the main clock.
    func startRest(_ seconds: Int?) {
        guard let s = seconds, s > 0 else { return }
        restTotalSeconds = Double(s)
        restRemainingSeconds = Double(s)
        restEndsTramo = false
    }

    func dismissRest() {
        restRemainingSeconds = 0
        restTotalSeconds = 0
        restEndsTramo = false
    }
}
