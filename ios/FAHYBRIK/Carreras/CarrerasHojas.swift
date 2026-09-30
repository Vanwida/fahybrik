import SwiftUI

// LAS RUEDAS DE UN TIEMPO EXACTO de «Carreras» (h · min · s): la vía discreta cuando la meta no es un peldaño.
// El marco de la hoja, el campo, los chips de filtro y el segmentado que vivían aquí son del kit del día
// (`MarcoDeHojaDia`, `CampoDia`, `ChipFiltroDia`, `SegmentoDia`).

/// Las tres ruedas de un tiempo exacto (h · min · s): la vía discreta cuando la meta no es un peldaño.
/// UNA implementación para «Fijar objetivo» y «Tu tiempo objetivo» (estaba escrita dos veces).
struct RuedasDeTiempoCarreras: View {
    @Binding var tiempo: TiempoExacto

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            rueda($tiempo.h, 0...5, "h", "Horas")
            rueda($tiempo.m, 0...59, "min", "Minutos")
            rueda($tiempo.s, 0...59, "s", "Segundos")
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .frame(maxWidth: .infinity)
        .tarjetaDia()
    }

    private func rueda(_ valor: Binding<Int>, _ rango: ClosedRange<Int>, _ unidad: String, _ nombre: String) -> some View {
        VStack(spacing: 2) {
            Picker(nombre, selection: valor) {
                ForEach(Array(rango), id: \.self) { n in
                    Text(String(format: "%02d", n))
                        .papel(.seccion)
                        .tag(n)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(height: 96)
            .clipped()
            Text(unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(nombre): \(valor.wrappedValue)")
        .accessibilityAdjustableAction { direccion in
            switch direccion {
            case .increment: if valor.wrappedValue < rango.upperBound { valor.wrappedValue += 1 }
            case .decrement: if valor.wrappedValue > rango.lowerBound { valor.wrappedValue -= 1 }
            default: break
            }
        }
    }
}
