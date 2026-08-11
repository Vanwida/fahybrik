import SwiftUI
import WebKit
import AVKit
import Combine

// EL SITIO DONDE SE DECIDE QUÉ ES UN VÍDEO Y CON QUÉ SE REPRODUCE.
//
// Un vídeo de técnica llega SIEMPRE como un localizador suelto (un `String?`:
// `exercise_video_url`, `technique_video_url`, `WorkoutSegment.videoUrl`), y
// tiene exactamente dos formas válidas: un enlace de YouTube o el vídeo propio del
// entrenador, alojado en Cloudflare Stream y servido como HLS. `VideoDeTecnica` (más
// abajo) las clasifica y `VideoDeTecnicaPlayer` monta el reproductor que toca.
// NINGUNA vista vuelve a mirar la URL a mano: antes preguntaban
// `YouTubeLinkParser.videoId(from:) != nil` cada una por su cuenta, así que un vídeo
// propio perfectamente válido se quedaba invisible en las cinco.
//
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
//
// FULLSCREEN: the player runs in an explicit <iframe> carrying `allowfullscreen`
// + `allow="fullscreen"`, so the in-player fullscreen button is live (an
// API-generated iframe didn't reliably carry these). Element (HTML5) fullscreen
// is deliberately NOT enabled on the WKWebView: with it off, YouTube's button
// falls back to NATIVE iOS video fullscreen, which rotates a 16:9 video to
// landscape and keeps a 9:16 Short portrait — even though the app is
// portrait-locked. (Enabling element fullscreen would, per WebKit, suppress that
// rotation in a portrait-only app, letterboxing 16:9 in portrait.)

/// The embedding origin handed to the YouTube player. Must be a real https
/// origin the player can validate against; we use the app's own domain.
private let kEmbedOrigin = "https://www.fahybrid.com"
/// Name of the JS→Swift bridge used to surface in-player errors.
private let kErrorHandlerName = "ytError"
/// Caps the inline width of a portrait (Short) player so a 9:16 video does not
/// dominate the screen; the athlete taps the player's fullscreen button for the
/// immersive view.
private let kPortraitInlineMaxWidth: CGFloat = 280

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

    // The player document. The embed runs inside a document whose baseURL is our
    // real https origin (see file header) so YouTube gets the parent origin it
    // requires — that's the Error-153 fix. We use an EXPLICIT <iframe> (carrying
    // `allowfullscreen` + `allow="fullscreen"`) rather than letting the IFrame API
    // generate one, so the in-player fullscreen button works; the API then
    // attaches to it (`enablejsapi=1`) purely to bridge `onError` back to Swift.
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
          #player { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        </style>
        </head>
        <body>
        <iframe id="player"
          src="https://www.youtube.com/embed/\(videoId)?enablejsapi=1&playsinline=1&fs=1&rel=0&modestbranding=1&autoplay=\(play)&origin=\(kEmbedOrigin)"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen>
        </iframe>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
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

    /// How the source is meant to be shown. Derived from the URL form: a
    /// `/shorts/<id>` link is a vertical 9:16 Short, everything else is a
    /// standard 16:9 video. This is the reliable baseline signal for sizing the
    /// inline player so neither form gets black bars.
    enum Orientation {
        case landscape  // standard 16:9
        case portrait   // YouTube Short, 9:16

        /// width / height, for `.aspectRatio(_:contentMode:)`.
        var ratio: CGFloat { self == .portrait ? 9.0 / 16.0 : 16.0 / 9.0 }
    }

    /// A parsed, playable YouTube source: its id plus how it should be displayed.
    struct Video: Equatable {
        let id: String
        let orientation: Orientation
    }

    /// Parses a YouTube URL into its id and intended orientation. Su ÚNICO llamante
    /// es `VideoDeTecnica`, que es quien decide de qué tipo es un localizador.
    static func parse(from urlString: String) -> Video? {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: withScheme), let host = url.host?.lowercased() else { return nil }

        if host == "youtu.be" {
            let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard id.range(of: idPattern, options: .regularExpression) != nil else { return nil }
            return Video(id: id, orientation: .landscape)
        }

        if host.contains("youtube") {
            if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "v" })?
                .value,
               v.range(of: idPattern, options: .regularExpression) != nil {
                return Video(id: v, orientation: .landscape)
            }
            let parts = url.path.split(separator: "/")
            if parts.count >= 2, parts[0] == "embed" || parts[0] == "shorts" {
                let id = String(parts[1])
                guard id.range(of: idPattern, options: .regularExpression) != nil else { return nil }
                return Video(id: id, orientation: parts[0] == "shorts" ? .portrait : .landscape)
            }
        }
        return nil
    }

    /// The canonical public watch URL for an id — used by the external fallback.
    static func watchURL(for videoId: String) -> URL? {
        URL(string: "https://www.youtube.com/watch?v=\(videoId)")
    }
}

// MARK: - El localizador, clasificado

