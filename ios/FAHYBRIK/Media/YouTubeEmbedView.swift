import SwiftUI
import WebKit

/// In-app YouTube embed — athlete never leaves FAHYBRIK to Safari.
struct YouTubeEmbedView: UIViewRepresentable {
    let videoId: String
    var autoplay: Bool = false

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.navigationDelegate = context.coordinator
        return web
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedId != videoId else { return }
        context.coordinator.loadedId = videoId
        let host = "https://www.youtube-nocookie.com"
        let play = autoplay ? 1 : 0
        let path = "/embed/\(videoId)?playsinline=1&rel=0&modestbranding=1&autoplay=\(play)"
        guard let url = URL(string: host + path) else { return }
        webView.load(URLRequest(url: url))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedId: String?

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let host = url.host?.lowercased() ?? ""
            let allowed = host.contains("youtube") || host.contains("ytimg") || host.contains("google")
            decisionHandler(allowed ? .allow : .cancel)
        }
    }
}

enum YouTubeLinkParser {
    private static let idPattern = #"^[\w-]{11}$"#

    static func videoId(from urlString: String) -> String? {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: withScheme), let host = url.host?.lowercased() else { return nil }

        if host == "youtu.be" {
            let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return id.range(of: idPattern, options: .regularExpression) != nil ? id : nil
        }

        if host.contains("youtube") {
            if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "v" })?
                .value,
               v.range(of: idPattern, options: .regularExpression) != nil {
                return v
            }
            let parts = url.path.split(separator: "/")
            if parts.count >= 2, parts[0] == "embed" || parts[0] == "shorts" {
                let id = String(parts[1])
                return id.range(of: idPattern, options: .regularExpression) != nil ? id : nil
            }
        }
        return nil
    }
}

struct YouTubeSheet: View {
    let url: String
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let id = YouTubeLinkParser.videoId(from: url) {
                    YouTubeEmbedView(videoId: id)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .padding()
                } else {
                    Text("Enlace de video no válido")
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Color.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
    }
}
