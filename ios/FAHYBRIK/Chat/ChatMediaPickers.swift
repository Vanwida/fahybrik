import SwiftUI
import UIKit
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

// The composer's media sources. Each picker normalises whatever the user
// captures/picks into a single `ChatPickedAttachment` (a temp file on disk +
// kind/mime/size/meta) so the send path is uniform and the upload streams from
// the file. Camera photo/video use UIImagePickerController; the gallery uses
// PHPickerViewController; documents use UIDocumentPickerViewController. All three
// hand back through a completion; normalisation (JPEG re-encode, video duration,
// security-scoped copy) happens off the main actor.

// MARK: - Normalisation helpers

enum ChatMediaImport {
    /// Bounded JPEG re-encode (orientation-normalised, ≤ ~2600px longest side) so
    /// camera + library images upload small and consistent, well under the 30 MB
    /// image cap. Writes to a temp file; returns the attachment.
    static func imageAttachment(from ui: UIImage) throws -> ChatPickedAttachment {
        let normalized = boundedJPEGImage(ui)
        guard let data = normalized.jpegData(compressionQuality: 0.85) else {
            throw ChatMediaImportError.encodeFailed
        }
        let name = "foto-\(Self.stamp()).jpg"
        let url = try writeTemp(data, ext: "jpg")
        let px = normalized.pixelSize
        var meta = ChatAttachmentMeta()
        meta.sizeBytes = data.count
        meta.mimeType = "image/jpeg"
        meta.width = px.width
        meta.height = px.height
        return ChatPickedAttachment(
            kind: .image, localURL: url, filename: name,
            mimeType: "image/jpeg", sizeBytes: data.count, meta: meta
        )
    }

    /// Copies a captured/picked movie into our temp dir and reads its real
    /// duration. The extension is preserved (mov/mp4) for correct playback + MIME.
    static func videoAttachment(fromFileURL src: URL, securityScoped: Bool) async throws -> ChatPickedAttachment {
        let ext = src.pathExtension.isEmpty ? "mov" : src.pathExtension.lowercased()
        let dest = try copyToTemp(src, ext: ext, securityScoped: securityScoped)
        let size = fileSize(dest)
        let mime = UTType(filenameExtension: ext)?.preferredMIMEType ?? "video/quicktime"

        var meta = ChatAttachmentMeta()
        meta.sizeBytes = size
        meta.mimeType = mime
        if let seconds = try? await videoDurationSeconds(dest), seconds > 0 {
            meta.durationMs = Int((seconds * 1000).rounded())
        }
        return ChatPickedAttachment(
            kind: .video, localURL: dest, filename: "video-\(Self.stamp()).\(ext)",
            mimeType: mime, sizeBytes: size, meta: meta
        )
    }

    /// Copies a document the user opened (security-scoped) into temp. The kind is
    /// derived from the extension; anything the server wouldn't accept is rejected
    /// early with a friendly error.
    static func fileAttachment(fromSecurityScopedURL src: URL) throws -> ChatPickedAttachment {
        let ext = src.pathExtension.lowercased()
        guard ChatAttachmentInfer.kind(forExtension: ext) == .file else {
            throw ChatMediaImportError.unsupportedType
        }
        let dest = try copyToTemp(src, ext: ext, securityScoped: true)
        let size = fileSize(dest)
        let mime = UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        var meta = ChatAttachmentMeta()
        meta.sizeBytes = size
        meta.mimeType = mime
        return ChatPickedAttachment(
            kind: .file, localURL: dest, filename: src.lastPathComponent,
            mimeType: mime, sizeBytes: size, meta: meta
        )
    }

