import SwiftUI

// watchOS root. Two states: (a) no plan synced yet → empty state pointing
// users to the iPhone; (b) plan available → workout brief + start button.
// During an active workout the LiveWorkoutView takes over the screen.
struct RootView: View {
    @EnvironmentObject private var plan: WatchPlanModel
    @StateObject private var session = LiveWorkoutSession()

    var body: some View {
        Group {
            if session.isActive {
                LiveWorkoutView(session: session)
            } else if let workout = plan.workoutForToday {
                workoutBrief(workout)
            } else {
                emptyState
            }
        }
    }

    @ViewBuilder
    private func workoutBrief(_ workout: WatchPlannedWorkout) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(workout.title)
                    .font(.headline)
                    .foregroundStyle(.white)
                if let focus = workout.focus {
                    Text(focus.uppercased())
                        .font(.caption2)
                        .tracking(1.2)
                        .foregroundStyle(.orange)
                }
                HStack(spacing: 8) {
                    metaPill(systemImage: "clock", text: workout.durationLabel)
                    metaPill(systemImage: "flame", text: workout.intensityLabel)
                }
                Button {
                    session.start(activityType: workout.healthKitActivityType)
                } label: {
                    HStack {
                        Image(systemName: "play.fill")
                        Text("Empezar")
                    }
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
            }
            .padding(.horizontal, 4)
        }
    }

    private func metaPill(systemImage: String, text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: systemImage)
                .font(.system(size: 9, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .semibold))
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.14))
        .clipShape(Capsule())
        .foregroundStyle(.white)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: 28))
                .foregroundStyle(.white.opacity(0.6))
            Text("Abre FAHYBRIK en el iPhone")
                .font(.system(size: 13, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
            Text("Tu entreno aparecerá aquí.")
                .font(.system(size: 11))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(.horizontal, 8)
    }
}
