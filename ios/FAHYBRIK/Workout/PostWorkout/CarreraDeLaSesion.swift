import Foundation

// LA CARRERA QUE HAY DENTRO DE UNA SESIÓN — el puente entre lo que el motor
// grabó y el dominio de `FormaDeCarrera`. Puro y sin SwiftUI, para que la regla
// que decide el sujeto se pruebe sin abrir una pantalla.
//
// POR QUÉ EXISTE SEPARADO. `FormaDeCarrera` no sabe nada de laps ni de
// prescripciones: recibe una carrera y devuelve su forma. Todo lo que hay que
// SABER de esta app para construir esa carrera —qué lap es de correr, cuál es un
// tramo y cuál el agregado, qué tramo fue fuerte y cuál trote— vive aquí y en un
// solo sitio. Si mañana cambia cómo se graba, cambia este fichero y la ley no se
// entera.
//
// LO QUE HOY SE PUEDE ALIMENTAR, SIN ADORNOS:
//
//   · `marcados` — sí, y es el camino bueno. Desde el 29-jul el motor cierra un
//     lap por CADA tramo terminado, serie y recuperación, con `runLegIndex` (su
//     sitio en la lista plana de la prescripción), `runLegRole` (work/recovery) y
//     `runLegPhase` (warmup/main/cooldown).
//   · `muestras` — NO. La app no guarda ninguna serie de ritmo, y el polilínea de
//     la ruta lleva coordenadas y ni un solo tiempo, así que no se puede derivar
//     sin inventarla. Un rodaje suelto llega aquí como un único lap agregado y la
//     lectura sale `noSeSabe`, que es exactamente lo que es.

enum CarreraDeLaSesion {

    /// La carrera de una sesión, o nil cuando no hubo ninguna que leer.
    ///
    /// Devuelve nil en dos casos, y los dos son honestos: la sesión no incluyó
    /// correr, o corrió sin que nada midiera la distancia (cinta sin cable, calle
    /// sin GPS). Sin metros no hay ritmo, y el resumen de carrera no tiene sujeto
    /// que enseñar — ahí manda el resumen genérico, que sí sabe hablar de tiempo y
    /// pulso.
    static func carrera(laps: [LapRecord],
                        segmentos: [WorkoutSegment]) -> FormaDeCarrera.Carrera? {
        let correr = laps.filter { $0.modality == SegmentKind.running.modality }
        guard !correr.isEmpty else { return nil }

        let distanciaM = correr.compactMap(\.distanceCoveredMeters).filter { $0 >= 1 }.reduce(0, +)
        guard distanciaM >= 1 else { return nil }

        return FormaDeCarrera.Carrera(
            distanciaM: distanciaM,
            duracionS: duracion(correr),
            marcados: marcados(correr),
            formaPrescrita: formaPrescrita(segmentos)
        )
    }

    // MARK: - Duración

    /// CUÁNTO DURÓ EL CORRER — de reloj de pared y BLOQUE A BLOQUE, no la suma de
    /// los laps.
    ///
    /// La diferencia contra la suma es el caso que la ley necesita ver. Una sesión
    /// grabada por el camino de hasta el 29-jul (o corrida por el reloj, que manda
    /// las series y no los trotes) trae cinco fuertes y nada más: la suma de los
    /// laps son 20 minutos y la carrera duró 45. Esos 25 minutos que faltan SON la
    /// recuperación que nadie grabó, y son lo que impide llamar «uniforme» —y
    /// absolver a la media— a un 5×1000. Con la suma, ese hueco desaparecería y
    /// con él la única pista de que hubo contraste.
    ///
    /// Y bloque a bloque porque el reloj de pared de la sesión ENTERA cuenta lo
    /// que no es correr. Una sesión con trote de calentamiento, cuarenta minutos
    /// de hierro y vuelta a la calma trotando mide, de la primera zancada a la
    /// última, casi una hora — y ese hueco no es ninguna recuperación sin grabar:
    /// es la sentadilla. Sumando el intervalo de cada bloque por separado, lo que
    /// pasa ENTRE bloques no entra, que es exactamente lo que se quiere.
    private static func duracion(_ correr: [LapRecord]) -> Double {
        Dictionary(grouping: correr, by: \.segmentId).values.reduce(0) { total, bloque in
            let suma = bloque.reduce(0) { $0 + $1.durationSeconds }
            guard let inicio = bloque.map(\.startedAt).min(),
                  let fin = bloque.map(\.endedAt).max() else { return total + suma }
            return total + max(suma, fin.timeIntervalSince(inicio))
        }
    }

    // MARK: - Los tramos que ya vienen cerrados

    /// Sólo los laps que dicen A QUÉ TRAMO pertenecen, en el orden de la
    /// prescripción. Un lap sin `runLegIndex` es el agregado del bloque entero: si
    /// entrara aquí, diría que corriste 800 m en veinticuatro minutos.
    private static func marcados(_ correr: [LapRecord]) -> [FormaDeCarrera.TramoMarcado] {
        correr
            .filter { $0.runLegIndex != nil }
            .sorted { ($0.runLegIndex ?? 0) < ($1.runLegIndex ?? 0) }
            .map {
                FormaDeCarrera.TramoMarcado(tipo: tipo(de: $0),
                                            duracionS: $0.durationSeconds,
                                            distanciaM: $0.distanceCoveredMeters)
            }
    }

    /// FUERTE O SUAVE, y el rol no basta para decidirlo.
    ///
    /// En la gramática de carrera un calentamiento es literalmente `kind: work`
    /// (verificado en la prescripción 2574 de producción). Mirando sólo el rol, un
    /// trote de diez minutos de calentamiento entra como una repetición más: un
    /// 5×1000 se lee como un 6×1000 cuya primera «serie» dura diez minutos, el
    /// ritmo de lo fuerte se va al garete y el aguante juzga una serie que nadie
    /// corrió. Por eso `runLegPhase` existe, y por eso se lee aquí: fuerte es sólo
    /// el trabajo de la parte PRINCIPAL. Calentar y enfriar es correr suave, que es
    /// además lo que son.
    private static func tipo(de lap: LapRecord) -> FormaDeCarrera.TramoMarcado.Tipo {
        guard lap.runLegRole == RunLeg.Kind.work.rawValue else { return .suave }
        // Sin fase escrita (dato viejo) se cree al rol: es lo único que hay.
        guard let fase = lap.runLegPhase else { return .fuerte }
        return fase == RunPhaseRole.main.rawValue ? .fuerte : .suave
    }

    // MARK: - Lo que el coach mandó

    /// LA FORMA PRESCRITA — la ventaja que Apple no tiene.
    ///
    /// Aunque la carrera no se pueda decomponer, si el coach escribió contraste
    /// SABEMOS que su media promedia dos cosas distintas, y eso se puede decir en
    /// vez de callarlo. Nil cuando el bloque no lleva estructura: ahí no lo sabe
    /// nadie, y suponerlo sería acusar a la media sin pruebas.
    private static func formaPrescrita(_ segmentos: [WorkoutSegment]) -> FormaDeCarrera.FormaPrescrita? {
        let tramos = segmentos
            .filter { $0.kind == .running }
            .compactMap(\.runStructureLegs)
            .flatMap { $0 }
        guard !tramos.isEmpty else { return nil }
        let hayRecuperacion = tramos.contains(where: \.isRecovery)
        let seriesPrincipales = tramos.filter { $0.isWork && $0.phaseRole == .main }.count
        return (hayRecuperacion || seriesPrincipales > 1) ? .conContraste : .continua
    }
}
