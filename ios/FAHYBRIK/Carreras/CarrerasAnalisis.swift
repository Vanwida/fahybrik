import SwiftUI

// EL ANÁLISIS de la última carrera individual: dónde perdiste tiempo (estaciones contra tu puesto y
// tu entreno, ritmo por km), cómo evolucionas y, si el servidor lo manda, el informe de la IA.
// Espejo de `analisis.tsx`. Solo carreras individuales: el tiempo de una estación de dobles es del
// equipo, no tuyo.
//
// Reglas de honestidad (§7) que este fichero cumple y la vista NO decide:
//   · una estación sin puesto NO lleva barra ni veredicto (una barra a media altura insinuaría un
//     puesto que nadie midió) y la sección dice por qué;
//   · una estación sin tiempo ni delta desaparece: un hueco que el atleta no puede llenar (es un
//     resultado ya corrido) se calla;
//   · sin dos individuales no hay evolución que dibujar.
// El color de estado (arriba / medio / abajo) va en la barra; la cifra va en tinta, y la posición
// además va en PALABRAS, porque el color solo no basta (§4.2).

extension SeveridadCarrera {
    /// El color de estado de la barra. Semántico: no lo toca el club.
    var color: SwiftUI.Color {
        switch self {
        case .better: return Theme.Color.ok
        case .slightlyWorse: return Theme.Color.warning
        case .worse: return Theme.Color.danger
        }
    }
}

