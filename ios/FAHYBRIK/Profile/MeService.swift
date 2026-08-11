import Foundation
import UIKit

// Athlete identity from GET /api/auth/me. This is the canonical source for
// the athlete's name, body metrics and training context — the screens that
// used to render the hardcoded "Marc Vidal" persona now hydrate from here.
//
// APIClient's decoder uses `convertFromSnakeCase`, so the snake_case wire
// fields map to these camelCase properties automatically.

struct AthleteIdentity: Codable {
    let id: String
    /// AUDIT-B3 — a null/absent full_name degrades to "" (the greeting falls back)
    /// instead of throwing the whole /auth/me identity.
    @DefaultEmptyString var fullName: String
    let dob: String?
    let sex: String?
    let heightCm: Double?
    let weightKg: Double?
    let bodyFatPct: Double?
    let trainingExperienceYears: Double?
    let primaryDiscipline: String?
    let trainingDaysPerWeek: Int?
    let onboardedAt: String?
    // Profile-edit fields — optional so existing /me responses decode cleanly
    // before the backend includes these keys.
    let goalType: String?
    let goalOtherText: String?
    let preferredLanguage: String?
    /// Measured/entered max HR (bpm) — the athlete's personal FCmáx. Set ONLY via
    /// the profile editor (the sole entry point; the onboarding threshold value is
    /// discarded, never persisted here). Optional so older /me responses (before the
    /// backend returned `max_hr_bpm`, mig 0129) decode cleanly.
    ///
    /// It is an INPUT the server uses to derive the threshold when nothing better
    /// exists. The app does NOT turn it into zones — see `hrZones`.
    let maxHrBpm: Int?

    /// The athlete's five HR zones, RESOLVED BY THE SERVER (`hr_zones`).
    ///
    /// The single input every HR-zone surface reads: the live engine, the
    /// treadmill/outdoor HUDs, the watch encoder and the post-workout desglose.
    /// Nil means the athlete has no zones yet (nothing anchors them) — surfaces
    /// say so and offer the threshold test. Nil is NOT a reason to invent one:
    /// that is precisely the bug this field replaced.
    let hrZones: HRZoneProfile?

    /// La foto de perfil del atleta (`avatar_url`), tal y como la devuelve el
    /// servidor. Nil = todavía no hay foto, y el avatar sigue pintando iniciales
    /// (o la silueta si tampoco hay nombre) — exactamente como hasta ahora.
    ///
    /// Opcional a propósito: las respuestas de /auth/me anteriores a la foto, y
    /// el caché en disco de esas respuestas, tienen que seguir decodificando.
    let avatarUrl: String?

    /// La foto ya resuelta contra la base de la API. El servidor puede servirla
    /// como ruta o ya absoluta (`APIBase.absoluta`), y quien la pinta no puede
    /// tener que saber cuál le tocó. Nil también cuando llega vacía.
    var avatarURLResuelta: String? { APIBase.absoluta(avatarUrl) }

    /// Las iniciales del avatar. VACÍA cuando todavía no hay nombre: no hay
    /// iniciales que enseñar, y un guion dentro de un círculo no es un dato del
    /// atleta (§7). Es el estado que `CoachAvatar` ya resuelve con la silueta.
    var initials: String {
        let parts = fullName
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first }
            .map(String.init)
        return parts.joined().uppercased()
    }

    /// Whole-years age derived from `dob` (YYYY-MM-DD). Nil when dob is absent
    /// or unparseable — we never guess.
    var age: Int? {
        guard let dob else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"
        guard let date = fmt.date(from: dob) else { return nil }
        let comps = Calendar.current.dateComponents([.year], from: date, to: Date())
        return comps.year
    }

}

struct MeResponse: Decodable {
    let athlete: AthleteIdentity
}

enum MeService {
    static func fetch(bearer: String) async throws -> AthleteIdentity {
        let resp: MeResponse = try await APIClient.shared.get(path: "api/auth/me", bearer: bearer)
        return resp.athlete
    }
}

// MARK: - Profile update

// Request body for PATCH api/athlete/profile. Keys are camelCase here; the
// APIClient encoder converts them to snake_case automatically. Nil fields are
// omitted from the JSON body (Swift's default JSONEncoder behaviour), which is
// the intended wire contract — omit to leave/clear.
struct ProfileUpdate: Encodable {
    var fullName: String
    var dob: String?
    var sex: String?
    var heightCm: Double?
    var weightKg: Double?
    var trainingExperienceYears: Double?
    var goalType: String?
    var goalOtherText: String?
    var preferredLanguage: String?
    /// Personal measured max HR (bpm). Encodes to `max_hr_bpm`. Nil is omitted
    /// (leaves the stored value untouched); a value sets it.
    var maxHrBpm: Int?
}

