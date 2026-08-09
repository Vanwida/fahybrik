import XCTest
@testable import FAHYBRIK

// LAS FORMAS DE UNA NOTA, CAZADAS CON LA FORMA EXACTA DEL CABLE
// (`shared/domain/coach-communications-dto.ts` + `web/lib/athlete/communications.ts`,
// migración 0163).
//
// Lo que se prueba aquí es lo que se perdería sin darse cuenta: que las cuatro
// formas llegan tipadas, que el camino trae la espina entera con su tono y su
// «estás aquí», que el enlace del pie trae MI estado, y —sobre todo— que nada
// de esto tira una sección ni la nota cuando falta o cuando llega algo que este
// binario no conoce. Un briefing al que le desaparece un capítulo se lee como
// si el coach no lo hubiera escrito.
final class ComunicadoFormasDecodeTests: XCTestCase {

    private func decodeNota(_ json: String) throws -> Comunicado {
        try APIClient.makeJSONDecoder().decode(Comunicado.self, from: Data(json.utf8))
    }

    /// La nota real: el porqué, la banda de objetivo, el reparto de la semana y
    /// el camino de las once semanas; con la pregunta del wave al pie.
    static let notaJSON = """
    {
      "id": "106",
      "kind": "note",
      "title": "Tu plan, rehecho para Singles Pro",
      "body": "Por qué el objetivo son 1:15 a 1:18 y cómo se reparten las semanas.",
      "final_note": null,
      "anchor_kind": "plan",
      "anchor_ref": null,
      "due_date": null,
      "expires_at": null,
      "blocks": false,
      "published_at": "2026-08-09T06:00:00.000Z",
      "coach_name": "Pablo Amigo",
      "items": [
        {
          "id": "9601", "position": 0, "label": "Qué ha cambiado",
          "content": "Haces el 100 % de cada estación y cada trineo lleva 50 kg más.",
          "consequence": null, "checkable": true,
          "display": "texto", "segments": [], "camino": null
        },
        {
          "id": "9602", "position": 1, "label": "La banda se cierra con los tests de la semana 1",
          "content": "1:15 a 1:18", "consequence": null, "checkable": true,
          "display": "cifra", "segments": [], "camino": null
        },
        {
          "id": "9603", "position": 2, "label": "Cómo se reparte la semana",
          "content": "", "consequence": null, "checkable": true,
          "display": "reparto",
          "segments": [
            { "position": 0, "value_num": 3, "label": "duras" },
            { "position": 1, "value_num": 2, "label": "moderadas" },
            { "position": 2, "value_num": 1, "label": "de absorción" }
          ],
          "camino": null
        },
        {
          "id": "9604", "position": 3, "label": "Por dónde vas a pasar",
          "content": "", "consequence": null, "checkable": true,
          "display": "camino", "segments": [],
          "camino": {
            "total_weeks": 11,
            "current_position": 1,
            "segments": [
              { "position": 0, "first_week": 1, "week_count": 1, "weeks_label": "S1",
                "title": "Tests", "detail": "Los cuatro tests de calibración.",
                "start_date": "2026-08-10", "end_date": "2026-08-16",
                "current_week": null, "milestone": true, "tone": 0 },
              { "position": 1, "first_week": 2, "week_count": 4, "weeks_label": "S2-S5",
                "title": "Acumulación", "detail": null,
                "start_date": "2026-08-17", "end_date": "2026-09-13",
                "current_week": 2, "milestone": false, "tone": 1 },
              { "position": 2, "first_week": 6, "week_count": 1, "weeks_label": "S6",
                "title": "Descarga", "detail": null,
                "start_date": "2026-09-14", "end_date": "2026-09-20",
                "current_week": null, "milestone": false, "tone": 2 },
              { "position": 3, "first_week": 7, "week_count": 5, "weeks_label": "S7-S11",
                "title": "Específico", "detail": "Simulacro completo en la S10.",
                "start_date": "2026-09-21", "end_date": "2026-10-25",
                "current_week": null, "milestone": true, "tone": 3 }
            ]
          }
        }
      ],
      "state": "published",
      "seen_at": null,
      "done_at": null,
      "answered_item_id": null,
      "answered_at": null,
      "marked_item_ids": [],
      "claims_attention": true,
      "linked": {
        "id": "101", "kind": "question",
        "title": "¿Tu wave es el jueves o el sábado?",
        "blocks": true, "state": "published"
      }
    }
    """

