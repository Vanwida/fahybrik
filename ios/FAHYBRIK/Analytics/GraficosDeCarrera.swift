import SwiftUI
import Foundation

// GRÁFICOS DE CARRERA — ¿estoy mejorando?, en trazos, no en texto.
//
// Port de `web/components/design-twin/screens/analiticas-correr/graficos.tsx`,
// mirado línea a línea y no de memoria (12-ago). Comparte familia con
// `CurvaDeCarrera` (Canvas + GraphicsContext, comentarios que explican el
// PORQUÉ, no el qué): fondo tintado por el veredicto, trazos finos SOBRE el
// tinte, ejes de dos cifras diminutas pegadas al borde izquierdo, cero cajas.
//
// LAS DOS REGLAS QUE GOBIERNAN CADA GRÁFICO DE AQUÍ ABAJO:
//
// 1 · LO BUENO VA ARRIBA. Una línea que sube es ir mejor, se mida lo que se
//     mida — así que el ritmo y el coste INVIERTEN el eje: el número pequeño
//     queda arriba. Las barras de kilómetros NO lo siguen: una cantidad no es
//     buena ni mala, así que su eje va del modo normal.
// 2 · LA COMPARACIÓN SE DIBUJA. El antes es una línea fantasma, una sombra o
//     una marca sobre la barra. Nunca una frase que hay que leer y restar.
//
// Ni una caja, ni un borde de tarjeta, ni una línea divisoria: estos gráficos
// se apoyan directamente sobre el lienzo tintado de la pantalla que los aloja
// — la separación es aire y versalita, no un `background`. Y cada uno declara
// su propio caso degenerado (sin datos, un único punto, un reparto entero a
// cero) devolviendo `EmptyView`: nunca un eje roto, nunca un NaN.

// MARK: - LineaDeProgreso — el ritmo semana a semana, invertido

/// El titular de «¿voy a mejor?»: una línea con el punto de partida marcado en
/// fantasma, para que la mejora se LEA como la distancia entre el fantasma y
/// el trazo, no como una resta que hay que hacer en la cabeza.
struct LineaDeProgreso: View {
    let puntos: [PuntoSemana]
    var alto: CGFloat = 150
    /// LO BUENO VA ARRIBA, se mida lo que se mida. En un ritmo o un coste lo
    /// bueno es el número pequeño, así que el eje se invierte; en una carga o
    /// unas repeticiones lo bueno es el grande y va del modo normal.
    var mejorEsMenor: Bool = true
    /// Cómo se lee el valor (ritmo, VO₂máx...). La pantalla decide la unidad;
    /// este gráfico solo sabe dibujar una serie y rotularla con lo que le den.
    let formato: (Double) -> String

    private static let margen = (arriba: 12.0, abajo: 12.0, izquierda: 46.0, derecha: 6.0)

    var body: some View {
        if puntos.count < 2 {
            EmptyView()
        } else {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size)
            }
            .frame(height: alto)
            .accessibilityElement()
            .accessibilityLabel("De \(formato(puntos.first!.valor)) a \(formato(puntos.last!.valor))")
        }
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        let m = Self.margen
        let caja = CGRect(
            x: m.izquierda, y: m.arriba,
            width: max(0, size.width - m.izquierda - m.derecha),
            height: max(0, size.height - m.arriba - m.abajo)
        )
        guard let p = dibujaSerie(ctx, caja: caja, valores: puntos.map(\.valor),
                                  mejorEsMenor: mejorEsMenor, grosor: 2, radioUltimo: 4)
        else { return }

        // Los ejes: dos cifras nada más, a la altura exacta del mejor y del
        // peor valor, pegadas al borde izquierdo del lienzo (no de la caja).
        etiqueta(ctx, formato(p.minV), at: CGPoint(x: 0, y: p.y(p.minV)), anchor: .leading)
        etiqueta(ctx, formato(p.maxV), at: CGPoint(x: 0, y: p.y(p.maxV)), anchor: .leading)
    }
}

// MARK: - CurvaCompacta — la misma línea, del tamaño de una fila

