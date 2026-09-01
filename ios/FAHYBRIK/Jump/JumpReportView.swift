import SwiftUI

// La ficha permanente del perfil de salto. La misma para atleta y coach.
// No es un póster de un coach: es altura, respuesta a la carga, y la lectura.
// Los cortes NO viven aquí — llegan en el DTO (método del coach).

struct JumpProfileDTO: Codable, Equatable {
    let unloadedCm: Double
    let loadedCm: Double?
    let lri: Double?
    let lriLabel: String?
    let heightLevel: Int
    let lriLevel: Int?
}

struct CmjScaleBandDTO: Codable, Equatable {
    let level: Int
    let rangeLabel: String
    let label: String
    let active: Bool
}

struct CmjAttemptDTO: Codable, Equatable {
    let kind: String
    let heightCm: Double
    let kept: Bool
    let quality: String
}

struct CmjReportDTO: Codable, Equatable {
    let title: String
    let dateLabel: String?
    let unloadedCm: Double
    let loadedCm: Double?
    let heightLevel: Int
    let heightLabel: String
    let loadedHeightLevel: Int?
    let lri: Double?
    let lriLabel: String?
    let lriLevel: Int?
    let dropAbsCm: Double?
    let dropRel: Double?
    let loadRel: Double?
    let loadKg: Double?
    let bodyMassKg: Double?
    let lectura: String
    let heightScale: [CmjScaleBandDTO]
    let lriScale: [CmjScaleBandDTO]
    let attempts: [CmjAttemptDTO]
}

