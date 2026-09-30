import SwiftUI

// LO QUE HICISTE, TRAMO A TRAMO.
//
// La tabla del resumen post-entreno. Agrupada por bloque del coach (Calentamiento /
// Principal / Vuelta a la calma) para que el trabajo principal se lea como el foco y
// los ejercicios de calentamiento no inflen una lista de once filas.
//
// Y, dentro de un bloque de series, ABIERTA por tramos: un 6×800 es UN segmento con
// seis tramos dentro, y hasta el 29-jul el resumen no enseñaba ninguno. Lo que se
// pinta en cada fila sale de lo que se midió (`TramosMedidos`), nunca del plan.
//
// Vive fuera de PostWorkoutSummaryView por lo mismo que el resumen de la semana:
// para poder renderizarla sola. Dentro del resumen cuelga de un ScrollView, e
// `ImageRenderer` no dibuja ScrollView — sin sacarla no había captura posible de la
// pantalla que más hacía falta mirar.

struct TablaDeTramos: View {

    /// Los segmentos de la sesión reagrupados en sus bloques, en orden.
    let grupos: [WorkoutSegmentGroup]
    /// Lo MEDIDO: los laps que dejó la sesión.
    let laps: [LapRecord]
    /// Ritmos que el atleta teclea a mano en los tramos de correr/ergo que no
    /// capturaron ninguno (sin GPS, sin cinta, sin PM5).
    @Binding var ritmosManuales: [UUID: Int]

    /// ¿Hay tabla que pintar? Se pinta cuando tiene MÁS DE UNA FILA que enseñar,
    /// cuando hay una serie de la que no se midió ni un tramo y eso hay que decirlo,
    /// o cuando algún bloque trae su detalle propio: la serie a serie de la fuerza o
    /// los parciales del monitor del ergo.
    ///
    /// Sustituye a `plan.segments.count > 1`, que preguntaba por bloques y no por
    /// filas: por eso quien acababa una serie suelta —un segmento, seis tramos— no
    /// veía nada. Y el 28-sep, lo mismo con la fuerza: un único ejercicio de cinco
    /// series era una fila, y la tabla no salía.
    static func hayQuePintarla(segmentos: [WorkoutSegment], laps: [LapRecord]) -> Bool {
        TramosMedidos.filasTotales(segmentos: segmentos, laps: laps) > 1
            || TramosMedidos.haySeriesSinTramos(segmentos: segmentos, laps: laps)
            || laps.contains { !($0.sets ?? []).isEmpty || !parciales(de: $0).isEmpty }
    }

    /// Los parciales del monitor de un lap, solo si alguno midió algo (§7).
    static func parciales(de lap: LapRecord) -> [ParcialDeErgo] {
        let p = (lap.ergSplits ?? []).map(ParcialDeErgo.init)
        return ColumnaDeParcial.medidas(p).isEmpty ? [] : p
    }

