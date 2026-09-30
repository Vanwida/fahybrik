import SwiftUI

// Modo DOBLES del detalle de carrera (embebido en RaceDetailView cuando format=doubles). Es el hermano dobles
// del «Predicho hoy + Camino al objetivo» individual, resuelto para la PAREJA:
//
//   • pastilla «Dobles · con {pareja}» (tinte del acento del club)
//   • la tarjeta «Predicho hoy · pareja» + la pastilla de gap contra el objetivo
//   • el tablero de tramos, reutilizando la barra (GapTrack) y la leyenda (GoalGapLegend) del goal-gap
//     individual — verde = dentro, naranja + cola roja = exceso, marca punteada = objetivo; opacidad por tier
//     de evidencia. Cada fila lleva una pastilla de quién la lleva (Tú 60 % / pareja / 50-50 / juntos).
//   • tocar una estación con reparto abre el editor (DoblesRepartoEditorSheet)
//   • la nota «misma estrategia que la Simulación conjunta»
//   • la tarjeta de consejos del coach (DoblesCoachTipsCard)
//
// Estados honestos por `availability`: no_pair (vincula a tu pareja), no_data (aún sin datos), partial (tramos
// estimados atenuados por opacidad). Es una vista autocontenida (lectura + estados + editor + relectura), como
// PredichoVsRealView / DoblesSimulationView, así RaceDetailView queda fino.
//
// PIEL DE «EL DÍA»: papeles de la escala (nada por debajo de 15 pt), tarjeta de `caraDobles`, pastillas del kit.
// La leyenda de la barra (`GoalGapLegend`) es de Carreras y se comparte con el tablero individual.
struct DoblesRaceGapSection: View {
    let raceId: String
    var bearer: String?

    @State private var gap: DoblesRaceGap? = nil
    @State private var loading = true
    @State private var editing: DoblesRaceGapSegment? = nil

    private var taskKey: String { "\(raceId)|\(bearer ?? "")" }

    var body: some View {
        Group {
            if loading {
                DoblesRaceGapEsqueleto()
            } else if let gap {
                content(gap)
            } else {
                errorState
            }
        }
        .task(id: taskKey) { await load() }
        .sheet(item: $editing) { seg in
            if let gap {
                DoblesRepartoEditorSheet(
                    segment: seg,
                    partnerName: gap.partnerName ?? "Compañero",
                    predictedTotalS: gap.predictedTotalS,
                    goalS: gap.goalS,
                    gapS: gap.gapS,
                    bearer: bearer,
                    onSaved: { Task { await load() } }
                )
            }
        }
    }

    private func load() async {
        // Refetch conserva el board mientras revalida (spinner sólo en frío);
        // un fallo de refetch no pisa el board ya cargado.
        loading = (gap == nil)
        if let fetched = await DoblesService.fetchRaceGap(raceId: raceId, bearer: bearer) {
            gap = fetched
        }
        loading = false
    }

    // MARK: - Content router (por availability)

