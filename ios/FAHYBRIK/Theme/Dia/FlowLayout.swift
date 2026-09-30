import SwiftUI

// EL FLUJO — lo que en el doble es `flex-wrap`: los hijos conservan su tamaño ideal, van en fila y, cuando
// no caben, bajan a la siguiente. Pastillas, chips y leyendas que NUNCA se recortan en un móvil de 4,7".
//
// `spacing` es el aire entre hijos de una fila; `lineSpacing`, entre filas (por defecto el mismo). El
// ancho que mide el flujo es el de su fila más larga SIN el aire final, y nunca más que el que le
// proponen: un flujo que se pasa de ancho por un hueco que no pinta es un desborde que no se ve.
//
//     FlowLayout(spacing: Theme.Spacing.s) { ForEach(etiquetas, id: \.self) { InfoPill(text: $0) } }

struct FlowLayout: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat?

    init(spacing: CGFloat = 8, lineSpacing: CGFloat? = nil) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        colocar(ancho: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let r = colocar(ancho: bounds.width, subviews: subviews)
        for (i, origen) in r.origenes.enumerated() {
            subviews[i].place(
                at: CGPoint(x: bounds.minX + origen.x, y: bounds.minY + origen.y),
                anchor: .topLeading,
                proposal: ProposedViewSize(r.tamanos[i])
            )
        }
    }

    private func colocar(ancho: CGFloat, subviews: Subviews) -> (size: CGSize, origenes: [CGPoint], tamanos: [CGSize]) {
        let entreFilas = lineSpacing ?? spacing
        var origenes: [CGPoint] = []
        var tamanos: [CGSize] = []
        var x: CGFloat = 0, y: CGFloat = 0, altoFila: CGFloat = 0, anchoMax: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > 0, x + t.width > ancho {
                x = 0
                y += altoFila + entreFilas
                altoFila = 0
            }
            origenes.append(CGPoint(x: x, y: y))
            tamanos.append(t)
            x += t.width + spacing
            altoFila = max(altoFila, t.height)
            anchoMax = max(anchoMax, x - spacing)
        }
        let anchoTotal = ancho.isFinite ? min(ancho, anchoMax) : anchoMax
        return (CGSize(width: anchoTotal, height: y + altoFila), origenes, tamanos)
    }
}

#if DEBUG
#Preview("Flujo · fábrica") { EnAmbasDia { GaleriaDia.Pastillas() } }
#endif