struct JumpReportView: View {
    let report: CmjReportDTO
    var onClose: (() -> Void)? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                if let onClose {
                    HStack {
                        Button("Cerrar", action: onClose)
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer()
                    }
                    .padding(Theme.Spacing.m)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("INFORME DEL TEST")
                                .font(Theme.Typography.caption)
                                .foregroundStyle(Theme.Color.muted)
                            Text(report.title)
                                .font(Theme.Typography.display)
                                .italic()
                                .foregroundStyle(Theme.Color.foreground)
                            if let date = report.dateLabel, !date.isEmpty {
                                Text(Self.shortDate(date))
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }

                        block(title: "Sin carga") {
                            HStack(alignment: .lastTextBaseline) {
                                Text("\(Int(report.unloadedCm.rounded()))")
                                    .font(.system(size: 52, weight: .heavy, design: .serif))
                                    .italic()
                                    .foregroundStyle(Theme.Color.accent)
                                Text("cm")
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.muted)
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text("\(report.heightLevel)/5")
                                        .font(Theme.Typography.headlineM)
                                        .italic()
                                    Text(report.heightLabel.uppercased())
                                        .font(Theme.Typography.caption)
                                        .foregroundStyle(Theme.Color.muted)
                                }
                            }
                            scale(report.heightScale)
                        }

                        if let loaded = report.loadedCm {
                            block(title: loadTitle) {
                                HStack(alignment: .lastTextBaseline) {
                                    Text("\(Int(loaded.rounded()))")
                                        .font(.system(size: 40, weight: .heavy, design: .serif))
                                        .italic()
                                        .foregroundStyle(Theme.Color.foreground)
                                    Text("cm")
                                        .font(Theme.Typography.caption)
                                        .foregroundStyle(Theme.Color.muted)
                                    Spacer()
                                    if let lvl = report.loadedHeightLevel {
                                        Text("nivel \(lvl)/5")
                                            .font(Theme.Typography.caption)
                                            .foregroundStyle(Theme.Color.muted)
                                    }
                                }
                                HStack(alignment: .top) {
                                    metric("Caída", report.dropAbsCm.map { JumpPhysics.displayCm($0) } ?? "—")
                                    metric("Relativa", report.dropRel.map { pct($0) } ?? "—")
                                    metric("Carga / peso", report.loadRel.map { pct($0) } ?? "—")
                                }
                                if let lri = report.lri {
                                    HStack(alignment: .lastTextBaseline) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("LRI")
                                                .font(Theme.Typography.caption)
                                                .foregroundStyle(Theme.Color.muted)
                                            Text(String(format: "%.2f", lri).replacingOccurrences(of: ".", with: ","))
                                                .font(.system(size: 36, weight: .heavy, design: .serif))
                                                .italic()
                                                .foregroundStyle(Theme.Color.accent)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 2) {
                                            if let lvl = report.lriLevel {
                                                Text("\(lvl)/5")
                                                    .font(Theme.Typography.headlineM)
                                                    .italic()
                                            }
                                            if let label = report.lriLabel {
                                                Text(label.uppercased())
                                                    .font(Theme.Typography.caption)
                                                    .foregroundStyle(Theme.Color.muted)
                                            }
                                        }
                                    }
                                    scale(report.lriScale)
                                }
                            }
                        }

                        block(title: "Lectura") {
                            Text(report.lectura)
                                .font(Theme.Typography.body)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HStack {
                            if let kg = report.bodyMassKg {
                                Text("Peso \(Int(kg.rounded())) kg")
                            }
                            Spacer()
                            if !report.attempts.isEmpty {
                                Text("\(report.attempts.count) intentos · se queda \(JumpPhysics.displayCm(report.unloadedCm))")
                            }
                        }
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                    }
                    .padding(Theme.Spacing.l)
                }
            }
        }
    }

    private var loadTitle: String {
        if let kg = report.loadKg {
            return "Con carga · \(Int(kg.rounded())) kg"
        }
        return "Con carga"
    }

    private func pct(_ r: Double) -> String {
        "\(Int((r * 100).rounded())) %"
    }

    private func metric(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k).font(Theme.Typography.caption).foregroundStyle(Theme.Color.muted)
            Text(v).font(Theme.Typography.bodyEmph).foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func scale(_ bands: [CmjScaleBandDTO]) -> some View {
        HStack(spacing: 4) {
            ForEach(bands, id: \.level) { b in
                VStack(spacing: 4) {
                    Text("\(b.level)")
                        .font(.system(size: 10, weight: .semibold))
                    Text(b.rangeLabel)
                        .font(.system(size: 9))
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .foregroundStyle(b.active ? Theme.Color.accentOn : Theme.Color.muted)
                .background(
                    b.active ? Theme.Color.accent : Theme.Color.surfaceSunken,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                )
            }
        }
    }

    private func block<C: View>(title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(title.uppercased())
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
            content()
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    static func shortDate(_ raw: String) -> String {
        let parts = raw.split(separator: "-")
        guard parts.count >= 3, let day = Int(parts[2].prefix(2)), let month = Int(parts[1]) else { return raw }
        let names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        guard month >= 1, month <= 12 else { return raw }
        return "\(day) \(names[month - 1])"
    }
}

extension CmjReportDTO {
    /// Vista corta cuando el servidor aún no mandó el informe (p.ej. justo al guardar).
    static func thin(title: String, dateLabel: String?, profile: JumpProfileDTO, bodyMassKg: Double?) -> CmjReportDTO {
        let drop = profile.loadedCm.map { profile.unloadedCm - $0 }
        let dropRel = drop.map { profile.unloadedCm > 0 ? $0 / profile.unloadedCm : 0 }
        return CmjReportDTO(
            title: title,
            dateLabel: dateLabel,
            unloadedCm: profile.unloadedCm,
            loadedCm: profile.loadedCm,
            heightLevel: profile.heightLevel,
            heightLabel: "Nivel \(profile.heightLevel)",
            loadedHeightLevel: nil,
            lri: profile.lri,
            lriLabel: profile.lriLabel,
            lriLevel: profile.lriLevel,
            dropAbsCm: drop,
            dropRel: dropRel,
            loadRel: nil,
            loadKg: nil,
            bodyMassKg: bodyMassKg,
            lectura: profile.lriLabel.map {
                "Capacidad explosiva nivel \(profile.heightLevel). Respuesta a la carga: \($0.lowercased())."
            } ?? "Capacidad explosiva nivel \(profile.heightLevel).",
            heightScale: [],
            lriScale: [],
            attempts: []
        )
    }
}

extension JumpProfileDTO {
    static func from(unloaded: Double, loaded: Double?, loadKg: Double?, bodyMassKg: Double?) -> JumpProfileDTO {
        let dropRel = (loaded != nil && unloaded > 0) ? (unloaded - loaded!) / unloaded : nil
        let loadRel = (loadKg != nil && bodyMassKg != nil && bodyMassKg! > 0) ? loadKg! / bodyMassKg! : nil
        let lri = (dropRel != nil && loadRel != nil && loadRel! > 0) ? dropRel! / loadRel! : nil
        let heightLevel: Int
        if unloaded < 30 { heightLevel = 1 }
        else if unloaded < 35 { heightLevel = 2 }
        else if unloaded < 40 { heightLevel = 3 }
        else if unloaded <= 45 { heightLevel = 4 }
        else { heightLevel = 5 }
        var lriLevel: Int?
        var lriLabel: String?
        if let lri {
            if lri <= 0.45 { lriLevel = 5; lriLabel = "Excelente" }
            else if lri <= 0.70 { lriLevel = 4; lriLabel = "Muy buena" }
            else if lri <= 0.90 { lriLevel = 3; lriLabel = "Correcta" }
            else if lri <= 1.20 { lriLevel = 2; lriLabel = "Baja" }
            else { lriLevel = 1; lriLabel = "Muy baja" }
        }
        return JumpProfileDTO(
            unloadedCm: unloaded,
            loadedCm: loaded,
            lri: lri,
            lriLabel: lriLabel,
            heightLevel: heightLevel,
            lriLevel: lriLevel
        )
    }
}
