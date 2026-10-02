import SwiftUI

// UNA LISTA DE FILAS — lo que se lee de una vez: un AMRAP, un For Time, un calentamiento.
//
// Con miniatura (el gesto del movimiento, o su loseta) y la dosis a la derecha, separadas por un filete; o `compacta`
// (el calentamiento y la vuelta a la calma): sin miniaturas y con `dosis · contra` apagado, porque ahí lo que importa
// es que no se te olvide un ejercicio, no cuánto pesa cada uno. Sin dosis, la fila es el nombre solo.

struct FichaLista: View {
    let movimientos: [MovimientoFicha]
    var compacta = false
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(movimientos.enumerated()), id: \.element.id) { i, movimiento in
                if i > 0 { Hairline() }
                FichaTocable(
                    movimiento: movimiento,
                    alAbrirTecnica: alAbrirTecnica,
                    altoMinimo: compacta ? Theme.Size.toque : FichaMedidas.altoDeFila
                ) {
                    if compacta { filaCompacta(movimiento) } else { filaConMiniatura(movimiento) }
                }
            }
        }
    }

    private func filaConMiniatura(_ m: MovimientoFicha) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            FichaMiniatura(movimiento: m, tamano: .fila)
            FilaAdaptableDia(alineacion: .center) {
                Text(m.nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(m.tintaDelNombre)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                FichaDosis(columna: m.columna)
            }
        }
        .padding(.vertical, Theme.Spacing.s)
    }

    private func filaCompacta(_ m: MovimientoFicha) -> some View {
        FilaAdaptableDia(alineacion: .firstTextBaseline) {
            Text(m.nombre)
                .papel(.cuerpo)
                .foregroundStyle(m.tintaDelNombre)
                .fixedSize(horizontal: false, vertical: true)
        } derecha: {
            if let linea = m.columna.enUnaLinea {
                Text(linea)
                    .papel(.nota)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
    }
}
