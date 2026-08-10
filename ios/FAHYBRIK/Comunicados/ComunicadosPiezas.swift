import SwiftUI

// El vocabulario visual de los comunicados — compartido por la bandeja y los
// cuatro detalles.
//
// Vive aquí y no dentro de la bandeja porque el chip de tipo y la insignia de
// estado se pintan en la lista Y en los detalles: si cada pantalla se los
// dibujara acabaríamos con tres grafías del mismo estado.
//
// Ninguna pieza inventa un color ni un espaciado: todo sale de `Theme`.

// MARK: - Color de cada tipo y de cada insignia

extension ComunicadoTipo {
    /// Lo que pide acción se lleva el naranja de marca: en la bandeja el color
    /// ES la cola de trabajo, no un adorno por familia. La nota informa y el
    /// foco acompaña, así que ninguno de los dos compite con esa cola.
    var color: Color {
        switch self {
        case .protocolo, .pregunta, .tarea: return Theme.Color.accentText
        case .nota: return Theme.Color.muted
        case .foco: return Theme.Color.info
        }
    }
}

extension ComunicadoInsignia {
    var color: Color {
        switch self {
        case .nuevo:                 return Theme.Color.accentText
        case .visto:                 return Theme.Color.muted
        case .hecho, .respondido:    return Theme.Color.ok
        case .venceHoy:              return Theme.Color.warning
        case .vencida:               return Theme.Color.danger
        }
    }
}

// MARK: - Cómo se dicen las fechas de un comunicado

extension Comunicado {
    /// Cómo se nombra al coach cuando hay que decir quién te habla. El nombre
    /// llega del servidor; sin él, «tu coach» — nunca uno inventado.
    static func nombreCoach(_ coachName: String?) -> String {
        let limpio = coachName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !limpio.isEmpty else { return "tu coach" }
        return limpio.split(separator: " ").first.map(String.init) ?? limpio
    }

    var nombreCoach: String { Self.nombreCoach(coachName) }

    /// «hoy» · «ayer» · «el 12 de julio».
    func publicadoTexto(ahora: Date = Date()) -> String {
        FechaES.hace(publishedAt, ahora: ahora)
    }

    /// «Vence hoy» · «Venció ayer» · «Vence el domingo» · «Vence el 12 de julio».
    /// Nil cuando no hay fecha — una tarea sin fecha no la lleva por sistema.
    func venceTexto(ahora: Date = Date()) -> String? {
        guard let dueDate, let fecha = FechaES.fecha(dueDate) else { return nil }
        switch vencimiento(hoy: ahora) {
        case .sinFecha:
            return nil
        case .hoy:
            return "Vence hoy"
        case .vencida(let dias):
            if dias == 1 { return "Venció ayer" }
            if dias <= 6 { return "Venció hace \(dias) días" }
            return FechaES.larga(dueDate).map { "Venció el \($0)" } ?? "Venció hace \(dias) días"
        case .futura(let dias):
            if dias == 1 { return "Vence mañana" }
            if dias <= 6 { return "Vence el \(FechaES.diaSemana(fecha))" }
            return FechaES.larga(dueDate).map { "Vence el \($0)" } ?? "Vence en \(dias) días"
        }
    }
}

// MARK: - Chip de tipo

/// El chip que dice QUÉ es esto. Es lo primero que se lee de un comunicado.
struct ChipTipoComunicado: View {
    let tipo: ComunicadoTipo

    var body: some View {
        Text(tipo.etiqueta)
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.6)
            .foregroundStyle(tipo.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(tipo.color.opacity(0.15))
            .clipShape(Capsule())
            .accessibilityLabel(tipo.etiqueta.lowercased())
    }
}

// MARK: - Insignia de estado

/// NUEVO · VISTO · HECHO · RESPONDIDO · VENCE HOY · VENCIDA.
struct InsigniaComunicado: View {
    let insignia: ComunicadoInsignia

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(insignia.color)
                .frame(width: 5, height: 5)
            Text(insignia.etiqueta)
                .font(.system(size: 9.5, weight: .heavy))
                .tracking(1.3)
                .foregroundStyle(insignia.color)
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(insignia.etiqueta.lowercased())
    }
}

// MARK: - Marcar

/// El acto que separa un comunicado de un mensaje: marcarlo. Es un control, así
/// que tiene área de toque de sobra y dice en voz alta qué marca.
///
/// `onTap` nulo lo deja como SELLO y no como botón: cerrar una tarea es un hecho
/// que el servidor no deshace, y un círculo que se puede volver a tocar promete
/// justo lo que no va a pasar.
struct BotonMarcarComunicado: View {
    let hecho: Bool
    let etiqueta: String
    var onTap: (() -> Void)?

    var body: some View {
        if let onTap {
            Button {
                Haptics.light()
                onTap()
            } label: { glifo }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(etiqueta)
                .accessibilityAddTraits(.isButton)
        } else {
            glifo
                .accessibilityLabel(etiqueta)
        }
    }

    private var glifo: some View {
        Image(systemName: hecho ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 22, weight: .regular))
            .foregroundStyle(hecho ? Theme.Color.ok : Theme.Color.faint)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }
}

// MARK: - La tarjeta de la bandeja