/// El título de un bloque dentro de «Pasadas»: un escalón por debajo del de sección, con su nota.
struct SubTituloCarreras: View {
    let titulo: String
    var nota: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titulo).subtituloCarreras()
            if let nota {
                Text(nota)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Estaciones

private struct FilaEstacion: View {
    let e: EstacionVsReferencia
    let i: Int
    let alAbrir: (String) -> Void

    private var conBarra: Bool { e.fraccion != nil && e.severidad != nil }

    private var voz: String {
        [
            e.estacion,
            e.tiempoS.map { Formato.clock($0) },
            conBarra ? "puesto en el campo: \(e.severidad!.puestoEnCampo.lowercased())" : nil,
            e.deltaS.map { "\(GoalGapFormat.signedDuration($0)) contra tu nivel de entreno" },
        ].compactMap { $0 }.joined(separator: ". ")
    }

    var body: some View {
        Button {
            Haptics.light()
            alAbrir(e.estacion)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
                    Text(e.estacion)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let t = e.tiempoS {
                        Text(Formato.clock(t))
                            .papel(.cuerpoFuerte)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    IconoDia(.chevron, tam: 16).foregroundStyle(Theme.Color.muted)
                }
                if conBarra || e.deltaS != nil {
                    HStack(spacing: Theme.Spacing.m - 2) {
                        if conBarra, let fraccion = e.fraccion, let sev = e.severidad {
                            Capsule()
                                .fill(Theme.Color.foreground.opacity(0.12))
                                .frame(height: 8)
                                .overlay(alignment: .leading) {
                                    GeometryReader { g in
                                        Capsule().fill(sev.color).frame(width: g.size.width * CGFloat(max(0, min(1, fraccion))))
                                    }
                                }
                            Text(sev.puestoEnCampo)
                                .papel(.rotulo)
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(minWidth: 52, alignment: .leading)
                        } else {
                            Spacer(minLength: 0)
                        }
                        if let d = e.deltaS {
                            Text(GoalGapFormat.signedDuration(d))
                                .papel(.rotulo)
                                .monospacedDigit()
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(minWidth: 62, alignment: .trailing)
                        }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m - 2)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.99))
        .overlay(alignment: .top) {
            if i > 0 { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voz)
        .accessibilityHint("Abre el detalle de la estación")
        .accessibilityAddTraits(.isButton)
    }
}

struct EstacionesCarreras: View {
    let analisis: AnalisisCarrera
    let alAbrir: (String) -> Void

    var body: some View {
        // Sin tiempo y sin delta no hay nada que enseñar de esa estación: se calla.
        let filas = analisis.estaciones.filter { $0.tiempoS != nil || $0.deltaS != nil }
        if !filas.isEmpty {
            let sinPuesto = DecideCarreras.estacionesSinPuesto(analisis.estaciones)
            let hayDelta = filas.contains { $0.deltaS != nil }
            let nota = sinPuesto
                ? "Esta carrera no trae tu puesto por estación, así que no hay comparación con el resto del campo. Los tiempos sí son los tuyos."
                : hayDelta
                    ? "Cuanto más corta la barra, mejor tu puesto. La cifra de la derecha es contra tu nivel de entreno."
                    : "Cuanto más corta la barra, mejor tu puesto."
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SubTituloCarreras(titulo: "Estaciones", nota: nota)
                VStack(spacing: 0) {
                    ForEach(Array(filas.enumerated()), id: \.offset) { i, e in
                        FilaEstacion(e: e, i: i, alAbrir: alAbrir)
                    }
                }
                .tarjetaCarreras()
            }
        }
    }
}

// MARK: - Ritmo por km

struct RitmoPorKmCarreras: View {
    let analisis: AnalisisCarrera

    private static let altoGrafica: CGFloat = 96

    var body: some View {
        if !analisis.ritmoPorKm.isEmpty {
            let voz = analisis.ritmoPorKm.map { v in
                "kilómetro \(v.km)\(v.ritmoS.map { ", \(Formato.clock($0))" } ?? ""), \(v.severidad.ritmoEnPalabras)"
            }.joined(separator: ". ")
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SubTituloCarreras(titulo: "Ritmo por km", nota: "¿Aguantas el final? Barra más alta, kilómetro más lento.")
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(analisis.ritmoPorKm, id: \.km) { v in
                            VStack(spacing: 6) {
                                Text(v.ritmoS.map { Formato.clock($0) } ?? "")
                                    .papel(.notaFuerte)
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.Color.foreground)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .fill(v.severidad.color)
                                    .frame(height: max(8, (CGFloat(v.altura) * Self.altoGrafica).rounded()))
                                    .frame(height: Self.altoGrafica, alignment: .bottom)
                                Text("\(v.km)")
                                    .papel(.notaFuerte)
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.Color.muted)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(voz)
                    .accessibilityAddTraits(.isImage)
                    if let caida = analisis.caidaRitmoS {
                        HStack(alignment: .top, spacing: Theme.Spacing.s) {
                            IconoDia(.sube, tam: 16, peso: .bold)
                                .foregroundStyle(Theme.Color.warning)
                                .padding(.top, 2)
                            Text("Caída de ritmo en la segunda mitad: +\(caida) s/km")
                                .papel(.notaFuerte)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, Theme.Spacing.m)
                        .padding(.vertical, Theme.Spacing.m - 2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.Color.warningTint, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.warning.opacity(0.34), lineWidth: 1))
                    }
                }
                .padding(EdgeInsets(top: 16, leading: 14, bottom: 14, trailing: 14))
                .frame(maxWidth: .infinity, alignment: .leading)
                .tarjetaCarreras()
            }
        }
    }
}

// MARK: - Evolución

/// Tu tiempo total en las últimas individuales. Es una LÍNEA con sus puntos, no barras: unas barras que
/// arrancan en cero hacen que 73:10 y 66:52 parezcan casi el mismo tiempo, y esa diferencia (seis
/// minutos) es lo único que el atleta viene a ver. La escala va del más lento al más rápido de la
/// ventana y cada punto lleva su cifra, así que nada se lee sin el número. Mejorar SUBE la línea.
struct EvolucionCarreras: View {
    let pasadas: [CarreraPasada]

    private static let altoLinea: CGFloat = 84
    /// Margen de la línea arriba y abajo, como fracción del alto, para que un punto no toque el borde.
    private static let margen: CGFloat = 0.06

