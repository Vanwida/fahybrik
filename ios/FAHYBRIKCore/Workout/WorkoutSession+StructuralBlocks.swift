import Foundation

// CALENTAMIENTO Y VUELTA A LA CALMA: quedan fuera del volumen. El lap
// estructural lo sella el backstop al entrar al trabajo (o endBlockEarly),
// no el botón. Un gesto cierra un tramo; no salta al siguiente gate.
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
                distanceCoveredMeters: structuralDistanceMeters(),
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

    /// Metros que la máquina midió en un calentamiento / vuelta a la calma.
    /// Antes el lap estructural nacía siempre con `distanceCoveredMeters: nil`,
    /// así que 6 min de cinta se guardaban como 0 m.
    private func structuralDistanceMeters() -> Double? {
        if lapBeltDistanceMeters > 0 { return lapBeltDistanceMeters }
        if let m = lapErgDistanceMeters, m > 0 { return m }
        if let m = lapGpsDistanceMeters, m > 0 { return m }
        return nil
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
