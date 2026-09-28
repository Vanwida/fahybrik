import Foundation

// LA CARA DE LOS FORMATOS QUE LLEVA EL RELOJ — Tabata, Death By, Intervalos sin
// máquina y el continuo (steady) que no es correr ni remar.
//
// El hueco que cierra (28-sep): estos formatos se pintaban con la cara POR RONDAS,
// que cuelga del cursor de tachado (`fixedRoundsDone`). Aquí nadie tacha: la ronda
// la mueve el reloj del motor (`rotRoundIndex`). Resultado: «Ronda 1/8» congelada
// durante un Tabata entero, y la fila activa era un botón que cerraba el bloque.
//
// Esta lectura sale SOLO del motor: la ronda que él lleva, la cuenta atrás de la
// fase en que está, las reps contadas de esta ronda (Tabata) y el objetivo del
// minuto (Death By). Pura, para que se pueda probar sin pantalla y para que la
// muñeca pueda leer lo mismo el día que la necesite.
struct RelojRotativo: Equatable {
    enum Fase: Equatable {
        /// La cuenta 3-2-1 antes de empezar.
        case preparate
        /// Ventana de trabajo con caja (Tabata 20″, un minuto de Death By, un
        /// intervalo por tiempo): cuenta atrás.
        case trabajo
        /// Descanso entre rondas: cuenta atrás.
        case descanso
        /// Una serie SIN caja (un 500 m sin máquina): lo que lleva, hacia arriba.
        case serie
        /// Un continuo con ventana: lo que queda.
        case continuo
        /// Un continuo sin ventana: lo que lleva.
        case crono
    }

    let fase: Fase
    /// El número grande, en segundos, según la fase.
    let segundos: Double
    /// La ronda en curso, en base 1. Nil cuando el formato no tiene rondas.
    let ronda: Int?
    /// Cuántas rondas tiene. Nil cuando es abierto (Death By: hasta que falles).
    let rondas: Int?
    /// Lo que toca en esta ronda, dicho como lo lee el atleta («12 reps», «15 cal»,
    /// «500 m»). En Death By es el objetivo del MINUTO, que sube con cada uno.
    let objetivo: String?
    /// Reps contadas en esta ronda (Tabata). Nil = sin contar, que no es cero.
    let reps: Int?
    /// El movimiento, cuando el formato lo dice.
    let movimiento: String?
}

extension WorkoutSession {

    /// La lectura del reloj para el formato en curso. Nil fuera de un rotativo o un
    /// continuo (For Time, AMRAP, rondas y rutas tienen su propia cara).
    var relojRotativo: RelojRotativo? {
        guard let seg = currentSegment, seg.isConditioningTimer,
              let scheme = seg.formatScheme else { return nil }
        let presentation = scheme.presentation
        guard presentation == .rotating || presentation == .continuous else { return nil }

        let tramo = currentTramo
        let movimiento: String? = seg.hasDeclaredWork ? tramo.label : nil

        if isCondCountIn {
            return RelojRotativo(fase: .preparate, segundos: condCountInRemaining.rounded(.up),
                                 ronda: nil, rondas: nil, objetivo: nil, reps: nil,
                                 movimiento: movimiento)
        }

        if presentation == .continuous {
            let conVentana = seg.formatTotalSeconds != nil
            return RelojRotativo(fase: conVentana ? .continuo : .crono,
                                 segundos: conVentana ? condRemaining : condElapsed,
                                 ronda: nil, rondas: nil, objetivo: tramo.workLine,
                                 reps: nil, movimiento: movimiento)
        }

        let fase: RelojRotativo.Fase
        let segundos: Double
        if isTramoResting {
            fase = .descanso
            segundos = tramoRestRemaining
        } else if let queda = tramoWorkRemaining {
            fase = .trabajo
            segundos = queda
        } else {
            fase = .serie
            segundos = tramoElapsedSeconds
        }

        switch scheme {
        case .deathBy:
            let unidad: String = {
                if case .calories? = seg.rotationSet(at: 0)?.measure { return "cal" }
                return "reps"
            }()
            return RelojRotativo(fase: fase, segundos: segundos,
                                 ronda: rotRoundIndex + 1, rondas: nil,
                                 objetivo: "\(deathByTarget) \(unidad)",
                                 reps: nil, movimiento: movimiento)
        case .tabata:
            let reps = rotRepsByRound.indices.contains(rotRoundIndex) ? rotRepsByRound[rotRoundIndex] : nil
            return RelojRotativo(fase: fase, segundos: segundos,
                                 ronda: Swift.min(rotRoundIndex + 1, Swift.max(1, rotTotalRounds)),
                                 rondas: Swift.max(1, rotTotalRounds),
                                 objetivo: tramo.workLine, reps: reps, movimiento: movimiento)
        default:
            return RelojRotativo(fase: fase, segundos: segundos,
                                 ronda: Swift.min(tramoRoundIndex + 1, Swift.max(1, tramoRoundTotal)),
                                 rondas: Swift.max(1, tramoRoundTotal),
                                 objetivo: tramo.workLine, reps: nil, movimiento: movimiento)
        }
    }
}