    var body: some View {
        if let puntos = DecideCarreras.evolucion(pasadas) {
            let n = puntos.count
            let tiempos = puntos.map(\.totalS)
            let maximo = tiempos.max() ?? 0
            let minimo = tiempos.min() ?? 0
            let rango = maximo - minimo
            // 0 = arriba = el más rápido de la ventana; 1 = abajo = el más lento; todos iguales, en el centro.
            let yDe: (Int) -> CGFloat = { t in rango == 0 ? 0.5 : 1 - CGFloat(maximo - t) / CGFloat(rango) }
            let mejora = puntos[0].totalS - puntos[n - 1].totalS
            let primera = FechaES.mesAnio(puntos[0].fecha) ?? ""
            let voz = puntos.map { "\(FechaES.mesAnio($0.fecha) ?? ""), \(Formato.clock($0.totalS, enHoras: false))" }
                .joined(separator: ". ")
                + ". " + (mejora > 0 ? "Has bajado \(Formato.clock(mejora))" : mejora < 0 ? "Has subido \(Formato.clock(-mejora))" : "Igual que la primera")
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SubTituloCarreras(
                    titulo: "Evolución",
                    nota: "Tu tiempo total en \(n == 2 ? "tus dos" : "tus últimas \(n)") individuales. Más arriba, más rápido."
                )
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    if mejora != 0 {
                        CintaCarreras(icono: {
                            IconoDia(mejora > 0 ? .baja : .sube, tam: 16, peso: .bold)
                                .foregroundStyle(mejora > 0 ? Theme.Color.ok : Theme.Color.warning)
                        }) {
                            Text("\(Formato.clock(abs(mejora))) \(mejora > 0 ? "más rápido" : "más lento") que en \(primera)")
                        }
                    }
                    VStack(spacing: 0) {
                        HStack(spacing: 0) {
                            ForEach(puntos, id: \.raceId) { p in
                                Text(Formato.clock(p.totalS, enHoras: false))
                                    .papel(p.ultimo ? .notaPesada : .notaFuerte)
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.Color.foreground)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        Linea(puntos: puntos, yDe: yDe, margen: Self.margen)
                            .frame(height: Self.altoLinea)
                            .padding(.vertical, 4)
                        HStack(spacing: 0) {
                            ForEach(puntos, id: \.raceId) { p in
                                Text(FechaES.mesAnio(p.fecha) ?? "")
                                    .papel(.notaFuerte)
                                    .foregroundStyle(p.ultimo ? Theme.Color.foreground : Theme.Color.muted)
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(voz)
                    .accessibilityAddTraits(.isImage)
                }
                .padding(EdgeInsets(top: 16, leading: 14, bottom: 14, trailing: 14))
                .frame(maxWidth: .infinity, alignment: .leading)
                .tarjetaCarreras()
            }
        }
    }

    /// La línea y sus puntos: cada punto en el centro de su columna, el último (el actual) más grande y
    /// del acento del club.
    private struct Linea: View {
        let puntos: [PuntoEvolucion]
        let yDe: (Int) -> CGFloat
        let margen: CGFloat

        var body: some View {
            GeometryReader { g in
                let n = CGFloat(puntos.count)
                let alto = g.size.height
                let punto: (Int) -> CGPoint = { i in
                    CGPoint(
                        x: (CGFloat(i) + 0.5) / n * g.size.width,
                        y: alto * (margen + yDe(puntos[i].totalS) * (1 - 2 * margen))
                    )
                }
                ZStack {
                    trazo(punto).stroke(Theme.Color.hairlineStrong, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    trazo(punto).stroke(Theme.Color.muted, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    ForEach(Array(puntos.enumerated()), id: \.offset) { i, p in
                        Circle()
                            .fill(p.ultimo ? Theme.Color.accent : Theme.Color.surface)
                            .overlay(Circle().strokeBorder(p.ultimo ? Theme.Color.accent : Theme.Color.muted, lineWidth: 2.5))
                            .frame(width: p.ultimo ? 18 : 12, height: p.ultimo ? 18 : 12)
                            .position(punto(i))
                    }
                }
            }
        }

        private func trazo(_ punto: (Int) -> CGPoint) -> Path {
            var ruta = Path()
            for i in puntos.indices {
                if i == 0 { ruta.move(to: punto(i)) } else { ruta.addLine(to: punto(i)) }
            }
            return ruta
        }
    }
}

// MARK: - Informe de la IA

/// Un texto que se parte en filas: las etiquetas de un informe caben las que quepan y el resto baja.
struct FlujoCarreras: Layout {
    var espacio: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, fila: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            if x > 0, x + t.width > ancho { y += fila + espacio; x = 0; fila = 0 }
            x += t.width + espacio
            fila = max(fila, t.height)
            maxX = max(maxX, x - espacio)
        }
        return CGSize(width: maxX, height: y + fila)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, fila: CGFloat = 0
        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + t.width > bounds.maxX { y += fila + espacio; x = bounds.minX; fila = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + espacio
            fila = max(fila, t.height)
        }
    }
}

struct InformeCarreras: View {
    let analisis: AnalisisCarrera

    var body: some View {
        if let informe = analisis.informe {
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                HStack(spacing: Theme.Spacing.s) {
                    IconoDia(.diana, tam: 18)
                    Text("Informe IA · a priorizar").papel(.kicker)
                }
                .foregroundStyle(Theme.Color.foreground)
                Text(informe.resumen)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if !informe.grupos.isEmpty {
                    FlujoCarreras {
                        ForEach(informe.grupos, id: \.self) { ChipCarreras($0, estilo: .superficie) }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaCarreras(realce: true)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Informe de la IA, a priorizar. \(informe.resumen)")
        }
    }
}

// MARK: - Predicho contra real: la puerta

struct PuertaPredichoVsRealCarreras: View {
    let predicho: PredichoVsReal
    let nombre: String
    let alAbrir: () -> Void

    var body: some View {
        let detalle = [
            predicho.predijimosS.map { "Predijimos \(Formato.clock($0, enHoras: false))" },
            predicho.hicisteS.map { "hiciste \(Formato.clock($0, enHoras: false))" },
        ].compactMap { $0 }.joined(separator: " · ")
        let precision = Formato.porcentaje(fraccion: predicho.precisionPct.map { $0 / 100 }).map { pct in
            "Predicción a \(pct)\(predicho.precisionPalabra.map { ", \($0)" } ?? "")"
        }
        Button {
            Haptics.light()
            alAbrir()
        } label: {
            HStack(spacing: 14) {
                FichaDia(.diana)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Predicho contra real").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    if !detalle.isEmpty {
                        Text(detalle).papel(.nota).monospacedDigit().foregroundStyle(Theme.Color.muted)
                    }
                    if let precision {
                        Text(precision).papel(.notaFuerte).monospacedDigit().foregroundStyle(Theme.Color.foreground)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m + 2)
            .frame(minHeight: 76)
            .tarjetaCarreras()
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(["Predicho contra real", nombre, detalle, precision].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ". "))
        .accessibilityHint("Abre la comparación")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - En frío y en error

/// El esqueleto del análisis: dos bloques con la forma de los reales (las estaciones, el ritmo).
struct EsqueletoAnalisisCarreras: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SkeletonBar(width: 140, height: 22, radius: 7)
                VStack(spacing: 0) {
                    ForEach(0..<4, id: \.self) { i in
                        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                            HStack {
                                SkeletonBar(width: 130, height: 17, radius: 6)
                                Spacer(minLength: Theme.Spacing.m)
                                SkeletonBar(width: 48, height: 17, radius: 6)
                            }
                            SkeletonBar(height: 8, radius: 4)
                        }
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, Theme.Spacing.m - 2)
                        .frame(minHeight: 56)
                        .overlay(alignment: .top) {
                            if i > 0 { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
                        }
                    }
                }
                .tarjetaCarreras()
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SkeletonBar(width: 120, height: 22, radius: 7)
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach([70, 76, 80, 84, 88, 92, 96, 100], id: \.self) { h in
                        SkeletonBar(height: CGFloat(h) * 0.9, radius: 5)
                    }
                }
                .padding(EdgeInsets(top: 16, leading: 14, bottom: 16, trailing: 14))
                .frame(height: 168, alignment: .bottom)
                .tarjetaCarreras()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando el análisis de tu carrera")
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// El análisis falló: se dice y se reintenta. Un fallo no es un vacío.
struct AnalisisConErrorCarreras: View {
    let alReintentar: () -> Void

    var body: some View {
        AvisoEnLinea("No pudimos cargar el análisis de tu carrera. El historial de abajo sí está.") {
            BotonTextoCarreras("Reintentar", tono: .tinta, accion: alReintentar)
        }
    }
}
