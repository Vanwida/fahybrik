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
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                switch state {
                case .loading:
                    ProgressView().tint(Theme.Color.accentText)
                case .loaded(let workout):
                    content(workout)
                case .rest:
                    message(icon: "moon.zzz", title: "Día de descanso",
                            detail: "No hay ejercicios programados para esta sesión.")
                case .failed:
                    failedState
                }
            }
            .navigationTitle(sessionTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .task { await load() }
            .sheet(item: $selected) { item in
                ExerciseDetailView(item: item)
            }
        }
    }

    // MARK: - Loaded content

    private func content(_ workout: WorkoutDetail) -> some View {
        let blocks = workout.blocks.filter { !$0.items.isEmpty }
        return Group {
            if blocks.isEmpty {
                message(icon: "list.bullet.rectangle",
                        title: "Sin ejercicios",
                        detail: "Esta sesión todavía no tiene ejercicios detallados.")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Toca un ejercicio para ver la técnica")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                        ForEach(blocks) { block in
                            VStack(alignment: .leading, spacing: 8) {
                                LabelText(text: block.title.uppercased(), color: Theme.Color.accentText)
                                VStack(spacing: 8) {
                                    ForEach(block.items) { item in
                                        exerciseRow(item)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
        }
    }

    private func exerciseRow(_ item: WorkoutItem) -> some View {
        Button {
            Haptics.light()
            selected = item
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                CategoryTag(category: item.exerciseCategory)
                Text(item.exerciseName)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                if hasVideo(item) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityHidden(true)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
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
            "\(item.exerciseName)\(hasVideo(item) ? ", con vídeo de técnica" : "")"
        )
        .accessibilityAddTraits(.isButton)
    }

    private func hasVideo(_ item: WorkoutItem) -> Bool {
        VideoDeTecnica.hay(en: item.exerciseVideoUrl)
    }

    // MARK: - Non-content states

    private var failedState: some View {
        VStack(spacing: Theme.Spacing.m) {
            message(icon: "wifi.exclamationmark",
                    title: "No pudimos cargar la sesión",
                    detail: "Revisa tu conexión e inténtalo de nuevo.")
            Button {
                Haptics.light()
                state = .loading
                Task { await load() }
            } label: {
                Text("Reintentar")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Theme.Color.accent)
                    .clipShape(Capsule())
            }
        }
    }

    private func message(icon: String, title: String, detail: String) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundStyle(Theme.Color.muted)
            Text(title)
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(detail)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.xl)
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
