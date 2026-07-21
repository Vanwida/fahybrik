import SwiftUI
import UIKit
import AVFoundation

// Voice-note recorder overlay: record → live waveform + timer → stop → preview
// (play back / re-record) → send. Produces a `ChatPickedAttachment` (kind
// .voice, an AAC .m4a temp file + real duration). Presented as a sheet from the
// chat composer. Requires NSMicrophoneUsageDescription (added in project.yml).

// MARK: - Engine

@MainActor
final class VoiceRecorderEngine: NSObject, ObservableObject, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    enum Phase { case idle, recording, recorded, denied }

    @Published var phase: Phase = .idle
    @Published var elapsed: TimeInterval = 0
    /// Rolling normalised levels (0…1) driving the live waveform.
    @Published private(set) var levels: [CGFloat] = []
    @Published var isPlayingPreview = false
    @Published var playbackProgress: Double = 0

    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var meterTimer: Timer?
    private var playbackTimer: Timer?
    private(set) var fileURL: URL?
    private(set) var duration: TimeInterval = 0

    /// Auto-stop ceiling — a voice note, not a podcast. Also guarantees the AAC
    /// file stays far under the 25 MB voice cap.
    private let maxDuration: TimeInterval = 5 * 60
    private let maxLevels = 56

    // MARK: permission + record

    func start() {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: beginRecording()
        case .denied:  phase = .denied
        case .undetermined:
            AVAudioApplication.requestRecordPermission { [weak self] granted in
                Task { @MainActor in
                    guard let self else { return }
                    if granted { self.beginRecording() } else { self.phase = .denied }
                }
            }
        @unknown default:
            phase = .denied
        }
    }

    private func beginRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            phase = .denied
            return
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("nota-voz-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            let rec = try AVAudioRecorder(url: url, settings: settings)
            rec.delegate = self
            rec.isMeteringEnabled = true
            guard rec.record() else { phase = .denied; return }
            recorder = rec
            fileURL = url
            elapsed = 0
            levels = []
            phase = .recording
            Haptics.medium()
            startMetering()
        } catch {
            phase = .denied
        }
    }

    private func startMetering() {
        meterTimer?.invalidate()
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickMeter() }
        }
        RunLoop.main.add(timer, forMode: .common)
        meterTimer = timer
    }

    private func tickMeter() {
        guard let rec = recorder, rec.isRecording else { return }
        rec.updateMeters()
        let power = rec.averagePower(forChannel: 0)         // dBFS, ~ -160…0
        let level = CGFloat(max(0, (power + 50) / 50))       // floor at -50 dB
        levels.append(min(1, level))
        if levels.count > maxLevels { levels.removeFirst(levels.count - maxLevels) }
        elapsed = rec.currentTime
        if elapsed >= maxDuration { stop() }
    }

    func stop() {
        meterTimer?.invalidate(); meterTimer = nil
        guard let rec = recorder else { return }
        duration = rec.currentTime
        rec.stop()
        recorder = nil
        phase = .recorded
        Haptics.light()
    }

    // MARK: preview playback

    func togglePreview() {
        guard let url = fileURL else { return }
        if isPlayingPreview { pausePreview(); return }
        do {
            if player == nil {
                let p = try AVAudioPlayer(contentsOf: url)
                p.delegate = self
                p.isMeteringEnabled = false
                player = p
            }
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            player?.play()
            isPlayingPreview = true
            startPlaybackTimer()
        } catch {
            isPlayingPreview = false
        }
    }

    private func pausePreview() {
        player?.pause()
        isPlayingPreview = false
        playbackTimer?.invalidate(); playbackTimer = nil
    }

    private func startPlaybackTimer() {
        playbackTimer?.invalidate()
        let timer = Timer(timeInterval: 0.03, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let p = self.player else { return }
                self.playbackProgress = p.duration > 0 ? p.currentTime / p.duration : 0
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        playbackTimer = timer
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlayingPreview = false
            self.playbackProgress = 0
            self.playbackTimer?.invalidate(); self.playbackTimer = nil
        }
    }

    // MARK: teardown / result

    /// Discard a recording (re-record or cancel) — stops playback and removes the
    /// temp file.
    func discard() {
        pausePreview()
        player = nil
        meterTimer?.invalidate(); meterTimer = nil
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
        fileURL = nil
        levels = []
        elapsed = 0
        duration = 0
        phase = .idle
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Package the recorded note for sending. Ownership of the temp file passes to
    /// the caller (do NOT `discard` after this).
    func makeAttachment() -> ChatPickedAttachment? {
        guard let url = fileURL else { return nil }
        pausePreview()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        var meta = ChatAttachmentMeta()
        meta.durationMs = Int((duration * 1000).rounded())
        meta.sizeBytes = size
        meta.mimeType = "audio/mp4"
        return ChatPickedAttachment(
            kind: .voice, localURL: url, filename: "nota-voz.m4a",
            mimeType: "audio/mp4", sizeBytes: size, meta: meta
        )
    }

    func teardownIfUnsent() {
        // Only clears the session; the caller decides whether the file survives.
        meterTimer?.invalidate(); meterTimer = nil
        playbackTimer?.invalidate(); playbackTimer = nil
        player?.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - View

struct VoiceRecorderView: View {
    /// Called with the packaged note when the athlete taps Enviar. The sheet
    /// dismisses; the temp file is owned by the caller from here.
    let onSend: (ChatPickedAttachment) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var engine = VoiceRecorderEngine()

    var body: some View {
        VStack(spacing: 0) {
            handle
            content
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .presentationDetents([.height(320)])
        .presentationDragIndicator(.hidden)
        .onDisappear { engine.teardownIfUnsent() }
    }

    private var handle: some View {
        HStack {
            Text("Nota de voz")
                .scaledFont(15, weight: .bold, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Button {
                Haptics.light(); engine.discard(); dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private var content: some View {
        switch engine.phase {
        case .idle:      idleState
        case .recording: recordingState
        case .recorded:  previewState
        case .denied:    deniedState
        }
    }

    // Before the first tap.
    private var idleState: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("Toca para grabar")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
            recordButton(system: "mic.fill", label: "Grabar nota de voz") { engine.start() }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var recordingState: some View {
        VStack(spacing: 16) {
            Spacer()
            LiveWaveform(levels: engine.levels, tint: Theme.Color.accent)
                .frame(height: 56)
                .padding(.horizontal, 28)
            Text(DurationLabel.mmss(engine.elapsed))
                .font(.system(size: 30, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
                .monospacedDigit()
            recordButton(system: "stop.fill", label: "Detener", filled: true) { engine.stop() }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var previewState: some View {
        VStack(spacing: 14) {
            Spacer()
            StaticWaveform(levels: engine.levels.isEmpty ? Self.placeholderLevels : engine.levels,
                           progress: engine.playbackProgress,
                           tint: Theme.Color.accent)
                .frame(height: 46)
                .padding(.horizontal, 28)
            Text(DurationLabel.mmss(engine.duration))
                .font(.system(size: 15, weight: .bold, design: .monospaced))
                .foregroundStyle(Theme.Color.muted)

            HStack(spacing: 12) {
                Button {
                    Haptics.light(); engine.discard(); engine.start()
                } label: {
                    Label("Repetir", systemImage: "arrow.counterclockwise")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(height: 44)
                        .frame(maxWidth: .infinity)
                        .background(Theme.Color.surface)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                }
                .buttonStyle(PressScaleStyle())

                Button { engine.togglePreview() } label: {
                    Image(systemName: engine.isPlayingPreview ? "pause.fill" : "play.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 44, height: 44)
                        .background(Theme.Color.surfaceElevated)
                        .clipShape(Circle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(engine.isPlayingPreview ? "Pausar" : "Reproducir")

                Button {
                    guard let att = engine.makeAttachment() else { return }
                    Haptics.success(); onSend(att); dismiss()
                } label: {
                    Label("Enviar", systemImage: "arrow.up")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.accentOn)
                        .frame(height: 44)
                        .frame(maxWidth: .infinity)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
            }
            .padding(.horizontal, 20)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var deniedState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "mic.slash.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("Micrófono desactivado")
                .scaledFont(15, weight: .bold, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Actívalo en Ajustes para grabar notas de voz.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Text("Abrir Ajustes")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, 20).frame(height: 42)
                    .background(Theme.Color.accent).clipShape(Capsule())
            }
            .buttonStyle(PressScaleStyle())
            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity)
    }

    private func recordButton(system: String, label: String, filled: Bool = false,
                              action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); action() }) {
            Image(systemName: system)
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(filled ? Theme.Color.accentOn : Color.white)
                .frame(width: 72, height: 72)
                .background(filled ? Theme.Color.accent : Theme.Color.danger)
                .clipShape(Circle())
                .shadow(color: (filled ? Theme.Color.accent : Theme.Color.danger).opacity(0.35), radius: 12, y: 4)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(label)
    }

    private static let placeholderLevels: [CGFloat] =
        [0.3, 0.6, 0.8, 0.5, 0.7, 0.9, 0.55, 0.4, 0.75, 0.6, 0.5, 0.85, 0.65, 0.45]
}

// MARK: - Waveforms

/// Live level meter — newest sample on the trailing edge.
struct LiveWaveform: View {
    let levels: [CGFloat]
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
                    Capsule()
                        .fill(tint)
                        .frame(width: 3)
                        .frame(height: max(3, level * geo.size.height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
    }
}

/// Captured waveform with a playback-progress fill (played bars = tint, rest =
/// muted).
struct StaticWaveform: View {
    let levels: [CGFloat]
    let progress: Double
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(levels.enumerated()), id: \.offset) { idx, level in
                    let frac = levels.isEmpty ? 0 : Double(idx) / Double(levels.count)
                    Capsule()
                        .fill(frac <= progress ? tint : Theme.Color.muted.opacity(0.5))
                        .frame(width: 3)
                        .frame(height: max(3, level * geo.size.height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}
