import SwiftUI

// EL CAMPO — un campo de texto de la familia: etiqueta arriba, 52 pt, foco visible.
//
// Buscar una carrera, poner un enlace, escribir la división. Lo que haga falta a los lados (un glifo que
// dice qué se pide, un botón de limpiar) va en `izquierda` / `derecha`. El foco lo lleva quien pone el
// `TextField` (`@FocusState`) y lo pasa en `enFoco`: el borde pasa al acento del club y engorda a 2 pt, porque
// un anillo de foco que solo cambia de color no lo ve quien no distingue los colores (§4.2).
//
//     CampoDia("Enlace HYROX", enFoco: foco == .enlace, izquierda: { IconoDia(.enlace) }, derecha: { EmptyView() }) {
//         TextField("https://…", text: $enlace).focused($foco, equals: .enlace)
//     }

struct CampoDia<Izquierda: View, Derecha: View, Contenido: View>: View {
    let etiqueta: String
    var enFoco: Bool
    /// Borde de aviso (algo del texto no cuadra, sin ser un error).
    var aviso: Bool
    let izquierda: Izquierda
    let derecha: Derecha
    let contenido: Contenido

    init(
        _ etiqueta: String,
        enFoco: Bool = false,
        aviso: Bool = false,
        @ViewBuilder izquierda: () -> Izquierda,
        @ViewBuilder derecha: () -> Derecha,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.etiqueta = etiqueta
        self.enFoco = enFoco
        self.aviso = aviso
        self.izquierda = izquierda()
        self.derecha = derecha()
        self.contenido = contenido()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(etiqueta)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.muted)
            HStack(spacing: Theme.Spacing.m - 2) {
                izquierda.foregroundStyle(Theme.Color.muted)
                contenido
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                derecha
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .frame(minHeight: 52)
            .background(Theme.Color.surface, in: forma)
            .overlay {
                forma.strokeBorder(
                    enFoco ? Theme.Color.accentText : (aviso ? Theme.Color.warning.opacity(0.6) : Theme.Color.hairlineStrong),
                    lineWidth: enFoco ? 2 : 1
                )
            }
        }
    }
}

extension CampoDia where Izquierda == EmptyView, Derecha == EmptyView {
    init(_ etiqueta: String, enFoco: Bool = false, aviso: Bool = false, @ViewBuilder contenido: () -> Contenido) {
        self.init(etiqueta, enFoco: enFoco, aviso: aviso, izquierda: { EmptyView() }, derecha: { EmptyView() }, contenido: contenido)
    }
}

#if DEBUG
#Preview("Campo · fábrica") { EnAmbasDia { GaleriaDia.Formulario() } }
#Preview("Campo · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Formulario() } }
#endif
