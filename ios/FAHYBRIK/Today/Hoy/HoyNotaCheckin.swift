import SwiftUI

// LA NOTA DEL CHECK-IN — la hoja corta del campo de notas.
//
// La hoja larga del check-in (`CheckinView`) llevaba un campo de notas al final. El check-in de la
// portada se contesta de una pregunta en una, sin «al final», así que el campo vive aquí, a un toque
// desde el sujeto («Añadir nota»). Es EL MISMO borrador (`CheckinStore`): se guarda al teclear y viaja
// en el envío del check-in (`CheckinAnswers.notes`), igual que en la hoja larga; y si se abre la hoja
// larga después, la nota sigue ahí.
//
// Una pregunta de un solo campo es una hoja, no una pantalla (`.compactSheet()`).

struct HoyNotaCheckin: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var enfocada: Bool
    @State private var nota = CheckinStore.loadDraftNotes()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Text("Cuéntale cómo estás si quieres: una molestia, una mala noche. Es opcional.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                ZStack(alignment: .topLeading) {
                    if nota.isEmpty {
                        Text("p. ej. molestia en la pierna izquierda desde ayer")
                            .papel(.cuerpo)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .accessibilityHidden(true)
                    }
                    TextEditor(text: $nota)
                        .focused($enfocada)
                        .scrollContentBackground(.hidden)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .accessibilityLabel("Nota del check-in")
                }
                .frame(minHeight: 120)
                .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                        .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
                )
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.pantalla)
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Nota del check-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hecho") { dismiss() }
                        .tint(Theme.Color.accentText)
                }
            }
            // El borrador se guarda al teclear: cerrar sin pulsar «Hecho» no pierde nada.
            .onChange(of: nota) { _, nueva in CheckinStore.saveDraftNotes(nueva) }
            .onAppear { enfocada = true }
        }
        .compactSheet()
    }
}

#if DEBUG
#Preview("Nota del check-in") { HoyNotaCheckin() }
#endif
