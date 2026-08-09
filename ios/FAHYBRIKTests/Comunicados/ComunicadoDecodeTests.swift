import XCTest
@testable import FAHYBRIK

// El CONTRATO de la bandeja, cazado con la forma exacta que sirve el servidor
// (`web/lib/athlete/communications.ts` + `shared/domain/coach-communications.ts`).
//
// La app decodifica con `.convertFromSnakeCase`, así que lo que se prueba aquí es
// que los cinco tipos, las siete anclas y los cuatro estados llegan enteros —
// incluidos los campos que solo tiene uno de ellos (`blocks`, `due_date`,
// `consequence`, `final_note`) y los sellos del destinatario.
final class ComunicadoDecodeTests: XCTestCase {

    private func decodeInbox(_ json: String) throws -> ComunicadosInbox {
        try APIClient.makeJSONDecoder().decode(ComunicadosInbox.self, from: Data(json.utf8))
    }

    // La bandeja del caso real: la pregunta que bloquea, el briefing, el
    // protocolo a medias, dos tareas y el foco.
    static let inboxJSON = """
    {
      "communications": [
        {
          "id": "101",
          "kind": "question",
          "title": "¿Tu wave es el jueves o el sábado?",
          "body": "El taper está montado contando con el sábado 14.",
          "final_note": null,
          "anchor_kind": "plan",
          "anchor_ref": "412",
          "due_date": null,
          "expires_at": null,
          "blocks": true,
          "published_at": "2026-08-08T09:12:00.000Z",
          "coach_name": "Pablo Amigo",
          "items": [
            { "id": "9001", "position": 0, "label": null, "content": "Jueves 12",
              "consequence": "Openers el martes 10 y carbos desde el lunes 9." },
            { "id": "9002", "position": 1, "label": null, "content": "Sábado 14",
              "consequence": "El plan se queda como está." }
          ],
          "state": "published",
          "seen_at": null,
          "done_at": null,
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": [],
          "claims_attention": true
        },
        {
          "id": "102",
          "kind": "protocol",
          "title": "Calentamiento del día de carrera",
          "body": null,
          "final_note": "Nada de potenciación pesada.",
          "anchor_kind": "race",
          "anchor_ref": null,
          "due_date": null,
          "expires_at": "2026-11-20T23:00:00.000Z",
          "blocks": false,
          "published_at": "2026-08-09T07:00:00Z",
          "coach_name": "Pablo Amigo",
          "items": [
            { "id": "9101", "position": 0, "label": "−40'", "content": "Movilidad de cadera y tobillo.", "consequence": null, "checkable": true },
            { "id": "9102", "position": 1, "label": "−35'", "content": "Trote progresivo 10'.", "consequence": null, "checkable": true },
            { "id": "9103", "position": 2, "label": "−25'", "content": "Bebe 500 ml de agua con sales.", "consequence": null, "checkable": false }
          ],
          "state": "seen",
          "seen_at": "2026-08-09T07:30:00.000Z",
          "done_at": null,
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": ["9101"],
          "claims_attention": false
        },
        {
          "id": "103",
          "kind": "task",
          "title": "Empieza la beta-alanina",
          "body": "Necesita 4 a 6 semanas de carga.",
          "final_note": null,
          "anchor_kind": "general",
          "anchor_ref": null,
          "due_date": "2026-08-09",
          "expires_at": null,
          "blocks": false,
          "published_at": "2026-08-09T07:00:00Z",
          "coach_name": "Pablo Amigo",
          "items": [],
          "state": "published",
          "seen_at": null,
          "done_at": null,
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": [],
          "claims_attention": true
        },
        {
          "id": "104",
          "kind": "task",
          "title": "Haz los tests de la semana 1",
          "body": null,
          "final_note": null,
          "anchor_kind": "test",
          "anchor_ref": null,
          "due_date": "2026-08-16",
          "expires_at": null,
          "blocks": false,
          "published_at": "2026-08-09T07:00:00Z",
          "coach_name": "Pablo Amigo",
          "items": [],
          "state": "done",
          "seen_at": "2026-08-09T08:00:00Z",
          "done_at": "2026-08-09T08:01:00Z",
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": [],
          "claims_attention": false
        },
        {
          "id": "105",
          "kind": "focus",
          "title": "Dormir más de 6 horas",
          "body": "Es lo único que puede darte más minutos que cualquier sesión.",
          "final_note": null,
          "anchor_kind": "checkin",
          "anchor_ref": null,
          "due_date": null,
          "expires_at": null,
          "blocks": false,
          "published_at": "2026-05-04T07:00:00Z",
          "coach_name": "Pablo Amigo",
          "items": [],
          "state": "seen",
          "seen_at": "2026-05-04T09:00:00Z",
          "done_at": null,
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": [],
          "claims_attention": false
        },
        {
          "id": "106",
          "kind": "note",
          "title": "Tu plan, rehecho para Singles Pro",
          "body": "Por qué el objetivo son 1:15 a 1:18.",
          "final_note": null,
          "anchor_kind": "plan",
          "anchor_ref": null,
          "due_date": null,
          "expires_at": null,
          "blocks": false,
          "published_at": "2026-08-09T06:00:00Z",
          "coach_name": "Pablo Amigo",
          "items": [
            { "id": "9601", "position": 0, "label": "Qué ha cambiado", "content": "Haces el 100 % de cada estación.", "consequence": null }
          ],
          "state": "published",
          "seen_at": null,
          "done_at": null,
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": [],
          "claims_attention": true
        }
      ],
      "pending": 3
    }
    """

