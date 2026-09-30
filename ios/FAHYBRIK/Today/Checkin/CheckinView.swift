import SwiftUI

// EL CHECK-IN EN HOJA LARGA (docs/ux/07-daily-morning-checkin.md): las cinco preguntas de 1 a 5, la nota y
// su acción, todo en una hoja.
//
// Es la salida cuando el check-in NO es el sujeto de Hoy (plan en pausa, sin coach, error de carga…) y lo que
// abre el detalle de la disposición. Contesta por el MISMO camino que el paso a paso de la portada
// (`CheckinAnswers.registrar`) y con la misma escala (`EscalaCheckin`): contestar «Ánimo» se siente igual en
// las dos. Saltar es un acto aparte de cerrar: cerrar deja el aviso pendiente, saltar lo apaga por hoy.
struct CheckinView: View {
    @State private var answers = CheckinAnswers()
    @FocusState private var notesFocused: Bool
    @Environment(\.dismiss) private var dismiss

    let bearer: String?
    let onSubmitted: (Int, CheckinSnapshot) -> Void
    let onSkipped: () -> Void
    /// Fires AFTER the server has ingested (or definitively rejected) the
    /// check-in — the moment a readiness refetch actually returns the recomputed
    /// score. `onSubmitted` fires immediately (dismissal must never wait on the
    /// network); refreshing readiness there raced the in-flight POST and
    /// re-fetched the OLD score, which read as "el check-in no hace nada".
    var onServerSynced: () async -> Void = {}

    var body: some View {
        MarcoDeHojaDia("Check-in de hoy", cerrar: { dismiss() }) {
            cuerpo
        } accion: {
            BotonAccionDia(hoja: "Continuar", activo: answers.allAnswered, ocupado: false, textoOcupado: "", voz: "") {
                let (score, snap) = answers.registrar(bearer: bearer, onServerSynced: onServerSynced)
                onSubmitted(score, snap)
            }
            BotonTextoDia("Saltar por hoy", tono: .suave, centrado: true) {
                CheckinStore.markSkipped()
                onSkipped()
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Hecho") { notesFocused = false }
                    .tint(Theme.Color.accentText)
            }
        }
        .onAppear {
            answers.notes = CheckinStore.loadDraftNotes()
        }
    }

    // MARK: - El cuerpo

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            Text("Buenos días. ¿Cómo te sientes hoy?")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            // Every row reads the same way: 1 = peor, 5 = mejor. Soreness and fatigue are
            // negatively keyed in the model (5 = worst), so they bind inverted and are
            // reframed positive (recuperación / energía) — the athlete never has to flip the
            // scale's meaning between questions. The questions themselves live in
            // `CheckinPregunta.todas`, shared with the paso a paso of the Hoy portada.
            ForEach(CheckinPregunta.todas) { pregunta in
                fila(pregunta)
            }
            notas
        }
    }

    private func fila(_ pregunta: CheckinPregunta) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(pregunta.titulo)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .accessibilityAddTraits(.isHeader)
            EscalaCheckin(
                titulo: pregunta.titulo,
                extremos: "\(pregunta.izquierda), \(pregunta.derecha)",
                valor: binding(pregunta).wrappedValue,
                alElegir: { binding(pregunta).wrappedValue = $0 }
            )
            ExtremosDeEscala(izquierda: pregunta.izquierda, derecha: pregunta.derecha)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// El borrador de la nota se guarda al teclear: cerrar la hoja sin enviar no lo pierde.
    private var notas: some View {
        CampoDia("Notas (opcional)", enFoco: notesFocused) {
            ZStack(alignment: .topLeading) {
                if answers.notes.isEmpty {
                    Text("p. ej. molestia en la pierna izquierda desde ayer")
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .accessibilityHidden(true)
                }
                TextEditor(text: Binding(
                    get: { answers.notes },
                    set: { nueva in
                        answers.notes = nueva
                        CheckinStore.saveDraftNotes(nueva)
                    }
                ))
                .focused($notesFocused)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 96)
                .accessibilityLabel("Notas del check-in, opcional")
            }
        }
    }

    /// The 1–5 binding for one question, in SCREEN terms (5 = best). For the negatively-keyed fields
    /// (soreness, fatigue) it inverts on the way in and out, so the model + the submitted snapshot keep the
    /// RAW semantic (5 = worst) and the backend contract and `subScore` are untouched.
    private func binding(_ pregunta: CheckinPregunta) -> Binding<Int?> {
        Binding(
            get: { answers[keyPath: pregunta.campo].map(pregunta.dePantalla) },
            set: { answers[keyPath: pregunta.campo] = $0.map(pregunta.delModelo) }
        )
    }
}
