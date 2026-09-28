import Foundation

// LOS ESCALARES DE UNA PRESCRIPCIÓN, derivados como los deriva el servidor.
//
// Espejo de `prescriptionToParams` (shared/domain/prescription/to-params.ts) +
// `normalizeParams` (web/lib/athlete/assignment-detail.ts): lo que el detalle de una
// asignación manda como `params_json` de cada ejercicio cuando el ejercicio trae
// prescripción estructurada. Existe en iOS por UNA razón: un entreno libre se corre
// ANTES de que el servidor lo tenga (sin conexión, o mientras el plan se guarda), y
// tiene que correr con el MISMO `WorkoutPlan.from` y los MISMOS escalares que
// tendrá cuando llegue. Si el libre inventara los suyos a mano —como hacían los
// constructores hasta el 28-sep—, el mismo entreno corría distinto según por dónde
// entrara (docs/DECISIONS.md 2026-09-28).
//
// Es un RESUMEN con pérdida, igual que el del servidor: la verdad es la prescripción.
extension WorkoutItemParams {
    init(derivedFrom p: Prescription) {
        var sets: Int?
        var reps: Int?
        var loadKg: Double?
        var loadPct: Double?
        var rpe: Double?
        var restSeconds: Int?
        var durationSeconds: Int?
        var distanceMeters: Int?
        var paceSecPerKm: Int?
        var calories: Int?
        var hrZone: Int?
        var watts: Int?

        func apply(_ target: Target) {
            switch target {
            case let .percentRM(value, min, max):
                loadPct = value ?? min ?? max
            case let .kg(value, min, max, _):
                loadKg = value ?? min ?? max
            case let .rpe(value, min, max):
                rpe = value ?? min ?? max
            case let .hrZone(value, min, max):
                hrZone = (value ?? min ?? max).map { Int($0.rounded()) }
            case let .watts(value, min, max):
                watts = (value ?? min ?? max).map { Int($0.rounded()) }
            case let .pace(unit, valueS, minS, maxS):
                guard let native = valueS ?? minS ?? maxS else { break }
                let metros: Double
                switch unit {
                case .perKm:   metros = 1000
                case .per500m: metros = 500
                case .perMile: metros = 1609.344
                }
                paceSecPerKm = Int((Double(native) / metros * 1000).rounded())
            case .rir, .bodyweight, .hrBpm, .calories, .timeCap, .unknown:
                break
            }
        }

        if let list = p.sets, !list.isEmpty {
            sets = list.count
            let repsSeq: [Int] = list.compactMap {
                if case let .reps(v, _)? = $0.measure { return v }
                return nil
            }
            if let first = repsSeq.first {
                if repsSeq.allSatisfy({ $0 == first }) { reps = first }
                else if !(repsSeq.count == list.count && repsSeq.count > 1) { reps = first }
            }
            if let t = list.compactMap(\.target).first ?? p.target { apply(t) }
            let rests = Set(list.compactMap(\.restS))
            if rests.count == 1 { restSeconds = rests.first }
            let durs: [Int] = list.compactMap {
                if case let .duration(s, _)? = $0.measure { return s }
                return nil
            }
            if let d = durs.first, Set(durs).count == 1 { durationSeconds = d }
            let dists: [Double] = list.compactMap {
                if case let .distance(m, _)? = $0.measure { return m }
                return nil
            }
            if let m = dists.first, Set(dists).count == 1 { distanceMeters = Int(m.rounded()) }
            let cals: [Int] = list.compactMap {
                if case let .calories(c, _)? = $0.measure { return c }
                return nil
            }
            if let c = cals.first, Set(cals).count == 1 { calories = c }
        } else {
            if let r = p.rounds { sets = r }
            if let w = p.workS { durationSeconds = w }
            if let r = p.restS { restSeconds = r }
            // Un For Time lleva su `total_s` como TOPE, no como duración del trabajo.
            if let t = p.totalS, p.scheme != .forTime { durationSeconds = t }
            if let t = p.target { apply(t) }
        }

        self.init(
            sets: sets, reps: reps, loadKg: loadKg, loadPct: loadPct, rpe: rpe,
            restSeconds: restSeconds, durationSeconds: durationSeconds,
            distanceKm: distanceMeters.map { (Double($0) / 1000 * 1000).rounded() / 1000 },
            distanceMeters: distanceMeters, paceSecPerKm: paceSecPerKm, cadenceSpm: nil,
            calories: calories, caloriesPerMin: nil, hrZone: hrZone, watts: watts
        )
    }
}

extension PrescriptionModality {
    /// La categoría con la que el detalle de una asignación manda un ejercicio que
    /// trae esta modalidad (`displayCategoryForModality`, assignment-detail.ts). Es
    /// la que lee `WorkoutItem.segmentKind`. Nil = el detalle cae a la categoría del
    /// catálogo.
    var categoriaDelDetalle: String? {
        switch self {
        case .run:        return "running"
        case .ski:        return "ski_erg"
        case .row:        return "rowing"
        case .bike:       return "bike_erg"
        case .strength:   return "strength"
        case .functional: return "functional"
        case .core:       return "functional"
        case .mobility:   return "mobility"
        case .other:      return nil
        }
    }
}
