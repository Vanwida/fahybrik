import SwiftUI
import UIKit
import AVKit
import QuickLook

// Video + file attachment bubbles (both directions). Remote media resolves to a
// local temp file through ChatMediaLoader (authenticated) on tap, then plays via
// AVKit / previews via QuickLook. Local (just-sent) media plays straight from its
// temp file.

// MARK: - Video bubble

struct ChatVideoBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let metaDuration: Double?
    let bearer: String?

    @State private var poster: UIImage?
    @State private var isResolving = false
    @State private var playerURL: URL?
    @State private var showPlayer = false
    @State private var failed = false

    private let size = CGSize(width: 232, height: 232 * 9 / 16)

    var body: some View {
        Button { Task { await openPlayer() } } label: {
            ZStack {
                if let poster {
                    Image(uiImage: poster).resizable().scaledToFill()
                        .frame(width: size.width, height: size.height).clipped()
                } else {
                    Rectangle().fill(Theme.Color.surfaceSunken)
                        .frame(width: size.width, height: size.height)
                }
                // Scrim + play glyph.
                Rectangle().fill(Theme.Color.scrim.opacity(0.28))
                    .frame(width: size.width, height: size.height)
                Group {
                    if isResolving { ProgressView().tint(.white) }
                    else {
                        Image(systemName: failed ? "exclamationmark.triangle.fill" : "play.fill")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(.black.opacity(0.42))
                            .clipShape(Circle())
                    }
                }
                if let label = durationLabel {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(label)
                                .font(.system(size: 10, weight: .heavy, design: .monospaced))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 3)
                                .background(.black.opacity(0.5))
                                .clipShape(Capsule())
                        }
                    }
                    .padding(8)
                    .frame(width: size.width, height: size.height)
                }
            }
            .clipShape(BubbleShape(isMe: isMe))
            .overlay { BubbleShape(isMe: isMe).stroke(Theme.Color.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .task(id: taskKey) { await loadPoster() }
        .sheet(isPresented: $showPlayer) {
            if let playerURL { VideoPlayerSheet(url: playerURL) }
        }
        .accessibilityLabel("Vídeo. Toca para reproducir.")
    }

    private var taskKey: String { source.remoteURL ?? source.localURL?.absoluteString ?? "" }
    private var durationLabel: String? {
        guard let d = metaDuration, d > 0 else { return nil }
        return DurationLabel.mmss(d)
    }

    /// Only generate a poster from a LOCAL file (cheap). Remote videos stay a
    /// styled placeholder until tapped — we don't download a 200 MB file just for
    /// a thumbnail.
    @MainActor
    private func loadPoster() async {
        guard let local = source.localURL else { return }
        poster = await Self.firstFrame(local)
    }

    @MainActor
    private func openPlayer() async {
        if let local = source.localURL { playerURL = local; showPlayer = true; return }
        guard let remote = source.remoteURL, let bearer else { failed = true; return }
        isResolving = true; failed = false
        do {
            let url = try await ChatMediaLoader.shared.localFile(remoteURL: remote, bearer: bearer)
            playerURL = url
            isResolving = false
            showPlayer = true
        } catch {
            isResolving = false; failed = true
        }
    }

    private static func firstFrame(_ url: URL) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 640, height: 640)
        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        // iOS 16+ async image(at:) — no deprecated callback API.
        guard let cg = try? await gen.image(at: time).image else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// AVKit player sheet — autoplays the resolved local file.
struct VideoPlayerSheet: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
                    .onAppear { player.play() }
                    .onDisappear { player.pause() }
            }
            VStack {
                HStack {
                    Spacer()
                    Button { Haptics.light(); dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(.black.opacity(0.4)).clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Cerrar")
                }
                Spacer()
            }
            .padding(16)
        }
        .onAppear { player = AVPlayer(url: url) }
    }
}

// MARK: - File bubble

struct ChatFileBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let name: String
    let sizeBytes: Int?
    let bearer: String?

    @State private var isResolving = false
    @State private var previewURL: URL?
    @State private var showPreview = false
    @State private var failed = false

    private var fg: Color { isMe ? Theme.Color.accentOn : Theme.Color.foreground }
    private var sub: Color { isMe ? Theme.Color.accentOn.opacity(0.8) : Theme.Color.muted }

    private var subtitle: String {
        if failed { return "No se pudo abrir" }
        if let b = sizeBytes, b > 0 { return ByteCountLabel.format(b) }
        return "Documento"
    }

    var body: some View {
        Button { Task { await openPreview() } } label: {
            HStack(spacing: 11) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(isMe ? Theme.Color.accentOn.opacity(0.16) : Theme.Color.surfaceElevated)
                        .frame(width: 40, height: 40)
                    if isResolving {
                        ProgressView().tint(fg).scaleEffect(0.8)
                    } else {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(isMe ? Theme.Color.accentOn : Theme.Color.accentText)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(fg)
                        .lineLimit(1).truncationMode(.middle)
                    Text(subtitle)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(failed ? Theme.Color.danger : sub)
                }
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(sub)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(minWidth: 180, maxWidth: 250, alignment: .leading)
            .chatBubbleSurface(isMe: isMe)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showPreview) {
            if let previewURL { QuickLookPreview(url: previewURL) }
        }
        .accessibilityLabel("Archivo \(name), \(subtitle). Toca para abrir.")
    }

    @MainActor
    private func openPreview() async {
        if let local = source.localURL { previewURL = local; showPreview = true; return }
        guard let remote = source.remoteURL, let bearer else { failed = true; return }
        isResolving = true; failed = false
        do {
            previewURL = try await ChatMediaLoader.shared.localFile(remoteURL: remote, bearer: bearer)
            isResolving = false
            showPreview = true
        } catch {
            isResolving = false; failed = true
        }
    }
}

/// QuickLook wrapper — inline preview for PDF / TXT / MD / DOCX from a local URL.
struct QuickLookPreview: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UINavigationController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return UINavigationController(rootViewController: controller)
    }

    func updateUIViewController(_ vc: UINavigationController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
