import Foundation

// LOS TRAMOS DE UNA SERIE, DESPUÉS DE HACERLA.
//
// POR QUÉ EXISTE
// --------------
// El resumen post-entreno pintaba su tabla solo si `plan.segments.count > 1`. Pero
// una carrera estructurada es UN segmento con N tramos dentro (`RunLeg`), así que
// quien acababa un 6×800 no veía ninguno de los seis: se quedaba con el reloj total
// arriba y nada más. Era el hueco más tonto y más caro de todo el flujo de correr,
// porque los ocho números de las series SON el entreno.
//
// La pregunta buena no es «¿hay más de un bloque?» sino «¿hay más de una fila que
// enseñar?». Esto la contesta.
//
// LO QUE SE PINTA SALE DEL LAP, NUNCA DEL PLAN
// --------------------------------------------
// Cada fila enseña lo que se MIDIÓ — su tiempo, su ritmo, su distancia cubierta —,
// que sale del `LapRecord`. El tramo del plan solo aporta el nombre y si era fuerte
// o recuperación, y solo cuando se le puede atribuir sin adivinar. Así, si mañana la
// grabación cambia, lo peor que puede pasar es que una fila se llame distinto; los
// números no pueden mentir nunca.
//
// LO QUE HAY DEBAJO HOY (y por qué esto lee y no asume)
// -----------------------------------------------------
// El motor graba UN lap por tramo FUERTE (`recordRunLegLap`, con `runLegIndex` =
// su ordinal) y las recuperaciones no dejan lap — así que un 5×1000 está guardado
// hoy con cinco laps y once tramos en el plan. Y cuando la sesión la corre el reloj,
// puede llegar UN solo lap agregado, sin `runLegIndex`. Los dos casos son reales y
// los dos se leen aquí sin inventar: se emparejan los laps que dicen a qué tramo
// pertenecen, y lo que no hay se declara.

enum TramosMedidos {

    /// Una fila: un tramo MEDIDO. El dato sale del lap; `leg` es el tramo del plan
    /// cuando se le puede atribuir, y nil cuando no (entonces la fila solo se numera).
    struct Fila: Identifiable {
        let id: UUID
        let lap: LapRecord
        let leg: RunLeg?
        /// «Tramo 3» / «Recuperación» — como lo cuenta quien corre.
        let titulo: String

        /// El tiempo del tramo. Es lo único que siempre se sabe.
        var tiempo: String { Formato.clock(lap.durationSeconds) }

        /// El segundo dato de la fila, por orden de lo que primero se mira al acabar
        /// una serie / estación: ritmo (/km o /500 m), cal, potencia, o distancia.
        /// nil cuando no se midió ninguno — ahí la fila se queda con su tiempo (§7).
        var medida: String? {
            if let ritmo = lap.avgPaceSecPerKm, ritmo > 0 {
                return Formato.ritmo(ritmo, .porKm)
            }
            if let ritmo500 = lap.avgPaceSecPer500m, ritmo500 > 0 {
                return Formato.ritmo(ritmo500, .por500m)
            }
            if let cal = lap.calories, cal >= 1 {
                return "\(Int(cal.rounded())) cal"
            }
            if let w = lap.avgPowerWatts, w >= 1 {
                return "\(Int(w.rounded())) W"
            }
            if let metros = lap.distanceCoveredMeters, metros >= 1 {
                return Formato.distanciaCubierta(metros)
            }
            return nil
        }
    }

    struct Lectura {
        /// Los tramos que se midieron, en orden.
        let filas: [Fila]
        /// Cuántos tramos FUERTES escribió el plan para este bloque. 0 = el bloque
        /// no es una serie estructurada.
        let fuertesPrevistos: Int

        /// Cuántas filas son de tramo fuerte (las recuperaciones no cuentan).
        var fuertesMedidos: Int { filas.filter { !($0.leg?.isRecovery ?? false) }.count }

        /// true cuando el bloque ES una serie y no se midió ni un tramo por
        /// separado — lo corrió el reloj y llegó colapsado, o lo grabó el camino
        /// antiguo. Se DECLARA: el atleta hizo seis y el resumen enseña uno.
        var sinTiemposPorTramo: Bool { fuertesPrevistos > 1 && filas.isEmpty }

