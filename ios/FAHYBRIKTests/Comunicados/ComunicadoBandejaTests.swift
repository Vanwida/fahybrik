import XCTest
@testable import FAHYBRIK

// El MECANISMO de la bandeja, sin pintar nada: cómo se reparte, qué cuenta el
// globito, qué insignia toca y cómo se mueve el estado con cada acto.
//
// Cada uno de estos tiene que dar lo mismo que da el servidor
// (`shared/domain/coach-communications.ts` y `web/lib/athlete/communications.ts`):
// la copia local existe para que un acto sin cobertura se pinte YA, y el día que
// las dos reglas se separen la app y el coach contarían cosas distintas.
final class ComunicadoBandejaTests: XCTestCase {

    // MARK: - Fábrica

    private func comunicado(
        id: String,
        kind: ComunicadoTipo,
        body: String? = nil,
        state: ComunicadoEstado = .publicado,
        blocks: Bool = false,
        dueDate: String? = nil,
        items: [ComunicadoItem] = [],
        marcados: [String] = [],
        seen: Date? = nil,
        done: Date? = nil,
        answered: (String, Date)? = nil,
        coachName: String? = "Pablo Amigo"
    ) -> Comunicado {
        Comunicado(
            id: id,
            kind: kind,
            title: "Título \(id)",
            body: body,
            finalNote: nil,
            anchorKind: .general,
            anchorRef: nil,
            dueDate: dueDate,
            expiresAt: nil,
            blocks: blocks,
            publishedAt: Date(timeIntervalSince1970: 1_754_700_000),
            coachName: coachName,
            items: items,
            state: state,
            seenAt: seen,
            doneAt: done,
            answeredItemId: answered?.0,
            answeredAt: answered?.1,
            markedItemIds: marcados,
            claimsAttention: Comunicado.reclama(kind: kind, state: state)
        )
    }

    private func paso(
        _ id: String,
        _ marca: String? = nil,
        checkable: Bool = true
    ) -> ComunicadoItem {
        ComunicadoItem(
            id: id, position: 0, label: marca,
            content: "Paso \(id)", consequence: nil, checkable: checkable
        )
    }

    private func hoy(_ iso: String) -> Date {
        FechaES.fecha(iso)!
    }

    // MARK: - El reparto

    func test_agrupar_repartePorTipoYRespetaElOrdenDelServidor() {
        let lista = [
            comunicado(id: "1", kind: .pregunta, blocks: true),
            comunicado(id: "2", kind: .tarea, dueDate: "2026-08-09"),
            comunicado(id: "3", kind: .protocolo, items: [paso("a")]),
            comunicado(id: "4", kind: .foco, state: .visto, seen: Date()),
            comunicado(id: "5", kind: .nota),
            comunicado(id: "6", kind: .tarea, dueDate: "2026-08-16"),
        ]
        let bandeja = BandejaComunicados.agrupar(lista)

        XCTAssertEqual(bandeja.preguntas.map(\.id), ["1"])
        // Protocolos y tareas comparten cajón, y dentro NO se reordenan: el orden
        // lo pone el servidor (primero lo que vence).
        XCTAssertEqual(bandeja.paraHacer.map(\.id), ["2", "3", "6"])
        XCTAssertEqual(bandeja.focos.map(\.id), ["4"])
        XCTAssertEqual(bandeja.notas.map(\.id), ["5"])
        XCTAssertFalse(bandeja.estaVacia)
        XCTAssertEqual(bandeja.todos.count, 6)
    }

    func test_bandejaVacia() {
        let bandeja = BandejaComunicados.agrupar([])
        XCTAssertTrue(bandeja.estaVacia)
        XCTAssertTrue(bandeja.enCalma)
        XCTAssertEqual(bandeja.pendientes, 0)
    }

    // MARK: - El globito