    var body: some View {
        // La cara plana de tarjeta del día (la misma que las demás secciones del resumen), no la
        // `CardSurface` con sombra de la piel anterior.
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        VStack(spacing: 0) {
            HStack {
                Text("Por segmento")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.muted)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, Theme.Spacing.m)
            ForEach(grupos) { group in
                Hairline()
                cabeceraDeBloque(group)
                ForEach(Array(group.segments.enumerated()), id: \.element.id) { idx, seg in
                    if idx > 0 { Hairline().opacity(0.4) }
                    filaDeSegmento(seg)
                }
            }
        }
        .padding(.bottom, Theme.Spacing.xs)
        .background(Theme.Color.surface, in: forma)
        .clipShape(forma)
        .overlay(forma.strokeBorder(Theme.Color.hairline, lineWidth: 1))
    }

    // Cabecera de bloque. El trabajo principal va acentuado y el calentamiento /
    // vuelta a la calma apagados, para que el ojo caiga en el esfuerzo de verdad.
    private func cabeceraDeBloque(_ group: WorkoutSegmentGroup) -> some View {
        HStack(spacing: 6) {
            Text(group.title)
                .papel(.kicker)
                .foregroundStyle(group.phase.isMainWork ? Theme.Color.accentText : Theme.Color.muted)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func filaDeSegmento(_ seg: WorkoutSegment) -> some View {
        let tramos = TramosMedidos.lee(segmento: seg, laps: laps)
        let lap = laps.first(where: { $0.segmentId == seg.id && $0.runLegIndex == nil })
        let series = (laps.first { $0.segmentId == seg.id && !($0.sets ?? []).isEmpty }?.sets ?? [])
            .map(SerieHecha.init)
        let parciales = lap.map(Self.parciales(de:)) ?? []
        let rondas = Set(tramos.filas.compactMap(\.ronda)).count
        VStack(spacing: 0) {
            // El bloque. Con tramos medidos debajo NO lleva tiempo propio: no existe
            // un lap agregado, y sumar los tramos daría el total sin las
            // recuperaciones — la suma parcial vendida como total, otra vez.
            filaCabecera(seg, lap: tramos.filas.isEmpty ? lap : nil, cobertura: tramos.cobertura)
            if tramos.sinTiemposPorTramo {
                // El atleta hizo seis y aquí solo hay un tiempo. Se dice.
                Text("Sin tiempos por tramo.")
                    .scaledFont(15, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
            }
            ForEach(Array(tramos.filas.enumerated()), id: \.element.id) { i, fila in
                // En una ruta de varias rondas, cada ronda abre con su nombre.
                if rondas > 1, let ronda = fila.ronda,
                   i == 0 || tramos.filas[i - 1].ronda != ronda {
                    Text("\(Vocab.ronda) \(ronda)")
                        .scaledFont(15, weight: .bold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 30)
                        .padding(.top, 6)
                }
                filaDeTramo(fila)
            }
            // La serie a serie de la fuerza: lo que se mira al acabar un 5×5.
            if !series.isEmpty {
                TablaDeSeries(series: series, volumenKg: VolumenDeFuerza.kg(series))
                    .padding(.leading, 30)
                    .padding(.trailing, 14)
                    .padding(.bottom, 8)
            }
            // Los parciales del monitor, serie a serie.
            if !parciales.isEmpty {
                TablaDeParciales(parciales: parciales)
                    .padding(.leading, 30)
                    .padding(.trailing, 14)
                    .padding(.bottom, 8)
            }
            // Ritmo a mano — solo en un tramo de correr/ergo que no capturó ninguno
            // (sin GPS, sin PM5). Así el segmento guarda una intensidad real en vez
            // de una celda vacía. No se pide por tramo: el dato que el atleta lee en
            // la cinta o en el monitor es el del bloque.
            if necesitaRitmoManual(seg, lap: lap) {
                TimeMinSecRow(label: etiquetaDeRitmo(seg), seconds: ataduraDeRitmo(seg))
            }
        }
    }

    /// Lo medido del bloque entero cuando no tiene tramos: la distancia y, al lado,
    /// su ritmo — lo que se mira al acabar un rodaje o un 2.000 de remo. Solo lo
    /// medido; sin nada, nil.
    private func medidaDeBloque(_ lap: LapRecord) -> String? {
        let distancia = lap.distanceCoveredMeters.flatMap { $0 >= 1 ? Formato.distanciaCubierta($0) : nil }
        let medida = TramosMedidos.medida(de: lap)
        let partes = [distancia, medida == distancia ? nil : medida].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    private func filaCabecera(_ seg: WorkoutSegment, lap: LapRecord?, cobertura: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(seg.title)
                    .scaledFont(17, weight: .semibold, relativeTo: .body)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                if let lap, let medida = medidaDeBloque(lap) {
                    MonoText(text: medida, size: 15, color: Theme.Color.muted,
                             escala: true, relativeTo: .subheadline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // «4 de 6»: faltan tramos por medir, y se declara sin decir por qué —
            // no sabemos si los dejaste o no se grabaron.
            if let cobertura {
                MonoText(text: cobertura, size: 15, color: Theme.Color.muted,
                         escala: true, relativeTo: .subheadline)
            }
            // Sin lap NO hay guion: lo que no se sabe no se pinta (§7).
            if let lap {
                MonoText(text: Formato.clock(lap.durationSeconds), size: 17, weight: .bold,
                         color: Theme.Color.foreground, escala: true, relativeTo: .body)
            }
            if let z = seg.targetZone {
                ZBadge(zone: z)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // Un tramo de la serie. Sangrado bajo su bloque, y con el ritmo (o la distancia
    // que cubriste) al lado del tiempo: es lo que se mira al acabar un 800.
    private func filaDeTramo(_ fila: TramosMedidos.Fila) -> some View {
        let esRecuperacion = fila.leg?.isRecovery ?? false
        let tinta = esRecuperacion ? Theme.Color.muted : Theme.Color.foreground
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(fila.titulo)
                .scaledFont(17, relativeTo: .body)
                .foregroundStyle(tinta)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
            if let medida = fila.medida {
                MonoText(text: medida, size: 15, color: Theme.Color.muted,
                         escala: true, relativeTo: .subheadline)
            }
            MonoText(text: fila.tiempo, size: 17, weight: .semibold, color: tinta,
                     escala: true, relativeTo: .body)
                .frame(minWidth: 56, alignment: .trailing)
        }
        .padding(.leading, 30)
        .padding(.trailing, 14)
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            [fila.titulo, fila.tiempo, fila.medida].compactMap { $0 }.joined(separator: ", ")
        )
    }

    // Cierto cuando este segmento de correr/ergo no capturó ritmo automático, así que
    // el atleta lo puede teclear. Fuerza / reps / trineo no tienen ritmo y no se
    // preguntan nunca; un tramo con ritmo medido ya enseña el suyo.
    private func necesitaRitmoManual(_ seg: WorkoutSegment, lap: LapRecord?) -> Bool {
        guard seg.kind == .running || seg.kind == .rowOrSki else { return false }
        // Con tramos medidos el ritmo ya está en las filas: no se vuelve a pedir.
        guard !laps.contains(where: { $0.segmentId == seg.id && $0.avgPaceSecPerKm != nil })
        else { return false }
        return lap?.avgPaceSecPerKm == nil && lap?.avgPaceSecPer500m == nil
    }

    // Correr se lee /km; el ergo /500m (la convención del monitor).
    private func etiquetaDeRitmo(_ seg: WorkoutSegment) -> String {
        seg.kind == .rowOrSki ? "Ritmo /500m" : "Ritmo /km"
    }

    private func ataduraDeRitmo(_ seg: WorkoutSegment) -> Binding<Int?> {
        Binding(
            get: { ritmosManuales[seg.id] },
            set: { ritmosManuales[seg.id] = $0 }
        )
    }
}
