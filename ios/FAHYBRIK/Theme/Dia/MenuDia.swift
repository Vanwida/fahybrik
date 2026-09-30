import SwiftUI

// EL «···» — un menú del sistema con su etiqueta.
//
// Los tres puntos de la acción anclada, los de cada fila secundaria: lo que no cabe a la vista pero tiene
// que estar a un toque, sin depender de una pulsación larga (que no se descubre ni se alcanza con
// teclado). Es un `Menu` de SwiftUI —el sistema pone el menú, el háptico y la accesibilidad— con el
// nombre accesible obligatorio: un glifo solo no le dice nada a VoiceOver.
//
//     MenuDia(etiqueta: "Acciones de Series 6×800", opciones: { Button("Mover a otro día") { … } }) {
//         IconoDia(.puntos, tam: 22, peso: .bold)
//     }

struct MenuDia<Etiqueta: View, Opciones: View>: View {
    let etiqueta: String
    let opciones: () -> Opciones
    let boton: () -> Etiqueta
    #if DEBUG
    @Environment(\.enCaptura) private var enCaptura
    #endif

    init(etiqueta: String, @ViewBuilder opciones: @escaping () -> Opciones, @ViewBuilder boton: @escaping () -> Etiqueta) {
        self.etiqueta = etiqueta
        self.opciones = opciones
        self.boton = boton
    }

    var body: some View {
        #if DEBUG
        if enCaptura {
            boton().accessibilityLabel(etiqueta)
        } else {
            menu
        }
        #else
        menu
        #endif
    }

    private var menu: some View {
        Menu { opciones() } label: { boton() }
            .accessibilityLabel(etiqueta)
    }
}

#if DEBUG
private struct EnCapturaKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    /// Estamos pintando una CAPTURA (`ImageRenderer`, la galería de pruebas). El renderizador no dibuja los controles
    /// que respalda UIKit —un `Menu`, un `ScrollView`— y los sustituye por un aviso amarillo; con esto el «···» se
    /// pinta como lo que es para el atleta: su etiqueta. Solo existe en DEBUG: la app no lo lee.
    var enCaptura: Bool {
        get { self[EnCapturaKey.self] }
        set { self[EnCapturaKey.self] = newValue }
    }
}

#Preview("Menú · fábrica") { EnAmbasDia { GaleriaDia.Acciones() } }
#endif
