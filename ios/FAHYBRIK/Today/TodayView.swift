import SwiftUI

// TodayView is now a thin compatibility shim. The app shell (the bottom tab
// bar + 5 destinations) moved to AppShell, and the Today/home CONTENT moved to
// InicioView. AppRoot presents AppShell directly; this wrapper remains only so
// any lingering reference to `TodayView(onSignOut:)` keeps compiling, and it
// simply forwards to AppShell. Safe to delete once no callers remain.
struct TodayView: View {
    let onSignOut: () -> Void

    var body: some View {
        AppShell(onSignOut: onSignOut)
    }
}
