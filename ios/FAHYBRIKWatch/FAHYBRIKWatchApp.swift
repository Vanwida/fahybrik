import SwiftUI
import HealthKit

@main
struct FAHYBRIKWatchApp: App {
    // Shared singletons pushed from the iPhone (plan + connectivity), plus the
    // workout coordinator that owns the live engine + HealthKit session.
    @StateObject private var planModel = WatchPlanModel.shared
    @StateObject private var connectivity = WatchConnectivityService.shared
    @State private var coordinator = WatchWorkoutCoordinator.shared
    // Receives the mirrored-session launch the iPhone triggers via startWatchApp(with:).
    @WKApplicationDelegateAdaptor(MirrorAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(planModel)
                .environmentObject(connectivity)
                .environment(coordinator)
                .environment(MirrorSessionController.shared)
                .onAppear {
                    connectivity.activate()
                    MirrorSessionController.shared.prepareToAdopt()
                }
        }
    }
}

/// Mirror mode's entry point: when the phone calls startWatchApp(with:), watchOS
/// launches this app and delivers the workout config here. Hand it to the mirror
/// controller (which yields if a standalone session is already running).
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        // iPhone owns the primary HKWorkoutSession. A startWatchApp wake must
        // ADOPT, not create a second session.
        Task { @MainActor in MirrorSessionController.shared.prepareToAdopt() }
    }
}
