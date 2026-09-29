import Foundation

// Acciones del atleta sobre los bloques: guardar, saltar, reiniciar e ir a otro.
// Ninguna toca el guardado del entreno entero.
extension WorkoutSession {

    /// Los bloques del entreno, en orden.
    var bloques: [WorkoutBlockRegion] { plan.blockRegions }

    /// True cuando el bloque tiene alguna vuelta cerrada.
    func bloqueTieneTrabajo(_ region: WorkoutBlockRegion) -> Bool {
        let ids = Set(plan.segments(in: region).map(\.id))
        return laps.contains { ids.contains($0.segmentId) }
    }

    /// Cierra el bloque con lo hecho y aparca en la puerta del siguiente.
    func guardarBloqueYSeguir() {
        endBlockEarly()
    }

    /// Pasa al siguiente bloque sin registrar nada de éste.
    func saltarBloque() {
        guard !isFinished, let region = currentBlockRegion else { return }
        let siguiente = region.lastIndex + 1
        guard siguiente < plan.segments.count else {
            finishPrescribedWork()
            return
        }
        irAlSegmento(siguiente)
    }

    /// Vuelve al primer movimiento del bloque y descarta sus vueltas cerradas.
    func reiniciarBloque() {
        guard !isFinished, let region = currentBlockRegion else { return }
        let ids = Set(plan.segments(in: region).map(\.id))
        laps.removeAll { ids.contains($0.segmentId) }
        irAlSegmento(region.firstIndex)
    }

    /// Salta a otro bloque del entreno.
    func irAlBloque(_ region: WorkoutBlockRegion) {
        guard !isFinished else { return }
        irAlSegmento(region.firstIndex)
    }

    /// Aterriza en la puerta del bloque, con el reloj parado.
    ///
    /// Lo que se llevaba del tramo que se deja NO se registra (saltar e ir no
    /// cierran vuelta) y tampoco se arrastra: el reloj del tramo vuelve a cero y
    /// con él TODO lo que se acumulaba contra ese reloj —pulso, zonas, máquina,
    /// series—. Antes solo se ponían a cero el reloj y las reps, y el tramo
    /// siguiente heredaba las zonas del abandonado: 1.029 s de zonas en un tramo
    /// de 690 s (0278).
    private func irAlSegmento(_ index: Int) {
        guard index >= 0, index < plan.segments.count else { return }
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        discardCurrentLiveState()
        currentSegmentIndex = index
        armBlock()
        Haptics.medium()
        persistNow()
    }
}
