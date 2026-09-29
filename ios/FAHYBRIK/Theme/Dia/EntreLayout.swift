import SwiftUI

// «SPACE-BETWEEN» — reparte el sobrante en los HUECOS entre los hijos, no en una cola.
//
// Es lo que el doble hace con `justify-content: space-between` en una tesela: la cabecera arriba,
// el pie abajo y el dato en el medio, con el aire repartido a partes iguales. Un `VStack` con
// `Spacer()` entre cada par lo aproxima, pero obliga a saber cuántos hijos hay; este `Layout` no:
// recibe los que le pongas, los coloca de arriba abajo con `separacionMinima` entre ellos y, si la
// altura que recibe (`bounds`) es mayor que la que necesitan, la reparte entre los huecos (CONTRATO-UI
// §6.1: el sobrante entra en la propia pieza, entre lo que hay, nunca en una cola muerta debajo).
//
// Con UN solo hijo lo deja arriba: no hay hueco entre el que repartir.

struct EntreLayout: Layout {
    /// Aire mínimo entre dos hijos consecutivos.
    var separacionMinima: CGFloat = 0
    /// Alto mínimo del conjunto: si los hijos necesitan menos, el resto se reparte entre los huecos.
    var altoMinimo: CGFloat = 0
    /// Acepta el alto que le propone el padre (si es finito y mayor): para las piezas que se igualan con
    /// sus vecinas (`TeselasDia`). Apagado, el conjunto mide lo suyo: un `Layout` que se estira con cada
    /// propuesta se lleva el sobrante de cualquier `VStack` en que caiga.
    var llena = false

    private func anchoElegido(_ proposal: ProposedViewSize, _ subviews: Subviews) -> CGFloat {
        proposal.width ?? subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
    }

    private func alturas(_ subviews: Subviews, ancho: CGFloat) -> [CGFloat] {
        subviews.map { $0.sizeThatFits(ProposedViewSize(width: ancho, height: nil)).height }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = anchoElegido(proposal, subviews)
        let hijos = alturas(subviews, ancho: ancho)
        let natural = hijos.reduce(0, +) + separacionMinima * CGFloat(max(0, hijos.count - 1))
        let propuesto = llena ? (proposal.height.flatMap { $0.isFinite ? $0 : nil } ?? 0) : 0
        return CGSize(width: ancho, height: max(natural, altoMinimo, propuesto))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let hijos = alturas(subviews, ancho: bounds.width)
        let libre = bounds.height - hijos.reduce(0, +)
        let hueco = hijos.count > 1 ? max(separacionMinima, libre / CGFloat(hijos.count - 1)) : 0
        var y = bounds.minY
        for (subview, alto) in zip(subviews, hijos) {
            subview.place(
                at: CGPoint(x: bounds.minX, y: y),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: alto)
            )
            y += alto + hueco
        }
    }
}