    // MARK: - Las cuatro formas

    func test_nota_traeSusCuatroFormasTipadas() throws {
        let nota = try decodeNota(Self.notaJSON)
        XCTAssertEqual(nota.items.map(\.forma), [.texto, .cifra, .reparto, .camino])
        // Las cuatro tienen algo que decir, así que se pintan las cuatro.
        XCTAssertEqual(nota.seccionesVisibles.count, 4)
    }

    func test_cifra_seParteEnLosDosExtremosDeLaBanda() throws {
        let cifra = try XCTUnwrap(decodeNota(Self.notaJSON).items.first { $0.forma == .cifra })
        let banda = try XCTUnwrap(cifra.bandaDeLaCifra)
        XCTAssertEqual(banda.desde, "1:15")
        XCTAssertEqual(banda.hasta, "1:18")
        // En una cifra la etiqueta es el PIE, no una cabecera.
        XCTAssertEqual(cifra.label, "La banda se cierra con los tests de la semana 1")
    }

    /// La misma regla que la previa del coach: dos extremos cortos y con número.
    /// Sin esto él aprobaría una nota que en este móvil se lee distinta.
    func test_banda_soloCuandoDeVerdadSonDosExtremos() {
        XCTAssertNotNil(ComunicadoItem.banda("1:15 a 1:18"))
        XCTAssertNotNil(ComunicadoItem.banda("68 kg a 72 kg"))
        // Una frase con un «a» dentro no es una banda.
        XCTAssertNil(ComunicadoItem.banda("de 3 a 5 series por bloque y sin fallar"))
        // Sin número en los dos lados tampoco.
        XCTAssertNil(ComunicadoItem.banda("poco a poco"))
        // Una cifra sola se queda entera.
        XCTAssertNil(ComunicadoItem.banda("1:15"))
    }

    func test_reparto_traeSusTrozosEnOrdenYConSuPeso() throws {
        let reparto = try XCTUnwrap(decodeNota(Self.notaJSON).items.first { $0.forma == .reparto })
        XCTAssertEqual(reparto.trozos.map(\.label), ["duras", "moderadas", "de absorción"])
        // El peso se escribe en la voz de la app: sin decimal cuando es redondo.
        XCTAssertEqual(reparto.trozos.map(\.cantidad), ["3", "2", "1"])
        // Un reparto NO se teclea: su contenido llega vacío a propósito.
        XCTAssertTrue(reparto.content.isEmpty)
        XCTAssertFalse(reparto.forma.seTeclea)
    }

    // MARK: - El camino

    func test_camino_traeLaEspinaEnteraConSuTonoYDondeEstasHoy() throws {
        let seccion = try XCTUnwrap(decodeNota(Self.notaJSON).items.first { $0.forma == .camino })
        let camino = try XCTUnwrap(seccion.camino)
        XCTAssertEqual(camino.totalWeeks, 11)
        XCTAssertEqual(camino.currentPosition, 1)
        XCTAssertEqual(camino.segments.map(\.weeksLabel), ["S1", "S2-S5", "S6", "S7-S11"])
        // El título es el NOMBRE del microciclo del coach, sin interpretar.
        XCTAssertEqual(camino.segments.map(\.title), ["Tests", "Acumulación", "Descarga", "Específico"])
        XCTAssertEqual(camino.segments.map(\.milestone), [true, false, false, true])
        XCTAssertEqual(camino.segments.map(\.tono), [0, 1, 2, 3])
        // Dónde está hoy se dice DENTRO del tramo, no con un nodo aparte.
        XCTAssertEqual(camino.segments.map(\.currentWeek), [nil, 2, nil, nil])
        XCTAssertEqual(camino.segments.filter(\.esActual).count, 1)
        // Las fechas se quedan CADENA: una fecha suelta no es un ISO 8601
        // completo y decodificarla como Date tumbaría el tramo entero.
        XCTAssertEqual(camino.segments.first?.startDate, "2026-08-10")
    }

