import SwiftUI

// EL BOTÓN DE TEXTO — la salida discreta de 48 pt: «Ver 3 más», «No soy yo», «Cancelar».
//
// Lo que no merece una pastilla porque no es «lo que toca ahora» (esa es la acción, `AccionDia`), pero sí
// un área táctil como es debido. Un glifo delante (el que lo explica), la palabra y, a la derecha, lo que
// haga falta (el chevron de un pliegue, el contador de lo que esconde).
//
// EL COLOR. Un texto de botón NO va en el acento del club: `accentText` es el rol que el servidor deriva contra
// el lienzo oscuro, y en claro con un acento claro no se lee (hallazgo fijado en `DiaKitTests`). El acento se
// lo lleva el glifo; la palabra, la tinta del tema. El peligro va en `Theme.Color.peligroTexto`, que sí pasa AA
// sobre la superficie en los dos temas.
//
//     BotonTextoDia("Ver 3 más", expandido: false, accion: { … }, icono: { EmptyView() }) { GiroDia(abierto: false) }

struct BotonTextoDia<Icono: View, Derecha: View>: View {
    enum Tono { case acento, tinta, suave, peligro }

    let titulo: String
    var tono: Tono
    var centrado: Bool
    var desactivado: Bool
    /// Cuando el botón despliega algo: lo lee VoiceOver.
    var expandido: Bool?
    let accion: () -> Void
    let icono: Icono
    let derecha: Derecha

    init(
        _ titulo: String,
        tono: Tono = .acento,
        centrado: Bool = false,
        desactivado: Bool = false,
        expandido: Bool? = nil,
        accion: @escaping () -> Void,
        @ViewBuilder icono: () -> Icono,
        @ViewBuilder derecha: () -> Derecha
    ) {
        self.titulo = titulo
        self.tono = tono
        self.centrado = centrado
        self.desactivado = desactivado
        self.expandido = expandido
        self.accion = accion
        self.icono = icono()
        self.derecha = derecha()
    }

    private var tinta: SwiftUI.Color {
        switch tono {
        case .acento, .tinta: return Theme.Color.foreground
        case .suave: return Theme.Color.muted
        case .peligro: return Theme.Color.peligroTexto
        }
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                if centrado { Spacer(minLength: 0) }
                icono.foregroundStyle(tono == .acento ? Theme.Color.accentText : tinta)
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .multilineTextAlignment(centrado ? .center : .leading)
                if centrado { Spacer(minLength: 0) } else { Spacer(minLength: Theme.Spacing.s) }
                derecha.foregroundStyle(Theme.Color.muted)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(desactivado)
        .accessibilityValue(expandido.map { $0 ? "desplegado" : "plegado" } ?? "")
    }
}

extension BotonTextoDia where Icono == EmptyView, Derecha == EmptyView {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, accion: @escaping () -> Void) {
        self.init(titulo, tono: tono, centrado: centrado, desactivado: desactivado, accion: accion, icono: { EmptyView() }, derecha: { EmptyView() })
    }
}

extension BotonTextoDia where Derecha == EmptyView {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.init(titulo, tono: tono, centrado: centrado, desactivado: desactivado, accion: accion, icono: icono, derecha: { EmptyView() })
    }
}

#if DEBUG
#Preview("Botón de texto · fábrica") { EnAmbasDia { GaleriaDia.Acciones() } }
#Preview("Botón de texto · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Acciones() } }
#endif
