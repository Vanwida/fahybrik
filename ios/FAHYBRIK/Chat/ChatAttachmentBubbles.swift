import SwiftUI
import UIKit
import AVFoundation

// Attachment bubbles rendered inside MessageRow, in BOTH directions (athlete =
// Fabrik-orange fill, coach = card). Voice + image live here; video + file live
// in ChatMediaBubbles.swift. `BubbleShape` (the asymmetric tail) is defined here
// once and reused by the text bubble in ChatView.

// MARK: - Shared bubble chrome

/// Asymmetric bubble matching the handoff: the flattened (4pt) "tail" corner is
/// the TOP corner on the speaker's side — received = top-leading, sent =
/// top-trailing. All other corners 14pt. (Moved out of ChatView so every bubble
/// kind shares one shape.)
struct BubbleShape: Shape {
    let isMe: Bool
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 14
        let small: CGFloat = 4
        let topLeft     = isMe ? radius : small
        let topRight    = isMe ? small  : radius
        let bottomLeft  = radius
        let bottomRight = radius
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + topLeft, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - topRight, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - topRight, y: rect.minY + topRight),
                 radius: topRight, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottomRight))
        p.addArc(center: CGPoint(x: rect.maxX - bottomRight, y: rect.maxY - bottomRight),
                 radius: bottomRight, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY - bottomLeft),
                 radius: bottomLeft, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeft))
        p.addArc(center: CGPoint(x: rect.minX + topLeft, y: rect.minY + topLeft),
                 radius: topLeft, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

/// Applies the bubble fill (accent for me, surface + hairline for coach) and the
/// asymmetric clip. Padded content kinds (voice / file) use this; media that
/// fills edge-to-edge (image / video) clips the media itself instead.
extension View {
    func chatBubbleSurface(isMe: Bool) -> some View {
        self
            .background(isMe ? Theme.Color.accent : Theme.Color.surface)
            .overlay {
                if !isMe { BubbleShape(isMe: false).stroke(Theme.Color.hairlineStrong, lineWidth: 1) }
            }
            .clipShape(BubbleShape(isMe: isMe))
    }
}

/// Deterministic per-message waveform bars. There's no server-side waveform, so
/// we derive a STABLE bar pattern from the attachment's identity (URL) — same
/// note always draws the same bars, never a reshuffle on redraw.
enum ChatWaveform {
    static func bars(seed: String, count: Int = 30) -> [CGFloat] {
        var rng = SeededRNG(seedString: seed)
        return (0..<count).map { _ in CGFloat.random(in: 0.30...1.0, using: &rng) }
    }
}

/// Tiny SplitMix64 RNG so waveform bars are deterministic per attachment.
struct SeededRNG: RandomNumberGenerator {
    private var state: UInt64
    init(seedString: String) {
        var h: UInt64 = 1469598103934665603
        for b in seedString.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        state = h == 0 ? 0x9E3779B97F4A7C15 : h
    }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

// MARK: - Voice bubble (real playback)

/// Coordinates single-note playback: starting one voice note pauses whichever
/// was playing.
@MainActor
final class ChatAudioCoordinator {
    static let shared = ChatAudioCoordinator()
    private weak var active: ChatVoicePlayer?
    func becameActive(_ player: ChatVoicePlayer) {
        if active !== player { active?.pause() }
        active = player
    }
    func resigned(_ player: ChatVoicePlayer) { if active === player { active = nil } }
}

@MainActor
final class ChatVoicePlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var resolvedDuration: Double?
    @Published var isLoading = false
    @Published var failed = false

    private var player: AVAudioPlayer?
    private var timer: Timer?

    func toggle(source: ChatAttachmentSource, bearer: String?) {
        if isPlaying { pause(); return }
        if let player {
            resume(player); return
        }
        Task { await loadAndPlay(source: source, bearer: bearer) }
    }

    private func loadAndPlay(source: ChatAttachmentSource, bearer: String?) async {
        isLoading = true; failed = false
        do {
            let localURL: URL
            if let l = source.localURL {
                localURL = l
            } else if let remote = source.remoteURL, let bearer {
                localURL = try await ChatMediaLoader.shared.localFile(remoteURL: remote, bearer: bearer)
            } else {
                throw ChatMediaError.noBearer
            }
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: localURL)
            p.delegate = self
            p.prepareToPlay()
            player = p
            resolvedDuration = p.duration
            isLoading = false
            resume(p)
        } catch {
            isLoading = false; failed = true
        }
    }

    private func resume(_ p: AVAudioPlayer) {
        ChatAudioCoordinator.shared.becameActive(self)
        p.play()
        isPlaying = true
        startTimer()
        Haptics.light()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        timer?.invalidate(); timer = nil
    }

    private func startTimer() {
        timer?.invalidate()
        let t = Timer(timeInterval: 0.03, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let p = self.player else { return }
                self.progress = p.duration > 0 ? p.currentTime / p.duration : 0
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.progress = 0
            self.timer?.invalidate(); self.timer = nil
            ChatAudioCoordinator.shared.resigned(self)
        }
    }
}

