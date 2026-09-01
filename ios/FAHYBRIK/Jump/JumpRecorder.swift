import AVFoundation
import UIKit

// Cámara lenta: 240 fps si el device lo da, si no el máximo (marcado low_fps).

@MainActor
final class JumpRecorder: NSObject, ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var configuredFps: Double = 0
    @Published private(set) var authorizationDenied = false

    let session = AVCaptureSession()
    private let movie = AVCaptureMovieFileOutput()
    private var finish: ((URL?) -> Void)?
    private var outputURL: URL?

    var previewLayer: AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }

    func requestAccessAndConfigure() async {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        guard granted else {
            authorizationDenied = true
            return
        }
        await configure()
    }

    func configure() async {
        session.beginConfiguration()
        session.sessionPreset = .high
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device)
        else {
            session.commitConfiguration()
            return
        }
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(movie) { session.addOutput(movie) }
        Self.lockSlowMo(device)
        session.commitConfiguration()
        if !session.isRunning { session.startRunning() }
        configuredFps = Self.activeFps()
    }

    func startRecording() {
        guard !isRecording else { return }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("cmj-\(UUID().uuidString).mov")
        outputURL = url
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: url)
        }
        movie.startRecording(to: url, recordingDelegate: self)
        isRecording = true
    }

    func stopRecording() async -> URL? {
        guard isRecording else { return nil }
        return await withCheckedContinuation { cont in
            finish = { url in cont.resume(returning: url) }
            movie.stopRecording()
        }
    }

    func teardown() {
        if session.isRunning { session.stopRunning() }
    }

    private static func lockSlowMo(_ device: AVCaptureDevice) {
        let formats = device.formats.filter { format in
            format.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 120 }
        }
        let pick = formats
            .sorted { a, b in
                let af = a.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
                let bf = b.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
                if af != bf { return af > bf }
                let ad = CMVideoFormatDescriptionGetDimensions(a.formatDescription)
                let bd = CMVideoFormatDescriptionGetDimensions(b.formatDescription)
                return ad.width > bd.width
            }
            .first
        guard let format = pick else { return }
        let maxFps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 60
        let fps = min(240, maxFps)
        try? device.lockForConfiguration()
        device.activeFormat = format
        let duration = CMTime(value: 1, timescale: CMTimeScale(fps))
        device.activeVideoMinFrameDuration = duration
        device.activeVideoMaxFrameDuration = duration
        device.unlockForConfiguration()
    }

    private static func activeFps() -> Double {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            return 60
        }
        let d = device.activeVideoMinFrameDuration
        guard d.timescale > 0, d.seconds > 0 else { return 60 }
        return 1 / d.seconds
    }
}

extension JumpRecorder: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            isRecording = false
            let url = error == nil ? outputFileURL : nil
            finish?(url)
            finish = nil
        }
    }
}
