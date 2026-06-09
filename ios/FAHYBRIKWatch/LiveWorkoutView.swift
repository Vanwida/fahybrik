import SwiftUI

// Live workout dashboard. Big numbers, no chrome, always-on friendly.
// HR is the primary metric (élite athletes train by HR zones). Time and
// kcal secondary. Pause / End in the bottom row — 44pt targets even on
// watch (digital crown also pauses, but we keep visible affordance).
struct LiveWorkoutView: View {
    @ObservedObject var session: LiveWorkoutSession

    var body: some View {
        VStack(spacing: 6) {
            heartRate
            HStack(spacing: 8) {
                metric(label: "TIEMPO", value: session.formattedElapsed)
                metric(label: "KCAL", value: "\(Int(session.activeKcal))")
            }
            if session.distanceMeters > 0 {
                metric(label: "DIST", value: session.formattedDistance)
                    .frame(maxWidth: .infinity)
            }
            controls
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
    }

    private var heartRate: some View {
        VStack(spacing: 0) {
            Text("\(Int(session.heartRate))")
                .font(.system(size: 56, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(zoneColor(for: session.heartRate))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(.red)
                Text("BPM")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func metric(label: String, value: String) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var controls: some View {
        HStack(spacing: 6) {
            Button {
                if session.isPaused { session.resume() } else { session.pause() }
            } label: {
                Image(systemName: session.isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 14, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 32)
            }
            .tint(.white.opacity(0.18))
            .buttonStyle(.borderedProminent)

            Button {
                session.end()
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 14, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 32)
            }
            .tint(.red)
            .buttonStyle(.borderedProminent)
        }
    }

    // Crude HR zone color — refined later via athlete HR max from server.
    private func zoneColor(for hr: Double) -> Color {
        // Defaults assume hrMax ~190 for an elite athlete; server overrides later.
        switch hr {
        case ..<110: return .blue        // Z1
        case ..<140: return .green       // Z2
        case ..<160: return .yellow      // Z3
        case ..<175: return .orange      // Z4
        default:     return .red         // Z5
        }
    }
}