/// Chip · estado · título · una línea · ancla. Ese orden y no otro: el atleta
/// decide si abre por el tipo y por el estado, y lee el título por el medio.
struct TarjetaComunicado<Pie: View>: View {
    let comunicado: Comunicado
    /// Se pinta a la izquierda cuando el comunicado se marca desde la lista.
    /// `onTap` nulo = ya está cerrado y el círculo es un sello, no un control.
    var marcar: (hecho: Bool, etiqueta: String, onTap: (() -> Void)?)?
    /// Sustituye a la línea de resumen cuando el detalle manda (una tarea con
    /// fecha, una pregunta ya contestada).
    var detalle: String?
    var onAbrir: () -> Void
    @ViewBuilder var pie: () -> Pie

    /// Tachar es «esto ya no hay que hacerlo», y solo lo cumple `hecho`. Una
    /// pregunta respondida sigue siendo la pregunta: tacharla se lee como que se
    /// anuló, y lo que pasó es lo contrario (se contestó y cambió el plan).
    private var tachado: Bool { comunicado.state == .hecho }
    private var apagado: Bool { tachado || comunicado.state == .respondido }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.s) {
                if let marcar {
                    BotonMarcarComunicado(
                        hecho: marcar.hecho,
                        etiqueta: marcar.etiqueta,
                        onTap: marcar.onTap
                    )
                }
                Button {
                    Haptics.light()
                    onAbrir()
                } label: {
                    cuerpo
                }
                .buttonStyle(PressScaleStyle())
            }
            pie()
        }
    }

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Theme.Spacing.s) {
                ChipTipoComunicado(tipo: comunicado.kind)
                Spacer(minLength: Theme.Spacing.s)
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            Text(comunicado.title)
                .scaledFont(16, weight: .bold, relativeTo: .headline)
                .foregroundStyle(apagado ? Theme.Color.muted : Theme.Color.foreground)
                .strikethrough(tachado, color: Theme.Color.faint)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let linea = detalle ?? comunicado.body, !linea.isEmpty {
                Text(linea)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: Theme.Spacing.s) {
                if let ancla = comunicado.anchorKind.etiqueta {
                    LabelText(text: ancla, color: Theme.Color.faint, size: 9.5)
                }
                GlifoAudioComunicado(comunicado: comunicado)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

extension TarjetaComunicado where Pie == EmptyView {
    init(
        comunicado: Comunicado,
        marcar: (hecho: Bool, etiqueta: String, onTap: (() -> Void)?)? = nil,
        detalle: String? = nil,
        onAbrir: @escaping () -> Void
    ) {
        self.init(
            comunicado: comunicado,
            marcar: marcar,
            detalle: detalle,
            onAbrir: onAbrir,
            pie: { EmptyView() }
        )
    }
}

// MARK: - La cabecera de los detalles

/// Atrás · chip · de quién y cuándo. Idéntica en los cuatro detalles a
/// propósito: abrir una pregunta y abrir un protocolo tienen que sentirse la
/// misma casa.
struct CabeceraComunicado<Accesorio: View>: View {
    let comunicado: Comunicado
    let onVolver: () -> Void
    @ViewBuilder var accesorio: () -> Accesorio

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            BackCircleButton(action: onVolver)
            VStack(alignment: .leading, spacing: 5) {
                ChipTipoComunicado(tipo: comunicado.kind)
                Text("De \(comunicado.nombreCoach) · \(comunicado.publicadoTexto())")
                    .scaledFont(11.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            accesorio()
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .background(alignment: .bottom) { Hairline() }
    }
}

// MARK: - El aviso de que algo bloquea

/// La banda que dice que esto no es opcional. Existe solo para la pregunta que
/// bloquea: un comunicado que no bloquea nada y lleva banda de aviso enseña a
/// ignorar las bandas.
struct AvisoComunicado: View {
    let texto: String

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
                .padding(.top, 1)
            Text(texto)
                .scaledFont(12.5, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .background(Theme.Color.warningTint)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.warning.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Lo que pasó con el último acto

/// El acto no llegó. Se dice, y se dice qué va a pasar con él — un cambio que
/// se pinta y luego desaparece sin explicación es peor que no haberlo pintado.
struct AvisoEnvioComunicado: View {
    let estado: EnvioComunicado

    var body: some View {
        switch estado {
        case .ok:
            EmptyView()
        case .enCola:
            fila(
                simbolo: "arrow.triangle.2.circlepath",
                color: Theme.Color.muted,
                texto: "Sin conexión. Se guarda y se envía en cuanto vuelvas a tener señal."
            )
        case .fallido(let mensaje):
            fila(simbolo: "exclamationmark.circle", color: Theme.Color.danger, texto: mensaje)
        }
    }

    private func fila(simbolo: String, color: Color, texto: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            Image(systemName: simbolo)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(color)
                .padding(.top, 1)
            Text(texto)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Qué le pasó al último acto que el atleta hizo sobre un comunicado.
enum EnvioComunicado: Equatable {
    case ok
    /// Guardado en la cola: se reenvía solo al volver la señal.
    case enCola
    /// No se puede reenviar (el comunicado ya no existe, el paso no es de aquí):
    /// el cambio se deshizo y hay que decirlo.
    case fallido(String)
}
