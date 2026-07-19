import SwiftUI
import UIKit

// The app is portrait-by-default; a specific screen opts into landscape (the live
// treadmill / erg HUDs, where the big numbers read better rotated). `PushAppDelegate
// .orientationLock` is the system gate — this flips it AND forces the window to rotate
// immediately (iOS 16+), so the athlete never has to physically turn the phone, and the
// app snaps back to portrait the instant the HUD is dismissed.
enum OrientationGate {
    static func apply(_ mask: UIInterfaceOrientationMask) {
        PushAppDelegate.orientationLock = mask
        guard let scene = activeScene else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    private static var activeScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }
}

private struct LandscapeAllowedModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onAppear { OrientationGate.apply(.allButUpsideDown) }
            .onDisappear { OrientationGate.apply(.portrait) }
    }
}

extension View {
    /// Let THIS screen rotate to landscape while it's on-screen; every other screen
    /// stays portrait. Restores portrait on disappear.
    func allowsLandscape() -> some View { modifier(LandscapeAllowedModifier()) }
}
