import SwiftUI

// LAS PIEZAS DE LA LECTURA DE UNA SESIÓN — cabecera, totales, desglose bloque a
// bloque y lo que dijo el atleta. La gráfica del pulso vive en `GraficaDePulso` y
// el mapa se REUTILIZA de `MapaDeLaCarrera` (mismo `PuntoRuta`, mismo dibujo: no
// se redibuja un segundo mapa para esta pantalla).
//
// Port de `web/components/design-twin/screens/lectura-sesion/piezas.tsx`, sobre
// los átomos que YA existen en `Theme/Atoms.swift` (no se reinventan).
//
// TIPOGRAFÍA (§4.1 CONTRATO-UI, card 124): nada por debajo de 15 pt en esta
// pantalla — etiquetas, unidades, cabeceras de columna y pies de gráfica
// incluidos.

// MARK: - CAPA 1 · EL ICONO DEL TIPO DE ENTRENO — de un vistazo, qué fue la sesión

/// El tinte por tipo. `correr` y `hyrox` comparten color a propósito (mismo
/// criterio que el doble): son la misma familia de intensidad cronometrada, y lo
/// que los distingue es el glifo, no el color. Los tres tintes son tokens YA
/// existentes de `Theme.Color` — este icono no inventa un cuarto color.
private func tinteDeTipo(_ tipo: TipoDeEntreno) -> Color {
    switch tipo {
    case .correr, .hyrox: return Theme.Color.modalityHyrox
    case .fuerza: return Theme.Color.modalityStrength
    case .mixto, .funcional: return Theme.Color.modalityFunctional
    }
}

private func glifoDeTipo(_ tipo: TipoDeEntreno) -> String {
    switch tipo {
    case .correr: return "figure.run"
    case .fuerza: return "dumbbell.fill"
    case .hyrox: return "bolt.fill"
    case .mixto, .funcional: return "figure.cross.training"
    }
}

/// El círculo teñido con su glifo — el sujeto de la cabecera. La tinta del
/// glifo es blanca sobre cualquiera de los tres tintes: los tres son oscuros y
/// saturados en ambos temas (medido igual que el resto de `Theme.Color`).
struct IconoTipoEntreno: View {
    let tipo: TipoDeEntreno
    var size: CGFloat = 52

    var body: some View {
        Image(systemName: glifoDeTipo(tipo))
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(tinteDeTipo(tipo))
            .clipShape(Circle())
            .accessibilityHidden(true)
    }
}

// MARK: - CAPA 1 · CABECERA

struct CabeceraDeSesion: View {
    let sesion: SesionEjecutada

