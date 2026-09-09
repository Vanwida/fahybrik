import Foundation

// FH-102 — Mid-run source switch preserves timer AND accumulated meters.
// One session, one clock; distance carry bridges source buckets.

extension WorkoutSession {

    /// Metres already covered on a prior source before the latest env switch.
    var runDistanceCarryMeters: Double {
        get { _runDistanceCarryMeters }
        set { _runDistanceCarryMeters = newValue }
    }

    /// Switch calle ↔ cinta without stopping the timer or losing covered metres.
    func switchRunEnvironment(to env: RunEnvironment) {
        guard runEnvironment != env else { return }
        commitRunDistanceBeforeEnvironmentSwitch()
        runEnvironment = env
        ensurePhoneWorkoutRun()
    }

    private func commitRunDistanceBeforeEnvironmentSwitch() {
        if lapBeltOwnsDistance {
            runDistanceCarryMeters += lapBeltDistanceMeters
            lapBeltDistanceMeters = 0
            lapBeltOwnsDistance = false
        } else if let gps = lapGpsDistanceMeters {
            runDistanceCarryMeters += gps
            lapGpsDistanceMeters = nil
            lapHadGPS = false
        } else if let manual = manualRunDistanceMeters {
            runDistanceCarryMeters += manual
            manualRunDistanceMeters = nil
        }
        tramoGpsStartDistance = 0
        tramoBeltStartDistance = 0
        runLegGpsStart = 0
        runLegBeltStart = 0
    }

    /// Official covered metres for HUD — carry plus the active source bucket.
    var officialRunDistanceMeters: Double? {
        guard tramoIsRun else { return nil }
        let active: Double
        if lapBeltOwnsDistance {
            active = lapBeltDistanceMeters
        } else {
            active = lapGpsDistanceMeters ?? manualRunDistanceMeters ?? 0
        }
        let total = runDistanceCarryMeters + active
        return total > 0 ? total : nil
    }
}