/// Qué es el localizador de un vídeo, y por tanto con qué se reproduce.
///
/// LA ÚNICA pieza que responde «¿esto tiene vídeo?». El entrenador puede pegar un
/// enlace de YouTube o subir su propio vídeo, y las dos formas tienen que llegar
/// igual de lejos: al atleta le da lo mismo dónde vive el archivo.
///
/// - `.youtube`: enlace público, se ve con el embed de siempre.
/// - `.stream`:  el vídeo que sube el entrenador. Vive en Cloudflare Stream y llega
///   como su manifiesto HLS
///   («https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8»), que
///   AVPlayer reproduce de forma NATIVA y con calidad adaptativa: sin librerías, sin
///   descargar el fichero entero y sin credencial (ver `VideoStreamPlayer`).
/// - `nil`: no hay vídeo, o el localizador no es ninguna de las dos formas (un
///   enlace a otro sitio, texto suelto). Sin vídeo no se pinta nada.
///
/// El host se comprueba ENTERO —prefijo y sufijo— y nunca con `contains`, que dejaría
/// pasar «cloudflarestream.com.loquesea.tld». Es lo que impide que la app del atleta
/// acabe pidiéndole bytes a un dominio ajeno porque alguien escribió lo que quiso en
/// la columna. Es la misma frontera que aplica el servidor al guardar
/// (`web/lib/exercises/video-source.ts`).
enum VideoDeTecnica: Equatable {
    case youtube(YouTubeLinkParser.Video)
    case stream(URL)

    /// El subdominio por cuenta de Cloudflare Stream: `customer-<code>.cloudflarestream.com`.
    private static let streamHostPrefix = "customer-"
    private static let streamHostSuffix = ".cloudflarestream.com"
    /// El identificador de un vídeo en Stream: 32 hexadecimales.
    private static let streamUidPattern = #"^[0-9a-f]{32}$"#
    /// El code de la cuenta dentro del subdominio.
    private static let streamCodePattern = #"^[a-z0-9]+$"#
    /// Los caminos que Cloudflare reparte del MISMO vídeo. Se aceptan todos y se
    /// reproduce siempre el HLS, que es lo que AVPlayer entiende sin ayuda.
    private static let streamHlsPath = "manifest/video.m3u8"
    private static let streamPaths = [streamHlsPath, "manifest/video.mpd", "iframe", "watch"]

    init?(_ localizador: String?) {
        guard let crudo = localizador?.trimmingCharacters(in: .whitespacesAndNewlines),
              !crudo.isEmpty
        else { return nil }

        if let video = YouTubeLinkParser.parse(from: crudo) {
            self = .youtube(video)
            return
        }
        guard let url = Self.streamHLS(desde: crudo) else { return nil }
        self = .stream(url)
    }

    /// El manifiesto HLS que hay detrás de cualquiera de las direcciones que
    /// Cloudflare reparte para un vídeo, o nil si eso no es un vídeo nuestro.
    private static func streamHLS(desde localizador: String) -> URL? {
        guard let components = URLComponents(string: localizador),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              host.hasPrefix(streamHostPrefix), host.hasSuffix(streamHostSuffix)
        else { return nil }

        let code = String(host.dropFirst(streamHostPrefix.count).dropLast(streamHostSuffix.count))
        guard code.range(of: streamCodePattern, options: .regularExpression) != nil
        else { return nil }

        let tramos = components.path.split(separator: "/").map(String.init)
        guard let uid = tramos.first?.lowercased(),
              uid.range(of: streamUidPattern, options: .regularExpression) != nil,
              streamPaths.contains(tramos.dropFirst().joined(separator: "/"))
        else { return nil }

        return URL(string: "https://\(host)/\(uid)/\(streamHlsPath)")
    }

    /// ¿Hay vídeo REPRODUCIBLE detrás de este localizador? Es lo que decide si se
    /// ofrece el botón de «Ver técnica» con el play o sin él.
    static func hay(en localizador: String?) -> Bool {
        VideoDeTecnica(localizador) != nil
    }
}

// MARK: - Reproductor

/// El reproductor de un vídeo de técnica, venga de donde venga. Las vistas montan
/// ESTO y no vuelven a preguntar de qué tipo es.
struct VideoDeTecnicaPlayer: View {
    let video: VideoDeTecnica
    var autoplay: Bool = false

    var body: some View {
        switch video {
        case .youtube(let yt):
            YouTubePlayer(video: yt, autoplay: autoplay)
        case .stream(let url):
            VideoStreamPlayer(url: url, autoplay: autoplay)
        }
    }
}

/// El vídeo que ha subido el entrenador, servido como HLS desde Cloudflare Stream.
///
/// AVPlayer reproduce HLS de forma NATIVA: se le da el manifiesto y él pide los
/// trozos que le hagan falta, eligiendo la calidad según la cobertura que haya —que
/// es justo lo que hace falta cuando el atleta mira la técnica en medio del gimnasio.
/// Ni librería, ni descargar el vídeo entero antes de ver el primer fotograma.
///
/// SIN CREDENCIAL, y a propósito: la URL es absoluta y pública (`requireSignedURLs`
/// desactivado, ver `web/lib/exercises/video-stream.ts`), así que aquí NO va el bearer
/// de la sesión. Lo protege un identificador de 32 hexadecimales que no se adivina,
/// igual que un vídeo de YouTube no listado. Antes de Stream el fichero era nuestro y
/// SÍ había que pedirlo con el bearer y bajarlo entero; eso ya no existe.
///
/// Estados honestos: mientras abre, se ve que está abriendo; si no se puede, se dice
/// y se ofrece reintentar. Nunca un rectángulo negro eterno.
struct VideoStreamPlayer: View {
    let url: URL
    var autoplay: Bool = false