    func test_pendientes_cuentaSoloLoQueReclama() {
        let bandeja = BandejaComunicados.agrupar([
            comunicado(id: "1", kind: .pregunta, state: .publicado),      // reclama
            comunicado(id: "2", kind: .tarea, state: .visto, seen: Date()), // reclama (no hecha)
            comunicado(id: "3", kind: .protocolo, state: .visto, seen: Date()), // no
            comunicado(id: "4", kind: .nota, state: .visto, seen: Date()),      // no
            comunicado(id: "5", kind: .foco, state: .visto, seen: Date()),      // no
        ])
        XCTAssertEqual(bandeja.pendientes, 2)
        XCTAssertEqual(bandeja.pendientesParaHacer, 1)
        XCTAssertFalse(bandeja.enCalma)
    }

    /// El foco NO reclama nunca. Si lo hiciera, la bandeja no podría estar en
    /// calma jamás y el globito sería permanente — que es como se enseña a
    /// ignorar un globito.
    func test_focoVisto_noReclamaNunca() {
        let foco = comunicado(id: "1", kind: .foco, state: .visto, seen: Date())
        XCTAssertFalse(foco.reclama)
        XCTAssertTrue(BandejaComunicados.agrupar([foco]).enCalma)
    }

    /// Un foco recién publicado SÍ reclama: no lo has abierto todavía.
    func test_focoSinAbrir_siReclama() {
        XCTAssertTrue(comunicado(id: "1", kind: .foco, state: .publicado).reclama)
    }

    // MARK: - Las insignias

    func test_insignia_elVencimientoGanaAlEstado() {
        let vence = comunicado(id: "1", kind: .tarea, state: .visto, dueDate: "2026-08-09", seen: Date())
        XCTAssertEqual(vence.insignia(hoy: hoy("2026-08-09")), .venceHoy)

        let vencida = comunicado(id: "2", kind: .tarea, state: .visto, dueDate: "2026-08-05", seen: Date())
        XCTAssertEqual(vencida.insignia(hoy: hoy("2026-08-09")), .vencida)

        let futura = comunicado(id: "3", kind: .tarea, state: .visto, dueDate: "2026-08-16", seen: Date())
        XCTAssertEqual(futura.insignia(hoy: hoy("2026-08-09")), .visto)
    }

    /// Una tarea ya cerrada no puede seguir gritando que vence: el vencimiento
    /// solo manda mientras quede algo por hacer.
    func test_insignia_tareaHechaNoVence() {
        let hecha = comunicado(
            id: "1", kind: .tarea, state: .hecho, dueDate: "2026-08-05",
            seen: Date(), done: Date()
        )
        XCTAssertEqual(hecha.insignia(hoy: hoy("2026-08-09")), .hecho)
    }

    func test_insignia_porEstado() {
        XCTAssertEqual(comunicado(id: "1", kind: .nota).insignia(), .nuevo)
        XCTAssertEqual(comunicado(id: "2", kind: .nota, state: .visto, seen: Date()).insignia(), .visto)
        let respondida = comunicado(
            id: "3", kind: .pregunta, state: .respondido,
            answered: ("9", Date())
        )
        XCTAssertEqual(respondida.insignia(), .respondido)
    }

    func test_textoDeVencimiento() {
        let base = hoy("2026-08-09")
        XCTAssertEqual(comunicado(id: "1", kind: .tarea, dueDate: "2026-08-09").venceTexto(ahora: base), "Vence hoy")
        XCTAssertEqual(comunicado(id: "2", kind: .tarea, dueDate: "2026-08-10").venceTexto(ahora: base), "Vence mañana")
        XCTAssertEqual(comunicado(id: "3", kind: .tarea, dueDate: "2026-08-08").venceTexto(ahora: base), "Venció ayer")
        XCTAssertEqual(comunicado(id: "4", kind: .tarea, dueDate: "2026-08-06").venceTexto(ahora: base), "Venció hace 3 días")
        // Dentro de la semana, el día sitúa mejor que la fecha.
        XCTAssertEqual(comunicado(id: "5", kind: .tarea, dueDate: "2026-08-14").venceTexto(ahora: base), "Vence el viernes")
        // Pasada la semana, la fecha.
        XCTAssertEqual(comunicado(id: "6", kind: .tarea, dueDate: "2026-09-01").venceTexto(ahora: base), "Vence el 1 de septiembre")
        XCTAssertNil(comunicado(id: "7", kind: .tarea).venceTexto(ahora: base))
    }

    // MARK: - El nombre del coach

