import XCTest
@testable import FAHYBRIK

// LA PAUSA DEL VIVO NUEVO — la que pide el atleta se reanuda sola a los 10 s si
// no la confirma (el valor de la vista vieja). La regla es pura (`Vivo+Accion`).
final class VivoPausaTests: XCTestCase {

    func testElMismoValorQueLaVistaVieja() {
        XCTAssertEqual(Vivo.reanudaSolaS, 10)
    }

    func testCuentaHaciaAtrasEnSegundosEnteros() {
        let t0 = Date(timeIntervalSinceReferenceDate: 1_000)
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0), 10)
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(0.4)), 10, "se enseña el segundo que corre")
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(3.2)), 7)
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(9.9)), 1)
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(10)), 0, "toca reanudar")
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(42)), 0)
    }

    func testSinPausaDelAtletaNoSeCuentaNada() {
        XCTAssertNil(Vivo.quedaParaReanudar(desde: nil, ahora: Date()),
                     "una pausa que no pidió el atleta en este vivo (o con la hoja de terminar abierta) no se reanuda sola")
    }

    func testUnRelojQueVaHaciaAtrasNoAlargaLaPausa() {
        let t0 = Date(timeIntervalSinceReferenceDate: 1_000)
        XCTAssertEqual(Vivo.quedaParaReanudar(desde: t0, ahora: t0.addingTimeInterval(-5)), 10)
    }
}