enum ProfileService {
    static func update(bearer: String, body: ProfileUpdate) async throws -> AthleteIdentity {
        let resp: MeResponse = try await APIClient.shared.patch(
            path: "api/athlete/profile",
            body: body,
            bearer: bearer
        )
        return resp.athlete
    }
}

// MARK: - Foto de perfil
//
// El atleta se pone su cara donde hoy hay iniciales. Los bytes NO viajan por
// nuestra API: el servidor firma un destino de un solo uso, el móvil sube la
// imagen DIRECTO ahí, y después le pide al servidor que la verifique y la
// guarde en el perfil. Tres pasos, y cada uno con su estado en la pantalla:
//
//   1. POST   api/perfil/foto/subida     → { upload_url, image_id, expires_at }
//   2. POST   multipart (campo `file`)   → upload_url        (directo al almacén)
//   3. POST   api/perfil/foto/confirmar  → { image_id }
//   ·  DELETE api/perfil/foto            → la quita
//
// El destino se pide en el momento de GUARDAR, nunca al elegir la foto: la URL
// es efímera, y así no puede caducar mientras el atleta mira la previsualización.
// Por eso `expires_at` no se lee — la ventana entre firmarla y usarla es de
// segundos, no de minutos.
//
// Ningún paso vale como "guardada" por sí solo: subir bytes es una cosa y que el
// servidor los dé por buenos es otra. La UI cuenta las dos por separado
// (`AthletePhotoStep`) y solo canta "hecho" cuando vuelve el perfil ya con la
// foto dentro.

/// Cómo se prepara la foto ANTES de salir del móvil.
enum AthletePhotoImage {
    /// Lado mayor, en píxeles, al que se reduce la foto antes de subirla.
    ///
    /// El avatar se pinta como mucho a 60 pt, que en una pantalla @3x son unos
    /// 180 px; 512 cubre eso y cualquier superficie mayor (el panel del
    /// entrenador, una ficha ampliada) con margen de sobra. Una foto de iPhone
    /// son 3-5 MB y ~4000 px de lado: mandarla entera sería gastar los megas del
    /// atleta para acabar pintando un círculo.
    static let maxDimensionPx: CGFloat = 512

    /// Calidad del JPEG recomprimido. A 512 px, 0,85 es donde el JPEG deja de
    /// notarse comprimido y el fichero sigue pesando decenas de KB.
    static let jpegQuality: CGFloat = 0.85

    /// Reduce y recomprime. Nil solo si el recomprimido falla.
    ///
    /// Redibuja SIEMPRE, aunque la foto ya quepa: es lo que hornea la
    /// orientación EXIF en los píxeles. Sin ese paso, una foto hecha girando el
    /// teléfono llega tumbada al servidor. (El chat hace lo mismo con su propio
    /// límite, mucho más alto porque allí la foto se mira entera.)
    static func jpegParaSubir(_ image: UIImage) -> Data? {
        redibujadaDentroDelLimite(image).jpegData(compressionQuality: jpegQuality)
    }

    /// Igual, partiendo de los bytes que entrega el selector de fotos. Pensada
    /// para llamarse FUERA del hilo principal: decodificar una foto de 12 MP y
    /// redibujarla cuesta lo suyo, y `Data` sí se puede cruzar de contexto.
    static func jpegParaSubir(desde data: Data) -> Data? {
        UIImage(data: data).flatMap(jpegParaSubir)
    }

    private static func redibujadaDentroDelLimite(_ image: UIImage) -> UIImage {
        // El tamaño real en PÍXELES: `size` viene en puntos, y una imagen con
        // escala 2 o 3 tiene el doble o el triple de píxeles de lo que declara.
        let pixeles = CGSize(width: image.size.width * image.scale,
                             height: image.size.height * image.scale)
        let ladoMayor = max(pixeles.width, pixeles.height)
        let factor = ladoMayor > maxDimensionPx ? maxDimensionPx / ladoMayor : 1
        let destino = CGSize(width: max(1, (pixeles.width * factor).rounded()),
                             height: max(1, (pixeles.height * factor).rounded()))

        let formato = UIGraphicsImageRendererFormat.default()
        formato.scale = 1     // el tamaño que pedimos ES el tamaño en píxeles
        formato.opaque = true // un avatar no necesita canal alfa
        return UIGraphicsImageRenderer(size: destino, format: formato).image { _ in
            image.draw(in: CGRect(origin: .zero, size: destino))
        }
    }
}

/// Los pasos que la pantalla tiene que poder contar por separado.
enum AthletePhotoStep: Equatable {
    /// Bytes en camino al almacén, de 0 a 1.
    case subiendo(Double)
    /// Bytes entregados; el servidor está verificando y guardando.
    case guardando
}

enum AthletePhotoError: Error {
    case noSePudoPreparar
    case destinoInvalido

