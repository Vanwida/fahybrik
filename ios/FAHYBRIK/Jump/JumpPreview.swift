import AVFoundation
import SwiftUI

struct JumpCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        uiView.preview.session = session
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}

struct JumpFramePreview: View {
    let url: URL
    let frame: Int
    let fps: Double
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Color.black.overlay { ProgressView().tint(.white) }
            }
        }
        .task(id: frame) { image = await Self.image(url: url, frame: frame, fps: fps) }
    }

    private static func image(url: URL, frame: Int, fps: Double) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.requestedTimeToleranceBefore = .zero
        gen.requestedTimeToleranceAfter = .zero
        let seconds = fps > 0 ? Double(frame) / fps : 0
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        return await Task.detached {
            guard let cg = try? gen.copyCGImage(at: time, actualTime: nil) else { return nil }
            return UIImage(cgImage: cg)
        }.value
    }
}
