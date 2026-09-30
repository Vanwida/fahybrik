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
            // La previa es una imagen: VoiceOver la cuenta una vez y no se mete en sus piezas.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Vista previa de la tarjeta")

            botones(marca: marca)
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.vertical, Theme.Spacing.l)
        .background(Theme.Color.background.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .sheet(item: $hojaDelSistema) { fichero in
            HojaDelSistema(items: [fichero.url])
        }
    }

    private var cabecera: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Compartir")
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .accessibilityAddTraits(.isHeader)
                Text("Tu vídeo, con el entreno en una esquina")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            BotonCromoDia(.cerrar, etiqueta: "Cerrar") { dismiss() }
        }
    }

    /// Con el club o sin marca: la elección es del atleta. La opción activa lleva el acento del club, como
    /// los selectores del constructor de entreno libre (misma pieza).
    private var selectorDeMarca: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.s) { opciones }
            VStack(spacing: Theme.Spacing.s) { opciones }
        }
    }

    @ViewBuilder
    private var opciones: some View {
        OpcionLibre(texto: "Con el club", elegida: conClub) { Haptics.light(); conClub = true }
        OpcionLibre(texto: "Sin marca", elegida: !conClub) { Haptics.light(); conClub = false }
    }

    @ViewBuilder
    private func botones(marca: MarcaCartel) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            // Solo cuando el contrato de Instagram se puede cumplir de verdad
            // (App ID configurado + app instalada). Nunca un botón que abre
            // Instagram para nada.
            if CompartirService.instagramDisponible {
                BotonPrincipalLibre(titulo: "Abrir Instagram", glifo: nil) {
                    CompartirService.abrirInstagram(con: tarjeta, marca: marca)
                }
                BotonSecundarioLibre(titulo: "Compartir de otra forma") {
                    hojaDelSistema = CompartirService.pngURL(de: tarjeta, marca: marca).map(FicheroCompartible.init)
                }
            } else {
                BotonPrincipalLibre(titulo: "Compartir", glifo: nil) {
                    hojaDelSistema = CompartirService.pngURL(de: tarjeta, marca: marca).map(FicheroCompartible.init)
                }
            }
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
