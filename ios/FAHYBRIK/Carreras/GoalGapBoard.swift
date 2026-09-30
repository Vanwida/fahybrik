import SwiftUI

// «CAMINO AL OBJETIVO» — el tablero de tramos (solo presentación). Una fila por tramo de la carrera:
// tu nivel de HOY contra lo que pide el objetivo, tramo a tramo.
//
// Lenguaje visual (rev. 3, piel «El día»):
//   · La barra es tu PREDICHO; la marca punteada en TINTA es lo que pide el objetivo (tinta, no un
//     color: tiene que leerse sobre cualquier relleno).
//   · El relleno es SEMÁNTICO: verde cuando el tramo está dentro de lo que pide; pasado, la parte que
//     cubres va en un neutro fuerte y el EXCESO en rojo, así que «cuánto me paso» es literalmente
//     cuánto rojo hay. El acento del club NO pinta datos (CONTRATO-UI §11.1): antes esa parte era
//     naranja y el tablero entero se leía como una pared del color de la marca.
//   · La OPACIDAD del relleno dice la evidencia: sólido = observado en esfuerzos reales, translúcido =
//     estimado por tu ritmo umbral; «sin datos» = barra vacía y la frase.
//   · La cifra con signo va en tinta; el sentido lo dicen la flecha (con su color) y el signo.
//
// El total («Predicho hoy») NO se repite aquí: es el sujeto del detalle, encima. Espejo del gap
// individual y del de la pareja (`DoblesRaceGapSection`), que usan esta misma barra y esta leyenda.

// MARK: - El lenguaje de la barra (compartido con el tablero de la pareja)

/// Opacidades por evidencia y la geometría de la pista: una sola fuente para que la leyenda y las
/// barras no puedan separarse.
enum GoalGapVis {
    static let fillObservado: Double = 1.0   // esfuerzos reales → sólido
    static let fillEstimado: Double = 0.45   // ritmo umbral → translúcido
    static let fillUnknown: Double = 0.70    // una evidencia que la app aún no conoce: visible, no desaparece
    static let trackHeight: CGFloat = 14

    /// Evidencia → opacidad del relleno.
    static func fillOpacity(tier: String) -> Double {
        switch tier.lowercased() {
        case "observado": return fillObservado
        case "estimado":  return fillEstimado
        default:          return fillUnknown
        }
    }

    /// La parte del tramo que cubres cuando te pasas: un neutro fuerte, no el acento del club.
    static var cubierto: Color { Theme.Color.apoyoFuerte }
}

/// Verde = dentro · rojo = lo que te pasas · punteado = el objetivo. La leyenda de los dos tableros.
struct GoalGapLegend: View {
    private enum Muestra { case relleno(Color), punteado }

    var body: some View {
        // Con texto grande las tres claves no caben en una fila: pasan a columna, nunca se cortan.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.l) { claves }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) { claves }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var claves: some View {
        clave(.relleno(Theme.Color.ok), "dentro")
        clave(.relleno(Theme.Color.danger), "te pasas")
        clave(.punteado, "objetivo")
    }

    private func clave(_ muestra: Muestra, _ texto: String) -> some View {
        HStack(spacing: 6) {
            Group {
                switch muestra {
                case .relleno(let color):
                    RoundedRectangle(cornerRadius: 3).fill(color)
                case .punteado:
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(Theme.Color.foreground, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                }
            }
            .frame(width: 16, height: 10)
            Text(texto).papel(.nota).foregroundStyle(Theme.Color.muted)
        }
    }
}

/// La diferencia de un tramo contra lo que pide: la flecha con su color (sube = te pasas, baja = vas
/// dentro) y la cifra con signo en tinta. Nada a cero ni sin dato.
struct DeltaDeTramo: View {
    let deltaS: Int?

