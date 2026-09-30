import Foundation

// CORRER ES CORRER: SIN PUERTAS A MITAD DE CARRERA, Y EL FINAL QUE SE GUARDA SOLO (P9).
//
// La puerta de bloque (`armBlock`) es lo que pide al atleta un «Empezar» entre dos bloques del coach. En
// gimnasio tiene sentido —hay que poner los discos—; corriendo, no: del calentamiento a las series el reloj
// pasa solo. Lo anuncia el preaviso del propio paso (los 10 s del método, `ReglasAviso.preavisoS`, ya salen
// del director al final de un paso largo) y arranca con su 3-2-1, no con una pausa nueva. «Hasta pulsar» es
// MÉTODO del coach (`WristMethod.run.gate`, defecto solo): con `.manual` la puerta sigue como siempre.
extension WorkoutSession {

    /// ¿De calentar a las series se pasa solo? Dato del coach con defecto.
    var puertaCalentamientoAuto: Bool { (plan.wristMethod?.run.gate ?? .auto) == .auto }

    private func esCarrera(_ segmento: WorkoutSegment) -> Bool { segmento.kind == .running || segmento.hasRunStructure }

    /// La puerta entre un calentamiento de correr y la parte de correr que le sigue no se pone.
    /// Solo hacia delante y solo de correr a correr: una puerta entre el calentamiento y un bloque de
    /// hierro (los discos) o de un circuito se queda.
    func pasaSinPuerta(desde origin: Int) -> Bool {
        guard puertaCalentamientoAuto, currentSegmentIndex > origin,
              origin >= 0, currentSegmentIndex < plan.segments.count else { return false }
        let de = plan.segments[origin]
        let a = plan.segments[currentSegmentIndex]
        return de.blockPhase == .warmup && a.blockPhase != .warmup && a.blockPhase != .cooldown
            && esCarrera(de) && esCarrera(a)
    }

    /// Entra en el bloque que sigue sin aparcar en su puerta: el reloj no se para y el paso arranca con su
    /// 3-2-1. Lo demás que hace `armBlock` (la elección Rx/Escalado es del bloque) se reinicia igual.
    func entrarSinPuerta() {
        awaitingGate = nil
        isAwaitingBlockStart = false
        isPaused = false
        lastTick = Date()
        rxScaled = nil
        scaledNote = nil
        onEnterSegment()
        persistNow()
    }

    /// Un calentamiento de correr que es UN solo tramo con su medida (tiempo o metros) se cierra solo al
    /// cumplirla, para que «se pasa solo» también valga cuando nadie toca. Una lista de movilidad, un calentamiento
    /// con varias piezas o uno seguido de otra cosa que correr no se cierran solos: eso lo decide el atleta. Una
    /// cinta que aún no se ha movido tampoco (`tramoClockArmed`): el reloj de ese tramo no ha empezado.
    func cerrarCalentamientoCumplido() {
        guard puertaCalentamientoAuto, !isRunStructureActive, currentBlockIsStructural, !tramoClockArmed,
              let region = currentBlockRegion, region.phase == .warmup,
              plan.segments(in: region).count == 1, let seg = currentSegment, seg.kind == .running,
              let siguiente = nextSegment, esCarrera(siguiente), siguiente.blockPhase != .cooldown else { return }
        let cumplido: Bool
        if let s = seg.targetDurationSeconds, s > 0 {
            cumplido = lapElapsedSeconds >= Double(s)
        } else if let m = seg.targetDistanceMeters, m > 0 {
            cumplido = (tramoRunCoveredMeters ?? 0) >= m
        } else {
            return
        }
        if cumplido { completeStructuralBlock() }
    }

    // MARK: - El enfriamiento libre se guarda solo

    /// Tras «Seguir» (enfriamiento libre) nadie se queda con el reloj grabando un enfriamiento que ya acabó:
    /// pasado `guardarQuietoS` sin metros medidos (dato del coach, defecto 10′) la sesión se guarda sola, y el
    /// resumen lo dice (`guardadaSolaTrasS`). Solo corriendo: en el hierro «seguir» es otra serie, y quieto es
    /// lo normal.
    func guardarSiQuieto(ahora: Date = Date()) {
        guard isExtraWork, !isFinished, tramoIsRun else { return }
        let desde = extraWorkSince ?? ahora
        extraWorkSince = desde
        let quietoS = ahora.timeIntervalSince(Swift.max(desde, lastMeasuredWorkAt ?? desde))
        let limiteS = Vivo.metodoResumen(de: plan.wristMethod).guardarQuietoS
        guard quietoS >= limiteS else { return }
        guardadaSolaTrasS = limiteS
        finish()
    }
}
