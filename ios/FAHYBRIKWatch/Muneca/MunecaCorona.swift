import SwiftUI

// LA CORONA DEL DATO — con un dato de la anotación encendido, la corona es SUYA: cada
// muesca sube o baja el dato una vez (`Vivo.AnotarMuneca.girar`) y la pila se queda en una
// página (el cuadro trae `paginas == [.paso]`), así que no compite con el paso de páginas.
// Sin dato encendido, esta pieza no toca nada y la corona pasa página como siempre.
//
// Solo con aparato: la corona anidada (la dirección de la muesca y su sensibilidad).

private struct MunecaCoronaDelDato: ViewModifier {
    let alGirar: (Int) -> Void

    /// Un valor que solo sirve para contar muescas: el sentido lo da el signo de la diferencia.
    @State private var valor: Double = 0

    func body(content: Content) -> some View {
        content
            .focusable(true)
            .digitalCrownRotation($valor, from: -MunecaForma.recorridoCorona, through: MunecaForma.recorridoCorona, by: 1,
                                  sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
            .onChange(of: valor) { antes, ahora in
                let d = ahora - antes
                if d != 0 { alGirar(d > 0 ? 1 : -1) }
            }
    }
}

extension View {
    /// Con `campo` encendido la corona gira ese dato; sin él, no hace nada (la corona pasa página).
    @ViewBuilder
    func munecaCorona(_ campo: Vivo.CampoAnotar?, alGirar: ((Int) -> Void)?) -> some View {
        if campo != nil, let alGirar { modifier(MunecaCoronaDelDato(alGirar: alGirar)) } else { self }
    }
}
