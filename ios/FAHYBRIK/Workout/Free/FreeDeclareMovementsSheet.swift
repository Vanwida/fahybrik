import SwiftUI

// «¿QUÉ HICISTE?» — declarar los movimientos DESPUÉS de una sesión de cronómetro.
//
// El atleta arrancó un reloj pelado (EMOM 10 × 1:00) y entrenó. El trabajo ya está medido —duración,
// formato, pulso, las rondas que contó el motor—; lo que la app NO sabe es qué movimientos llenaron los
// minutos, y eso sólo lo puede decir él.
//
// Por eso se pregunta aquí y no al empezar. Usa el selector de ejercicios y la tarjeta de dosis del
// constructor tal cual, y devuelve movimientos que `FreeFunctionalItems` traduce con la MISMA estructura
// con que corrió la sesión: un WOD declarado después es idéntico en el cable a uno declarado antes.
//
// Opcional por construcción: sus únicas salidas son «Guardar» y cerrar, y el GUARDAR del resumen no
// espera a ninguna de las dos. Es de la misma familia que el constructor (sus piezas).
struct FreeDeclareMovementsSheet: View {
    let bearer: String?
    /// The shape the session ran, shown as context so the athlete is naming
    /// movements for a clock they can still see ("EMOM 10 · cada 1:00").
    let headerLine: String?
    let onDone: ([FreeFunctionalMovement]) -> Void
    let onClose: () -> Void

    @State private var movements: [FreeFunctionalMovement] = []
    @State private var showPicker = false

    var body: some View {
        PantallaConstructorLibre(salida: .cerrar, alSalir: onClose) {
            TituloPasoLibre(
                etiqueta: headerLine.flatMap { $0.isEmpty ? nil : $0 } ?? "Tu sesión",
                titulo: "¿Qué hiciste?",
                apoyo: "Añade los movimientos y su dosis. Ya está todo cronometrado."
            )
            ForEach(movements) { m in
                FreeFunctionalCard(
                    movement: bindingFor(m.id),
                    canMoveUp: movements.first?.id != m.id,
                    canMoveDown: movements.last?.id != m.id,
                    onMoveUp: { move(m.id, by: -1) },
                    onMoveDown: { move(m.id, by: 1) },
                    onRemove: { withAnimation { movements.removeAll { $0.id == m.id } } }
                )
            }
            BotonAnadirLibre(
                titulo: movements.isEmpty ? "Añadir movimiento" : "Añadir otro",
                habilitado: canAddMore,
                etiquetaAlLimite: "Máximo de movimientos alcanzado"
            ) { showPicker = true }
        } pie: {
            pie
        }
        // Cubierta, no hoja anidada: una hoja sobre esta hoja es el mismo «solo una presentación» que
        // rechaza el selector del constructor.
        .fullScreenCover(isPresented: $showPicker) {
            FreeExercisePickerView(
                bearer: bearer,
                preferredCategory: "functional",
                onPick: { ex in add(ex); showPicker = false; Haptics.medium() },
                onClose: { showPicker = false }
            )
        }
    }

    // MARK: El pie

    /// Guardar sólo cuando hay algo que guardar: sin movimientos, la salida es cerrar (el resumen del
    /// entreno ya está guardado; esto es un añadido opcional).
    private var pie: some View {
        let vacio = movements.isEmpty
        return Button {
            Haptics.medium()
            onDone(movements)
        } label: {
            Text("Guardar")
                .papel(.accion)
                .foregroundStyle(Theme.Color.background)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
                .background(Theme.Color.foreground, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(vacio)
        .opacity(vacio ? 0.4 : 1)
        .accessibilityHint(vacio ? "Añade al menos un movimiento" : "")
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.vertical, Theme.Spacing.m)
        .background(Theme.Color.background)
        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
    }

    // MARK: State

    private var canAddMore: Bool { movements.count < FreeFunctionalStep.maxItems }

    private func add(_ exercise: FreeExercise) {
        guard canAddMore else { return }
        movements.append(FreeFunctionalMovement(exercise: exercise))
    }

    private func move(_ id: UUID, by delta: Int) {
        guard let i = movements.firstIndex(where: { $0.id == id }) else { return }
        let j = i + delta
        guard movements.indices.contains(j) else { return }
        movements.swapAt(i, j)
    }

    private func bindingFor(_ id: UUID) -> Binding<FreeFunctionalMovement> {
        Binding(
            get: {
                movements.first(where: { $0.id == id })
                    ?? FreeFunctionalMovement(exercise: FreeExercise(id: 0, name: "", slug: "",
                                                                     category: "functional", modality: nil))
            },
            set: { new in
                if let i = movements.firstIndex(where: { $0.id == id }) { movements[i] = new }
            }
        )
    }
}
