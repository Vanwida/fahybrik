import SwiftUI

// INFORME DE SESIÓN — totales + por máquina, encima de la tabla de tramos.
//
// Por qué: el atleta acaba un EMOM con PM5 y el resumen solo pedía RPE. El motor
// ya mide ritmo / cal / potencia / metros por estación; esto los enseña de un
// vistazo (totales de sesión + desglose remo vs ski vs run) sin exigir reabrir
// el detalle. Solo se pinta cuando hay ALGO medido — si no, no hay card vacía.

struct ResumenSesionCard: View {
    let laps: [LapRecord]
    let elapsedSeconds: Double

    /// true when there is at least one measured number worth showing.
    static func hayQuePintarla(laps: [LapRecord], elapsedSeconds: Double) -> Bool {
        guard !laps.isEmpty else { return false }
        return totales(from: laps, elapsed: elapsedSeconds).hasAny
            || porMaquina(from: laps).count >= 1
    }

    var body: some View {
        let t = Self.totales(from: laps, elapsed: elapsedSeconds)
        let machines = Self.porMaquina(from: laps)
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    LabelText(text: "Tu sesión", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)

                // Totals grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    if t.durationS > 0 {
                        celda("Tiempo", Formato.clock(t.durationS))
                    }
                    if let d = t.distanceM, d >= 1 {
                        celda("Distancia", Formato.distanciaCubierta(d) ?? "\(Int(d)) m")
                    }
                    if let c = t.calories, c >= 1 {
                        celda("Calorías", "\(Int(c.rounded())) cal")
                    }
                    if let p = t.avgPace500, p > 0 {
                        celda("Ritmo medio erg", Formato.ritmo(p, .por500m))
                    }
                    if let p = t.avgPaceKm, p > 0 {
                        celda("Ritmo medio run", Formato.ritmo(p, .porKm))
                    }
                    if let w = t.avgPower, w >= 1 {
                        celda("Potencia media", "\(Int(w.rounded())) W")
                    }
                    if let hr = t.avgHR {
                        celda("FC media", "\(hr) ppm")
                    }
                    if let hr = t.maxHR {
                        celda("FC máx", "\(hr) ppm")
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, machines.isEmpty ? 10 : 6)

                // Per-machine roll-up (remo vs ski vs run…)
                if machines.count >= 1 {
                    Hairline()
                    VStack(spacing: 0) {
                        ForEach(machines) { m in
                            HStack(spacing: 6) {
                                Text(m.label)
                                    .scaledFont(11, relativeTo: .caption2)
                                    .foregroundStyle(Theme.Color.foreground)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .lineLimit(1)
                                if let line = m.detail {
                                    MonoText(text: line, size: 11, color: Theme.Color.muted,
                                             escala: true, relativeTo: .caption2)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                        }
                    }
                    .padding(.bottom, 4)
                }
            }
        }
    }

    private func celda(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy, design: .default).italic())
                .tracking(0.5)
                .foregroundStyle(Theme.Color.muted)
            MonoText(text: value, size: 15, weight: .semibold, color: Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }

    // MARK: - Pure aggregation

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
