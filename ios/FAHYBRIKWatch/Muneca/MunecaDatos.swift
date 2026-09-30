import SwiftUI

// DATOS — la sesión entera, cuatro filas «valor unidad» (corona ↓ desde Paso).
// Espejo de `kit-reloj/listas.tsx#PaginaFilas`. Qué filas hay, en qué orden y con
// qué palabras («—» si el dato no llega, jamás el último valor congelado) lo decide
// `Vivo.filasDeDatos`; esto solo las dibuja. El ritmo medio va rotulado «medio».

struct MunecaDatos: View {
    let pagina: Vivo.PaginaDatosMuneca

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        MunecaColumna(alineacion: .leading) {
            MunecaContexto(partes: pagina.titulo, medidas: medidas)
                .frame(maxWidth: .infinity, alignment: .center)
            ForEach(Array(pagina.filas.enumerated()), id: \.offset) { _, fila in
                self.fila(fila)
            }
        }
        .padding(.leading, MunecaForma.sangriaDatos)
    }

    /// Cuánto alto le toca a cada fila: 38 pt a 46 mm, y menos en un reloj más bajo.
    private var altoFila: CGFloat {
        let n = Double(Swift.max(1, pagina.filas.count))
        let libre = medidas.altoUtil - Vivo.Fila.contexto.alto - Vivo.huecoFila * (n + 1)
        return CGFloat(Swift.min(MunecaForma.altoFilaDato, libre / n))
    }

    private func fila(_ f: Vivo.FilaDatoVista) -> some View {
        // El valor baja (nunca de 15 pt) con el alto de la fila y con el ancho que le dejan el corazón,
        // la unidad y la zona: la misma medida de una línea de dato del núcleo.
        let medida = Vivo.lineaDeDato(
            Vivo.LineaVista(valor: f.valor, unidad: f.unidad, glifo: f.glifo, zona: f.zona),
            cuerpo: Swift.min(Vivo.TipoMuneca.segundo, Double(altoFila) * 0.8),
            // La fila del pulso es la de abajo: ahí las esquinas del reloj dejan menos ancho.
            ancho: (f.glifo ? medidas.anchoPie : medidas.anchoUtil) - Double(MunecaForma.sangriaDatos))
        let cuerpo = medida.cuerpoValor
        return HStack(alignment: .firstTextBaseline, spacing: 5) {
            if f.glifo { MunecaCorazon(talla: 18) }
            Text(f.valor)
                .font(MunecaTipo.fuente(cuerpo, MunecaTipo.pesoDato))
                .foregroundStyle(MunecaPaleta.tinta)
            Text(f.unidad)
                .font(MunecaTipo.nota)
                .foregroundStyle(MunecaPaleta.tinta2)
            if let zona = f.zona { MunecaChipZona(zona: zona).padding(.leading, 1) }
        }
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: .infinity, minHeight: altoFila, maxHeight: altoFila, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.dicho(f))
    }

    static func dicho(_ f: Vivo.FilaDatoVista) -> String {
        let zona = f.zona.map { ", zona \($0.n)" } ?? ""
        return "\(f.valor) \(f.unidad)\(zona)"
    }
}
