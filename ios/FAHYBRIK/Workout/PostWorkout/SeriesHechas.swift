import SwiftUI

// LAS SERIES DE FUERZA, DESPUÉS DE HACERLAS — una sola lectura y una sola tabla para
// las dos pantallas que las enseñan: el resumen al terminar (lo que el motor guardó en
// `LapRecord.sets`) y el detalle de una sesión hecha (lo que sirve el servidor en
// `segments[].sets`, DECISIONS 2026-09-28). Un libre y uno del coach se leen igual
// porque llegan por el mismo cable.
//
// Hasta el 28-sep ninguna de las dos pintaba una serie: el resumen enseñaba el título
// del ejercicio y un tiempo, y el detalle un total de reps y la carga MÁS ALTA (un
// 5×100 · 5×110 · 3×115 · 3×120 salía «16 reps · 120 kg»).

/// Una serie hecha, venga de donde venga.
struct SerieHecha: Equatable, Identifiable {
    enum Estado: Equatable { case hecha, adaptada, saltada }

    let indice: Int
    let estado: Estado
    let reps: Int?
    let kg: Double?
    let repsPedidas: Int?
    let kgPedidos: Double?
    let rpe: Double?
    let rir: Double?
    let tempo: String?
    let descansoS: Int?
    /// Serie de aproximación (card 151). Solo la sabe el motor del móvil: el
    /// servidor no la guarda aparte.
    var aproximacion: Bool = false

    var id: Int { indice }

    static func estado(_ wire: String) -> Estado {
        switch wire {
        case "skipped": return .saltada
        case "scaled": return .adaptada
        default: return .hecha
        }
    }

    /// Lo que sirve el servidor.
    init(_ s: SetActualDTO) {
        self.init(indice: s.setIndex, estado: Self.estado(s.status), reps: s.reps, kg: s.kg,
                  repsPedidas: s.repsPrescribed, kgPedidos: s.kgPrescribed, rpe: s.rpe, rir: s.rir,
                  tempo: s.tempo, descansoS: s.restS)
    }

    /// Lo que guardó el motor — el mismo mapeo que `SegmentPayloadBuilder` sube al
    /// servidor (lo HECHO es `repsActual`/`loadActualKg`), para que el resumen y el
    /// detalle de mañana enseñen la misma serie.
    init(_ s: SetRecord) {
        self.init(indice: s.setIndex, estado: Self.estado(s.status), reps: s.repsActual,
                  kg: s.loadActualKg, repsPedidas: s.repsPrescribed, kgPedidos: s.loadPrescribedKg,
                  rpe: s.rpe, rir: s.rir, tempo: s.tempo, descansoS: s.restS,
                  aproximacion: s.isApproach)
    }

    init(indice: Int, estado: Estado, reps: Int?, kg: Double?, repsPedidas: Int?,
         kgPedidos: Double?, rpe: Double?, rir: Double?, tempo: String?, descansoS: Int?,
         aproximacion: Bool = false) {
        self.indice = indice
        self.estado = estado
        self.reps = reps
        self.kg = kg.flatMap { $0 > 0 ? $0 : nil }
        self.repsPedidas = repsPedidas
        self.kgPedidos = kgPedidos.flatMap { $0 > 0 ? $0 : nil }
        self.rpe = rpe
        self.rir = rir
        self.tempo = tempo.flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
        self.descansoS = descansoS.flatMap { $0 > 0 ? $0 : nil }
        self.aproximacion = aproximacion
    }

    /// «5 × 100 kg» · «12 reps» · «30 kg». Nil sin ninguna de las dos (§7).
    var hecho: String? { Formato.serie(reps: reps, cargaKg: kg)?.linea }

    /// Lo pedido, SOLO cuando difiere de lo hecho — si coincide, repetirlo es ruido.
    var pedido: String? {
        guard let linea = Formato.serie(reps: repsPedidas, cargaKg: kgPedidos)?.linea,
              linea != hecho else { return nil }
        return linea
    }

