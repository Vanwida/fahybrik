import SwiftUI

// Session technique index — reached from a tap in the Plan week (a day/session
// row). Lists the session's exercises block by block; tapping one opens its
// technique detail (`ExerciseDetailView`: in-app video + per-set prescription +
// cues + coach note).
//
// This is the athlete's path to STUDY how to execute a movement, distinct from
// the pre-workout brief (the "ready to start / execute" screen). The rich
// per-exercise rendering lives once in `ExerciseDetailView` — this view is only
// a thin navigation index over the session's items, so there is no duplicated
// prescription rendering here.
//
// Data is the same authoritative assignment detail the brief loads
// (`GET /api/athlete/assignments/{id}/detail`), cache-first via
// `AssignmentDetailCache` so a session already viewed opens instantly.

struct SessionExercisesSheet: View {
    let assignmentId: String
    let sessionTitle: String
    let bearer: String?
    /// Preguntarle al coach por UN ejercicio de la sesión. Lo resuelve quien
    /// presenta esta hoja (PlanView): cierra el índice y abre el chat con el
    /// ejercicio ya señalado, porque dos hojas no se levantan a la vez. Nil
    /// cuando el atleta no tiene coach — entonces la fila del menú no existe.
    var onPreguntar: ((EjercicioSeñalado) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var state: LoadState = .loading
    @State private var selected: WorkoutItem? = nil

    enum LoadState {
        case loading
        case loaded(WorkoutDetail)
        case rest          // assignment exists but has no workout body (rest day)
        case failed
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                cromo
                switch state {
                case .loading:
                    esqueleto
                case .loaded(let workout):
                    content(workout)
                case .rest:
                    estadoSinEjercicios(
                        symbol: "moon.zzz", title: "Día de descanso",
                        message: "No hay ejercicios programados para esta sesión.")
                case .failed:
                    estadoSinEjercicios(
                        symbol: "wifi.exclamationmark", title: "No pudimos cargar la sesión",
                        message: "Revisa tu conexión e inténtalo de nuevo.",
                        exit: .action(title: "Reintentar") {
                            state = .loading
                            Task { await load() }
                        })
                }
            }
        }
        .task { await load() }
        .sheet(item: $selected) { item in
            ExerciseDetailView(item: item)
        }
    }

    /// La línea de arriba de la hoja: qué es y la salida. Sin barra de navegación del sistema: la hoja lleva el
    /// mismo cromo que las pestañas, y «Cerrar» es un botón redondo con su nombre.
    private var cromo: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text("Técnica")
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.accentText)
            Spacer(minLength: Theme.Spacing.s)
            BotonCromoDia(.cerrar, etiqueta: "Cerrar") { Haptics.light(); dismiss() }
        }
        .padding(.leading, Theme.Spacing.pantalla)
        .padding(.trailing, Theme.Spacing.s)
        .frame(minHeight: 56)
    }

    private var titulo: some View {
        Text(sessionTitle)
            .papel(.saludo)
            .foregroundStyle(Theme.Color.foreground)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Loaded content

    private func content(_ workout: WorkoutDetail) -> some View {
        let blocks = workout.blocks.filter { !$0.items.isEmpty }
        return Group {
            if blocks.isEmpty {
                estadoSinEjercicios(
                    symbol: "list.bullet.rectangle", title: "Sin ejercicios",
                    message: "Esta sesión todavía no tiene ejercicios detallados.")
            } else {
                ScrollView { indice(blocks) }
            }
        }
    }

    /// Lo que se scrollea: el título, el aviso y los ejercicios bloque a bloque. Vive aparte del `ScrollView`
    /// para poder dibujarse tal cual en una prueba (el `ImageRenderer` no pinta un `ScrollView`).
    func indice(_ blocks: [WorkoutBlock]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                titulo
                Text("Toca un ejercicio para ver la técnica")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            ForEach(blocks) { block in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia(block.title)
                    VStack(spacing: Theme.Spacing.s) {
                        ForEach(block.items) { item in
                            exerciseRow(item)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private func exerciseRow(_ item: WorkoutItem) -> some View {
        Button {
            Haptics.light()
            selected = item
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(item.exerciseName)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    EtiquetaDeModalidad(categoria: item.exerciseCategory)
                }
                Spacer(minLength: Theme.Spacing.s)
                if hasVideo(item) {
                    IconoDia(.video, tam: 20)
                        .foregroundStyle(Theme.Color.accentText)
                }
                IconoDia(.chevron, tam: 15, peso: .bold)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
            .tarjetaDia()
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        // Pulsación larga: la fila no tenía menú, y uno no ocupa alto. Es un
        // ATAJO, nunca la vía principal — la puerta que se descubre es el «+» del
        // chat. Ver docs/DECISIONS.md, 12-ago.
        //
        // VA SOBRE EL BOTÓN, no dentro de su `label:`. Ahí dentro no se abre
        // nunca: el botón se queda la pulsación larga para su propio resaltado y
        // el menú no llega a existir. Así estaba y así se quedó sin funcionar.
        .contextMenu {
            Button {
                Haptics.light()
                selected = item
            } label: {
                Label("Ver la técnica", systemImage: "play.rectangle")
            }
            if let onPreguntar {
                Button {
                    onPreguntar(EjercicioSeñalado(
                        // El segmento prescrito de ESTA línea. Sin él (entreno
                        // libre) se señala el entreno entero, no una línea
                        // inventada.
                        segmentoId: item.templateSegmentId.map(String.init),
                        nombre: item.exerciseName
                    ))
                } label: {
                    Label("Preguntar al coach", systemImage: "message")
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(item.exerciseName), \(Theme.Modality.label(item.exerciseCategory))\(hasVideo(item) ? ", con vídeo de técnica" : "")"
        )
        .accessibilityAddTraits(.isButton)
    }

    private func hasVideo(_ item: WorkoutItem) -> Bool {
        VideoDeTecnica.hay(en: item.exerciseVideoUrl)
    }

    // MARK: - Non-content states

    /// Cargando: la MISMA silueta que el índice (título, aviso y filas), no un círculo girando.
    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            // El título de la sesión ya se sabe: es lo único que no es esqueleto.
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                titulo
                SkeletonBar(width: 240, height: 15, radius: 5)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 140, height: 24, radius: 6)
                ForEach(0..<4, id: \.self) { _ in
                    SkeletonBar(height: 64, radius: Theme.Radius.tarjeta)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.s)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando \(sessionTitle)")
    }

    /// Sin ejercicios que enseñar (descanso, sin detalle, fallo de carga): el estado dice por qué y ofrece su
    /// salida. Sin una acción propia, la salida es cerrar la hoja.
    private func estadoSinEjercicios(
        symbol: String, title: String, message: String, exit: EmptyStateExit? = nil
    ) -> some View {
        CenteredScreen(head: { EmptyView() }, lead: {
            titulo
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.s)
        }, content: {
            RedesignEmptyState(
                symbol: symbol, title: title, message: message,
                exit: exit ?? .action(title: "Cerrar", perform: { dismiss() }))
        })
    }

    // MARK: - Load (cache-first, then authoritative fetch)

    private func load() async {
        if let cached = AssignmentDetailCache.load(assignmentId) {
            apply(cached)
        }
        guard let bearer else {
            if case .loading = state { state = .failed }
            return
        }
        do {
            let detail = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
            AssignmentDetailCache.save(detail)
            apply(detail)
        } catch {
            if case .loading = state { state = .failed }
        }
    }

    private func apply(_ detail: AssignmentDetail) {
        if let workout = detail.workout {
            state = .loaded(workout)
        } else {
            state = .rest
        }
    }
}
