import SwiftUI

// PREDICHO CONTRA REAL — tras una simulación o una carrera importada con una predicción guardada
// antes, lo que predijimos contra lo que hiciste: los dos totales, cuánto acertó la predicción
// («a 99 %, clavado»), la tabla tramo a tramo y la lectura del coach. Esa diferencia recalibra la
// predicción y le dice al coach dónde apretar: el círculo que se cierra.
//
// Es la página que abre la puerta de la pestaña. NO pide nada: la pestaña ya leyó la revisión
// (`GET /api/athlete/prediction-review?race_id=…`) para dibujar la puerta, y la puerta solo existe con
// una predicción guardada; así que recibe la MISMA revisión y no puede contradecirla. Los totales y la
// precisión se leen con la misma traducción que la puerta (`PredichoVsReal`): `accuracy_pct` es la
// PRECISIÓN de 0 a 100 (99 = clavado), no el error.
struct PredichoVsRealView: View {
    let review: PredictionReview

    private var resumen: PredichoVsReal { PredichoVsReal(review) }

    var body: some View {
        MarcoDeDetalleCarreras {
            CabeceraDetalleCarreras(
                etiqueta: "Predicho contra real",
                titulo: review.raceName.flatMap { $0.isEmpty ? nil : $0 } ?? "Tu carrera",
                lineas: [review.raceDate.flatMap { FechaES.corta($0, hoy: FechaES.iso(Date())) }].compactMap { $0 }
            )
            sujeto
            if !review.segments.isEmpty {
                SeccionDeDetalleCarreras(
                    "Tramo a tramo",
                    nota: "La diferencia es lo que hiciste menos lo que predijimos: con la flecha abajo, fuiste más rápido."
                ) {
                    tabla
                }
            }
            if let lectura = review.insightEs, !lectura.isEmpty {
                NotaDeDetalleCarreras("Lo que nos dice", texto: lectura) { IconoDia(.diana, tam: 18) }
            }
        }
    }

    // MARK: - El sujeto: los dos totales y la precisión

    private var precision: String? {
        PredichoVsRealView.precision(resumen)
    }

    /// «Predicción a 99 %, clavado». La MISMA frase que la puerta de la pestaña.
    static func precision(_ r: PredichoVsReal) -> String? {
        Formato.porcentaje(fraccion: r.precisionPct.map { $0 / 100 }).map { pct in
            "Predicción a \(pct)\(r.precisionPalabra.map { ", \($0)" } ?? "")"
        }
    }

    private var sujeto: some View {
        SujetoDia(tono: .acento, etiqueta: vozDelSujeto) {
            KickerDia(precision ?? "Predicho contra real")
            // Con texto grande las dos cifras no caben lado a lado: pasan una encima de otra.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Theme.Spacing.l) { totales }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) { totales }
            }
        }
    }

    @ViewBuilder
    private var totales: some View {
        total("Predijimos", resumen.predijimosS)
        total("Hiciste", resumen.hicisteS)
    }

    /// Una de las dos cifras. Sin tiempo NO hay cifra: se dice que no lo hay, en voz de texto (una nota de
    /// ausencia no es una medida, y a 44 pt se disfrazaría de dato).
    private func total(_ rotulo: String, _ segundos: Int?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(rotulo).papel(.rotulo).foregroundStyle(Theme.Color.foreground)
            if let segundos {
                Text(Formato.clock(segundos, enHoras: false))
                    .papel(.sujeto)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .fixedSize()
            } else {
                Text("sin tiempo").papel(.cuerpo).italic().foregroundStyle(Theme.Color.foreground)
            }
        }
    }

    private var vozDelSujeto: String {
        [
            precision,
            "predijimos \(resumen.predijimosS.map { Formato.clock($0, enHoras: false) } ?? "sin tiempo")",
            "hiciste \(resumen.hicisteS.map { Formato.clock($0, enHoras: false) } ?? "sin tiempo")",
        ].compactMap { $0 }.joined(separator: ", ")
    }

    // MARK: - La tabla

    private var tabla: some View {
        AnaliticasTabla(
            etiqueta: "Predicho contra real, tramo a tramo",
            columnas: [
                ColumnaDeTabla(cabecera: "Tramo"),
                ColumnaDeTabla(cabecera: "Predicho", alinear: .trailing, ancho: 76),
                ColumnaDeTabla(cabecera: "Real", alinear: .trailing, ancho: 84),
            ],
            filas: review.segments
        ) { fila, columna in
            switch columna {
            case 0:
                Text(fila.labelEs).accessibilityLabel(fila.labelEs)
            case 1:
                // Sin valor, la celda se calla y guarda su ancho: la fila sigue alineada (§7).
                Text(fila.predictedS.map { Formato.clock($0, enHoras: false) } ?? "")
                    .accessibilityLabel(fila.predictedS.map { "predicho \(Formato.clock($0, enHoras: false))" } ?? "")
            default:
                VStack(alignment: .trailing, spacing: 2) {
                    Text(fila.actualS.map { Formato.clock($0, enHoras: false) } ?? "")
                    DiferenciaReal(deltaS: fila.deltaS)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(vozReal(fila))
            }
        }
    }

    private func vozReal(_ fila: PredictionReviewRow) -> String {
        var partes: [String] = []
        if let real = fila.actualS { partes.append("real \(Formato.clock(real, enHoras: false))") }
        if let d = fila.deltaS, d != 0 {
            partes.append(d < 0 ? "\(Formato.clock(-d)) más rápido" : "\(Formato.clock(d)) más lento")
        }
        return partes.joined(separator: ", ")
    }
}

