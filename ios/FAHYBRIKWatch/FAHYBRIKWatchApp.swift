import SwiftUI
import HealthKit

@main
struct FAHYBRIKWatchApp: App {
    // Shared singletons pushed from the iPhone (plan + connectivity), plus the
    // workout coordinator that owns the live engine + HealthKit session.
    @StateObject private var planModel = WatchPlanModel.shared
    @StateObject private var connectivity = WatchConnectivityService.shared
    @State private var coordinator = WatchWorkoutCoordinator.shared
    // Receives a mirrored session if Apple delivers one (Watch adopts; iPhone owns
    // the primary). startWatchApp creates a second session — we do not call it.
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
                MirrorSessionController.shared.prepareToAdopt()
            }
    }
}

/// If watchOS delivers a workout configuration (legacy startWatchApp or system
/// wake), adopt — do not create a second HKWorkoutSession.
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in MirrorSessionController.shared.prepareToAdopt() }
    }
}
