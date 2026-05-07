import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            Color("BrandBackground")
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Spacer()

                Wordmark()

                Text("iOS — UX pending sign-off")
                    .font(.system(size: 13, weight: .medium, design: .default))
                    .tracking(1.6)
                    .textCase(.uppercase)
                    .foregroundStyle(Color("BrandMuted"))

                Spacer()
            }
            .padding(.horizontal, 24)
        }
    }
}

private struct Wordmark: View {
    var body: some View {
        HStack(spacing: 0) {
            Text("F")
                .foregroundStyle(Color("BrandAccent"))
            Text("AHYBRIK")
                .foregroundStyle(Color("BrandForeground"))
        }
        .font(.system(size: 56, weight: .heavy, design: .default))
        .italic()
        .tracking(-1)
        .accessibilityLabel("FAHYBRIK")
    }
}

#Preview {
    ContentView()
}