    func test_bandeja_decodificaLosCincoTipos() throws {
        let inbox = try decodeInbox(Self.inboxJSON)
        XCTAssertEqual(inbox.communications.count, 6)
        XCTAssertEqual(
            inbox.communications.map(\.kind),
            [.pregunta, .protocolo, .tarea, .tarea, .foco, .nota]
        )
        XCTAssertEqual(inbox.pending, 3)
    }

    func test_pregunta_traeSusOpcionesConConsecuenciaYBloqueo() throws {
        let pregunta = try XCTUnwrap(decodeInbox(Self.inboxJSON).communications.first)
        XCTAssertTrue(pregunta.blocks)
        XCTAssertEqual(pregunta.anchorKind, .plan)
        XCTAssertEqual(pregunta.anchorRef, "412")
        XCTAssertEqual(pregunta.items.count, 2)
        XCTAssertEqual(pregunta.items[1].content, "Sábado 14")
        XCTAssertEqual(pregunta.items[1].consequence, "El plan se queda como está.")
        XCTAssertNil(pregunta.items[0].label)
        XCTAssertEqual(pregunta.state, .publicado)
        XCTAssertNil(pregunta.answeredItemId)
    }

    func test_protocolo_traeMarcasPasosYNotaFinal() throws {
        let p = try XCTUnwrap(decodeInbox(Self.inboxJSON).communications.first { $0.id == "102" })
        XCTAssertEqual(p.kind, .protocolo)
        XCTAssertEqual(p.anchorKind, .carrera)
        XCTAssertEqual(p.finalNote, "Nada de potenciación pesada.")
        XCTAssertEqual(p.items.map(\.label), ["−40'", "−35'", "−25'"])
        XCTAssertEqual(p.markedItemIds, ["9101"])
        XCTAssertNotNil(p.expiresAt)
        XCTAssertEqual(p.state, .visto)
    }

    /// La casilla es del PASO: el tercero es una línea para leer y no cuenta ni
    /// para el avance ni para el «hecho». Si contara, el protocolo se quedaría
    /// abierto para siempre esperando una marca que nadie puede poner.
    func test_protocolo_soloCuentaLosPasosConCasilla() throws {
        let p = try XCTUnwrap(decodeInbox(Self.inboxJSON).communications.first { $0.id == "102" })
        XCTAssertEqual(p.items.map(\.checkable), [true, true, false])
        XCTAssertEqual(p.pasosMarcables.map(\.id), ["9101", "9102"])
        XCTAssertTrue(p.tienePasosMarcables)
        XCTAssertEqual(p.pasosHechos, 1)
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertTrue(p.puedeMarcarseHecho)
    }