    var body: some View {
        if let deltaS, deltaS != 0 {
            HStack(spacing: 2) {
                IconoDia(deltaS > 0 ? .sube : .baja, tam: 13, peso: .bold)
                    .foregroundStyle(deltaS > 0 ? Theme.Color.danger : Theme.Color.ok)
                Text(GoalGapFormat.signedDuration(deltaS))
                    .papel(.rotulo)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
    }
}

// MARK: - El tablero

struct GoalGapBoard: View {
    let gap: GoalGap

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
            VStack(spacing: 0) {
                GoalGapLegend()
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                ForEach(gap.segments) { segmento in
                    Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                    fila(segmento)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, Theme.Spacing.m - 2)
                }
            }
            .tarjetaCarreras()
            Text("La barra es tu predicho de hoy; la marca punteada, lo que pide tu objetivo, y el tramo rojo, lo que hoy te sobra. Sólido = observado en esfuerzos reales; translúcido = estimado por tu ritmo umbral.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func fila(_ segmento: GoalGapSegment) -> some View {
        if segmento.isSinDatos {
            filaSinDatos(segmento)
        } else if segmento.isRoxzone {
            filaRoxzone(segmento)
        } else {
            filaNormal(segmento)
        }
    }

    // Un tramo de carrera o una estación: nombre · diferencia · predicho, y la barra con la marca.
    private func filaNormal(_ segmento: GoalGapSegment) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
                Text(segmento.labelEs)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                DeltaDeTramo(deltaS: segmento.deltaS)
                // Sin predicho no hay cifra: la fila se queda con su nombre y su barra, que ya dicen la verdad (§7).
                if let predicho = segmento.predictedS {
                    Text(Formato.clock(predicho, enHoras: false))
                        .papel(.cuerpoFuerte)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
            GapTrack(predicted: segmento.predictedS, budget: segmento.budgetS, fillOpacity: GoalGapVis.fillOpacity(tier: segmento.tier))
                .frame(height: GoalGapVis.trackHeight)
            if segmento.tier.lowercased() == "estimado" {
                Text("estimado").papel(.nota).foregroundStyle(Theme.Color.muted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voz(segmento))
    }

    // La RoxZone (las transiciones): sin barra ni diferencia, para que los totales cierren sin competir
    // con las estaciones que de verdad entrenas.
    private func filaRoxzone(_ segmento: GoalGapSegment) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
            Text(segmento.labelEs).papel(.cuerpo).foregroundStyle(Theme.Color.muted)
            Spacer(minLength: Theme.Spacing.m)
            if let predicho = segmento.predictedS {
                Text(Formato.clock(predicho, enHoras: false))
                    .papel(.cuerpo)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(segmento.labelEs), \(segmento.predictedS.map { Formato.clock($0, enHoras: false) } ?? "sin tiempo")")
    }

    // Aún sin datos: la fila guarda su sitio — nombre, «sin datos» y la pista VACÍA (con la marca del
    // objetivo si la hay). Se llena con una práctica de estación, y eso se dice.
    private func filaSinDatos(_ segmento: GoalGapSegment) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
                Text(segmento.labelEs)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text("sin datos").papel(.nota).italic().foregroundStyle(Theme.Color.muted)
            }
            GapTrack(predicted: nil, budget: segmento.budgetS, fillOpacity: 0)
                .frame(height: GoalGapVis.trackHeight)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(segmento.labelEs), sin datos todavía. Registra una práctica de estación y aparece aquí.")
    }

    private func voz(_ segmento: GoalGapSegment) -> String {
        var partes = [segmento.labelEs]
        if let evidencia = segmento.tierLabel { partes.append(evidencia) }
        partes.append(segmento.predictedS.map { Formato.clock($0, enHoras: false) } ?? "sin tiempo")
        if let d = segmento.deltaS, d != 0 {
            partes.append(d > 0 ? "te pasas \(Formato.clock(d))" : "\(Formato.clock(-d)) por dentro")
        }
        return partes.joined(separator: ", ")
    }
}

// MARK: - La pista (relleno por evidencia + marca del objetivo)

/// La barra de un tramo, SEMÁNTICA por estado: dentro de lo que pide → un relleno verde; pasado → la
/// parte que cubres (neutro fuerte) hasta la marca y una cola ROJA con el exceso, así que lo que te
/// pasas es la cantidad de rojo. La opacidad dice la evidencia. La marca punteada es TINTA: el objetivo
/// tiene que contrastar sobre cualquier relleno. Escala al MAYOR de predicho/objetivo, para que un tramo
/// de 31 minutos y una estación de 3 se lean cada uno en su fila. Sin predicho (opacidad 0) no hay
/// relleno: la pista vacía y, si hay objetivo, su marca.
struct GapTrack: View {
    /// Pasado de lo que pide SIEMPRE se ve algo de rojo: la parte cubierta se recorta para dejar al menos
    /// esta cola, y un exceso pequeño no desaparece debajo.
    private static let colaMinima: CGFloat = 6

