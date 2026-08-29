import XCTest
import HealthKit
@testable import FAHYBRIK

// LA FIRMA DE LO QUE ESCRIBIMOS EN APPLE SALUD.
//
// Lo que costó no tenerla en la muñeca (debugger 29-ago, Z2 de Alex, asignación
// 494): al terminar la app tenía 3,78 km · 22:33 · 153 ppm · 5:58; al reabrir la
// sesión guardada, **22:40 y cero bloques**. Esa fila la escribió el volcado de
// Salud, porque el HKWorkout de la muñeca llegaba sin firma e `linkExecution` lo
// adoptaba con duración de reloj de pared y sin tramos.
//
// Estos tests protegen las dos mitades: que el LITERAL no se toque (renombrarlo no
// migra nada — HealthKit no reescribe metadata — y todo lo escrito hasta hoy
// dejaría de reconocerse como nuestro) y que la pregunta sea de IDENTIDAD, no de
// evidencia.
final class SaludNuestraTests: XCTestCase {

    // EL LITERAL ESTÁ CLAVADO A PROPÓSITO. Si alguien lo cambia, este test falla y
    // el mensaje explica por qué no puede cambiarse. Ver docs/ios-clonabilidad.md.
    func testElLiteralDeLaFirmaNoSeToca() {
        XCTAssertEqual(SaludNuestra.firma, "FAHYBRIDWrittenByApp",
                       "renombrarla no migra nada: HealthKit no reescribe metadata, y todo lo "
                       + "escrito hasta hoy dejaria de reconocerse como nuestro")
    }

    func testLaMetadataLlevaLaFirmaPuesta() {
        XCTAssertTrue(SaludNuestra.esNuestro(SaludNuestra.metadata))
    }

    func testLoQueMidioUnAparatoNoEsNuestro() {
        XCTAssertFalse(SaludNuestra.esNuestro(nil), "sin metadata, lo midió un aparato")
        XCTAssertFalse(SaludNuestra.esNuestro([:]))
        XCTAssertFalse(SaludNuestra.esNuestro([HKMetadataKeyIndoorWorkout: true]),
                       "otra clave de Apple no nos convierte en el autor")
    }

    // LA PREGUNTA ES DE IDENTIDAD, NO DE VALOR. La firma se reconoce por estar
    // PUESTA: un `false` guardado ahí sigue siendo un dato que escribimos nosotros,
    // y leer el booleano en vez de la presencia dejaría entrar de vuelta lo nuestro.
    func testSeMiraQueLaCLAVEESTE_noSuValor() {
        XCTAssertTrue(SaludNuestra.esNuestro([SaludNuestra.firma: false]))
        XCTAssertTrue(SaludNuestra.esNuestro([SaludNuestra.firma: 1]))
    }

    // Y las MUESTRAS que escribimos se descartan al leer, que es la mitad que ya
    // existía: sin esto la energía activa del atleta se contaría dos veces.
    func testLasMuestrasQueEscribimosNoVuelvenAEntrar() {
        let tipo = HKQuantityType(.activeEnergyBurned)
        let ahora = Date()
        let nuestra = HKQuantitySample(
            type: tipo,
            quantity: HKQuantity(unit: .kilocalorie(), doubleValue: 120),
            start: ahora, end: ahora.addingTimeInterval(60),
            metadata: SaludNuestra.metadata
        )
        let delAparato = HKQuantitySample(
            type: tipo,
            quantity: HKQuantity(unit: .kilocalorie(), doubleValue: 120),
            start: ahora, end: ahora.addingTimeInterval(60)
        )
        let medidas = HealthKitSampleMapper.measuredOnly([nuestra, delAparato])
        XCTAssertEqual(medidas.count, 1)
        XCTAssertEqual(medidas.first, delAparato)
    }
}
