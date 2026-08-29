import XCTest
@testable import FAHYBRIK

// UNA SOLA REGLA para una cuenta atrás, y es la del móvil.
//
// Había dos: `standalone` (CEIL) y `mirrored` (ROUND). Con las dos vivas, la misma
// cuenta atrás se leía distinta según qué la pintara — el count-in del espejo
// redondeaba hacia arriba y el crono del héroe de la MISMA pantalla hacia el más
// cercano. Manda el móvil, que es el dueño del tiempo y formatea con
// `Formato.clock`: la muñeca redondea igual y el mismo `remaining` cae en el mismo
// entero en las dos pantallas.
final class CountdownFormatTests: XCTestCase {

    func testRedondeaComoElMovil() {
        XCTAssertEqual(CountdownFormat.remaining(53.4), ":53")   // hacia abajo (CEIL daba :54 → el bug)
        XCTAssertEqual(CountdownFormat.remaining(53.5), ":54")   // el límite sube, como Formato.clock
        XCTAssertEqual(CountdownFormat.remaining(2.5), ":03")
        XCTAssertEqual(CountdownFormat.remaining(2.1), ":02")
    }

    func testNuncaNegativa() {
        XCTAssertEqual(CountdownFormat.remaining(-5), ":00")
        XCTAssertEqual(CountdownFormat.wholeSeconds(-5), 0)
    }

    func testDelMinutoEnAdelanteUsaElFormateadorCompartido() {
        XCTAssertEqual(CountdownFormat.remaining(60), "01:00")
        XCTAssertEqual(CountdownFormat.remaining(89.6), "01:30")   // 90 → 1:30
    }

    // EL HÁPTICO LEE EL MISMO ENTERO QUE SE PINTA. Antes el 3-2-1 disparaba con un
    // `ceil` calculado aparte mientras el numeral se pintaba con otra regla: en el
    // mismo cuarto de segundo el reloj podía enseñar «:02» y golpear el tres.
    func testElEnteroQueSeVeEsElQueDisparaElGolpe() {
        for s in [3.4, 2.6, 2.5, 2.4, 0.6, 0.4, 0.0] {
            XCTAssertEqual(CountdownFormat.remaining(s),
                           String(format: ":%02d", CountdownFormat.wholeSeconds(s)),
                           "el numeral y el entero del háptico divergen en \(s)")
        }
    }

    // La muñeca llama a la misma regla a través de su grafía, así que no puede
    // volver a haber dos: si alguien reintroduce una, este test lo caza.
    func testLaGrafiaDeLaMunecaUsaLaMismaRegla() {
        for s in [0.3, 2.5, 53.4, 89.6] {
            XCTAssertEqual(WatchFormat.countdown(s), CountdownFormat.remaining(s))
        }
    }
}