    var body: some View {
        HStack(spacing: 14) {
            IconoTipoEntreno(tipo: sesion.tipo)
            VStack(alignment: .leading, spacing: 3) {
                Text(sesion.titulo)
                    .font(.system(size: 20, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if let ventana {
                    Text("\(sesion.cuando) · \(ventana)")
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                } else if !sesion.cuando.isEmpty {
                    Text(sesion.cuando)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
                Text(sesion.completitud == .completa ? "Sesión completa" : "Hecha a medias")
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(sesion.completitud == .completa ? Theme.Color.muted : Theme.Color.warning)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    /// «07:15–08:02». Nil si falta cualquiera de los dos extremos — nunca se
    /// completa uno sumando la duración al otro (eso sería fabricar el que falta).
    private var ventana: String? {
        guard let inicio = sesion.horaInicio, let fin = sesion.horaFin else { return nil }
        return "\(inicio)–\(fin)"
    }
}

// MARK: - CAPA 2 · LOS TOTALES — la foto de la sesión entera, en rejilla

/// Una celda de la rejilla de totales — hermana de `ExpertCell`, con un pie de
/// texto extra (la máquina que midió la distancia, la serie más pesada del
/// volumen) que `ExpertCell` no tiene sitio para llevar.
private struct CeldaDeTotal: View {
    let etiqueta: String
    let valor: String
    var unidad: String? = nil
    var color: Color = Theme.Color.foreground
    var sub: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(etiqueta)
                .font(.system(size: 15, weight: .bold))
                .tracking(Theme.Tracking.dataLabel)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(valor)
                    .font(.system(size: 34, weight: .bold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(color)
                if let unidad {
                    Text(unidad)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            if let sub {
                Text(sub)
                    .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// El color de la celda de distancia — por el MODO, no por la modalidad genérica:
/// correr se tiñe como HYROX (mismo criterio que el icono), un ergómetro con el
/// tono de soporte que ya usa el resto de la app.
private func colorDeModo(_ modo: TotalDeDistancia) -> Color {
    modo.modo == "corriendo" ? Theme.Color.modalityHyrox : Theme.Color.modalitySupport
}

struct RejillaTotalesDeSesion: View {
    let sesion: SesionEjecutada

    var body: some View {
        let cols = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 18) {
            CeldaDeTotal(etiqueta: "Tiempo", valor: Formato.clock(sesion.duracionTotalS))

            switch sesion.resultado {
            case .fuerza(let volumenKg, let masPesada):
                CeldaDeTotal(
                    etiqueta: "Volumen", valor: Formato.esDecimal(volumenKg / 1000, decimals: 2), unidad: "t",
                    sub: masPesada.map { "\($0.etiqueta) · \(Formato.kg($0.kg)) \(Formato.signoPor) \($0.reps)" }
                )
            case .emom(let completadas, let prescritas):
                CeldaDeTotal(
                    etiqueta: "Rondas completadas", valor: "\(completadas) de \(prescritas)",
                    color: completadas == prescritas ? Theme.Color.ok : Theme.Color.foreground
                )
            case .texto(let texto):
                CeldaDeTotal(etiqueta: "Resultado", valor: texto)
            case nil:
                EmptyView()
            }

            if let distanciaTotal = distanciaTotalDeSesion(sesion.bloques) {
                let color = colorDeModo(distanciaTotal)
                CeldaDeTotal(
                    etiqueta: "Distancia",
                    valor: Formato.distancia(distanciaTotal.metros, decimales: 2) ?? "",
                    color: color, sub: distanciaTotal.modo
                )
                if let ritmoSkm = distanciaTotal.ritmoSkm {
                    let unidad: Formato.UnidadRitmo = distanciaTotal.modo == "corriendo" ? .porKm : .por500m
                    CeldaDeTotal(etiqueta: "Ritmo medio", valor: Formato.ritmo(ritmoSkm, unidad), color: color)
                }
            } else if let ritmoCorrer = ritmoMedioDeCorrer(sesion.bloques) {
                // Sin un total de distancia (se midió en más de una modalidad), el
                // ritmo de CORRER sigue teniendo una respuesta propia — solo mira
                // los tramos de correr, sin mezclar nada.
                CeldaDeTotal(
                    etiqueta: "Ritmo medio", valor: Formato.ritmo(ritmoCorrer, .porKm),
                    color: Theme.Color.modalityHyrox, sub: "corriendo"
                )
            }

            if let fc = sesion.fcMediaPpm {
                CeldaDeTotal(etiqueta: "FC media", valor: "\(Int(fc.rounded()))", unidad: Vocab.ppm)
            }
            if let fcMax = sesion.fcMaxPpm {
                CeldaDeTotal(etiqueta: "FC máxima", valor: "\(Int(fcMax.rounded()))", unidad: Vocab.ppm)
            }
            if let kcal = sesion.kcal {
                CeldaDeTotal(etiqueta: "Calorías", valor: "\(Int(kcal.rounded()))", unidad: "kcal")
            }
        }
    }
}

// MARK: - CAPA 5 · EL DESGLOSE — un bloque, en su propio idioma

private struct LabelDeColumna: View {
    let texto: String
    var body: some View {
        Text(texto)
            .font(.system(size: 15, weight: .bold))
            .tracking(Theme.Tracking.dataLabel)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.muted)
    }
}

/// La cabecera de columnas del desglose — una vez, no en cada fila.
struct CabeceraDelDesglose: View {
    var body: some View {
        HStack {
            LabelDeColumna(texto: "Ejercicio")
            Spacer()
            LabelDeColumna(texto: Vocab.ppm).frame(width: 46, alignment: .trailing)
        }
        .padding(.horizontal, 10)
    }
}

private func puntoDeModalidad(_ modalidad: ModalidadDeBloque) -> Color {
    switch modalidad {
    case .correr: return Theme.Color.modalityHyrox
    case .ergometro: return Theme.Color.info
    case .fuerza: return Theme.Color.modalityStrength
    case .funcional: return Theme.Color.modalityFunctional
    }
}

/// UNA RONDA DEL DESGLOSE — cabecera solo si el grupo la trae (el agrupado sale
/// del dato, nunca de una rama de la pantalla). `round_index` 1+ agrupa;
/// 0/nil se lee plano.
struct GrupoDeRonda: View {
    let grupo: GrupoDesglose
    let rondas: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let ronda = grupo.ronda {
                HStack(alignment: .lastTextBaseline) {
                    Text("Ronda \(ronda) de \(rondas)")
                        .scaledFont(15, weight: .bold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                        .tracking(1)
                    Spacer(minLength: 0)
                    if duracionRondaS != nil {
                        Text(Formato.clock(duracionRondaS!))
                            .font(.system(size: 15, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
                .padding(.horizontal, 2)
            }
            VStack(spacing: 6) {
                ForEach(Array(grupo.bloques.enumerated()), id: \.offset) { _, bloque in
                    FilaDeBloque(bloque: bloque)
                }
            }
        }
    }

    private var duracionRondaS: Double? {
        let duraciones = grupo.bloques.map(\.duracionS)
        guard duraciones.allSatisfy({ $0 != nil }) else { return nil }
        return duraciones.compactMap { $0 }.reduce(0, +)
    }
}

struct FilaDeBloque: View {
    let bloque: Bloque

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            Circle().fill(puntoDeModalidad(bloque.modalidad)).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(bloque.etiqueta)
                    .scaledFont(17, weight: .semibold, relativeTo: .body)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                if let duracionS = bloque.duracionS {
                    Text(Formato.clock(duracionS))
                        .scaledFont(15, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
                if let descansoS = bloque.descansoS {
                    Text("descanso \(Formato.clock(descansoS))")
                        .scaledFont(15, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer(minLength: 8)
            medida
            if let fc = bloque.fcMediaPpm {
                Text("\(Int(fc.rounded()))")
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 42, alignment: .trailing)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    /// LA MEDIDA, en el idioma de la modalidad — y ninguna si no se midió (§7:
    /// «donde no hay metros no hay recuadro de metros ni de ritmo»).
    @ViewBuilder
    private var medida: some View {
        switch bloque.modalidad {
        case .correr:
            if let d = bloque.distanciaM {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Formato.distancia(d, decimales: 1, umbralMetros: 2000) ?? "")
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                    if let ritmo = bloque.ritmoDeCorrerSkm {
                        Text(Formato.ritmo(ritmo, .porKm))
                            .scaledFont(15, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        case .ergometro:
            if let d = bloque.distanciaM {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Formato.distancia(d, decimales: 1, umbralMetros: 2000) ?? "")
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                    if let ritmo = bloque.ritmoDeErgometroS500m {
                        Text(Formato.ritmo(ritmo, .por500m))
                            .scaledFont(15, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        case .fuerza:
            if !bloque.series.isEmpty {
                VStack(alignment: .trailing, spacing: 1) {
                    ForEach(Array(bloque.series.enumerated()), id: \.offset) { _, serie in
                        Text(textoDeSerie(serie))
                            .font(.system(size: 15, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
            } else if let reps = bloque.repsTotal {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(reps) \(Vocab.reps)")
                        .font(.system(size: 17, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                    if let kg = bloque.kg {
                        Text(Formato.kg(kg))
                            .scaledFont(15, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        case .funcional:
            if let reps = bloque.reps {
                Text("\(reps) \(Vocab.reps)")
                    .font(.system(size: 17, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.foreground)
            } else if let metros = bloque.metros {
                Text(Formato.distancia(metros, decimales: 1, umbralMetros: 2000) ?? "")
                    .font(.system(size: 17, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
    }
}

private func textoDeSerie(_ serie: SerieEjecutada) -> String {
    let reps = serie.reps.map { "\($0)" } ?? "—"
    if let kg = serie.kg {
        let base = "\(reps) × \(Formato.kg(kg))"
        return serie.isApproach ? "\(base) aprox." : base
    }
    return serie.isApproach ? "\(reps) aprox." : "\(reps) \(Vocab.reps)"
}

// MARK: - CAPA 6 · LAS ZONAS — reutiliza `ZoneCoverage`/`ZoneBandStyle` (el
// mismo instrumento que ya lee el resto de la app, §0 CONTRATO-UI: un solo
// sitio calcula el reparto por resto mayor y el hueco «Sin pulso»). Barra
// PROPIA de esta pantalla y no la de `zonesCard` de siempre: aquella pinta su
// leyenda a 9 pt, y esta pantalla no baja de 15 (§4.1).
struct BarraDeZonasDeSesion: View {
    let cobertura: ZoneCoverage

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    ForEach(cobertura.bands) { banda in
                        Rectangle().fill(ZoneBandStyle.fill(banda))
                            .frame(width: max(0, geo.size.width * CGFloat(banda.pct) / 100))
                    }
                }
            }
            .frame(height: 16)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            HStack(spacing: 12) {
                ForEach(cobertura.bands) { banda in
                    Text("\(banda.label) \(banda.pct)%")
                        .font(.system(size: 15, weight: .bold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(ZoneBandStyle.text(banda))
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ZoneBandStyle.spoken(cobertura))
    }
}

// MARK: - CAPA 7 · LO QUE DIJO EL ATLETA — la única capa que no es una medida

struct LoQueDijoElAtletaDeLaSesion: View {
    let sesion: SesionEjecutada

    var body: some View {
        if piezas.isEmpty, sesion.molestiaLabel == nil {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                if !piezas.isEmpty {
                    Text(piezas.joined(separator: " · "))
                        .scaledFont(17, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(Theme.Color.foreground)
                }
                if let molestia = sesion.molestiaLabel {
                    Text(molestia)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.warning)
                }
            }
        }
    }

    private var piezas: [String] {
        var p: [String] = []
        if let rpe = sesion.rpe { p.append("Esfuerzo \(rpe)") }
        if let dificultad = sesion.dificultadLabel { p.append(dificultad) }
        return p
    }
}
