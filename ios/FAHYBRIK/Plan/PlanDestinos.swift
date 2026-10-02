import SwiftUI

// A DÓNDE LLEVA LA PESTAÑA PLAN — todo lo que se presenta encima de ella, en un solo sitio.
//
// Es la pestaña CON coach (la del atleta libre presenta lo suyo, que es otra cosa). Son los mismos destinos
// de siempre (el diseño cambia cómo se llega a ellos, no a dónde llevan): el entreno
// en vivo, lo registrado de uno hecho, el constructor de un libre, el plan de la pareja, el historial, el
// ciclo, el chat, la hoja de técnica y la tarjeta para compartir la semana, más el aviso de «tienes un entreno
// en curso» (`LiveWorkoutLaunchConflict`). Viven aparte de `PlanView` para que la composición de la pantalla
// se lea sin atravesar diez presentaciones, y porque son UNA sola cosa: lo que sale de esta pestaña.
//
// Un `@Observable` propio no cruza una frontera de presentación: las que leen el store (`ChatView`,
// `PlanCicloView`) lo reciben inyectado a mano.

struct PlanDestinos: ViewModifier {
    @Environment(AppDataStore.self) private var store

    let bearer: String?

    @Binding var workoutLaunch: WorkoutLaunch?
    @Binding var executedLaunch: WorkoutLaunch?
    @Binding var freeEditAssignmentId: String?
    @Binding var showPartnerPlan: Bool
    @Binding var showHistory: Bool
    @Binding var showCiclo: Bool
    @Binding var showChat: Bool
    @Binding var contextoDelChat: ChatContextChoice?
    @Binding var techniqueTarget: AthleteWeekDaySession?
    @Binding var tarjetaParaCompartir: TarjetaCompartible?
    @Binding var showLaunchConflict: Bool

    let conflictSnapshotTitle: String?
    /// El cover del entreno se cerró (por cualquier vía): la tira de retomar tiene que volver a mirar el store.
    let alCerrarEntreno: () -> Void
    /// Algo cambió en el servidor: se recarga el plan.
    let alCambiarElPlan: () -> Void
    let alRetomar: () -> Void
    let alTerminarYEmpezar: () -> Void
    let alPreguntarPorEntrenoPasado: (AthleteHistorySession, String) -> Void
    let alPreguntarPorEjercicio: (EjercicioSeñalado, AthleteWeekDaySession) -> Void

    func body(content: Content) -> some View {
        content
            .liveWorkoutLaunchConflict(
                isPresented: $showLaunchConflict,
                snapshotTitle: conflictSnapshotTitle,
                onResume: alRetomar,
                onEndAndStart: alTerminarYEmpezar
            )
            .fullScreenCover(item: $workoutLaunch) { launch in
                WorkoutContainer(
                    assignmentId: launch.assignmentId,
                    fallbackTitle: launch.title,
                    bearer: bearer,
                    hrZones: store.identity.value?.hrZones,
                    empiezaDirecto: launch.empiezaDirecto,
                    contextoFicha: launch.contexto,
                    onClose: {
                        workoutLaunch = nil
                        // «Salir y seguir luego» cierra por AQUÍ (igual que un descarte o un back de brief): la
                        // tira de retomar tiene que volver a mirar el store justo ahora.
                        alCerrarEntreno()
                    },
                    onCompleted: { _ in
                        workoutLaunch = nil
                        alCerrarEntreno()
                        alCambiarElPlan()
                    }
                )
            }
            .fullScreenCover(item: $executedLaunch) { launch in
                ExecutedWorkoutView(
                    assignmentId: launch.assignmentId,
                    fallbackTitle: launch.title,
                    bearer: bearer,
                    hrZones: store.identity.value?.hrZones,
                    onClose: { executedLaunch = nil },
                    onStale: alCambiarElPlan
                )
            }
            .fullScreenCover(isPresented: Binding(
                get: { freeEditAssignmentId != nil },
                set: { if !$0 { freeEditAssignmentId = nil } }
            )) {
                if let editId = freeEditAssignmentId, let id = Int(editId) {
                    FreeWorkoutBuilderView(
                        bearer: bearer,
                        editingAssignmentId: id,
                        hrZones: store.identity.value?.hrZones,
                        onClose: { freeEditAssignmentId = nil },
                        onCompleted: {
                            freeEditAssignmentId = nil
                            alCambiarElPlan()
                        }
                    )
                }
            }
            .fullScreenCover(isPresented: $showPartnerPlan) {
                DoblesPlanView(bearer: bearer)
            }
            .fullScreenCover(isPresented: $showHistory) {
                HistoryView(
                    bearer: bearer,
                    onClose: { showHistory = false },
                    // Preguntar por un entreno YA hecho: se cierra el historial y el chat se abre con ese entreno
                    // señalado. El relevo se resuelve aquí porque las dos presentaciones son de esta pantalla.
                    onPreguntar: { sesion, iso in
                        showHistory = false
                        alPreguntarPorEntrenoPasado(sesion, iso)
                    },
                    onFreeSessionDeleted: alCambiarElPlan
                )
            }
            .fullScreenCover(isPresented: $showCiclo) {
                // El sujeto del ciclo sale de su propio camino, no de esta pantalla: pasarle el nombre del bloque
                // sería una segunda fuente del mismo dato.
                PlanCicloView(bearer: bearer, onClose: { showCiclo = false })
                    .environment(store)
            }
            .sheet(isPresented: $showChat, onDismiss: { contextoDelChat = nil }) {
                // Un valor de entorno `@Observable` propio NO cruza una frontera de presentación: `ChatView` lee su
                // historial cache-first del store.
                ChatView(bearer: bearer, contextoInicial: contextoDelChat)
                    .environment(store)
            }
            .sheet(item: $techniqueTarget) { session in
                SessionExercisesSheet(
                    assignmentId: session.assignmentId,
                    sessionTitle: session.title,
                    bearer: bearer,
                    // Preguntar por UN ejercicio: se cierra el índice y el chat se abre con ese ejercicio ya señalado.
                    onPreguntar: { ejercicio in
                        techniqueTarget = nil
                        alPreguntarPorEjercicio(ejercicio, session)
                    }
                )
            }
            .sheet(item: $tarjetaParaCompartir) { tarjeta in
                CompartirSheet(tarjeta: tarjeta)
            }
    }
}
