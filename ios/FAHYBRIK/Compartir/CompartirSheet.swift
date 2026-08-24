import SwiftUI

// LA HOJA DE COMPARTIR — la previa de la tarjeta y sus dos salidas.
//
// La marca del club es ELECCIÓN DEL ATLETA (decisión de Alex, 24-ago): un
// conmutador, con club por defecto, persistido — quien no quiera enseñar a su
// coach lo apaga una vez y se queda. El color y el nombre son del coach
// (`ClubThemeStore`); el conmutador solo decide si van.

struct CompartirSheet: View {
    /// La tarjeta se construye al abrir la hoja (los datos ya están cerrados);
    /// el conmutador solo cambia la marca, nunca el contenido.
    let tarjeta: TarjetaCompartible

    @AppStorage("fahybrik.compartir.conClub") private var conClub = true
    @State private var hojaDelSistema: FicheroCompartible? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let marca = MarcaCartel.actual(conClub: conClub)
        VStack(spacing: Theme.Spacing.l) {
            cabecera

            selectorDeMarca

            // La previa a escala. La tarjeta se dibuja a sus 700 pt reales y se
            // encoge aquí: lo que se ve es EXACTAMENTE el PNG que va a salir.
            GeometryReader { geo in
                let escala = min(geo.size.width / Presupuesto.ancho,
                                 geo.size.height / Presupuesto.altoMaximo)
                TarjetaCompartibleView(tarjeta: tarjeta, marca: marca)
                    .scaleEffect(escala, anchor: .top)
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            }

            botones(marca: marca)
        }
        .padding(Theme.Spacing.xl)
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(item: $hojaDelSistema) { fichero in
            HojaDelSistema(items: [fichero.url])
        }
    }

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Compartir")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text("Tu vídeo, con el entreno en una esquina")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface, in: Circle())
            }
            .accessibilityLabel("Cerrar")
        }
    }

    private var selectorDeMarca: some View {
        HStack(spacing: 2) {
            opcion("Con el club", activa: conClub) { conClub = true }
            opcion("Sin marca", activa: !conClub) { conClub = false }
        }
        .padding(2)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .frame(maxWidth: .infinity)
    }

    private func opcion(_ texto: String, activa: Bool, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(texto)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(activa ? Theme.Color.foreground : Theme.Color.muted)
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(
                    activa ? Theme.Color.surfaceElevated : .clear,
                    in: RoundedRectangle(cornerRadius: 7, style: .continuous)
                )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func botones(marca: MarcaCartel) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            // Solo cuando el contrato de Instagram se puede cumplir de verdad
            // (App ID configurado + app instalada). Nunca un botón que abre
            // Instagram para nada.
            if CompartirService.instagramDisponible {
                Button {
                    Haptics.light()
                    CompartirService.abrirInstagram(con: tarjeta, marca: marca)
                } label: {
                    Text("Abrir Instagram")
                        .font(.system(size: 16, weight: .heavy))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.Color.accent)
            }
            Button {
                Haptics.light()
                hojaDelSistema = CompartirService.pngURL(de: tarjeta, marca: marca).map(FicheroCompartible.init)
            } label: {
                Text(CompartirService.instagramDisponible ? "Compartir de otra forma" : "Compartir")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }
}

/// Envoltorio identificable para `.sheet(item:)` — una conformidad global de
/// `URL` a `Identifiable` sería nuestra para todo el binario, y eso no se hace
/// por una hoja.
private struct FicheroCompartible: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// El puente a la hoja del sistema — el mismo idioma que el de exportar datos
/// del perfil, local a este flujo para no acoplar los dos.
private struct HojaDelSistema: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
