import SwiftUI

// LA FILA DE LA BANDEJA — tipo · estado · título · una línea · ancla.
//
// Ese orden y no otro: el atleta decide si abre por el tipo y por el estado, y lee el título por el medio.
// A la izquierda va SIEMPRE una columna de 48 pt, para que el texto de todas las filas arranque en el
// mismo sitio: la ficha del tipo (con el acento del club si la fila aún te reclama) o, en una tarea, el
// círculo con que se cierra desde la propia lista.
//
// La fila no es una tarjeta: vive dentro de una (`ListaDeFilasComunicado`, o la de la pregunta). Sí lleva su padding y su
// área táctil entera.

/// El círculo con que se cierra una tarea desde la lista. `onTap` nulo = ya está cerrada y es un sello.
struct MarcaDeFila {
    let hecho: Bool
    let etiqueta: String
    var onTap: (() -> Void)?
}

struct FilaComunicado<Pie: View>: View {
    let comunicado: Comunicado
    var marca: MarcaDeFila?
    /// Sustituye a la línea de resumen cuando el detalle manda (una tarea con fecha, una pregunta ya
    /// contestada).
    var detalle: String?
    /// Cuántas líneas de la línea de resumen se ven. Una fila de lista no se come la pantalla; el foco, que
    /// es un recordatorio corto, se lee entero.
    var lineasDeDetalle: Int? = 3
    let onAbrir: () -> Void
    @ViewBuilder var pie: () -> Pie

    /// Tachar es «esto ya no hay que hacerlo», y solo lo cumple `hecho`. Una pregunta respondida sigue
    /// siendo la pregunta: tacharla se lee como que se anuló, y lo que pasó es lo contrario (se contestó y
    /// cambió el plan).
    private var tachado: Bool { comunicado.state == .hecho }
    private var apagado: Bool { tachado || comunicado.state == .respondido }
    private var linea: String? {
        let texto = detalle ?? comunicado.body
        return texto?.isEmpty == false ? texto : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m + 2) {
                izquierda
                Button {
                    Haptics.light()
                    onAbrir()
                } label: {
                    cuerpo
                }
                .buttonStyle(PressScaleStyle(escala: 0.985))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiquetaDeVoz)
                .accessibilityAddTraits(.isButton)
            }
            pie()
        }
        .padding(EdgeInsets(top: 14, leading: Theme.Spacing.l, bottom: 14, trailing: Theme.Spacing.l))
    }

    @ViewBuilder
    private var izquierda: some View {
        if let marca {
            BotonMarcarComunicado(hecho: marca.hecho, etiqueta: marca.etiqueta, onTap: marca.onTap)
        } else {
            FichaDia(tono: comunicado.reclama && comunicado.kind.pideAccion ? .realce : .normal) {
                IconoSF(comunicado.kind.simbolo, tam: 24)
            }
                // El área táctil de la columna es la de la fila; la ficha (44) se centra en los 48.
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
        }
    }

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs + 2) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.s) {
                    tipo
                    Spacer(minLength: Theme.Spacing.s)
                    InsigniaComunicado(insignia: comunicado.insignia())
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    tipo
                    InsigniaComunicado(insignia: comunicado.insignia())
                }
            }
            Text(comunicado.title)
                .papel(.cuerpoFuerte)
                .foregroundStyle(apagado ? Theme.Color.muted : Theme.Color.foreground)
                .strikethrough(tachado, color: Theme.Color.muted)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let linea {
                Text(linea)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(lineasDeDetalle)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: Theme.Spacing.m) {
                if let ancla = comunicado.anchorKind.etiqueta {
                    Text(ancla)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
                GlifoAudioComunicado(comunicado: comunicado)
                Spacer(minLength: 0)
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var tipo: some View {
        Text(comunicado.kind.etiqueta)
            .papel(.etiqueta)
            .foregroundStyle(Theme.Color.muted)
    }

    /// Lo que lee VoiceOver de la fila entera, en el orden en que se decide: qué es, cómo está, qué dice.
    private var etiquetaDeVoz: String {
        [
            comunicado.kind.etiqueta.lowercased(),
            comunicado.insignia().etiqueta.lowercased(),
            comunicado.title,
            linea,
            comunicado.anchorKind.etiqueta,
            comunicado.tieneAudio ? "lleva nota de voz" : nil,
        ]
        .compactMap { $0 }
        .joined(separator: ". ")
    }
}

extension FilaComunicado where Pie == EmptyView {
    init(
        comunicado: Comunicado,
        marca: MarcaDeFila? = nil,
        detalle: String? = nil,
        lineasDeDetalle: Int? = 3,
        onAbrir: @escaping () -> Void
    ) {
        self.init(
            comunicado: comunicado, marca: marca, detalle: detalle,
            lineasDeDetalle: lineasDeDetalle, onAbrir: onAbrir, pie: { EmptyView() }
        )
    }
}
