import SwiftUI

// EL CONTENIDO DE LA FICHA — la columna de punta a punta, SIN su scroll ni su cromo.
//
// Arriba, lo que se lee una vez (cabecera y nota del coach); debajo, la ruta, FIJA al hacer scroll (es la cabecera de
// la sección del panel: `LazyVStack(pinnedViews:)`), y el panel del bloque elegido; al final, lo que le toque a la
// pasada (los caminos a mano o la tarjeta del reloj). Sin bloques no hay ruta: «sin detalle», con la nota encima. Con
// UN solo bloque tampoco: no hay orden que enseñar y la ficha se lee directa.
//
// Va sin `ScrollView` para que se pueda montar tal cual en una prueba (patrón de `SessionExercisesSheet.indice`): la
// pantalla (`PreWorkoutBriefView`) pone el scroll, el cromo y la acción anclada.
//
// Cambiar de bloque anima el panel: aparece con opacidad y 10 pt de desplazamiento en 260 ms; con Reducir movimiento,
// solo opacidad.

struct FichaContenido<Cierre: View>: View {
    let lectura: LecturaFicha
    /// El bloque que se lee. Nil —o uno que ya no existe— es el primero de trabajo: lo que toca hoy.
    @Binding var elegido: BloqueFicha.ID?
    let alAbrirTecnica: (WorkoutItem) -> Void
    @ViewBuilder let cierre: () -> Cierre

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var bloque: BloqueFicha? {
        lectura.bloques.first { $0.id == elegido } ?? lectura.bloques.first { $0.id == lectura.bloqueInicial }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
            encabezado
            if let bloque {
                if lectura.llevaRuta {
                    Section {
                        contenidoDelBloque(bloque)
                    } header: {
                        FichaRuta(bloques: lectura.bloques, elegido: bloque.id, alElegir: elegir)
                    }
                } else {
                    contenidoDelBloque(bloque)
                }
            } else {
                VStack(alignment: .leading, spacing: FichaMedidas.entrePiezas) {
                    SinDetallePrevia()
                    cierre()
                }
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
    }

    /// Cabecera y nota del coach: lo que se lee una vez y se va con el scroll.
    private var encabezado: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.entrePiezas) {
            FichaCabecera(cabecera: lectura.cabecera)
            if let nota = lectura.cabecera.nota { FichaNota(nota: nota) }
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.xs)
        .padding(.bottom, FichaMedidas.entrePiezas)
    }

    private func contenidoDelBloque(_ bloque: BloqueFicha) -> some View {
        VStack(alignment: .leading, spacing: FichaMedidas.entrePiezas) {
            FichaPanel(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
                .id(bloque.id)
                .transition(cambio)
            cierre()
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, FichaMedidas.entrePiezas)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    /// El panel que entra: el que sale desaparece sin más, para que los dos no se apilen mientras dura el cambio.
    private var cambio: AnyTransition {
        .asymmetric(
            insertion: reduceMotion ? .opacity : .opacity.combined(with: .offset(x: CambioDeBloque.desplazamiento)),
            removal: .identity
        )
    }

    private func elegir(_ id: BloqueFicha.ID) {
        guard id != bloque?.id else { return }
        Haptics.light()
        withAnimation(.easeOut(duration: CambioDeBloque.duracion)) { elegido = id }
    }
}

/// Cómo entra el panel de un bloque nuevo. Fuera del tipo genérico: un genérico no admite propiedades estáticas.
private enum CambioDeBloque {
    static let duracion = 0.26
    static let desplazamiento: CGFloat = 10
}
