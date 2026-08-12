import SwiftUI

// Las tres piezas visibles de «sobre qué va el mensaje». Espejo de la propuesta
// aprobada en el doble (`web/components/design-twin/screens/chat-contexto/`).
//
// Ninguna de las tres es un control permanente en pantalla: el chip solo existe
// mientras hay un sujeto esperando, la tarjeta vive dentro de un mensaje ya
// enviado, y el selector se levanta a petición. Eso era el encargo.

// MARK: - El chip que espera en el compositor

/// El sujeto elegido y aún sin enviar.
///
/// El filete naranja de la izquierda es lo que dice «esto va pegado a tu
/// mensaje» sin gastar una palabra en explicarlo. La ✕ lo quita: elegir mal no
/// puede costar más que un toque.
struct ChipDeContexto: View {
    let etiqueta: String
    let onQuitar: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text("Sobre")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
            Text(etiqueta)
                .scaledFont(12, relativeTo: .caption)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: Theme.Spacing.s)
            Button(action: onQuitar) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 24, height: 24)
                    .background(Theme.Color.surfaceElevated)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Quitar el contexto")
        }
        .padding(.leading, Theme.Spacing.m)
        .padding(.trailing, Theme.Spacing.xs)
        .padding(.vertical, Theme.Spacing.xs)
        .background(
            ZStack(alignment: .leading) {
                Theme.Color.surface
                Rectangle().fill(Theme.Color.accent).frame(width: 2)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Este mensaje es sobre \(etiqueta)")
    }
}

// MARK: - La tarjeta dentro del mensaje

/// De qué iba un mensaje ya enviado.
///
/// Va DENTRO de la burbuja (no como mensaje aparte) porque suelta obligaría al
/// coach a emparejarla a ojo con la pregunta de al lado. Sobre la burbuja propia
/// se oscurece; sobre la del coach usa el fondo hundido del tema.
struct TarjetaDeContexto: View {
    let ref: ChatContextRef
    let mio: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 1) {
                Text("SOBRE")
                    .font(.system(size: 8.5, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(tinta.opacity(0.65))
                Text(ref.label)
                    .scaledFont(12, relativeTo: .caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(tinta)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(tinta.opacity(0.5))
        }
        .padding(.vertical, 6)
        .padding(.horizontal, Theme.Spacing.s)
        .background(mio ? Color.black.opacity(0.13) : Theme.Color.surfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(mio ? Color.black.opacity(0.10) : Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sobre \(ref.label)")
    }

    private var tinta: Color { mio ? Theme.Color.accentOn : Theme.Color.foreground }
}

// MARK: - El selector de entreno

/// «¿Sobre qué entreno?» — la única superficie nueva de toda la pieza, y solo se
/// ve si el atleta la pide desde el «+».
struct SelectorDeEntreno: View {
    let secciones: [(titulo: String, entrenos: [EntrenoElegible])]
    let cargando: Bool
    /// El `assignmentId` ya elegido, para marcarlo si se vuelve a abrir.
    let elegido: String?
    let onElegir: (EntrenoElegible) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            cabecera
            Hairline()
            if secciones.isEmpty {
                vacio
            } else {
                lista
            }
        }
        .background(Theme.Color.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var cabecera: some View {
        HStack {
            Button("Cancelar") { dismiss() }
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.accentText)
            Spacer()
            Text("¿Sobre qué entreno?")
                .scaledFont(15, relativeTo: .headline)
                .fontWeight(.bold)
                .italic()
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            // Espejo del ancho de «Cancelar» para que el título quede centrado.
            Text("Cancelar").scaledFont(14, relativeTo: .subheadline).opacity(0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
    }

    private var lista: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(secciones, id: \.titulo) { seccion in
                    Text(seccion.titulo.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .tracking(Theme.Tracking.dataLabel)
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.top, Theme.Spacing.m)
                        .padding(.bottom, Theme.Spacing.xs)

                    ForEach(seccion.entrenos) { entreno in
                        Hairline()
                        fila(entreno)
                    }
                }
                if cargando {
                    HStack(spacing: Theme.Spacing.s) {
                        ProgressView().controlSize(.small)
                        Text("Buscando los de antes…")
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.faint)
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                }
            }
            .padding(.bottom, Theme.Spacing.l)
        }
    }

    private func fila(_ entreno: EntrenoElegible) -> some View {
        Button {
            onElegir(entreno)
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entreno.titulo)
                        .scaledFont(14, relativeTo: .subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Theme.Color.foreground)
                    // El pie es lo que desempata dos «Fuerza A» en la lista.
                    if let pie = entreno.pie {
                        Text(pie)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: Theme.Spacing.s)
                if entreno.hecho {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                Text(entreno.cuando)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, 9)
            .background(elegido == entreno.assignmentId ? Theme.Color.surface : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(entreno.titulo), \(entreno.cuando)\(entreno.hecho ? ", hecho" : "")")
    }

    /// Sin plan publicado no hay entrenos que señalar, y decirlo es mejor que una
    /// lista vacía: el atleta entiende que no es un fallo suyo.
    private var vacio: some View {
        VStack(spacing: Theme.Spacing.s) {
            Text("Todavía no hay entrenos que señalar")
                .scaledFont(14, relativeTo: .subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.Color.foreground)
            Text("Cuando tengas la semana publicada podrás preguntar por un entreno concreto. Mientras, escríbele sin más.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
