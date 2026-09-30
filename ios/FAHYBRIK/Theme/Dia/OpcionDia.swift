import SwiftUI

// LA OPCIÓN — una fila que se ELIGE (una de varias), no una que te lleva a otro sitio (esa es `FilaDia`).
//
// «¿Dónde corres hoy?»: calle, cinta con conexión, cinta sin conexión. Una ficha con el glifo de la opción, su
// título, lo que significa elegirla y, a la derecha, el sello de hecha cuando es la elegida; la elegida se tiñe
// del acento del club (texto en la tinta del tema, no en `muted`: §11.2). Se lee como «Calle, seleccionada».
//
//     OpcionDia(.ubicacion, titulo: "Calle", detalle: "Metros por GPS.", elegida: entorno == .calle) { entorno = .calle }
struct OpcionDia: View {
    let glifo: GlifoDia
    let titulo: String
    var detalle: String?
    let elegida: Bool
    let alTocar: () -> Void

    init(_ glifo: GlifoDia, titulo: String, detalle: String? = nil, elegida: Bool, alTocar: @escaping () -> Void) {
        self.glifo = glifo
        self.titulo = titulo
        self.detalle = detalle
        self.elegida = elegida
        self.alTocar = alTocar
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        Button {
            Haptics.light()
            alTocar()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                FichaDia(glifo, tono: elegida ? .realce : .normal)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detalle {
                        Text(detalle)
                            .papel(.nota)
                            .foregroundStyle(elegida ? Theme.Color.foreground : Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if elegida {
                    SelloEstadoDia(estado: .hecha, tam: 22, tinta: Theme.Color.foreground)
                }
            }
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .background(elegida ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surfaceSunken, in: forma)
            .overlay(forma.strokeBorder(elegida ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
            .contentShape(forma)
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([titulo, detalle].compactMap { $0 }.joined(separator: ". "))
        .accessibilityAddTraits(elegida ? [.isButton, .isSelected] : .isButton)
    }
}

#if DEBUG
#Preview("Opción · fábrica") { EnAmbasDia { GaleriaDia.Opciones() } }
#Preview("Opción · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Opciones() } }
#endif
