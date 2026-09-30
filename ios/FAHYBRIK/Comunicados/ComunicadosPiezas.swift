import SwiftUI

// El vocabulario visual de los comunicados — compartido por la bandeja y los cuatro detalles.
//
// Vive aquí y no dentro de la bandeja porque la insignia de estado y el glifo de tipo se pintan en la
// lista Y en los detalles: si cada pantalla se los dibujara acabaríamos con tres grafías del mismo estado.
//
// Ninguna pieza inventa un color ni un espaciado: todo sale de `Theme` y del kit del día. El color de
// estado va en la MARCA (un punto, un sello con forma) y jamás en el texto: el texto es la tinta del tema.

// MARK: - Cómo se dice cada tipo

extension ComunicadoTipo {
    /// El SF Symbol del tipo. Uno por idea (pasos que se marcan · decidir · cosa con fecha · entender ·
    /// no olvidar) y de formas distintas: el tipo no se distingue solo por el color.
    var simbolo: String {
        switch self {
        case .protocolo: return "checklist"
        case .pregunta:  return "questionmark.circle"
        case .tarea:     return "calendar"
        case .nota:      return "pencil"
        case .foco:      return "target"
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

// MARK: - El tipo, como pastilla

/// El tipo dicho con palabra: lo primero que se lee de un comunicado cuando aparece FUERA de su fila (el
/// pie de una nota que apunta a otro).
struct ChipTipoComunicado: View {
    let tipo: ComunicadoTipo

    var body: some View {
        InfoPill(text: tipo.etiqueta.localizedCapitalized, estilo: tipo.pideAccion ? .acento : .neutro)
            .accessibilityLabel(tipo.etiqueta.lowercased())
    }
}

// MARK: - Insignia de estado

/// NUEVO · VISTO · HECHO · RESPONDIDO · VENCE HOY · VENCIDA.
///
/// La marca lleva el estado (y su FORMA lo repite: punto, sello, cronómetro, triángulo); la palabra es la
/// tinta del tema. Una vencida en rojo y una hecha en verde no se distinguen para quien no ve esos colores.
struct InsigniaComunicado: View {
    let insignia: ComunicadoInsignia

    var body: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            marca
            Text(insignia.etiqueta)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.foreground)
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(insignia.etiqueta.lowercased())
    }

    @ViewBuilder
    private var marca: some View {
        switch insignia {
        case .nuevo:
            Circle().fill(Theme.Color.accentText).frame(width: 10, height: 10)
        case .visto:
            Circle().fill(Theme.Color.muted).frame(width: 10, height: 10)
        case .hecho, .respondido:
            SelloEstadoDia(estado: .hecha, tam: 18)
        case .venceHoy:
            IconoDia(.cronometro, tam: 18, peso: .bold).foregroundStyle(Theme.Color.warning)
        case .vencida:
            IconoDia(.alerta, tam: 18, peso: .bold).foregroundStyle(Theme.Color.danger)
        }
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
            } label: { sello }
                .buttonStyle(PressScaleStyle(escala: 0.92))
                .accessibilityLabel(etiqueta)
                .accessibilityAddTraits(.isButton)
        } else {
            sello
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta)
        }
    }

    private var sello: some View {
        SelloEstadoDia(estado: hecho ? .hecha : .pendiente, tam: 28)
            .frame(width: Theme.Size.toque, height: Theme.Size.toque)
            .contentShape(Rectangle())
    }
}

// MARK: - La cabecera de los detalles

/// Atrás · tipo · de quién y cuándo. Idéntica en los cinco detalles a propósito: abrir una pregunta y
/// abrir un protocolo tienen que sentirse la misma casa.
struct CabeceraComunicado<Accesorio: View>: View {
    let comunicado: Comunicado
    let onVolver: () -> Void
    @ViewBuilder var accesorio: () -> Accesorio

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            BotonCromoDia(etiqueta: "Volver a Del coach", accion: onVolver) { IconoDia(.atras, tam: 20) }
            VStack(alignment: .leading, spacing: 2) {
                Text(comunicado.kind.etiqueta)
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.foreground)
                Text("De \(comunicado.nombreCoach) · \(comunicado.publicadoTexto())")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            accesorio()
        }
        // El círculo del cromo mide 38 dentro de un área de 48: 5 pt de cada lado, así que el
        // margen resta esos 5 para que el círculo (no el área) caiga en el margen de la pantalla.
        .padding(EdgeInsets(top: 4, leading: Theme.Spacing.pantalla - 5, bottom: 4, trailing: Theme.Spacing.pantalla))
    }
}

// MARK: - El aviso de que algo bloquea

/// La banda que dice que esto no es opcional. Existe solo para la pregunta que
/// bloquea: un comunicado que no bloquea nada y lleva banda de aviso enseña a
/// ignorar las bandas.
struct AvisoComunicado: View {
    let texto: String

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
            IconoDia(.alerta, tam: 20)
                .foregroundStyle(Theme.Color.warning)
                .padding(.top, 1)
            Text(texto)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.warning.opacity(0.35), lineWidth: 1))
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
            HStack(alignment: .top, spacing: Theme.Spacing.s) {
                IconoDia(.reintentar, tam: 16, peso: .semibold)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.top, 2)
                Text("Sin conexión. Se guarda y se envía en cuanto vuelvas a tener señal.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        case .fallido(let mensaje):
            AvisoEnLineaDia(mensaje)
        }
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
