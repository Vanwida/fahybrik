import XCTest
@testable import FAHYBRIK

// LA GRAFÍA DE UNA CARRERA — traducción de la sección «formateadores» de `carreras-decide.test.ts` y
// de los cuatro fallos de escala/lectura que el doble encontró en el Swift anterior.
//
// Dos escalas, y el atleta las ve juntas: los TOTALES de carrera (meta, predicho, resultado) en minutos
// corridos («66:52») y los PARCIALES (vueltas, estaciones, RoxZone) en m:ss («4:12»).
final class FormatoCarrerasTests: XCTestCase {

    // MARK: Totales en minutos corridos, parciales en m:ss

    func testTotalesEnMinutosCorridosParcialesEnMSS() {
        XCTAssertEqual(Formato.clock(4012, enHoras: false), "66:52")
        XCTAssertEqual(Formato.clock(3790, enHoras: false), "63:10")
        XCTAssertEqual(Formato.clock(6720, enHoras: false), "112:00")
        XCTAssertEqual(Formato.clock(252), "4:12")
        XCTAssertEqual(Formato.clock(4012), "1:06:52")
    }

    /// El fallo (4): la tarjeta decía «1:05:00» y el detalle «65:00» para el MISMO objetivo.
    func testUnObjetivoSeEscribeIgualEnLaTarjetaYEnElDetalle() {
        XCTAssertEqual(AthleteNextRace.goalTimeFormatted(3900), "65:00")
        XCTAssertEqual(GoalGapFormat.raceClock(3900), "65:00")
        XCTAssertEqual(AthleteNextRace.goalTimeFormatted(3900), GoalGapFormat.raceClock(3900))
        XCTAssertEqual(AthleteNextRace.goalTimeFormatted(3570), "59:30")
        XCTAssertNil(AthleteNextRace.goalTimeFormatted(nil))
        XCTAssertNil(AthleteNextRace.goalTimeFormatted(0))
    }

    func testElDeltaLlevaSuSignoDeVerdad() {
        XCTAssertEqual(GoalGapFormat.signedDuration(-154), "\u{2212}2:34")
        XCTAssertEqual(GoalGapFormat.signedDuration(42), "+0:42")
        XCTAssertEqual(GoalGapFormat.signedDuration(0), "±0:00")
    }

    func testLaMetaSubNSiSonMinutosRedondosElRelojExactoSiNo() {
        XCTAssertEqual(Formato.metaDeCarrera(3900), "Sub-65")
        XCTAssertEqual(Formato.metaDeCarrera(3600), "Sub-60")
        XCTAssertEqual(Formato.metaDeCarrera(3870), "64:30")
        // Una meta a cero no es una meta.
        XCTAssertNil(Formato.metaDeCarrera(0))
        XCTAssertNil(Formato.metaDeCarrera(-5))
    }

    func testLosPeldanosDeLaMetaSonMinutosRedondosYSeDicenSubN() {
        for p in GoalPreset.allCases {
            XCTAssertEqual(p.seconds % 60, 0)
            XCTAssertEqual(Formato.metaDeCarrera(p.seconds), p.title)
        }
        XCTAssertEqual(GoalPreset.allCases.map(\.title), ["Sub-60", "Sub-70", "Sub-80", "Sub-90"])
    }

    func testElPuestoSinCampoSoloElPuestoSinPuestoNada() {
        XCTAssertEqual(Formato.puesto(412, campo: 1180), "Puesto 412 de 1180 · top 35 %")
        // El español agrupa a partir de cinco cifras (1180, pero 12.345).
        XCTAssertEqual(Formato.puesto(1, campo: 12345), "Puesto 1 de 12.345 · top 1 %")
        XCTAssertEqual(Formato.puesto(88, campo: nil), "Puesto 88")
        XCTAssertNil(Formato.puesto(nil, campo: 1000))
        XCTAssertNil(Formato.puesto(0, campo: 1000))
    }

    // MARK: Fechas

    func testFechasSinAnioSiEsElDeHoyConDiaDeLaSemanaParaLoQueViene() {
        let hoy = CasosCarreras.hoy
        XCTAssertEqual(FechaES.corta("2026-11-07", hoy: hoy), "7 nov")
        XCTAssertEqual(FechaES.corta("2027-03-06", hoy: hoy), "6 mar 2027")
        XCTAssertEqual(FechaES.corta("2026-11-07", hoy: hoy, conDia: true), "Sáb 7 nov")
        // Sin `hoy`, nunca lleva año: el uso de siempre no cambia.
        XCTAssertEqual(FechaES.corta("2027-03-06"), "6 mar")
        XCTAssertEqual(FechaES.corta("2026-07-03"), "3 jul")
        XCTAssertNil(FechaES.corta(""))
    }

    /// Septiembre es «sep» (no «sept» de `es_ES`): una tabla escrita, no la versión de ICU.
    func testLosMesesSonLosDeLaTablaYNoLosDelSistema() {
        XCTAssertEqual(FechaES.corta("2026-09-29"), "29 sep")
        XCTAssertEqual(FechaES.mesAbreviado(9), "sep")
        XCTAssertNil(FechaES.mesAbreviado(0))
        XCTAssertNil(FechaES.mesAbreviado(13))
        XCTAssertEqual(RaceDate.monthAbbr(9), "sep")
    }

    func testMesYAnioCortoParaElEjeDeUnaGrafica() {
        XCTAssertEqual(FechaES.mesAnio("2025-11-02"), "nov 25")
        XCTAssertEqual(FechaES.mesAnio("2026-05-16"), "may 26")
        XCTAssertNil(FechaES.mesAnio("basura"))
    }

