import SwiftUI

// LOS OCHO BLOQUES DE LA PORTADA — cada uno responde su pregunta (§3) desde el
// contrato, con sus cuatro estados resueltos (A10) y las piezas del kit. La
// portada los apila; los detalles (segunda tanda) reutilizan varios. Ningún
// bloque escribe prosa de hueco: viene de `AnaliticasEstados`.
//
// Un bloque PENDIENTE (el servidor aún no lo sirve) pinta su «muy pronto», sin
// inventar nada. Los bloques ya servidos (estado, forma, semanas) tienen su
// composición del contrato; los demás se pintan POR FORMA (`AnaliticasBloquesPorForma`)
// en cuanto lleguen lecturas, y la segunda tanda los afina.

/// Lo que todo bloque necesita del panel, calculado UNA vez por la portada.
struct ContextoDeBloque {
    let panel: PanelAnaliticas
    let estados: [BloqueDelPanel: EstadoBloque]
    /// Ancho útil del lienzo, para decidir cuántas columnas caben.
    let ancho: CGFloat
    let onSalida: (DestinoDeSalida) -> Void
    let onAbrir: (AnaliticasDestino) -> Void

    var hoy: String { panel.hoy }
    var metodo: MetodoDelPanel { panel.metodo }
    func estado(_ b: BloqueDelPanel) -> EstadoBloque { estados[b] ?? .vacio }
    func lecturas(_ b: BloqueDelPanel) -> [LecturaAnalitica] { panel.bloques[b] }
    func pendiente(_ b: BloqueDelPanel) -> Bool { panel.estaPendiente(b) }

    /// Los estados de los ocho bloques, de una vez. Un bloque pendiente no se juzga.
    static func estados(de p: PanelAnaliticas) -> [BloqueDelPanel: EstadoBloque] {
        var out: [BloqueDelPanel: EstadoBloque] = [:]
        for b in BloqueDelPanel.allCases where b != .desconocido {
            out[b] = p.estaPendiente(b) ? .vacio : AnaliticasEstados.estado(de: p.bloques[b], hoy: p.hoy, metodo: p.metodo)
        }
        return out
    }
}

/// A dónde lleva un toque en la portada: al detalle de un bloque o de una
/// familia (placeholders hasta la segunda tanda) o a Dispositivos y apps.
enum AnaliticasDestino: Hashable {
    case bloque(BloqueDelPanel)
    case familia(FamiliaLectura)
    case dispositivos
}

/// El hueco de un bloque: pendiente, vacío, poco o viejo. Nada si está lleno.
struct AnaliticasHuecoDeBloque: View {
    let ctx: ContextoDeBloque
    let bloque: BloqueDelPanel

    var body: some View {
        if ctx.pendiente(bloque) {
            AnaliticasHueco(texto: AnaliticasEstados.pendiente, onSalida: ctx.onSalida)
        } else {
            let estado = ctx.estado(bloque)
            if estado != .lleno {
                AnaliticasHueco(
                    texto: AnaliticasEstados.textoHueco(bloque: bloque, estado: estado, lecturas: ctx.lecturas(bloque), hoy: ctx.hoy, metodo: ctx.metodo),
                    viejo: estado == .viejo,
                    onSalida: ctx.onSalida
                )
            }
        }
    }
}

/// Un bloque de la portada, por su clave.
struct AnaliticasBloque: View {
    let ctx: ContextoDeBloque
    let bloque: BloqueDelPanel

    var body: some View {
        switch bloque {
        case .forma: AnaliticasBloqueForma(ctx: ctx)
        case .semanas: AnaliticasBloqueSemanas(ctx: ctx)
        case .intensidad: AnaliticasBloqueIntensidad(ctx: ctx)
        case .progreso: AnaliticasBloqueProgreso(ctx: ctx)
        case .records: AnaliticasBloqueRecords(ctx: ctx)
        case .carrera: AnaliticasBloqueCarrera(ctx: ctx)
        case .recuperacion: AnaliticasBloqueRecuperacion(ctx: ctx)
        case .estado, .desconocido: EmptyView()
        }
    }
}
