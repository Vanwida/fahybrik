import SwiftUI

// LA BANDA DEL OBJETIVO — el calibre horizontal de P3: la banda del coach, tu
// marca encima, y fuera de ella ▲/▼ con su palabra. Sin cambiar de color (P6).
// Espejo de `kit-reloj/banda.tsx`. A la izquierda lo suave, a la derecha lo fuerte.
// En pasos a zona se dibuja sobre el espectro del coach con la zona objetivo
// encendida. Todo lo que dice (rótulo, palabra, dónde va la marca) ya viene en
// `Vivo.BandaVista`.

struct MunecaBandaObjetivo: View {
    let banda: Vivo.BandaVista

    private var fuera: Bool { banda.veredicto != nil && banda.veredicto != .dentro }

    var body: some View {
        VStack(spacing: 3) {
            cabecera
            pista
        }
        .frame(maxWidth: .infinity)
        .frame(height: CGFloat(Vivo.Fila.banda.alto), alignment: .bottom)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dicho)
    }

    // MARK: - Rótulo y palabra

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(banda.rotulo)
                .font(MunecaTipo.nota)
                .foregroundStyle(MunecaPaleta.tinta2)
                .fixedSize()
            Spacer(minLength: MunecaForma.huecoBanda)
            if let palabra = banda.palabra, fuera || banda.zonas == nil {
                Text(textoPalabra(palabra))
                    .font(fuera ? MunecaTipo.notaNegrita : MunecaTipo.nota)
                    .foregroundStyle(fuera ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                    .fixedSize()
            }
        }
        .lineLimit(1)
        .padding(.horizontal, 2)
    }

    private func textoPalabra(_ p: Vivo.PalabraVeredicto) -> String {
        p.marca.map { "\($0) \(p.texto)" } ?? p.texto
    }

    // MARK: - La pista y su marca

    private var pista: some View {
        GeometryReader { geo in
            let ancho = geo.size.width
            let alto = MunecaForma.alturaMarca
            ZStack(alignment: .leading) {
                carril(ancho: ancho, alto: alto)
                if banda.zonas == nil { rango(ancho: ancho, alto: alto) }
                if let marca = banda.marca {
                    self.marca(ancho: ancho, alto: alto, x: Swift.min(1, Swift.max(0, marca)))
                }
            }
        }
        .frame(height: MunecaForma.alturaMarca)
    }

    private func carril(ancho: CGFloat, alto: CGFloat) -> some View {
        Group {
            if let zonas = banda.zonas {
                HStack(spacing: 2) {
                    ForEach(Array(zonas.colores.enumerated()), id: \.offset) { i, color in
                        let z = i + 1
                        let enObjetivo = z >= zonas.objetivo.0 && z <= zonas.objetivo.1
                        Rectangle()
                            .fill(MunecaPaleta.zona(color))
                            .opacity(enObjetivo ? 1 : MunecaForma.opacidadZonaFuera)
                    }
                }
            } else {
                Rectangle().fill(MunecaPaleta.carril)
            }
        }
        .frame(width: ancho, height: MunecaForma.pistaBanda)
        .clipShape(Capsule())
        .frame(height: alto)
    }

    private func rango(ancho: CGFloat, alto: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: MunecaForma.radioMarca)
            .fill(MunecaPaleta.bandaObjetivo)
            .frame(width: Swift.max(0, CGFloat(banda.hasta - banda.desde)) * ancho, height: MunecaForma.pistaBanda)
            .offset(x: CGFloat(banda.desde) * ancho)
    }

    /// Dentro, una raya; fuera, un triángulo (▲ por encima, ▼ por debajo): la
    /// dirección va en la forma, no en el color.
    private func marca(ancho: CGFloat, alto: CGFloat, x: Double) -> some View {
        let lado = MunecaForma.alturaMarca
        return Group {
            switch banda.veredicto {
            case .porEncima?: TrianguloMarca(arriba: true)
            case .porDebajo?: TrianguloMarca(arriba: false)
            default: RayaMarca()
            }
        }
        .frame(width: lado, height: lado)
        .position(x: CGFloat(x) * ancho, y: alto / 2)
        .animation(.easeOut(duration: 0.7), value: x)
    }

    private var dicho: String {
        var partes = [banda.rotulo]
        if let p = banda.palabra { partes.append(textoPalabra(p).replacingOccurrences(of: "▲", with: "por encima,").replacingOccurrences(of: "▼", with: "por debajo,")) }
        return partes.joined(separator: ", ")
    }
}

/// «Estás dentro»: una raya de 4 × 16 con su contorno negro.
private struct RayaMarca: View {
    var body: some View {
        RoundedRectangle(cornerRadius: MunecaForma.radioMarca)
            .fill(MunecaPaleta.tinta)
            .frame(width: 4, height: MunecaForma.alturaMarca)
            .overlay(
                RoundedRectangle(cornerRadius: MunecaForma.radioMarca)
                    .stroke(MunecaPaleta.fondo, lineWidth: MunecaForma.contornoMarca)
            )
    }
}

/// «Estás fuera»: un triángulo blanco con contorno negro; la punta dice hacia dónde.
private struct TrianguloMarca: View {
    let arriba: Bool

    var body: some View {
        Triangulo(arriba: arriba)
            .fill(MunecaPaleta.tinta)
            .overlay(
                Triangulo(arriba: arriba)
                    .stroke(MunecaPaleta.fondo, style: StrokeStyle(lineWidth: MunecaForma.contornoMarca, lineJoin: .round))
            )
    }
}

private struct Triangulo: Shape {
    let arriba: Bool

    func path(in rect: CGRect) -> Path {
        // El trazado del kit sobre 16 × 16: punta a 1,5 y base a 14,5.
        let k = rect.width / 16
        let punta = (arriba ? 1.5 : 14.5) * k
        let base = (arriba ? 14.5 : 1.5) * k
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + 8 * k, y: rect.minY + punta))
        p.addLine(to: CGPoint(x: rect.minX + 15 * k, y: rect.minY + base))
        p.addLine(to: CGPoint(x: rect.minX + 1 * k, y: rect.minY + base))
        p.closeSubpath()
        return p
    }
}
