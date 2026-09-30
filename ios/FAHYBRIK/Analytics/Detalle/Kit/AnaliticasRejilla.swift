import SwiftUI

// LA REJILLA DE CELDAS — las teselas de dato de una sección, de DOS en dos y del mismo alto (la `Rejilla` del doble). Con más de dos
// pasan a la fila siguiente; una impar ocupa todo el ancho (`aLoAncho`). Cada fila es una `TeselasDia`, que las iguala en alto y
// pasa a una columna con el texto del sistema en tamaños de accesibilidad.
//
// `TeselasDia` pone TODAS las que le pasen en una sola fila: a 390 pt tres cifras de 32 pt no caben. Esto es lo que
// usa un detalle, donde el número de celdas depende del dato.

struct AnaliticasRejilla<Contenido: View>: View {
    var porFila = 2
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        Group(subviews: contenido()) { celdas in
            VStack(spacing: Theme.Spacing.m) {
                ForEach(Array(stride(from: 0, to: celdas.count, by: porFila)), id: \.self) { i in
                    TeselasDia {
                        ForEach(celdas[i..<min(i + porFila, celdas.count)]) { celda in celda }
                    }
                }
            }
        }
    }
}
