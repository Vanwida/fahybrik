import SwiftUI

// LA GRÁFICA DEL PULSO DE TODA LA SESIÓN — la capa que Alex pidió más alto viendo
// la app real: «falta la gráfica del pulso a lo largo del entreno» (card 124).
//
// Port de `web/components/design-twin/screens/lectura-sesion/grafica.tsx`.
// `CurvaDeCarrera` (lectura de carrera) dibuja ritmo + pulso con una franja
// objetivo; esta es su prima simplificada para una sesión que no tiene un solo
// eje que comparar — aquí no hay banda que dibujar, solo la media y la máxima
// marcadas, que es lo único que se pidió.
//
// LA TRAZA ES SIEMPRE REAL. A diferencia del doble —que reconstruye una curva
// ilustrativa cuando la base solo guardó el agregado por bloque—, esta gráfica
// solo se pinta con `execution.trace.display_curve.hr`, el archivo que el motor
// grabó latido a latido. Sin traza, no hay gráfica: nunca se inventa una curva
// para rellenar el hueco (§7 CONTRATO-UI).
struct GraficaDePulso: View {
    let muestras: [Muestra]
    /// Los reales de la sesión — se ROTULAN tal cual, nunca recalculados de la
    /// curva de abajo (que puede quedarse corta de la muestra que marcó el pico).
    let mediaPpm: Double
    let maxPpm: Double
    let duracionS: Double

    private static let alto: CGFloat = 132
    private static let margen = (arriba: 10.0, abajo: 22.0, izquierda: 8.0, derecha: 8.0)

    var body: some View {
        VStack(spacing: 8) {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size)
            }
            .frame(height: Self.alto)
            .accessibilityElement()
            .accessibilityLabel(
                "Pulso de toda la sesión: media \(Int(mediaPpm.rounded())) ppm, "
                + "máxima \(Int(maxPpm.rounded())) ppm"
            )
            // El eje de tiempo — pie de gráfica, suelo de 15 pt (§4.1 CONTRATO-UI).
            HStack {
                ForEach([0, duracionS / 2, duracionS], id: \.self) { t in
                    Text(Formato.clock(t))
                        .font(.system(size: 15, weight: .semibold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.muted)
                    if t < duracionS { Spacer(minLength: 0) }
                }
            }
        }
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        guard muestras.count > 1, duracionS > 0 else { return }
        let caja = CGRect(
            x: Self.margen.izquierda,
            y: Self.margen.arriba,
            width: max(0, size.width - Self.margen.izquierda - Self.margen.derecha),
            height: max(0, Self.alto - Self.margen.arriba - Self.margen.abajo)
        )
        guard caja.width > 0, caja.height > 0 else { return }

        // El dominio incluye SIEMPRE la media y la máxima reales: la referencia
        // no puede caer fuera del dibujo aunque la traza se quede corta de ellas.
        let valores = muestras.map(\.v)
        let minimo = min(valores.min() ?? mediaPpm, mediaPpm)
        let maximo = max(valores.max() ?? maxPpm, maxPpm)
        let margenEje = (maximo - minimo) * 0.12
        let dominioMin = minimo - (margenEje > 0 ? margenEje : 4)
        let dominioMax = maximo + (margenEje > 0 ? margenEje : 4)
        let rango = max(dominioMax - dominioMin, 1)

        let x = { (t: Double) in caja.minX + (t / duracionS) * caja.width }
        let y = { (v: Double) in caja.minY + caja.height - ((v - dominioMin) / rango) * caja.height }

        // Las líneas de referencia van DEBAJO del trazo: cruzarlo es lo correcto,
        // es lo que dice si el pulso estuvo por encima o por debajo de su media
        // en cada tramo.
        linea(ctx, y: y(maxPpm), caja: caja, color: Theme.Color.warning)
        linea(ctx, y: y(mediaPpm), caja: caja, color: Theme.Color.muted)

        var camino = Path()
        for (i, m) in muestras.enumerated() {
            let punto = CGPoint(x: x(m.t), y: y(m.v))
            if i == 0 { camino.move(to: punto) } else { camino.addLine(to: punto) }
        }
        ctx.stroke(camino, with: .color(Theme.Color.foreground),
                   style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

        // Los RÓTULOS van ENCIMA del trazo — si fueran antes, el propio pulso los
        // tapaba justo cuando el trazo pasaba cerca de su media, que es
        // precisamente cuando más falta hace leerlos.
        rotulo(ctx, y: y(maxPpm), caja: caja, texto: "\(Int(maxPpm.rounded())) máx", color: Theme.Color.warning)
        rotulo(ctx, y: y(mediaPpm), caja: caja, texto: "\(Int(mediaPpm.rounded())) media", color: Theme.Color.muted)
    }

    private func linea(_ ctx: GraphicsContext, y: Double, caja: CGRect, color: Color) {
        var p = Path()
        p.move(to: CGPoint(x: caja.minX, y: y))
        p.addLine(to: CGPoint(x: caja.maxX, y: y))
        ctx.stroke(p, with: .color(color.opacity(0.8)), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
    }

    /// Un halo sólido detrás del rótulo: sin él, «156 media» se camufla contra el
    /// propio trazo del pulso justo cuando la curva pasa cerca de su línea — que
    /// es precisamente cuando más falta hace leerlo.
    private func rotulo(_ ctx: GraphicsContext, y: Double, caja: CGRect, texto: String, color: Color) {
        let fuente = Font.system(size: 15, weight: .bold, design: .monospaced)
        let resuelto = ctx.resolve(Text(texto).font(fuente).foregroundStyle(color))
        let anchoHalo = resuelto.measure(in: CGSize(width: CGFloat.infinity, height: 22)).width + 8
        ctx.fill(
            Path(CGRect(x: caja.maxX - anchoHalo, y: y - 18, width: anchoHalo, height: 18)),
            with: .color(Theme.Color.surface)
        )
        ctx.draw(resuelto, at: CGPoint(x: caja.maxX - 4, y: y - 9), anchor: .trailing)
    }
}