    /// Nunca se cablea un nombre: si el servidor no lo manda, «tu coach».
    func test_nombreDelCoach_saleDelServidorYDegradaSinInventarlo() {
        XCTAssertEqual(comunicado(id: "1", kind: .nota).nombreCoach, "Pablo")
        XCTAssertEqual(comunicado(id: "2", kind: .nota, coachName: nil).nombreCoach, "tu coach")
        XCTAssertEqual(comunicado(id: "3", kind: .nota, coachName: "   ").nombreCoach, "tu coach")
    }

    // MARK: - El protocolo

    func test_protocolo_seCierraSoloAlMarcarElUltimoPasoYSeReabreAlDesmarcar() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a"), paso("b"), paso("c")]
        )
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertEqual(p.state, .publicado)

        p.aplicarMarca(itemId: "a", hecho: true)
        // Marcar un paso también es abrirlo.
        XCTAssertEqual(p.state, .visto)
        XCTAssertNotNil(p.seenAt)
        XCTAssertEqual(p.pasosHechos, 1)

        p.aplicarMarca(itemId: "b", hecho: true)
        p.aplicarMarca(itemId: "c", hecho: true)
        XCTAssertTrue(p.protocoloCompleto)
        XCTAssertEqual(p.state, .hecho)
        XCTAssertNotNil(p.doneAt)

        // Desmarcar uno lo REABRE: un «hecho» con pasos a medias serían dos
        // verdades del mismo hecho.
        p.aplicarMarca(itemId: "b", hecho: false)
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertEqual(p.state, .visto)
        XCTAssertNil(p.doneAt)
        XCTAssertEqual(p.pasosHechos, 2)
    }

    /// Decir «hecho» de un protocolo marca TODOS sus pasos — si no, la pantalla
    /// del atleta y la del coach contarían cosas distintas del mismo hecho.
    func test_protocolo_hechoExplicitoMarcaTodosLosPasos() {
        var p = comunicado(id: "1", kind: .protocolo, items: [paso("a"), paso("b")])
        p.aplicarHecho()
        XCTAssertEqual(Set(p.markedItemIds), ["a", "b"])
        XCTAssertEqual(p.state, .hecho)
        XCTAssertTrue(p.protocoloCompleto)
    }

    /// Un protocolo sin pasos no está «completo» por vacío: si lo estuviera, se
    /// cerraría solo al abrirlo.
    func test_protocoloSinPasos_noEstaCompletoPorVacio() {
        let p = comunicado(id: "1", kind: .protocolo)
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.puedeMarcarseHecho)
    }

    // MARK: - La casilla es del paso, no del tipo

    /// Los pasos de lectura no cuentan para nada de lo derivado. Si contaran, el
    /// protocolo se quedaría abierto para siempre esperando una marca que nadie
    /// puede poner.
    func test_pasosDeLectura_noCuentanParaElAvanceNiParaElHecho() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a"), paso("b", checkable: false), paso("c")]
        )
        XCTAssertEqual(p.pasosMarcables.map(\.id), ["a", "c"])
        XCTAssertTrue(p.tienePasosMarcables)

        p.aplicarMarca(itemId: "a", hecho: true)
        p.aplicarMarca(itemId: "c", hecho: true)
        XCTAssertEqual(p.pasosHechos, 2)
        XCTAssertTrue(p.protocoloCompleto)
        XCTAssertEqual(p.state, .hecho)
    }

    /// Marcar un paso de lectura no hace nada: el servidor lo rechaza con un 409
    /// y pintar el cambio aquí sería enseñar algo que va a rebotar.
    func test_marcarUnPasoDeLectura_seIgnora() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a"), paso("b", checkable: false)]
        )
        p.aplicarMarca(itemId: "b", hecho: true)
        XCTAssertTrue(p.markedItemIds.isEmpty)
        XCTAssertEqual(p.state, .publicado)
        XCTAssertNil(p.seenAt)
    }

    /// El «hecho» explícito marca las CASILLAS y no toca las líneas de lectura:
    /// marcarlas sería inventarse un dato que nadie pidió.
    func test_hechoExplicito_soloMarcaLasCasillas() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a"), paso("b", checkable: false), paso("c")]
        )
        p.aplicarHecho()
        XCTAssertEqual(Set(p.markedItemIds), ["a", "c"])
        XCTAssertEqual(p.state, .hecho)
    }

    /// Un protocolo de pura lectura (con pasos, pero ninguno marcable) no enseña
    /// avance ni botón de cerrar: verlo ya lo marca como visto y punto.
    func test_protocoloDeLectura_noOfreceHecho() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a", checkable: false), paso("b", checkable: false)]
        )
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.puedeMarcarseHecho)
        XCTAssertFalse(p.protocoloCompleto)
        XCTAssertEqual(p.pasosHechos, 0)

        p.aplicarVisto()
        XCTAssertEqual(p.state, .visto)
        XCTAssertFalse(p.reclama)
    }

    /// Una tarea siempre se puede cerrar mientras no lo esté; lo que no se
    /// cierra jamás no ofrece el botón.
    func test_quienPuedeMarcarseHecho() {
        XCTAssertTrue(comunicado(id: "1", kind: .tarea).puedeMarcarseHecho)
        XCTAssertFalse(
            comunicado(id: "2", kind: .tarea, state: .hecho, seen: Date(), done: Date())
                .puedeMarcarseHecho
        )
        XCTAssertFalse(comunicado(id: "3", kind: .pregunta).puedeMarcarseHecho)
        XCTAssertFalse(comunicado(id: "4", kind: .nota).puedeMarcarseHecho)
        XCTAssertFalse(comunicado(id: "5", kind: .foco).puedeMarcarseHecho)
    }

    /// La línea de la bandeja cuenta casillas, no pasos: «llevas 2 de 5» cuando
    /// tres son texto sería un avance que el atleta no puede completar.
    func test_lineaDeBandeja_deUnProtocoloCuentaCasillas() {
        var p = comunicado(
            id: "1", kind: .protocolo,
            items: [paso("a"), paso("b"), paso("c", checkable: false)]
        )
        p.aplicarMarca(itemId: "a", hecho: true)
        XCTAssertEqual(ListaComunicados.detalleProtocolo(p), "Llevas 1 de 2 pasos.")

        // Sin casillas no hay avance que enseñar: se queda con su propia línea.
        let lectura = comunicado(
            id: "2", kind: .protocolo, body: "Cena pronto y sin fibra.",
            items: [paso("x", checkable: false)]
        )
        XCTAssertEqual(ListaComunicados.detalleProtocolo(lectura), "Cena pronto y sin fibra.")
    }

    // MARK: - Los demás actos

    func test_visto_selloUnaSolaVez() {
        var c = comunicado(id: "1", kind: .nota)
        let primero = Date(timeIntervalSince1970: 1_000)
        c.aplicarVisto(ahora: primero)
        c.aplicarVisto(ahora: Date(timeIntervalSince1970: 2_000))
        XCTAssertEqual(c.seenAt, primero)
        XCTAssertEqual(c.state, .visto)
    }

    func test_responder_cierraLaPreguntaYGuardaLaElegida() {
        let opciones = [
            ComunicadoItem(id: "9001", position: 0, label: nil, content: "Jueves 12", consequence: "Se adelanta todo."),
            ComunicadoItem(id: "9002", position: 1, label: nil, content: "Sábado 14", consequence: "Nada cambia."),
        ]
        var p = comunicado(id: "1", kind: .pregunta, blocks: true, items: opciones)
        XCTAssertTrue(p.reclama)

        p.aplicarRespuesta(itemId: "9002")
        XCTAssertEqual(p.state, .respondido)
        XCTAssertEqual(p.opcionElegida?.content, "Sábado 14")
        XCTAssertNotNil(p.seenAt)
        XCTAssertFalse(p.reclama)

        // Cambiar de idea es elegir otra vez: el servidor guarda la última.
        p.aplicarRespuesta(itemId: "9001")
        XCTAssertEqual(p.opcionElegida?.id, "9001")
        XCTAssertEqual(p.state, .respondido)
    }

    func test_tareaHecha_dejaDeReclamar() {
        var t = comunicado(id: "1", kind: .tarea, dueDate: "2026-08-09")
        XCTAssertTrue(t.reclama)
        t.aplicarHecho()
        XCTAssertEqual(t.state, .hecho)
        XCTAssertFalse(t.reclama)
    }

    /// La respuesta del servidor pisa los sellos locales enteros: es la que sabe
    /// si el protocolo quedó cerrado al marcar el último paso.
    func test_estadoDelServidor_pisaElOptimista() {
        var p = comunicado(id: "1", kind: .protocolo, items: [paso("a"), paso("b")])
        p.aplicarMarca(itemId: "a", hecho: true)
        XCTAssertEqual(p.state, .visto)

        let servidor = ComunicadoRecipientState(
            communicationId: "1",
            state: .hecho,
            seenAt: Date(timeIntervalSince1970: 10),
            doneAt: Date(timeIntervalSince1970: 20),
            answeredItemId: nil,
            answeredAt: nil,
            markedItemIds: ["a", "b"]
        )
        p.aplicar(servidor)
        XCTAssertEqual(p.state, .hecho)
        XCTAssertEqual(Set(p.markedItemIds), ["a", "b"])
        XCTAssertEqual(p.seenAt, Date(timeIntervalSince1970: 10))
    }

    // MARK: - Qué se hace con un acto que falla

    func test_actoFallido_soloLoTransitorioEntraEnLaCola() {
        XCTAssertEqual(ComunicadoActOutcome.forError(APIError.offline), .queueForReplay)
        XCTAssertEqual(ComunicadoActOutcome.forError(APIError.http(500, Data())), .queueForReplay)
        XCTAssertEqual(ComunicadoActOutcome.forError(URLError(.timedOut)), .queueForReplay)
        // Deterministas: reenviarlos fallaría idéntico para siempre.
        XCTAssertEqual(ComunicadoActOutcome.forError(APIError.http(404, Data())), .revert)
        XCTAssertEqual(ComunicadoActOutcome.forError(APIError.http(409, Data())), .revert)
        XCTAssertEqual(ComunicadoActOutcome.forError(APIError.http(422, Data())), .revert)
    }

    // MARK: - Las rutas y los cuerpos de la cola

    func test_rutasDeLosActos() {
        XCTAssertEqual(ComunicadosService.actPath("102", "seen"), "/api/athlete/communications/102/seen")
        XCTAssertEqual(ComunicadosService.actPath("102", "marks"), "/api/athlete/communications/102/marks")
    }

    /// Los cuerpos que la cola guarda en disco se reenvían VERBATIM, sin pasar por
    /// el codificador que convierte a snake_case: si las claves no fueran ya las
    /// del servidor, cada reenvío sería un 422 silencioso.
    func test_cuerposDeLaCola_llevanLasClavesDelServidor() throws {
        let marca = try XCTUnwrap(ComunicadosService.encodeMarkBody(itemId: "9101", done: true))
        let objetoMarca = try XCTUnwrap(
            JSONSerialization.jsonObject(with: marca) as? [String: Any]
        )
        XCTAssertEqual(objetoMarca["item_id"] as? String, "9101")
        XCTAssertEqual(objetoMarca["done"] as? Bool, true)

        let respuesta = try XCTUnwrap(ComunicadosService.encodeAnswerBody(itemId: "9002"))
        let objetoRespuesta = try XCTUnwrap(
            JSONSerialization.jsonObject(with: respuesta) as? [String: Any]
        )
        XCTAssertEqual(objetoRespuesta["item_id"] as? String, "9002")

        // Un «visto» no lleva cuerpo, pero la cola reenvía bytes: JSON válido.
        let vacio = try XCTUnwrap(ComunicadosService.encodeEmptyBody())
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: vacio) as? [String: Any])
    }

    // MARK: - El push

    func test_push_deUnComunicadoAbreLaBandejaConSuId() {
        let kind = PushNotificationKind(rawValue: "coach_communication")
        XCTAssertEqual(kind, .coachCommunication)
        XCTAssertEqual(
            kind?.destination(userInfo: ["type": "coach_communication", "communication_id": "102"]),
            .coachInbox(communicationId: "102")
        )
        // Sin id sigue llevando a la bandeja: el comunicado está ahí igual.
        XCTAssertEqual(kind?.destination(userInfo: [:]), .coachInbox(communicationId: nil))
    }
}
