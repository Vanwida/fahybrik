import SwiftUI

// LA SUPERFICIE PLANA DE UNA TARJETA DE HOY.
//
// «Cómo llegas», «Contigo», «Tu pareja» y «Crear entreno libre» comparten cara: la de tarjeta, con
// su contorno fino y las esquinas de `Radius.tarjeta`, SIN la sombra ni el brillo de `CardSurface`
// (que es la superficie de las pantallas de siempre). La tesela de dato (`TeselaDia`) lleva la
// misma cara por dentro; esto es lo que faltaba para las tarjetas que no son una tesela.
// Candidata a subir al kit de `Theme/Dia` si otra pestaña la necesita.

extension View {
    /// Cara de tarjeta plana: superficie, contorno y esquinas recortadas.
    func tarjetaDia() -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .background(Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
    }
}
