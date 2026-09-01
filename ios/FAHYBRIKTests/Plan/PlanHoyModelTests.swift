import XCTest
@testable import FAHYBRIK

// LA LECTURA DEL PLAN — lo que el carril afirma de cada día, y de dónde sale
// «Semana N de M».
//
// Estas dos derivaciones son las que más fácilmente mienten sin que nadie se
// entere, y por eso están aquí y no dentro de una vista:
//
//  · El ESTADO de un día es la única cosa que el cliente deduce por su cuenta
//    (nadie en el servidor caduca una sesión pasada a `missed`). Si se equivoca,
//    el atleta ve un ✓ donde no entrenó o un aro pendiente en una semana que ya
//    pasó — las dos son mentiras del §7.
//  · La POSICIÓN sale de una frase que compone el servidor. Si el parseo se
//    rompe, la cabecera enseñaría una semana inventada, que es peor que ninguna.

final class PlanHoyModelTests: XCTestCase {

    // MARK: - El estado de un día

    func testDiaSinSesionesEsDescanso() {
        let semana = semanaDe([dia("2026-08-03", [])], hoy: "2026-08-03")
        XCTAssertEqual(semana.dias[0].estado, .descanso)
    }

    func testUnaSesionCompletadaMarcaElDiaComoHecho() throws {
        let semana = semanaDe(
            [dia("2026-08-03", [try sesion(id: "1", status: "completed")])],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.dias[0].estado, .hecha)
    }

    func testConDosSesionesUnaHechaBastaParaQueElDiaCuenteComoTrabajado() throws {
        // El sello dice que hubo trabajo, no que se cerrara el día entero.
        let semana = semanaDe(
            [dia("2026-08-03", [
                try sesion(id: "1", status: "completed"),
                try sesion(id: "2", status: "scheduled"),
            ])],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.dias[0].estado, .hecha)
    }

    func testUnaSesionAMediasNoSeColapsaEnHecha() throws {
        // Es la corrección del modelo del doble contra el dominio real: `partial`
        // existe, y pintarlo como hecha afirmaría un trabajo completo que no ocurrió.
        let semana = semanaDe(
            [dia("2026-08-03", [try sesion(id: "1", status: "partial")])],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.dias[0].estado, .parcial)
    }

    func testUnDiaPasadoSinNadaRegistradoQuedaComoSaltado() throws {
        let semana = semanaDe(
            [
                dia("2026-08-01", [try sesion(id: "1", status: "scheduled")]),
                dia("2026-08-03", [try sesion(id: "2", status: "scheduled")]),
            ],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.dias[0].estado, .saltada, "El día pasó y no quedó nada registrado")
        XCTAssertEqual(semana.dias[1].estado, .pendiente, "Hoy todavía se puede hacer")
    }

    func testUnDiaFuturoSinHacerSigueSiendoPendiente() throws {
        let semana = semanaDe(
            [
                dia("2026-08-03", [try sesion(id: "1", status: "scheduled")]),
                dia("2026-08-05", [try sesion(id: "2", status: "scheduled")]),
            ],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.dias[1].estado, .pendiente)
    }

    // MARK: - Ayer y mañana (la salida del día de descanso)

    func testAyerYMananaSaltanLosDiasVacios() throws {
        let semana = semanaDe(
            [
                dia("2026-08-01", [try sesion(id: "1", status: "completed", title: "Remo 500")]),
                dia("2026-08-02", []),
                dia("2026-08-03", []),                                   // hoy, descanso
                dia("2026-08-04", []),
                dia("2026-08-05", [try sesion(id: "2", status: "scheduled", title: "Sentadilla")]),
            ],
            hoy: "2026-08-03"
        )
        XCTAssertEqual(semana.sesionDeAyer?.sesion.title, "Remo 500")
        XCTAssertEqual(semana.sesionDeManana?.sesion.title, "Sentadilla")
    }

    func testSinNadaDespuesDeHoyLaSemanaEstaCerrada() throws {
        let semana = semanaDe(
            [
                dia("2026-08-01", [try sesion(id: "1", status: "completed")]),
                dia("2026-08-03", []),
            ],
            hoy: "2026-08-03"
        )
        XCTAssertNil(semana.sesionDeManana, "Sin mañana la pantalla dice que la semana se cerró")
    }

    // MARK: - Semana N de M

    func testLaPosicionSaleDeLaEtiquetaDelServidor() {
        let p = PosicionEnBloque.desde(etiqueta: "Acumulación · semana 3 de 6")
        XCTAssertEqual(p?.semana, 3)
        XCTAssertEqual(p?.total, 6)
        XCTAssertEqual(p?.texto, "Semana 3 de 6")
    }