/// CUANDO LA PREGUNTA SE REPITE POR N SUJETOS —seis levantamientos, cuatro
/// tests—, la respuesta no son seis gráficos a pantalla completa apilados: es la
/// misma tinta a escala de fila, que es como se leen varias series de una ojeada
/// sin perder ninguna.
///
/// Comparte el trazo, el fantasma y el punto de hoy con `LineaDeProgreso` — no
/// los reimplementa: si divergieran, dos gráficos de la misma app estarían
/// contando lo mismo con dos tintas distintas.
///
/// Lo único que pierde son los ejes, y a propósito: a esta altura dos cifras no
/// caben sin taparle el paso al trazo, y la fila que la aloja ya lleva el número
/// encima. Lo que NO pierde es el fantasma — ahí está la mejora.
struct CurvaCompacta: View {
    let valores: [Double]
    /// Un ritmo mejora bajando y una carga subiendo; lo bueno va arriba en las dos.
    var mejorEsMenor: Bool = false
    /// Suficiente para que la distancia entre el fantasma y el trazo SE VEA. Por
    /// debajo de esto los dos se pegan y la mejora deja de leerse, que es lo
    /// único que este gráfico existe para enseñar.
    var alto: CGFloat = 58

    /// Aire para que el halo del punto de hoy no se recorte contra el borde.
    private static let margen = 9.0

    var body: some View {
        if valores.count < 2 {
            EmptyView()
        } else {
            Canvas(rendersAsynchronously: false) { ctx, size in
                let caja = CGRect(
                    x: Self.margen, y: Self.margen,
                    width: max(0, size.width - Self.margen * 2),
                    height: max(0, size.height - Self.margen * 2)
                )
                _ = dibujaSerie(ctx, caja: caja, valores: valores,
                                mejorEsMenor: mejorEsMenor, grosor: 1.6, radioUltimo: 2.8)
            }
            .frame(height: alto)
            // La fila que la aloja lleva la lectura entera; una curva sin ejes no
            // tiene nada propio que decirle a VoiceOver.
            .accessibilityHidden(true)
        }
    }
}

/// La proyección de una serie ya dibujada, para que quien tenga ejes los rotule.
private struct SerieProyectada {
    let y: (Double) -> Double
    let minV: Double
    let maxV: Double
}

/// EL TRAZO DE UNA SERIE, ESCRITO UNA SOLA VEZ: fantasma en la altura de
/// partida, línea, anillo de origen y punto de hoy con halo. Devuelve `nil` en
/// los casos degenerados (caja sin área, menos de dos puntos) en vez de romper
/// el eje o dibujar un NaN.
private func dibujaSerie(
    _ ctx: GraphicsContext,
    caja: CGRect,
    valores: [Double],
    mejorEsMenor: Bool,
    grosor: CGFloat,
    radioUltimo: CGFloat
) -> SerieProyectada? {
    guard caja.width > 0, caja.height > 0, valores.count >= 2,
          let minV = valores.min(), let maxV = valores.max() else { return nil }

    // El margen nunca es cero aunque toda la serie sea el mismo número: sin él
    // la línea sería un segmento pegado al borde superior o inferior.
    let margenV = max(1, (maxV - minV) * 0.35)
    let lo = minV - margenV
    let hi = maxV + margenV

    let x = { (i: Int) in caja.minX + (Double(i) / Double(valores.count - 1)) * caja.width }
    // Con `mejorEsMenor` el eje va INVERTIDO: el valor pequeño (mejor, si es
    // ritmo) da una y pequeña, y en pantalla una y pequeña es ARRIBA — la
    // inversión está en NO restar de la altura. Con una carga se resta, y lo
    // bueno vuelve a quedar arriba.
    let y = { (v: Double) -> Double in
        let t = (v - lo) / (hi - lo)
        return caja.minY + (mejorEsMenor ? t : 1 - t) * caja.height
    }

    let serie = valores.enumerated().map { i, v in CGPoint(x: x(i), y: y(v)) }
    let primero = serie[0]
    let ultimo = serie[serie.count - 1]

    // El fantasma: la altura de donde salió, cruzando toda la caja. La distancia
    // entre esta línea y el trazo ES la mejora — cero palabras.
    var fantasma = Path()
    fantasma.move(to: CGPoint(x: caja.minX, y: primero.y))
    fantasma.addLine(to: CGPoint(x: caja.maxX, y: primero.y))
    ctx.stroke(fantasma, with: .color(Theme.Color.faint), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))

    ctx.stroke(trazo(serie), with: .color(Theme.Color.foreground),
               style: StrokeStyle(lineWidth: grosor, lineCap: .round, lineJoin: .round))

    // Anillo en el punto de partida: marca DÓNDE nace el fantasma, para que la
    // línea horizontal no parezca flotar sin origen.
    let radioOrigen = radioUltimo * 0.75
    ctx.stroke(
        Path(ellipseIn: CGRect(x: primero.x - radioOrigen, y: primero.y - radioOrigen,
                               width: radioOrigen * 2, height: radioOrigen * 2)),
        with: .color(Theme.Color.faint), lineWidth: grosor * 0.7
    )

    // El punto de hoy: sólido, con un halo pintado DESPUÉS para que quede por
    // delante del trazo y del anillo.
    ctx.fill(
        Path(ellipseIn: CGRect(x: ultimo.x - radioUltimo, y: ultimo.y - radioUltimo,
                               width: radioUltimo * 2, height: radioUltimo * 2)),
        with: .color(Theme.Color.foreground)
    )
    let halo = radioUltimo * 2.125
    ctx.fill(
        Path(ellipseIn: CGRect(x: ultimo.x - halo, y: ultimo.y - halo, width: halo * 2, height: halo * 2)),
        with: .color(Theme.Color.foreground.opacity(0.16))
    )

    return SerieProyectada(y: y, minV: minV, maxV: maxV)
}

