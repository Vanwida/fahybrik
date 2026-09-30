import SwiftUI

// ESTRUCTURA — la sesión del coach y dónde estás (corona ↓↓↓ desde Paso). Lo
// hecho apagado, lo de ahora en tinta, lo que viene en contorno. Espejo de
// `kit-reloj/listas.tsx#PaginaLista`. Cada fila va en dos líneas (qué · contra
// qué, con la notación de `textoObjetivo`). El núcleo ya da una ventana
// alrededor de «ahora»; en un reloj más bajo que 46 mm se enseñan las filas que
// caben, empezando por la anterior a la de ahora.

struct MunecaEstructura: View {
    let pagina: Vivo.PaginaEstructuraMuneca

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        MunecaColumna(alineacion: .leading) {
            MunecaContexto(partes: pagina.titulo, medidas: medidas)
                .frame(maxWidth: .infinity, alignment: .center)
            VStack(alignment: .leading, spacing: MunecaForma.huecoEstructura) {
                ForEach(Array(filasQueCaben.enumerated()), id: \.offset) { _, f in
                    fila(f)
                }
            }
        }
    }

    /// Las filas que caben sin hacer scroll: se acumulan hasta llenar el alto útil.
    private var filasQueCaben: [Vivo.FilaLista] {
        var libre = medidas.altoUtil - Vivo.Fila.contexto.alto - Vivo.huecoFila
        var dentro: [Vivo.FilaLista] = []
        for f in pagina.filas {
            let alto = altoDe(f)
            if !dentro.isEmpty, libre < alto { break }
            libre -= alto + Double(MunecaForma.huecoEstructura)
            dentro.append(f)
        }
        return dentro
    }

    /// Lo que ocupa una fila: la línea (a 16 pt, o 15 si hace falta) y su detalle en las líneas
    /// en que de verdad va (una, o dos si no cabe al ancho de la fila).
    private func altoDe(_ f: Vivo.FilaLista) -> Double {
        let linea = Double(lineasDeTitulo(f.linea)) * Vivo.TipoMuneca.contexto * MunecaForma.interlinea
        guard let detalle = f.detalle else { return linea }
        return linea + MunecaForma.huecoLineasLista + Double(lineasDeDetalle(detalle)) * Vivo.TipoMuneca.nota * MunecaForma.interlinea
    }

    private var anchoTexto: Double { medidas.anchoUtil - 2 * 4 - Double(MunecaForma.puntoEstructura + MunecaForma.puntoAire) }

    private func lineasDeTitulo(_ t: String) -> Int {
        Vivo.anchoTexto(t, Vivo.TipoMuneca.contexto, peso: Vivo.TipoMuneca.pesoContexto) <= anchoTexto * Vivo.TipoMuneca.holguraEstima ? 1 : 2
    }

    private func lineasDeDetalle(_ d: String) -> Int {
        Vivo.anchoTexto(d, Vivo.TipoMuneca.nota, peso: Vivo.TipoMuneca.pesoNota) <= anchoTexto * Vivo.TipoMuneca.holguraEstima ? 1 : 2
    }

    private func fila(_ f: Vivo.FilaLista) -> some View {
        let ahora = f.estado == .ahora
        return HStack(alignment: .top, spacing: MunecaForma.puntoAire) {
            punto(f.estado).padding(.top, MunecaForma.puntoBaja)
            VStack(alignment: .leading, spacing: 2) {
                Text(f.linea)
                    .font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto))
                    .foregroundStyle(ahora ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                    .lineLimit(lineasDeTitulo(f.linea))
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.contexto))
                    .fixedSize(horizontal: false, vertical: true)
                if let detalle = f.detalle {
                    Text(detalle)
                        .font(MunecaTipo.nota)
                        .foregroundStyle(MunecaPaleta.tinta2)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: CGFloat(medidas.anchoUtil * Vivo.TipoMuneca.holguraEstima), alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.dicho(f))
    }

    /// Hecho: relleno gris; ahora: relleno blanco; por venir: solo el contorno.
    private func punto(_ estado: Vivo.FilaEstructura.Estado) -> some View {
        Circle()
            .fill(estado == .ahora ? MunecaPaleta.tinta : estado == .hecho ? MunecaPaleta.tinta2 : Color.clear)
            .overlay(Circle().stroke(MunecaPaleta.tinta2, lineWidth: estado == .pendiente ? 1.5 : 0))
            .frame(width: MunecaForma.puntoEstructura, height: MunecaForma.puntoEstructura)
            .accessibilityHidden(true)
    }

    static func dicho(_ f: Vivo.FilaLista) -> String {
        let estado: String
        switch f.estado {
        case .hecho: estado = "hecho"
        case .ahora: estado = "ahora"
        case .pendiente: estado = "por venir"
        }
        return [f.linea, f.detalle, estado].compactMap { $0 }.joined(separator: ", ")
    }
}
