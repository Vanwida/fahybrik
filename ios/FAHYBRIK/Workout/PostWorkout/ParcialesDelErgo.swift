import SwiftUI

// LOS PARCIALES DEL MONITOR DEL ERGÓMETRO — la tabla de intervalos que el monitor
// guarda serie a serie (remo, SkiErg, bici). Una lectura y una tabla para las tres
// pantallas que la enseñan: el resumen al terminar (`LapRecord.ergSplits`), la
// lectura de una sesión hecha y el detalle genérico (`segments[].erg_splits`).
//
// Antes vivía solo en el camino genérico de `ExecutedWorkoutView`, al que no se llega
// cuando hay ejecución: los parciales viajaban, se decodificaban y no se pintaban.

/// Un parcial, venga del monitor en vivo o del servidor.
struct ParcialDeErgo: Equatable, Identifiable {
    let indice: Int
    let tiempoS: Double?
    let metros: Double?
    let ritmoS500m: Double?
    let paladasMin: Int?
    let calorias: Int?
    let descansoS: Double?
    let descansoMetros: Double?

    var id: Int { indice }

    init(_ s: ErgSplitActual) {
        indice = s.index
        tiempoS = s.timeSeconds
        metros = s.distanceMeters
        ritmoS500m = s.avgPaceSPer500m
        paladasMin = s.strokeRateSpm
        calorias = s.calories
        descansoS = s.restTimeSeconds
        descansoMetros = s.restDistanceMeters
    }

    init(_ s: PM5Split) {
        indice = s.index
        tiempoS = s.timeSeconds
        metros = s.distanceMeters
        ritmoS500m = s.avgPaceSecPer500m
        paladasMin = s.strokeRateSpm
        calorias = s.totalCalories
        descansoS = s.restTimeSeconds
        descansoMetros = s.restDistanceMeters
    }

    /// «descanso 1:00 · 120 m». Nil sin descanso medido.
    var descanso: String? {
        guard let d = descansoS, d > 0 else { return nil }
        var texto = "\(Vocab.descanso.lowercased()) \(Formato.clock(d))"
        if let m = descansoMetros, m > 0 { texto += " · \(Int(m)) m" }
        return texto
    }
}

enum ColumnaDeParcial: CaseIterable {
    case tiempo, metros, ritmo, paladas, calorias

    var titulo: String {
        switch self {
        case .tiempo: return Vocab.tiempo
        case .metros: return "Metros"
        case .ritmo: return Formato.UnidadRitmo.por500m.rawValue
        case .paladas: return "Pal/min"
        case .calorias: return "Cal"
        }
    }

    /// Lo que midió este parcial en esta columna; nil = no lo dio el monitor.
    func valor(_ p: ParcialDeErgo) -> String? {
        switch self {
        case .tiempo: return p.tiempoS.flatMap { $0 > 0 ? Formato.clock($0) : nil }
        case .metros: return p.metros.flatMap { $0 > 0 ? "\(Int($0.rounded()))" : nil }
        case .ritmo: return p.ritmoS500m.flatMap { $0 > 0 ? Formato.ritmoCifras($0.rounded()) : nil }
        case .paladas: return p.paladasMin.flatMap { $0 > 0 ? "\($0)" : nil }
        case .calorias: return p.calorias.flatMap { $0 > 0 ? "\($0)" : nil }
        }
    }

    /// Las columnas que ESTOS parciales midieron de verdad, en orden de lo que se
    /// mira primero, y como mucho cuatro: a 15 pt (§4.1) no caben más en un iPhone, y
    /// la quinta sería la menos mirada. Una columna sin ningún dato no existe (§7).
    static func medidas(_ parciales: [ParcialDeErgo]) -> [ColumnaDeParcial] {
        Array(allCases.filter { col in parciales.contains { col.valor($0) != nil } }.prefix(4))
    }
}

/// La tabla de parciales. Sin ninguna columna medida no se pinta (quien la llama lo
/// comprueba con `ColumnaDeParcial.medidas`).
struct TablaDeParciales: View {
    let parciales: [ParcialDeErgo]

    private var columnas: [ColumnaDeParcial] { ColumnaDeParcial.medidas(parciales) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                celda("#", ancho: true, color: Theme.Color.muted, peso: .bold)
                ForEach(columnas, id: \.self) { col in
                    celda(col.titulo, color: Theme.Color.muted, peso: .bold)
                }
            }
            .padding(.bottom, 4)
            ForEach(parciales) { p in
                VStack(spacing: 2) {
                    HStack(spacing: 8) {
                        celda("\(p.indice)", ancho: true, color: Theme.Color.accentText, peso: .bold)
                        ForEach(columnas, id: \.self) { col in
                            // Vacía (ni guion ni cero) si este parcial no la midió (§7).
                            celda(col.valor(p) ?? "", color: Theme.Color.foreground, peso: .semibold)
                        }
                    }
                    if let descanso = p.descanso {
                        Text(descanso)
                            .scaledFont(15, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                .padding(.vertical, 5)
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder
    private func celda(_ texto: String, ancho fijo: Bool = false, color: Color, peso: Font.Weight) -> some View {
        let t = MonoText(text: texto, size: 15, weight: peso, color: color,
                         escala: true, relativeTo: .subheadline)
        if fijo {
            t.frame(width: 26, alignment: .leading)
        } else {
            t.frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}
