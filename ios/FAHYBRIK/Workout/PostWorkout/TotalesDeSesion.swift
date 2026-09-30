import Foundation

// LOS TOTALES DE UNA SESIÓN — la agregación pura del pulso, la distancia, el ritmo y la potencia
// de unos laps, y el desglose por máquina (remo · ski · correr…).
//
// Fue la tarjeta «Tu sesión» del resumen; la tarjeta dejó de pintarse en ninguna pantalla y se
// borró al rehacer el resumen con la piel del día (30-sep). Lo que sigue vivo es la cuenta: el
// resumen de carrera la usa para su FC (una sola forma de agregar el pulso de unos laps) y la fijan
// `EmomSessionReportTests`.

enum TotalesDeSesion {

    struct Totales {
        var durationS: Double = 0
        var distanceM: Double?
        var calories: Double?
        var avgPace500: Double?
        var avgPaceKm: Double?
        var avgPower: Double?
        var avgHR: Int?
        var maxHR: Int?

        var hasAny: Bool {
            durationS > 0
                || (distanceM ?? 0) >= 1
                || (calories ?? 0) >= 1
                || (avgPace500 ?? 0) > 0
                || (avgPaceKm ?? 0) > 0
                || (avgPower ?? 0) >= 1
                || avgHR != nil
                || maxHR != nil
        }
    }

    struct Maquina: Identifiable {
        let id: String
        let label: String
        let detail: String?
    }

    static func totales(from laps: [LapRecord], elapsed: Double) -> Totales {
        var t = Totales()
        t.durationS = elapsed > 0 ? elapsed : laps.reduce(0) { $0 + $1.durationSeconds }
        let dist = laps.compactMap(\.distanceCoveredMeters).filter { $0 >= 1 }
        if !dist.isEmpty { t.distanceM = dist.reduce(0, +) }
        let cals = laps.compactMap(\.calories).filter { $0 >= 1 }
        if !cals.isEmpty { t.calories = cals.reduce(0, +) }

        // Weighted average pace /500 m by metres (honest over the piece).
        var pace500Num = 0.0, pace500Den = 0.0
        var paceKmNum = 0.0, paceKmDen = 0.0
        var powerNum = 0.0, powerDen = 0.0
        var hrSum = 0, hrN = 0
        var maxHR: Int?
        for lap in laps {
            if let p = lap.avgPaceSecPer500m, p > 0, let m = lap.distanceCoveredMeters, m > 0 {
                pace500Num += p * m
                pace500Den += m
            } else if let p = lap.avgPaceSecPer500m, p > 0, lap.durationSeconds > 0 {
                pace500Num += p * lap.durationSeconds
                pace500Den += lap.durationSeconds
            }
            if let p = lap.avgPaceSecPerKm, p > 0, let m = lap.distanceCoveredMeters, m > 0 {
                paceKmNum += p * m
                paceKmDen += m
            }
            if let w = lap.avgPowerWatts, w > 0, lap.durationSeconds > 0 {
                powerNum += w * lap.durationSeconds
                powerDen += lap.durationSeconds
            }
            if let hr = lap.avgHRBpm {
                hrSum += hr
                hrN += 1
            }
            if let hr = lap.maxHRBpm {
                maxHR = max(maxHR ?? hr, hr)
            }
        }
        if pace500Den > 0 { t.avgPace500 = pace500Num / pace500Den }
        if paceKmDen > 0 { t.avgPaceKm = paceKmNum / paceKmDen }
        if powerDen > 0 { t.avgPower = powerNum / powerDen }
        if hrN > 0 { t.avgHR = hrSum / hrN }
        t.maxHR = maxHR
        return t
    }

    /// Roll-up by wire modality (row / ski / bike / run / …), stable order.
    static func porMaquina(from laps: [LapRecord]) -> [Maquina] {
        let order = ["row", "ski", "bike", "run", "functional", "strength", "other"]
        let groups = Dictionary(grouping: laps) { $0.modality.lowercased() }
        return order.compactMap { key -> Maquina? in
            guard let xs = groups[key], !xs.isEmpty else { return nil }
            let label = etiqueta(key)
            var parts: [String] = []
            let dist = xs.compactMap(\.distanceCoveredMeters).filter { $0 >= 1 }.reduce(0, +)
            if dist >= 1 { parts.append(Formato.distanciaCubierta(dist) ?? "\(Int(dist)) m") }
            let cal = xs.compactMap(\.calories).filter { $0 >= 1 }.reduce(0, +)
            if cal >= 1 { parts.append("\(Int(cal.rounded())) cal") }
            // Mean pace for this machine, weighted by metres.
            var pNum = 0.0, pDen = 0.0
            for lap in xs {
                if key == "run" {
                    if let p = lap.avgPaceSecPerKm, p > 0, let m = lap.distanceCoveredMeters, m > 0 {
                        pNum += p * m; pDen += m
                    }
                } else if let p = lap.avgPaceSecPer500m, p > 0 {
                    let w = lap.distanceCoveredMeters ?? lap.durationSeconds
                    if w > 0 { pNum += p * w; pDen += w }
                }
            }
            if pDen > 0 {
                let unit: Formato.UnidadRitmo = key == "run" ? .porKm : .por500m
                parts.append(Formato.ritmo(pNum / pDen, unit))
            }
            let wAvg = xs.compactMap(\.avgPowerWatts).filter { $0 >= 1 }
            if !wAvg.isEmpty {
                let mean = wAvg.reduce(0, +) / Double(wAvg.count)
                parts.append("\(Int(mean.rounded())) W")
            }
            parts.append("\(xs.count)×")
            return Maquina(id: key, label: label, detail: parts.isEmpty ? nil : parts.joined(separator: " · "))
        }
    }

    private static func etiqueta(_ modality: String) -> String {
        switch modality {
        case "row": return "Remo"
        case "ski": return "SkiErg"
        case "bike": return "BikeErg"
        case "run": return "Correr"
        case "functional": return "Funcional"
        case "strength": return "Fuerza"
        default: return modality.capitalized
        }
    }
}
