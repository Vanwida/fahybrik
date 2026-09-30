import SwiftUI

// LA PASTILLA DE UNA CABECERA — la acción de una sección, a la derecha de su título: «Buscar carrera», «Importar».
//
// 44 pt de alto, tinte del acento del club con su borde, glifo delante. Es un CONTROL (`InfoPill` es una
// lectura): una sola línea que no se parte — si no cabe junto al título, `TituloSeccionDia` la baja debajo.
// El texto es la tinta del tema, no `accentText`: sobre un tinte del acento el rol de texto del servidor no
// llega a AA (CONTRATO-UI §11.2).
//
//     TituloSeccionDia("Próximas") { PastillaSeccionDia("Buscar carrera", glifo: .lupa, accion: { … }) }

struct PastillaSeccionDia: View {
    let titulo: String
    var glifo: GlifoDia?
    let accion: () -> Void

    init(_ titulo: String, glifo: GlifoDia? = nil, accion: @escaping () -> Void) {
        self.titulo = titulo
        self.glifo = glifo
        self.accion = accion
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.xs + 2) {
                if let glifo { IconoDia(glifo, tam: 18, peso: .bold) }
                Text(titulo).papel(.rotulo).lineLimit(1).fixedSize(horizontal: true, vertical: false)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(minHeight: 44)
            .background(Theme.Color.accentTint, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
    }
}

#if DEBUG
#Preview("Pastilla de sección · fábrica") { EnAmbasDia { GaleriaDia.Acciones() } }
#Preview("Pastilla de sección · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Acciones() } }
#endif
