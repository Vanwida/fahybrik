import SwiftUI

// 5-circle segmented control. Filled = orange, empty = muted gray. Light
// haptic on tap with brief fill animation. Accessibility groups the circles
// as a single 1..5 picker.
struct Scale1to5Picker: View {
    @Binding var value: Int?
    var leftHint: String? = nil
    var rightHint: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 14) {
                ForEach(1...5, id: \.self) { i in
                    Button(action: {
                        Haptics.light()
                        withAnimation(.easeInOut(duration: 0.18)) {
                            value = i
                        }
                    }) {
                        Circle()
                            .fill(value == i ? Theme.Color.accent : Color.clear)
                            .overlay(
                                Circle().stroke(
                                    value == i ? Theme.Color.accent : Theme.Color.muted.opacity(0.55),
                                    lineWidth: 1.5
                                )
                            )
                            .frame(width: 26, height: 26)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(i)")
                    .accessibilityAddTraits(value == i ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }

            if leftHint != nil || rightHint != nil {
                HStack {
                    if let leftHint {
                        Text(leftHint)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Spacer()
                    if let rightHint {
                        Text(rightHint)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }
}
