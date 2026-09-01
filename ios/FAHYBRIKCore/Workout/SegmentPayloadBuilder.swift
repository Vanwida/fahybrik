import Foundation

// LapRecord[] → [SegmentExecutionDTO]: la ÚNICA traducción de lo medido al cable.
//
// Por qué existe este fichero (y por qué es compartido).
// ------------------------------------------------------
// Había DOS copias de esta traducción — `PostWorkoutSummaryView.buildSegments`
// (teléfono) y `WatchWorkoutCoordinator.buildSegments` (reloj) — y divergieron,
// que es lo que siempre pasa con dos copias. La del reloj se quedó atrás en TODO
// lo que se añadió después:
//
//   · No re-secuenciaba `position`. Los tramos de una carrera estructurada
//     comparten el `position` del bloque, así que el upsert del servidor
//     (`on conflict (execution_id, position)`) FUNDÍA los N tramos en UNA fila.
//     Un 5×1000 grabado desde la muñeca llegaba como una sola serie. Pérdida de
//     dato activa, no cosmética.
//   · No enviaba `emom_rounds_*` (mig 0134) → «X/Y rondas» en blanco.
//   · No enviaba `incline_pct` (mig 0124) → la pendiente medida se tiraba.
//   · No enviaba el detalle del erg (#33: drag, fuerza, splits del PM5).
//
// Ninguna de esas tres omisiones se decidió: se olvidaron al añadir el campo en un
// sitio y no en el otro. Con UNA función, olvidarlo deja de ser posible.
//
// Puro Foundation, compilado en los DOS targets (ver ios/project.yml). Los únicos
// datos que el reloj no tiene son los que el atleta escribe A MANO en el resumen
// del teléfono (FC media/máxima y ritmo por tramo), y entran por parámetro: el
// reloj pasa los valores vacíos y obtiene exactamente el mismo payload.

/// Los datos que el atleta declara a mano en el resumen post-entreno del teléfono
/// y que se superponen a lo medido. El reloj no tiene esta pantalla → `.none`.
struct ManualSegmentOverlay {
    /// FC media/máxima de sesión, aplicadas a cualquier tramo SIN FC medida.
    var avgHR: Int?
    var maxHR: Int?
    /// Ritmo declarado por tramo (clave = `LapRecord.segmentId`), en la unidad de
    /// visualización del tramo: s/km para correr, s/500 m para el erg.
    var paceSecondsBySegment: [UUID: Int]

    static let none = ManualSegmentOverlay(avgHR: nil, maxHR: nil, paceSecondsBySegment: [:])

    /// FC dentro del rango que acepta la analítica (Zod 30–260). Fuera de rango se
    /// descarta en vez de enviarse, para que una pulsación suelta no tumbe el sync
    /// entero con un 400.
    fileprivate static func validHR(_ value: Int?) -> Int? {
        guard let v = value, v >= 30, v <= 260 else { return nil }
        return v
    }
}

