import Foundation
import OSLog

// EL LIBRE SE GUARDA COMO PLAN AL EMPEZAR — y desde ahí es una asignación normal.
//
// El hueco (auditoría 28-sep): un libre creado en el momento se corría con un plan
// montado en el móvil y se guardaba al final por `POST /free`, que CREA el plan y
// la ejecución a la vez. Era otro objeto que una sesión del coach: otro guardado,
// sin `template_segment_id` en ningún tramo, y otro código que mantener.
//
// Ahora, con conexión, al pulsar EMPEZAR se guarda el plan (`POST /free/plan`) en
// segundo plano mientras el atleta ya entrena. La respuesta trae la asignación y
// los ids de sus segmentos en orden; se estampan en la sesión, y el guardado de al
// final va por el camino del coach (`/api/sync/workout-execution`) con cada tramo
// enlazado a su ejercicio por `itemIndex`. Sin conexión, la petición falla, la
// sesión se queda sin asignación y el final va por `POST /free` con `item_index`
// en cada tramo — el servidor lo enlaza por posición.
//
// Por qué al EMPEZAR y no al abrir el constructor: el plan existe si el entreno
// existe. Un atleta que monta un entreno y se echa atrás no deja una sesión
// «pendiente» en su plan de hoy.
@MainActor
final class FreePlanFirst {
    static let shared = FreePlanFirst()

    private let log = Logger(subsystem: "com.fahybrid.app", category: "free-plan-first")
    /// La petición en curso por sesión, para que el guardado espere a su resultado
    /// en vez de adelantarse y mandar el entreno dos veces (plan + `/free`).
    private var enCurso: [ObjectIdentifier: Task<Void, Never>] = [:]

    /// Guarda el plan de esta sesión libre, sin bloquear el arranque.
    func begin(session: WorkoutSession, payload: FreePlanSavePayload, bearer: String?) {
        guard session.assignmentId == nil, let bearer else { return }
        let key = ObjectIdentifier(session)
        guard enCurso[key] == nil else { return }
        enCurso[key] = Task { @MainActor [log] in
            do {
                let binding = try await FreePlanSaveAPI.save(payload, bearer: bearer)
                // El plan llegó TARDE: el resumen ya guardó el entreno por `/free`,
                // que crea su propio plan. Este sobra — se borra, no se ata.
                if session.freeSavedAtEnd {
                    if let id = Int(binding.assignmentId) {
                        try? await PlanService.deleteFreeSession(assignmentId: id, bearer: bearer)
                    }
                    return
                }
                session.assignmentId = binding.assignmentId
                session.freePlanSegmentIds = binding.segmentIds
                session.persistNow()
            } catch {
                log.info("plan libre sin guardar antes de correr: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// Espera a que termine la petición de esta sesión (si la hay). El resumen lo
    /// llama antes de decidir por dónde guarda. Tiene tope: sin respuesta en ese
    /// tiempo se guarda sin plan, como sin conexión.
    func settle(_ session: WorkoutSession, timeout: TimeInterval = FreePlanFirst.esperaMaxima) async {
        guard let task = enCurso[ObjectIdentifier(session)] else { return }
        let reloj = Task { try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000)) }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await task.value }
            group.addTask { await reloj.value }
            await group.next()
            group.cancelAll()
        }
        reloj.cancel()
    }

    /// El atleta descartó el entreno (salir sin guardar): el plan que se creó al
    /// empezar se borra, para que no quede una sesión «pendiente» que nunca hizo.
    func discard(_ session: WorkoutSession, bearer: String?) {
        let key = ObjectIdentifier(session)
        let task = enCurso.removeValue(forKey: key)
        Task { @MainActor [log] in
            await task?.value
            guard let id = session.assignmentId.flatMap(Int.init), session.isFreeRun,
                  session.freePlanSegmentIds != nil, let bearer else { return }
            do {
                try await PlanService.deleteFreeSession(assignmentId: id, bearer: bearer)
            } catch {
                log.info("plan libre descartado sin borrar: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// Cuánto espera el guardado a que el plan termine de guardarse.
    nonisolated static let esperaMaxima: TimeInterval = 8
}