// MARK: - BarrasSemanales — kilómetros por semana, sin juicio

/// Una cantidad no es buena ni mala, así que este es el único gráfico de la
/// familia que NO invierte el eje: más barra es más kilómetros, y punto. La
/// media de arranque marcada en fantasma es la única comparación que necesita.
struct BarrasSemanales: View {
    let puntos: [PuntoSemana]
    var alto: CGFloat = 104

    private static let gap = 6.0
    private static let alturaMinimaPct = 0.03

    var body: some View {
        let maximo = puntos.map(\.valor).max() ?? 0
        if maximo <= 0 {
            // Vacío, o toda la serie a cero (nunca ha corrido): la web divide
            // entre `max` sin guardarlo, y un 0/0 es NaN. Aquí no hay con qué
            // comparar, así que no se dibuja nada en vez de fabricar un eje roto.
            EmptyView()
        } else {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size, maximo: maximo)
            }
            .frame(height: alto)
            .accessibilityElement()
            .accessibilityLabel("\(puntos.count) semanas de kilómetros")
        }
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize, maximo: Double) {
        let n = puntos.count
        let anchoBarra = max(0, (size.width - Self.gap * Double(n - 1)) / Double(n))

        // La media de las primeras semanas: la subida se ve CONTRA ella, no
        // contra el cero.
        let cuenta = min(4, n)
        let base = puntos.prefix(cuenta).reduce(0.0) { $0 + $1.valor } / Double(cuenta)
        let yBase = size.height * (1 - base / maximo)
        var lineaBase = Path()
        lineaBase.move(to: CGPoint(x: 0, y: yBase))
        lineaBase.addLine(to: CGPoint(x: size.width, y: yBase))
        ctx.stroke(lineaBase, with: .color(Theme.Color.faint), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))

        for (i, p) in puntos.enumerated() {
            let fraccion = max(Self.alturaMinimaPct, p.valor / maximo)
            let alturaBarra = size.height * fraccion
            let x = Double(i) * (anchoBarra + Self.gap)
            let rect = CGRect(x: x, y: size.height - alturaBarra, width: anchoBarra, height: alturaBarra)
            // Esquinas cuadradas a propósito: la referencia usa columnas rectas,
            // no píldoras — esto es un instrumento, no una app de bienestar.
            let color = i == n - 1 ? Theme.Color.foreground : Theme.Color.foreground.opacity(0.22)
            ctx.fill(Path(rect), with: .color(color))
        }
    }
}