    /// «RPE 8» · «RIR 2» · «RPE 8,5 · RIR 1».
    var esfuerzo: String? {
        let partes = [rpe.map { "\(Vocab.rpe) \(Formato.esDecimal($0))" },
                      rir.map { "\(Vocab.rir) \(Formato.esDecimal($0))" }].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// La línea de apoyo: pedido, tempo y descanso. Nil si no hay nada que decir.
    var apoyo: String? {
        var partes: [String] = []
        if let pedido { partes.append("pedido \(pedido)") }
        if let tempo { partes.append("tempo \(tempo)") }
        if let descansoS { partes.append("\(Vocab.descanso.lowercased()) \(Formato.clock(descansoS))") }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}

// MARK: - El volumen

enum VolumenDeFuerza {
    /// Kilos que suma UNA serie — espejo de `setVolumeKg`
    /// (shared/domain/strength/volume.ts): cuenta una serie hecha o adaptada, con
    /// reps y carga > 0. Una saltada o una de aproximación no suman.
    static func kg(_ s: SerieHecha) -> Double {
        guard s.estado != .saltada, !s.aproximacion,
              let reps = s.reps, reps > 0, let kg = s.kg else { return 0 }
        return Double(reps) * kg
    }

    /// Σ de las series que cuentan; nil si ninguna tiene carga (nunca un 0).
    ///
    /// Solo para lo que el servidor todavía NO ha calculado (el resumen, antes de
    /// guardar). Lo que ya viene del servidor trae su `volume_kg` y ese manda.
    static func kg(_ series: [SerieHecha]) -> Double? {
        let total = series.map(kg).reduce(0, +)
        return total > 0 ? total : nil
    }

    /// La serie más pesada que contó — la que se nombra junto al volumen.
    static func masPesada(_ series: [SerieHecha]) -> SerieHecha? {
        series.filter { kg($0) > 0 }.max { ($0.kg ?? 0) < ($1.kg ?? 0) }
    }
}

// MARK: - La tabla

/// Las series de un ejercicio, una fila cada una, y su volumen al pie. Tipografía
/// al suelo del contrato (§4.1): nada por debajo de 15 pt.
struct TablaDeSeries: View {
    let series: [SerieHecha]
    /// El tonelaje del ejercicio. Nil = sin carga (peso corporal) y no hay pie.
    let volumenKg: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(series) { serie in
                FilaDeSerie(serie: serie)
            }
            if let volumenKg {
                HStack(alignment: .firstTextBaseline) {
                    Text("Volumen")
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                    Spacer(minLength: 8)
                    MonoText(text: Formato.kg(volumenKg), size: 17, weight: .bold,
                             escala: true, relativeTo: .body)
                }
                .padding(.top, 6)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct FilaDeSerie: View {
    let serie: SerieHecha

    private var saltada: Bool { serie.estado == .saltada }
    private var tinta: Color { saltada ? Theme.Color.muted : Theme.Color.foreground }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                MonoText(text: "\(serie.indice)", size: 15, weight: .bold,
                         color: Theme.Color.muted, escala: true, relativeTo: .subheadline)
                    .frame(minWidth: 22, alignment: .leading)
                if saltada {
                    Text("Saltada")
                        .scaledFont(17, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(tinta)
                } else if let hecho = serie.hecho {
                    MonoText(text: hecho, size: 17, weight: .bold, color: tinta,
                             escala: true, relativeTo: .body)
                }
                if serie.estado == .adaptada {
                    Text("adaptada")
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.warning)
                } else if serie.aproximacion {
                    Text("aproximación")
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 8)
                if let esfuerzo = serie.esfuerzo, !saltada {
                    Text(esfuerzo)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline, monospaced: true)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            if let apoyo = serie.apoyo {
                Text(apoyo)
                    .scaledFont(15, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.leading, 32)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}
