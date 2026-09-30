import SwiftUI

// LAS PIEZAS DE HOJA DEL CHAT — el marco de una hoja, su acción anclada y las filas en tarjeta.
//
// El kit del día aún no trae un marco de hoja ni un botón de acción de hoja en `main` (se están consolidando en otra
// rama: `MarcoDeHojaDia`, `BotonAccionDia`, `BotonTextoDia`, `ListaDia`). Estas son las mínimas que el selector de
// entreno y la hoja de la nota de voz necesitan, con la MISMA piel (título 24 pt + cierre de 48 pt, acción anclada
// con filete, tarjetas de radio 22). Cuando el kit aterrice se sustituyen por las suyas y este fichero se borra.

// MARK: - Marco de hoja

/// El cuerpo de un `.sheet`: título, cierre de 48 pt, contenido que scrollea y la acción anclada abajo (siempre
/// visible aunque el teclado esté abierto).
struct MarcoDeHojaChat<Contenido: View, Accion: View>: View {
    let titulo: String
    let cerrar: () -> Void
    let contenido: Contenido
    let accion: Accion
    let conAccion: Bool

    init(_ titulo: String, cerrar: @escaping () -> Void,
         @ViewBuilder contenido: () -> Contenido, @ViewBuilder accion: () -> Accion) {
        self.titulo = titulo
        self.cerrar = cerrar
        self.contenido = contenido()
        self.accion = accion()
        self.conAccion = true
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: Theme.Spacing.s) {
                Text(titulo)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                Button {
                    Haptics.light()
                    cerrar()
                } label: {
                    IconoDia(.cerrar, tam: 20, peso: .bold)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.92))
                .accessibilityLabel("Cerrar")
            }
            .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 4, trailing: Theme.Spacing.s))
            .frame(minHeight: 56)

            ScrollView {
                contenido
                    .padding(EdgeInsets(top: 4, leading: Theme.Spacing.pantalla, bottom: 24, trailing: Theme.Spacing.pantalla))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if conAccion {
                    VStack(spacing: 4) { accion }
                        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 16, trailing: Theme.Spacing.pantalla))
                        .frame(maxWidth: .infinity)
                        .background(Theme.Color.background)
                        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
                }
            }
        }
        .background(Theme.Color.background)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.background)
        .presentationCornerRadius(Theme.Radius.sujeto)
    }
}

extension MarcoDeHojaChat where Accion == EmptyView {
    /// Una hoja sin acción anclada.
    init(_ titulo: String, cerrar: @escaping () -> Void, @ViewBuilder contenido: () -> Contenido) {
        self.titulo = titulo
        self.cerrar = cerrar
        self.contenido = contenido()
        self.accion = EmptyView()
        self.conAccion = false
    }
}

// MARK: - Acciones

/// El botón de acción de una hoja o de un vacío: una pastilla con el texto en cursiva de marca. `.acento` es «haz
/// esto ahora»; `.tinta` la salida que no compite; inactivo cambia de superficie y de tinta, no de opacidad.
struct BotonAccionChat: View {
    enum Relleno { case acento, tinta }

    let titulo: String
    var glifo: GlifoDia?
    var relleno: Relleno
    /// A todo el ancho y con el alto de la acción anclada.
    var completa: Bool
    var inactivo: Bool
    let accion: () -> Void

    init(_ titulo: String, glifo: GlifoDia? = nil, relleno: Relleno = .acento, completa: Bool = false,
         inactivo: Bool = false, accion: @escaping () -> Void) {
        self.titulo = titulo
        self.glifo = glifo
        self.relleno = relleno
        self.completa = completa
        self.inactivo = inactivo
        self.accion = accion
    }

    private var fondo: SwiftUI.Color {
        if inactivo { return Theme.Color.surfaceElevated }
        return relleno == .acento ? Theme.Color.accent : Theme.Color.foreground
    }

    private var tinta: SwiftUI.Color {
        if inactivo { return Theme.Color.muted }
        return relleno == .acento ? Theme.Color.accentOn : Theme.Color.background
    }

    var body: some View {
        Button {
            Haptics.medium()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                Text(titulo)
                    .papel(.accion)
                    .multilineTextAlignment(.center)
                if let glifo { IconoDia(glifo, tam: 20, peso: .bold) }
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, 22)
            .frame(maxWidth: completa ? .infinity : nil, minHeight: completa ? MedidasChat.altoAccionAnclada : Theme.Size.accion)
            .background(fondo, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: completa ? 0.98 : 0.96))
        .disabled(inactivo)
    }
}

/// La salida discreta de 48 pt: una palabra con su glifo, sin pastilla.
struct BotonTextoChat<Icono: View>: View {
    let titulo: String
    let accion: () -> Void
    let icono: Icono

    init(_ titulo: String, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.titulo = titulo
        self.accion = accion
        self.icono = icono()
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                Spacer(minLength: 0)
                icono.foregroundStyle(Theme.Color.accentText)
                Text(titulo).papel(.cuerpoFuerte)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.Color.foreground)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
    }
}

// MARK: - Tarjeta con filas

/// Una tarjeta de radio 22 (superficie y filete) con sus filas separadas por un filete.
struct ListaChat<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        VStack(spacing: 0) {
            Group(subviews: contenido()) { filas in
                ForEach(Array(filas.enumerated()), id: \.offset) { i, fila in
                    if i > 0 { Hairline() }
                    fila
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface, in: forma)
        .clipShape(forma)
        .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
    }
}
