import SwiftUI

// Modo DOBLES del detalle de carrera (embebido en RaceDetailView cuando
// format=doubles). Es el hermano dobles del "Predicho hoy + Camino al objetivo"
// individual, resuelto para la PAREJA:
//
//   • chip "DOBLES · CON {PAREJA}" (pill acento)
//   • hero "Predicho hoy · pareja" + pill de gap contra el objetivo
//   • board de tramos, reutilizando la barra (GapTrack) y la leyenda
//     (GoalGapLegend) del goal-gap individual — verde=dentro, naranja+cola
//     roja=exceso, marca punteada=objetivo; opacidad por tier de evidencia. Cada
//     fila lleva un chip de quién la lleva (TÚ 60% / PAREJA / 50/50 / JUNTOS).
//   • tocar una estación con reparto abre el editor (DoblesRepartoEditorSheet)
//   • nota "misma estrategia que la Simulación conjunta"
//   • card de consejos del coach (DoblesCoachTipsCard)
//
// Estados honestos por `availability`: no_pair (vincula a tu pareja),
// no_data (aún sin datos), partial (tramos estimados atenuados por opacidad).
// Es una vista autocontenida (fetch + estados + editor + refetch), como
// PredichoVsRealView / DoblesSimulationView, así RaceDetailView queda fino.
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
                ProgressView()
                    .tint(Theme.Color.accentText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.xl)
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
    private func content(_ gap: DoblesRaceGap) -> some View {
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
        let text = gap.partnerName.map { "DOBLES · CON \($0.uppercased())" } ?? "DOBLES"
        return HStack(spacing: 5) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 10, weight: .bold))
            Text(text)
                .font(.system(size: 11, weight: .bold))
                .tracking(0.4)
        }
        .foregroundStyle(Theme.Color.accentText)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Theme.Color.accent.opacity(0.12))
        .clipShape(Capsule())
        .accessibilityLabel(gap.partnerName.map { "Dobles, con \($0)" } ?? "Dobles")
    }

    // MARK: - Hero (predicho pareja vs objetivo)

    private func heroCard(_ gap: DoblesRaceGap) -> some View {
        CardSurface(padding: 16, elevated: true) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "PREDICHO HOY · PAREJA")
                // El sujeto es el predicho de la pareja. Sin él se declara qué
                // falta y cómo se llena — es un acto que los dos pueden hacer
                // (§6.2 bis) — en vez de un número de 40 pt que no existe.
                if let predicho = gap.predictedTotalS.map({ GoalGapFormat.raceClock($0) }) {
                    Text(predicho)
                        .font(.system(size: 40, weight: .heavy, design: .monospaced).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                } else {
                    Text("Todavía no podemos predecir vuestro tiempo.")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Necesitamos tiempos de estación de los dos. En cuanto los tengáis aparece aquí.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let goal = gap.goalS {
                    // El gap lo da el servidor, y sólo llega cuando hay predicho
                    // de verdad contra el que comparar (nunca un "justo" engañoso
                    // sobre un predicho que no existe).
                    if let g = gap.gapS {
                        gapPill(g)
                    }
                    if let label = gap.goalLabel {
                        Text("Objetivo \(label) · \(GoalGapFormat.raceClock(goal))")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Color.faint)
                    }
                } else {
                    Text("Sin objetivo fijado para esta carrera.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private func gapPill(_ gapS: Int) -> some View {
        if gapS > 0 {
            pill("\(GoalGapFormat.signedDuration(gapS)) sobre el objetivo", fg: Theme.Color.warning, bg: Theme.Color.warningTint)
        } else if gapS < 0 {
            pill("\(GoalGapFormat.signedDuration(gapS)) bajo el objetivo", fg: Theme.Color.ok, bg: Theme.Color.okTint)
        } else {
            pill("Justo en tu objetivo", fg: Theme.Color.ok, bg: Theme.Color.okTint)
        }
    }

    private func pill(_ text: String, fg: Color, bg: Color) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
            .foregroundStyle(fg)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(bg)
            .clipShape(Capsule())
    }

    // MARK: - Board

    private func boardSection(_ gap: DoblesRaceGap) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "REPARTO Y PREDICHO POR TRAMO")
            GoalGapLegend()
            VStack(alignment: .leading, spacing: 13) {
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

    // Una carrera a pie / estación: nombre · chip de reparto · (delta + tiempo) ·
    // barra con opacidad por tier y la marca del objetivo. Editable → chevron.
    private func stationRow(_ seg: DoblesRaceGapSegment, partnerName: String, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(seg.labelEs)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                carrierChip(seg, partnerName: partnerName)
                Spacer(minLength: 8)
                if let delta = seg.deltaS, delta != 0 {
                    Text(GoalGapFormat.signedDuration(delta))
                        .font(.system(size: 11, weight: .semibold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(delta > 0 ? Theme.Color.danger : Theme.Color.ok)
                }
                Text(GoalGapFormat.raceClock(seg.pairPredictedS))
                    .font(.system(size: 13, weight: .medium, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                if editable {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityHidden(true)
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
                    .font(.system(size: 10, weight: .medium).italic())
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(seg, partnerName: partnerName, editable: editable))
    }

    // RoxZone — las transiciones, la hacéis juntos. Muted + compacto como el board
    // individual, para que cierren los totales sin competir con las estaciones.
    private func roxzoneRow(_ seg: DoblesRaceGapSegment) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(seg.labelEs)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.faint)
            Spacer(minLength: 8)
            Text(GoalGapFormat.raceClock(seg.pairPredictedS))
                .font(.system(size: 12, weight: .medium, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(seg.labelEs), juntos, \(GoalGapFormat.raceClock(seg.pairPredictedS))")
    }

    // Chip de "quién lo lleva": self/split → acento, pareja → azul, juntos → neutro.
    private func carrierChip(_ seg: DoblesRaceGapSegment, partnerName: String) -> some View {
        let text = seg.carrierChipText(partnerName: partnerName)
        let (fg, bg): (Color, Color)
        switch seg.carrier.lowercased() {
        case "partner":  (fg, bg) = (Theme.Color.partner, Theme.Color.infoTint)
        case "together": (fg, bg) = (Theme.Color.neutral, Theme.Color.neutralTint)
        default:         (fg, bg) = (Theme.Color.accentText, Theme.Color.accent.opacity(0.12))
        }
        return Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(0.3)
            .foregroundStyle(fg)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(bg)
            .clipShape(Capsule())
            .accessibilityHidden(true)
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
            .font(.system(size: 11))
            .foregroundStyle(Theme.Color.faint)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Strategy note

    private func strategyNote(_ gap: DoblesRaceGap) -> some View {
        var text = "Es la misma estrategia que la Simulación conjunta: lo que ajustes aquí lo vais los dos."
        if let by = gap.strategyLastEditedBy, !by.isEmpty {
            text += " Último ajuste de \(by)."
        }
        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
                .padding(.top, 1)
            Text(text)
                .font(.system(size: 12))
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
