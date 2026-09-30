import Foundation

extension WatchWorkoutCoordinator {
    func makeEnvelope(assignmentId: String, payload: WorkoutExecutionPayload) -> WatchExecutionEnvelope? {
        guard let data = try? WatchWire.encoder.encode(payload) else { return nil }
        return WatchExecutionEnvelope(
            assignmentId: assignmentId,
            payloadJson: data,
            shareWithPartner: isDoublesResult ? shareWithPartner : nil,
            traceLocalId: stagedTraceLocalId
        )
    }

    func setShareWithPartner(_ value: Bool) {
        shareWithPartner = value
        restageIfPossible()
    }

    /// Vuelve a escenificar el resultado con lo último decidido (el conmutador de compartir de un dobles, o el RPE).
    func restageIfPossible() {
        guard let pending = pendingResult,
              let envelope = makeEnvelope(assignmentId: pending.assignmentId, payload: pending.payload)
        else { return }
        stagedEnvelopeData = WatchConnectivityService.shared.restageExecutionResult(
            previous: stagedEnvelopeData, envelope: envelope
        )
    }

    func buildExecutionPayload(
        assignmentId: String,
        session: WorkoutSession,
        sourceWorkoutRef: String?,
        rpe: Int?
    ) -> WorkoutExecutionPayload {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let total = Int(session.elapsedSeconds.rounded())

        let isTimeScored: Bool
        let isRoundsScored: Bool
        switch session.plan.format {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            isTimeScored = true;  isRoundsScored = false
        case .amrap, .tabata, .deathBy:
            isTimeScored = false; isRoundsScored = true
        default:
            isTimeScored = false; isRoundsScored = false
        }
        // El tiempo del BLOQUE que puntúa, o nada: el total de la sesión (con
        // calentamiento y vuelta a la calma) no es el tiempo de un For Time.
        let scoreTime = isTimeScored ? session.capturedScoreTimeSeconds : nil
        let scoreRounds = isRoundsScored ? session.capturedScoreRounds : nil
        let scoreReps = isRoundsScored ? session.capturedScoreReps : nil

        let segments = buildSegments(iso: iso, laps: session.laps)

        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe,
            total_duration_seconds: total,
            notes: nil,
            source: nil,
            score_time_s: scoreTime,
            score_rounds: scoreRounds,
            score_reps: scoreReps,
            completeness: session.completeness.rawValue,
            started_at: iso.string(from: session.startedAt),
            // El final de la sesión, no el de hoy: la ejecución se reconstruye cuando llega el RPE.
            ended_at: iso.string(from: session.finishedAt ?? Date()),
            segments: segments.isEmpty ? nil : segments,
            source_workout_ref: sourceWorkoutRef
        )
    }

    func buildSegments(iso: ISO8601DateFormatter, laps: [LapRecord]) -> [SegmentExecutionDTO] {
        SegmentPayloadBuilder.build(laps: laps, overlay: .none, iso: iso)
    }
}
