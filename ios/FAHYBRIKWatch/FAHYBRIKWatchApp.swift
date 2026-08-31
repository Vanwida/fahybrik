import SwiftUI
import HealthKit

@main
struct FAHYBRIKWatchApp: App {
    // Shared singletons pushed from the iPhone (plan + connectivity), plus the
    // workout coordinator that owns the live engine + HealthKit session.
    @StateObject private var planModel = WatchPlanModel.shared
    @StateObject private var connectivity = WatchConnectivityService.shared
    @State private var coordinator = WatchWorkoutCoordinator.shared
    // Receives a leftover `handle(HKWorkoutConfiguration)` if watchOS still
    // delivers one. The run is adopted via workoutSessionMirroringStartHandler
    // (FH-48) — we do not create a second HKWorkoutSession.
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
                    MirrorSessionController.shared.prepare()
                }
        }
    }
}

/// Mirror mode's entry point. `handle` used to CREATE a Watch primary (two
/// HK sessions). Now it only prepares / waits for `adopt`. `applicationDidFinishLaunching`
/// registers `workoutSessionMirroringStartHandler` as early as possible.
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        Task { @MainActor in MirrorSessionController.shared.prepare() }
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in MirrorSessionController.shared.recoverIfNeeded() }
    }

    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in MirrorSessionController.shared.start(config: workoutConfiguration) }
    }
}
