import SwiftUI

// EL MARCO DE UNA HOJA — el cuerpo de todo `.sheet` de «El día» (importar, buscar y fijar una carrera, el tiempo objetivo).
//
// En iOS la hoja es un `.sheet`: el sistema pone el agarre, el gesto de bajar y el fondo inerte. Este marco
// pone lo que el diseño añade: el título a 24 pt con su cierre de 48 pt (y «Atrás» cuando se está dentro de
// un paso), el cuerpo con scroll y la acción anclada abajo (§6, regla 3), siempre visible aunque el teclado
// esté abierto.
//
//     MarcoDeHojaDia("Importar carrera", cerrar: { dismiss() }) {
//         … el formulario …
//     } accion: {
//         BotonAccionDia(hoja: "Importar", activo: hayEnlace, ocupado: importando, textoOcupado: "Importando…", voz: "Importando carrera", accion: importa)
//     }

/// El cuerpo de una hoja: título, cierre, contenido que scrollea y, si la hay, la acción anclada. `conAccion: false`
/// quita la barra de abajo cuando la acción depende del estado (una hoja que solo ofrece «Usar este» al conectar).
struct MarcoDeHojaDia<Contenido: View, Accion: View>: View {
    let titulo: String
    /// Volver un paso dentro de la hoja (en lugar de cerrarla).
    var atras: (() -> Void)?
    let cerrar: () -> Void
    let conAccion: Bool
    let contenido: Contenido
    let accion: Accion

    init(
        _ titulo: String,
        atras: (() -> Void)? = nil,
        cerrar: @escaping () -> Void,
        conAccion: Bool = true,
        @ViewBuilder contenido: () -> Contenido,
        @ViewBuilder accion: () -> Accion
    ) {
        self.titulo = titulo
        self.atras = atras
        self.cerrar = cerrar
        self.conAccion = conAccion
        self.contenido = contenido()
        self.accion = accion()
    }

    var body: some View {
        VStack(spacing: 0) {
            cabecera
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
                        .overlay(alignment: .top) { Hairline() }
                }
            }
        }
        .background(Theme.Color.background)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.background)
        .presentationCornerRadius(Theme.Radius.sujeto)
    }

    private var cabecera: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(titulo)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if let atras {
                Button {
                    Haptics.light()
                    atras()
                } label: {
                    Text("Atrás")
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.horizontal, Theme.Spacing.m)
                        .frame(minHeight: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
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
    }
}

extension MarcoDeHojaDia where Accion == EmptyView {
    /// Una hoja sin acción anclada: el pie respeta el gesto de inicio.
    init(
        _ titulo: String,
        atras: (() -> Void)? = nil,
        cerrar: @escaping () -> Void,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.titulo = titulo
        self.atras = atras
        self.cerrar = cerrar
        self.conAccion = false
        self.contenido = contenido()
        self.accion = EmptyView()
    }
}

#if DEBUG
#Preview("Hoja · fábrica") { GaleriaDia.HojaDeEjemplo() }
#endif
