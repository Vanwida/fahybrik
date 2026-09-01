import XCTest
@testable import FAHYBRIK

// LA VOZ DEL COACH — de dónde salen sus bytes.
//
// Lo que se prueba aquí es la trampa del cable: el audio de un comunicado llega
// como RUTA del servidor (`/api/communications/audio/…`) y el adjunto de un chat
// llega ya absoluto. Los dos acaban en la misma caché autenticada, así que la
// resolución tiene que ser una y no puede tocar lo que ya venía absoluto: esa
// cadena ES la clave con la que la caché guarda los bytes.
final class NotaDeVozTests: XCTestCase {

    // MARK: - La ruta, resuelta

    func test_rutaDelServidor_seResuelveContraLaBase() {
        let ruta = "/api/communications/audio/2026/08/voz.m4a"
        XCTAssertEqual(APIBase.absoluta(ruta), APIBase.url.absoluteString + ruta)
    }

    /// Lo que ya viene absoluto se respeta CARÁCTER A CARÁCTER: re-normalizarlo
    /// cambiaría la clave de la caché y volvería a bajar lo que ya está en disco.
    func test_urlAbsoluta_seRespetaTalCual() {
        let url = "https://app.fahybrid.com/api/chat/attachments/nota.m4a?v=2"
        XCTAssertEqual(APIBase.absoluta(url), url)
    }

    func test_sinReferencia_noSeInventaUnaURL() {
        XCTAssertNil(APIBase.absoluta(nil))
        XCTAssertNil(APIBase.absoluta(""))
        XCTAssertNil(APIBase.absoluta("   "))
    }

    // MARK: - La fuente

    func test_fuenteDeVoz_sabeADondeIrAPorLosBytes() {
        let fuente = FuenteDeVoz(remota: "/api/communications/audio/voz.m4a")
        XCTAssertTrue(fuente.tieneAlgo)
        XCTAssertEqual(fuente.remotaAbsoluta,
                       APIBase.url.absoluteString + "/api/communications/audio/voz.m4a")
    }

    /// La onda se siembra con lo que LLEGÓ, no con la absoluta: cambiar de
    /// entorno mueve la base, y las barras de la misma nota no pueden cambiar
    /// por eso.
    func test_semilla_noDependeDeLaBase() {
        let ruta = "/api/communications/audio/voz.m4a"
        XCTAssertEqual(FuenteDeVoz(remota: ruta).semilla, ruta)
    }

    func test_onda_esLaMismaParaElMismoAudioYDistintaParaOtro() {
        let una = OndaDeVoz.barras(semilla: "/api/communications/audio/voz.m4a")
        let otraVez = OndaDeVoz.barras(semilla: "/api/communications/audio/voz.m4a")
        let distinta = OndaDeVoz.barras(semilla: "/api/communications/audio/otra.m4a")
        XCTAssertEqual(una, otraVez)
        XCTAssertNotEqual(una, distinta)
        XCTAssertEqual(una.count, 30)
        XCTAssertTrue(una.allSatisfy { $0 >= 0.30 && $0 <= 1.0 })
    }

    // MARK: - El comunicado que la lleva

    func test_comunicadoConVoz_laPideConSuRutaResuelta() {
        let n = EscenariosComunicados.notaDeFeedback()
        XCTAssertTrue(n.tieneAudio)
        let fuente = FuenteDeVoz(remota: n.audioUrl)
        XCTAssertEqual(fuente.remotaAbsoluta,
                       APIBase.url.absoluteString + "/api/communications/audio/2026/08/voz-feedback.m4a")
    }

    func test_comunicadoSinVoz_noPideNada() {
        let n = EscenariosComunicados.notaDeFeedback(conAudio: false)
        XCTAssertFalse(n.tieneAudio)
        XCTAssertNil(FuenteDeVoz(remota: n.audioUrl).remotaAbsoluta)
    }
}
