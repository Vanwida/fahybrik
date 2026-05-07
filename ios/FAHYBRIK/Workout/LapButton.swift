import SwiftUI

struct LapButton: View {
    let action: () -> Void

    @State private var flashing: Bool = false
    @State private var lastTap: Date = .distantPast

    var body: some View {
        Button {
            // Debounce double-tap within 500ms per UX edge case.
            let now = Date()
            guard now.timeIntervalSince(lastTap) > 0.5 else { return }
            lastTap = now
            Haptics.medium()
            withAnimation(.easeOut(duration: 0.18)) { flashing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.easeIn(duration: 0.16)) { flashing = false }
            }
            action()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(flashing ? Theme.Color.ok : Theme.Color.accent)
                Text("LAP")
                    .font(.system(size: 56, weight: .heavy, design: .default))
                    .italic()
                    .foregroundStyle(Color.white)
                    .tracking(6)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lap")
    }
}