    /// Lo que ve el atleta. Sin jerga y con salida: qué ha pasado y qué hacer.
    var mensaje: String {
        switch self {
        case .noSePudoPreparar: return "No pudimos preparar esa foto. Prueba con otra."
        case .destinoInvalido:  return "No pudimos preparar la subida. Inténtalo de nuevo."
        }
    }
}

/// Destino de un solo uso que firma el servidor.
private struct AthletePhotoUploadTarget: Decodable {
    let uploadUrl: String
    let imageId: String
}

/// Cuerpo del confirmar. El encoder de APIClient lo pasa a `image_id`.
private struct AthletePhotoConfirmBody: Encodable {
    let imageId: String
}

enum AthletePhotoService {
    private static let subidaPath = "api/perfil/foto/subida"
    private static let confirmarPath = "api/perfil/foto/confirmar"
    private static let fotoPath = "api/perfil/foto"

    /// Nombre del fichero que anunciamos al almacén. No lo elige el atleta ni
    /// viaja el nombre original de su carrete: no aporta nada y es un dato suyo.
    private static let nombreDeFichero = "foto-perfil.jpg"

    /// Sube la foto y la deja guardada en el perfil.
    ///
    /// Devuelve la identidad RECIÉN LEÍDA del servidor, no lo que respondiera el
    /// confirmar: lo que pinta la app tiene que ser siempre lo que el servidor
    /// tiene guardado, y así el contrato de esta llamada no depende de la forma
    /// exacta de esa respuesta.
    /// El avance llega SIEMPRE en el hilo principal: quien lo pinta no tiene por
    /// qué saber que el contador de bytes vive en la cola de URLSession.
    static func subir(
        bearer: String,
        jpeg: Data,
        onStep: @escaping @MainActor (AthletePhotoStep) -> Void
    ) async throws -> AthleteIdentity {
        let destino: AthletePhotoUploadTarget = try await APIClient.shared.post(
            path: subidaPath,
            body: Empty(),
            bearer: bearer
        )
        guard let url = URL(string: destino.uploadUrl) else {
            throw AthletePhotoError.destinoInvalido
        }

        await onStep(.subiendo(0))
        try await subirBytes(a: url, jpeg: jpeg) { avance in
            Task { @MainActor in onStep(.subiendo(avance)) }
        }

        await onStep(.guardando)
        let _: Empty = try await APIClient.shared.post(
            path: confirmarPath,
            body: AthletePhotoConfirmBody(imageId: destino.imageId),
            bearer: bearer
        )
        return try await MeService.fetch(bearer: bearer)
    }

    /// Quita la foto. Devuelve la identidad ya sin ella.
    static func quitar(bearer: String) async throws -> AthleteIdentity {
        let _: Empty = try await APIClient.shared.delete(
            path: fotoPath,
            body: Optional<Empty>.none,
            bearer: bearer
        )
        return try await MeService.fetch(bearer: bearer)
    }

    /// El motivo, en castellano, de por qué no se pudo. La pantalla nunca enseña
    /// un error crudo, y tampoco uno genérico: el atleta tiene que saber si es su
    /// conexión, su foto o nosotros.
    static func motivo(_ error: Error) -> String {
        if let propio = error as? AthletePhotoError { return propio.mensaje }
        guard let api = error as? APIError else {
            return "No pudimos guardar la foto. Inténtalo de nuevo."
        }
        switch api {
        case .offline:
            return "Sin conexión. Vuelve a intentarlo cuando tengas red."
        case .http(let status, _) where status == 413:
            return "Esa foto pesa demasiado. Prueba con otra."
        case .http(let status, _) where status == 415:
            return "Ese formato de imagen no vale. Prueba con otra foto."
        case .http(let status, _) where (400..<500).contains(status):
            return "No pudimos guardar esa foto. Prueba con otra."
        case .http:
            return "No pudimos guardar la foto ahora mismo. Inténtalo en un momento."
        case .invalidResponse, .decoding:
            return "No pudimos guardar la foto. Inténtalo de nuevo."
        }
    }

    /// El POST va DIRECTO al almacén: sin nuestro bearer (la URL ya viene
    /// firmada y es de un solo uso) y con el campo `file`, que es el que espera.
    private static func subirBytes(
        a url: URL,
        jpeg: Data,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let cuerpo = APIClient.multipartBody(
            boundary: boundary,
            fieldName: "file",
            filename: nombreDeFichero,
            mimeType: "image/jpeg",
            fileData: jpeg
        )
        let (data, resp) = try await URLSession.shared.upload(
            for: req,
            from: cuerpo,
            delegate: AthletePhotoUploadProgress(onProgress: onProgress)
        )
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
    }
}

/// Cuenta los bytes que salen. Sin este delegado la barra sería decorativa:
/// `upload(for:from:)` no informa del avance por sí solo.
private final class AthletePhotoUploadProgress: NSObject, URLSessionTaskDelegate {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
    }
}
