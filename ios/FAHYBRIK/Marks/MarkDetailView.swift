import SwiftUI

// One mark (#Marcas): the PR, the history, the race twin, and the way to attack it.
//
// · Self-testable marks → "Probarme ahora": a run mark asks calle/cinta through the
//   SAME pre-start flow every run uses (the belt connect included), an erg mark goes
//   straight in — the PM5 measures. The attempt is a single-bout free session on the
//   existing engine; the summary posts the value on a full finish.
// · Race marks → "Registrar": candidates from the watch, or typed.
// · Run marks keep a PR PER CONTEXT: the belt moves the floor for you, so a
//   treadmill 5K never beats the street one — both bests show side by side.
//
// ARQUETIPO **Detalle** (CONTRATO-UI §6.2): el sujeto es la mejor marca, el hueco se gana con contra qué se
// compara y de dónde sale (historial), y la acción va anclada. Qué se lee y qué se celebra vive en
// `LecturaDeMarca`; lo que se pinta, en `MarcaDetalleCuerpo`. Aquí queda el servicio y lo que presenta:
// el intento en vivo, la hoja de registrar y la confirmación de retirar.
struct MarkDetailView: View {
    let slug: String
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var mark: MarkView? = nil
    @State private var cargando = true
    @State private var fallo = false
    @State private var aviso: AvisoDeMarca? = nil
    /// Snapshot of the best BEFORE an attempt, so the return can celebrate honestly.
    @State private var bestBeforeAttempt: Double? = nil
    @State private var nueva: MarcaNueva? = nil

    @State private var liveContext: FreeWorkoutContext? = nil
    @State private var showRegister = false

    /// La fila del historial que el atleta ha pedido retirar, a la espera de que
    /// confirme. Borrar una marca no se deshace, así que se pregunta.
    @State private var pendingDeletion: MarkResult? = nil

    private var estado: EstadoDeMarca {
        EstadoDeMarca.resolver(cargando: cargando, fallo: fallo, marca: mark)
    }

    var body: some View {
        MarcaDetallePantalla(
            estado: estado,
            lectura: mark.map { LecturaDeMarca.desde($0) },
            nueva: nueva,
            aviso: aviso,
            alReintentar: { await load() },
            alRetirar: { pendingDeletion = $0 },
            alVolver: { dismiss() },
            alActuar: { actuar() }
        )
        .refreshable { await load() }
        .navigationTitle(mark?.label ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .confirmationDialog(
            "¿Retirar esta marca?",
            isPresented: deletionPrompt,
            titleVisibility: .visible,
            presenting: pendingDeletion
        ) { result in
            Button("Retirar", role: .destructive) {
                Task { await remove(result) }
            }
            Button("Cancelar", role: .cancel) { pendingDeletion = nil }
        } message: { result in
            Text(DataOrigin.isDeclared(result.source)
                 ? "La declaraste al entrar. Desaparece de tu historial y deja de contar como tu mejor marca."
                 : "Desaparece de tu historial y deja de contar como tu mejor marca.")
        }
        .fullScreenCover(item: liveBinding) { boxed in
            WorkoutContainer(
                assignmentId: nil,
                fallbackTitle: boxed.context.title,
                bearer: bearer,
                freeContext: boxed.context,
                hrZones: hrZones,
                onClose: { liveContext = nil },
                onCompleted: { _ in
                    liveContext = nil
                    Task { await reloadAfterAttempt() }
                }
            )
        }
        .sheet(isPresented: $showRegister) {
            if let mark {
                RegisterRaceSheet(
                    mark: mark,
                    bearer: bearer,
                    // The server already answered whether this race is a PR; carry
                    // its verdict instead of guessing from a snapshot this path
                    // never took (which made EVERY registered race a "Marca nueva").
                    onSaved: { result in Task { await reloadAfterAttempt(verdict: result) } }
                )
            }
        }
    }

    // fullScreenCover(item:) needs Identifiable — box the context.
    private struct BoxedContext: Identifiable {
        let id = UUID()
        let context: FreeWorkoutContext
    }
    private var liveBinding: Binding<BoxedContext?> {
        Binding(
            get: { liveContext.map { BoxedContext(context: $0) } },
            set: { if $0 == nil { liveContext = nil } }
        )
    }

    private var deletionPrompt: Binding<Bool> {
        Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        )
    }

    // MARK: - CTA + attempt

    /// ONE pre-start for everyone, inside the brief: a run mark asks calle/cinta there (belt connect included)
    /// and an erg mark gates on the monitor connection. Asking here too would ask twice.
    private func actuar() {
        guard let mark else { return }
        if mark.measuredBy == "registered" {
            showRegister = true
        } else {
            bestBeforeAttempt = comparableBest(mark)?.value
            startAttempt(mark)
        }
    }

    private func comparableBest(_ mark: MarkView) -> MarkResult? {
        mark.group == "run" ? (mark.bestOutdoor ?? mark.bestTreadmill) : mark.best
    }

    private func startAttempt(_ mark: MarkView) {
        guard let context = BenchmarkLaunch.context(for: mark) else { return }
        liveContext = context
    }

    // MARK: - Data

    @MainActor
    private func load() async {
        // Solo la primera carga en frío es «cargando»: reintentar desde el error deja el error a la vista (su
        // botón gira) y revalidar con una marca delante no la tapa con un esqueleto.
        cargando = mark == nil && !fallo
        aviso = nil
        do {
            mark = try await MarksService.fetchMarks(bearer: bearer).marks.first { $0.slug == slug }
            fallo = false
        } catch {
            fallo = true
            // Con una marca ya delante el fallo se dice SOBRE ella; sin marca es el estado de error.
            if mark != nil { aviso = .noSeCargo }
        }
        cargando = false
    }

    /// Retira una marca y recarga. El servidor vuelve a comprobar la propiedad y el
    /// origen, así que un fallo aquí se cuenta tal cual y no se toca la lista.
    @MainActor
    private func remove(_ result: MarkResult) async {
        pendingDeletion = nil
        aviso = nil
        do {
            try await MarksService.remove(id: result.id, bearer: bearer)
            Haptics.success()
            await load()
        } catch {
            aviso = .noSeRetiro
        }
    }

    /// After an attempt or a registration: refetch and, if a new result landed,
    /// celebrate it — but only for what it is (`MarcaNueva.resolver`).
    @MainActor
    private func reloadAfterAttempt(verdict: MarkWriteResult? = nil) async {
        let before = mark?.latest
        await load()
        guard let mark,
              let celebracion = MarcaNueva.resolver(
                marca: mark, ultimaDeAntes: before, veredicto: verdict, mejorAntes: bestBeforeAttempt
              ) else { return }
        withAnimation(reduceMotion ? nil : Theme.Motion.reveal) { nueva = celebracion }
    }
}