/// La diferencia real − predicho de un tramo: la flecha con su color (baja y verde = más rápido de lo
/// predicho; sube y roja = más lento) y la cifra con signo en tinta. A cero o sin dato, nada.
private struct DiferenciaReal: View {
    let deltaS: Int?

    var body: some View {
        if let deltaS, deltaS != 0 {
            HStack(spacing: 2) {
                IconoDia(deltaS < 0 ? .baja : .sube, tam: 13, peso: .bold)
                    .foregroundStyle(deltaS < 0 ? Theme.Color.ok : Theme.Color.danger)
                Text(GoalGapFormat.signedDuration(deltaS)).papel(.rotulo)
            }
        }
    }
}

// MARK: - Ejemplo (el contrato exacto del cable)

#if DEBUG
#Preview("Predicho contra real") { NavigationStack { PredichoVsRealView(review: .previewSample) } }
#Preview("Predicho contra real · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    NavigationStack { PredichoVsRealView(review: .previewSample) }
}

extension PredictionReview {
    /// Los números del ejemplo, decodificados por el MISMO camino que el cable. `accuracy_pct` es la
    /// precisión 0-100 que calcula `shared/domain/goal-gap/review.ts` (antes el ejemplo decía 0,7 y lo
    /// pintaba como «a 0,7 %», que con el dato de verdad —99— se leía al revés).
    static let previewSample: PredictionReview = {
        let json = """
        {
          "availability": "ok",
          "predicted_total_s": 3825,
          "actual_total_s": 3852,
          "accuracy_pct": 99,
          "accuracy_label_es": "clavado",
          "race_name": "Simulación HYROX",
          "race_date": "2026-08-24",
          "segments": [
            { "slug": "run", "label_es": "Carrera · 8 km", "predicted_s": 1890, "actual_s": 1872, "delta_s": -18 },
            { "slug": "ski", "label_es": "SkiErg", "predicted_s": 232, "actual_s": 238, "delta_s": 6 },
            { "slug": "sled_push", "label_es": "Sled Push", "predicted_s": 174, "actual_s": 191, "delta_s": 17 },
            { "slug": "wall_balls", "label_es": "Wall Balls", "predicted_s": 327, "actual_s": 319, "delta_s": -8 }
          ],
          "insight_es": "El sled push pierde más de lo esperado bajo fatiga. Eso recalibra tu predicción y le dice al coach dónde apretar las próximas semanas."
        }
        """.data(using: .utf8)!
        return try! APIClient.makeJSONDecoder().decode(PredictionReview.self, from: json)
    }()
}
#endif
