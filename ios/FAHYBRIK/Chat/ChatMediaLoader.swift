import UIKit
import UniformTypeIdentifiers

// Loads media that lives behind our own AUTHENTICATED endpoints: los adjuntos del
// chat (`/api/chat/attachments/...`). Pide con bearer, sigue el redirect y acaba en
// un fichero local.
//
// El vídeo de técnica que sube el entrenador YA NO pasa por aquí: vive en Cloudflare
// Stream, se reproduce como HLS sin credencial y sin descargarlo entero
// (`VideoStreamPlayer`). Cuando el fichero era nuestro sí compartían este camino.
//
// Esos endpoints requieren el bearer del atleta y, in production, 302-redirect to
// a short-lived signed blob URL (in dev they stream the bytes directly). A plain
// `AsyncImage` / `AVPlayer(url:)` sends NO Authorization header and would get 401
// — so every REMOTE file is fetched here with the bearer. URLSession follows the
// redirect automatically; the signed target is pre-authenticated, so it resolves
// whether or not the header survives the cross-host hop.
//
// Caching: decoded images are held in an NSCache (cost = byte size, auto-evicted
// under memory pressure); voice / video / file bytes are materialised to a temp
// file (AVAudioPlayer, AVPlayer and QLPreviewController all need a local URL).
// In-flight requests for the same URL are de-duped so a row re-appearing on
// scroll never double-downloads.

enum ChatMediaError: Error {
    case badURL
    case http(Int)
    case notAnImage
    case noBearer
}

actor ChatMediaLoader {
    static let shared = ChatMediaLoader()

    private let imageCache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        // ~64 MB of decoded images before eviction — a chat never shows many at
        // once, and NSCache also purges on memory warnings.
        c.totalCostLimit = 64 * 1024 * 1024
        return c
    }()

    private var fileCache: [String: URL] = [:]
    private var imageTasks: [String: Task<UIImage, Error>] = [:]
    private var fileTasks: [String: Task<URL, Error>] = [:]

    /// Decoded image for a remote proxy URL, cached + in-flight-deduped.
    func image(remoteURL: String, bearer: String) async throws -> UIImage {
        if let hit = imageCache.object(forKey: remoteURL as NSString) { return hit }
        if let running = imageTasks[remoteURL] { return try await running.value }

        let task = Task<UIImage, Error> {
            let (data, _) = try await Self.fetchBytes(remoteURL, bearer: bearer)
            guard let img = UIImage(data: data) else { throw ChatMediaError.notAnImage }
            return img
        }
        imageTasks[remoteURL] = task
        defer { imageTasks[remoteURL] = nil }
        let img = try await task.value
        imageCache.setObject(img, forKey: remoteURL as NSString, cost: img.byteCost)
        return img
    }

    /// A LOCAL file URL for a remote attachment, downloaded once and cached. The
    /// temp file keeps the URL's extension so AVFoundation / QuickLook infer the
    /// type correctly.
    func localFile(remoteURL: String, bearer: String) async throws -> URL {
        if let hit = fileCache[remoteURL], FileManager.default.fileExists(atPath: hit.path) {
            return hit
        }
        if let running = fileTasks[remoteURL] { return try await running.value }

        let task = Task<URL, Error> {
            let (data, mime) = try await Self.fetchBytes(remoteURL, bearer: bearer)
            let ext = Self.fileExtension(remoteURL: remoteURL, mime: mime)
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("media-\(UUID().uuidString).\(ext)")
            try data.write(to: dest, options: .atomic)
            return dest
        }
        fileTasks[remoteURL] = task
        defer { fileTasks[remoteURL] = nil }
        let url = try await task.value
        fileCache[remoteURL] = url
        return url
    }

    // MARK: - Seeding (avoid re-downloading what we just uploaded)

    /// After the athlete uploads an attachment, map its remote proxy URL to the
    /// LOCAL temp file we already have, so when the server echoes the message the
    /// bubble resolves instantly instead of downloading its own bytes back.
    func seedLocalFile(remoteURL: String, localFileURL: URL) {
        fileCache[remoteURL] = localFileURL
    }

    /// Same idea for images — seed the decoded image cache.
    func seedImage(remoteURL: String, image: UIImage) {
        imageCache.setObject(image, forKey: remoteURL as NSString, cost: image.byteCost)
    }

    /// La extensión del fichero temporal. AVFoundation y QuickLook deducen el tipo
    /// POR LA EXTENSIÓN, así que este dato decide si el vídeo se reproduce o no.
    ///
    /// Un adjunto de chat la trae en la URL (`<uuid>.mp4`), pero una ruta de API no
    /// lleva ninguna: ahí manda el `Content-Type` de la respuesta. Sin ninguna de las
    /// dos, `bin` (y que lo intente el sistema).
    private static func fileExtension(remoteURL: String, mime: String?) -> String {
        if let ext = ChatAttachmentInfer.fileExtension(fromURLString: remoteURL) { return ext }
        // El header puede venir con parámetros ("video/mp4; charset=..."): sólo el tipo.
        guard let mime, let head = mime.split(separator: ";").first else { return "bin" }
        let tipo = String(head).trimmingCharacters(in: .whitespaces)
        return UTType(mimeType: tipo)?.preferredFilenameExtension ?? "bin"
    }

    // MARK: - Raw authenticated fetch

    /// GET the proxy URL with the bearer, following the redirect to the signed
    /// blob (prod) or reading the streamed bytes (dev). Returns bytes + the
    /// response MIME.
    private static func fetchBytes(_ remoteURL: String, bearer: String) async throws -> (Data, String?) {
        guard let url = URL(string: remoteURL) else { throw ChatMediaError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.setValue("*/*", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw ChatMediaError.http(-1) }
        guard (200..<300).contains(http.statusCode) else { throw ChatMediaError.http(http.statusCode) }
        return (data, http.value(forHTTPHeaderField: "Content-Type"))
    }
}

private extension UIImage {
    /// Rough decoded byte cost for NSCache accounting (4 bytes / px).
    var byteCost: Int {
        let px = Int(size.width * scale * size.height * scale)
        return max(1, px * 4)
    }
}
