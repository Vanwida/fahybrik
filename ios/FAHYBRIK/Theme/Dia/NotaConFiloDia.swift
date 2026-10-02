import SwiftUI

// LA NOTA CON FILO — la voz del coach, marcada con la barra del acento.
//
// Lo que el coach escribió PARA ESTO (un bloque, un movimiento): su voz, no la del sistema. El filo de
// acento a la izquierda es lo que la separa de un apoyo cualquiera; el texto va en la tinta del tema (el
// acento es el filo, no el texto: sobre un acento claro no se leería). Sin nota, la pieza no se pinta: quien
// la usa decide si hay.
//
//     NotaConFiloDia("Baja hasta que el muslo pase la paralela.", papel: .nota)

struct NotaConFiloDia: View {
    let texto: String
    /// El papel del texto: `.cuerpo` para la nota de un bloque, `.nota` para la de un movimiento.
    var papel: Theme.Typography.Papel

    init(_ texto: String, papel: Theme.Typography.Papel = .cuerpo) {
        self.texto = texto
        self.papel = papel
    }

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Theme.Color.accent)
                .frame(width: 3)
            Text(texto)
                .papel(papel)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("Nota con filo · fábrica") { EnAmbasDia { GaleriaDia.Notas() } }
#Preview("Nota con filo · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Notas() } }
#endif
