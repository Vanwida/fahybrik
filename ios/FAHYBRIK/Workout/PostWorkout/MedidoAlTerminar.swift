import Foundation

// LO QUE SE MIDIÓ SE GUARDA AL TERMINAR, Y NO DEPENDE DE NINGUNA PANTALLA.
//
// Antes la carrera se escribía al pulsar GUARDAR en el resumen. Entre el final del
// esfuerzo y ese toque hay una lectura de carrera, un resumen, un RPE, unas notas y
// un botón de compartir — y en todo ese rato la sesión existía SOLO en memoria: el
// motor ya había cerrado su instantánea de recuperación (`WorkoutStateStore.close()`
// dentro de `finish()`), el resumen no encola en caso de fallo, y matar la app ahí
// se llevaba el entreno entero. Kilómetros, pulso, mapa: nada.
//
// La separación que arregla eso es la que ya existía en la base de datos y no se
// estaba usando: `workout_executions` se hace UPSERT por `assignment_id` con
// `coalesce(excluded.campo, campo)` en cada columna. O sea que se puede escribir dos
// veces sin duplicar y sin pisar:
//
//   · al TERMINAR va lo MEDIDO — duración, tramos, ritmo, zonas, recorrido. Cero
//     opiniones del atleta, así que no hay nada que esperar.
//   · en el RESUMEN va lo DECLARADO — RPE, notas, dificultad, molestia, y el uuid
//     del HKWorkout de la muñeca, que llega unos segundos después del final.
//
// Compartir pasa a ser lo que decía Alex que tiene que ser: un accesorio. No puede
// borrar nada porque cuando aparece ya no queda nada por guardar.
//
// POR QUÉ NO REUTILIZA `buildPayload()` DEL RESUMEN: ese constructor mezcla lo medido
// con lo tecleado (duración a mano, FC a mano, ritmos a mano de un registro
// retroactivo) y con el estado de sus campos. Aquí no hay campos: hay una sesión.
// Lo que SÍ se comparte es lo único con lógica de verdad — `SegmentPayloadBuilder`,
// que traduce las vueltas del motor a tramos — así que no hay dos reglas, sólo dos
// listas de campos para el mismo struct.
enum MedidoAlTerminar {

    /// El envío de lo MEDIDO para una sesión prescrita que acaba de terminar.
    ///
    /// Nil cuando no hay a qué colgarlo (una sesión sin asignación no tiene fila
    /// posible) o cuando el motor no llegó a medir nada — un entreno abandonado en la
    /// puerta del primer bloque no es una carrera de cero metros, es que no hubo
    /// carrera, y escribirla marcaría la asignación como hecha.
    static func payload(session: WorkoutSession, assignmentId: String?) -> WorkoutExecutionPayload? {
        guard let assignmentId, !assignmentId.isEmpty else { return nil }
        guard let finishedAt = session.finishedAt else { return nil }
        let duration = Int(session.elapsedSeconds.rounded())
        guard duration > 0 else { return nil }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        // Sin overlay: un overlay es lo que el atleta teclea, y aquí no ha tecleado
        // nada todavía. Los tramos salen del motor tal como los midió.
        let segments = SegmentPayloadBuilder.build(
            laps: session.laps,
            overlay: ManualSegmentOverlay(avgHR: nil, maxHR: nil, paceSecondsBySegment: [:]),
            iso: iso
        )

        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            // LO DECLARADO VA EN NIL A PROPÓSITO. El upsert usa
            // `coalesce(excluded, existente)`, así que un nil de aquí no puede pisar
            // un RPE que el resumen escriba después — y al revés, el resumen no
            // puede borrar estos metros.
            perceived_exertion: nil,
            total_duration_seconds: duration,
            notes: nil,
            // nil = camino en vivo (el servidor deriva la procedencia de los tramos).
            source: nil,
            score_time_s: session.capturedScoreTimeSeconds,
            score_rounds: session.capturedScoreRounds,
            score_reps: session.capturedScoreReps,
            completeness: session.completeness.rawValue,
            started_at: iso.string(from: session.startedAt),
            ended_at: iso.string(from: finishedAt),
            segments: segments.isEmpty ? nil : segments,
            // El uuid del HKWorkout de la muñeca NO se estampa aquí: llega por el
            // cable unos segundos después de pedirle el cierre. Lo pone el resumen,
            // y el coalesce lo acepta porque esta primera escritura lo dejó nulo.
            source_workout_ref: nil,
            route_polyline: session.capturedRoutePolyline,
            perceived_difficulty: nil,
            pain_area: nil,
            pain_note: nil
        )
    }

    /// EL ARCHIVO DE LA SESIÓN — la serie de ritmo y de pulso de la que salen los
    /// kilómetros y la curva del recap. Vivía como estático privado del resumen; sube
    /// aquí porque ahora la aparca el final del esfuerzo, y el resumen la sigue
    /// necesitando para los dos caminos que no pueden pre-guardarse (libre y cierre
    /// conjunto de dobles).
    ///
    /// De paso le pide a Apple Salud su SEGUNDA OPINIÓN sobre los metros, que es lo
    /// que hace esto asíncrono. El contraste se pide sólo cuando de verdad medimos
    /// distancia con el GPS: en cinta los metros los da la máquina y compararlos con
    /// lo que anduvo el atleta no significa nada, y en una sesión de fuerza no hay
    /// nada que contrastar. La segunda serie se guarda AL LADO de la nuestra (misma
    /// señal, otra fuente), jamás encima — es lo que hace que un fallo de la puerta de
    /// distancia se vea la próxima vez en lugar de vivir escondido.
    ///
    /// Aparcada al TERMINAR, esa opinión puede llegar vacía: la muñeca escribe su
    /// HKWorkout unos segundos después de que se le pida cerrar. Es una degradación
    /// del CONTRASTE, nunca de lo medido — el ritmo y el pulso de la traza son
    /// nuestros y están completos; lo que puede faltar es la distancia de Apple al
    /// lado, para compararlas.
    static func closedTraces(
        recorder: WorkoutTraceRecorder,
        startedAt: Date
    ) async -> [WorkoutTraceDTO] {
        if !recorder.points(of: .distance, source: .gps).isEmpty {
            let reference = await HealthKitDistanceProbe.cumulativeSeries(
                startedAt: startedAt, endedAt: Date()
            )
            recorder.adopt(reference, as: .distance, source: .healthkit)
        }
        return recorder.traces(startedAt: startedAt)
    }
}
