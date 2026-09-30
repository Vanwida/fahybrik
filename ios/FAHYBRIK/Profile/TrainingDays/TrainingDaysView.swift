import SwiftUI

// «MIS DÍAS DE ENTRENO» — el atleta edita su mapa semanal día → papel DESPUÉS del alta: qué días son para el
// plan («Entreno»), cuáles ya tiene ocupados («Otra actividad») y cuáles están libres («Descanso»). Sale de
// GET / PATCH /api/athlete/availability.
//
// Es el motor del reparto (#47): solo los días de «Entreno» reciben sesiones. El número de días de «Entreno»
// ES los días de entreno a la semana del atleta, y se enseña en vivo.
//
// SEMÁNTICA HONESTA (decisión del fundador): un cambio guardado se aplica al plan DESDE LA SEMANA SIGUIENTE.
// La semana en curso, ya programada, NO se recoloca: reescribirla pisaría el plan y lo que el atleta ya
// hubiera registrado. Se dice claro y jamás se finge que la semana en curso se reorganiza. Al guardar con éxito
// se pide el refresco común del plan (`AppDataStore.planMutated`) para que todas las pestañas lo vuelvan a leer.
//
// La ventana horaria (desde/hasta, duración de sesión) es solo del alta: no hay endpoint de edición y el GET de
// disponibilidad no la devuelve, así que NO se enseña aquí. Solo se edita el mapa día → papel.
//
// La vista se parte en CONTENEDOR (carga y guarda) y `TrainingDaysCuerpo` (pinta con el estado ya resuelto).

struct TrainingDaysView: View {
    let bearer: String?

    @Environment(AppDataStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    /// Copia de trabajo que el atleta edita; `baseline` es el último estado guardado, para hacer PATCH solo si
    /// algo cambió de verdad (y nunca por un toque que no cambia nada).
    @State private var working = AvailabilityMap.restAll
    @State private var baseline: AvailabilityMap? = nil

    @State private var carga: CargaDePantallaPerfil<Void> = .cargando
    @State private var saving = false
    @State private var saveFailed = false

    /// Se guarda solo con sesión, con un cambio y sin otro guardado en marcha.
    private var canSave: Bool {
        guard bearer != nil, let baseline, !saving else { return false }
        return working != baseline
    }

    var body: some View {
        TrainingDaysCuerpo(
            carga: carga,
            working: $working,
            guardando: saving,
            puedeGuardar: canSave,
            falloAlGuardar: saveFailed,
            alGuardar: save,
            alReintentar: { Task { await load() } }
        )
        .task { await load() }
    }

    private func load() async {
        guard let bearer else { carga = .error; return }
        if case .error = carga { carga = .cargando }
        do {
            let resp = try await AvailabilityService.fetch(bearer: bearer)
            working = resp.availability
            baseline = resp.availability
            carga = .datos(())
        } catch {
            carga = .error
        }
    }

    private func save() {
        guard let bearer, canSave else { return }
        saving = true
        saveFailed = false
        Task {
            do {
                let resp = try await AvailabilityService.save(working, bearer: bearer)
                baseline = resp.availability
                working = resp.availability
                // Reflect the change: force-refetch the plan-derived slices so every tab re-pulls and
                // future-week materialization honors the new days. (The current week is NOT re-laid-out by design.)
                await store.planMutated()
                Haptics.success()
                dismiss()
            } catch {
                saveFailed = true
                Haptics.error()
                saving = false
            }
        }
    }
}

/// Lo que se pinta de «Mis días de entreno» con el estado ya resuelto.
struct TrainingDaysCuerpo: View {
    let carga: CargaDePantallaPerfil<Void>
    @Binding var working: AvailabilityMap
    var guardando = false
    var puedeGuardar = false
    var falloAlGuardar = false
    var alGuardar: () -> Void = {}
    var alReintentar: () -> Void = {}

    // Lunes … Domingo — índice 0 = lunes (casa con AvailabilityMap.days y el backend).
    private static let dayNames = [
        "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
    ]

