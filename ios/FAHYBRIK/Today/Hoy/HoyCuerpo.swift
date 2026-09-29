import SwiftUI

// EL CUERPO DE HOY — la portada entera, sin scroll ni presentaciones.
//
// Recibe una `LecturaHoy` y solo PINTA: no decide, no calcula. La altura es `llena` (CONTRATO-UI §6.1):
// quien lo monta (`InicioView`) lo pone en un `FillingScreen`, y cuando el contenido NO llega al alto, el
// sobrante entra en el propio sujeto (entre su título y su acción), jamás en una cola muerta.
//
// LAS DECISIONES DE JERARQUÍA, una línea cada una (las del diseño firmado):
//  1. El sujeto es el único bloque de 44 pt, con el tinte de su momento: si todo pesara lo mismo, el
//     momento no se leería.
//  2. El acento sólido es solo para «haz esto ahora» (sesión, retomar, montar): el color de marca no se
//     gasta en informar, se guarda para actuar.
//  3. La acción es una pastilla de tinta invertida y sola: el sujeto es lo que miras, la acción es lo que
//     tocas, y no compiten en peso.
//  4. Ningún sujeto arranca un entreno: el Plan es la única puerta. Hoy dice el ESTADO y lleva allí.
//  5. La línea del día va por encima y es sobria: dice dónde estás sin inventar horarios.
//  6. «Cómo llegas» baja a una tira: es el contexto con el que vives el sujeto, no el sujeto.
//  7. El camino es un póster con la única foto de la pantalla.
//  8. «Contigo» es UNA superficie plegable, en el orden en que caduca cada cosa; sin reclamos, no existe.
//  9. Marca reciente y pasos son dos teselas del mismo peso: pruebas, no protagonistas.
// 10. «Crear entreno libre» es la acción secundaria y desaparece cuando el sujeto YA es el constructor.
//
// FUERA DEL DISEÑO FIRMADO, CONSERVADO: «Tu pareja» (`PartnerTodayPanel`: la semana y las últimas
// sesiones de la pareja de dobles). El contrato del doble no traía el dato; no se decidió quitarlo. Va
// tras «Contigo» y solo se ve con una pareja de dobles.

struct HoyCuerpo: View {
    let lectura: LecturaHoy
    let acciones: HoyAcciones
    /// Cómo se cerró el check-in desde esta misma pantalla, si se cerró.
    var cierreDelCheckin: CierreDelCheckin?
    var hayNotaEnElCheckin = false
    /// La pareja de dobles, si el atleta tiene una: «Tu pareja» va tras «Contigo».
    var pareja: PartnerInfo?
    /// El entreno minimizado, SOLO para iOS 26.0, que no puede esconder la barra del sistema (ver
    /// `LiveWorkoutAccessory`): en 26.1 o posterior lo lleva esa barra y aquí no se duplica.
    var entrenoMinimizado: RecoveredLiveCover?
    /// Dirige la entrada escalonada de las piezas al aparecer.
    var revelado = true

    private static let separacion: CGFloat = 22

    var body: some View {
        let momento = lectura.momento
        let items = lectura.itemsContigo(momento)
        // Lo que caduca en minutos (tu pareja entrenando) sube: no puede quedar tras el póster.
        let urgente = items.first?.clave == .parejaEnVivo
        // «Crear entreno libre» solo cuando el sujeto no es ya el constructor ni su acción.
        let sujetoEsElConstructor = momento.tipo == .libre
            || (momento.tipo == .primerDia && lectura.testsDelPrimerDia == nil)

        VStack(alignment: .leading, spacing: Self.separacion) {
            HoyLineaDia(lectura: lectura)
                .entradaDeHoy(revelado, 0)

            if let entrenoMinimizado, !LiveWorkoutAccessory.isSystemBarAvailable {
                LiveWorkoutBarraEnFila(entreno: entrenoMinimizado)
            }

            HoySujeto(lectura: lectura, momento: momento, hayNotaEnElCheckin: hayNotaEnElCheckin, acciones: acciones)
                // La `id` por momento: al cambiar de sujeto, el bloque nuevo entra, no se reescribe.
                .id(momento.tipo)
                .entradaDeHoy(revelado, 1)

            HoyDisposicion(lectura: lectura, momento: momento, cierre: cierreDelCheckin, acciones: acciones)
                .entradaDeHoy(revelado, 2)

            if urgente { contigo(items) }

            HoyCamino(lectura: lectura, acciones: acciones)
                // El póster tiene su alto: el que se lleva el sobrante es el sujeto.
                .fixedSize(horizontal: false, vertical: true)
                .entradaDeHoy(revelado, 3)

            if !urgente { contigo(items) }

            HoyTeselas(lectura: lectura, acciones: acciones)
                .entradaDeHoy(revelado, 4)

            if !sujetoEsElConstructor {
                HoyEntrenoLibre(cargando: lectura.cargando, acciones: acciones)
                    .entradaDeHoy(revelado, 5)
            }
        }
    }

    /// «Contigo» y, tras él, «Tu pareja»: si no hay nada que reclame ni pareja, ni siquiera el hueco.
    @ViewBuilder
    private func contigo(_ items: [ItemContigo]) -> some View {
        if !items.isEmpty {
            HoyContigo(lectura: lectura, items: items, acciones: acciones)
                .entradaDeHoy(revelado, 3)
        }
        if let pareja, lectura.conCoach, !lectura.cargando {
            PartnerTodayPanel(partner: pareja)
                .entradaDeHoy(revelado, 3)
        }
    }
}

// MARK: - La entrada escalonada

private struct EntradaDeHoy: ViewModifier {
    let revelado: Bool
    let indice: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.staggerReveal(revelado, index: indice)
        }
    }
}

extension View {
    /// La entrada escalonada de Hoy al aparecer; con Reducir movimiento, las piezas ya están puestas.
    func entradaDeHoy(_ revelado: Bool, _ indice: Int) -> some View {
        modifier(EntradaDeHoy(revelado: revelado, indice: indice))
    }
}
