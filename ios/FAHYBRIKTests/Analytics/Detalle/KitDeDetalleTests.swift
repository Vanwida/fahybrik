import XCTest
@testable import FAHYBRIK

// EL KIT DEL DETALLE, EN SUS DECISIONES PURAS: las marcas de un eje de tiempo (`marcasTiempo` del doble), los cubos de una serie semanal
// (las horas, los metros, el tonelaje) y el agrupado que los une cuando el periodo es largo. Lo que el gráfico dibuja sale de aquí.
final class KitDeDetalleTests: XCTestCase {

    // MARK: - Marcas de un eje de tiempo

    func testUnEjeDeTiempoMarcaCadaTresCincoDiezOQuinceMinutosSegunCuantoDura() {
        XCTAssertEqual(AnaliticasEscala.marcasDeTiempo(600), [0, 180, 360, 600], "la marca de 540 s pisaría el final: se quita")
        XCTAssertEqual(AnaliticasEscala.marcasDeTiempo(1800), [0, 300, 600, 900, 1200, 1500, 1800])
        XCTAssertEqual(AnaliticasEscala.marcasDeTiempo(2640), [0, 600, 1200, 1800, 2640])
        XCTAssertEqual(AnaliticasEscala.marcasDeTiempo(7200), [0, 900, 1800, 2700, 3600, 4500, 5400, 6300, 7200])
    }

    func testElFinalSiempreEsUnaMarcaYLaAnteriorSoloSeQuitaSiLePisa() {
        for duracion in stride(from: 240.0, through: 9000, by: 137) {
            let m = AnaliticasEscala.marcasDeTiempo(duracion)
            XCTAssertEqual(m.first, 0)
            XCTAssertEqual(m.last, duracion, "la duración \(duracion) acaba en su final")
            XCTAssertEqual(m, m.sorted())
            XCTAssertEqual(Set(m).count, m.count, "sin marcas repetidas en \(duracion)")
        }
    }

    // MARK: - Rótulos de la curva de mejores esfuerzos

    func testElRotuloDeLaPenultimaMarcaCreceHaciaLaIzquierdaSiEstaPegadoAlUltimo() {
        let marcas: [Double] = [400, 1000, 5000, 10000]
        let rango = 400.0...10000.0
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 400, entre: marcas, en: rango), .topLeading)
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 10000, entre: marcas, en: rango), .topTrailing)
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 5000, entre: marcas, en: rango), .topTrailing, "«5 km» y «10 km» centrados se pisan")
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 1000, entre: marcas, en: rango), .top)
        // Con el final lejos, el penúltimo se queda centrado.
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 1000, entre: [400, 1000, 10000], en: rango), .top)
        // Un eje de una sola marca no tiene vecino que pisar.
        XCTAssertEqual(AnaliticasCurvaMejores.ancla(de: 400, entre: [400], en: 400.0...401.0), .topLeading)
    }

    // MARK: - Las cifras que el detalle escribe de otra manera que la portada

    func testUnaCargaDeMasDeDiezMilKilosLlevaSuPuntoDeMillar() {
        XCTAssertEqual(AnaliticasFormato.cifra(98171, .kg), "98.171")
        XCTAssertEqual(AnaliticasFormato.cifra(9800, .kg), "9800", "hasta cuatro cifras no se parte, como en castellano")
        XCTAssertEqual(AnaliticasFormato.cifra(144.7, .kg), "144,7")
    }

    func testCadaUnidadSePegaASuCifraYLosSeparadoresSiPuedenPartir() {
        XCTAssertEqual(
            AnaliticasFormato.conUnidadesPegadas("500 m · 1:50/500m · 263 W · 156 ppm"),
            "500\u{00A0}m · 1:50/500m · 263\u{00A0}W · 156\u{00A0}ppm",
            "la unidad no se parte de su número, pero entre dos cifras sí se puede saltar de línea"
        )
        XCTAssertEqual(AnaliticasFormato.conUnidadesPegadas("Sentadilla 4 × 5"), "Sentadilla 4 × 5", "solo se pega lo que va cifra + letra")
    }

    // MARK: - Cubos de una serie semanal

    private func semanal(_ valores: [Double?], plan: [Double?]? = nil) -> SerieDeLectura {
        let fechas = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]
        return SerieDeLectura(
            unidad: .metros, paso: .semana,
            puntos: zip(fechas, valores).map { PuntoDeSerie(t: $0, v: $1) },
            plan: plan.map { p in zip(fechas, p).map { PuntoDeSerie(t: $0, v: $1) } }
        )
    }

    func testUnaSerieSemanalSeHaceUnaColumnaPorSemanaConSuContornoDePlan() {
        let cubos = AnaliticasDerivados.cubosDeSerie(semanal([6000, 8000, nil, 5000], plan: [7000, 7000, 7000, 7000]), color: .red, hoy: "2026-09-29", agrupar: 1)
        XCTAssertEqual(cubos.map(\.t), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"])
        XCTAssertEqual(cubos.map(\.plan), [7000, 7000, 7000, 7000])
        XCTAssertEqual(cubos.map { $0.partes.first?.valor }, [6000, 8000, 0, 5000], "una semana sin dato no suma ni inventa: su parte vale 0 y no se pinta barra")
        XCTAssertEqual(cubos.map(\.enCurso), [false, false, false, true], "solo la semana que contiene hoy está en curso")
    }

    func testUnaSerieSinPlanNoTraeContorno() {
        let cubos = AnaliticasDerivados.cubosDeSerie(semanal([1, 2, 3, 4]), color: .red, hoy: "2026-09-29", agrupar: 1)
        XCTAssertTrue(cubos.allSatisfy { $0.plan == nil })
    }

    func testUnPeriodoLargoAgrupaLasSemanasSumandoYCuentaElHuecoComoHueco() {
        let cubos = AnaliticasDerivados.cubosDeSerie(semanal([6000, 8000, nil, nil], plan: [7000, 7000, 7000, 7000]), color: .red, hoy: "2026-09-29", agrupar: 2)
        XCTAssertEqual(cubos.count, 2)
        XCTAssertEqual(cubos[0].partes.first?.valor, 14000)
        XCTAssertEqual(cubos[1].partes.first?.valor, 0, "dos semanas sin dato siguen sin dato")
        XCTAssertEqual(cubos.map(\.t), ["2026-09-07", "2026-09-21"], "el grupo lleva la fecha de su primera semana")
        XCTAssertEqual(cubos.map(\.enCurso), [false, true], "el último grupo contiene la semana de hoy")
    }

    func testUnaSerieDiariaNoEsUnaSerieDeCubos() {
        let diaria = SerieDeLectura(unidad: .metros, paso: .dia, puntos: [PuntoDeSerie(t: "2026-09-28", v: 1)])
        XCTAssertTrue(AnaliticasDerivados.cubosDeSerie(diaria, color: .red, hoy: "2026-09-29", agrupar: 1).isEmpty, "una línea diaria no se convierte en barras")
    }
}
