import SwiftUI

// EL MEDIDOR DEL LIENZO — de qué tamaño es ESTE reloj.
//
// El núcleo mide el texto contra un lienzo (`Vivo.MedidasMuneca`): 208 × 248 a 46
// mm, 187 × 223 a 42 mm, 205 × 251 a 49 mm y lo que sea en cualquier otro. Este
// envoltorio lee el tamaño real de la pantalla (con las safe areas dentro, porque
// el kit las descuenta él) y se lo da a quien construye el cuadro, y a las piezas
// por el entorno. Así el cuadro se calcula con la MISMA medida con la que se pinta.

struct MunecaMedidor<Contenido: View>: View {
    @ViewBuilder var contenido: (Vivo.MedidasMuneca) -> Contenido

    var body: some View {
        GeometryReader { geo in
            let medidas = Vivo.MedidasMuneca(ancho: Double(geo.size.width), alto: Double(geo.size.height),
                                             horaAbajo: Double(WatchPantalla.hora(ancho: geo.size.width).abajo))
            contenido(medidas)
                .environment(\.munecaMedidas, medidas)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }
}
