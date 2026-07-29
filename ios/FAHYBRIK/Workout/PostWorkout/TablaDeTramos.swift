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

    /// ¿Hay tabla que pintar? Se pinta cuando tiene MÁS DE UNA FILA que enseñar, o
    /// cuando hay una serie de la que no se midió ni un tramo y eso hay que decirlo.
    ///
    /// Sustituye a `plan.segments.count > 1`, que preguntaba por bloques y no por
    /// filas: por eso quien acababa una serie suelta —un segmento, seis tramos— no
    /// veía nada.
    static func hayQuePintarla(segmentos: [WorkoutSegment], laps: [LapRecord]) -> Bool {
        TramosMedidos.filasTotales(segmentos: segmentos, laps: laps) > 1
            || TramosMedidos.haySeriesSinTramos(segmentos: segmentos, laps: laps)
    }

    var body: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Por segmento", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                ForEach(grupos) { group in
                    Hairline()
                    cabeceraDeBloque(group)
                    ForEach(Array(group.segments.enumerated()), id: \.element.id) { idx, seg in
                        if idx > 0 { Hairline().opacity(0.4) }
                        filaDeSegmento(seg)
                    }
                }
            }
        }
    }

    // Cabecera de bloque. El trabajo principal va acentuado y el calentamiento /
    // vuelta a la calma apagados, para que el ojo caiga en el esfuerzo de verdad.
    private func cabeceraDeBloque(_ group: WorkoutSegmentGroup) -> some View {
        HStack(spacing: 6) {
            Text(group.title.uppercased())
                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(group.phase.isMainWork ? Theme.Color.accentText : Theme.Color.muted)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.top, 9)
        .padding(.bottom, 5)
    }

    @ViewBuilder
    private func filaDeSegmento(_ seg: WorkoutSegment) -> some View {
        let tramos = TramosMedidos.lee(segmento: seg, laps: laps)
        let lap = laps.first(where: { $0.segmentId == seg.id && $0.runLegIndex == nil })
        VStack(spacing: 0) {
            // El bloque. Con tramos medidos debajo NO lleva tiempo propio: no existe
            // un lap agregado, y sumar los tramos daría el total sin las
            // recuperaciones — la suma parcial vendida como total, otra vez.
            filaCabecera(seg, lap: tramos.filas.isEmpty ? lap : nil, cobertura: tramos.cobertura)
            if tramos.sinTiemposPorTramo {
                // El atleta hizo seis y aquí solo hay un tiempo. Se dice.
                Text("Sin tiempos por tramo.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 8)
            }
            ForEach(tramos.filas) { fila in
                filaDeTramo(fila)
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

    private func filaCabecera(_ seg: WorkoutSegment, lap: LapRecord?, cobertura: String?) -> some View {
        HStack(alignment: .center, spacing: 6) {
            Text(seg.title)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            // «4 de 6»: faltan tramos por medir, y se declara sin decir por qué —
            // no sabemos si los dejaste o no se grabaron.
            if let cobertura {
                MonoText(text: cobertura, size: 10, color: Theme.Color.faint)
            }
            // El título de al lado escala con el texto del sistema; este tiempo tiene
            // que escalar con él o a tamaño accesible la etiqueta acaba pesando más
            // que el dato (contrato §4). Sin lap NO hay guion: lo que no se sabe no
            // se pinta (§7); la columna se reserva para que nada baile.
            if let lap {
                MonoText(text: Formato.clock(lap.durationSeconds), size: 11, weight: .semibold,
                         color: Theme.Color.foreground, escala: true, relativeTo: .caption2)
                    .frame(minWidth: 60, alignment: .trailing)
            } else {
                Color.clear.frame(width: 60, height: 1)
            }
            if let z = seg.targetZone {
                ZBadge(zone: z).frame(width: 38, alignment: .trailing)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    // Un tramo de la serie. Sangrado bajo su bloque, y con el ritmo (o la distancia
    // que cubriste) al lado del tiempo: es lo que se mira al acabar un 800.
    private func filaDeTramo(_ fila: TramosMedidos.Fila) -> some View {
        let esRecuperacion = fila.leg?.isRecovery ?? false
        return HStack(alignment: .center, spacing: 6) {
            Text(fila.titulo)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(esRecuperacion ? Theme.Color.muted : Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            MonoText(text: fila.tiempo, size: 11, weight: .semibold,
                     color: esRecuperacion ? Theme.Color.muted : Theme.Color.foreground,
                     escala: true, relativeTo: .caption2)
                .frame(minWidth: 52, alignment: .trailing)
            if let medida = fila.medida {
                MonoText(text: medida, size: 11, color: Theme.Color.muted,
                         escala: true, relativeTo: .caption2)
                    .frame(minWidth: 66, alignment: .trailing)
            } else {
                Color.clear.frame(width: 66, height: 1)
            }
        }
        .padding(.leading, 22)
        .padding(.trailing, 10)
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
