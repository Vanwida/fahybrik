import SwiftUI

@main
struct FAHYBRIKApp: App {
    // Bridge the UIKit app delegate for APNS callbacks (device-token
    // registration + notification tap routing) that SwiftUI's App lifecycle
    // doesn't expose. See Notifications/PushManager.swift.
    // FH-48: PushAppDelegate also kicks `recoverActiveWorkoutSession` so
    // Apple's run is reattached before any tab's @State workoutLaunch (nil
    // after process death). The cover is AppShell + LiveWorkoutResume.
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            AppRoot()
        }
    }
}