struct ChatVoiceBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let metaDuration: Double?
    let bearer: String?
    @StateObject private var player = ChatVoicePlayer()

    private var glyphColor: Color { isMe ? Theme.Color.accentOn : Theme.Color.accentText }
    private var barColor: Color { isMe ? Theme.Color.accentOn : Theme.Color.foreground }
    private var mutedBar: Color { (isMe ? Theme.Color.accentOn : Theme.Color.muted).opacity(0.45) }

    private var durationLabel: String {
        DurationLabel.mmss(player.resolvedDuration ?? metaDuration ?? 0)
    }
    private var seed: String { source.remoteURL ?? source.localURL?.absoluteString ?? "voice" }

    var body: some View {
        HStack(spacing: 9) {
            Button { player.toggle(source: source, bearer: bearer) } label: {
                Group {
                    if player.isLoading {
                        ProgressView().tint(glyphColor).scaleEffect(0.8)
                    } else {
                        Image(systemName: player.failed ? "exclamationmark.triangle.fill"
                                          : (player.isPlaying ? "pause.fill" : "play.fill"))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(glyphColor)
                    }
                }
                .frame(width: 22, height: 22)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(player.isPlaying ? "Pausar nota de voz" : "Reproducir nota de voz")

            ProgressWaveform(bars: ChatWaveform.bars(seed: seed),
                             progress: player.progress,
                             played: barColor, unplayed: mutedBar)
                .frame(width: 108, height: 20)

            Text(durationLabel)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(isMe ? Theme.Color.accentOn : Theme.Color.muted)
                .monospacedDigit()
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .chatBubbleSurface(isMe: isMe)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Nota de voz, \(durationLabel)")
    }
}

/// A voice-bubble waveform whose bars fill with playback progress.
struct ProgressWaveform: View {
    let bars: [CGFloat]
    let progress: Double
    let played: Color
    let unplayed: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 2) {
                ForEach(Array(bars.enumerated()), id: \.offset) { idx, h in
                    let frac = bars.isEmpty ? 0 : Double(idx) / Double(bars.count)
                    Capsule()
                        .fill(frac <= progress ? played : unplayed)
                        .frame(width: 2)
                        .frame(height: max(2, h * geo.size.height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}

// MARK: - Image bubble

struct ChatImageBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let aspect: Double?          // w/h from meta, reserves space before load
    let bearer: String?

    @State private var image: UIImage?
    @State private var failed = false
    @State private var showViewer = false

    // Bubble sizing bounds.
    private let maxW: CGFloat = 240
    private let maxH: CGFloat = 320

    private var displaySize: CGSize {
        let ratio: CGFloat = image.map { $0.size.width / max(1, $0.size.height) }
            ?? aspect.map { CGFloat($0) } ?? 1
        if ratio >= 1 {                        // landscape / square
            let w = maxW
            let h = min(maxH, w / ratio)
            return CGSize(width: w, height: h)
        } else {                               // portrait
            let h = maxH
            let w = min(maxW, h * ratio)
            return CGSize(width: w, height: h)
        }
    }

    var body: some View {
        Button { if image != nil { Haptics.light(); showViewer = true } } label: {
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: displaySize.width, height: displaySize.height)
                        .clipped()
                } else {
                    Rectangle()
                        .fill(Theme.Color.surfaceSunken)
                        .frame(width: displaySize.width, height: displaySize.height)
                        .overlay {
                            if failed {
                                Image(systemName: "photo.badge.exclamationmark")
                                    .font(.system(size: 22)).foregroundStyle(Theme.Color.muted)
                            } else {
                                ProgressView().tint(Theme.Color.muted)
                            }
                        }
                }
            }
            .clipShape(BubbleShape(isMe: isMe))
            .overlay { BubbleShape(isMe: isMe).stroke(Theme.Color.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .task(id: taskKey) { await load() }
        .fullScreenCover(isPresented: $showViewer) {
            if let image { ChatImageViewer(image: image) }
        }
        .accessibilityLabel("Foto. Toca para ampliar.")
    }

    private var taskKey: String { source.remoteURL ?? source.localURL?.absoluteString ?? "" }

    // @MainActor: the heavy decode runs off-main (Task.detached / the loader
    // actor), but the @State assignment resumes here on the main actor.
    @MainActor
    private func load() async {
        failed = false
        if let local = source.localURL {
            let img = await Task.detached { UIImage(contentsOfFile: local.path) }.value
            if let img { image = img } else { failed = true }
            return
        }
        guard let remote = source.remoteURL, let bearer else { failed = true; return }
        do { image = try await ChatMediaLoader.shared.image(remoteURL: remote, bearer: bearer) }
        catch { failed = true }
    }
}

/// Full-screen, zoomable image viewer (pinch + drag, double-tap to reset).
struct ChatImageViewer: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .scaleEffect(max(1, scale * pinch))
                .offset(offset)
                .gesture(
                    MagnificationGesture()
                        .updating($pinch) { v, s, _ in s = v }
                        .onEnded { v in scale = max(1, min(4, scale * v)) }
                )
                .gesture(
                    DragGesture()
                        .onChanged { v in if scale > 1 { offset = v.translation } }
                        .onEnded { _ in if scale <= 1 { withAnimation(.spring) { offset = .zero } } }
                )
                .onTapGesture(count: 2) {
                    withAnimation(.spring) { scale = scale > 1 ? 1 : 2.5; offset = .zero }
                }
            VStack {
                HStack {
                    Spacer()
                    Button { Haptics.light(); dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(.black.opacity(0.4))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Cerrar")
                }
                Spacer()
            }
            .padding(16)
        }
        .statusBarHidden()
    }
}
