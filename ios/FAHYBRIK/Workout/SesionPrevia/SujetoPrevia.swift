import SwiftUI

// EL SUJETO DE LA FICHA PREVIA — la sesión que vas a hacer, en grande, con el acento del club («haz esto
// ahora»): la modalidad y la duración, el título, la zona que pide y la fase del plan; y, si la hay, la
// nota del coach. Sin acción dentro: la única puerta es la acción anclada de abajo (como en el Plan).

struct SujetoSesionPrevia: View {
    let lectura: LecturaSesionPrevia

    var body: some View {
        SujetoDia(tono: .accion, etiqueta: etiqueta) {
            KickerDia(lectura.kicker)
            TituloDia(lectura.titulo)
            if lectura.zonaObjetivo != nil || lectura.contexto != nil {
                FlowLayout(spacing: Theme.Spacing.s) {
                    if let zona = lectura.zonaObjetivo {
                        InfoPill(text: "Objetivo \(zona.label)", estilo: .sobreAccion)
                    }
                    if let contexto = lectura.contexto {
                        InfoPill(text: contexto, estilo: .sobreAccion)
                    }
                }
            }
        } abajo: {
            if let nota = lectura.notaDelCoach {
                NotaDelCoachPrevia(texto: nota)
            }
        }
    }

    private var etiqueta: String {
        var partes = [lectura.titulo, lectura.kicker]
        if let zona = lectura.zonaObjetivo { partes.append("Objetivo \(zona.label)") }
        if let contexto = lectura.contexto { partes.append(contexto) }
        if let nota = lectura.notaDelCoach { partes.append("Nota de tu coach: \(nota)") }
        return partes.joined(separator: ". ")
    }
}

/// La nota del coach dentro del sujeto. El brief no recibe el nombre del coach, así que la atribución
/// es la honesta, sin nombre, en vez de inventar uno.
private struct NotaDelCoachPrevia: View {
    let texto: String
    @Environment(\.tonoDia) private var tono

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Nota de tu coach").papel(.etiqueta)
            ApoyoDia(texto)
        }
        .foregroundStyle(tono.papeles.tinta)
        .padding(.top, Theme.Spacing.m)
        .overlay(alignment: .top) {
            Rectangle().fill(tono.papeles.tinta.opacity(0.28)).frame(height: 1)
        }
    }
}

// MARK: - Sin detalle

/// El detalle de la sesión no llegó (primera apertura sin red, o una sesión sin ejercicios detallados).
/// Se dice tal cual y la salida es la de abajo: seguir, o registrarla a mano. Jamás una sesión inventada.
struct SinDetallePrevia: View {
    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia(.bandeja)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Sin detalle de la sesión")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text("No pudimos cargar los ejercicios de esta sesión. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Spacing.l)
        .tarjetaPrevia()
        .accessibilityElement(children: .combine)
    }
}
