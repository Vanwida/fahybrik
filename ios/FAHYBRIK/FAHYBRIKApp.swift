import SwiftUI

@main
struct FAHYBRIKApp: App {
    // Bridge the UIKit app delegate for APNS callbacks (device-token
    // registration + notification tap routing) that SwiftUI's App lifecycle
    // doesn't expose. See Notifications/PushManager.swift.
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            AppRoot()
        }
    }
}
