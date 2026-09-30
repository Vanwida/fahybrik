import SwiftUI
import UIKit
import AVKit
import QuickLook

// Las burbujas de vídeo y de archivo (en las dos direcciones). El medio remoto se resuelve a un fichero temporal por
// `ChatMediaLoader` (autenticado) al tocar, y luego suena por AVKit / se previsualiza con QuickLook. El medio local
// (recién enviado) se reproduce directamente desde su temporal.

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
    private static let ladoDelPlay: CGFloat = 52

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
                // Velo + el glifo de reproducir.
                Rectangle().fill(Theme.Color.scrim.opacity(0.28))
                    .frame(width: size.width, height: size.height)
                Group {
                    if isResolving {
                        ProgressView().tint(.white)
                    } else if failed {
                        IconoChat(.alertaRellena, tam: 22, peso: .bold)
                    } else {
                        IconoChat(.play, tam: 22, peso: .bold)
                    }
                }
                .foregroundStyle(.white)
                .frame(width: Self.ladoDelPlay, height: Self.ladoDelPlay)
                .background(Color.black.opacity(MedidasChat.opacidadDelDiscoSobreMedio), in: Circle())
                if let label = durationLabel {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(label)
                                .papel(.notaPesada)
                                .foregroundStyle(.white)
                                .padding(.horizontal, Theme.Spacing.s).padding(.vertical, Theme.Spacing.xs)
                                .background(Color.black.opacity(MedidasChat.opacidadDelDiscoSobreMedio), in: Capsule())
                        }
                    }
                    .padding(Theme.Spacing.s)
                    .frame(width: size.width, height: size.height)
                }
            }
            .clipShape(FormaBurbujaChat(mia: isMe))
            .overlay { FormaBurbujaChat(mia: isMe).stroke(Theme.Color.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .task(id: taskKey) { await loadPoster() }
        .sheet(isPresented: $showPlayer) {
            if let playerURL { VideoPlayerSheet(url: playerURL) }
        }
        .accessibilityLabel(failed ? "Vídeo. No se pudo abrir." : "Vídeo. Toca para reproducir.")
    }

    private var taskKey: String { source.remoteURL ?? source.localURL?.absoluteString ?? "" }
    private var durationLabel: String? {
        guard let d = metaDuration, d > 0 else { return nil }
        return Formato.clock(d)
    }

    /// Sólo se genera el póster de un fichero LOCAL (barato). Un vídeo remoto sigue siendo un hueco con su glifo hasta
    /// que se toca: no se descargan 200 MB sólo para una miniatura.
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
        // `image(at:)` asíncrono de iOS 16+ — sin la API de callback obsoleta.
        guard let cg = try? await gen.image(at: time).image else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Hoja con el reproductor de AVKit: reproduce solo el fichero local ya resuelto.
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
                    BotonCierreSobreMedio(alCerrar: { dismiss() })
                }
                Spacer()
            }
            .padding(Theme.Spacing.s)
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

    private var tinta: Color { isMe ? Theme.Color.accentOn : Theme.Color.foreground }

    private var subtitle: String {
        if failed { return "No se pudo abrir" }
        if let b = sizeBytes, b > 0 { return ByteCountLabel.format(b) }
        return "Documento"
    }

    var body: some View {
        Button { Task { await openPreview() } } label: {
            HStack(spacing: Theme.Spacing.m) {
                // La ficha del archivo: la cara elevada del kit (con su filete) sobre cualquiera de las dos burbujas.
                FichaDia(tono: .normal) {
                    if isResolving {
                        ProgressView().tint(Theme.Color.foreground)
                    } else {
                        IconoChat(.documento, tam: 22)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(name)
                        .papel(.rotulo)
                        .foregroundStyle(tinta)
                        .lineLimit(1).truncationMode(.middle)
                    HStack(spacing: Theme.Spacing.xs) {
                        // El fallo va en la marca (el triángulo) y en la palabra; el texto conserva su tinta.
                        if failed {
                            IconoChat(.alerta, tam: 14)
                                .foregroundStyle(isMe ? Theme.Color.accentOn : Theme.Color.danger)
                        }
                        Text(subtitle)
                            .papel(.nota)
                            .foregroundStyle(tinta)
                    }
                }
                Spacer(minLength: Theme.Spacing.xs)
                IconoChat(.descarga, tam: 20)
                    .foregroundStyle(tinta)
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, Theme.Spacing.s)
            .frame(minWidth: 220, maxWidth: MedidasChat.anchoMaximoBurbuja, minHeight: Theme.Size.toque, alignment: .leading)
            .burbujaChat(mia: isMe)
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

/// Envoltorio de QuickLook — vista previa en la propia app de PDF / TXT / MD / DOCX desde una URL local.
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