    /// El puente al dibujo: lo que la espina acaba pintando de cada tramo.
    func test_tramosEspina_saleDelCaminoConSuClaveEstable() throws {
        let seccion = try XCTUnwrap(decodeNota(Self.notaJSON).items.first { $0.forma == .camino })
        let tramos = TramoEspina.desde(try XCTUnwrap(seccion.camino))
        XCTAssertEqual(tramos.count, 4)
        XCTAssertEqual(tramos.map(\.id), ["0-2026-08-10", "1-2026-08-17", "2-2026-09-14", "3-2026-09-21"])
        XCTAssertEqual(tramos.map(\.semanas), ["S1", "S2-S5", "S6", "S7-S11"])
        XCTAssertEqual(tramos.map(\.destacado), [true, false, false, true])
        XCTAssertEqual(tramos.map(\.actual), [false, true, false, false])
        XCTAssertEqual(tramos[1].aquiEstas, "Estás aquí, semana 2")
        XCTAssertEqual(tramos[1].semanaActual, 2)
        XCTAssertEqual(tramos[0].detalle, "Los cuatro tests de calibración.")
        XCTAssertNil(tramos[1].detalle)
        // El tono se pinta con el que manda el servidor, sin re-derivarlo.
        XCTAssertEqual(tramos.map(\.tono), [0, 1, 2, 3])
    }

