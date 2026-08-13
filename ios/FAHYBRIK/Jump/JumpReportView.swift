import SwiftUI

// La ficha permanente del perfil de salto. La misma para atleta y coach.
// No es un póster de un coach: es altura, respuesta a la carga, y la lectura.

struct JumpProfileDTO: Codable, Equatable {
    let unloadedCm: Double
    let loadedCm: Double?
    let lri: Double?
    let lriLabel: String?
    let heightLevel: Int
    let lriLevel: Int?
}

struct JumpReportView: View {
    let title: String
    let dateLabel: String?
    let profile: JumpProfileDTO
    let bodyMassKg: Double?
    var onClose: (() -> Void)? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                if let onClose {
                    HStack {
                        Button("Cerrar", action: onClose)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer()
                    }
                    .padding(Theme.Spacing.m)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title)
                                .font(Theme.Typography.headlineM)
                                .foregroundStyle(Theme.Color.foreground)
                            if let dateLabel {
                                Text(dateLabel)
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                        block(title: "Salto sin carga") {
                            HStack(alignment: .lastTextBaseline) {
                                Text(JumpPhysics.displayCm(profile.unloadedCm))
                                    .font(.system(size: 36, weight: .heavy, design: .monospaced))
                                    .foregroundStyle(Theme.Color.accent)
                                Text("nivel \(profile.heightLevel)/5")
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                        if let loaded = profile.loadedCm {
                            block(title: "Con carga") {
                                Text(JumpPhysics.displayCm(loaded))
                                    .font(.system(size: 28, weight: .heavy, design: .monospaced))
                                    .foregroundStyle(Theme.Color.foreground)
                                let drop = profile.unloadedCm - loaded
                                HStack {
                                    metric("Caída", JumpPhysics.displayCm(drop))
                                    metric("Relativa", pct(drop / profile.unloadedCm))
                                    if let lri = profile.lri {
                                        metric("LRI", String(format: "%.2f", lri).replacingOccurrences(of: ".", with: ","))
                                    }
                                }
                                if let label = profile.lriLabel {
                                    Text(label)
                                        .font(Theme.Typography.caption)
                                        .foregroundStyle(Theme.Color.muted)
                                }
                            }
                        }
                        block(title: "Lectura") {
                            Text(lectura)
                                .font(Theme.Typography.body)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let kg = bodyMassKg {
                            Text("Peso \(Int(kg.rounded())) kg")
                                .font(Theme.Typography.caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    .padding(Theme.Spacing.l)
                }
            }
        }
    }

    private var lectura: String {
        if let loaded = profile.loadedCm, let lri = profile.lri {
            let dropPct = pct((profile.unloadedCm - loaded) / profile.unloadedCm)
            return "Capacidad explosiva: \(JumpPhysics.displayCm(profile.unloadedCm)). Al añadir carga pierde un \(dropPct) de altura. Respuesta a la carga: \(profile.lriLabel ?? String(format: "%.2f", lri))."
        }
        return "Capacidad explosiva: \(JumpPhysics.displayCm(profile.unloadedCm))."
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

    private func block<C: View>(title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(title)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
            content()
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
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
