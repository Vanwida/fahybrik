import SwiftUI

struct JumpReviewView: View {
    let url: URL
    let fps: Double
    let frameCount: Int
    @Binding var takeoff: Int
    @Binding var landing: Int
    @Binding var quality: String
    var onKeep: () -> Void
    var onDiscard: () -> Void

    private enum Mark { case takeoff, landing }
    @State private var mark: Mark = .takeoff

    private var current: Int { mark == .takeoff ? takeoff : landing }
    private var heightLabel: String {
        guard let h = JumpPhysics.heightCm(takeoffFrame: takeoff, landingFrame: landing, fps: fps) else {
            return "—"
        }
        return JumpPhysics.displayCm(h)
    }

    var body: some View {
        VStack(spacing: 0) {
            JumpFramePreview(url: url, frame: current, fps: fps)
                .frame(maxWidth: .infinity)
                .background(Color.black)

            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .lastTextBaseline) {
                    Text(heightLabel)
                        .font(.system(size: 28, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                    if let u = JumpPhysics.uncertaintyCm(fps: fps) {
                        Text("± \(max(1, Int(u.rounded()))) cm")
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Spacer()
                    Text(String(format: "%.0f fps", fps))
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }

                Picker("Fotograma", selection: $mark) {
                    Text("Despegue").tag(Mark.takeoff)
                    Text("Aterrizaje").tag(Mark.landing)
                }
                .pickerStyle(.segmented)

                Text(mark == .takeoff
                     ? "Último frame con un pie en el suelo."
                     : "Primer frame que vuelve a tocar.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)

                HStack(spacing: Theme.Spacing.m) {
                    Button { nudge(-1) } label: {
                        Image(systemName: "chevron.left")
                            .frame(width: 52, height: 44)
                    }
                    .buttonStyle(.bordered)
                    Text("\(current + 1) / \(max(frameCount, 1))")
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .frame(maxWidth: .infinity)
                    Button { nudge(1) } label: {
                        Image(systemName: "chevron.right")
                            .frame(width: 52, height: 44)
                    }
                    .buttonStyle(.bordered)
                }

                HStack(spacing: Theme.Spacing.s) {
                    Button("Descartar", action: onDiscard)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                    ExpertPrimaryButton(title: "CONSERVAR", height: 48, action: onKeep)
                }
            }
            .padding(Theme.Spacing.l)
            .background(Theme.Color.background)
        }
    }

    private func nudge(_ d: Int) {
        let maxF = max(0, frameCount - 1)
        if mark == .takeoff {
            takeoff = min(max(0, takeoff + d), max(0, landing - 1))
        } else {
            landing = min(max(takeoff + 1, landing + d), maxF)
        }
        if fps + 0.1 < 200 { quality = "low_fps" }
    }
}
