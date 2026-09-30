import SwiftUI

// EL DETALLE DE UNA ESTACIÓN (p. ej. Sled Push) — se abre desde las estaciones de tu última carrera.
// Arquetipo «Detalle» (CONTRATO-UI §6.2): el sujeto es tu última marca en esa estación contra la
// referencia (y tu puesto), y el hueco se gana con lo que la explica: el vídeo de técnica que puso tu
// coach, tu tendencia entre carreras, las submarcas medidas, los entrenos que la trabajan y la
// recomendación. Datos EN VIVO de `CarrerasService.fetchStationDetail` (`GET /api/athlete/stations/…`);
// sin ninguna carrera importada con esta estación, el sujeto invita a importar (que es justo lo que el
// atleta puede hacer aquí). Sirve para las ocho estaciones.
//
// Honestidad (§7): cada pieza se pinta SOLO si existe. Sin tu tiempo no hay cifra (hay invitación); sin
// referencia no hay barra (una barra sin contra qué compararse insinúa un veredicto); una submarca sin
// medida no ocupa celda. El color de estado va en la barra y en la marca; las cifras, en tinta.
struct StationDetailView: View {
    let station: String
    var bearer: String? = nil

    @State private var detalle: StationDetail?
    @State private var cargando = true
    /// «Importar mis carreras»: los números de una estación salen de tus carreras HYROX importadas.
    @State private var hojaImportar = false
    private var fijo = false

    init(station: String, bearer: String? = nil) {
        self.station = station
        self.bearer = bearer
    }

    /// El vídeo de técnica que el coach tiene puesto para esta estación, ya parseado. nil mientras
    /// carga, sin vídeo o con un enlace que no se reproduce: la pantalla no promete lo que no hay.
    private var tecnica: VideoDeTecnica? { VideoDeTecnica(detalle?.technique_video_url) }

    var body: some View {
        MarcoDeDetalleCarreras {
            CabeceraDetalleCarreras(etiqueta: "Estación", titulo: station)
            if let tecnica {
                // Se reproduce aquí mismo, con el reproductor de la ficha del ejercicio (nunca a Safari).
                VideoDeTecnicaPlayer(video: tecnica)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
                    .accessibilityLabel("Vídeo de técnica de \(station)")
            }
            if cargando {
                EsqueletoSujetoCarreras(voz: "Cargando tu estación")
            } else if let detalle {
                contenido(detalle)
            } else {
                sujetoSinDatos
            }
        }
        .sheet(isPresented: $hojaImportar) {
            ImportRaceSheet(bearer: bearer) { _ in Task { await cargar() } }
        }
        .task(id: bearer) {
            guard !fijo else { return }
            await cargar()
        }
    }

    private func cargar() async {
        cargando = detalle == nil
        detalle = await CarrerasService.fetchStationDetail(station: station, bearer: bearer)
        cargando = false
    }

    // MARK: - Con datos

    @ViewBuilder
    private func contenido(_ d: StationDetail) -> some View {
        sujeto(d)
        if !d.trend.isEmpty { tendencia(Array(d.trend.suffix(Self.puntosDeTendencia))) }
        let medidas = Self.submarcasMedidas(d)
        if !medidas.isEmpty { submarcas(medidas) }
        if !d.training.isEmpty {
            SeccionDeDetalleCarreras("Entrenos que la trabajan") { EntrenosQueLaTrabajan(entrenos: d.training) }
        }
        if let reco = d.ia_recommendation, !reco.isEmpty {
            RecomendacionEstacion(texto: reco, objetivo: d.ia_objective)
        }
    }

    /// Cuántas carreras caben en la tendencia con su cifra a 15 pt sin encogerla (a 390 pt de ancho).
    static let puntosDeTendencia = 6

    /// Solo las submarcas con un valor MEDIDO: una rejilla de celdas huecas es peor que no tenerla.
    static func submarcasMedidas(_ d: StationDetail) -> [StationSubMetric] {
        d.sub_metrics.filter { !($0.value ?? "").isEmpty }
    }

