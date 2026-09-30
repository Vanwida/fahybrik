import SwiftUI

// EL CHEVRON QUE GIRA — lo que dice «esto se pliega».
//
// Apunta abajo cuando está cerrado y arriba cuando está abierto («Ver 3 más», «Más ajustes», la
// voz del coach que se lee entera). Es el `IcoChevron` con `rotate(90deg)` / `rotate(-90deg)` de las
// filas plegables del doble. Decorativo: el estado lo dice quien lo contiene con `accessibilityValue`
// («desplegado» / «plegado»). Con Reducir movimiento, gira sin animar.
//
// El color NO va aquí: es del sitio donde se pone (`.foregroundStyle`).

struct GiroDia: View {
    let abierto: Bool
    var tam: CGFloat
    var peso: Font.Weight

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(abierto: Bool, tam: CGFloat = 18, peso: Font.Weight = .semibold) {
        self.abierto = abierto
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        IconoDia(.chevron, tam: tam, peso: peso)
            .rotationEffect(.degrees(abierto ? -90 : 90))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: abierto)
    }
}

#if DEBUG
#Preview("Giro · fábrica") { EnAmbasDia { GaleriaDia.Giros() } }
#endif
