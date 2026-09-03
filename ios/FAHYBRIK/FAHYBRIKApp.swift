import SwiftUI

@main
struct FAHYBRIKApp: App {
    // Bridge the UIKit app delegate for APNS callbacks (device-token
    // registration + notification tap routing) that SwiftUI's App lifecycle
    // doesn't expose. See Notifications/PushManager.swift.
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate

    init() {
        // Apple: `workoutSessionMirroringStartHandler` must exist before HealthKit
        // delivers a mirrored session. First registration — not `AppRoot.onAppear`.
        if Thread.isMainThread {
            MainActor.assumeIsolated {
                PhoneMirrorService.shared.prepare()
            }
        } else {
            DispatchQueue.main.sync {
                PhoneMirrorService.shared.prepare()
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            AppRoot()
        }
    }
}
