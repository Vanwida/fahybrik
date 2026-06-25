import SwiftUI
import SafariServices

// SafariView — SwiftUI bridge over SFSafariViewController.
//
// Used to open Stripe-hosted pages (Customer Portal) and the marketing /
// account web (fahybrid.com) WITHOUT leaving the app's chrome entirely.
// SFSafariViewController is Apple's recommended in-app browser and is the
// compliant way to send athletes to an external, web-based payment surface
// (Guideline 3.1.3(b)) — it shares cookies with Safari and shows the real URL.
//
// Brand-tinted: bar tint = adaptive surface, controls = orange-as-text accent
// (darker on light so the tappable Done/nav glyphs clear the 3:1 UI floor on
// the white bar; brand orange on the dark bar).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.preferredBarTintColor = UIColor(Theme.Color.surface)
        vc.preferredControlTintColor = UIColor(Theme.Color.accentText)
        vc.dismissButtonStyle = .close
        return vc
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

/// Identifiable URL wrapper so a `URL` can drive `.sheet(item:)` presentation.
struct SafariURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
