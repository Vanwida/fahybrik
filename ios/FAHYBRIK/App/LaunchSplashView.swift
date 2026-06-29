import SwiftUI
import AVFoundation

/// Cold-start launch splash — the FAHYBRID "Barrido de Energía" energy-wipe.
///
/// Plays the bundled `splash-fahybrid.mp4` full-screen (aspect-fill, no
/// controls, muted) exactly once and then calls `onFinish`. It is intentionally
/// defensive so it can NEVER trap the user on the intro:
///
///   • Reduce Motion on  → skip the wipe, finish immediately (straight to app).
///   • Asset missing      → finish immediately (fall through gracefully).
///   • Player fails/stalls → a `maxHold` watchdog finishes anyway.
///   • Plays to end       → finish on `AVPlayerItemDidPlayToEndTime`.
///
/// `onFinish` is funnelled through a one-shot guard so the end notification, the
/// failure observer and the watchdog can all race without double-firing the
/// caller's dismissal animation.
struct LaunchSplashView: View {
    let onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var didFinish = false

    /// Hard ceiling on how long the splash may hold the launch, even if the
    /// player's end notification never arrives (corrupt asset, decode stall).
    /// Slightly longer than the 2.6s composition so the final lock-up reads
    /// before we cut to the app.
    private static let maxHold: TimeInterval = 3.0

    private static let videoURL: URL? =
        Bundle.main.url(forResource: "splash-fahybrid", withExtension: "mp4")

    var body: some View {
        ZStack {
            // Brand black behind the video — matches the empty UILaunchScreen and
            // the video's own background, so there is no flash on either edge of
            // the transition regardless of light/dark app appearance.
            Color.black.ignoresSafeArea()

            if !reduceMotion, let url = Self.videoURL {
                SplashPlayerView(url: url, onFinish: finishOnce)
                    .ignoresSafeArea()
            }
        }
        .onAppear {
            // Nothing to play → don't even show a black frame longer than needed.
            if reduceMotion || Self.videoURL == nil {
                finishOnce()
                return
            }
            // Watchdog: never let a stalled player strand the user on the splash.
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.maxHold) {
                finishOnce()
            }
        }
    }

    private func finishOnce() {
        guard !didFinish else { return }
        didFinish = true
        onFinish()
    }
}

// MARK: - AVPlayer-backed full-screen video

/// A `UIView` whose backing layer IS an `AVPlayerLayer`, so the video fills the
/// view with `resizeAspectFill` (cover) and no AVKit player chrome.
private final class PlayerContainerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

private struct SplashPlayerView: UIViewRepresentable {
    let url: URL
    let onFinish: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill
        context.coordinator.start(on: view.playerLayer, url: url)
        return view
    }

    func updateUIView(_ uiView: PlayerContainerView, context: Context) {}

    static func dismantleUIView(_ uiView: PlayerContainerView, coordinator: Coordinator) {
        coordinator.teardown()
    }

    final class Coordinator {
        private let onFinish: () -> Void
        private var player: AVPlayer?
        private var endObserver: NSObjectProtocol?
        private var statusObservation: NSKeyValueObservation?

        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }

        func start(on layer: AVPlayerLayer, url: URL) {
            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            player.isMuted = true
            player.actionAtItemEnd = .pause
            layer.player = player
            self.player = player

            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak self] _ in self?.onFinish() }

            // If the asset can't be decoded, bail out to the app immediately
            // rather than waiting for the watchdog.
            statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                if item.status == .failed {
                    DispatchQueue.main.async { self?.onFinish() }
                }
            }

            player.play()
        }

        func teardown() {
            if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
            endObserver = nil
            statusObservation?.invalidate()
            statusObservation = nil
            player?.pause()
            player = nil
        }
    }
}
