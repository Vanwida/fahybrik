import SwiftUI
import UIKit

// The app is portrait-by-default; a specific screen opts into landscape (the live
// treadmill / erg HUDs, where the big numbers read better rotated). `PushAppDelegate
// .orientationLock` is the system gate — this flips it AND forces the window to rotate
// immediately (iOS 16+), so the athlete never has to physically turn the phone, and the
// app snaps back to portrait the instant the HUD is dismissed.
enum OrientationGate {
    // Landscape-allowed screens NEST (the workout screen presents the treadmill /
    // erg full-screen HUDs on top, all rotatable) — a plain on/off gate would snap
    // back to portrait the moment an inner cover dismissed, locking the still-open
    // outer screen. Count the holders: portrait returns only when the LAST one leaves.
    private static var landscapeHolders = 0

    static func push() {
        landscapeHolders += 1
        apply(.allButUpsideDown)
    }

    static func pop() {
        landscapeHolders = max(0, landscapeHolders - 1)
        if landscapeHolders == 0 { apply(.portrait) }
    }

    /// Seconds before the safety-net force fires — must outlast a fullScreenCover
    /// present/dismiss transition (~0.4 s) so the geometry request can never race it.
    private static let forceFallbackDelay: TimeInterval = 0.6

    static func apply(_ mask: UIInterfaceOrientationMask) {
        PushAppDelegate.orientationLock = mask
        guard let scene = activeScene else { return }
        // Recomputing supported orientations is enough: the system rotates AWAY from
        // a now-unsupported orientation on its own, COORDINATED with any in-flight
        // present/dismiss transition. Unconditionally calling
        // `requestGeometryUpdate` here (the old behavior) raced those transitions —
        // rotating mid-cover left the window half-rendered, half black.
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        // Safety net: if, once any transition has finished, the interface still sits
        // OUTSIDE the mask (system didn't rotate us back), force it then — never
        // immediately. Skipped when a newer push/pop changed the lock meanwhile.
        DispatchQueue.main.asyncAfter(deadline: .now() + forceFallbackDelay) {
            guard PushAppDelegate.orientationLock == mask,
                  let scene = activeScene else { return }
            // `.unknown` (una transición de escena aún en vuelo) mapeaba a
            // `.portrait`, y como los dos masks de la app contienen portrait, el
            // guard saltaba y este forzado quedaba desarmado justo en el único
            // estado en el que existe para actuar. Desconocida cuenta como fuera
            // del mask: forzar es inocuo si el sistema ya iba a quedar bien.
            let actual = scene.interfaceOrientation
            guard actual == .unknown || !mask.contains(actual.asMask) else { return }
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
        }
    }

    private static var activeScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }
}

private extension UIInterfaceOrientation {
    /// This orientation as a mask bit, so it can be tested against an
    /// `UIInterfaceOrientationMask` with `contains`.
    var asMask: UIInterfaceOrientationMask {
        switch self {
        case .portrait:           return .portrait
        case .portraitUpsideDown: return .portraitUpsideDown
        case .landscapeLeft:      return .landscapeLeft
        case .landscapeRight:     return .landscapeRight
        default:                  return .portrait
        }
    }
}

private struct LandscapeAllowedModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onAppear { OrientationGate.push() }
            .onDisappear { OrientationGate.pop() }
    }
}

extension View {
    /// Let THIS screen rotate to landscape while it's on-screen; every other screen
    /// stays portrait. Restores portrait on disappear.
    func allowsLandscape() -> some View { modifier(LandscapeAllowedModifier()) }
}