    let predicted: Int?
    let budget: Int?
    let fillOpacity: Double

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let maximo = max(predicted ?? 0, budget ?? 0)
            let fraccionObjetivo: Double? = (budget != nil && maximo > 0) ? Double(budget!) / Double(maximo) : nil

            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.superficieDeGrafico)
                if let predicted, maximo > 0, fillOpacity > 0 {
                    let ancho = max(6, w * CGFloat(Double(predicted) / Double(maximo)))
                    if let budget, predicted > budget {
                        let cubierto = max(6, w * CGFloat(fraccionObjetivo ?? 0))
                        Capsule()
                            .fill(Theme.Color.danger.opacity(fillOpacity))
                            .frame(width: ancho)
                        Capsule()
                            .fill(GoalGapVis.cubierto.opacity(fillOpacity))
                            .frame(width: min(cubierto, max(0, ancho - Self.colaMinima)))
                    } else {
                        Capsule()
                            .fill(Theme.Color.ok.opacity(fillOpacity))
                            .frame(width: ancho)
                    }
                }
                if let fraccionObjetivo {
                    // 20 pt sobre una pista de 14: asoma 3 pt por arriba y por abajo.
                    MarcaDelObjetivo()
                        .stroke(Theme.Color.foreground, style: StrokeStyle(lineWidth: 2, dash: [3, 2]))
                        .frame(width: 2, height: 20)
                        .offset(x: w * CGFloat(fraccionObjetivo) - 1)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Una línea vertical por el centro de su marco: la marca del objetivo.
private struct MarcaDelObjetivo: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return p
    }
}

// MARK: - Ejemplo (el contrato exacto del cable)

#if DEBUG
#Preview("Camino al objetivo · fábrica") { EnAmbasDia { GoalGapBoard(gap: GoalGap.previewSample) } }
#Preview("Camino al objetivo · club azul") { EnAmbasDia(club: .pruebaAzul) { GoalGapBoard(gap: GoalGap.previewSample) } }

extension GoalGap {
    /// Los números del ejemplo, decodificados por el MISMO camino que el cable (snake_case incluido):
    /// con la RoxZone y un tramo sin datos.
    static let previewSample: GoalGap = {
        let json = """
        {
          "availability": "ok",
          "goal": { "label": "Sub-60", "total_s": 3600, "race_name": "HYROX Barcelona", "race_date": "2026-10-12" },
          "predicted_total_s": 3825,
          "gap_s": 225,
          "budget_source": "cohorte",
          "updated_at": "2026-07-11T09:00:00Z",
          "segments": [
            { "slug": "run", "label_es": "Carrera · 8 km", "kind": "run", "budget_s": 1800, "predicted_s": 1890, "tier": "observado", "delta_s": 90 },
            { "slug": "ski", "label_es": "SkiErg", "kind": "station", "budget_s": 240, "predicted_s": 232, "tier": "estimado", "delta_s": -8 },
            { "slug": "sled_push", "label_es": "Sled Push", "kind": "station", "budget_s": 150, "predicted_s": 174, "tier": "observado", "delta_s": 24 },
            { "slug": "row", "label_es": "Row", "kind": "station", "budget_s": 260, "predicted_s": 250, "tier": "estimado", "delta_s": -10 },
            { "slug": "wall_balls", "label_es": "Wall Balls", "kind": "station", "budget_s": 300, "predicted_s": 327, "tier": "observado", "delta_s": 27 },
            { "slug": "roxzone", "label_es": "RoxZone", "kind": "roxzone", "budget_s": 360, "predicted_s": 372, "tier": "estimado", "delta_s": 12 },
            { "slug": "farmers_carry", "label_es": "Farmers Carry", "kind": "station", "budget_s": null, "predicted_s": null, "tier": "sin_datos", "delta_s": null }
          ]
        }
        """.data(using: .utf8)!
        return try! APIClient.makeJSONDecoder().decode(GoalGap.self, from: json)
    }()
}
#endif
