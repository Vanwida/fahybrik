import SwiftUI
import WebKit

// In-app YouTube embed — athlete never leaves FAHYBRIK to Safari for playback.
//
// WHY loadHTMLString + IFrame API (not a bare URLRequest to /embed):
// loading `youtube.com/embed/<id>` directly into a WKWebView gives the document
// NO parent origin, so YouTube's referrer check rejects playback with
// "Error 153 / video player configuration error". Hosting the player through the
// official IFrame Player API inside an HTML document whose `baseURL` is a real
// https origin (our own domain) — and passing that same value as the player's
// `origin` — gives YouTube the embedding origin it requires, and playback works.
//
// The IFrame API's `onError` is bridged back to Swift (script message handler)
// so a non-embeddable / unavailable video degrades gracefully to the external
// "Ver en YouTube" fallback instead of showing YouTube's in-player error card.

/// The embedding origin handed to the YouTube player. Must be a real https
/// origin the player can validate against; we use the app's own domain.
private let kEmbedOrigin = "https://www.fahybrid.com"
/// Name of the JS→Swift bridge used to surface in-player errors.
private let kErrorHandlerName = "ytError"

struct YouTubeEmbedView: UIViewRepresentable {
    let videoId: String
    var autoplay: Bool = false
    /// Fired when the embedded player reports it cannot play the video
    /// (embedding disabled by owner, removed/private video, network). Optional so
    /// existing callsites compile unchanged; callers that set it can present an
    /// external-open fallback.
    var onLoadFailed: (() -> Void)? = nil

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: kErrorHandlerName)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController = controller

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.backgroundColor = .clear
        web.navigationDelegate = context.coordinator
        return web
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedId != videoId else { return }
        context.coordinator.loadedId = videoId
        context.coordinator.onLoadFailed = onLoadFailed
        webView.loadHTMLString(
            Self.html(videoId: videoId, autoplay: autoplay),
            baseURL: URL(string: kEmbedOrigin)
        )
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: kErrorHandlerName)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onLoadFailed: onLoadFailed) }

    // The player document. The IFrame API is loaded from youtube.com and the
    // player is created with our `origin`, so YouTube accepts the embed.
    private static func html(videoId: String, autoplay: Bool) -> String {
        let play = autoplay ? 1 : 0
        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; }
          html, body { background: #000; height: 100%; overflow: hidden; }
          #player { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        </style>
        </head>
        <body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              width: '100%', height: '100%',
              videoId: '\(videoId)',
              playerVars: {
                playsinline: 1, rel: 0, modestbranding: 1,
                autoplay: \(play), origin: '\(kEmbedOrigin)'
              },
              events: {
                'onError': function(e) {
                  try { window.webkit.messageHandlers.\(kErrorHandlerName).postMessage(e.data); } catch (err) {}
                }
              }
            });
          }
        </script>
        </body>
        </html>
        """
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var loadedId: String?
        var onLoadFailed: (() -> Void)?
        private var didReportError = false

        init(onLoadFailed: (() -> Void)?) {
            self.onLoadFailed = onLoadFailed
        }

        // The IFrame API reports an unplayable video here (error 2/5/100/101/150).
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == kErrorHandlerName else { return }
            reportFailure()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            reportFailure()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            reportFailure()
        }

        private func reportFailure() {
            guard !didReportError else { return }
            didReportError = true
            DispatchQueue.main.async { [weak self] in self?.onLoadFailed?() }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            // An explicit "Watch on YouTube" tap inside the player opens externally
            // (YouTube app / Safari) rather than navigating our inline webview.
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "about" || scheme == "data" || scheme == "blob" {
                decisionHandler(.allow)
                return
            }
            let host = url.host?.lowercased() ?? ""
            let allowed = host.isEmpty
                || host.contains("youtube")
                || host.contains("ytimg")
                || host.contains("google")
                || host.contains("ggpht")
                || host.contains("gstatic")
                || host.contains("fahybrid")
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

    /// The canonical public watch URL for an id — used by the external fallback.
    static func watchURL(for videoId: String) -> URL? {
        URL(string: "https://www.youtube.com/watch?v=\(videoId)")
    }
}

struct YouTubeSheet: View {
    let url: String
    let title: String
    @Environment(\.dismiss) private var dismiss
    @State private var embedFailed = false

    private var videoId: String? { YouTubeLinkParser.videoId(from: url) }

    var body: some View {
        NavigationStack {
            Group {
                if let id = videoId {
                    if embedFailed {
                        externalFallback(id: id)
                    } else {
                        YouTubeEmbedView(videoId: id, onLoadFailed: { embedFailed = true })
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .padding()
                    }
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
                // Always-available escape hatch to the YouTube app / Safari.
                if let id = videoId, let watch = YouTubeLinkParser.watchURL(for: id) {
                    ToolbarItem(placement: .topBarLeading) {
                        Link(destination: watch) {
                            Image(systemName: "play.rectangle")
                                .foregroundStyle(Theme.Color.muted)
                        }
                        .accessibilityLabel("Ver en YouTube")
                    }
                }
            }
        }
    }

    private func externalFallback(id: String) -> some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "play.slash")
                .font(.system(size: 34))
                .foregroundStyle(Theme.Color.muted)
            Text("No se pudo reproducir aquí")
                .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Este vídeo no permite reproducción integrada.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            if let watch = YouTubeLinkParser.watchURL(for: id) {
                Link(destination: watch) {
                    Text("Ver en YouTube")
                        .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 11)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(Theme.Spacing.xl)
    }
}
