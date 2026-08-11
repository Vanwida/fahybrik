import XCTest
import UIKit
@testable import FAHYBRIK

// La foto de perfil del atleta, por sus dos costuras: lo que sale del móvil y lo
// que entra del servidor.
//
// Lo que sale: una foto de iPhone son varios megas y ~4000 px de lado, y aquí
// acaba dentro de un círculo de 60 pt. Si la reducción se rompe (o alguien la
// salta), el atleta paga megas de su tarifa para pintar 180 px.
//
// Lo que entra: `avatar_url` es OPCIONAL a propósito. Una respuesta sin esa clave
// —y el caché en disco de las respuestas anteriores a la foto— tiene que seguir
// decodificando; si no, un atleta sin foto se quedaría sin identidad entera.
final class AthletePhotoTests: XCTestCase {

    // MARK: - Lo que sale del móvil

    /// Imagen sólida del tamaño en PÍXELES que se pida (escala 1).
    private func imagen(ancho: Int, alto: Int) -> UIImage {
        let size = CGSize(width: ancho, height: alto)
        let formato = UIGraphicsImageRendererFormat.default()
        formato.scale = 1
        return UIGraphicsImageRenderer(size: size, format: formato).image { ctx in
            UIColor.orange.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func pixeles(_ data: Data) throws -> CGSize {
        let img = try XCTUnwrap(UIImage(data: data), "el resultado tiene que ser una imagen legible")
        return CGSize(width: img.size.width * img.scale, height: img.size.height * img.scale)
    }

    /// El recorte cuadrado más grande que sirve el servidor (`avatar480`). Lo que
    /// suba el móvil no puede traer el lado corto por debajo, o Cloudflare tendría
    /// que agrandar y el retrato saldría blando.
    private let ladoCortoMinimoDelServidor: CGFloat = 480

    func testUnaFotoDeMovilSeReduceAlLimite() throws {
        // 4032 × 3024 es lo que dispara la cámara de un iPhone.
        let data = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(imagen(ancho: 4032, alto: 3024)))
        let px = try pixeles(data)

        XCTAssertEqual(px.width, AthletePhotoImage.maxDimensionPx, "el lado mayor manda")
        XCTAssertEqual(px.height, 768, "y el menor conserva la proporción 4:3")
    }

    func testLaVerticalTambienSeMidePorSuLadoMayor() throws {
        let data = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(imagen(ancho: 3024, alto: 4032)))
        let px = try pixeles(data)

        XCTAssertEqual(px.height, AthletePhotoImage.maxDimensionPx)
        XCTAssertEqual(px.width, 768)
    }

    /// La razón de ser del límite: da igual la proporción con la que dispare el
    /// atleta, el lado corto tiene que llegar a 480 para que el recorte del
    /// servidor no agrande. 4:3, 3:2 y 16:9 son las tres que dispara un móvil.
    func testElLadoCortoLlegaAlRecorteDelServidorEnCualquierProporcion() throws {
        for (ancho, alto) in [(4032, 3024), (4032, 2688), (3840, 2160)] {
            let data = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(imagen(ancho: ancho, alto: alto)))
            let px = try pixeles(data)
            XCTAssertGreaterThanOrEqual(
                min(px.width, px.height), ladoCortoMinimoDelServidor,
                "\(ancho)×\(alto) deja el lado corto por debajo del recorte de 480"
            )
        }
    }

    func testUnaFotoPequenaNoSeAgranda() throws {
        let data = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(imagen(ancho: 200, alto: 120)))
        let px = try pixeles(data)

        XCTAssertEqual(px.width, 200, "reducir sí, inventar píxeles no")
        XCTAssertEqual(px.height, 120)
    }

    func testElRecomprimidoAdelgazaDeVerdad() throws {
        let original = imagen(ancho: 4032, alto: 3024)
        let sinReducir = try XCTUnwrap(original.jpegData(compressionQuality: 1))
        let paraSubir = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(original))

        XCTAssertLessThan(paraSubir.count, sinReducir.count,
                          "subir la original sería pagar megas para pintar un círculo")
    }

    func testTambienEntraPorLosBytesDelSelector() throws {
        // El camino de la galería: llegan bytes, no una UIImage ya decodificada.
        let bytes = try XCTUnwrap(imagen(ancho: 4032, alto: 3024).jpegData(compressionQuality: 1))
        let data = try XCTUnwrap(AthletePhotoImage.jpegParaSubir(desde: bytes))

        XCTAssertEqual(try pixeles(data).width, AthletePhotoImage.maxDimensionPx)
    }

    func testUnosBytesQueNoSonUnaImagenNoRevientan() {
        XCTAssertNil(AthletePhotoImage.jpegParaSubir(desde: Data("esto no es una foto".utf8)))
    }

    // MARK: - Lo que entra del servidor

    private func identidad(_ json: String) throws -> AthleteIdentity {
        try APIClient.makeJSONDecoder().decode(AthleteIdentity.self, from: Data(json.utf8))
    }

    func testDecodificaLaFotoQueMandaElServidor() throws {
        let id = try identidad("""
        {"id":"atl_1","full_name":"Alex Sole","avatar_url":"https://imagenes.example/abc/perfil.jpg"}
        """)

        XCTAssertEqual(id.avatarUrl, "https://imagenes.example/abc/perfil.jpg")
        XCTAssertEqual(id.avatarURLResuelta, "https://imagenes.example/abc/perfil.jpg",
                       "una absoluta se deja tal cual")
    }

    func testUnaRutaSeResuelveContraLaBaseDeLaAPI() throws {
        let id = try identidad("""
        {"id":"atl_1","full_name":"Alex Sole","avatar_url":"/api/perfil/foto/atl_1.jpg"}
        """)

        XCTAssertEqual(id.avatarURLResuelta,
                       APIBase.url.appendingPathComponent("api/perfil/foto/atl_1.jpg").absoluteString)
    }

    func testSinFotoLaIdentidadSigueDecodificando() throws {
        // El contrato de compatibilidad: /auth/me antes de la foto, y su caché.
        let id = try identidad("""
        {"id":"atl_1","full_name":"Alex Sole"}
        """)

        XCTAssertNil(id.avatarUrl)
        XCTAssertNil(id.avatarURLResuelta, "sin foto, el avatar pinta iniciales")
        XCTAssertEqual(id.initials, "AS")
    }

    func testUnaFotoNulaOVaciaCuentaComoSinFoto() throws {
        XCTAssertNil(try identidad("""
        {"id":"atl_1","full_name":"Alex Sole","avatar_url":null}
        """).avatarURLResuelta)

        XCTAssertNil(try identidad("""
        {"id":"atl_1","full_name":"Alex Sole","avatar_url":"   "}
        """).avatarURLResuelta, "un blanco no es una foto")
    }
}
