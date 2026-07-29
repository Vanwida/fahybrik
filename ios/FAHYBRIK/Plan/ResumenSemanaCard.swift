import SwiftUI

// EL RESUMEN DE LA SEMANA — la forma de la semana, y su volumen SIN mentir.
//
// Vive fuera de PlanView por dos razones. La primera es que el volumen semanal
// dejó de ser una suma y pasó a ser una lectura con hueco declarado
// (`VolumenPrevisto`), y eso merece un sitio que se pueda mirar entero. La segunda
// es que así se puede RENDERIZAR sola: dentro de PlanView vive bajo un ScrollView,
// e `ImageRenderer` no dibuja ScrollView — la tarjeta no tenía captura posible y
// por eso nadie vio nunca el estado que importa, el de la semana en la que casi
// ninguna sesión escribe su reloj.
//
// El caso de diseño es ese (contrato §6.3): la semana con sesiones sin tiempo
// previsto, que hoy es la mayoría.

struct ResumenSemanaCard: View {

    /// Las sesiones REALES de la semana (asignadas; los días de descanso no entran).
    let sesiones: [AthleteWeekDaySession]

    private var conteo: Int { sesiones.count }
    private var porModalidad: [(kind: Theme.Modality.Kind, count: Int)] {
        Rejilla.porModalidad(sesiones)
    }
    private var volumen: VolumenPrevisto.Lectura {
        VolumenPrevisto.lee(sesiones.map(\.estDurationMinutes))
    }

    var body: some View {
        let volumen = self.volumen
        let counts = porModalidad
        return CardSurface(padding: 16, topAccent: false) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "RESUMEN DE LA SEMANA")
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text("\(conteo)")
                        .font(.system(size: 30, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    Text(conteo == 1 ? "sesión" : "sesiones")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                    Spacer(minLength: Theme.Spacing.s)
                    // El SUELO de la semana. Nunca aparece solo cuando hay hueco: la
                    // línea de debajo llega en el mismo aliento.
                    if let suelo = volumen.suelo {
                        HStack(spacing: 4) {
                            Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                            Text(suelo).font(.system(size: 13, weight: .semibold).monospacedDigit())
                        }
                        .foregroundStyle(Theme.Color.muted)
                    }
                }
                // El hueco, DECLARADO. Va en su propia línea y no colgando del
                // número: a 390 pt la fila de arriba ya va justa, y sobre todo
                // porque esto no es una nota al pie del volumen — es la mitad que
                // lo hace cierto.
                if let hueco = volumen.hueco {
                    Text(hueco)
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !counts.isEmpty {
                    breakdownChips(counts)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(vozDeAccesibilidad(counts: counts, volumen: volumen))
    }

    @ViewBuilder
    private func breakdownChips(_ counts: [(kind: Theme.Modality.Kind, count: Int)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(Rejilla.filas(counts, de: 3).enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.kind) { item in
                        HStack(spacing: 5) {
                            Circle().fill(item.kind.color).frame(width: 7, height: 7)
                            Text("\(item.count) \(item.kind.label)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground.opacity(0.9))
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Theme.Color.surfaceElevated)
                        .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func vozDeAccesibilidad(
        counts: [(kind: Theme.Modality.Kind, count: Int)],
        volumen: VolumenPrevisto.Lectura
    ) -> String {
        var parts = ["\(conteo) \(conteo == 1 ? "sesión" : "sesiones")"]
        let breakdown = counts.map { "\($0.count) \($0.kind.label)" }.joined(separator: ", ")
        if !breakdown.isEmpty { parts.append(breakdown) }
        // La misma verdad que se ve, dicha entera: si hay hueco, se oye.
        if let linea = volumen.linea { parts.append(linea) }
        return "Resumen de la semana: " + parts.joined(separator: "; ")
    }
}

// MARK: - Rejilla — los repartos que comparten la tarjeta y la leyenda

/// Dos ayudas de reparto que el resumen y la leyenda de PlanView usaban por
/// duplicado. Una sola definición: eran la misma cuenta escrita dos veces.
enum Rejilla {

    /// Parte una lista en filas de `de` elementos para las rejillas de chips.
    static func filas<T>(_ lista: [T], de tamaño: Int) -> [[T]] {
        guard tamaño > 0 else { return [lista] }
        return stride(from: 0, to: lista.count, by: tamaño).map {
            Array(lista[$0 ..< Swift.min($0 + tamaño, lista.count)])
        }
    }

    /// Las sesiones agrupadas por modalidad canónica, de más a menos, y a igualdad
    /// por nombre — para que la semana se lea «3 carrera · 1 fuerza · 1 HYROX».
    static func porModalidad(
        _ sesiones: [AthleteWeekDaySession]
    ) -> [(kind: Theme.Modality.Kind, count: Int)] {
        var counts: [Theme.Modality.Kind: Int] = [:]
        for s in sesiones {
            counts[Theme.Modality.kind(s.modality), default: 0] += 1
        }
        return counts
            .map { (kind: $0.key, count: $0.value) }
            .sorted {
                if $0.count != $1.count { return $0.count > $1.count }
                return $0.kind.label < $1.kind.label
            }
    }
}
