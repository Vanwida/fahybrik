import Foundation

// MARK: - Pre-fill from the live execution

/// Maps a finished session's measured work onto the test's result slugs, so the
/// capture sheet opens with the real number already in place. Reads only the
/// session's public accessors — never fabricates: a measure with no captured
/// value simply starts empty (the athlete enters it).
enum TestBatteryPrefill {
    static func map(session: WorkoutSession, specs: [StoreResultSpec]) -> [String: Double] {
        var out: [String: Double] = [:]
        for spec in specs {
            if let v = value(session: session, measure: TestMeasure(spec.measure)) {
                out[spec.slug] = v
            }
        }
        return out
    }

    /// Lo mismo desde la ejecución que manda el reloj cuando el test se hizo con la
    /// muñeca sola: el móvil no tuvo la sesión viva, tiene lo que midió el reloj.
    /// Misma regla que desde la sesión; la carga mira también las series declaradas,
    /// que es donde vive el peso de un 1RM hecho serie a serie.
    static func map(payload: WorkoutExecutionPayload, specs: [StoreResultSpec]) -> [String: Double] {
        var out: [String: Double] = [:]
        for spec in specs {
            if let v = value(payload: payload, measure: TestMeasure(spec.measure)) {
                out[spec.slug] = v
            }
        }
        return out
    }

    private static func value(payload: WorkoutExecutionPayload, measure: TestMeasure) -> Double? {
        let segments = payload.segments ?? []
        switch measure {
        case .time:
            if let t = payload.score_time_s, t > 0 { return Double(t) }
            if let t = payload.total_duration_seconds, t > 0 { return Double(t) }
            return nil
        case .load:
            let series = segments.flatMap { $0.sets ?? [] }
                .filter { $0.status != "skipped" }
                .compactMap(\.load_actual_kg)
            return (segments.compactMap(\.weight_used_kg) + series).max()
        case .distance:
            let d = segments.compactMap(\.distance_meters).reduce(0, +)
            return d > 0 ? d : nil
        case .reps:
            let r = segments.compactMap(\.reps_completed).reduce(0, +)
            return r > 0 ? Double(r) : nil
        case .calories:
            let c = segments.compactMap(\.calories).reduce(0, +)
            return c > 0 ? c : nil
        case .hrr, .hr, .height, .other:
            // Lo mismo que desde la sesión: ni la recuperación (la mide la ventana
            // del móvil), ni el umbral, ni un salto salen de aquí.
            return nil
        }
    }

    private static func value(session: WorkoutSession, measure: TestMeasure) -> Double? {
        switch measure {
        case .time:
            // The conditioning engine's captured headline time (For Time / HYROX
            // sim), else the total elapsed clock.
            if let t = session.capturedScoreTimeSeconds, t > 0 { return Double(t) }
            let e = Int(session.elapsedSeconds.rounded())
            return e > 0 ? Double(e) : nil
        case .load:
            // Heaviest load actually logged (the 1RM proxy): the max across every
            // segment's recorded weight.
            return session.laps.compactMap { $0.weightUsedKg }.max()
        case .distance:
            let d = session.laps.compactMap { $0.distanceCoveredMeters }.reduce(0, +)
            return d > 0 ? d : nil
        case .reps:
            let r = session.laps.compactMap { $0.repsCompleted }.reduce(0, +)
            return r > 0 ? Double(r) : nil
        case .calories:
            let c = session.laps.compactMap { $0.calories }.reduce(0, +)
            return c > 0 ? c : nil
        case .hrr:
            // Measured by the post-effort recovery window (tests guiados). Nil
            // when the window never ran / had no signal — the row then reads as
            // omitted; the athlete NEVER types a recovery value by hand.
            return session.hrRecovery?.hrr60.map(Double.init)
        case .hr:
            // The threshold is the AVERAGE pulse over the last 20 min of the
            // effort, and the session keeps no per-window HR average to compute it
            // from — only the recovery capture. Pre-filling anything else here (the
            // last reading, the session mean) would put a number that is not the
            // threshold in the field that defines the athlete's zones. So: nil, and
            // the athlete copies the lap average their watch already shows.
            return nil
        case .height:
            // Height is produced by the jump capture, never by a live workout
            // session. An empty prefill here is honest: this sheet is the
            // fallback when someone opens «Añadir resultado» without video.
            return nil
        case .other:
            return nil
        }
    }
}

