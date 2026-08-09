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

    /// Running pace (seconds per km) → belt speed in km/h, redondeado al ESCALÓN
    /// que la cinta acepta de verdad.
    ///
    /// La inversa de `paceSecPerKm(fromSpeedKmh:)`, y hace falta por un motivo muy
    /// concreto: en las cintas que hemos encontrado la app NO puede fijar la
    /// velocidad por BLE (la máquina no declara el control, o lo rechaza). O sea
    /// que el atleta la marca a mano. Si el coach prescribe 4:30/km, alguien tiene
    /// que hacer 60÷4,5 — y hacerlo sudando, a mitad del calentamiento, es cómo se
    /// acaba corriendo otra sesión.
    ///
    /// `step` sale del Supported Speed Range que la propia cinta publica (FTMS);
    /// 0,1 km/h es el incremento universal cuando la máquina no lo dice. Se
    /// redondea AL ESCALÓN porque un «13,33» no se puede marcar en ninguna consola:
    /// un número que el atleta no puede introducir no es una ayuda, es ruido.
    static func speedKmh(fromPaceSecPerKm pace: Int, step: Double = 0.1) -> Double? {
        guard pace > 0 else { return nil }
        let bruto = 3600.0 / Double(pace)
        guard bruto >= TreadmillConstants.minMovingSpeedKmh else { return nil }
        let escalon = step > 0 ? step : 0.1
        return (bruto / escalon).rounded() * escalon
    }

    /// Integrate one telemetry step into covered distance (speed × dt). Used for
    /// treadmills that don't report cumulative distance in their FTMS packets.
    static func advanceDistance(_ meters: Double, speedKmh: Double, dt: TimeInterval) -> Double {
        guard dt > 0, speedKmh > 0 else { return meters }
        return meters + (speedKmh / 3.6) * dt
    }
}

// MARK: - «Pon X en la cinta» — el objetivo de ritmo traducido a la consola

extension RunTarget {
    /// Qué velocidad marcar en la cinta para cumplir ESTE objetivo, ya escrita.
    /// Nil cuando el objetivo no es de ritmo (una zona de pulso no se marca en la
    /// consola: la cinta no sabe tu pulso) o cuando no hay ritmo que convertir.
    ///
    /// Una BANDA de ritmo se invierte al pasar a velocidad —el ritmo rápido es la
    /// velocidad ALTA— así que los extremos se cruzan. Pintarla sin cruzarlos
    /// mandaría al atleta al extremo contrario del que le pidió el coach.
    func velocidadDeCinta(step: Double = 0.1) -> String? {
        guard case let .pace(t) = self else { return nil }

        func kmh(_ secPerKm: Int?) -> Double? {
            guard let secPerKm else { return nil }
            return TreadmillMath.speedKmh(fromPaceSecPerKm: secPerKm, step: step)
        }
        // fastS (ritmo más rápido) → velocidad MÁS ALTA, y al revés.
        let alta = kmh(t.fastS)
        let baja = kmh(t.slowS)

        if let alta, let baja {
            // Una banda que redondea al mismo escalón no es una banda: se dice una vez.
            if alta == baja { return Formato.esDecimal(alta, siempreDecimales: true) }
            return "\(Formato.esDecimal(baja, siempreDecimales: true))–\(Formato.esDecimal(alta, siempreDecimales: true))"
        }
        if let alta { return "≥ \(Formato.esDecimal(alta, siempreDecimales: true))" }
        if let baja { return "≤ \(Formato.esDecimal(baja, siempreDecimales: true))" }
        guard let punto = kmh(t.single) else { return nil }
        return Formato.esDecimal(punto, siempreDecimales: true)
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
