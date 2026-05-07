import SwiftUI

struct AppRoot: View {
    @State private var auth = AuthState()

    private func startHealthKitSync() {
        HealthKitSyncService.shared.configure(
            bearer: auth.bearer,
            athleteId: auth.athleteId
        )
        HealthKitSyncService.shared.start()
    }

    var body: some View {
        Group {
            switch auth.stage {
            case .unauthenticated:
                AppleSignInView { resp in
                    auth.acceptAppleResponse(resp)
                }
            case .onboarding:
                OnboardingFlow(
                    bearer: auth.bearer,
                    onFinished: {
                        auth.finishOnboarding()
                        startHealthKitSync()
                    }
                )
            case .authenticated:
                TodayView(onSignOut: { auth.signOut() })
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            auth.bootstrap()
            if auth.stage == .authenticated {
                startHealthKitSync()
            }
        }
    }
}
