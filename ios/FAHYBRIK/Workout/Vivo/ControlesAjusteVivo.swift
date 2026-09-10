import SwiftUI

// Controles de ajuste compartidos entre el vivo de fuerza, su shell y el editor
// de serie. Una sola implementación — no primos privados por fichero.

/// Un entero con − y +. Ajustar es la excepción, así que no grita.
struct PasoEntero: View {
    let etiqueta: String
    let valor: Int
    let alCambiar: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { alCambiar(max(0, valor - 1)) }
                Text("\(valor)")
                    .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { alCambiar(valor + 1) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); accion() }) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// Un decimal opcional (RPE / RIR). Vacío hasta el primer toque: lo que no se ha
/// contestado no se rellena con un cero (§7).
struct PasoDecimal: View {
    let etiqueta: String
    let paso: Double
    let maximo: Double
    let valor: Double?
    let alCambiar: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { ajustar(-paso) }
                Text(valor.map { Formato.esDecimal($0) } ?? "sin decir")
                    .scaledFont(valor == nil ? 12 : 22,
                                weight: valor == nil ? .semibold : .heavy,
                                relativeTo: valor == nil ? .caption : .title2,
                                italic: valor != nil)
                    .monospacedDigit()
                    .foregroundStyle(valor == nil ? Theme.Color.muted : Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { ajustar(paso) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func ajustar(_ delta: Double) {
        Haptics.light()
        alCambiar(min(maximo, max(0, (valor ?? 0) + delta)))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// La rueda de carga: `KgWheel` (SwiftUI.Picker + `.pickerStyle(.wheel)`).
/// «esta y siguientes» dice lo que hace en el editor de serie; no se clona.
struct RuedaDeCarga: View {
    let valor: Double
    let alCambiar: (Double) -> Void

    private var units: Binding<Int> {
        Binding(get: { max(1, Int((valor / 2.5).rounded())) },
                set: { alCambiar(Double($0) * 2.5) })
    }

    var body: some View {
        KgWheel(label: "\(Vocab.carga) · esta y siguientes", units: units)
            .frame(maxWidth: .infinity)
    }
}