// MARK: - BarraDeReparto — el reparto de zona, con el objetivo del coach encima

/// El color SÍ es de zona aquí, porque lo que se mide ES la zona: un tramo
/// ámbar es Z4 igual que en el resto de la app. El objetivo del coach es una
/// marca sobre la barra, no una frase — la distancia entre la marca y donde
/// corta el segmento es el desvío, y se ve sin leer nada.
///
/// DIFERENCIA A PROPÓSITO CON `graficos.tsx`: esta versión usa una píldora
/// fina (10pt + esquinas redondeadas) sin el triángulo indicador que trae hoy
/// esa pantalla. Es una simplificación deliberada de este encargo, no un
/// olvido — si `graficos.tsx` cambia de forma, conviene revisar que las dos
/// sigan diciendo lo mismo.
struct BarraDeReparto: View {
    let segmentos: [(zona: Int?, pct: Double)]
    let objetivoSuave: Double

    // Las medidas son las del diseño aprobado, no una versión redondeada de él:
    // barra RECTA de 30 pt (las esquinas redondas la convertirían en una píldora
    // de dashboard), 9 pt de aire arriba para el banderín, y una marca de 1,5 pt.
    private static let altoBarra = 30.0
    private static let aireArriba = 9.0
    private static let anchoMarca = 1.5
    private static let banderin = (medioAncho: 4.0, alto: 5.0)

    var body: some View {
        Canvas(rendersAsynchronously: false) { ctx, size in
            dibuja(ctx, size: size)
        }
        .frame(height: Self.altoBarra + Self.aireArriba)
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        guard size.width > 0 else { return }
        let barra = CGRect(x: 0, y: Self.aireArriba, width: size.width, height: Self.altoBarra)

        var cursorX = barra.minX
        for segmento in segmentos {
            let ancho = barra.width * max(0, segmento.pct) / 100
            guard ancho > 0 else { continue }
            // El hueco «sin pulso» va en la propia tinta al 14 %, no en un gris
            // aparte: es tiempo corrido que no se pudo clasificar, no otra zona.
            let color = segmento.zona.flatMap { HRZone(rawValue: $0)?.color }
                ?? Theme.Color.foreground.opacity(0.14)
            ctx.fill(
                Path(CGRect(x: cursorX, y: barra.minY, width: ancho, height: barra.height)),
                with: .color(color)
            )
            cursorX += ancho
        }

        // EL OBJETIVO DEL COACH, con banderín. La línea sola se confundiría con un
        // corte de zona; el triángulo dice que ESO es la meta y no una frontera
        // más de la barra. Va desde 3 pt por encima de la barra hasta el suelo.
        let xObjetivo = size.width * max(0, min(100, objetivoSuave)) / 100
        ctx.fill(
            Path(CGRect(x: xObjetivo - Self.anchoMarca / 2, y: 3,
                        width: Self.anchoMarca, height: size.height - 3)),
            with: .color(Theme.Color.foreground)
        )
        var punta = Path()
        punta.move(to: CGPoint(x: xObjetivo - Self.banderin.medioAncho, y: 0))
        punta.addLine(to: CGPoint(x: xObjetivo + Self.banderin.medioAncho, y: 0))
        punta.addLine(to: CGPoint(x: xObjetivo, y: Self.banderin.alto))
        punta.closeSubpath()
        ctx.fill(punta, with: .color(Theme.Color.foreground))
    }
}

// MARK: - CurvaDeEsfuerzos — el motor, no un récord suelto

/// El estándar de Strava y Golden Cheetah: sustituye a los tres récords sueltos
/// de 1, 3 y 5 km. Un récord dice si ese día fue bueno; la curva dice de qué
/// está hecho el motor. El hueco entre hoy y hace un mes ES el progreso, y es
/// la única forma de verlo sin contarlo.
struct CurvaDeEsfuerzos: View {
    let hoy: [Esfuerzo]
    let antes: [Esfuerzo]
    var alto: CGFloat = 168

    private static let margen = (arriba: 10.0, abajo: 22.0, lateral: 4.0)
    private static let marcasMetros = [400, 1000, 5000, 10000]