enum SegmentPayloadBuilder {
    /// Traduce los laps medidos de una sesión a los tramos del cable.
    ///
    /// ORDEN Y `position`. Los tramos se ordenan por (position del bloque, índice de
    /// tramo). Cuando la sesión contiene tramos de una carrera estructurada, el
    /// `position` del cable se RE-SECUENCIA a un contador denso y único: el servidor
    /// upserta por `(execution_id, position)`, así que sin esto los N tramos que
    /// comparten el `position` del bloque colapsarían en una sola fila. El coach mapea
    /// lo hecho contra lo prescrito por `template_segment_id` + `leg_index`, nunca por
    /// el `position` absoluto, así que re-secuenciar no pierde nada. Una sesión SIN
    /// tramos de carrera conserva su `position` heredado exacto (cero cambio).
    static func build(
        laps: [LapRecord],
        overlay: ManualSegmentOverlay = .none,
        iso: ISO8601DateFormatter
    ) -> [SegmentExecutionDTO] {
        let manualHRAvg = ManualSegmentOverlay.validHR(overlay.avgHR)
        let manualHRMax = ManualSegmentOverlay.validHR(overlay.maxHR)

        let ordered = laps.sorted {
            ($0.position, $0.runLegIndex ?? -1) < ($1.position, $1.runLegIndex ?? -1)
        }
        let hasRunLegs = ordered.contains { $0.runLegIndex != nil }

        return ordered.enumerated().map { offset, lap in
            let wirePosition = hasRunLegs ? offset : lap.position

            let zones: [String: Int]? = lap.zoneSecondsByZone.isEmpty
                ? nil
                : lap.zoneSecondsByZone.reduce(into: [String: Int]()) {
                    $0["z\($1.key)"] = Int($1.value.rounded())
                }

            // Ritmo declarado a mano — SOLO cuando el tramo no midió ninguno.
            // Correr va en /km, el erg en /500 m.
            var avgPaceKm = lap.avgPaceSecPerKm
            var avgPace500 = lap.avgPaceSecPer500m
            var source = lap.source
            if let mp = overlay.paceSecondsBySegment[lap.segmentId], mp > 0,
               avgPaceKm == nil, avgPace500 == nil {
                if lap.modality == "run" {
                    avgPaceKm = Double(mp)
                } else {
                    avgPace500 = Double(mp)
                }
                source = "manual"
            }

            let setDTOs: [SetExecutionDTO]? = lap.sets?.map { s in
                var dto = SetExecutionDTO(
                    set_index: s.setIndex,
                    reps_prescribed: s.repsPrescribed,
                    reps_actual: s.repsActual,
                    load_prescribed_kg: s.loadPrescribedKg,
                    load_actual_kg: s.loadActualKg,
                    rpe: s.rpe,
                    rir: s.rir,
                    status: s.status,
                    confirmed: s.confirmed,
                    tempo: s.tempo,
                    rest_s: s.restS
                )
                dto.reps_source = s.repsSource
                dto.reps_confidence = s.repsConfidence
                dto.mean_velocity_first_m_s = s.meanVelocityFirstMs
                dto.mean_velocity_last_m_s = s.meanVelocityLastMs
                dto.velocity_loss_pct = s.velocityLossPct
                dto.rom_m = s.romM
                dto.velocity_confidence = s.velocityConfidence
                return dto
            }

            let ergSplitDTOs: [ErgSplitDTO]? = lap.ergSplits?.map { s in
                ErgSplitDTO(
                    index: s.index,
                    time_seconds: s.timeSeconds,
                    distance_meters: s.distanceMeters,
                    avg_pace_s_per_500m: s.avgPaceSecPer500m,
                    stroke_rate_spm: s.strokeRateSpm,
                    avg_power_w: s.avgPowerWatts,
                    calories: s.totalCalories,
                    calories_per_hour: s.avgCaloriesPerHour,
                    drag_factor: s.avgDragFactor,
                    rest_time_seconds: s.restTimeSeconds,
                    rest_distance_meters: s.restDistanceMeters,
                    avg_hr: s.avgHeartRateBpm
                )
            }

            return SegmentExecutionDTO(
                template_segment_id: lap.templateSegmentId,
                position: wirePosition,
                modality: lap.modality,
                started_at: iso.string(from: lap.startedAt),
                ended_at: iso.string(from: lap.endedAt),
                duration_seconds: Int(lap.durationSeconds.rounded()),
                distance_meters: lap.distanceCoveredMeters,
                avg_pace_s_per_500m: avgPace500,
                avg_pace_s_per_km: avgPaceKm,
                avg_power_w: lap.avgPowerWatts,
                stroke_rate_spm: lap.strokeRateSpm,
                // La FC declarada a mano cubre cualquier tramo sin FC medida, para
                // que una correa que falló no borre el pulso de la sesión.
                avg_hr: lap.avgHRBpm ?? manualHRAvg,
                max_hr: lap.maxHRBpm ?? manualHRMax,
                calories: lap.calories,
                // `reps_completed` == las reps REALES (nil en un salto — nunca un 0
                // fabricado). Se envía también `reps_actual` (la canónica).
                reps_completed: lap.repsCompleted,
                weight_used_kg: lap.weightUsedKg,
                zone_seconds_json: zones,
                source: source,
                reps_prescribed: lap.repsPrescribed,
                reps_actual: lap.repsCompleted,
                reps_status: lap.repsStatus,
                reps_confirmed: lap.repsConfirmed,
                is_structural: lap.isStructural,
                rx_scaled: lap.rxScaled,
                scaled_note: lap.scaledNote,
                sets: setDTOs,
                emom_rounds_completed: lap.emomRoundsCompleted,
                emom_rounds_prescribed: lap.emomRoundsPrescribed,
                incline_pct: lap.inclinePct,
                run_cadence_spm: lap.runCadenceSpm,
                drag_factor: lap.dragFactor,
                avg_calories_per_hour: lap.avgCaloriesPerHour,
                peak_drive_force_lbs: lap.peakDriveForceLbs,
                avg_drive_force_lbs: lap.avgDriveForceLbs,
                erg_splits: ergSplitDTOs,
                // Atribución por tramo de una carrera estructurada. nil en todo lo
                // que no es un bout de carrera (ver LapRecord).
                leg_index: lap.runLegIndex,
                leg_role: lap.runLegRole,
                leg_phase: lap.runLegPhase,
                // Provenance of avg_hr/max_hr specifically — nil on every lap that
                // never had a pulse (see LapRecord.hrSource).
                hr_source: lap.hrSource,
                sensor_work_s: lap.sensorWorkS,
                sensor_rest_s: lap.sensorRestS,
                sensor_timing_confidence: lap.sensorTimingConfidence,
                reps_source: lap.repsSource,
                reps_confidence: lap.repsConfidence
            )
        }
    }
}
