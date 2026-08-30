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

/// `startWatchApp(with:)` delivers the config here. Same door as `liveStart`:
/// `MirrorSessionController.start` — the owner is `LiveWorkoutSession`, not a
/// second HKWorkoutSession created in this delegate.
final class MirrorAppDelegate: NSObject, WKApplicationDelegate {
    /// `WKApplicationDelegate.applicationDidFinishLaunching` — el cable WC
    /// no puede esperar al `onAppear` de SwiftUI: `liveStart` llega por
    /// `transferUserInfo` al activar, y si activate() corre después, el
    /// aviso se pierde y la muñeca se queda en idle.
    func applicationDidFinishLaunching() {
        WatchConnectivityService.shared.activate()
        Task { @MainActor in MirrorSessionController.shared.resumeAfterLaunch() }
    }

    /// `WKApplicationDelegate.handle(_:)` — «the user started a workout
    /// session on the paired iPhone». `HKHealthStore.startWatchApp` lanza
    /// la app **para crear** esa sesión (`startWatchApp(with:completion:)`).
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            MirrorSessionController.shared.start(WatchLiveStart(configuration: workoutConfiguration))
        }
    }

    /// `handleActiveWorkoutRecovery` — «the app relaunches after crashing
    /// during an active workout session». Solo existe si ya hubo sesión.
    /// Health Review ANTES de `startActivity` no deja nada que recuperar:
    /// ahí entra `resumeAfterLaunch` (el aviso en disco / contexto).
    func handleActiveWorkoutRecovery() {
        Task { @MainActor in await MirrorSessionController.shared.recoverAfterCrash() }
    }
}