    var body: some View {
        if hoy.count + antes.count < 2 {
            EmptyView()
        } else {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size)
            }
            .frame(height: alto)
            .accessibilityElement()
            .accessibilityLabel("Tus mejores esfuerzos" + (antes.isEmpty ? "" : ", con los de hace un mes por detrás"))
        }
    }

    /// Ritmo en segundos por kilómetro — la unidad común que permite comparar
    /// un 400 y un 10k en el mismo eje.
    private func skm(_ e: Esfuerzo) -> Double { e.segundos / Double(e.metros) * 1000 }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        let m = Self.margen
        let caja = CGRect(
            x: m.lateral, y: m.arriba,
            width: max(0, size.width - m.lateral * 2),
            height: max(0, size.height - m.arriba - m.abajo)
        )
        guard caja.width > 0, caja.height > 0 else { return }

        let todos = hoy + antes
        let ritmos = todos.map(skm)
        guard let minR = ritmos.min(), let maxR = ritmos.max() else { return }
        let margenR = max(6, (maxR - minR) * 0.1)
        let lo = minR - margenR
        let hi = maxR + margenR

        let metros = todos.map { Double($0.metros) }
        guard let metrosMin = metros.min(), let metrosMax = metros.max(), metrosMin > 0 else { return }
        let x0 = log(metrosMin)
        let x1 = log(metrosMax)
        // Todos los esfuerzos a la MISMA distancia: no hay eje que trazar. La
        // web no lo guarda; aquí un eje sin anchura no se dibuja, no se rompe.
        guard x1 > x0 else { return }

        let x = { (metros: Int) in caja.minX + ((log(Double(metros)) - x0) / (x1 - x0)) * caja.width }
        // Invertido, como toda la pantalla: menos segundos por kilómetro, más
        // arriba.
        let y = { (ritmo: Double) in caja.minY + ((ritmo - lo) / (hi - lo)) * caja.height }
        let punto = { (e: Esfuerzo) in CGPoint(x: x(e.metros), y: y(skm(e))) }

        let serieHoy = hoy.map(punto)
        let serieAntes = antes.map(punto)
        let marcas = Self.marcasMetros.filter { Double($0) >= metrosMin && Double($0) <= metrosMax }

        for metrosMarca in marcas {
            var linea = Path()
            linea.move(to: CGPoint(x: x(metrosMarca), y: caja.minY))
            linea.addLine(to: CGPoint(x: x(metrosMarca), y: caja.maxY))
            ctx.stroke(linea, with: .color(Theme.Color.hairline), lineWidth: 1)
        }

        // El hueco entre hoy y hace un mes: verde si mejoró, ámbar si no. Se
        // compara SOLO el último punto (la distancia más larga) de cada curva
        // — no un área ni una media, porque lo que importa es el motor a tope.
        // Solo se dibuja con las DOS series puestas: `.last` no es nil implica
        // que ninguna está vacía.
        if let ultimoHoy = hoy.last, let ultimoAntes = antes.last {
            let mejora = skm(ultimoHoy) < skm(ultimoAntes)
            var banda = trazo(serieHoy)
            for pAntes in serieAntes.reversed() { banda.addLine(to: pAntes) }
            banda.closeSubpath()
            ctx.fill(banda, with: .color((mejora ? Theme.Color.ok : Theme.Color.warning).opacity(0.16)))
        }

        if serieAntes.count > 1 {
            ctx.stroke(trazo(serieAntes), with: .color(Theme.Color.muted),
                       style: StrokeStyle(lineWidth: 1.4, lineCap: .butt, lineJoin: .round, dash: [3, 4]))
        }
        if serieHoy.count > 1 {
            ctx.stroke(trazo(serieHoy), with: .color(Theme.Color.foreground),
                       style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }

        // Las marcas de distancia van AL FINAL, por encima de las curvas: si
        // un trazo pasa cerca del suelo, el rótulo se sigue leyendo.
        for metrosMarca in marcas {
            etiqueta(ctx, etiquetaMarca(metrosMarca), at: CGPoint(x: x(metrosMarca), y: size.height - 6), anchor: .bottom)
        }
    }

    private func etiquetaMarca(_ metros: Int) -> String {
        metros >= 1000 ? "\(metros / 1000)k" : "\(metros)"
    }
}