    /// Un servidor anterior al campo solo mandaba pasos CON casilla: si la
    /// ausencia se leyera como `false`, una respuesta vieja se quedaría sin una
    /// sola casilla y el protocolo no se podría cerrar jamás.
    func test_checkableAusente_seLeeComoSi() throws {
        let json = """
        {
          "communications": [
            {
              "id": "301", "kind": "protocol", "title": "De un servidor anterior",
              "body": null, "final_note": null, "anchor_kind": "general", "anchor_ref": null,
              "due_date": null, "expires_at": null, "blocks": false,
              "published_at": "2026-08-09T07:00:00Z", "coach_name": null,
              "items": [
                { "id": "401", "position": 0, "label": null, "content": "Un paso", "consequence": null },
                { "id": "402", "position": 1, "label": null, "content": "Otro", "consequence": null, "checkable": null }
              ],
              "state": "published", "seen_at": null, "done_at": null,
              "answered_item_id": null, "answered_at": null,
              "marked_item_ids": [], "claims_attention": true
            }
          ],
          "pending": 1
        }
        """
        let p = try XCTUnwrap(decodeInbox(json).communications.first)
        XCTAssertEqual(p.items.map(\.checkable), [true, true])
        XCTAssertEqual(p.pasosMarcables.count, 2)
    }

    /// Un protocolo puede ser puro texto: título, cuerpo y nota final, sin un
    /// solo paso. Ni avance que enseñar ni «hecho» que ofrecer.
    func test_protocoloSinPasos_esLecturaYNoOfreceHecho() throws {
        let json = """
        {
          "communications": [
            {
              "id": "302", "kind": "protocol", "title": "Cómo comer la víspera",
              "body": "Cena pronto y sin fibra. Desayuna 3 h antes de tu salida.",
              "final_note": "Si te levantas con el estómago cerrado, mejor líquido.",
              "anchor_kind": "race", "anchor_ref": null,
              "due_date": null, "expires_at": null, "blocks": false,
              "published_at": "2026-08-09T07:00:00Z", "coach_name": "Pablo Amigo",
              "items": [],
              "state": "published", "seen_at": null, "done_at": null,
              "answered_item_id": null, "answered_at": null,
              "marked_item_ids": [], "claims_attention": true
            }
          ],
          "pending": 1
        }
        """
        let p = try XCTUnwrap(decodeInbox(json).communications.first)
        XCTAssertTrue(p.items.isEmpty)
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertFalse(p.puedeMarcarseHecho)
        XCTAssertNotNil(p.body)
        XCTAssertNotNil(p.finalNote)
        // Sigue reclamando porque no se ha abierto; abrirlo lo cierra del todo.
        XCTAssertTrue(p.reclama)
    }

    /// Las fechas del cable llegan CON y SIN fracción de segundo (las dos formas
    /// están en este mismo payload). Si una no se leyera, la fila entera caería.
    func test_fechas_conYSinFraccionDeSegundo() throws {
        let inbox = try decodeInbox(Self.inboxJSON)
        let conFraccion = try XCTUnwrap(inbox.communications.first { $0.id == "101" })
        let sinFraccion = try XCTUnwrap(inbox.communications.first { $0.id == "103" })
        XCTAssertEqual(conFraccion.publishedAt.timeIntervalSince1970,
                       ISO8601DateFormatters.parse("2026-08-08T09:12:00Z")!.timeIntervalSince1970)
        XCTAssertEqual(sinFraccion.publishedAt.timeIntervalSince1970,
                       ISO8601DateFormatters.parse("2026-08-09T07:00:00Z")!.timeIntervalSince1970)
        // `due_date` se queda CADENA: una fecha suelta no es un ISO 8601 completo
        // y decodificarla como Date tumbaría la tarea entera.
        XCTAssertEqual(sinFraccion.dueDate, "2026-08-09")
    }

