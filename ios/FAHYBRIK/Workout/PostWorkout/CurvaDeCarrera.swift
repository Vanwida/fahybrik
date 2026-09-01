import SwiftUI

// LA CURVA — lo que convierte el veredicto en algo VISIBLE en vez de afirmado.
//
// Un «5 de 6 dentro» es una cifra que hay que creerse. La misma sesión con la
// franja de lo pedido dibujada y las seis series sombreadas encima se ENTIENDE:
// se ve entrar y salir de la banda, y se ve dónde. Es lo único de esta pantalla
// que no puede sustituirse por texto.
//
// Port de `web/components/design-twin/screens/lectura-carrera/curva.tsx`.
//
// TRES DECISIONES QUE NO SON DE ESTILO:
//
// 1 · ARRIBA ES MÁS RÁPIDO. El ritmo es un inverso, así que dibujarlo tal cual
//     pone la serie lenta en lo alto. «Más rápido, más alto» es la única lectura
//     que no hay que explicar, y es la misma ley que el peine de la app ya sigue.
//
// 2 · LA FRANJA SE DIBUJA SOBRE EL EJE DONDE VIVE SU OBJETIVO, Y SOLO DONDE ESE
//     OBJETIVO APLICABA. Una banda de ritmo va sobre el ritmo y **solo dentro de
//     los tramos de trabajo**: una franja continua por encima de los trotes diría
//     que el coach pidió ese ritmo también en la recuperación, y no lo pidió. Un
//     objetivo de zona va sobre el PULSO, que es la señal que lo mide.
//
// 3 · UN HUECO ES UN HUECO. La línea se PARTE donde faltó la señal, y los dos
//     minutos parados de una serie son un hueco legítimo: no hay ritmo cuando no
//     te mueves. Rellenar para tener una línea bonita es fabricar dato.
//
// El suavizado es media móvil corta SOLO para dibujar, y nunca cruza un hueco.
// De aquí no sale ninguna cifra: la escala es propiedad del DATO y el suavizado,
// solo del DIBUJO.

struct CurvaDeCarrera: View {
    let ritmo: [Muestra]
    let pulso: [Muestra]
    let repeticiones: [Repeticion]
    let lectura: Lectura
    /// Instantes (s) en que se cruzó cada kilómetro. Vacío si el troceado no es
    /// por kilómetro, o si un hueco dejó los cruces sin sitio conocido.
    let kilometros: [Double]
    /// La lectura en palabras, para quien no ve el dibujo.
    let descripcion: String

    private static let alto: CGFloat = 158
    private static let margen = (arriba: 10.0, abajo: 18.0, izquierda: 34.0, derecha: 6.0)
    /// Ventana de la media móvil, en muestras. Quita el temblor del reloj y deja
    /// intacto el escalón entre una serie y su recuperación.
    private static let ventana = 5
    /// Por encima de esto los números de repetición se amontonan y estorban.
    private static let maxNumeros = 10
    private static let maxMarcasKm = 15

