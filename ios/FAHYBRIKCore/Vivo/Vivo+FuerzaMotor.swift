import Foundation

// LA FUERZA EN EL VIVO DEL IPHONE — los tres gestos que el contrato firmado
// (`iphone-vivo-fuerza`) pide y que el motor deja a quien lo conduce. No cambian
// el motor: usan su API pública (`primaryAdvance`, `startRest`, `beginBlock`,
// `reanchorTramoDeviceWindowAtGo`) igual que la usa el host.
//
//   1. LA ÚLTIMA SERIE LLEVA AL SIGUIENTE EJERCICIO. Con todas las series
//      cerradas y sin descanso corriendo, el ejercicio está hecho: se cierra y se
//      entra en el siguiente, también a través de la puerta de bloque — el
//      descanso con «Viene: B1 · Deadlift · 8 × 140 kg» y su «Empezar ya» YA son
//      esa puerta. Nunca la serie 1 otra vez ni una pantalla parada.
//   2. UNA SERIE POR TIEMPO SE CIERRA SOLA al cumplir su tiempo (lo mide el reloj).
//   3. «COLÓCATE» (`Vivo.necesitaColocate`) delante de una serie por tiempo que no
//      viene de un descanso: corre como el descanso del motor, con su 3-2-1, y al
//      acabar el reloj de la serie arranca de cero.
//
// Viven en Core (no en la vista del iPhone) porque los usan los tres que llevan o
// alimentan el motor: el vivo del iPhone, el reloj en solitario (`MunecaAlimentador`)
// y el móvil cuando lo lleva la muñeca en espejo (`PhoneMirrorCommandRelay`).

extension WorkoutSession {

    /// «+30 s» del descanso, del que corra: el de la serie de fuerza, el de una lista fija, el de un rotativo o el de un
    /// EMOM. Devuelve si había algún descanso al que sumar.
    @discardableResult
    func vivoSumar30() -> Bool {
        if restRemainingSeconds > 0 { restRemainingSeconds += 30; restTotalSeconds += 30 }
        else if fixedRestRemaining > 0 { fixedRestRemaining += 30; fixedRestTotal += 30 }
        else if rotPhase == .rest { rotPhaseRemaining += 30 }
        else if emomPhase == .rest { emomPhaseRemaining += 30 }
        else { return false }
        return true
    }

    /// Tras cerrar una serie a mano o sola: sigue al siguiente ejercicio si era la
    /// última, o abre «Colócate» si la que viene es por tiempo y no hay descanso.
    func vivoTrasCerrarSerie() {
        guard let seg = currentSegment, seg.usesMultiSetStrength, restRemainingSeconds <= 0 else { return }
        if let k = pendingSetIndex {
            if Vivo.necesitaColocate(seg, serie: k) { startRest(Int(Vivo.colocateSDefecto)) }
        } else {
            vivoSeguirAlSiguienteEjercicio()
        }
    }

    /// Acaba un descanso (solo o con «Empezar ya»): si no queda serie, al siguiente
    /// ejercicio; si la que viene es por tiempo, su reloj arranca AHORA.
    func vivoAlAcabarDescanso() {
        guard let seg = currentSegment, seg.usesMultiSetStrength, restRemainingSeconds <= 0, !isAwaitingBlockStart else { return }
        guard let k = pendingSetIndex else { vivoSeguirAlSiguienteEjercicio(); return }
        if Vivo.segundosDeSerie(seg, k) != nil { reanchorTramoDeviceWindowAtGo() }
    }

    /// Cada latido: la serie por tiempo que ha cumplido su tiempo se cierra sola.
    func vivoCerrarSerieCumplida() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, restRemainingSeconds <= 0,
              let seg = currentSegment, seg.usesMultiSetStrength, let k = pendingSetIndex,
              let s = Vivo.segundosDeSerie(seg, k), tramoElapsedSeconds >= Double(s) else { return }
        primaryAdvance()
        vivoTrasCerrarSerie()
    }

    /// El ejercicio está hecho: se cierra y se entra en el siguiente sin parar en la
    /// puerta (el descanso que acaba de terminar ya anunciaba lo que viene).
    private func vivoSeguirAlSiguienteEjercicio() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, !setRecords.isEmpty, pendingSetIndex == nil else { return }
        primaryAdvance()
        if isAwaitingBlockStart, !isFinished { beginBlock() }
    }
}
