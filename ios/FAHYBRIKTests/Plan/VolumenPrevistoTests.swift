import XCTest
@testable import FAHYBRIK

// EL VOLUMEN DE LA SEMANA NO SE SUMA EN SILENCIO.
//
// El fallo que estas pruebas cierran: `sessions.reduce(0) { $0 + ($1.est ?? 0) }`.
// Tratar «no se sabe» como cero da la suma de una fracción vendida como el total, y
// solo se ocultaba si salía exactamente 0 — que casi nunca pasa. Con la mayoría de
// las plantillas de producción llegando sin duración, la semana subreportaba siempre
// y nunca lo decía.

final class VolumenPrevistoTests: XCTestCase {

    // MARK: - La grafía: un suelo, no una estimación centrada

    func testLaDuracionSeEscribeIgualEnTodaLaApp() {
        XCTAssertEqual(Formato.duracion(45), "45 min")
        XCTAssertEqual(Formato.duracion(60), "1 h")
        XCTAssertEqual(Formato.duracion(70), "1 h 10")
        XCTAssertEqual(Formato.duracion(260), "4 h 20")
        // Cero minutos NO es una duración: es el defecto plausible de siempre.
        XCTAssertNil(Formato.duracion(0))
        XCTAssertNil(Formato.duracion(-5))
    }

    func testElRelojDelPlanSeLeeComoSueloYNoComoAproximacion() {
        XCTAssertEqual(Formato.duracionPrevista(70), "desde 1 h 10")
        // Sin reloj escrito no hay número — ni «≈», ni «~», ni un guion.
        XCTAssertNil(Formato.duracionPrevista(nil))
        XCTAssertNil(Formato.duracionPrevista(0))
    }

    // MARK: - La lectura de la semana

    func testSemanaCompletaDaElSueloYNoDeclaraNada() {
        let l = VolumenPrevisto.lee([60, 45, 30])
        XCTAssertEqual(l.sueloMinutos, 135)
        XCTAssertEqual(l.sinReloj, 0)
        XCTAssertTrue(l.completo)
        XCTAssertEqual(l.suelo, "desde 2 h 15")
        XCTAssertNil(l.hueco, "sin hueco no hay nada que declarar")
        XCTAssertEqual(l.linea, "desde 2 h 15")
    }

    func testSemanaAMediasDaElSueloYDECLARAloQueQuedaFuera() {
        // El caso de producción: seis sesiones, una escribe su reloj.
        let l = VolumenPrevisto.lee([50, nil, nil, nil, nil, nil])
        XCTAssertEqual(l.sueloMinutos, 50)
        XCTAssertEqual(l.sinReloj, 5)
        XCTAssertFalse(l.completo)
        // Las dos mitades SIEMPRE viajan juntas: el suelo solo se leería como el
        // volumen de la semana, que es exactamente la mentira que se retira.
        XCTAssertEqual(l.linea, "desde 50 min · 5 sin tiempo previsto")
    }

    func testSinNingunRelojEscritoNoHayNumeroPeroSiHuecoDeclarado() {
        let l = VolumenPrevisto.lee([nil, nil, nil])
        XCTAssertNil(l.suelo, "cero sesiones con reloj no son «0 min»")
        XCTAssertEqual(l.hueco, "3 sin tiempo previsto")
        XCTAssertEqual(l.linea, "3 sin tiempo previsto")
    }

    func testUnCeroEscritoTampocoCuentaComoReloj() {
        // Un 0 en el cable no es «dura cero»: es la misma ausencia con otra cara.
        let l = VolumenPrevisto.lee([0, 40])
        XCTAssertEqual(l.sueloMinutos, 40)
        XCTAssertEqual(l.sinReloj, 1)
    }

    func testSemanaVaciaNoDiceNada() {
        let l = VolumenPrevisto.lee([])
        XCTAssertNil(l.suelo)
        XCTAssertNil(l.hueco)
        XCTAssertNil(l.linea)
    }

    // MARK: - El porqué llega del servidor y se dice con sus palabras

    func testLaFraseDeCadaMotivoEsLaMismaQueLaDelServidor() {
        // Espejo de DURATION_UNKNOWN_ES en shared/domain/prescription/duration.ts.
        XCTAssertEqual(DuracionDesconocida.scoredByTime.frase, "")
        XCTAssertEqual(DuracionDesconocida.untilFailure.frase, "")
        XCTAssertEqual(DuracionDesconocida.workNotTimed.frase, "")
        XCTAssertEqual(DuracionDesconocida.undosed.frase, "")
    }

    func testElMotivoLlegaDelCableYUnoDesconocidoNoRompeLaSemana() throws {
        let sinDuracion = try decodeSesion(
            #"{"assignment_id":"1","slot":"am","title":"HYROX","status":"pending","est_duration_minutes":null,"duration_unknown_reason":"scored_by_time"}"#
        )
        XCTAssertNil(sinDuracion.estDurationMinutes)
        XCTAssertEqual(sinDuracion.durationUnknownReason, .scoredByTime)

        // Un motivo que esta versión no conoce se queda en nil; la sesión decodifica.
        let futuro = try decodeSesion(
            #"{"assignment_id":"2","slot":"pm","title":"Algo","status":"pending","duration_unknown_reason":"motivo_del_futuro"}"#
        )
        XCTAssertNil(futuro.durationUnknownReason)
        XCTAssertEqual(futuro.title, "Algo")

        // Con reloj escrito no viaja motivo, y no hace falta.
        let conDuracion = try decodeSesion(
            #"{"assignment_id":"3","slot":"am","title":"Rodaje","status":"pending","est_duration_minutes":50}"#
        )
        XCTAssertEqual(conDuracion.estDurationMinutes, 50)
        XCTAssertNil(conDuracion.durationUnknownReason)
    }

    private func decodeSesion(_ json: String) throws -> AthleteWeekDaySession {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase   // el mismo que usa APIClient
        return try d.decode(AthleteWeekDaySession.self, from: Data(json.utf8))
    }
}
