import SwiftUI

// #28 — the JOINT side-by-side shown AFTER a dobles session is closed (once the
// partner has also logged their side): the athlete's numbers (orange) next to the
// partner's (blue), a share affordance that exports the two-column card, and "Seguir".
// A celebratory moment → forced dark like the PR celebration. Nothing here is
// fabricated: a side hides RPE / tonnage / the PR chip when the value is absent.

struct DoblesJointSummaryView: View {
    let data: JointShareData
    let onDone: () -> Void

    @State private var shareURL: URL? = nil
    @State private var appear = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.94).ignoresSafeArea()
                .onTapGesture { onDone() }

            VStack(spacing: Theme.Spacing.l) {
                VStack(spacing: 4) {
                    Text("ENTRENO EN PAREJA")
                        .font(.system(size: 11, weight: .heavy).italic())
                        .tracking(Theme.Tracking.dataLabel)
                        .foregroundStyle(Theme.Color.accentText)
                    Text(data.title)
                        .font(.system(size: 22, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                        .lineLimit(2).minimumScaleFactor(0.7)
                    Text(data.dateText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                }

                HStack(alignment: .top, spacing: 12) {
                    JointSideColumn(side: data.selfSide, color: Theme.Color.accent)
                    Rectangle().fill(Theme.Color.hairline).frame(width: 1, height: 96)
                    JointSideColumn(side: data.partnerSide, color: Theme.Color.partner)
                }

                Text(data.footerText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)

                actions
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 380)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Color.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                            .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                    )
            )
            .padding(.horizontal, Theme.Spacing.xl)
            .scaleEffect(appear ? 1 : 0.92)
            .opacity(appear ? 1 : 0)
        }
        .environment(\.colorScheme, .dark)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
            Haptics.success()
        }
        .task { shareURL = WorkoutShareRenderer.pngURL(for: data) }
    }

    private var actions: some View {
        VStack(spacing: Theme.Spacing.s) {
            if let shareURL {
                ShareLink(item: shareURL) {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.arrow.up")
                        Text("Compartir")
                    }
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
            }
            Button(action: { Haptics.light(); onDone() }) {
                Text("Seguir")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity).frame(height: 44)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - One athlete's column (shared by the overlay and the export card)

struct JointSideColumn: View {
    let side: JointShareData.Side
    let color: Color
    var big: Bool = false

    var body: some View {
        VStack(spacing: big ? 6 : 5) {
            Text(side.name.uppercased())
                .font(.system(size: big ? 13 : 11, weight: .heavy).italic())
                .tracking(0.6)
                .foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.6)
            // El lado que no registró tiempo lo dice, y en la voz de texto: una
            // raya a 40 puntos y monoespaciada se lee como una marca (§7, §4).
            if let tiempo = side.timeText {
                Text(tiempo)
                    .font(.system(size: big ? 40 : 30, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
            } else {
                Text("sin tiempo")
                    .font(.system(size: big ? 15 : 13, weight: .medium).italic())
                    .foregroundStyle(Theme.Color.faint)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .frame(height: big ? 44 : 34)
            }
            VStack(spacing: 3) {
                if let rpe = side.rpe { stat("RPE", "\(rpe)") }
                if let tonnage = side.tonnageText { stat("MOVIDO", tonnage) }
            }
            if side.hasPR {
                HStack(spacing: 4) {
                    Image(systemName: "trophy.fill").font(.system(size: 9, weight: .bold))
                    Text(side.prCount > 1 ? "\(side.prCount) PR" : "PR")
                        .font(.system(size: 10, weight: .heavy).italic())
                }
                .foregroundStyle(color)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(color.opacity(0.15))
                .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.4)
                .foregroundStyle(Theme.Color.faint)
            Text(value)
                .font(.system(size: 12, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}

// MARK: - Shareable two-column card (exported PNG)

/// The dark, two-column card exported when the athlete shares a joint session. Mirrors
/// WorkoutShareCard's idiom (brand mark, accent top rule, fahybrid.com footer) so the
/// solo + joint shares read as one family.
struct DoblesJointShareCard: View {
    let data: JointShareData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Wordmark(size: 20)
                Spacer()
                Text("EN PAREJA")
                    .font(.system(size: 11, weight: .heavy).italic()).tracking(0.8)
                    .foregroundStyle(Theme.Color.accentText)
            }

            Spacer(minLength: 0)

            Text(data.title)
                .font(.system(size: 22, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2).minimumScaleFactor(0.7)
            Text(data.dateText)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 2)

            Spacer(minLength: 0)

            HStack(alignment: .top, spacing: 16) {
                JointSideColumn(side: data.selfSide, color: Theme.Color.accent, big: true)
                Rectangle().fill(Theme.Color.hairline).frame(width: 1, height: 120)
                JointSideColumn(side: data.partnerSide, color: Theme.Color.partner, big: true)
            }

            Spacer(minLength: 0)

            HStack {
                Text(data.footerText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                Spacer()
                Text(Marca.dominioWeb)
                    .font(.system(size: 12, weight: .semibold)).tracking(1.2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(28)
        .frame(width: 360, height: 450, alignment: .leading)
        .background(Theme.Color.background)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.accent).frame(height: 4)
        }
    }
}

// #28 — reuse the shared ImageRenderer core (WorkoutShareRenderer.render) for the joint
// PNG; no second renderer.
extension WorkoutShareRenderer {
    @MainActor
    static func pngURL(for data: JointShareData) -> URL? {
        render(DoblesJointShareCard(data: data).environment(\.colorScheme, .dark),
               name: "fahybrid-pareja")
    }
}