    func testLaPosicionAguantaUnNombreDeBloqueConNumeros() {
        // «Bloque 2» lleva su propia cifra: el parseo tiene que quedarse con las dos
        // de la coletilla, no con la primera que encuentre.
        let p = PosicionEnBloque.desde(etiqueta: "Bloque 2 · fuerza y ritmo · semana 1 de 4")
        XCTAssertEqual(p?.semana, 1)
        XCTAssertEqual(p?.total, 4)
    }

    func testSinEtiquetaNoHayPosicionInventada() {
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: nil))
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: "Acumulación"))
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: "semana 0 de 0"))
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: "semana 7 de 4"), "Una semana fuera del bloque no es una posición")
    }

    func testLaFormaCortaDelPlanDirectoTraePosicionSinTotal() {
        // «semana 3» a secas: el plan directo (sin cadena) sí sabe en qué semana
        // va, pero su total no es un hecho y no se inventa (Alex, 12-ago).
        let p = PosicionEnBloque.desde(etiqueta: "semana 3")
        XCTAssertEqual(p?.semana, 3)
        XCTAssertNil(p?.total)
        XCTAssertEqual(p?.texto, "Semana 3")
    }

    func testLaFormaCompletaGanaALaCortaYUnaContradictoriaNoDegrada() {
        // Sobre la forma completa, la corta también casaría: el orden importa.
        XCTAssertEqual(PosicionEnBloque.desde(etiqueta: "Base 1 · semana 2 de 4")?.total, 4)
        // Y una etiqueta contradictoria no se «rescata» quedándose solo con el N.
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: "semana 7 de 4"))
        XCTAssertNil(PosicionEnBloque.desde(etiqueta: "semana 0"))
    }

    // MARK: - Estructural

    func testEstructuralSaleDelFormatoDelBloqueYCasiNuncaEsCierto() {
        // No hay columna `group` en ninguna parte: el marco se deduce del formato.
        XCTAssertTrue(DesgloseSesion.esEstructural("warmup"))
        XCTAssertTrue(DesgloseSesion.esEstructural("cooldown"))
        // Y los formatos REALES de producción no son estructurales — que casi nunca
        // se atenúe una parte es la respuesta correcta, no un bug.
        for formato in ["steady", "sets", "rounds", "intervals", "for_time", "hyrox_sim", "emom"] {
            XCTAssertFalse(DesgloseSesion.esEstructural(formato), "\(formato) es trabajo, no marco")
        }
    }

    // MARK: - Utilidades

    private func semanaDe(_ dias: [AthleteWeekDay], hoy: String) -> SemanaDelPlan {
        SemanaDelPlan.desde(respuesta(dias: dias, hoy: hoy))
    }

    private func dia(_ iso: String, _ sesiones: [AthleteWeekDaySession]) -> AthleteWeekDay {
        AthleteWeekDay(
            dayOfWeek: 1,
            isoDate: iso,
            sessions: sesiones,
            isRest: sesiones.isEmpty
        )
    }

    private func sesion(
        id: String,
        status: String,
        title: String = "Sesión"
    ) throws -> AthleteWeekDaySession {
        // Se decodifica con el MISMO decoder que APIClient para no construir a mano
        // un shape que el cable nunca produce.
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        let json = #"{"assignment_id":"\#(id)","slot":"am","title":"\#(title)","status":"\#(status)"}"#
        let s = try d.decode(AthleteWeekDaySession.self, from: Data(json.utf8))
        // El estado se lee de la UNIÓN del servidor con las marcas optimistas
        // locales, así que se limpian: si no, un test anterior las arrastraría.
        CompletedAssignmentsStore.unmark(id)
        return s
    }

    private func respuesta(dias: [AthleteWeekDay], hoy: String) -> AthletePlanWeekResponse {
        let dias_json = dias.map { d -> String in
            let ss = d.sessions.map {
                #"{"assignment_id":"\#($0.assignmentId)","slot":"\#($0.slot)","title":"\#($0.title)","status":"\#($0.status)"}"#
            }.joined(separator: ",")
            return #"{"day_of_week":\#(d.dayOfWeek),"iso_date":"\#(d.isoDate)","is_rest":\#(d.isRest),"sessions":[\#(ss)]}"#
        }.joined(separator: ",")
        let json = """
        {"week":{"week_start":"2026-08-01","week_end":"2026-08-07","today_iso":"\(hoy)",
        "microciclo_name":"Acumulación","focus":"Semana fuerte","has_next_week":false,
        "paused":false,"paused_since":null,"paused_reason":null,"days":[\(dias_json)]},
        "macro_summary":{"block":null,"week_label":"Acumulación · semana 3 de 6","a_event_days":null}}
        """
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        return try! d.decode(AthletePlanWeekResponse.self, from: Data(json.utf8))
    }
}
