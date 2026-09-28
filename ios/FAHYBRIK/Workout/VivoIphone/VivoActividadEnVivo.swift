import Foundation

// FUERA DE LA APP (I11) — la Live Activity de la pantalla de bloqueo y la Isla
// Dinámica para TODAS las familias, con la MISMA lámina que el vivo: el héroe,
// la posición, el veredicto y la acción primaria. Reutiliza el controlador de
// la carrera (`RunLiveActivityController`) y su contrato (`RunActivityAttributes`),
// ampliado con los campos de la lámina (opcionales: la carrera de calle sigue
// mandando los suyos y el widget pinta uno u otro).
//
// LO QUE NO HACE, y hay que saberlo: la acción primaria se PINTA pero no se
// PULSA. Un botón interactivo en una Live Activity exige un `LiveActivityIntent`
// (App Intents) compilado en la app y en la extensión de widgets: es capacidad
// nueva y no se inventa aquí. La sesión de familia que la quiera la añade.

@MainActor
final class VivoActividadEnVivo {
    private let controlador = RunLiveActivityController()
    private var titulo = ""
    private var ultimoForzado = ""

    func empezar(titulo: String) {
        self.titulo = titulo
    }

    func actualizar(_ c: VivoIphoneCuadro, pausado: Bool) {
        let estado = RunActivityAttributes.ContentState(
            paceLabel: c.heroe.clase == .ritmo ? c.heroe.texto : "",
            legLabel: c.posicion.first ?? "",
            distanceLabel: c.estado.sesion.metros.map { let d = Vivo.fmtDistancia($0); return "\(d.valor) \(d.unidad)" } ?? "",
            timeLabel: c.crono.valor,
            zoneLabel: c.heroe.zona.map { "Z\($0.n)" } ?? "",
            paused: pausado,
            heroLabel: c.heroe.texto,
            heroUnit: c.heroe.unidad ?? "",
            heroCaption: c.heroe.etiqueta ?? "",
            positionLabel: c.posicion.joined(separator: " · "),
            verdictLabel: c.banda?.palabra.map { "\($0.marca.map { "\($0) " } ?? "")\($0.texto)" } ?? "",
            actionLabel: c.primaria?.clave.texto ?? ""
        )
        // Empieza a la primera y fuerza el envío cuando cambia algo que no es una cifra.
        controlador.start(title: titulo, initial: estado)
        let clave = "\(estado.positionLabel ?? "")|\(estado.actionLabel ?? "")|\(pausado)"
        let fuerza = clave != ultimoForzado
        ultimoForzado = clave
        controlador.update(estado, force: fuerza, now: ProcessInfo.processInfo.systemUptime)
    }

    func terminar() {
        controlador.end()
    }
}
