import XCTest
@testable import FAHYBRIK

final class SemanaCalendarioTests: XCTestCase {

    func testDomingoTreintaDeAgostoCaeEnLaSemanaDelVeinticuatro() {
        let domingo = fecha("2026-08-30", hora: 17)
        XCTAssertEqual(SemanaCalendario.lunes(conteniendo: domingo), "2026-08-24")
    }

    func testSabadoYDomingoCompartenLunes() {
        XCTAssertEqual(SemanaCalendario.lunes(conteniendo: fecha("2026-08-29", hora: 12)), "2026-08-24")
        XCTAssertEqual(SemanaCalendario.lunes(conteniendo: fecha("2026-08-30", hora: 12)), "2026-08-24")
    }

    func testLunesTreintaYUnoAbreLaSemanaSiguiente() {
        XCTAssertEqual(SemanaCalendario.lunes(conteniendo: fecha("2026-08-31", hora: 0)), "2026-08-31")
    }

    func testElPagerSiempreTieneLaSemanaAdyacenteAunqueEsteVacia() {
        let pages = SemanaCalendario.paginas(alrededor: "2026-08-24")
        XCTAssertEqual(pages, ["2026-08-17", "2026-08-24", "2026-08-31"])
        XCTAssertEqual(
            SemanaCalendario.ventana(alrededor: "2026-08-24", radio: 2),
            ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"]
        )
    }

    func testSemanaSiguienteVaciaSigueTeniendoSieteDias() {
        let vacia = SemanaCalendario.semanaVacia(lunes: "2026-08-31", hoyIso: "2026-08-30")
        XCTAssertEqual(vacia.dias.map(\.isoDate), [
            "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
            "2026-09-04", "2026-09-05", "2026-09-06",
        ])
        XCTAssertEqual(vacia.dias.map(\.inicial), ["L", "M", "X", "J", "V", "S", "D"])
        XCTAssertFalse(vacia.tieneAlgunaSesion)
        XCTAssertNil(vacia.hoy, "today is Sunday of the previous week")
    }

    func testDesdeCualquierDiaSePuedeIrALaAnteriorYLaSiguiente() {
        for iso in ["2026-08-24", "2026-08-29", "2026-08-30"] {
            let lunes = SemanaCalendario.lunes(isoDay: iso)
            XCTAssertEqual(lunes, "2026-08-24", iso)
            XCTAssertEqual(SemanaCalendario.adyacente(lunes: lunes!, semanas: 1), "2026-08-31")
            XCTAssertEqual(SemanaCalendario.adyacente(lunes: lunes!, semanas: -1), "2026-08-17")
        }
    }

    private func fecha(_ iso: String, hora: Int) -> Date {
        let p = HistoryCalendar.parseISO(iso)!
        return HistoryCalendar.boxCalendar.date(
            from: DateComponents(year: p.year, month: p.month, day: p.day, hour: hora)
        )!
    }
}
