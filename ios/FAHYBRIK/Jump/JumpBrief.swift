import SwiftUI

// Briefing del test de salto. El atleta lo lee ANTES de grabar: qué traer,
// cómo se coloca el teléfono, cómo se salta, y en qué orden va a ir.
// El test solo existe si el coach lo programó — esta pantalla no se ofrece
// desde Marcas.

struct JumpNeedDTO: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let detail: String
}

struct JumpBriefStepDTO: Codable, Equatable, Identifiable {
    var id: Int { n }
    let n: Int
    let title: String
    let detail: String
}

struct JumpBriefDTO: Codable, Equatable {
    let title: String
    let what: String
    let durationLabel: String
    let needs: [JumpNeedDTO]
    let sequence: [JumpBriefStepDTO]
    let jumpCues: [String]
    let phone: [String]
    let dayCard: String
}

struct JumpBriefView: View {
    let brief: JumpBriefDTO
    var onReady: () -> Void
    var onClose: () -> Void

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        header
                        section(title: "Qué vas a necesitar", items: brief.needs.map { ($0.title, $0.detail) })
                        sequence
                        section(title: "Cómo se salta", lines: brief.jumpCues)
                        section(title: "El teléfono", lines: brief.phone)
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.l)
                }
                ExpertPrimaryButton(title: "ESTOY LISTO", height: 52, action: onReady)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 36, height: 36)
            }
            .accessibilityLabel("Cerrar")
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.s)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(brief.title)
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text(brief.what)
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(brief.durationLabel)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var sequence: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Cómo va a ir")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            ForEach(brief.sequence) { step in
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    Text("\(step.n)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.accent)
                        .frame(width: 20, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.title)
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        Text(step.detail)
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func section(title: String, items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(title)
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.0)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(item.1)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func section(title: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(title)
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            ForEach(lines, id: \.self) { line in
                HStack(alignment: .top, spacing: Theme.Spacing.s) {
                    Text("·")
                        .foregroundStyle(Theme.Color.accent)
                    Text(line)
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}
