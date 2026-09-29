import Foundation
import Observation

// LO QUE HOY CARGA POR SU CUENTA.
//
// El resto de la portada sale del `AppDataStore` (plan, disposición, carrera, chat…). Estas cinco
// lecturas no: cuelgan del dispositivo o de un endpoint que ninguna otra pestaña comparte, y
// cada una vivía dentro de una tarjeta que se cargaba sola (`TestBatteryInicioSection`,
// `ReviewTodayCard`, `DoblesLiveBanner` en Inicio, `WorkoutResumeBanner`, los pasos). Ahora las
// carga un solo sitio y las pinta el resto como filas de «Contigo» — la lógica de carga es la de
// siempre; lo que cambia es dónde vive.
//
// Todas son silenciosas si fallan: un dato que no llegó es «desconocido» (nil) y no se pinta como
// «no hay» (§7). Las tres que dependen de un coach (batería, revisión, pareja) no se piden sin coach.

@MainActor
@Observable
final class HoyModelo {

    /// El estado de la batería de tests. Nil = aún no se ha podido leer: mejor nada que una invitación
    /// que contradiga la batería que el atleta sí tiene.
    private(set) var bateria: BatteryStatus?
    private(set) var revision: AthleteReviewState?
    /// La revisión que se acaba de reservar: gana al estado cargado hasta el próximo refresco.
    private(set) var revisionReservada: AthleteReviewAppointment?
    private(set) var parejaEnVivo: PartnerLiveStatus?
    /// El entreno guardado para luego, si su instantánea sigue siendo válida.
    private(set) var guardado: PersistedWorkoutState?
    /// Nil = Salud aún no ha contestado.
    private(set) var pasos: HealthKitStepsReader.Reading?

    // MARK: - Cargas

    /// Todo lo de una vez (al abrir y al tirar para refrescar). `esPareja` evita la llamada a un atleta
    /// solo; sin coach no se piden ni la batería ni la revisión.
    func cargarTodo(bearer: String?, conCoach: Bool, esPareja: Bool) async {
        async let p: Void = cargarPasos()
        async let g: Void = cargarGuardado()
        if conCoach {
            async let b: Void = cargarBateria(bearer: bearer)
            async let r: Void = cargarRevision(bearer: bearer)
            async let v: Void = cargarParejaEnVivo(bearer: bearer, esPareja: esPareja)
            _ = await (p, g, b, r, v)
        } else {
            _ = await (p, g)
        }
    }

    func cargarBateria(bearer: String?) async {
        guard let bearer else { bateria = nil; return }
        // Si falla se conserva la última buena; si nunca la hubo, se queda callado.
        if let leida = try? await TestBatteryService.fetchStatus(bearer: bearer) { bateria = leida }
    }

    func cargarRevision(bearer: String?) async {
        revision = await ReviewService.fetchState(bearer: bearer)
    }

    /// Un fetch de la presencia de la pareja, solo para un par de dobles. Un error deja la fila escondida.
    func cargarParejaEnVivo(bearer: String?, esPareja: Bool) async {
        guard esPareja else { parejaEnVivo = nil; return }
        if case .ok(let estado) = await DoblesLiveClient.fetch(bearer: bearer) { parejaEnVivo = estado }
    }

    func cargarPasos() async {
        pasos = await HealthKitStepsReader.todaySteps()
    }

    /// El entreno guardado, con las mismas reglas de siempre: una asignación se ofrece solo si es LA misma
    /// y es reciente; uno libre, solo si es reciente (`WorkoutRecoveryGate`).
    func cargarGuardado() async {
        guard let candidato = await WorkoutStateStore.shared.load() else { guardado = nil; return }
        let ofrecer: Bool = {
            if let id = candidato.assignmentId, !id.isEmpty {
                return WorkoutRecoveryGate.shouldOffer(saved: candidato, currentAssignmentId: id)
            }
            return WorkoutRecoveryGate.isFresh(candidato)
        }()
        guardado = ofrecer ? candidato : nil
    }

    /// El atleta acaba de reservar hueco: la fila pasa a «reservada» sin esperar otra carga.
    func revisionReservada(_ cita: AthleteReviewAppointment) {
        revisionReservada = cita
    }

    // MARK: - Hacia la lectura

    /// Lo guardado que se ofrece, salvo que haya un entreno vivo (en curso o minimizado): entonces el que
    /// manda es el vivo, que ya lleva su propia barra.
    func guardadoOfrecido(hayEntrenoVivo: Bool) -> (titulo: String, guardadoEn: Date)? {
        guard let g = guardado, !hayEntrenoVivo else { return nil }
        return (g.plan.name, g.savedAt)
    }
}
