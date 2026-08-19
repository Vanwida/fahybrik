import Foundation

// CALENTAMIENTO Y VUELTA A LA CALMA: se registran como UNA finalización de bloque,
// nunca ejercicio a ejercicio, y quedan fuera del volumen y de la analítica. Con
// dos puertas para que no se cuente dos veces (el botón y el backstop que lo
// deduce del primer trabajo real) y una clave por bloque que las hace idempotentes.
extension WorkoutSession {
    // MARK: - Warmup / cooldown structural completion

    /// Stable grouping key for a region (its first segment's block key) — the
    /// dedupe key for structural completion.
    private func structuralKey(_ region: WorkoutBlockRegion) -> String {
        plan.segments[region.firstIndex].blockGroupingKey
    }

    /// Append ONE structural completion lap for a warmup/cooldown block (idempotent
    /// per block). No reps/load — completion-only, excluded from analytics.
    func appendStructuralLap(for region: WorkoutBlockRegion, durationSeconds: Double) {
        let key = structuralKey(region)
        guard !completedStructuralBlockKeys.contains(key) else { return }
        completedStructuralBlockKeys.insert(key)
        let first = plan.segments[region.firstIndex]
        let now = Date()
        laps.append(
            LapRecord(
                id: UUID(),
                segmentId: first.id,
                templateSegmentId: first.templateSegmentId,
                position: first.order,
                // Same single source as a worked lap: identical to `kind.modality`
                // for everything that is not an erg, and correct for the one case
                // that differs — a warmup or cooldown done on the ski or the bike.
                modality: first.wireModality,
                startedAt: now.addingTimeInterval(-durationSeconds),
                endedAt: now,
                durationSeconds: durationSeconds,
                avgHRBpm: nil,
                maxHRBpm: nil,
                zoneSecondsByZone: [:],
                repsCompleted: nil,
                distanceCoveredMeters: nil,
                avgPaceSecPer500m: nil,
                avgPaceSecPerKm: nil,
                avgPowerWatts: nil,
                strokeRateSpm: nil,
                calories: nil,
                weightUsedKg: nil,
                source: "manual",
                repsPrescribed: nil,
                repsStatus: "done",
                repsConfirmed: true,
                isStructural: true,
                rxScaled: nil,
                scaledNote: nil,
                sets: nil
            )
        )
    }

    /// "Calentamiento hecho" / "Vuelta a la calma hecha" — close the WHOLE
    /// structural block as ONE completion and advance past it. One tap, never
    /// per-exercise.
    func completeStructuralBlock() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              let region = currentBlockRegion, currentBlockIsStructural else { return }
        Haptics.success()
        appendStructuralLap(for: region, durationSeconds: max(0, lapElapsedSeconds))
        // No per-exercise laps for the block — drop any live state, jump past it.
        discardCurrentLiveState()
        let next = region.lastIndex + 1
        if next < plan.segments.count {
            let origin = currentSegmentIndex
            currentSegmentIndex = next
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// Backstop: when the athlete confirms their first real working set, infer that
    /// any PRECEDING warmup block was done (covers a skip/jump past it without the
    /// button). Cooldown is last, so it's never auto-inferred — only its button logs it.
    func registerFirstWorkingSet() {
        guard !currentBlockIsStructural else { return }
        guard !firstWorkingSetConfirmed else { return }
        firstWorkingSetConfirmed = true
        for region in plan.blockRegions
        where region.phase == .warmup && region.lastIndex < currentSegmentIndex {
            appendStructuralLap(for: region, durationSeconds: 0)
        }
    }
}
