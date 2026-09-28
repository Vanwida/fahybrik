import SwiftUI

@main
struct FAHYBRIKApp: App {
    // Bridge the UIKit app delegate for APNS callbacks (device-token
    // registration + notification tap routing) that SwiftUI's App lifecycle
    // doesn't expose. See Notifications/PushManager.swift.
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate

    init() {
        // Registro técnico (DECISIONS 2026-09-24): una salida no limpia de la vez
        // anterior se cuenta antes que nada; MetricKit trae cierres y bloqueos.
        DiagnosticsLog.shared.reportUncleanExit()
        DiagnosticsLog.shared.record(.lifecycle, .appLaunch)
        DiagnosticsMetricKit.shared.start()
        // Apple: `workoutSessionMirroringStartHandler` must exist before HealthKit
        // delivers a mirrored session. First registration — not `AppRoot.onAppear`.
        if Thread.isMainThread {
            MainActor.assumeIsolated {
                PhoneLiveSession.shared.prepare()
            }
        } else {
            DispatchQueue.main.sync {
                PhoneLiveSession.shared.prepare()
            }
        }
        // EL ENLACE CON EL RELOJ SE ABRE AL ARRANCAR, no al pintar Inicio. Solo lo
        // abría `InicioView` al empujar el día: un atleta sin coach (FreeInicioView)
        // no lo abría nunca, el móvil no sabía que había reloj («Sin Apple Watch»
        // en el brief) y lo que mandaba la muñeca no se leía. Y un arranque en
        // segundo plano (la muñeca pide la sesión, entrega un entreno) tampoco lo
        // tenía abierto.
        WatchConnectivityiOSService.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            AppRoot()
        }
    }
}