        /// «4 de 6» cuando falta algún tramo fuerte por medir; nil cuando están
        /// todos (ahí el conteo no añade nada: las filas ya se ven).
        ///
        /// No dice POR QUÉ falta, a propósito: no lo sabemos. Un tramo puede faltar
        /// porque abandonaste la serie o porque no se grabó, y afirmar cualquiera de
        /// las dos sería inventar.
        ///
        /// Y sin NINGÚN tramo medido tampoco: ahí el hueco ya lo dice `Sin tiempos
        /// por tramo`, y un «0 de 6» al lado sería declararlo dos veces.
        var cobertura: String? {
            guard fuertesPrevistos > 0, !filas.isEmpty,
                  fuertesMedidos < fuertesPrevistos else { return nil }
            return "\(fuertesMedidos) de \(fuertesPrevistos)"
        }
    }

    /// Lee los tramos medidos de un bloque.
    static func lee(segmento: WorkoutSegment, laps: [LapRecord]) -> Lectura {
        let tramos = segmento.runStructureLegs ?? []
        let fuertes = tramos.filter(\.isWork)

        // Solo los laps que dicen A QUÉ TRAMO pertenecen. Un lap sin `runLegIndex`
        // es el agregado del bloque entero, no un tramo: meterlo en la tabla diría
        // que corriste 800 m en veinticuatro minutos.
        let medidos = laps
            .filter { $0.segmentId == segmento.id && $0.runLegIndex != nil }
            .sorted { ($0.runLegIndex ?? 0) < ($1.runLegIndex ?? 0) }

        // EMOM multi-estación: cada minuto es un lap con `runLegIndex` = ordinal.
        // El título es el movimiento del plan (Remo, SkiErg…), no "Tramo N".
        if let plan = segmento.emomPlan, !medidos.isEmpty {
            var filas: [Fila] = []
            for lap in medidos {
                let idx = lap.runLegIndex ?? 0
                let mov = plan.interval(idx)?.movement
                let titulo: String
                if let mov, !mov.isEmpty {
                    titulo = "\(idx + 1). \(mov)"
                } else {
                    titulo = "Min \(idx + 1)"
                }
                filas.append(Fila(id: lap.id, lap: lap, leg: nil, titulo: titulo))
            }
            return Lectura(filas: filas, fuertesPrevistos: plan.intervalCount)
        }

        // ¿Contra qué lista se emparejan? Si hay tantos laps como tramos, se grabó
        // TODO (fuertes y recuperaciones) y el emparejamiento es directo. Si no, los
        // laps son los tramos fuertes — que es lo que graba el motor hoy. Fuera de
        // esos dos casos no se atribuye ninguno: la fila se queda sin nombre de
        // tramo antes que llevar uno equivocado.
        let referencia = (!tramos.isEmpty && medidos.count == tramos.count) ? tramos : fuertes

        var filas: [Fila] = []
        var nFuerte = 0
        for (i, lap) in medidos.enumerated() {
            let leg = i < referencia.count ? referencia[i] : nil
            let esRecuperacion = leg?.isRecovery ?? false
            if !esRecuperacion { nFuerte += 1 }
            filas.append(Fila(
                id: lap.id,
                lap: lap,
                leg: leg,
                titulo: esRecuperacion ? "Recuperación" : "Tramo \(nFuerte)"
            ))
        }
        return Lectura(filas: filas, fuertesPrevistos: fuertes.count)
    }

    /// Cuántas filas enseñaría la tabla entera — un bloque con tramos medidos cuenta
    /// por sus tramos, y cualquier otro por sí mismo. Es lo que decide si la tabla
    /// se pinta: «¿hay más de una fila?», y no «¿hay más de un bloque?».
    static func filasTotales(segmentos: [WorkoutSegment], laps: [LapRecord]) -> Int {
        segmentos.reduce(0) { total, seg in
            total + Swift.max(1, lee(segmento: seg, laps: laps).filas.count)
        }
    }

    /// true cuando algún bloque es una serie de la que no se midió ni un tramo — hay
    /// algo que declarar aunque la tabla tenga una sola fila.
    static func haySeriesSinTramos(segmentos: [WorkoutSegment], laps: [LapRecord]) -> Bool {
        segmentos.contains { lee(segmento: $0, laps: laps).sinTiemposPorTramo }
    }
}
