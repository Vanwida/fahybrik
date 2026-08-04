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
            .onAppear { connectivity.activate() }
    }
}

/// Mirror mode's entry point: when the phone calls startWatchApp(with:), watchOS
/// launches this app and delivers the workout config here. Hand it to the mirror
/// controller (which yields if a standalone session is already running).
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in MirrorSessionController.shared.start(config: workoutConfiguration) }
    }
}
