import XCTest
@testable import FAHYBRIK

// LA GRAFÍA Y LA ESCALA: un formateador por unidad, barrido sobre el enum
// ENTERO (el inventario lo da el modelo, no el ejemplo), y los ejes con
// números redondos y fechas que caben.
final class AnaliticasFormatoTests: XCTestCase {

    func testCadaUnidadSeEscribeUnaVez() {
        let esperado: [UnidadLectura: String] = [
            .tss: "62", .tssSemana: "2", .ratio: "1,25", .ms: "62 ms", .bpm: "50 ppm", .horas: "7,1 h", .pct: "67 %",
            .metros: "2,5 km", .mS: "3,64 m/s", .sKm: "4:12/km", .s500m: "1:56/500m", .segundos: "1:14:30", .kcal: "1.240 kcal",
            .kg: "132,5 kg", .puntos: "63", .mlKgMin: "48,2", .sesiones: "12 sesiones", .watts: "182 W", .reps: "12 reps", .dias: "39 días",
        ]
        let valores: [UnidadLectura: Double] = [
            .tss: 62.4, .tssSemana: 2.1, .ratio: 1.253, .ms: 62.4, .bpm: 50.3, .horas: 7.12, .pct: 66.6, .metros: 2500, .mS: 3.641,
            .sKm: 252, .s500m: 116, .segundos: 4470, .kcal: 1240, .kg: 132.5, .puntos: 63, .mlKgMin: 48.17, .sesiones: 12, .watts: 182.4, .reps: 12, .dias: 39,
        ]
        for u in UnidadLectura.allCases where u != .desconocida {
            XCTAssertEqual(AnaliticasFormato.formatear(valores[u]!, u), esperado[u], "\(u)")
        }
        XCTAssertEqual(AnaliticasFormato.formatear(450, .metros), "450 m")
        XCTAssertEqual(AnaliticasFormato.formatear(10000, .metros), "10 km")
        XCTAssertEqual(AnaliticasFormato.formatear(12500, .metros), "13 km")
    }

