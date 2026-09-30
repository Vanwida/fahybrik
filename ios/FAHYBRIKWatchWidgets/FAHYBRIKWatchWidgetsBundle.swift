import SwiftUI
import WidgetKit

// La extensión de widgets del reloj: la complicación de la esfera y el widget del Smart
// Stack con lo de hoy. Comparte el día con la app del reloj por el App Group
// (`ComplicacionAlmacen`). Los widgets nuevos del reloj entran en este bundle.
@main
struct FAHYBRIKWatchWidgetsBundle: WidgetBundle {
    var body: some Widget {
        HoyWidget()
    }
}
