import Foundation

// LA BANDEJA — el conjunto y su estado, que es el sujeto de «Del coach».
//
// Vive fuera de `ComunicadoModels` porque no es del comunicado: un comunicado
// suelto no sabe si te bloquea NADA; eso sólo se ve mirando el montón. Aquí está
// cómo se reparte (por TIPO, nunca por estado), qué sigue reclamando algo y qué
// significa estar al día — que es información y hoy no la da ninguna otra
// pantalla de la app.

// MARK: - La bandeja

/// La bandeja ya repartida en sus cajones. El ORDEN dentro de cada cajón es el
/// del servidor y no se toca: lo pone el dominio compartido (primero lo que
/// bloquea, luego lo que vence, luego lo que no has abierto) y reordenarlo aquí
/// sería tener dos criterios de qué es urgente.
struct BandejaComunicados: Equatable {
    /// Las preguntas, arriba del todo. Una decisión que cambia el plan no puede
    /// competir por sitio con una nota.
    var preguntas: [Comunicado] = []
    /// Lo que pide un acto que se cierra: protocolos y tareas.
    var paraHacer: [Comunicado] = []
    /// El foco, que no caduca.
    var focos: [Comunicado] = []
    var notas: [Comunicado] = []

    var estaVacia: Bool {
        preguntas.isEmpty && paraHacer.isEmpty && focos.isEmpty && notas.isEmpty
    }

    /// Todo lo que sigue reclamando algo — el globito de la cabecera.
    var pendientes: Int {
        todos.filter(\.reclama).count
    }

    /// Lo pendiente DENTRO de «Para hacer», que es lo que dice su accesorio.
    var pendientesParaHacer: Int {
        paraHacer.filter(\.reclama).count
    }

    /// La bandeja en calma: nada sin ver, nada sin responder, nada sin hacer.
    var enCalma: Bool { pendientes == 0 }

    var todos: [Comunicado] {
        preguntas + paraHacer + focos + notas
    }

    /// El reparto es por TIPO, no por estado: una pregunta respondida sigue
    /// siendo la pregunta (enseña lo que elegiste, que en octubre es justo lo
    /// que el atleta viene a buscar) y una tarea hecha se queda tachada en su
    /// sitio en vez de desaparecer.
    static func agrupar(_ comunicados: [Comunicado]) -> BandejaComunicados {
        var bandeja = BandejaComunicados()
        for c in comunicados {
            switch c.kind {
            case .pregunta:            bandeja.preguntas.append(c)
            case .protocolo, .tarea:   bandeja.paraHacer.append(c)
            case .foco:                bandeja.focos.append(c)
            case .nota:                bandeja.notas.append(c)
            }
        }
        return bandeja
    }
}

/// La respuesta de la bandeja. `pending` lo cuenta el servidor con la misma
/// regla que `reclama`; se decodifica para poder comprobar que las dos
/// coinciden, pero lo que se pinta sale siempre del estado local (que sí sabe
/// lo que el atleta acaba de marcar sin conexión).
struct ComunicadosInbox: Codable, Equatable {
    @LossyArray var communications: [Comunicado]
    let pending: Int

    static let vacia = ComunicadosInbox(communications: [], pending: 0)

    init(communications: [Comunicado], pending: Int) {
        self._communications = LossyArray(wrappedValue: communications)
        self.pending = pending
    }
}