    /// La regla local de «esto te sigue reclamando» tiene que dar exactamente lo
    /// mismo que el servidor. Son dos implementaciones del mismo mecanismo (la
    /// del cliente existe para que un acto sin cobertura cuente ya), y el día que
    /// se separen la app y el coach contarían cosas distintas.
    func test_reclama_coincideConElServidor() throws {
        let inbox = try decodeInbox(Self.inboxJSON)
        for c in inbox.communications {
            XCTAssertEqual(c.reclama, c.claimsAttention, "difiere en el comunicado \(c.id)")
        }
        XCTAssertEqual(inbox.communications.filter(\.reclama).count, inbox.pending)
    }

    /// Un tipo que esta versión de la app no conoce (el servidor añade uno
    /// nuevo) se cae SOLO: la bandeja sigue llegando con el resto en vez de
    /// quedarse en blanco.
    func test_tipoDesconocido_seCaeSoloYNoTumbaLaBandeja() throws {
        let json = """
        {
          "communications": [
            {
              "id": "201", "kind": "encuesta", "title": "Del futuro", "body": null,
              "final_note": null, "anchor_kind": "general", "anchor_ref": null,
              "due_date": null, "expires_at": null, "blocks": false,
              "published_at": "2026-08-09T07:00:00Z", "coach_name": null, "items": [],
              "state": "published", "seen_at": null, "done_at": null,
              "answered_item_id": null, "answered_at": null,
              "marked_item_ids": [], "claims_attention": true
            },
            {
              "id": "202", "kind": "focus", "title": "Dormir", "body": null,
              "final_note": null, "anchor_kind": "checkin", "anchor_ref": null,
              "due_date": null, "expires_at": null, "blocks": false,
              "published_at": "2026-08-09T07:00:00Z", "coach_name": null, "items": [],
              "state": "seen", "seen_at": "2026-08-09T07:30:00Z", "done_at": null,
              "answered_item_id": null, "answered_at": null,
              "marked_item_ids": [], "claims_attention": false
            }
          ],
          "pending": 1
        }
        """
        let inbox = try decodeInbox(json)
        XCTAssertEqual(inbox.communications.map(\.id), ["202"])
    }

    /// El estado que devuelve cada acto — es lo que pisa los sellos locales.
    func test_estadoDelDestinatario_decodifica() throws {
        let json = """
        {
          "communication_id": "102",
          "state": "done",
          "seen_at": "2026-08-09T07:30:00.000Z",
          "done_at": "2026-08-09T08:44:12.500Z",
          "answered_item_id": null,
          "answered_at": null,
          "marked_item_ids": ["9101", "9102", "9103"]
        }
        """
        let estado = try APIClient.makeJSONDecoder()
            .decode(ComunicadoRecipientState.self, from: Data(json.utf8))
        XCTAssertEqual(estado.communicationId, "102")
        XCTAssertEqual(estado.state, .hecho)
        XCTAssertEqual(estado.markedItemIds.count, 3)
        XCTAssertNotNil(estado.doneAt)
        XCTAssertNil(estado.answeredAt)
    }

    /// La bandeja se cachea en disco con el coder PLANO del store (camelCase, sin
    /// estrategia de fechas). Si no round-trip, un arranque en frío sin cobertura
    /// abriría vacío — que es justo lo que la caché existe para impedir.
    func test_bandeja_roundTripPorLaCacheEnDisco() throws {
        let original = try decodeInbox(Self.inboxJSON)
        let data = try JSONEncoder().encode(original)
        let vuelta = try JSONDecoder().decode(ComunicadosInbox.self, from: data)
        XCTAssertEqual(vuelta.communications.map(\.id), original.communications.map(\.id))
        XCTAssertEqual(vuelta.communications.map(\.kind), original.communications.map(\.kind))
        XCTAssertEqual(vuelta.communications.map(\.markedItemIds),
                       original.communications.map(\.markedItemIds))
        XCTAssertEqual(vuelta.pending, original.pending)
    }
}
