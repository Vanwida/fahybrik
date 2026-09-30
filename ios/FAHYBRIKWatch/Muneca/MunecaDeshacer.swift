import SwiftUI

// EL AVISO DE DESHACER (P4): 5 s, con su barra que se vacía. Espejo de `AvisoDeshacer` de
// `kit-reloj/carcasa.tsx`.
//
// Vive en la FRANJA DEL PIE (`anchoPie`, el alto de un botón): tapa la fila de abajo, nunca el héroe
// (P3), que es lo que el atleta mira justo después de cerrar (el GO, la serie siguiente). La píldora
// entera es el botón (44 pt): arriba qué se cerró, debajo «Deshacer» en naranja, la acción.
//
// No decide si se puede deshacer ni cuánto queda: lo dice el motor (`CuadroMuneca.deshacerS`).

struct MunecaAvisoDeshacer: View {
    /// «Serie 3 cerrada».
    let aviso: String
    /// Segundos que le quedan a la ventana, según el motor.
    let restaS: Double
    let alDeshacer: () -> Void

    @Environment(\.munecaMedidas) private var medidas
    /// Cuánto de la ventana queda, de 1 a 0: la barra se vacía sola durante lo que queda.
    @State private var quedaFraccion: Double

    init(aviso: String, restaS: Double, alDeshacer: @escaping () -> Void) {
        self.aviso = aviso
        self.restaS = restaS
        self.alDeshacer = alDeshacer
        _quedaFraccion = State(initialValue: Swift.min(1, restaS / (Vivo.deshacerMs / 1000)))
    }

    var body: some View {
        Button(action: alDeshacer) {
            VStack(spacing: MunecaForma.huecoDeshacer) {
                Text(aviso)
                    .font(MunecaTipo.nota)
                    .foregroundStyle(MunecaPaleta.tinta)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.nota))
                Text("Deshacer")
                    .font(MunecaTipo.boton)
                    .foregroundStyle(MunecaPaleta.accion)
            }
            .padding(.horizontal, MunecaForma.aireBoton * 2)
            .frame(width: CGFloat(medidas.anchoPie), height: MunecaForma.altoBoton)
            .background(MunecaPaleta.superficie2)
            .overlay(alignment: .topLeading) { barra }
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(aviso) · Deshacer")
        .task {
            withAnimation(.linear(duration: restaS)) { quedaFraccion = 0 }
        }
    }

    /// La barra fina de arriba que se vacía de derecha a izquierda.
    private var barra: some View {
        GeometryReader { g in
            Rectangle()
                .fill(MunecaPaleta.tinta2)
                .frame(width: g.size.width * quedaFraccion, height: MunecaForma.altoBarraDeshacer)
        }
        .frame(height: MunecaForma.altoBarraDeshacer)
        .accessibilityHidden(true)
    }
}
