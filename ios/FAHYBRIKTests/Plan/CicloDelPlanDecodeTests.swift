import XCTest
@testable import FAHYBRIK

// EL CICLO, CAZADO CON LA FORMA EXACTA DEL CABLE (`GET /api/athlete/plan/ciclo`).
//
// Lo que se prueba aquí es lo que se perdería sin darse cuenta: que la estructura
// llega tipada con sus niveles y sus marcas de calendario, que un payload ANTERIOR
// a esos campos sigue decodificando igual (el camino viaja también dentro de una
// nota del coach, y esa nota no los trae), que una política que este binario no
// conoce se lee como «no se sabe» en vez de tumbar la respuesta, y que sin plan la
// pantalla degrada a Vacío. Un camino al que le desaparece un tramo se lee como si
// el coach no lo hubiera publicado.
final class CicloDelPlanDecodeTests: XCTestCase {

    private func decode(_ json: String) throws -> CicloDelPlanResponse {
        try APIClient.makeJSONDecoder().decode(CicloDelPlanResponse.self, from: Data(json.utf8))
    }

    /// El ciclo real: tres etapas con su nivel, la de hoy con dos marcas en el
    /// calendario, la política de la secuencia y la carrera con objetivo.
    static let cicloJSON = """
    {
      "camino": {
        "total_weeks": 11,
        "current_position": 1,
        "segments": [
          { "position": 0, "first_week": 1, "week_count": 1, "weeks_label": "S1",
            "title": "Tests", "detail": "Los cuatro tests de calibración.",
            "start_date": "2026-08-03", "end_date": "2026-08-09",
            "current_week": null, "milestone": true, "tone": 0,
            "level": "Avanzado", "events": [] },
          { "position": 1, "first_week": 2, "week_count": 4, "weeks_label": "S2-S5",
            "title": "Acumulación", "detail": null,
            "start_date": "2026-08-10", "end_date": "2026-09-06",
            "current_week": 2, "milestone": true, "tone": 1,
            "level": "Avanzado",
            "events": [
              { "kind": "test", "title": "Test de 5 km", "date": "2026-08-20" },
              { "kind": "sim", "title": "Simulación media", "date": "2026-08-26" }
            ] },
          { "position": 2, "first_week": 6, "week_count": 1, "weeks_label": "S6",
            "title": "Descarga", "detail": null,
            "start_date": "2026-09-07", "end_date": "2026-09-13",
            "current_week": null, "milestone": false, "tone": 2,
            "level": "Avanzado", "events": [] }
        ]
      },
      "al_acabar": "repeat",
      "carrera": { "name": "HYROX Barcelona", "date": "2026-10-31", "goal_time_s": 5400 }
    }
    """

    func test_cicloCompleto_llegaTipadoConNivelesYMarcas() throws {
        let r = try decode(Self.cicloJSON)
        let camino = try XCTUnwrap(r.camino)
        XCTAssertEqual(camino.totalWeeks, 11)
        XCTAssertEqual(camino.segments.map(\.title), ["Tests", "Acumulación", "Descarga"])
        XCTAssertEqual(camino.segments.map(\.level), ["Avanzado", "Avanzado", "Avanzado"])
        // Dónde está hoy se dice DENTRO del tramo, no con un nodo aparte.
        XCTAssertEqual(camino.segments.map(\.currentWeek), [nil, 2, nil])
        // Las marcas del calendario llegan en orden, con su clase y su fecha.
        XCTAssertEqual(camino.segments[1].events.map(\.kind), ["test", "sim"])
        XCTAssertEqual(camino.segments[1].events.map(\.title), ["Test de 5 km", "Simulación media"])
        XCTAssertEqual(camino.segments[1].events.first?.date, "2026-08-20")
        XCTAssertTrue(camino.segments[0].events.isEmpty)
        XCTAssertEqual(r.politica, .repite)
        XCTAssertEqual(r.carrera?.goalTimeS, 5_400)
        XCTAssertEqual(r.carrera?.objetivo, "1:30:00")
    }

    /// EL PAYLOAD VIEJO: el camino tal como viaja dentro de una nota del coach, sin
    /// `level` y sin `events`. Tiene que decodificar EXACTAMENTE igual — si no,
    /// añadir campos aquí rompería la nota, que es otra superficie.
    func test_payloadSinLosCamposNuevos_sigueDecodificando() throws {
        let json = """
        {
          "camino": {
            "total_weeks": 4,
            "current_position": 0,
            "segments": [
              { "position": 0, "first_week": 1, "week_count": 4, "weeks_label": "S1-S4",
                "title": "Acumulación", "detail": null,
                "start_date": "2026-08-17", "end_date": "2026-09-13",
                "current_week": 1, "milestone": false, "tone": 0 }
            ]
          },
          "al_acabar": null,
          "carrera": null
        }
        """
        let r = try decode(json)
        let tramo = try XCTUnwrap(r.camino?.segments.first)
        XCTAssertEqual(tramo.title, "Acumulación")
        XCTAssertNil(tramo.level)
        XCTAssertTrue(tramo.events.isEmpty)
        XCTAssertNil(r.politica)
        XCTAssertNil(r.carrera)
    }

