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
                marco { ProgressView().tint(Theme.Color.accent) }
            case .vacio:
                marco {
                    RedesignEmptyState(
                        symbol: "tray",
                        title: "Sin datos de este entreno",
                        message: "Se guardó, pero sin nada medido que enseñar.",
                        exit: .action(title: "Cerrar", perform: onClose)
                    )
                }
            case .error:
                marco {
                    RedesignEmptyState(
                        symbol: "arrow.clockwise",
                        title: "No pudimos cargar tu entreno",
                        message: "Revisa tu conexión e inténtalo de nuevo.",
                        exit: .action(title: "Reintentar") { Task { await cargar() } }
                    )
                }
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task { await cargar() }
    }

    /// La barra con la ✕ y el estado centrado debajo — solo mientras no hay lectura
    /// (las lecturas traen su propio cromo y su propia salida).
    private func marco<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(fallbackTitle ?? "Entreno")
                    .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                Button {
                    Haptics.light()
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cerrar")
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            Spacer(minLength: 0)
            contenido().padding(.horizontal, Theme.Spacing.xl)
            Spacer(minLength: 0)
        }
    }

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