    // El sujeto: tu última contra la referencia, con la barra de tu puesto y la diferencia.
    @ViewBuilder
    private func sujeto(_ d: StationDetail) -> some View {
        if let ultima = d.last_time {
            let severidad = SeveridadCarrera(wire: d.severity)
            SujetoDia(tono: .acento, etiqueta: voz(d, ultima: ultima)) {
                KickerDia("Tu última")
                TituloDia(ultima).monospacedDigit()
                if let referencia = d.benchmark_time {
                    Text("Referencia \(referencia)")
                        .papel(.cuerpoFuerte)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                }
            } abajo: {
                // La barra mide TU tiempo contra la referencia: sin referencia no hay fracción que sea verdad.
                if d.benchmark_time != nil {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        Capsule()
                            .fill(Theme.Color.foreground.opacity(0.12))
                            .frame(height: 8)
                            .overlay(alignment: .leading) {
                                GeometryReader { g in
                                    Capsule().fill(severidad.color).frame(width: g.size.width * CGFloat(max(0, min(1, d.fraction))))
                                }
                            }
                        HStack(spacing: Theme.Spacing.m) {
                            Text(severidad.puestoEnCampo).papel(.rotulo).foregroundStyle(Theme.Color.foreground)
                            if let delta = d.delta {
                                Text(delta).papel(.rotulo).monospacedDigit().foregroundStyle(Theme.Color.foreground)
                            }
                            Spacer(minLength: 0)
                            if let puesto = d.percentile_label {
                                Text(puesto).papel(.rotulo).foregroundStyle(Theme.Color.foreground)
                            }
                        }
                    }
                } else if let puesto = d.percentile_label {
                    Text(puesto).papel(.rotulo).foregroundStyle(Theme.Color.foreground)
                }
            }
        } else {
            // Sin tiempo en esta estación: se declara qué falta y se da la salida (importar).
            SujetoDia(
                tono: .acento,
                etiqueta: "Tu última. Todavía no tienes un tiempo en esta estación. Importar mis carreras.",
                alTocar: { hojaImportar = true }
            ) {
                KickerDia("Tu última")
                Text("Todavía no tienes un tiempo en esta estación").papel(.seccion).foregroundStyle(Theme.Color.foreground)
            } abajo: {
                AccionDia("Importar mis carreras")
            }
        }
    }

    // Sin ninguna carrera con esta estación (o sin respuesta): la invitación a importar.
    private var sujetoSinDatos: some View {
        SujetoDia(
            tono: .acento,
            etiqueta: "Sin datos de esta estación. Cuando registres una carrera con esta estación verás aquí tu tiempo contra la referencia, tu tendencia y la recomendación de tu coach.",
            alTocar: { hojaImportar = true }
        ) {
            KickerDia("Sin datos de esta estación")
            Text("Importa tus carreras").papel(.seccion).foregroundStyle(Theme.Color.foreground)
            ApoyoDia("Cuando registres una carrera con esta estación verás aquí tu tiempo contra la referencia, tu tendencia y la recomendación de tu coach.")
        } abajo: {
            AccionDia("Importar mis carreras")
        }
    }

    private func voz(_ d: StationDetail, ultima: String) -> String {
        var s = "\(station). Tu última \(ultima)"
        if let referencia = d.benchmark_time { s += ", referencia \(referencia)" }
        if d.benchmark_time != nil { s += ", puesto en el campo: \(SeveridadCarrera(wire: d.severity).puestoEnCampo.lowercased())" }
        if let delta = d.delta { s += ", diferencia \(delta)" }
        if let puesto = d.percentile_label { s += ", \(puesto)" }
        return s
    }

    // MARK: - Tendencia entre carreras

    // Una columna por carrera (más alta = más lenta); la última, del color de su resultado.
    private func tendencia(_ puntos: [StationTrendPoint]) -> some View {
        SeccionDeDetalleCarreras("Tendencia", nota: "Tus últimas carreras. Más alta, más lenta.") {
            HStack(alignment: .bottom, spacing: Theme.Spacing.m) {
                ForEach(puntos) { p in
                    let ultima = p.id == puntos.last?.id
                    VStack(spacing: Theme.Spacing.xs) {
                        if let t = p.time {
                            Text(t)
                                .papel(ultima ? .notaPesada : .nota)
                                .monospacedDigit()
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize()
                        }
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(ultima ? SeveridadCarrera(wire: p.severity).color : Theme.Color.superficieDeGrafico)
                            .frame(maxWidth: .infinity)
                            .frame(height: max(10, 72 * CGFloat(max(0, min(1, p.height)))))
                        Text(p.label)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(EdgeInsets(top: 16, leading: 14, bottom: 14, trailing: 14))
            .frame(maxWidth: .infinity)
            .tarjetaDia()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Tendencia entre carreras: " + puntos.map { [$0.label, $0.time].compactMap { $0 }.joined(separator: " ") }.joined(separator: ", "))
        }
    }

    // MARK: - Submarcas

    // De dos en dos, iguales en alto. El énfasis (bien / a vigilar / por mejorar) va en una MARCA junto
    // al rótulo y en palabras para VoiceOver; la cifra, en tinta (el color de estado no va en el dato).
    private func submarcas(_ medidas: [StationSubMetric]) -> some View {
        let pares = stride(from: 0, to: medidas.count, by: 2).map { Array(medidas[$0..<min($0 + 2, medidas.count)]) }
        return VStack(spacing: Theme.Spacing.m) {
            ForEach(pares.indices, id: \.self) { i in
                TeselasDia {
                    ForEach(pares[i]) { m in
                        TeselaDia(etiqueta: vozSubmarca(m)) {
                            HStack(spacing: Theme.Spacing.s) {
                                Text(m.label)
                                    .papel(.rotulo)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                if let color = Self.colorDeEnfasis(m.emphasis) {
                                    Circle().fill(color).frame(width: 10, height: 10)
                                }
                            }
                        } contenido: {
                            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
                                Text(m.value ?? "").papel(.dato).foregroundStyle(Theme.Color.foreground)
                                if let unidad = m.unit, !unidad.isEmpty {
                                    Text(unidad).papel(.nota).foregroundStyle(Theme.Color.muted)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    static func colorDeEnfasis(_ crudo: String?) -> Color? {
        switch (crudo ?? "").lowercased() {
        case "ok": return Theme.Color.ok
        case "warning": return Theme.Color.warning
        case "danger": return Theme.Color.danger
        default: return nil
        }
    }

    private func vozSubmarca(_ m: StationSubMetric) -> String {
        let enfasis: String? = {
            switch (m.emphasis ?? "").lowercased() {
            case "ok": return "bien"
            case "warning": return "a vigilar"
            case "danger": return "por mejorar"
            default: return nil
            }
        }()
        return [m.label, [m.value, m.unit].compactMap { $0 }.joined(separator: " "), enfasis].compactMap { $0 }.joined(separator: ", ")
    }
}

// MARK: - Entrenos que la trabajan

/// Las sesiones o grupos que trabajan la estación: el punto de modalidad, el nombre, el grupo y cuántas
/// veces. La fila del PRÓXIMO («→ hoy PM») va teñida del acento: es lo que viene y se puede hacer.
private struct EntrenosQueLaTrabajan: View {
    let entrenos: [TrainingLink]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(entrenos.enumerated()), id: \.element.id) { i, e in
                fila(e)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
                    }
            }
        }
        .tarjetaDia()
    }

    @ViewBuilder
    private func fila(_ e: TrainingLink) -> some View {
        if let proximo = e.next_label {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
                IconoDia(.flecha, tam: 16, peso: .bold).foregroundStyle(Theme.Color.accentText)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Próximo · \(proximo)").papel(.kicker).foregroundStyle(Theme.Color.foreground)
                    Text(e.title).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .background(Theme.Color.accentTint)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Próximo, \(proximo), \(e.title)")
        } else {
            HStack(spacing: Theme.Spacing.m - 2) {
                ModalityDot(modality: e.modality, size: 10)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    if let grupo = e.group {
                        Text(grupo).papel(.nota).foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let veces = e.count {
                    Text(veces).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(minHeight: 56)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([e.title, e.group, e.count].compactMap { $0 }.joined(separator: ", "))
        }
    }
}

// MARK: - La recomendación

/// La recomendación de la IA del método para esta estación, con su objetivo si lo hay («sub 2:20»).
/// Tarjeta teñida del acento, como el informe de la pestaña: es lo que hay que priorizar.
private struct RecomendacionEstacion: View {
    let texto: String
    let objetivo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
            HStack(spacing: Theme.Spacing.s) {
                IconoDia(.diana, tam: 18)
                Text("Recomendación IA").papel(.kicker)
            }
            .foregroundStyle(Theme.Color.foreground)
            Text(texto)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let objetivo, !objetivo.isEmpty {
                Text("Objetivo: \(objetivo)").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia(realce: true)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - La vuelta redonda (la usa Comunicados)
//
// El «‹» circular de las pantallas que dibujan su propia vuelta. Las de Carreras ya usan `AtrasCarreras`;
// esta sigue aquí porque Comunicados la lee, y no es de esta zona moverla.
struct BackCircleButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 34, height: 34)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Atrás")
    }
}

// MARK: - Estados de ejemplo

#if DEBUG
extension StationDetailView {
    /// La estación ya resuelta: `detalle` nil = sin datos; `cargando` = esqueleto. Sin red.
    init(station: String, detalle: StationDetail?, cargando: Bool = false) {
        self.init(station: station)
        _detalle = State(initialValue: detalle)
        _cargando = State(initialValue: cargando)
        fijo = true
    }
}

#Preview("Estación · con datos") {
    NavigationStack { StationDetailView(station: "Sled Push", detalle: CasosDetalleCarreras.estacion) }
}
#Preview("Estación · sin tiempo") {
    NavigationStack { StationDetailView(station: "Sled Push", detalle: CasosDetalleCarreras.estacionSinTiempo) }
}
#Preview("Estación · sin datos") {
    NavigationStack { StationDetailView(station: "Sled Push", detalle: nil) }
}
#endif
