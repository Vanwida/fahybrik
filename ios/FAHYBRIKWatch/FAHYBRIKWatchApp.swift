import SwiftUI
import HealthKit
import WatchKit

@main
struct FAHYBRIKWatchApp: App {
    // Shared singletons pushed from the iPhone (plan + connectivity), plus the
    // workout coordinator (coach plan). PRIMARY HK is MirrorSessionController.
    @StateObject private var planModel = WatchPlanModel.shared
    @StateObject private var connectivity = WatchConnectivityService.shared
    @State private var coordinator = WatchWorkoutCoordinator.shared
    // Apple: Watch is PRIMARY. `startWatchApp` on the phone delivers a
    // configuration here; we create the session and mirror to the companion.
    @WKApplicationDelegateAdaptor(MirrorAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            // El escaparate de guiones (`-guion <id>`): abre una pantalla de diseño
            // concreta sin tener que crear un entreno y hacer la primera serie. Sólo
            // en DEBUG y sólo con el argumento — la app de verdad no lo ve.
            if let id = GuionEscaparate.casoPedido, let caso = GuionEscaparate.caso(id) {
                GuionEscaparateView(caso: caso)
            } else {
                raiz
            }
            #else
            raiz
            #endif
        }
    }

    private var raiz: some View {
        RootView()
            .environmentObject(planModel)
            .environmentObject(connectivity)
            .environment(coordinator)
            .environment(MirrorSessionController.shared)
            .onAppear {
                connectivity.activate()
            }
    }
}

/// Apple `startWatchApp(with:)` delivers a configuration via `handle(_:)`.
/// Crash/relaunch recovery is `handleActiveWorkoutRecovery` + the same
/// `recoverActiveWorkoutSession` as `applicationDidFinishLaunching`.
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        recoverActiveWorkout()
    }

    func handleActiveWorkoutRecovery() {
        recoverActiveWorkout()
    }

    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            MirrorSessionController.shared.startPrimary(configuration: workoutConfiguration)
        }
    }

    private func recoverActiveWorkout() {
        Task { @MainActor in
            MirrorSessionController.shared.recoverActiveIfNeeded()
        }
    }
}
