import Foundation

// Chat attachment domain — PURE Foundation, no UIKit/AVFoundation, so it stays
// unit-testable. Everything device-facing (pickers, recorder, players, upload)
// lives in the sibling Chat/ files and speaks these types.
//
// Wire contract mirrored from the backend (single source of truth):
//   * kinds        → web/lib/chat/schema.ts  chatAttachmentKindSchema
//   * meta shape   → web/lib/chat/schema.ts  sendMessageSchema.attachment_meta
//   * size ceilings→ web/lib/chat/upload.ts  MAX_BYTES_BY_KIND
//   * allowed ext  → web/lib/chat/upload.ts  ALLOWED_KIND_TO_EXT
// Keep in sync if any of those change.

/// The four attachment kinds the chat supports end-to-end. Raw values ARE the
/// wire values (`voice|video|image|file`).
enum ChatAttachmentKind: String, Codable, CaseIterable, Equatable {
    case voice, image, video, file
}

/// Per-message attachment metadata. Mirrors `sendMessageSchema.attachment_meta`
/// and `MessageDTO.attachment_meta` — every field optional.
///
/// NO custom `CodingKeys` on purpose: the property names are camelCase so this
/// struct round-trips through BOTH coders the parent `ChatMessageDTO` uses — the
/// wire decoder (`convertFromSnakeCase`: `duration_ms`→`durationMs`) AND the
/// store's plain camelCase disk coder — exactly like the DTO it lives on
/// (see ChatService.swift). Adding CodingKeys here would break one of the two.
struct ChatAttachmentMeta: Codable, Equatable {
    var durationMs: Int?
    var sizeBytes: Int?
    var mimeType: String?
    var width: Int?
    var height: Int?

    var isEmpty: Bool {
        durationMs == nil && sizeBytes == nil && mimeType == nil && width == nil && height == nil
    }

    /// Duration in seconds when a `duration_ms` is present (voice / video). Nil
    /// when absent or non-positive.
    var durationSeconds: Double? {
        guard let ms = durationMs, ms > 0 else { return nil }
        return Double(ms) / 1000
    }

    /// Aspect ratio (w/h) when both dimensions are present and positive. Drives
    /// the image bubble's frame before the bytes are loaded.
    var aspectRatio: Double? {
        guard let w = width, let h = height, w > 0, h > 0 else { return nil }
        return Double(w) / Double(h)
    }
}

/// Client-side size ceilings, mirrored 1:1 from the server source of truth
/// (`web/lib/chat/upload.ts` `MAX_BYTES_BY_KIND`). We check BEFORE uploading so
/// the athlete gets an instant, friendly error instead of a wasted upload that
/// the server would only reject with a 413.
enum ChatAttachmentLimits {
    static let maxBytesByKind: [ChatAttachmentKind: Int] = [
        .voice: 25 * 1024 * 1024,   // 25 MB voice notes
        .video: 200 * 1024 * 1024,  // 200 MB video
        .image: 30 * 1024 * 1024,   // 30 MB image
        .file: 25 * 1024 * 1024,    // 25 MB file
    ]

    /// Fallback matches the server's `?? 25MB` default for an unknown kind.
    static func maxBytes(for kind: ChatAttachmentKind) -> Int {
        maxBytesByKind[kind] ?? 25 * 1024 * 1024
    }

    static func withinLimit(kind: ChatAttachmentKind, bytes: Int) -> Bool {
        bytes <= maxBytes(for: kind)
    }

    /// A friendly Castilian over-limit message naming the kind + the cap in MB.
    static func overLimitMessage(for kind: ChatAttachmentKind) -> String {
        let mb = maxBytes(for: kind) / (1024 * 1024)
        switch kind {
        case .voice: return "La nota de voz supera el límite de \(mb) MB. Graba una más corta."
        case .image: return "La imagen supera el límite de \(mb) MB. Prueba con otra."
        case .video: return "El vídeo supera el límite de \(mb) MB. Graba uno más corto o recórtalo."
        case .file:  return "El archivo supera el límite de \(mb) MB. Prueba con uno más ligero."
        }
    }
}

/// Where an attachment's bytes live. `localURL` (a just-captured/recorded/picked
/// temp file) wins for instant optimistic preview and is the upload + retry
/// source; `remoteURL` is the authenticated proxy URL on canonical messages,
/// loaded through `ChatMediaLoader` with the bearer.
struct ChatAttachmentSource: Equatable {
    var localURL: URL?
    var remoteURL: String?

    var hasContent: Bool { localURL != nil || remoteURL != nil }

    init(localURL: URL? = nil, remoteURL: String? = nil) {
        self.localURL = localURL
        self.remoteURL = remoteURL
    }
}

/// A normalized attachment the composer has produced (recorded / captured /
/// picked) and is about to upload + send. `localURL` holds the bytes on disk so
/// the upload streams from a file (never buffering a 200 MB video in memory) and
/// the optimistic bubble previews instantly; a failed send re-uses it to retry.
struct ChatPickedAttachment: Equatable {
    let kind: ChatAttachmentKind
    let localURL: URL
    let filename: String
    let mimeType: String
    let sizeBytes: Int
    var meta: ChatAttachmentMeta
}

/// Extension / MIME / kind inference against the server's allowed sets. Pure so
/// the mapping is unit-tested; UTType-based inference lives in the pickers.
enum ChatAttachmentInfer {
    /// The kind the server would file an extension under, or nil when it isn't
    /// an allowed extension for any kind.
    static func kind(forExtension ext: String) -> ChatAttachmentKind? {
        switch ext.lowercased() {
        case "m4a", "aac", "mp3", "wav": return .voice
        case "mp4", "mov", "m4v": return .video
        case "jpg", "jpeg", "png", "heic", "webp": return .image
        case "pdf", "txt", "md", "docx": return .file
        default: return nil
        }
    }

    /// Lower-cased path extension of a proxy/attachment URL string (the stored
    /// name is `<uuid>.<ext>`), or nil when absent.
    static func fileExtension(fromURLString s: String?) -> String? {
        guard let s, let url = URL(string: s) else { return nil }
        let ext = url.pathExtension
        return ext.isEmpty ? nil : ext.lowercased()
    }

    /// A human file label for a RECEIVED file attachment. The backend `meta`
    /// carries no original filename (only the `<uuid>.<ext>` in the URL), so we
    /// show the type: "Archivo PDF" / "Archivo DOCX", or a neutral fallback.
    static func receivedFileName(remoteURLString: String?) -> String {
        if let ext = fileExtension(fromURLString: remoteURLString) {
            return "Archivo \(ext.uppercased())"
        }
        return "Archivo"
    }
}

/// A compact byte-size label ("1,2 MB") in the device locale. Used by file +
/// document bubbles.
enum ByteCountLabel {
    static func format(_ bytes: Int) -> String {
        let f = ByteCountFormatter()
        f.countStyle = .file
        f.allowedUnits = [.useKB, .useMB, .useGB]
        return f.string(fromByteCount: Int64(max(0, bytes)))
    }
}

/// A whole-second `m:ss` duration label for voice / video ("0:42"). Shared by
/// the recorder, the preview and the playback bubble so they never drift.
enum DurationLabel {
    static func mmss(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