    var body: some View {
        switch carga {
        case .cargando:
            PantallaPerfil(titulo: "Mis días de entreno") { EsqueletoDeFilasPerfil(filas: 7, conFicha: false) }
        case .error:
            PantallaPerfil(titulo: "Mis días de entreno", alto: .llena) {
                ErrorDePantallaPerfil(kicker: "Mis días de entreno", titulo: "No pudimos cargar tus días", alReintentar: alReintentar)
            }
        case .datos:
            PantallaPerfil(titulo: "Mis días de entreno") {
                Text("Marca qué días son para tu plan. Solo los días de “Entreno” reciben sesiones; “Otra actividad” es algo que ya tienes tú y “Descanso” es día libre.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                cuenta
                GrupoPerfil {
                    ForEach(0..<7, id: \.self) { i in
                        FilaDeDia(
                            nombre: Self.dayNames[i],
                            esDePlan: working.days[i] == .program,
                            rol: rol(de: i)
                        )
                    }
                }
                NotaPerfil("Tus cambios se aplican a tu plan a partir de la próxima semana. La semana en curso no se reorganiza.")
                if falloAlGuardar {
                    AvisoEnLineaPerfil(tono: .peligro, texto: "No pudimos guardar tus días. Revisa tu conexión e inténtalo de nuevo.")
                }
            } pie: {
                AccionAncladaPerfil(titulo: guardando ? "Guardando…" : "Guardar cambios", enCurso: guardando, habilitada: puedeGuardar, accion: alGuardar)
            }
        }
    }

    /// «Ahora entrenas N días a la semana.» — N sale en vivo del mapa de trabajo: se actualiza al marcar, antes de guardar.
    private var cuenta: some View {
        let n = working.programDayCount
        let cantidad: String
        switch n {
        case 0:  cantidad = "ningún día"
        case 1:  cantidad = "1 día"
        default: cantidad = "\(n) días"
        }
        return (Text("Ahora entrenas ") + Text(cantidad).fontWeight(.heavy) + Text(" a la semana."))
            .papel(.cuerpo)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel("Ahora entrenas \(cantidad) a la semana.")
    }

    private func rol(de i: Int) -> Binding<DayPlanStatus> {
        Binding(
            get: { working.days.indices.contains(i) ? working.days[i] : .rest },
            set: { nuevo in
                guard working.days.indices.contains(i) else { return }
                working.days[i] = nuevo
            }
        )
    }
}

// MARK: - Un día: su nombre y el papel que tiene

private struct FilaDeDia: View {
    let nombre: String
    let esDePlan: Bool
    @Binding var rol: DayPlanStatus

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: Theme.Spacing.s) {
                Text(nombre).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                // Un punto del acento marca de un vistazo el día de plan: es la marca, el texto no cambia de color.
                if esDePlan {
                    Circle().fill(Theme.Color.accent).frame(width: 10, height: 10).accessibilityHidden(true)
                }
            }
            SegmentadoDeRol(rol: $rol)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(nombre)
    }
}

/// Los tres papeles (Entreno / Otra actividad / Descanso) en un carril hundido con el elegido relleno del acento
/// del club y su tinta encima. Elección única sobre un `DayPlanStatus`; cada segmento es un objetivo de 44 pt y el
/// texto baja de línea antes que recortarse.
private struct SegmentadoDeRol: View {
    @Binding var rol: DayPlanStatus

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(DayPlanStatus.allCases, id: \.self) { opcion in
                segmento(opcion)
            }
        }
        .padding(Theme.Spacing.xs)
        .background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func segmento(_ opcion: DayPlanStatus) -> some View {
        let elegido = rol == opcion
        return Button {
            guard rol != opcion else { return }
            Haptics.light()
            rol = opcion
        } label: {
            Text(Self.etiqueta(de: opcion))
                .papel(.notaFuerte)
                .foregroundStyle(elegido ? Theme.Color.accentOn : Theme.Color.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .fill(elegido ? Theme.Color.accent : Color.clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(Self.etiqueta(de: opcion))
        .accessibilityAddTraits(elegido ? [.isButton, .isSelected] : .isButton)
    }

    /// Las etiquetas de los tres papeles, dichas al atleta. Una sola fuente.
    static func etiqueta(de rol: DayPlanStatus) -> String {
        switch rol {
        case .program:       return "Entreno"
        case .otherActivity: return "Otra actividad"
        case .rest:          return "Descanso"
        }
    }
}
