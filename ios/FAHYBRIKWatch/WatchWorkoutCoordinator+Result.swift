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

    func restageIfPossible() {
        guard isDoublesResult, let pending = pendingResult,
              let envelope = makeEnvelope(assignmentId: pending.assignmentId, payload: pending.payload)
        else { return }
        stagedEnvelopeData = WatchConnectivityService.shared.restageExecutionResult(
            previous: stagedEnvelopeData, envelope: envelope
        )
    }

    func buildExecutionPayload(
        assignmentId: String,
        session: WorkoutSession,
        sourceWorkoutRef: String?
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
        let scoreTime = isTimeScored ? (session.capturedScoreTimeSeconds ?? total) : nil
        let scoreRounds = isRoundsScored ? session.capturedScoreRounds : nil
        let scoreReps = isRoundsScored ? session.capturedScoreReps : nil

        let segments = buildSegments(iso: iso, laps: session.laps)

        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: nil,
            total_duration_seconds: total,
            notes: nil,
            source: nil,
            score_time_s: scoreTime,
            score_rounds: scoreRounds,
            score_reps: scoreReps,
            completeness: session.completeness.rawValue,
            started_at: iso.string(from: session.startedAt),
            ended_at: iso.string(from: Date()),
            segments: segments.isEmpty ? nil : segments,
            source_workout_ref: sourceWorkoutRef
        )
    }

    func buildSegments(iso: ISO8601DateFormatter, laps: [LapRecord]) -> [SegmentExecutionDTO] {
        SegmentPayloadBuilder.build(laps: laps, overlay: .none, iso: iso)
    }
}
