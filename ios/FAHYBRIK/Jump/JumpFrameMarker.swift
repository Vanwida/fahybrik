import AVFoundation
import Vision

// Propone despegue / aterrizaje. Si la pose no da, deja al atleta en el scrubber.

enum JumpFrameMarker {
    struct Proposal {
        var takeoff: Int
        var landing: Int
        var fps: Double
        var quality: String
        var frameCount: Int
    }

    static func propose(url: URL) async -> Proposal {
        let asset = AVURLAsset(url: url)
        let fps = await nominalFps(asset)
        let count = await frameCount(asset, fps: fps)
        guard count > 4 else {
            return Proposal(takeoff: 0, landing: max(1, count - 1), fps: fps, quality: "ok", frameCount: count)
        }

        let ankles = await ankleHeights(url: url, frameCount: count)
        if let marks = marks(from: ankles) {
            let quality = fps + 0.1 < 200 ? "low_fps" : "ok"
            return Proposal(takeoff: marks.0, landing: marks.1, fps: fps, quality: quality, frameCount: count)
        }
        let quality = fps + 0.1 < 200 ? "low_fps" : "ok"
        return Proposal(
            takeoff: max(0, count / 3),
            landing: min(count - 1, (count * 2) / 3),
            fps: fps,
            quality: quality,
            frameCount: count
        )
    }

    private static func nominalFps(_ asset: AVURLAsset) async -> Double {
        guard let track = try? await asset.loadTracks(withMediaType: .video).first else { return 60 }
        let rate = (try? await track.load(.nominalFrameRate)) ?? 0
        return rate > 0 ? Double(rate) : 60
    }

    private static func frameCount(_ asset: AVURLAsset, fps: Double) async -> Int {
        guard let duration = try? await asset.load(.duration) else { return 0 }
        return max(1, Int((duration.seconds * fps).rounded()))
    }

    private static func ankleHeights(url: URL, frameCount: Int) async -> [CGFloat?] {
        let asset = AVURLAsset(url: url)
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 360, height: 640)
        var out: [CGFloat?] = Array(repeating: nil, count: frameCount)
        let step = max(1, frameCount / 180)
        for i in stride(from: 0, to: frameCount, by: step) {
            let t = CMTime(value: CMTimeValue(i), timescale: CMTimeScale(max(1, frameCount)))
            // Better: use seconds
            _ = t
        }
        guard let duration = try? await asset.load(.duration), duration.seconds > 0 else { return out }
        let fps = Double(frameCount) / duration.seconds
        for i in stride(from: 0, to: frameCount, by: step) {
            let seconds = Double(i) / fps
            let time = CMTime(seconds: seconds, preferredTimescale: 600)
            guard let cg = try? gen.copyCGImage(at: time, actualTime: nil) else { continue }
            out[i] = ankleY(cg)
        }
        return out
    }

    private static func ankleY(_ image: CGImage) -> CGFloat? {
        let req = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try? handler.perform([req])
        guard let obs = req.results?.first else { return nil }
        let left = try? obs.recognizedPoint(.leftAnkle)
        let right = try? obs.recognizedPoint(.rightAnkle)
        let pts = [left, right].compactMap { p -> CGFloat? in
            guard let p, p.confidence > 0.2 else { return nil }
            return p.location.y
        }
        guard !pts.isEmpty else { return nil }
        return pts.min()
    }

    /// Vision Y crece hacia arriba. En el suelo el tobillo está más bajo (Y menor
    /// en coords de imagen… Vision usa bottom-left, y≈0 es abajo). En el aire y sube.
    private static func marks(from series: [CGFloat?]) -> (Int, Int)? {
        let filled: [(Int, CGFloat)] = series.enumerated().compactMap { i, v in
            guard let v else { return nil }
            return (i, v)
        }
        guard filled.count >= 6 else { return nil }
        let ys = filled.map(\.1)
        let floor = ys.sorted()[ys.count / 5]
        let air = floor + 0.08
        var takeoff: Int?
        var landing: Int?
        var airborne = false
        for (i, y) in filled {
            if !airborne, y > air {
                takeoff = i
                airborne = true
            } else if airborne, y <= air + 0.02 {
                landing = i
                break
            }
        }
        guard let t = takeoff, let l = landing, l > t else { return nil }
        return (max(0, t - 1), l)
    }
}