    var body: some View {
        VStack(spacing: 6) {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size)
            }
            .frame(height: Self.alto)
            .accessibilityElement()
            .accessibilityLabel(descripcion)
            Leyenda(banda: lectura.banda, seSale: seSaleDeEscala)
        }
    }

    // MARK: - El dibujo

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        let caja = CGRect(
            x: Self.margen.izquierda,
            y: Self.margen.arriba,
            width: max(0, size.width - Self.margen.izquierda - Self.margen.derecha),
            height: max(0, size.height - Self.margen.arriba - Self.margen.abajo)
        )
        guard caja.width > 0, caja.height > 0 else { return }

        let trozosRitmo = Self.tramosContiguos(ritmo).map(Self.suavizar)
        let trozosPulso = Self.tramosContiguos(pulso).map(Self.suavizar)
        guard !trozosRitmo.isEmpty else { return }

        let duracion = max(
            ritmo.last?.t ?? 0,
            max(pulso.last?.t ?? 0,
                repeticiones.map { $0.inicioS + $0.duracionS }.max() ?? 0)
        )
        guard duracion > 0 else { return }
        let x = { (t: Double) in caja.minX + (t / duracion) * caja.width }

        // Sobre la señal CRUDA y no la suavizada: la media móvil cruza la frontera
        // de un tramo, así que la última muestra de una subida ya lleva dentro el
        // paseo que viene detrás. Filtrando la suavizada, lo andado se colaba por
        // la puerta de atrás y el eje seguía estirado.
        let ejeRitmo = EjeDelRitmo.dominio(
            ritmo: ritmo, repeticiones: repeticiones, banda: lectura.banda
        )
        var extraPulso: [Double] = []
        if case .pulso(let min, let max, _) = lectura.banda { extraPulso = [min, max] }
        let ejePulso = EjeDelRitmo.extremos(trozosPulso.flatMap { $0 }.map(\.v), extraPulso)

        // Ritmo: menos segundos = más rápido = más arriba. Lo más lento que cabe
        // queda PINCHADO en el suelo del eje — se dibuja a puntos, así que no
        // finge un valor: dice «por aquí abajo, y más lento».
        let yRitmo = { (v: Double) -> Double in
            let rango = ejeRitmo.max - ejeRitmo.min
            guard rango > 0 else { return caja.midY }
            let bruto = caja.minY + (Swift.min(v, ejeRitmo.max) - ejeRitmo.min) / rango * caja.height
            return Swift.min(Swift.max(bruto, caja.minY), caja.maxY)
        }
        let yPulso = { (v: Double) -> Double in
            let rango = ejePulso.max - ejePulso.min
            guard rango > 0 else { return caja.midY }
            let bruto = caja.maxY - (v - ejePulso.min) / rango * caja.height
            return Swift.min(Swift.max(bruto, caja.minY), caja.maxY)
        }

        let trabajos = repeticiones.filter { $0.papel == .trabajo }
        // Solo las que TIENEN ritmo: sobre un parado no hay franja que dibujar.
        let recuperaciones = repeticiones.filter {
            $0.papel == .recuperacion && $0.ritmoSkm != nil
        }

        // Las sombras de los tramos, DEBAJO de todo: son el suelo de la lectura.
        for r in trabajos {
            let x1 = x(r.inicioS)
            let ancho = Swift.max(1.5, x(r.inicioS + r.duracionS) - x1)
            ctx.fill(
                Path(CGRect(x: x1, y: caja.minY, width: ancho, height: caja.height)),
                with: .color(Theme.Color.foreground.opacity(0.08))
            )
        }

        // La franja de lo pedido, sobre el eje donde vive su objetivo.
        switch lectura.banda {
        case .ritmo(let rapido, let lento):
            let ventanas = trabajos.isEmpty
                ? [(caja.minX, caja.maxX)]
                : trabajos.map { (x($0.inicioS), x($0.inicioS + $0.duracionS)) }
            franja(ctx, caja: caja, ventanas: ventanas,
                   arriba: yRitmo(rapido), abajo: yRitmo(lento),
                   bordeArriba: dentro(yRitmo(rapido), caja) && rapido.isFinite && rapido > 0,
                   bordeAbajo: dentro(yRitmo(lento), caja) && lento.isFinite,
                   tono: Theme.Color.ok)
        case .pulso(let minPpm, let maxPpm, let zona):
            // En un esfuerzo continuo la franja abarca todo el ancho, porque todo
            // el rato aplicaba.
            franja(ctx, caja: caja, ventanas: [(caja.minX, caja.maxX)],
                   arriba: yPulso(maxPpm), abajo: yPulso(minPpm),
                   bordeArriba: dentro(yPulso(maxPpm), caja),
                   bordeAbajo: dentro(yPulso(minPpm), caja),
                   tono: HRZone(rawValue: zona)?.color ?? Theme.Color.ok)
        case nil:
            break
        }

        // Y la del TROTE, cuando el coach también lo prescribió. Dos corredores
        // verdes en el mismo dibujo suenan a confusión y no lo son: viven en
        // ventanas de tiempo DISTINTAS, así que en cualquier vertical hay como
        // mucho una. Lo único que cambia es el peso — el sujeto sigue siendo el
        // trabajo.
        if let rec = lectura.bandaRecuperacion, !recuperaciones.isEmpty {
            franja(ctx, caja: caja,
                   ventanas: recuperaciones.map { (x($0.inicioS), x($0.inicioS + $0.duracionS)) },
                   arriba: yRitmo(rec.rapidoSkm), abajo: yRitmo(rec.lentoSkm),
                   bordeArriba: dentro(yRitmo(rec.rapidoSkm), caja) && rec.rapidoSkm > 0,
                   bordeAbajo: dentro(yRitmo(rec.lentoSkm), caja) && rec.lentoSkm.isFinite,
                   tono: Theme.Color.ok, secundaria: true)
        }

        // Los kilómetros, cuando son el troceado que toca.
        let marcas = kilometros.count <= Self.maxMarcasKm ? kilometros : []
        for (i, t) in marcas.enumerated() {
            var linea = Path()
            linea.move(to: CGPoint(x: x(t), y: caja.minY))
            linea.addLine(to: CGPoint(x: x(t), y: caja.maxY))
            ctx.stroke(linea, with: .color(Theme.Color.hairline), lineWidth: 1)
            micro(ctx, "\(i + 1)", at: CGPoint(x: x(t), y: size.height - 6), anchor: .bottom)
        }

        // El pulso: segunda serie, fina y tenue. Nunca compite con el ritmo.
        for trozo in trozosPulso {
            ctx.stroke(camino(trozo, x: x, y: yPulso),
                       with: .color(Theme.Color.muted.opacity(0.5)),
                       style: StrokeStyle(lineWidth: 1.1, lineJoin: .round))
        }

        // El ritmo: el sujeto del dibujo. Lo que se sale del eje por abajo va a
        // puntos y apagado, pegado al suelo: sigue ahí y se ve que se va.
        for trozo in trozosRitmo {
            for corrida in Self.partirPorEscala(trozo, suelo: ejeRitmo.max) {
                ctx.stroke(
                    camino(corrida.puntos, x: x, y: yRitmo),
                    with: .color(Theme.Color.foreground.opacity(corrida.fuera ? 0.45 : 1)),
                    style: StrokeStyle(
                        lineWidth: corrida.fuera ? 1.4 : 1.9,
                        lineCap: .round,
                        lineJoin: .round,
                        dash: corrida.fuera ? [2, 3] : []
                    )
                )
            }
        }

        // El eje del ritmo: tres marcas, ni una más. La unidad NO se repite en
        // cada una — se dice una sola vez, en la leyenda de abajo.
        for v in [ejeRitmo.min, (ejeRitmo.min + ejeRitmo.max) / 2, ejeRitmo.max] {
            micro(ctx, Formato.clock(v),
                  at: CGPoint(x: Self.margen.izquierda - 6, y: yRitmo(v)),
                  anchor: .trailing)
        }

        if !trabajos.isEmpty, trabajos.count <= Self.maxNumeros {
            for r in trabajos {
                let centro = (x(r.inicioS) + x(r.inicioS + r.duracionS)) / 2
                micro(ctx, "\(r.n)", at: CGPoint(x: centro, y: size.height - 6), anchor: .bottom)
            }
        }
    }

    /// La franja, dibujada ventana a ventana: donde no se pidió nada, no hay
    /// franja. El relleno va bajo a propósito — cuando el atleta clava la sesión
    /// entera, una franja opaca se come el dibujo y el gráfico se convierte en una
    /// mancha de color. El borde discontinuo es el que dice dónde está.
    private func franja(
        _ ctx: GraphicsContext,
        caja: CGRect,
        ventanas: [(Double, Double)],
        arriba: Double,
        abajo: Double,
        bordeArriba: Bool,
        bordeAbajo: Bool,
        tono: Color,
        secundaria: Bool = false
    ) {
        let opacidad = secundaria ? 0.5 : 1.0
        let alto = abs(abajo - arriba)
        guard alto > 0 || bordeArriba || bordeAbajo else { return }
        for (x1, x2) in ventanas {
            let ancho = Swift.max(1.5, x2 - x1)
            ctx.fill(
                Path(CGRect(x: x1, y: Swift.min(arriba, abajo), width: ancho, height: alto)),
                with: .color(tono.opacity(0.13 * opacidad))
            )
            for (y, dibujar) in [(arriba, bordeArriba), (abajo, bordeAbajo)] where dibujar {
                var borde = Path()
                borde.move(to: CGPoint(x: x1, y: y))
                borde.addLine(to: CGPoint(x: x1 + ancho, y: y))
                ctx.stroke(borde, with: .color(tono.opacity(0.7 * opacidad)),
                           style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
        }
    }

    private func camino(
        _ trozo: [Muestra], x: (Double) -> Double, y: (Double) -> Double
    ) -> Path {
        var p = Path()
        for (i, m) in trozo.enumerated() {
            let punto = CGPoint(x: x(m.t), y: y(m.v))
            if i == 0 { p.move(to: punto) } else { p.addLine(to: punto) }
        }
        return p
    }

    private func dentro(_ y: Double, _ caja: CGRect) -> Bool {
        y > caja.minY + 0.5 && y < caja.maxY - 0.5
    }

    /// La rotulación mínima del dibujo: mono, tabular y apagada. Nunca compite.
    private func micro(
        _ ctx: GraphicsContext, _ texto: String, at punto: CGPoint, anchor: UnitPoint
    ) {
        ctx.draw(
            Text(texto)
                .font(.system(size: 9, weight: .semibold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.faint),
            at: punto,
            anchor: anchor
        )
    }

    /// ¿Hubo algo más lento de lo que cabe? Entonces hay que DECIRLO, y la leyenda
    /// es donde se dice: sin eso, la línea de puntos sería un adorno sin explicar.
    private var seSaleDeEscala: Bool {
        let eje = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: repeticiones, banda: lectura.banda)
        return ritmo.contains { $0.v > eje.max }
    }

    // MARK: - Señal → trazos, sin cruzar ningún hueco

    /// Corta la serie en tramos contiguos. Un salto grande NO se une con una línea.
    static func tramosContiguos(_ muestras: [Muestra]) -> [[Muestra]] {
        var trozos: [[Muestra]] = []
        var actual: [Muestra] = []
        for m in muestras {
            if let anterior = actual.last,
               m.t - anterior.t > ReglasDeLectura.huecoQueParteLaCurvaS {
                trozos.append(actual)
                actual = []
            }
            actual.append(m)
        }
        if !actual.isEmpty { trozos.append(actual) }
        return trozos.filter { $0.count > 1 }
    }

    static func suavizar(_ trozo: [Muestra]) -> [Muestra] {
        guard trozo.count > 1 else { return trozo }
        return trozo.enumerated().map { i, m in
            let desde = max(0, i - ventana / 2)
            let hasta = min(trozo.count, desde + ventana)
            let media = trozo[desde..<hasta].reduce(0.0) { $0 + $1.v } / Double(hasta - desde)
            return Muestra(t: m.t, v: media)
        }
    }

    /// Un trazo partido en corridas de «dentro del eje» y «se sale por abajo».
    struct Corrida: Equatable {
        var puntos: [Muestra]
        var fuera: Bool
    }

    static func partirPorEscala(_ trozo: [Muestra], suelo: Double) -> [Corrida] {
        var corridas: [Corrida] = []
        for m in trozo {
            let fuera = m.v > suelo
            if var ultima = corridas.last, ultima.fuera == fuera {
                ultima.puntos.append(m)
                corridas[corridas.count - 1] = ultima
                continue
            }
            // El punto de cruce entra en las DOS corridas: sin él la línea se rompe
            // justo donde el lector necesita ver que se va de escala.
            let puente = corridas.last?.puntos.last
            corridas.append(Corrida(puntos: [puente, m].compactMap { $0 }, fuera: fuera))
        }
        return corridas.filter { $0.puntos.count > 1 }
    }
}

/// Qué se está mirando, en una línea y sin una sola palabra técnica.
private struct Leyenda: View {
    let banda: Banda?
    let seSale: Bool

    var body: some View {
        Text(partes.joined(separator: " · "))
            .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.faint)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    private var partes: [String] {
        var p = ["Ritmo por kilómetro, arriba más rápido", "el pulso es la línea fina"]
        switch banda {
        case .ritmo: p.append("la franja es lo que te pidieron")
        case .pulso(_, _, let zona): p.append("la franja es tu Z\(zona)")
        case nil: break
        }
        // Se dice en cristiano: los puntos de abajo no son un adorno ni un dato roto.
        if seSale { p.append("lo punteado de abajo iba más lento de lo que cabe en el eje") }
        return p
    }
}
