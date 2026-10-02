import SwiftUI

// LA NOTA DEL COACH — lo que más importa leer, y se lee ENTERA si cabe.
//
// Una tarjeta tintada con el acento del club, la firma de quien la escribió (sin firma, sin avatar: no se le
// atribuye a «tu coach» una frase suya) y el texto cortado a tres líneas. «Leer entera» solo existe cuando el texto
// de verdad se recorta: un control sobre una nota que ya se ve entera es un botón que no hace nada. Se mide con dos
// copias invisibles del texto (entera y cortada) a EL MISMO ancho que el texto real, sin pintarlo antes.
//
// Sobre un tinte del acento el texto es la tinta del tema, nunca `muted` ni `accentText` (CONTRATO-UI §11.2).

struct FichaNota: View {
    let nota: LecturaFicha.Nota

    @State private var abierta = false
    @State private var altoCompleto: CGFloat = 0
    @State private var altoCerrado: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// El avatar escala con el texto: con una letra grande, un círculo fijo la cortaría.
    @ScaledMetric(relativeTo: .subheadline) private var avatar: CGFloat = 24

    private static let lineasCerrada = 3

    private var desborda: Bool { altoCompleto > altoCerrado + 1 }
    /// Mientras está abierta el control sigue ahí, para poder cerrarla.
    private var conControl: Bool { desborda || abierta }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if let firma = nota.firma { firmaDelCoach(firma) }
                Text(nota.texto)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(abierta ? nil : Self.lineasCerrada)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(alignment: .topLeading) { medidor }
            }
            .padding(.top, Theme.Spacing.l)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.bottom, conControl ? 0 : Theme.Spacing.l)
            if conControl {
                BotonTextoDia(
                    abierta ? "Leer menos" : "Leer entera",
                    tono: .acento,
                    expandido: abierta,
                    accion: { withAnimation(reduceMotion ? nil : Theme.Motion.reveal) { abierta.toggle() } },
                    icono: { EmptyView() }
                ) {
                    GiroDia(abierto: abierta)
                }
            }
        }
        .tarjetaDia(realce: true, alAncho: true)
    }

    private func firmaDelCoach(_ firma: String) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            if let inicial = nota.inicial {
                Text(inicial)
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: avatar, height: avatar)
                    .background(Theme.Color.accentTint, in: Circle())
                    .accessibilityHidden(true)
            }
            Text(firma)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    /// Dos copias invisibles del texto —entera y cortada a tres líneas— para saber si desborda. Viven en el fondo del
    /// texto real, así que miden con el ancho que éste recibe.
    private var medidor: some View {
        ZStack(alignment: .topLeading) {
            Text(nota.texto).papel(.cuerpo)
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { altoCompleto = $0 }
            Text(nota.texto).papel(.cuerpo)
                .lineLimit(Self.lineasCerrada)
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { altoCerrado = $0 }
        }
        .hidden()
        .accessibilityHidden(true)
    }
}
