import Foundation
import Observation

// LOS ACTOS del atleta sobre un comunicado, en un solo sitio.
//
// Los cuatro (visto · paso marcado · hecho · respondido) son la MISMA secuencia
// con distinta llamada dentro, y escribirla cuatro veces en cuatro pantallas es
// la forma más fácil de que a una se le olvide deshacer el cambio cuando falla:
//
//   1. se aplica EN LOCAL y se pinta al momento (el atleta está de pie, sudando,
//      en el pasillo de boxes: el círculo se marca cuando lo toca, no cuando
//      contesta un servidor),
//   2. se envía,
//   3. si contesta, manda su respuesta — es la que sabe si el protocolo quedó
//      cerrado al marcar el último paso,
//   4. si no contesta por algo transitorio, el acto se guarda en la cola y se
//      reenvía solo; si el fallo es determinista, el cambio se DESHACE y se
//      dice por qué. Un cambio que se pinta y luego se desvanece sin explicación
//      es peor que no haberlo pintado.
//
// La cola es la de siempre (`RequestQueue`), la misma que ya drena `AppShell` al
// arrancar y al volver a primer plano.

@MainActor
@Observable
final class ComunicadosAcciones {
    /// Lo que le pasó al último acto — lo pinta `AvisoEnvioComunicado`.
    private(set) var envio: EnvioComunicado = .ok

    private let store: AppDataStore
    private let bearer: String?

    init(store: AppDataStore, bearer: String?) {
        self.store = store
        self.bearer = bearer
    }

    // MARK: - Los cuatro actos

    /// Abrirlo. Se manda UNA vez: la fecha en que lo abriste es un hecho, no un
    /// contador de aperturas.
    func marcarVisto(_ comunicado: Comunicado) async {
        guard comunicado.seenAt == nil else { return }
        await ejecutar(
            comunicado,
            aplicar: { $0.aplicarVisto() },
            cuerpo: ComunicadosService.encodeEmptyBody(),
            acto: "seen",
            // Un «visto» perdido no le quita nada al atleta: no reclama, no
            // cierra nada, y la próxima apertura lo vuelve a intentar.
            silencioso: true
        ) { bearer, id in
            try await ComunicadosService.markSeen(bearer: bearer, id: id)
        }
    }

    /// Marcar o desmarcar UN paso del protocolo.
    func marcarPaso(_ comunicado: Comunicado, itemId: String, hecho: Bool) async {
        await ejecutar(
            comunicado,
            aplicar: { $0.aplicarMarca(itemId: itemId, hecho: hecho) },
            cuerpo: ComunicadosService.encodeMarkBody(itemId: itemId, done: hecho),
            acto: "marks"
        ) { bearer, id in
            try await ComunicadosService.setMark(
                bearer: bearer, id: id, itemId: itemId, done: hecho
            )
        }
    }

    /// Cerrar una tarea, o dar por hecho un protocolo entero.
    func marcarHecho(_ comunicado: Comunicado) async {
        await ejecutar(
            comunicado,
            aplicar: { $0.aplicarHecho() },
            cuerpo: ComunicadosService.encodeEmptyBody(),
            acto: "done"
        ) { bearer, id in
            try await ComunicadosService.markDone(bearer: bearer, id: id)
        }
    }

    /// Responder una pregunta. Es lo que la cierra — nunca «hecho».
    func responder(_ comunicado: Comunicado, itemId: String) async {
        await ejecutar(
            comunicado,
            aplicar: { $0.aplicarRespuesta(itemId: itemId) },
            cuerpo: ComunicadosService.encodeAnswerBody(itemId: itemId),
            acto: "answer"
        ) { bearer, id in
            try await ComunicadosService.answer(bearer: bearer, id: id, itemId: itemId)
        }
    }

    // MARK: - La secuencia, una sola vez

    private func ejecutar(
        _ comunicado: Comunicado,
        aplicar: (inout Comunicado) -> Void,
        cuerpo: Data?,
        acto: String,
        silencioso: Bool = false,
        enviar: @escaping (String, String) async throws -> ComunicadoRecipientState
    ) async {
        // El acto se aplica sobre lo que HAY AHORA en la porción compartida, no
        // sobre la copia con la que se pintó la pantalla: entre que se dibujó una
        // fila y se toca puede haber entrado otro acto (el «visto» al abrir, un
        // paso marcado), y escribir encima de una copia vieja lo borraría.
        guard let previo = store.bandejaComunicados.todos.first(where: { $0.id == comunicado.id })
        else { return }
        var optimista = previo
        aplicar(&optimista)
        store.applyCommunication(optimista)
        if !silencioso { envio = .ok }

        guard let bearer else {
            // Sin sesión no hay nada que enviar ni cola que valga: se deshace.
            store.applyCommunication(previo)
            if !silencioso { envio = .fallido("No se pudo guardar. Vuelve a entrar y prueba otra vez.") }
            return
        }

        do {
            let estado = try await enviar(bearer, comunicado.id)
            var confirmado = optimista
            confirmado.aplicar(estado)
            store.applyCommunication(confirmado)
            if !silencioso { envio = .ok }
        } catch {
            switch ComunicadoActOutcome.forError(error) {
            case .queueForReplay:
                // El cambio local SE QUEDA: la cola lo entrega en cuanto haya
                // señal, y borrarlo mientras tanto sería perder lo que el atleta
                // acaba de hacer.
                if let cuerpo {
                    await RequestQueue.shared.enqueue(
                        path: ComunicadosService.actPath(comunicado.id, acto),
                        body: cuerpo,
                        bearer: bearer
                    )
                    if !silencioso { envio = .enCola }
                } else {
                    store.applyCommunication(previo)
                    if !silencioso { envio = .fallido(Self.mensajeGenerico) }
                }
            case .revert:
                store.applyCommunication(previo)
                if !silencioso { envio = .fallido(Self.mensaje(for: error)) }
            }
        }
    }

    // MARK: - Qué se le dice al atleta

    private static let mensajeGenerico =
        "No se pudo guardar. Prueba otra vez en un momento."

    /// En la voz del atleta y sin códigos: lo único que le sirve saber es si
    /// esto lo arregla él o ya no está en su mano.
    private static func mensaje(for error: Error) -> String {
        guard case APIError.http(let status, _) = error else { return mensajeGenerico }
        switch status {
        case 404:
            return "Tu coach ha retirado esto. Ya no hace falta que lo hagas."
        case 409:
            return "Esto no se cierra así. Vuelve a abrirlo para ver qué te pide."
        default:
            return mensajeGenerico
        }
    }
}
