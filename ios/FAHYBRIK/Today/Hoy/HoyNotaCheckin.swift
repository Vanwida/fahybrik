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
        MarcoDeHojaDia("Nota del check-in", cerrar: { dismiss() }) {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Text("Cuéntale cómo estás si quieres: una molestia, una mala noche. Es opcional.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                CampoDia("Nota", enFoco: enfocada) {
                    ZStack(alignment: .topLeading) {
                        if nota.isEmpty {
                            Text("p. ej. molestia en la pierna izquierda desde ayer")
                                .foregroundStyle(Theme.Color.muted)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 8)
                                .accessibilityHidden(true)
                        }
                        TextEditor(text: $nota)
                            .focused($enfocada)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 120)
                            .accessibilityLabel("Nota del check-in")
                    }
                }
            }
        } accion: {
            BotonAccionDia(hoja: "Hecho", ocupado: false, textoOcupado: "", voz: "") { dismiss() }
        }
        // El borrador se guarda al teclear: cerrar sin pulsar «Hecho» no pierde nada.
        .onChange(of: nota) { _, nueva in CheckinStore.saveDraftNotes(nueva) }
        .onAppear { enfocada = true }
        .compactSheet()
    }
}

#if DEBUG
#Preview("Nota del check-in") { HoyNotaCheckin() }
#endif
