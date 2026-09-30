import SwiftUI

// #58 · «CÓMO HA IDO» — el recado estructurado para el coach.
//
// Vive en el resumen al terminar, junto al esfuerzo. Todo es OPCIONAL y viaja en el MISMO POST de
// la ejecución: cómo se sintió frente a lo prescrito (perceived_difficulty) y una molestia física
// si la hay (pain_area + una nota corta). Va en TODO entreno, libre incluido: el servidor lo acepta
// por los dos caminos y una molestia es igual de real hecha en un libre.
struct SessionFeedbackCard: View {
    @Binding var difficulty: PerceivedDifficulty?
    @Binding var painExpanded: Bool
    @Binding var painArea: PainArea?
    @Binding var painNote: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let columnasDeZona = Array(repeating: GridItem(.flexible(), spacing: Theme.Spacing.s), count: 3)

    var body: some View {
        TarjetaResumen(etiqueta: "Cómo ha ido") {
            Text("Le llega a tu coach.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)

            // La dificultad frente a lo prescrito: una sola, tocar otra vez la quita. Con el texto
            // grande las tres opciones pasan una debajo de otra en vez de partirse.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.s) { opcionesDeDificultad }
                VStack(spacing: Theme.Spacing.s) { opcionesDeDificultad }
            }

            botonDeMolestia

            if painExpanded {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    LazyVGrid(columns: Self.columnasDeZona, spacing: Theme.Spacing.s) {
                        ForEach(PainArea.allCases) { area in
                            OpcionResumen(titulo: area.label, elegida: painArea == area) {
                                painArea = (painArea == area) ? nil : area
                            }
                        }
                    }
                    CampoTextoResumen(marcador: "Nota corta (opcional)",
                                      etiquetaAccesible: "Nota sobre la molestia",
                                      texto: $painNote,
                                      lineas: 1...3)
                        // El tope del servidor, mientras se teclea.
                        .onChange(of: painNote) { _, nuevo in
                            if nuevo.count > PainArea.maxNoteLength {
                                painNote = String(nuevo.prefix(PainArea.maxNoteLength))
                            }
                        }
                }
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var opcionesDeDificultad: some View {
        ForEach(PerceivedDifficulty.allCases) { opcion in
            OpcionResumen(titulo: opcion.label, elegida: difficulty == opcion) {
                difficulty = (difficulty == opcion) ? nil : opcion
            }
        }
    }

    private var botonDeMolestia: some View {
        Button {
            Haptics.light()
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) {
                painExpanded.toggle()
                // Plegar retira la molestia: no queda nada colgando que se envíe.
                if !painExpanded { painArea = nil; painNote = "" }
            }
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: painExpanded ? "minus.circle" : "plus.circle")
                    .font(.system(size: 18, weight: .semibold))
                    .accessibilityHidden(true)
                Text("Molestia física")
                    .papel(.notaFuerte)
                Spacer(minLength: 0)
            }
            .foregroundStyle(painExpanded ? Theme.Color.accentText : Theme.Color.muted)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(painExpanded ? "Ocultar molestia física" : "Añadir molestia física")
    }
}