    /// Sin plan activo el servidor manda `camino: null`, y entonces la sección
    /// NO se pinta: un camino de cero pasos le diría que su plan está vacío
    /// cuando lo que pasa es que aún no empieza.
    func test_caminoNulo_noDejaHueco() throws {
        let json = Self.seccionSuelta(#""content": "", "display": "camino", "segments": [], "camino": null"#)
        let nota = try decodeNota(json)
        XCTAssertEqual(nota.items[0].forma, .camino)
        XCTAssertNil(nota.items[0].camino)
        XCTAssertFalse(nota.items[0].tieneAlgoQuePintar)
        XCTAssertTrue(nota.seccionesVisibles.isEmpty)
    }

    /// Un camino que llega pero sin un solo tramo es lo mismo que no llegar.
    func test_caminoVacio_tampocoSePinta() throws {
        let json = Self.seccionSuelta(#""content": "", "display": "camino", "camino": { "total_weeks": 0, "current_position": null, "segments": [] }"#)
        let nota = try decodeNota(json)
        XCTAssertTrue(nota.items[0].camino?.estaVacio == true)
        XCTAssertFalse(nota.items[0].tieneAlgoQuePintar)
        XCTAssertTrue(nota.seccionesVisibles.isEmpty)
    }

    /// Un tramo mal formado se cae SOLO. El camino sigue llegando con el resto,
    /// en vez de dejar la sección en blanco por una fila rota.
    func test_tramoMalFormado_noSeLlevaElCaminoEntero() throws {
        let json = Self.seccionSuelta("""
        "content": "", "display": "camino", "camino": { "total_weeks": 6, "current_position": 0, "segments": [
          { "position": 0, "first_week": 1, "week_count": 5, "weeks_label": "S1-S5",
            "title": "Acumulación", "detail": null, "start_date": "2026-08-10",
            "end_date": "2026-09-13", "current_week": 1, "milestone": false, "tone": 0 },
          { "position": 1, "weeks_label": "S6" }
        ] }
        """)
        let camino = try XCTUnwrap(decodeNota(json).items[0].camino)
        XCTAssertEqual(camino.segments.map(\.title), ["Acumulación"])
    }

    /// El tono lo deriva el servidor por posición, pero si un día no llegara el
    /// cliente lo vuelve a derivar con la MISMA regla: la escala cicla cada
    /// cinco tramos y nunca se queda sin color.
    func test_tramoSinTono_loDerivaDeSuPosicion() throws {
        let json = Self.seccionSuelta("""
        "content": "", "display": "camino", "camino": { "total_weeks": 8, "current_position": null, "segments": [
          { "position": 5, "first_week": 1, "week_count": 4, "weeks_label": "S1-S4",
            "title": "Acumulación", "detail": null, "start_date": "2026-08-10",
            "end_date": "2026-09-06", "current_week": null },
          { "position": 6, "first_week": 5, "week_count": 4, "weeks_label": "S5-S8",
            "title": "Específico", "detail": null, "start_date": "2026-09-07",
            "end_date": "2026-10-04", "current_week": null }
        ] }
        """)
        let camino = try XCTUnwrap(decodeNota(json).items[0].camino)
        XCTAssertEqual(camino.segments.map(\.tone), [nil, nil])
        XCTAssertEqual(camino.segments.map(\.tono), [0, 1])
        // Y sin `milestone` ninguno rompe la rutina: no se inventa un hito.
        XCTAssertEqual(camino.segments.map(\.milestone), [false, false])
    }

    func test_derivacionDelTono_cicla() {
        XCTAssertEqual((0..<7).map(CaminoDelPlan.tono), [0, 1, 2, 3, 4, 0, 1])
        XCTAssertEqual(CaminoDelPlan.tono(-1), 4)
        XCTAssertEqual(CaminoDelPlan.tonos, 5)
    }

    // MARK: - Tolerancia de la forma

    /// Una sección de antes de la 0163 —y las que sigue mandando esta app— no
    /// trae `display`. Es exactamente lo que era: texto.
    func test_seccionSinDisplay_esTexto() throws {
        let json = Self.seccionSuelta(#""content": "El porqué de todo esto.""#)
        let nota = try decodeNota(json)
        XCTAssertNil(nota.items[0].display)
        XCTAssertEqual(nota.items[0].forma, .texto)
        XCTAssertTrue(nota.items[0].tieneAlgoQuePintar)
        XCTAssertTrue(nota.items[0].segments.isEmpty)
        XCTAssertNil(nota.items[0].camino)
    }

    /// Una forma que este binario no conoce se lee como texto y la sección SE
    /// QUEDA. Descartarla dejaría un capítulo en blanco en medio del briefing.
    func test_formaDesconocida_seLeeComoTextoYNoSeDescarta() throws {
        let json = Self.seccionSuelta(#""display": "tabla", "content": "Tres columnas que aún no sé pintar.""#)
        let nota = try decodeNota(json)
        XCTAssertEqual(nota.items[0].forma, .texto)
        XCTAssertEqual(nota.seccionesVisibles.count, 1)
    }

    /// Un reparto sin un solo trozo con peso no dibuja una barra vacía: se salta.
    func test_repartoSinTrozos_noSePinta() throws {
        let json = Self.seccionSuelta(#""content": "", "display": "reparto", "segments": [{ "position": 0, "value_num": 0, "label": "nada" }]"#)
        let nota = try decodeNota(json)
        XCTAssertEqual(nota.items[0].forma, .reparto)
        XCTAssertTrue(nota.items[0].trozos.isEmpty)
        XCTAssertFalse(nota.items[0].tieneAlgoQuePintar)
    }

    // MARK: - El enlace del pie

    func test_enlace_llegaConMiEstadoYConLoQueBloquea() throws {
        let nota = try decodeNota(Self.notaJSON)
        let enlace = try XCTUnwrap(nota.linked)
        XCTAssertEqual(enlace.id, "101")
        XCTAssertEqual(enlace.kind, .pregunta)
        XCTAssertEqual(enlace.state, .publicado)
        XCTAssertFalse(enlace.resuelto)
        XCTAssertTrue(enlace.bloqueaTodavia)
        XCTAssertEqual(enlace.linea, "Hasta que la contestes, esa parte de tu plan se queda a la espera.")
    }

    /// Respondida, el pie no desaparece: se convierte en el recibo.
    func test_enlaceResuelto_dejaDeLlamarYPasaASerRecibo() {
        let respondida = ComunicadoEnlazado(
            id: "101", kind: .pregunta, title: "¿Tu wave es el jueves o el sábado?",
            blocks: true, state: .respondido
        )
        XCTAssertTrue(respondida.resuelto)
        XCTAssertFalse(respondida.bloqueaTodavia)
        XCTAssertEqual(respondida.linea, "Ya la contestaste.")

        let tarea = ComunicadoEnlazado(id: "103", kind: .tarea, title: "Empieza la beta-alanina",
                                       blocks: false, state: .hecho)
        XCTAssertEqual(tarea.linea, "Ya la cerraste.")
    }

    /// Un tipo que este binario no conoce se queda sin chip, pero NO se lleva la
    /// nota: perder el enlace es perder un chip; dejar caer la fila es perder el
    /// briefing entero de la bandeja.
    func test_enlaceDeTipoDesconocido_noTiraLaNota() throws {
        let json = Self.notaJSON.replacingOccurrences(of: "\"kind\": \"question\"", with: "\"kind\": \"encuesta\"")
        let nota = try decodeNota(json)
        let enlace = try XCTUnwrap(nota.linked)
        XCTAssertNil(enlace.kind)
        XCTAssertEqual(enlace.title, "¿Tu wave es el jueves o el sábado?")
        XCTAssertEqual(enlace.linea, "Te falta leerlo.")
    }

    /// Sin enlace, no hay pie. Es lo normal en la mayoría de las notas.
    func test_notaSinEnlace_noLoInventa() throws {
        let json = Self.seccionSuelta(#""content": "Sin nada pendiente.""#)
        XCTAssertNil(try decodeNota(json).linked)
    }

    // MARK: - La caché en disco

    /// La bandeja se cachea con el coder PLANO del store (camelCase, sin
    /// estrategia de fechas). Si las formas no round-trip, un arranque en frío
    /// sin cobertura abriría la nota sin su cifra, sin su barra y sin su camino.
    func test_formas_roundTripPorLaCacheEnDisco() throws {
        let original = try decodeNota(Self.notaJSON)
        let vuelta = try JSONDecoder().decode(Comunicado.self, from: JSONEncoder().encode(original))
        XCTAssertEqual(vuelta.items.map(\.forma), original.items.map(\.forma))
        XCTAssertEqual(vuelta.items.map(\.segments), original.items.map(\.segments))
        XCTAssertEqual(vuelta.items.map(\.camino), original.items.map(\.camino))
        XCTAssertEqual(vuelta.linked, original.linked)
        XCTAssertEqual(vuelta.seccionesVisibles.count, 4)
    }

    // MARK: - Arnés

    /// Una nota con UNA sección, para probar un caso raro sin arrastrar las
    /// cuatro formas detrás. `campos` es la sección entera menos su id, su
    /// posición y su etiqueta: cada prueba escribe lo que le importa, incluido
    /// `content`, que el servidor manda siempre (vacío en las formas que no se
    /// teclean).
    private static func seccionSuelta(_ campos: String) -> String {
        """
        {
          "id": "900", "kind": "note", "title": "Una nota", "body": null, "final_note": null,
          "anchor_kind": "plan", "anchor_ref": null, "due_date": null, "expires_at": null,
          "blocks": false, "published_at": "2026-08-09T06:00:00Z", "coach_name": null,
          "items": [
            { "id": "9001", "position": 0, "label": "Una sección", "consequence": null, \(campos) }
          ],
          "state": "published", "seen_at": null, "done_at": null,
          "answered_item_id": null, "answered_at": null,
          "marked_item_ids": [], "claims_attention": true
        }
        """
    }
}
