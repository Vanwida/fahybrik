import SwiftUI
import UIKit

// LA SALIDA DE LA TARJETA — el PNG y sus dos caminos.
//
// El PNG es una PEGATINA: la tarjeta sola, con transparencia alrededor. El
// vídeo lo elige el atleta DENTRO de Instagram; no tocamos su cámara ni su
// carrete, ni exportamos ningún vídeo.
//
// Camino 1 — Instagram directo, por SU contrato oficial (verificado el 24-ago
// contra developers.facebook.com/docs/instagram-platform/sharing-to-stories):
// la imagen viaja por el portapapeles con la clave
// `com.instagram.sharedSticker.stickerImage` (caducidad 5 min, la que su doc
// recomienda) y se abre `instagram-stories://share?source_application=<APP_ID>`.
// El App ID de Meta es OBLIGATORIO en su contrato y es una cuenta que solo
// Alex puede crear: se lee del Info.plist (`MetaAppID`) y mientras esté vacío
// este camino NO se ofrece — nunca un botón que abre Instagram para nada.
//
// Camino 2 — el compartir del sistema, siempre: el mismo PNG por la hoja de
// iOS (WhatsApp, guardar, y también Instagram con un toque más).

enum CompartirService {

    // MARK: - El PNG

    /// La tarjeta a PNG de pegatina. ×2 sobre los 700 pt de diseño → 1400 px de
    /// ancho, nítido en cualquier story. Transparente alrededor: es lo que hace
    /// que Instagram la trate como pegatina y no como foto a pantalla completa.
    @MainActor
    static func png(de tarjeta: TarjetaCompartible, marca: MarcaCartel) -> UIImage? {
        let renderer = ImageRenderer(content: TarjetaCompartibleView(tarjeta: tarjeta, marca: marca))
        renderer.scale = 2
        renderer.isOpaque = false
        return renderer.uiImage
    }

    /// El PNG escrito a un fichero temporal, para la hoja del sistema.
    @MainActor
    static func pngURL(de tarjeta: TarjetaCompartible, marca: MarcaCartel) -> URL? {
        guard let imagen = png(de: tarjeta, marca: marca), let datos = imagen.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("entreno-\(UUID().uuidString).png")
        do {
            try datos.write(to: url, options: [.atomic])
            return url
        } catch {
            return nil
        }
    }

    // MARK: - Instagram

    /// El App ID de Meta que exige `source_application`. Configuración, no
    /// código: vive en el Info.plist y hoy está vacío — al rellenarlo, el botón
    /// directo aparece solo, sin tocar Swift.
    static var metaAppID: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "MetaAppID") as? String,
              !id.isEmpty else { return nil }
        return id
    }

    @MainActor
    static var instagramDisponible: Bool {
        guard metaAppID != nil, let url = URL(string: "instagram-stories://share") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    /// Entrega la pegatina a Instagram y lo abre en su editor de stories.
    /// Devuelve false si el contrato no se pudo cumplir (sin App ID, sin app).
    @MainActor
    @discardableResult
    static func abrirInstagram(con tarjeta: TarjetaCompartible, marca: MarcaCartel) -> Bool {
        guard let appID = metaAppID,
              let url = URL(string: "instagram-stories://share?source_application=\(appID)"),
              UIApplication.shared.canOpenURL(url),
              let png = png(de: tarjeta, marca: marca)?.pngData()
        else { return false }

        UIPasteboard.general.setItems(
            [["com.instagram.sharedSticker.stickerImage": png]],
            options: [.expirationDate: Date().addingTimeInterval(60 * 5)]
        )
        UIApplication.shared.open(url)
        return true
    }
}