    func testLosDiasEntreDosFechasYLaSumaDeDias() {
        XCTAssertEqual(DecideCarreras.diasEntre(CasosCarreras.hoy, "2026-11-07"), 39)
        XCTAssertEqual(DecideCarreras.diasEntre("2026-09-28", CasosCarreras.hoy), 1)
        XCTAssertEqual(DecideCarreras.diasEntre(CasosCarreras.hoy, "2026-09-28"), -1)
        XCTAssertEqual(CasosCarreras.sumaDias("2026-12-30", 3), "2027-01-02")
    }

    /// «Ayer» / «Hace 9 días» dentro de la ventana en que aún se pide el resultado; pasada, la fecha.
    func testCuantoHaceSeCuentaHastaDondeSeLePida() {
        let ahora = FechaES.fecha("2026-09-29")!
        let hace9 = FechaES.fecha("2026-09-20")!
        XCTAssertEqual(FechaES.hace(hace9, ahora: ahora), "el 20 de septiembre")
        XCTAssertEqual(FechaES.hace(hace9, ahora: ahora, cuentaHasta: DecideCarreras.diasPostcarrera), "hace 9 días")
        XCTAssertEqual(FechaES.hace(FechaES.fecha("2026-09-28")!, ahora: ahora, cuentaHasta: 14), "ayer")
        XCTAssertEqual(FechaES.hace(ahora, ahora: ahora, cuentaHasta: 14), "hoy")
    }

    // MARK: Lo que el servidor manda como TEXTO, leído una vez

    func testDuracionesDeCable() {
        XCTAssertEqual(DuracionDeCable.segundos("4:12"), 252)
        XCTAssertEqual(DuracionDeCable.segundos("1:02:10"), 3730)
        XCTAssertEqual(DuracionDeCable.segundos("0:59"), 59)
        XCTAssertNil(DuracionDeCable.segundos("—"))
        XCTAssertNil(DuracionDeCable.segundos("12"))
        XCTAssertNil(DuracionDeCable.segundos(nil))
        XCTAssertNil(DuracionDeCable.segundos("a:bc"))
    }

    func testDeltasDeCableConSignoTipografico() {
        XCTAssertEqual(DuracionDeCable.segundosConSigno("+0:42"), 42)
        XCTAssertEqual(DuracionDeCable.segundosConSigno("\u{2212}2:34"), -154)
        XCTAssertEqual(DuracionDeCable.segundosConSigno("-0:08"), -8)
        XCTAssertEqual(DuracionDeCable.segundosConSigno("±0:00"), 0)
        XCTAssertNil(DuracionDeCable.segundosConSigno("0:42"))
        XCTAssertNil(DuracionDeCable.segundosConSigno(nil))
    }

    /// La ida y vuelta con lo que escribe el servidor (`timeStr`, `signedDeltaStr`) no pierde un segundo.
    func testLaLecturaEsLaVueltaDeLoQueEscribeElServidor() {
        for s in [0, 59, 60, 252, 3599, 3600, 4012, 7199] {
            XCTAssertEqual(DuracionDeCable.segundos(Formato.clock(s)), s, "\(s)")
        }
        for d in [-154, -8, 0, 5, 42, 187] {
            XCTAssertEqual(DuracionDeCable.segundosConSigno(GoalGapFormat.signedDuration(d)), d, "\(d)")
        }
    }

    /// El fallo (5): la caída de ritmo llega en una frase; el número se lee una vez y la frase la escribe la vista.
    func testLaCaidaDeRitmoSeLeeDeLaFraseDelServidor() {
        XCTAssertEqual(CaidaDeRitmoCable.segundos(nota: "Caída de ritmo en la segunda mitad (+18s/km)"), 18)
        XCTAssertEqual(CaidaDeRitmoCable.segundos(nota: "Caída de ritmo en la segunda mitad (+8 s/km)"), 8)
        XCTAssertNil(CaidaDeRitmoCable.segundos(nota: nil))
        // Una frase que no se lee no inventa un aviso.
        XCTAssertNil(CaidaDeRitmoCable.segundos(nota: "El ritmo se mantuvo"))
        XCTAssertNil(CaidaDeRitmoCable.segundos(nota: "Caída de ritmo (+18 min)"))
    }

    // MARK: La meta que se elige

    func testLaMetaDeUnaEleccion() {
        let t = TiempoExacto(h: 1, m: 8, s: 0)
        XCTAssertEqual(GoalChoice.metaS(.preset(.sub60), tiempo: t), 3600)
        XCTAssertEqual(GoalChoice.metaS(.exact, tiempo: t), 4080)
        XCTAssertNil(GoalChoice.metaS(.exact, tiempo: TiempoExacto(h: 0, m: 0, s: 0)))
        // «Acabarla bien» y «nada elegido» son sin reloj.
        XCTAssertNil(GoalChoice.metaS(.finish, tiempo: t))
        XCTAssertNil(GoalChoice.metaS(nil, tiempo: t))
    }

    func testLaHojaDelTiempoParteDeLoQueYaEstabaFijado() {
        // Un peldaño se marca; un tiempo que no lo es abre el reloj exacto ya marcado; sin meta, nada elegido.
        let peldano = GoalChoice.desde(metaS: 3600)
        XCTAssertEqual(peldano.eleccion, .preset(.sub60))
        let exacto = GoalChoice.desde(metaS: 4080)
        XCTAssertEqual(exacto.eleccion, .exact)
        XCTAssertEqual(exacto.tiempo, TiempoExacto(h: 1, m: 8, s: 0))
        let ninguna = GoalChoice.desde(metaS: nil)
        XCTAssertNil(ninguna.eleccion)
        XCTAssertEqual(ninguna.tiempo, TiempoExacto(h: 1, m: 0, s: 0))
    }
}
