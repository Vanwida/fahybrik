import Foundation

// Treadmill-BOUND half of the run pace domain: the belt math and the scalar
// resolvers that read a `WorkoutSegment`. The pure, cross-platform core — the
// `PaceTarget` / `TargetStatus` / `RunTarget` / `SegmentGoal` types and their
// judging — lives in FAHYBRIK/Plan/RunPaceModel.swift so the Apple Watch
// structured-run HUD shares it (#68). This file only ADDS the device-bound
// extensions, so both targets compile from the same type declarations.
//
// La grafía (seconds→m:ss y demás) NO está en ninguno de los dos: vive una sola
// vez en Theme/Formato.swift, compartida con el reloj.

// MARK: - Pace / distance math (belt-derived — app-only)

extension TreadmillMath {
    /// Belt speed (km/h) → running pace in whole seconds per km. Returns nil when
    /// the belt is effectively stopped (`< minMovingSpeedKmh`): pace is undefined at
    /// a standstill, so no se pinta — se pinta que la cinta está parada (§7).
    static func paceSecPerKm(fromSpeedKmh kmh: Double) -> Int? {
        guard kmh >= TreadmillConstants.minMovingSpeedKmh else { return nil }
        return Int((3600.0 / kmh).rounded())
    }

    /// Integrate one telemetry step into covered distance (speed × dt). Used for
    /// treadmills that don't report cumulative distance in their FTMS packets.
    static func advanceDistance(_ meters: Double, speedKmh: Double, dt: TimeInterval) -> Double {
        guard dt > 0, speedKmh > 0 else { return meters }
        return meters + (speedKmh / 3.6) * dt
    }
}

// MARK: - RunTarget.resolve(from: WorkoutSegment) — the scalar treadmill path

extension RunTarget {
    /// Resolve from a segment. Prefers the STRUCTURED `prescription.target` (the
    /// only place a pace band lives), normalizing any unit (/500m, /mile) to
    /// seconds-per-km; falls back to the flattened scalar pace, then scalar zone.
    static func resolve(from segment: WorkoutSegment) -> RunTarget {
        if let target = segment.prescription?.target {
            switch target {
            case let .pace(unit, valueS, minS, maxS):
                let t = PaceTarget(
                    single: valueS.map { perKm($0, unit) },
                    fastS: minS.map { perKm($0, unit) },
                    slowS: maxS.map { perKm($0, unit) }
                )
                if t.single != nil || t.hasBand { return .pace(t) }
            case let .hrZone(value, min, _):
                if let z = zone(from: value ?? min) { return .zone(z) }
            default:
                break
            }
        }
        if let scalar = segment.targetPaceSecondsPerKm { return .pace(PaceTarget(single: scalar)) }
        if let z = segment.targetZone { return .zone(z) }
        return .none
    }

    // /500m and /mile → /km. Runs read /km; the erg /500m form is doubled, a
    // mile is 1.609344 km.
    private static func perKm(_ seconds: Int, _ unit: PaceUnit) -> Int {
        switch unit {
        case .perKm:    return seconds
        case .per500m:  return seconds * 2
        case .perMile:  return Int((Double(seconds) / 1.609344).rounded())
        }
    }

    private static func zone(from value: Double?) -> HRZone? {
        guard let value else { return nil }
        return HRZone(rawValue: Int(value.rounded()))
    }
}

// MARK: - SegmentGoal.resolve(from: WorkoutSegment) — the scalar treadmill path

extension SegmentGoal {
    static func resolve(from segment: WorkoutSegment) -> SegmentGoal {
        if let d = segment.targetDistanceMeters, d > 0 { return .distance(meters: d) }
        if let t = segment.targetDurationSeconds, t > 0 { return .time(seconds: t) }
        return .open
    }
}

// An age-based HR-zone estimate used to live here (`EstimatedHRZone`). There is
// no client-side zone estimate any more, anywhere: zones are a fraction of the
// athlete's THRESHOLD, the server resolves them, and the app paints the absolute
// bands it is given (`HRZoneProfile`, Theme/ZoneColors.swift). No anchor → no
// zones, rather than a band derived from a max nobody measured.
