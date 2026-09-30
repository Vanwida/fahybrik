import SwiftUI

// La revisión de una captura leída por IA: cada valor en su campo, editable, y honesto sobre lo que se leyó
// («Detectado») y lo que conviene mirar («Revisar»); al corregir pasa a «Tú». El cuerpo de la hoja de
// `WorkoutCaptureView`; la acción de confirmar la ancla la hoja.
struct CaptureReviewBody: View {
    @ObservedObject var model: CaptureReviewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Cada valor en su campo. «Detectado» es lo que leímos; «Revisar», lo que conviene mirar. Toca cualquiera para corregir.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)

            CaptureFieldCard(label: "Tiempo total", unit: "", field: $model.totalTime, kind: .time)
            if hasAny(model.distance) {
                CaptureFieldCard(label: "Distancia", unit: "m", field: $model.distance, kind: .decimal)
            }
            CaptureFieldCard(label: "Ritmo medio", unit: model.paceUnitLabel, field: $model.avgPace, kind: .time)
            if hasAny(model.avgHr) {
                CaptureFieldCard(label: Vocab.fcMedia, unit: Vocab.ppm, field: $model.avgHr, kind: .int)
            }
            if hasAny(model.avgPower) {
                CaptureFieldCard(label: "Potencia media", unit: "W", field: $model.avgPower, kind: .decimal)
            }
            if hasAny(model.spm) {
                CaptureFieldCard(label: "Cadencia", unit: "spm", field: $model.spm, kind: .int)
            }
            if hasAny(model.calories) {
                CaptureFieldCard(label: "Calorías", unit: "kcal", field: $model.calories, kind: .decimal)
            }

            if !model.segments.isEmpty {
                splitsSection
            }

            rpeSection
            notesSection
        }
    }

    private func hasAny(_ f: EditableField) -> Bool {
        // Show a metric row only when the IA detected it OR it has a value — we
        // never prompt for power/spm/cals a screenshot didn't contain.
        f.value != nil || f.detected == .detected
    }

    // MARK: - Parciales

    private var splitsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("Parciales · \(model.segments.count) series")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: Theme.Spacing.s)
                Text("\(detectedSplits) de \(model.segments.count) leídos")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            ListaDia {
                ForEach(Array(model.segments.indices), id: \.self) { i in
                    SplitRow(index: i + 1,
                             time: $model.segments[i].time,
                             pace: $model.segments[i].pace,
                             paceUnit: model.paceUnitLabel)
                }
            }
        }
    }

    private var detectedSplits: Int {
        model.segments.filter { $0.pace.status == .detected || $0.time.status == .detected }.count
    }

    // MARK: - Esfuerzo percibido

    private var rpeSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("Esfuerzo percibido: añádelo")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: Theme.Spacing.s)
                CaptureFieldStatus(status: model.rpe.status)
            }
            FlowLayout(spacing: Theme.Spacing.s, lineSpacing: Theme.Spacing.s) {
                ForEach(1...10, id: \.self) { n in
                    ChipFiltroDia(texto: "\(n)", elegido: model.rpe.value.map { Int($0.rounded()) } == n) {
                        model.rpe.value = Double(n)
                    }
                    .accessibilityLabel("Esfuerzo percibido \(n) de 10")
                }
            }
        }
    }

    private var notesSection: some View {
        CampoDia("Notas") {
            TextField("Opcional", text: $model.notes, axis: .vertical)
                .lineLimit(2...4)
                .padding(.vertical, Theme.Spacing.m)
                .accessibilityLabel("Notas del entreno")
        }
    }
}

// MARK: - Editable field (label · value · status)

private struct CaptureFieldCard: View {
    enum Kind { case time, int, decimal }
    let label: String
    let unit: String
    @Binding var field: EditableField
    let kind: Kind

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        CampoDia(label, enFoco: focused, aviso: field.status == .review, izquierda: { EmptyView() }, derecha: {
            HStack(spacing: Theme.Spacing.s) {
                if !unit.isEmpty {
                    Text(unit)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
                CaptureFieldStatus(status: field.status)
            }
            .padding(.trailing, Theme.Spacing.s)
        }, contenido: {
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .focused($focused)
                .monospacedDigit()
                .onChange(of: text) { _, new in commit(new) }
                .onAppear { text = display }
        })
    }

    private var placeholder: String {
        switch kind {
        case .time: return "mm:ss"
        default:    return "—"
        }
    }
    private var keyboard: UIKeyboardType {
        switch kind {
        case .time:    return .numbersAndPunctuation
        case .int:     return .numberPad
        case .decimal: return .decimalPad
        }
    }

    private var display: String {
        guard let v = field.value else { return "" }
        switch kind {
        case .time: return Formato.clock(v)
        case .int:  return "\(Int(v.rounded()))"
        case .decimal:
            return Formato.esDecimal(v)
        }
    }

    private func commit(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { field.value = nil; return }
        switch kind {
        case .time:
            field.value = TimeMinSecRow.parse(trimmed).map(Double.init) ?? field.value
        case .int:
            field.value = Int(trimmed).map(Double.init) ?? field.value
        case .decimal:
            field.value = Double(trimmed.replacingOccurrences(of: ",", with: ".")) ?? field.value
        }
    }
}

// MARK: - Split row (index · pace · time, editable)

private struct SplitRow: View {
    let index: Int
    @Binding var time: EditableField
    @Binding var pace: EditableField
    let paceUnit: String

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Text("\(index)")
                .papel(.cuerpoFuerte)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .frame(minWidth: 24, alignment: .leading)
            SplitEdit(field: $pace, suffix: paceUnit)
            Spacer(minLength: Theme.Spacing.s)
            SplitEdit(field: $time, suffix: "")
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
        .frame(minHeight: Theme.Size.toque)
    }
}

private struct SplitEdit: View {
    @Binding var field: EditableField
    let suffix: String
    @State private var text: String = ""

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            CaptureFieldMark(status: field.status)
            TextField("mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .papel(.cuerpo)
                .monospacedDigit()
                .foregroundStyle(field.value == nil ? Theme.Color.muted : Theme.Color.foreground)
                .fixedSize(horizontal: true, vertical: false)
                .onChange(of: text) { _, new in
                    let t = new.trimmingCharacters(in: .whitespaces)
                    field.value = t.isEmpty ? nil : (TimeMinSecRow.parse(t).map(Double.init) ?? field.value)
                }
                .onAppear { if let v = field.value { text = Formato.clock(v) } }
            if !suffix.isEmpty {
                Text(suffix).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

// MARK: - Cómo se leyó un campo

/// El estado de un campo, con su forma además de su color: leído (✓), a mirar (½) o corregido por ti (lápiz).
private struct CaptureFieldStatus: View {
    let status: FieldStatus

    var body: some View {
        switch status {
        case .detected: InfoPill(text: status.label, sello: .hecha)
        case .review:   InfoPill(text: status.label, sello: .parcial)
        case .edited:   InfoPill(text: status.label, glifo: .lapiz)
        }
    }
}

/// Lo mismo, sin palabra: la marca suelta de una celda de parciales.
private struct CaptureFieldMark: View {
    let status: FieldStatus

    var body: some View {
        switch status {
        case .detected: SelloEstadoDia(estado: .hecha, tam: 16)
        case .review:   SelloEstadoDia(estado: .parcial, tam: 16)
        case .edited:   IconoDia(.lapiz, tam: 14).foregroundStyle(Theme.Color.muted)
        }
    }
}
