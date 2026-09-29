import SwiftUI

// VUELTAS — la última arriba (corona ↓↓ desde Paso). Cada serie contra su
// objetivo, o cada km. Espejo de `kit-reloj/listas.tsx#PaginaSplits`. La vuelta
// que se está corriendo va encima de todas; a la derecha, el veredicto («▲ rápido»,
// «dentro») con 10 pt de aire por los puntos de la corona. Qué vueltas hay, con
// qué valor y qué veredicto lo decide `Vivo.filasDeVueltas`.

struct MunecaVueltas: View {
    let pagina: Vivo.PaginaVueltasMuneca

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        MunecaColumna(alineacion: .leading) {
            MunecaContexto(partes: pagina.titulo, medidas: medidas)
                .frame(maxWidth: .infinity, alignment: .center)
            if let vacia = pagina.vacia {
                Text(vacia)
                    .font(MunecaTipo.nota)
                    .foregroundStyle(MunecaPaleta.tinta2)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 30)
            }
            if let enCurso = pagina.enCurso { fila(enCurso, ahora: true) }
            ForEach(Array(pagina.filas.enumerated()), id: \.offset) { _, f in
                fila(f, ahora: false)
            }
        }
    }

    private var todas: [Vivo.FilaSplit] { (pagina.enCurso.map { [$0] } ?? []) + pagina.filas }

    /// Lo que mide el número más ancho, con tope: alinea la columna.
    private var anchoNumero: CGFloat {
        let mayor = todas.map { ceil(Vivo.anchoTexto($0.n, Vivo.TipoMuneca.nota, peso: Vivo.TipoMuneca.pesoNota)) }.max() ?? 0
        return CGFloat(Swift.min(MunecaForma.anchoNumeroVuelta, mayor))
    }

    /// 30 pt por fila a 46 mm; en un reloj más bajo, lo que quepa.
    private var altoFila: CGFloat {
        let n = Double(Swift.max(1, todas.count))
        let libre = medidas.altoUtil - Vivo.Fila.contexto.alto - Vivo.huecoFila * (n + 1)
        return CGFloat(Swift.min(MunecaForma.altoFilaVuelta, libre / n))
    }

    private func fila(_ f: Vivo.FilaSplit, ahora: Bool) -> some View {
        // El valor baja con la fila (nunca de 15 pt) antes que solaparse con la siguiente.
        let cuerpo = Swift.max(Vivo.suelo, Swift.min(Vivo.TipoMuneca.tercero, Double(altoFila) * 0.75))
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(f.n)
                .font(MunecaTipo.nota)
                .foregroundStyle(ahora ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                .frame(width: anchoNumero, alignment: .leading)
            Text(f.valor)
                .font(MunecaTipo.fuente(cuerpo, MunecaTipo.pesoDato))
                .foregroundStyle(ahora ? MunecaPaleta.tinta2 : MunecaPaleta.tinta)
                .fixedSize()
            // La vuelta que se corre lleva su «ahora» a la derecha; las hechas, su detalle a continuación.
            if let detalle = f.detalle, !ahora {
                Text(detalle).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2).fixedSize()
            }
            Spacer(minLength: 0)
            if ahora, let detalle = f.detalle {
                Text(detalle).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2).fixedSize()
            }
            if let juicio = f.juicio {
                Text(juicio.texto)
                    .font(juicio.fuera ? MunecaTipo.notaNegrita : MunecaTipo.nota)
                    .foregroundStyle(juicio.fuera ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                    .fixedSize()
            }
        }
        .lineLimit(1)
        .padding(.leading, 4)
        .padding(.trailing, MunecaForma.aireDerechaVueltas)
        .frame(maxWidth: .infinity, minHeight: altoFila, maxHeight: altoFila)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.dicho(f, ahora: ahora))
    }

    static func dicho(_ f: Vivo.FilaSplit, ahora: Bool) -> String {
        [f.n, f.valor, ahora ? Vivo.palabraAhora : f.detalle, f.juicio?.texto]
            .compactMap { $0 }.joined(separator: ", ")
            .replacingOccurrences(of: "▲", with: "por encima").replacingOccurrences(of: "▼", with: "por debajo")
    }
}