    @ViewBuilder
    func content(_ gap: DoblesRaceGap) -> some View {
        switch gap.availability.lowercased() {
        case "no_pair":
            // Was "pídele a tu coach que vincule a tu pareja" — which was never
            // true: the athlete sends the invitation themselves, by email.
            DoblesNoPartnerState(
                message: "Con tu pareja conectada verás aquí el predicho conjunto de esta carrera, tramo a tramo, y podréis repartir las estaciones.",
                bearer: bearer,
                onInvited: { Task { await load() } }
            )
            .padding(.top, Theme.Spacing.m)
        case "no_data":
            RedesignEmptyState(
                symbol: "chart.bar",
                title: "Aún no hay datos de la pareja",
                message: "Cuando tú y tu pareja registréis prácticas de estación, aquí aparecerá vuestro predicho conjunto y el reparto por estación.",
                exit: .explained(note: "Se llena solo con lo que entrenéis los dos.")
            )
            .padding(.top, Theme.Spacing.m)
        default: // ok | partial | desconocido con datos
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                doublesChip(gap)
                heroCard(gap)
                boardSection(gap)
                strategyNote(gap)
                DoblesCoachTipsCard(title: "Antes de la carrera", tips: gap.coachTips)
            }
        }
    }

    // MARK: - Doubles chip

    private func doublesChip(_ gap: DoblesRaceGap) -> some View {
        InfoPill(text: gap.partnerName.map { "Dobles · con \($0)" } ?? "Dobles", estilo: .acento)
            .accessibilityLabel(gap.partnerName.map { "Dobles, con \($0)" } ?? "Dobles")
    }

    // MARK: - Hero (predicho pareja vs objetivo)

    private func heroCard(_ gap: DoblesRaceGap) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Predicho hoy · pareja")
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.muted)
            // El sujeto es el predicho de la pareja. Sin él se declara qué falta y cómo se llena — es un acto
            // que los dos pueden hacer (§6.2 bis) — en vez de una cifra de 32 pt que no existe.
            if let predicho = gap.predictedTotalS.map({ GoalGapFormat.raceClock($0) }) {
                Text(predicho)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            } else {
                Text("Todavía no podemos predecir vuestro tiempo.")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Necesitamos tiempos de estación de los dos. En cuanto los tengáis aparece aquí.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let goal = gap.goalS {
                // El gap lo da el servidor, y sólo llega cuando hay predicho de verdad contra el que comparar
                // (nunca un «justo» engañoso sobre un predicho que no existe).
                if let g = gap.gapS {
                    PastillaDeGap(gapS: g)
                }
                if let label = gap.goalLabel {
                    Text("Objetivo \(label) · \(GoalGapFormat.raceClock(goal))")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                Text("Sin objetivo fijado para esta carrera.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Board

    private func boardSection(_ gap: DoblesRaceGap) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Reparto y predicho por tramo")
            GoalGapLegend()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                ForEach(gap.segments) { seg in
                    segmentRow(seg, partnerName: gap.partnerName ?? "Compañero")
                }
            }
            boardFooter(gap)
        }
    }

    @ViewBuilder
    private func segmentRow(_ seg: DoblesRaceGapSegment, partnerName: String) -> some View {
        if seg.isRoxzone {
            roxzoneRow(seg)
        } else if seg.isEditable {
            Button {
                Haptics.light()
                editing = seg
            } label: {
                stationRow(seg, partnerName: partnerName, editable: true)
            }
            .buttonStyle(PressScaleStyle())
        } else {
            stationRow(seg, partnerName: partnerName, editable: false)
        }
    }

    // Un tramo a pie / una estación: nombre y tiempo arriba, quién lo lleva y el delta debajo, y la barra con
    // la opacidad por tier y la marca del objetivo. Editable → el glifo del reparto.
    private func stationRow(_ seg: DoblesRaceGapSegment, partnerName: String, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text(seg.labelEs)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(GoalGapFormat.raceClock(seg.pairPredictedS))
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.foreground)
                if editable {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityHidden(true)
                }
            }
            HStack(alignment: .center, spacing: Theme.Spacing.s) {
                carrierChip(seg, partnerName: partnerName)
                if let delta = seg.deltaS, delta != 0 {
                    Text(GoalGapFormat.signedDuration(delta))
                        .papel(.notaPesada)
                        .foregroundStyle(delta > 0 ? Theme.Color.danger : Theme.Color.ok)
                }
            }
            GapTrack(
                predicted: seg.pairPredictedS,
                budget: seg.budgetS,
                fillOpacity: seg.barFillOpacity
            )
            .frame(height: GoalGapVis.trackHeight)
            if let caption = seg.tierCaption {
                Text(caption)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(minHeight: Theme.Size.toque, alignment: .top)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(seg, partnerName: partnerName, editable: editable))
    }

    // RoxZone — las transiciones, las hacéis juntos. Apagada y compacta como el tablero individual, para que
    // cierren los totales sin competir con las estaciones.
    private func roxzoneRow(_ seg: DoblesRaceGapSegment) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(seg.labelEs)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.s)
            Text(GoalGapFormat.raceClock(seg.pairPredictedS))
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(seg.labelEs), juntos, \(GoalGapFormat.raceClock(seg.pairPredictedS))")
    }

    // La pastilla de «quién lo lleva»: el atleta o el reparto → acento; la pareja → azul; juntos → neutra.
    @ViewBuilder
    private func carrierChip(_ seg: DoblesRaceGapSegment, partnerName: String) -> some View {
        let text = seg.carrierChipText(partnerName: partnerName)
        switch seg.carrier.lowercased() {
        case "partner":  PastillaPareja(texto: text)
        case "together": InfoPill(text: text, estilo: .neutro)
        default:         InfoPill(text: text, estilo: .acento)
        }
    }

    private func boardFooter(_ gap: DoblesRaceGap) -> some View {
        var parts = ["La barra es vuestro predicho conjunto; la marca punteada, lo que pide el objetivo, y el tramo rojo, lo que hoy os sobra."]
        if gap.isPartial {
            parts.append("Los tramos translúcidos son estimados: aún faltan esfuerzos reales.")
        }
        if gap.segments.contains(where: { $0.isEditable }) {
            parts.append("Toca una estación para ajustar el reparto.")
        }
        return Text(parts.joined(separator: " "))
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Strategy note

    private func strategyNote(_ gap: DoblesRaceGap) -> some View {
        var text = "Es la misma estrategia que la Simulación conjunta: lo que ajustes aquí lo vais los dos."
        if let by = gap.strategyLastEditedBy, !by.isEmpty {
            text += " Último ajuste de \(by)."
        }
        return HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 2)
                .accessibilityHidden(true)
            Text(text)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Error state

    private var errorState: some View {
        RedesignEmptyState(
            symbol: "arrow.clockwise",
            title: "No pudimos cargar el predicho conjunto",
            message: "Revisa tu conexión e inténtalo de nuevo.",
            exit: .action(title: "Reintentar") { Task { await load() } }
        )
        .padding(.top, Theme.Spacing.m)
    }

    // MARK: - A11y

    private func rowAccessibilityLabel(_ seg: DoblesRaceGapSegment, partnerName: String, editable: Bool) -> String {
        var parts = [seg.labelEs, whoLabel(seg, partnerName: partnerName)]
        if let caption = seg.tierCaption { parts.append(caption) }
        parts.append("predicho \(GoalGapFormat.raceClock(seg.pairPredictedS))")
        if let delta = seg.deltaS, delta != 0 {
            parts.append(delta > 0
                ? "\(Formato.clock(Double(delta))) sobre el objetivo"
                : "\(Formato.clock(Double(abs(delta)))) bajo el objetivo")
        }
        if editable { parts.append("toca para ajustar el reparto") }
        return parts.joined(separator: ", ")
    }

    private func whoLabel(_ seg: DoblesRaceGapSegment, partnerName: String) -> String {
        switch seg.carrier.lowercased() {
        case "self":     return "lo llevas tú"
        case "partner":  return "lo lleva \(partnerName)"
        case "together": return "juntos"
        case "split":
            // Igual que el chip: sin reparto sabido, «repartida» — nunca un 50/50
            // inventado (§7).
            guard let share = seg.selfShare else { return "repartida" }
            let pct = Int((max(0, min(1, share)) * 100).rounded())
            return "tú \(pct) por ciento"
        default:         return seg.carrier
        }
    }
}

// MARK: - El esqueleto

/// El predicho de la pareja mientras llega: la silueta de la tarjeta y de unas filas del tablero, sin inventar
/// ningún tramo.
struct DoblesRaceGapEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SkeletonBar(width: 170, height: 32, radius: 16)
            SkeletonBar(height: 150, radius: Theme.Radius.tarjeta)
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                ForEach(0..<4, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        SkeletonBar(width: 140, height: 17, radius: 5)
                        SkeletonBar(height: GoalGapVis.trackHeight, radius: 4)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando el predicho conjunto")
    }
}