    /// Normalise one PHPicker result — a video if it carries a movie type, else
    /// an image.
    static func attachment(from result: PHPickerResult) async throws -> ChatPickedAttachment {
        let provider = result.itemProvider
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            let src = try await loadFileRepresentation(provider, typeIdentifier: UTType.movie.identifier)
            return try await videoAttachment(fromFileURL: src, securityScoped: false)
        }
        // Image: load a UIImage (orientation-aware) then re-encode.
        let ui = try await loadImage(provider)
        return try imageAttachment(from: ui)
    }

    // MARK: file / temp plumbing

    private static func writeTemp(_ data: Data, ext: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("chat-out-\(UUID().uuidString).\(ext)")
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func copyToTemp(_ src: URL, ext: String, securityScoped: Bool) throws -> URL {
        let needsStop = securityScoped && src.startAccessingSecurityScopedResource()
        defer { if needsStop { src.stopAccessingSecurityScopedResource() } }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("chat-out-\(UUID().uuidString).\(ext)")
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: src, to: dest)
        return dest
    }

    private static func fileSize(_ url: URL) -> Int {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }

    private static func videoDurationSeconds(_ url: URL) async throws -> Double {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return CMTimeGetSeconds(duration)
    }

    private static func stamp() -> String {
        String(Int(Date().timeIntervalSince1970))
    }

    private static func boundedJPEGImage(_ ui: UIImage) -> UIImage {
        let maxDim: CGFloat = 2600
        let longest = max(ui.size.width, ui.size.height)
        guard longest > maxDim else {
            // Still redraw to bake in orientation → upright pixels.
            return redraw(ui, size: ui.size)
        }
        let scale = maxDim / longest
        return redraw(ui, size: CGSize(width: ui.size.width * scale, height: ui.size.height * scale))
    }

    private static func redraw(_ ui: UIImage, size: CGSize) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            ui.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    // MARK: NSItemProvider async bridges

    private static func loadImage(_ provider: NSItemProvider) async throws -> UIImage {
        guard provider.canLoadObject(ofClass: UIImage.self) else {
            throw ChatMediaImportError.unsupportedType
        }
        return try await withCheckedThrowingContinuation { cont in
            provider.loadObject(ofClass: UIImage.self) { obj, err in
                if let img = obj as? UIImage { cont.resume(returning: img) }
                else { cont.resume(throwing: err ?? ChatMediaImportError.encodeFailed) }
            }
        }
    }

    private static func loadFileRepresentation(_ provider: NSItemProvider, typeIdentifier: String) async throws -> URL {
        // The provided URL is deleted when the completion returns, so copy it out
        // synchronously inside the callback before resuming.
        try await withCheckedThrowingContinuation { cont in
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, err in
                guard let url else { cont.resume(throwing: err ?? ChatMediaImportError.encodeFailed); return }
                let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent("chat-in-\(UUID().uuidString).\(ext)")
                do {
                    try FileManager.default.copyItem(at: url, to: dest)
                    cont.resume(returning: dest)
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }
}

enum ChatMediaImportError: Error { case encodeFailed, unsupportedType }

private extension UIImage {
    var pixelSize: (width: Int, height: Int) {
        (Int(size.width * scale), Int(size.height * scale))
    }
}

// MARK: - Camera (photo or video) — UIImagePickerController

/// Camera capture restricted to a single media kind. `.photo` returns a
/// re-encoded JPEG attachment; `.video` returns the recorded movie.
struct ChatCameraPicker: UIViewControllerRepresentable {
    enum Mode { case photo, video }
    let mode: Mode
    let onPicked: (ChatPickedAttachment) -> Void
    let onCancel: () -> Void
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        switch mode {
        case .photo:
            p.mediaTypes = [UTType.image.identifier]
            p.cameraCaptureMode = .photo
        case .video:
            p.mediaTypes = [UTType.movie.identifier]
            p.cameraCaptureMode = .video
            p.videoQuality = .typeHigh
        }
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ChatCameraPicker
        init(_ parent: ChatCameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let movie = info[.mediaURL] as? URL {
                Task {
                    do {
                        let att = try await ChatMediaImport.videoAttachment(fromFileURL: movie, securityScoped: false)
                        await MainActor.run { self.parent.onPicked(att) }
                    } catch {
                        await MainActor.run { self.parent.onError("No pudimos preparar el vídeo. Inténtalo de nuevo.") }
                    }
                }
                return
            }
            if let ui = info[.originalImage] as? UIImage {
                do {
                    let att = try ChatMediaImport.imageAttachment(from: ui)
                    parent.onPicked(att)
                } catch {
                    parent.onError("No pudimos preparar la foto. Inténtalo de nuevo.")
                }
                return
            }
            parent.onCancel()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onCancel() }
    }
}

// MARK: - Gallery (photo or video) — PHPickerViewController

struct ChatMediaLibraryPicker: UIViewControllerRepresentable {
    let onPicked: (ChatPickedAttachment) -> Void
    let onCancel: () -> Void
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .any(of: [.images, .videos])
        config.selectionLimit = 1
        config.preferredAssetRepresentationMode = .current
        let vc = PHPickerViewController(configuration: config)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: PHPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: ChatMediaLibraryPicker
        init(_ parent: ChatMediaLibraryPicker) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let result = results.first else { parent.onCancel(); return }
            Task {
                do {
                    let att = try await ChatMediaImport.attachment(from: result)
                    await MainActor.run { self.parent.onPicked(att) }
                } catch {
                    await MainActor.run { self.parent.onError("No pudimos preparar el archivo. Prueba con otro.") }
                }
            }
        }
    }
}

// MARK: - Documents — UIDocumentPickerViewController

struct ChatDocumentPicker: UIViewControllerRepresentable {
    let onPicked: (ChatPickedAttachment) -> Void
    let onCancel: () -> Void
    let onError: (String) -> Void

    /// The server accepts pdf, txt, md, docx. We offer those content types; the
    /// extension guard in `fileAttachment` is the backstop.
    private var contentTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText]
        if let md = UTType(filenameExtension: "md") { types.append(md) }
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        return types
    }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let vc = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes, asCopy: true)
        vc.allowsMultipleSelection = false
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let parent: ChatDocumentPicker
        init(_ parent: ChatDocumentPicker) { self.parent = parent }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let src = urls.first else { parent.onCancel(); return }
            do {
                // asCopy:true hands us an app-owned copy — no security scope needed,
                // but guard defensively.
                let att = try ChatMediaImport.fileAttachment(fromSecurityScopedURL: src)
                parent.onPicked(att)
            } catch ChatMediaImportError.unsupportedType {
                parent.onError("Ese tipo de archivo no se admite. Usa PDF, TXT, MD o DOCX.")
            } catch {
                parent.onError("No pudimos preparar el archivo. Inténtalo de nuevo.")
            }
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { parent.onCancel() }
    }
}