    /// Una política que esta versión no sabe escribir se trata como NO SABERLO: el
    /// camino dibuja su hueco en vez de callarse o de inventar una frase.
    func test_alAcabarDesconocido_seLeeComoNoSaberlo() throws {
        let json = Self.cicloJSON.replacingOccurrences(
            of: #""al_acabar": "repeat""#,
            with: #""al_acabar": "level_up""#
        )
        let r = try decode(json)
        XCTAssertEqual(r.alAcabar, "level_up")   // la cadena cruda no se pierde
        XCTAssertNil(r.politica)
        let ciclo = try XCTUnwrap(CicloDelPlan(r, hoy: EscenariosCiclo.hoy))
        XCTAssertTrue(ciclo.hayHueco)
        XCTAssertTrue(ciclo.nodos.contains { $0.clase == .hueco })
    }

    /// Sin plan activo el servidor manda `camino: null`, y entonces no hay ciclo
    /// que resolver: la pantalla degrada a Vacío en vez de pintar un camino de cero
    /// pasos, que se leería como «tu plan está vacío».
    func test_caminoNulo_noHayCiclo() throws {
        let r = try decode(#"{ "camino": null, "al_acabar": null, "carrera": null }"#)
        XCTAssertNil(r.camino)
        XCTAssertNil(CicloDelPlan(r, hoy: EscenariosCiclo.hoy))
    }

    /// Un camino que llega pero sin un solo tramo es lo mismo que no llegar.
    func test_caminoVacio_tampocoHayCiclo() throws {
        let json = #"{ "camino": { "total_weeks": 0, "current_position": null, "segments": [] }, "al_acabar": null, "carrera": null }"#
        let r = try decode(json)
        XCTAssertEqual(r.camino?.estaVacio, true)
        XCTAssertNil(CicloDelPlan(r, hoy: EscenariosCiclo.hoy))
    }

    /// Una marca mal formada se cae SOLA y el tramo sobrevive con las buenas: un
    /// hito roto no puede llevarse el camino entero (`@LossyArray`).
    func test_marcaMalFormada_seCaeSolaYElTramoSobrevive() throws {
        let json = """
        {
          "camino": {
            "total_weeks": 4, "current_position": 0,
            "segments": [
              { "position": 0, "first_week": 1, "week_count": 4, "weeks_label": "S1-S4",
                "title": "Acumulación", "detail": null,
                "start_date": "2026-08-17", "end_date": "2026-09-13",
                "current_week": 1, "milestone": true, "tone": 0, "level": null,
                "events": [
                  { "kind": "test", "title": "Test de 5 km", "date": "2026-08-20" },
                  { "kind": "sim" },
                  { "kind": "sim", "title": "Simulación media", "date": "2026-08-26" }
                ] }
            ]
          },
          "al_acabar": "repeat", "carrera": null
        }
        """
        let tramo = try XCTUnwrap(decode(json).camino?.segments.first)
        XCTAssertEqual(tramo.events.map(\.title), ["Test de 5 km", "Simulación media"])
    }

    /// Y una lista de marcas que llega con la forma equivocada tampoco tumba el
    /// tramo: se queda sin marcas, que es honesto.
    func test_eventsConFormaEquivocada_dejaElTramoSinMarcas() throws {
        let json = """
        {
          "camino": {
            "total_weeks": 1, "current_position": 0,
            "segments": [
              { "position": 0, "first_week": 1, "week_count": 1, "weeks_label": "S1",
                "title": "Tests", "detail": null,
                "start_date": "2026-08-17", "end_date": "2026-08-23",
                "current_week": 1, "milestone": true, "tone": 0,
                "events": "unas cuantas" }
            ]
          },
          "al_acabar": null, "carrera": null
        }
        """
        let tramo = try XCTUnwrap(decode(json).camino?.segments.first)
        XCTAssertTrue(tramo.events.isEmpty)
        XCTAssertEqual(tramo.title, "Tests")
    }

    /// La carrera sin objetivo puesto no escribe ninguno: un tiempo por defecto
    /// parecería del atleta, y ningún valor por defecto puede parecerlo.
    func test_carreraSinObjetivo_noEscribeNinguno() throws {
        let json = #"{ "camino": null, "al_acabar": null, "carrera": { "name": "HYROX Madrid", "date": "2026-11-14", "goal_time_s": null } }"#
        let carrera = try XCTUnwrap(decode(json).carrera)
        XCTAssertNil(carrera.goalTimeS)
        XCTAssertNil(carrera.objetivo)
        XCTAssertEqual(carrera.enDias(hoy: EscenariosCiclo.hoy), 87)
    }
}