    func testLaCifraSinUnidadYLaUnidadCorta() {
        XCTAssertEqual(AnaliticasFormato.cifra(252, .sKm), "4:12")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.sKm), "/km")
        XCTAssertEqual(AnaliticasFormato.cifra(132.5, .kg), "132,5")
        XCTAssertEqual(AnaliticasFormato.cifra(132, .kg), "132")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.metros, valor: 450), "m")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.metros, valor: 2500), "km")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.tss), "")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.segundos), "")
        XCTAssertEqual(AnaliticasFormato.unidadCorta(.mlKgMin), "VO₂máx")
    }

    func testElDeltaVaEnLaUnidadQueLoJuzgaYConElMenosTipografico() {
        XCTAssertEqual(AnaliticasFormato.formatearDelta(-10, .sKm), "\u{2212}10 s/km")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(-2.6, .s500m), "\u{2212}2,6 s/500m")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(-17, .segundos), "\u{2212}17 s")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(-353, .segundos), "\u{2212}5:53")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(7.4, .kg), "+7,4 kg")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(12, .pct), "+12 pt")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(0.3, .horas), "+0,3 h")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(-3, .tssSemana), "\u{2212}3")
        XCTAssertEqual(AnaliticasFormato.formatearDelta(0, .tss), "±0")
        XCTAssertTrue(AnaliticasFormato.esCero(-0.04, .horas))
        XCTAssertFalse(AnaliticasFormato.esCero(-0.06, .horas))
        XCTAssertTrue(AnaliticasFormato.esCero(0.4, .tss))
    }

    func testMenosEsMejorSoloEnTiemposYPulso() {
        XCTAssertTrue(AnaliticasFormato.menosEsMejor(.sKm))
        XCTAssertTrue(AnaliticasFormato.menosEsMejor(.segundos))
        XCTAssertTrue(AnaliticasFormato.menosEsMejor(.bpm))
        XCTAssertFalse(AnaliticasFormato.menosEsMejor(.kg))
        XCTAssertFalse(AnaliticasFormato.menosEsMejor(.tss))
    }

    func testFechasYPeriodos() {
        XCTAssertEqual(AnaliticasFechas.corta("2026-09-28"), "28 sep")
        XCTAssertEqual(AnaliticasFechas.mesCorto("2026-07-06"), "jul")
        XCTAssertEqual(AnaliticasFormato.fechaLegible("2026-09-12", hoy: "2026-09-29"), "12 sep")
        XCTAssertEqual(AnaliticasFormato.fechaLegible("2025-11-03", hoy: "2026-09-29"), "3 nov 2025")
        XCTAssertEqual(AnaliticasFechas.diasEntre("2026-09-04", "2026-09-29"), 25)
        XCTAssertEqual(AnaliticasFechas.lunes("2026-09-29"), "2026-09-28")
        XCTAssertEqual(AnaliticasFechas.lunes("2026-09-27"), "2026-09-21")
        XCTAssertEqual(AnaliticasFechas.sumarDias("2026-09-29", 39), "2026-11-07")
        XCTAssertEqual(AnaliticasFormato.enDias(39), "en 39 días")
        XCTAssertEqual(AnaliticasFormato.enDias(0), "hoy")
        XCTAssertEqual(AnaliticasFormato.enDias(-4), "hace 4 días")
        XCTAssertEqual(AnaliticasFormato.horasYMin(71 * 3600 + 5 * 60), "71h 5min")
        XCTAssertEqual(AnaliticasFormato.horasYMin(42 * 60), "42 min")
        XCTAssertEqual(AnaliticasFormato.etiquetaPeriodo(.init(desde: "2026-04-15", hasta: "2026-07-07")), "vs 12 sem antes")
        XCTAssertEqual(AnaliticasFormato.etiquetaPeriodo(.init(desde: "2026-09-15", hasta: "2026-09-21")), "vs 7 d antes")
    }

    func testLaEscalaBonitaNuncaPasaDeNMasDosMarcas() {
        let e = AnaliticasEscala.bonita(31.2, 74.9, n: 4, desdeCero: true)
        XCTAssertEqual(e.min, 0)
        XCTAssertEqual(e.ticks, [0, 20, 40, 60, 80])
        let t = AnaliticasEscala.bonita(228, 275, n: 4, pasos: AnaliticasEscala.pasosTiempo)
        XCTAssertEqual(t.ticks, [225, 240, 255, 270, 285])
        XCTAssertLessThanOrEqual(t.ticks.count, 6)
        let d = AnaliticasEscala.bonita(-22, 22, n: 3)
        XCTAssertEqual(d.ticks, [-40, -20, 0, 20, 40])
        let plano = AnaliticasEscala.bonita(5, 5)
        XCTAssertGreaterThan(plano.max, plano.min)
    }

    func testLosRotulosDelEjeSonLaPrimeraLaUltimaYLosMesesQueCaben() {
        let dias = AnaliticasFechas.dias(desde: "2026-07-08", hasta: "2026-09-29")
        let r = AnaliticasEscala.rotulosX(dias, ancho: 300, cuerpo: 15)
        XCTAssertEqual(r.first?.texto, "8 jul")
        XCTAssertEqual(r.last?.texto, "29 sep")
        XCTAssertTrue(r.map(\.texto).contains("ago"))
        XCTAssertLessThanOrEqual(r.count, 4)
        let estrecho = AnaliticasEscala.rotulosX(dias, ancho: 90, cuerpo: 15)
        XCTAssertEqual(estrecho.map(\.texto), ["8 jul", "29 sep"], "sin sitio, solo los extremos")
    }

    func testAgruparSumaYRespetaLosHuecos() {
        let puntos = [PuntoDeSerie(t: "a", v: 1), PuntoDeSerie(t: "b", v: nil), PuntoDeSerie(t: "c", v: nil), PuntoDeSerie(t: "d", v: nil), PuntoDeSerie(t: "e", v: 4)]
        let g = AnaliticasEscala.agrupar(puntos, 2)
        XCTAssertEqual(g.map(\.v), [1, nil, 4])
        XCTAssertEqual(AnaliticasEscala.agrupacion(puntos: 12, ancho: 330), 1)
        XCTAssertEqual(AnaliticasEscala.agrupacion(puntos: 26, ancho: 330), 2)
        XCTAssertEqual(AnaliticasEscala.agrupacion(puntos: 52, ancho: 330), 4)
    }
}
