import SwiftUI

// UN ENTRENO HECHO SIN ASIGNACIÓN — una importación de Salud que no casó con el plan,
// un entreno guardado «fuera del plan». El historial los cuenta desde el 28-sep
// (`include_unplanned=1`) y se abren por su ejecución.
//
// No es otra pantalla de lectura: pinta las MISMAS dos lecturas que el detalle por
// asignación (`LecturaDeCarreraView` / `LecturaDeSesionView`), porque lo que se hizo se
// lee igual venga de donde venga. Lo que cambia es solo de dónde sale el dato, y lo
// que no tiene sentido sin asignación (técnica del plan, completar desde captura) no
// se ofrece. Los cuatro estados (§5): cargando, con datos, vacío y error.
struct EntrenoHechoPorEjecucionView: View {
    let executionId: String
    let fallbackTitle: String?
    let bearer: String?
    var hrZones: HRZoneProfile? = nil
    let onClose: () -> Void

    private enum Estado: Equatable {
        case cargando
        case carrera(Carrera)
        case sesion(SesionEjecutada)
        /// Llegó el detalle y no trae ejecución que leer.
        case vacio
        case error
    }

    @State private var estado: Estado = .cargando

    var body: some View {
        Group {
            switch estado {
            case .carrera(let carrera):
                LecturaDeCarreraView(carrera: carrera, zonas: hrZones, onCerrar: onClose)
            case .sesion(let sesion):
                LecturaDeSesionView(sesion: sesion, zonas: hrZones, onCerrar: onClose)
            case .cargando:
                // La misma silueta que la lectura que llega: nada salta al llegar el dato.
                MarcoDeLoHecho(titulo: titulo, alCerrar: onClose, centrado: false) { EsqueletoDeLoHecho() }
            case .vacio:
                MarcoDeLoHecho(titulo: titulo, alCerrar: onClose) {
                    SujetoEstadoDeLoHecho(
                        tono: .neutro, kicker: "Entreno guardado", titulo: "Sin datos de este entreno",
                        apoyo: "Se guardó, pero sin nada medido que enseñar.",
                        accion: "Cerrar", glifo: .cerrar, alTocar: onClose)
                }
            case .error:
                MarcoDeLoHecho(titulo: titulo, alCerrar: onClose) {
                    SujetoEstadoDeLoHecho.error(
                        kicker: "Entreno hecho", titulo: "No pudimos cargar tu entreno",
                        apoyo: "Revisa tu conexión e inténtalo de nuevo.",
                        alReintentar: { Task { await cargar() } })
                }
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task { await cargar() }
    }

    private var titulo: String { fallbackTitle ?? "Entreno" }

    @MainActor
    private func cargar() async {
        estado = .cargando
        guard let bearer else { estado = .error; return }
        do {
            let detalle = try await PlanService.fetchExecutionDetail(executionId, bearer: bearer)
            estado = Self.estado(de: detalle, zonas: hrZones, titulo: fallbackTitle)
        } catch {
            estado = .error
        }
    }

    /// Mismo orden de preguntas que `ExecutedWorkoutView`: ¿fue una carrera? Si no,
    /// la lectura de la sesión. Sin ejecución, vacío.
    private static func estado(de detalle: ExecutionDetail, zonas: HRZoneProfile?, titulo: String?) -> Estado {
        if let carrera = LecturaDeCarreraDesdeDetalle.carrera(de: detalle, zonas: zonas, tituloAlternativo: titulo) {
            return .carrera(carrera)
        }
        if let sesion = LecturaDeSesionDesdeDetalle.sesion(de: detalle, tituloAlternativo: titulo) {
            return .sesion(sesion)
        }
        return .vacio
    }
}
