import SwiftUI

// LA MUÑECA EN SOLITARIO — la pila nueva alimentada por el motor local.
//
// Sin iPhone llevando el entreno, el reloj es quien corre: `WorkoutSession` es la
// fuente, el coordinador guarda la ventana del ritmo actual (la llena
// `onDistanceDelta`, lo que entrega el builder de Salud) y el GPS sale de la
// precisión del último fijado. Esta vista solo junta esas fuentes, pide el cuadro
// y se lo da a `MunecaVivo`. No decide nada de lo que se pinta.

struct MunecaSolo: View {
    let session: WorkoutSession

    @Environment(\.isLuminanceReduced) private var atenuado
    @State private var alimentador: MunecaAlimentador

    @MainActor
    init(session: WorkoutSession, coordinator: WatchWorkoutCoordinator = .shared, owner: WatchPrimaryOwner = .shared) {
        self.session = session
        _alimentador = State(initialValue: MunecaAlimentador(
            session: session,
            ritmoActual: { coordinator.ventanaDeRitmo.ritmo(ahora: $0) },
            gps: { Vivo.estadoGps(precisionM: owner.gpsAccuracyM) },
            pausar: { coordinator.togglePause() },
            terminar: { coordinator.finishWorkout(completeness: .partial) }
        ))
    }

    var body: some View {
        MunecaMedidor { medidas in
            let e = alimentador.estado()
            MunecaVivo(
                cuadro: alimentador.cuadro(e, medidas: medidas, alwaysOn: atenuado),
                alPaso: e.paso.id,
                mandos: alimentador.mandos(e)
            )
        }
        .task {
            while !Task.isCancelled {
                alimentador.observar()
                try? await Task.sleep(for: .milliseconds(MunecaAlimentador.miradaMs))
            }
        }
    }
}
