import SwiftUI

// EL AVISO EN LÍNEA — un error que se lee DENTRO de una hoja o de una sección, con su salida si la hay.
//
// Tinte del peligro, marca con forma (el triángulo) y texto en la tinta del tema: el peligro va en la
// marca, jamás en el texto. El que se ve sobre la barra de pestañas y se va solo es `AvisoDia`; este se
// queda donde está el problema (un campo mal rellenado, un análisis que no llegó) hasta que se resuelve.
//
//     AvisoEnLineaDia("No pudimos cargar el calendario.") { BotonTextoDia("Reintentar", tono: .tinta, accion: reintentar) }

struct AvisoEnLineaDia<Salida: View>: View {
    let texto: String
    let salida: Salida

    init(_ texto: String, @ViewBuilder salida: () -> Salida) {
        self.texto = texto
        self.salida = salida()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
                IconoDia(.alerta, tam: 20)
                    .foregroundStyle(Theme.Color.danger)
                    .padding(.top, 1)
                Text(texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.danger.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isStaticText)
    }
}

extension AvisoEnLineaDia where Salida == EmptyView {
    init(_ texto: String) { self.init(texto, salida: { EmptyView() }) }
}

#if DEBUG
#Preview("Aviso en línea · fábrica") { EnAmbasDia { GaleriaDia.Formulario() } }
#Preview("Aviso en línea · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Formulario() } }
#endif
