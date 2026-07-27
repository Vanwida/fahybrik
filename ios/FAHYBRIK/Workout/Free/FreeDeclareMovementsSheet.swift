import SwiftUI

// MARK: - "¿Qué hiciste?" — declaring the movements AFTER a cronómetro session
//
// The athlete started a bare clock (EMOM 10 × 1:00) and trained. The work is already
// measured — duration, format, heart rate, the rounds the engine counted. What the
// app does NOT know is which movements filled the minutes, and that is the one thing
// only the athlete can say.
//
// So we ask here instead of at the start. Reuses the builder's exercise picker and
// its dose card verbatim, and hands back movements that `FreeFunctionalItems` maps
// with the SAME structure the session ran — a WOD declared afterwards is identical
// on the wire to one declared before.
//
// Optional by construction: the sheet's only exits are "Guardar" and a close button,
// and the summary's GUARDAR never waits for either.
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
        VStack(spacing: 0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    header
                    ForEach(movements) { m in
                        FreeFunctionalCard(
                            movement: bindingFor(m.id),
                            canMoveUp: movements.first?.id != m.id,
                            canMoveDown: movements.last?.id != m.id,
                            onMoveUp: { move(m.id, by: -1); Haptics.light() },
                            onMoveDown: { move(m.id, by: 1); Haptics.light() },
                            onRemove: { withAnimation { movements.removeAll { $0.id == m.id } }; Haptics.light() }
                        )
                    }
                    addButton
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            footer
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(isPresented: $showPicker) {
            FreeExercisePickerView(
                bearer: bearer,
                preferredCategory: "functional",
                onPick: { ex in add(ex); showPicker = false; Haptics.medium() },
                onClose: { showPicker = false }
            )
        }
    }

    // MARK: Chrome

    private var navBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
            Text("¿Qué hiciste?")
                .font(.system(size: 15, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
        .overlay(Rectangle().fill(Theme.Color.hairline).frame(height: 1), alignment: .bottom)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let headerLine, !headerLine.isEmpty {
                Text(headerLine)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text("Añade los movimientos y su dosis. Ya está todo cronometrado.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var addButton: some View {
        Button {
            Haptics.light()
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .heavy))
                Text(movements.isEmpty ? "Añadir movimiento" : "Añadir otro")
                    .font(.system(size: 14, weight: .heavy, design: .default).italic())
            }
            .foregroundStyle(canAddMore ? Theme.Color.accentText : Theme.Color.faint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(canAddMore ? 0.4 : 0.15),
                            style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!canAddMore)
        .accessibilityLabel(canAddMore ? "Añadir movimiento" : "Máximo de movimientos alcanzado")
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            ExpertPrimaryButton(title: "GUARDAR", height: 52) {
                Haptics.medium()
                onDone(movements)
            }
            .disabled(movements.isEmpty)
            .opacity(movements.isEmpty ? 0.4 : 1)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
        }
        .background(Theme.Color.background)
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