    @State private var estado: Estado = .cargando
    /// La relación de aspecto REAL, para que un vídeo grabado en vertical no salga con
    /// franjas negras. En HLS no se sabe hasta que el reproductor tiene el primer
    /// fotograma, así que se empieza por la de siempre y se corrige en cuanto se sabe.
    @State private var relacion: CGFloat = Self.relacionPorDefecto

    private enum Estado {
        case cargando
        case listo(AVPlayer, AVPlayerItem)
        case fallo
    }

    /// Relación de aspecto por defecto mientras no se conoce la del vídeo.
    private static let relacionPorDefecto: CGFloat = 16.0 / 9.0

    var body: some View {
        contenido
            .task(id: url) { await cargar() }
    }

    @ViewBuilder
    private var contenido: some View {
        switch estado {
        case .cargando:
            marco {
                ProgressView().tint(Theme.Color.accentText)
            }
        case .listo(let player, let item):
            VideoPlayer(player: player)
                .aspectRatio(relacion, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .onReceive(item.publisher(for: \.presentationSize)) { tamano in
                    guard tamano.width > 0, tamano.height > 0 else { return }
                    relacion = tamano.width / tamano.height
                }
                .onDisappear { player.pause() }
        case .fallo:
            marco { fallo }
        }
    }

    private var fallo: some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: "play.slash")
                .font(.system(size: 26))
                .foregroundStyle(Theme.Color.muted)
            Text("No se pudo cargar el vídeo")
                .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
            Text("Comprueba tu conexión y vuelve a intentarlo.")
                .scaledFont(12, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Button {
                Haptics.light()
                Task { await cargar() }
            } label: {
                Text("Reintentar")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(Theme.Spacing.l)
    }

    private func marco<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .fill(Theme.Color.surfaceSunken)
            contenido()
        }
        .aspectRatio(Self.relacionPorDefecto, contentMode: .fit)
    }

    @MainActor
    private func cargar() async {
        estado = .cargando
        relacion = Self.relacionPorDefecto
        // Se pregunta ANTES de montar el reproductor si el manifiesto se puede
        // reproducir: es un viaje corto que distingue «tarda» de «no está», y sin él
        // un vídeo borrado o sin cobertura se quedaría en un rectángulo negro mudo.
        let asset = AVURLAsset(url: url)
        guard let reproducible = try? await asset.load(.isPlayable), reproducible else {
            estado = .fallo
            return
        }
        let item = AVPlayerItem(asset: asset)
        let player = AVPlayer(playerItem: item)
        estado = .listo(player, item)
        if autoplay { player.play() }
    }
}

/// In-app player sized to the source's real orientation: a 16:9 video fills the
/// column width, a 9:16 Short renders as a centered, height-bounded portrait box
/// — neither gets black bars. The athlete taps the player's fullscreen button to
/// go native fullscreen in the matching orientation (see `YouTubeEmbedView`).
struct YouTubePlayer: View {
    let video: YouTubeLinkParser.Video
    var autoplay: Bool = false
    var onLoadFailed: (() -> Void)? = nil

    var body: some View {
        let embed = YouTubeEmbedView(videoId: video.id, autoplay: autoplay, onLoadFailed: onLoadFailed)
            .aspectRatio(video.orientation.ratio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))

        switch video.orientation {
        case .landscape:
            embed
        case .portrait:
            embed
                .frame(maxWidth: kPortraitInlineMaxWidth)
                .frame(maxWidth: .infinity)  // center the narrow portrait box in the column
        }
    }
}

/// El vídeo de técnica en hoja (lo abre el entreno en vivo, que además pausa el
/// cronómetro mientras está abierta). Misma chapa para las dos formas: título,
/// «Cerrar» y el reproductor que le corresponda al localizador.
struct VideoDeTecnicaSheet: View {
    let url: String
    let title: String
    @Environment(\.dismiss) private var dismiss
    @State private var embedFailed = false

    private var video: VideoDeTecnica? { VideoDeTecnica(url) }

    var body: some View {
        NavigationStack {
            Group {
                switch video {
                case .youtube(let yt):
                    if embedFailed {
                        externalFallback(id: yt.id)
                    } else {
                        YouTubePlayer(video: yt, onLoadFailed: { embedFailed = true })
                            .padding()
                    }
                case .stream(let manifiesto):
                    VideoStreamPlayer(url: manifiesto)
                        .padding()
                case nil:
                    Text("Enlace de vídeo no válido")
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
                // Always-available escape hatch to the YouTube app / Safari. Sólo
                // existe para YouTube: un fichero nuestro no se abre en ningún sitio
                // fuera de la app.
                if case .youtube(let yt) = video, let watch = YouTubeLinkParser.watchURL(for: yt.id) {
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
