import SwiftUI

// EL VIAJE DEL ENTRENO: de la barra al vivo y del vivo a la barra.
//
// Al minimizar, el vivo no se «baja» con el deslizamiento de cualquier cubierta mientras una barra aparece
// aparte: se ENCOGE hasta la cápsula de la barra de sistema, y al tocarla crece desde ella. Es el `zoom` de
// SwiftUI (`matchedTransitionSource` en la barra + `navigationTransition(.zoom)` en el vivo): mismo origen y
// mismo destino en los dos sentidos, y el sistema lo cambia por un fundido con «Reducir movimiento».
//
// Tres condiciones para que funcione (Apple las tiene documentadas como fallos de iOS 26):
//  · la barra tiene que existir también mientras el vivo está delante (`LiveWorkoutResume.barra`);
//  · quien presenta el vivo desde la barra cambia un `@State` propio (`AppShell.entrenoAbierto`), no el
//    estado de un objeto observable;
//  · sin barra de sistema (iOS 26.0) no hay viaje: el vivo se presenta como siempre.
//
// Un vivo que se abre de cero (desde Plan, Hoy…) todavía no tiene barra de la que salir: el sistema lo abre
// con un zoom sin origen y, al minimizar, sí se encoge hasta la barra.
enum LiveWorkoutViaje {
    static let id = "entreno-en-vivo"
    /// El radio de la cápsula de la barra. `matchedTransitionSource` solo admite `RoundedRectangle`: con un radio
    /// mayor que medio alto, la forma es una cápsula.
    static let radioDeLaBarra: CGFloat = 40
}

extension View {
    /// Marca el vivo como destino del viaje desde/hacia la barra. Se aplica UNA vez, en la raíz del vivo.
    @ViewBuilder
    func viajeDelEntreno() -> some View {
        if #available(iOS 26.1, *), let espacio = LiveWorkoutResume.shared.espacioDelViaje {
            navigationTransition(.zoom(sourceID: LiveWorkoutViaje.id, in: espacio))
        } else {
            self
        }
    }
}
