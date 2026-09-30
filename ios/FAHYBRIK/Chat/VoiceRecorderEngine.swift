import SwiftUI
import UIKit
import AVFoundation

// EL MOTOR DE LA NOTA DE VOZ: pide el permiso, graba con su medidor de niveles, reproduce la vista previa y empaqueta
// el resultado como un `ChatPickedAttachment` (kind .voice, un .m4a AAC temporal con su duración real). La hoja que lo
// maneja es `VoiceRecorderView`. Requiere NSMicrophoneUsageDescription (en project.yml).

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
