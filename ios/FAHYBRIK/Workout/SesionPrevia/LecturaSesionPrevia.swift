import Foundation

// LA LECTURA DE LA SESIÓN PREVIA — qué acción lleva la ficha y qué caminos tiene, según en qué pasada del flujo está.
//
// Lo que la ficha ENSEÑA (cabecera, nota del coach, bloques con su forma) lo decide `LecturaFicha`; esto decide el resto:
// la acción anclada, los caminos a mano, la tarjeta del reloj y la frase de arranque. La vista (`PreWorkoutBriefView`)
// PINTA esto y no decide nada, así las reglas se leen sin renderizar y no cambian al cambiar la piel.
//
//   · primera pasada: «Empezar» (lleva a Dispositivos o a preparar la barra) y los dos caminos a mano —«Ya lo hice»
//     y la captura—, que una PRUEBA no tiene (lo que la app no midió no existe);
//   · segunda pasada (después de Dispositivos): la ÚNICA puerta de empezar (FH-95) y la tarjeta del reloj.

struct LecturaSesionPrevia {

    /// La acción anclada abajo. Una sola por pasada.
    enum Accion: Equatable {
        /// Primera pasada: sigue a Dispositivos (o, si todo es hierro, a preparar la barra).
        case continuar
        /// La única puerta de empezar del camino previo al vivo (FH-95).
        case empezar

        /// Las dos se llaman igual: lo que cambia es adónde lleva, no lo que se le dice al atleta.
        var titulo: String { "Empezar" }
    }

    /// Los caminos para registrar sin el cronómetro, en el orden en que se pintan.
    enum Secundaria: Equatable {
        /// Entrenaste sin la app y lo apuntas a mano.
        case yaLoHice
        /// Entrenaste con otra app y traes el resultado por una captura.
        case conCaptura

        var titulo: String {
            switch self {
            case .yaLoHice:   return "¿Ya lo entrenaste sin la app? Regístralo"
            case .conCaptura: return "Registrar con captura de otra app"
            }
        }
    }

    let accion: Accion
    let secundarias: [Secundaria]
    /// Hay algo que compartir: una tarjeta de un título pelado no enseña nada.
    let compartible: Bool
    /// La tarjeta del reloj: solo en la segunda pasada.
    let muestraReloj: Bool
    /// La frase sobre la acción en la segunda pasada. Nil en la primera.
    let lineaDeArranque: String?
    /// La sesión tal como la enseña la ficha: cabecera y bloques con su forma (`LecturaFicha`).
    let ficha: LecturaFicha

    static func desde(
        plan: WorkoutPlan,
        detalle: AssignmentDetail?,
        listo: Bool,
        conCaptura: Bool,
        relojDisponible: Bool,
        contexto: ContextoFicha = ContextoFicha()
    ) -> LecturaSesionPrevia {
        let ficha = LecturaFicha.desde(plan: plan, detalle: detalle, contexto: contexto)

        var secundarias: [Secundaria] = []
        if !listo, !ficha.cabecera.prueba {
            secundarias.append(.yaLoHice)
            if conCaptura { secundarias.append(.conCaptura) }
        }

        return LecturaSesionPrevia(
            accion: listo ? .empezar : .continuar,
            secundarias: secundarias,
            compartible: !plan.segments.isEmpty,
            muestraReloj: listo,
            lineaDeArranque: listo
                ? (relojDisponible ? "Empieza cuando estés listo. El reloj se abre solo." : "Empieza cuando estés listo.")
                : nil,
            ficha: ficha
        )
    }
}
