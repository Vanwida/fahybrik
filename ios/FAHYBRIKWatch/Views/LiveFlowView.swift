import SwiftUI

// EL VIVO DEL RELOJ EN SOLITARIO: qué pantalla lleva el entreno.
//
// Casi todo lo que se entrena con reloj (correr, fuerza, ergo, WOD, circuito, dobles) lo pinta la pila nueva de
// la muñeca (`Muneca/MunecaSolo`, desde `Vivo.CuadroMuneca`): la regla de qué cubre es UNA y vive en el núcleo
// (`Vivo.familiaMuneca`). Aquí solo se elige entre cuatro:
//
//   · el final natural de un plan que acabó solo («Sesión completada», `FinalNaturalView`);
//   · la puerta de un bloque, que espera «Empezar» (`BlockGateView`);
//   · la pila, mientras haya algo que medir;
//   · la lista de un calentamiento o una vuelta a la calma, que no mide nada y se tacha (`ChecklistLiveView`).
struct LiveFlowView: View {
    let session: WorkoutSession

    var body: some View {
        if session.isAwaitingFinishDecision {
            // El plan acabó solo: «Sesión completada» y la decisión (Guardar o Seguir), en cualquier cara.
            FinalNaturalView(session: session)
        } else if session.isAwaitingBlockStart {
            BlockGateView(session: session)
        } else if esRodaje || MunecaCubierta.cubre(session) {
            MunecaSolo(session: session)
        } else {
            ChecklistLiveView(session: session)
        }
    }

    /// Correr de corrido o a series de calle: la pila lo pinta aunque el bloque no traiga pasos de trabajo todavía.
    private var esRodaje: Bool {
        session.isRunStructureActive || session.currentSegment?.kind == .running
    }
}