// MARK: - PuntosDePedido — un punto por repetición, el sesgo se ve solo

/// Sustituye al anillo de porcentaje: un donut no significa nada en
/// particular y cabe en cualquier app. Un punto por repetición sí — la
/// proporción se lee sin número, y el SESGO (fallar rápido frente a fallar
/// lento) aparece solo, porque cada uno tiene su color y se agrupan a la vista.
struct PuntosDePedido: View {
    let dentro: Int
    let lento: Int
    let rapido: Int

    private static let diametro: CGFloat = 7
    private static let gap: CGFloat = 5

    var body: some View {
        FlowLayout(spacing: Self.gap) {
            ForEach(0..<max(0, dentro), id: \.self) { _ in punto(Theme.Color.ok) }
            ForEach(0..<max(0, lento), id: \.self) { _ in punto(Theme.Color.neutral) }
            ForEach(0..<max(0, rapido), id: \.self) { _ in punto(Theme.Color.danger) }
        }
        .accessibilityElement()
        .accessibilityLabel("\(dentro) repeticiones dentro, \(lento) lentas, \(rapido) pasadas de rosca")
    }

    private func punto(_ color: Color) -> some View {
        Circle().fill(color).frame(width: Self.diametro, height: Self.diametro)
    }
}

// MARK: - PlazoDeSemanas — «aún no» dibujado, no explicado

/// El plazo de un veredicto «aún no»: cuántas de las semanas que hacen falta
/// ya llevas, en segmentos — no en una frase que hay que hacer memoria para
/// comparar con la de la semana pasada.
struct PlazoDeSemanas: View {
    let llevas: Int
    let hacen: Int

    private static let gap: CGFloat = 4
    private static let altoSegmento: CGFloat = 4
    private static let radio: CGFloat = 2

    var body: some View {
        if hacen <= 0 {
            EmptyView()
        } else {
            HStack(spacing: Self.gap) {
                ForEach(0..<hacen, id: \.self) { i in
                    RoundedRectangle(cornerRadius: Self.radio)
                        .fill(i < llevas ? Theme.Color.foreground : Theme.Color.foreground.opacity(0.18))
                        .frame(height: Self.altoSegmento)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("\(llevas) de \(hacen) semanas")
        }
    }
}

// MARK: - LecturaApagada — la lectura se enseña, no se explica

/// Sin cobertura, un gráfico no desaparece ni se cuenta en un párrafo: se
/// pinta su hueco en tenue con un candado encima. El único texto de este
/// bloque vive fuera, en el botón que desbloquea — aquí no hay ni una palabra,
/// así que se oculta entera a VoiceOver en vez de leerse como un dato roto.
struct LecturaApagada: View {
    let alto: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.l)
            .fill(Theme.Color.surface.opacity(0.35))
            .frame(maxWidth: .infinity)
            .frame(height: alto)
            .overlay {
                Image(systemName: "lock.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.faint)
            }
            .accessibilityHidden(true)
    }
}

// MARK: - Helpers compartidos

/// Construye el trazo recto entre puntos ya proyectados a pantalla — el
/// equivalente Swift de `ruta()` en graficos.tsx.
private func trazo(_ puntos: [CGPoint]) -> Path {
    var p = Path()
    for (i, punto) in puntos.enumerated() {
        if i == 0 { p.move(to: punto) } else { p.addLine(to: punto) }
    }
    return p
}

/// El mismo rótulo minúsculo que `CurvaDeCarrera`: mono, apagado, nunca
/// compite con el trazo. No hay un helper compartido entre ficheros para
/// esto —cada Canvas dibuja el suyo—, así que este es el de esta familia.
private func etiqueta(_ ctx: GraphicsContext, _ texto: String, at punto: CGPoint, anchor: UnitPoint) {
    ctx.draw(
        Text(texto)
            .font(.system(size: 9, weight: .semibold, design: .monospaced).monospacedDigit())
            .foregroundStyle(Theme.Color.faint),
        at: punto,
        anchor: anchor
    )
}
