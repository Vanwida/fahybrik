import SwiftUI

struct AppRoot: View {
    @State private var auth = AuthState()

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
                    onFinished: { auth.finishOnboarding() }
                )
            case .authenticated:
                TodayView(onSignOut: { auth.signOut() })
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            auth.bootstrap()
        }
    }
}
