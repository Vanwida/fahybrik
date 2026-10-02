import Foundation

// EL PÓSTER DE UN VÍDEO DE TÉCNICA — la imagen fija que lo anuncia en una miniatura, sin descargar el vídeo.
//
// Sale del MISMO localizador que decide si hay vídeo (`VideoDeTecnica`), así que una miniatura nunca pide una
// imagen a un dominio que el reproductor no aceptaría. Sin red o sin imagen, quien la pinta cae a su loseta.

extension VideoDeTecnica {

    /// La imagen del vídeo: la que YouTube da a 320 × 180 y la que Cloudflare Stream genera en el instante inicial.
    var urlDelPoster: URL? {
        switch self {
        case .youtube(let video):
            return URL(string: "https://img.youtube.com/vi/\(video.id)/mqdefault.jpg")
        case .stream(let manifiesto):
            // `…/<uid>/manifest/video.m3u8` → `…/<uid>/thumbnails/thumbnail.jpg`: mismo vídeo, mismo host ya validado.
            return manifiesto
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("thumbnails")
                .appendingPathComponent("thumbnail.jpg")
        }
    }
}
