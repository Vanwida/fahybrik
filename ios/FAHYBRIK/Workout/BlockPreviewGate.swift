import SwiftUI

// MARK: - BlockPreviewGate
//
// The "ready" screen shown BEFORE each coach block runs (and at the very first
// block). Every block starts with the athlete's approval: they SEE what's coming
// — the block name, its format, and the movements + targets — set up (load a bar,
// read the WOD), and tap "Empezar" WHEN READY. Only then does that block's clock
// start (an EMOM's 3-2-1 count-in fires AFTER this tap, never as an automatic
// between-blocks transition). The session engine (`WorkoutSession`) holds the
// clock frozen while this is on screen via `isAwaitingBlockStart`.
//
// Presented XOR the live (`PresentadorVivo`) — same exclusive gate as Watch
// `LiveFlowView`. Reuses Theme atoms + `WorkoutSegment.previewWorkLine`, so
// the work reads exactly like the pre-workout brief and the live HUD.
// Card 114 — Alex, sesión del 20-ago: «Al entrar en estaciones no estaba claro
// si eran 3 seguidas de cada ejercicio o 1 y 1 y 1. El atleta lo hizo mal».
// CIRCUITO = una ruta de estaciones distintas, una vuelta (`fixedListIsStations`
// en `LiveTramo.swift`). SEGUIDO = el mismo movimiento se repite ronda tras
// ronda — no hay orden de estación que confundir porque solo hay UN movimiento.
// Un formato de rondas con VARIOS movimientos (el caso real de Alex: ¿se
// rota o se hacen seguidas las de cada uno?) no entra en ninguno de los dos:
// ahí la app no puede prometer cuál lectura es la correcta, así que no se
// pinta nada — decir "circuito" cuando no lo es es justo lo que le hizo
// hacer el entreno mal.
enum BlockPacing: Equatable {
    case circuito
    case seguido
    /// Una superserie NO es ninguna de las dos: va y viene entre dos ejercicios.
    /// Etiquetarla «seguido» engañaría igual que no decir nada — peor, porque
    /// suena a certeza.
    case alternando

    var label: String {
        switch self {
        case .circuito:   return "CIRCUITO"
        case .seguido:    return "SEGUIDO"
        case .alternando: return "ALTERNANDO"
        }
    }

    var caption: String {
        switch self {
        case .circuito:   return "uno de cada por vuelta, en orden"
        // Vale para las dos formas de «seguido»: la tabla de hierro y el bloque
        // de rondas con un solo movimiento (donde no hay «siguiente» que confundir).
        case .seguido:    return "todas las series de un ejercicio antes del siguiente"
        case .alternando: return "una serie de cada, y vuelta a empezar"
        }
    }

    var icon: String {
        switch self {
        case .circuito:   return "arrow.triangle.2.circlepath"
        case .seguido:    return "repeat"
        case .alternando: return "arrow.left.arrow.right"
        }
    }

    var color: Color {
        switch self {
        // Acento: la lectura que más le cuesta a un atleta nuevo — el orden
        // de estación es justo lo que se le olvida.
        case .circuito:   return Theme.Color.accentText
        case .alternando: return Theme.Color.accentText
        case .seguido:    return Theme.Color.muted
        }
    }

    /// La decisión, pura y testeable — separada de la vista para poder probarla
    /// sin renderizar nada. Recorre los segmentos del bloque y se queda con el
    /// primero que dé una lectura cierta.
    ///
    /// EL CASO QUE MOTIVA TODO ESTO (card 114). Alex, 20-ago: «al entrar en
    /// estaciones no estaba claro si eran 3 seguidas de cada ejercicio o 1 y 1 y
    /// 1. El atleta lo hizo mal». Ese caso —rondas declaradas con VARIOS
    /// movimientos— es precisamente el que hay que contestar, y la respuesta no
    /// es ambigua: en este modelo, rondas con varios movimientos significa uno de
    /// cada por vuelta. Si el entrenador quisiera todas las series de un
    /// ejercicio antes de pasar al siguiente, eso no sería «rondas»: sería
    /// `sets`, que es otro esquema y se lee abajo.
    ///
    /// Callarse ahí sería dejar sin arreglar justo la queja. Sólo se calla cuando
    /// de verdad no se puede saber, que con estas reglas casi no pasa.
    static func resolve(_ segments: [WorkoutSegment]) -> BlockPacing? {
        for seg in segments {
            // Una superserie va y viene entre sus ejercicios: ni seguido ni
            // circuito. Se mira ANTES que la tabla de hierro porque también
            // cuenta como fuerza por series.
            if seg.formatScheme == .superset { return .alternando }
            // Una tabla de hierro es, por definición, todas las series de un
            // ejercicio antes de pasar al siguiente.
            if seg.usesMultiSetStrength { return .seguido }
            guard seg.formatScheme?.presentation == .fixed else { continue }
            // Una ruta de estaciones distintas: una vuelta, en ese orden.
            if seg.fixedListIsStations { return .circuito }
            guard seg.formatRounds != nil else { continue }
            // Rondas con un solo movimiento: no hay orden que confundir.
            // Rondas con varios: uno de cada por vuelta. EL caso de Alex.
            return seg.declaredComponents.count <= 1 ? .seguido : .circuito
        }
        return nil
    }
}

struct BlockPreviewGate: View {
    /// Block name — coach title (e.g. "Metcon") or the phase name.
    let title: String
    /// Pedagogical phase tag above the title ("CALENTAMIENTO" / "PRINCIPAL" /
    /// "VUELTA A LA CALMA"). Nil for a freeform session with no block context.
    let phaseTag: String?
    /// 1-based block position + total, shown as "BLOQUE N DE M" when M > 1.
    let blockNumber: Int
    let blockCount: Int
    /// Format/scheme line — "EMOM · 15 rondas · cada 1:00", "AMRAP · 20:00",
    /// "For Time · cap 15:00". Nil for plain strength / warmup blocks (the title
    /// already conveys those).
    let formatLabel: String?
    /// Card 114 — circuito vs seguido, cuando se puede saber con certeza. Nil
    /// cuando el bloque no es un formato de estaciones/rondas (hierro, warmup) O
    /// cuando es ambiguo (varios movimientos con rondas declaradas) — ver arriba.
    var pacing: BlockPacing? = nil
    /// The block's segments, in session order — the "what's coming" body.
    let segments: [WorkoutSegment]
    /// Whether stepping back to the previous block's preview is possible.
    let canGoBack: Bool
    let onEmpezar: () -> Void
    let onBack: () -> Void
    /// Leave the workout from the gate WITHOUT recording anything (clean discard).
    /// The athlete is never trapped on the "ready" screen.
    let onExit: () -> Void
    /// Abre la hoja de bloques del padre. Sin esto no se puede saltar el
    /// calentamiento desde la puerta.
    let alVerBloques: () -> Void

    // One displayable work line. An alternating EMOM expands to one row per
    // distinct movement in the rotation; everything else is one row per segment.
    private struct WorkRow: Identifiable {
        let id: Int
        let name: String
        let work: String?
    }

    private var workRows: [WorkRow] {
        var out: [WorkRow] = []
        for seg in segments {
            if seg.isEMOM, let plan = seg.emomPlan, plan.isAlternating {
                var seen = Set<String>()
                for itv in plan.intervals where !seen.contains(itv.movement) {
                    seen.insert(itv.movement)
                    let detail = [itv.work, itv.detail]
                        .compactMap { $0 }
                        .joined(separator: " · ")
                    out.append(WorkRow(id: out.count, name: itv.movement, work: detail.isEmpty ? nil : detail))
                }
            } else if seg.isConditioningTimer, seg.components.count > 1 {
                // A FOLDED multi-movement conditioning block (AMRAP / For Time /
                // Chipper / …): list each movement of the round, exactly as the
                // live FIXED HUD shows it.
                for comp in seg.components {
                    let detail = [comp.work, comp.detail]
                        .compactMap { $0 }
                        .joined(separator: " · ")
                    out.append(WorkRow(id: out.count, name: comp.name, work: detail.isEmpty ? nil : detail))
                }
            } else {
                out.append(WorkRow(id: out.count, name: seg.title, work: seg.previewWorkLine))
            }
        }
        return out
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                topRow
                header
                if formatLabel != nil || pacing != nil {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: Theme.Spacing.s) {
                            if let formatLabel {
                                Text(formatLabel)
                                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                                    .foregroundStyle(Theme.Color.accentText)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Theme.Color.accentText.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                            }
                            if let pacing { pacingBadge(pacing) }
                        }
                        // La palabra ya dice el qué; la frase dice el cómo, para
                        // que no haga falta deducirlo — es justo la deducción que
                        // le salió mal a Alex.
                        if let pacing {
                            Text(pacing.caption)
                                .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
                ScrollView { workList }
                    .layoutPriority(1)
                footer
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.l)
        }
        .transition(.opacity)
    }

    // Card 114 — el badge de circuito/seguido. Mismo idioma de pill que
    // `formatLabel` pero con su propio color, para que se distingan de un
    // vistazo aunque vayan pegados en la misma fila.
    private func pacingBadge(_ pacing: BlockPacing) -> some View {
        HStack(spacing: 5) {
            Image(systemName: pacing.icon)
                .font(.system(size: 11, weight: .heavy))
            Text(pacing.label)
                .font(.system(size: 13, weight: .heavy, design: .default).italic())
                .tracking(0.6)
        }
        .foregroundStyle(pacing.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(pacing.color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(pacing.label): \(pacing.caption)")
    }

    // MARK: Top row — back to previous block + position

    private var topRow: some View {
        HStack(spacing: Theme.Spacing.m) {
            // Exit (top-left): leave the workout without starting / recording
            // anything. Clean discard — the session stays pending.
            Button(action: { Haptics.light(); onExit() }) {
                ZStack {
                    Circle().fill(Theme.Color.surfaceElevated)
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
                .frame(width: 34, height: 34)
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Salir del entreno")
            BotonVerBloques(accion: alVerBloques)
            if canGoBack {
                Button(action: { Haptics.light(); onBack() }) {
                    ZStack {
                        Circle().fill(Theme.Color.surfaceElevated)
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    .frame(width: 34, height: 34)
                    .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Bloque anterior")
            }
            if blockCount > 1 {
                Text("BLOQUE \(blockNumber) DE \(blockCount)")
                    .font(.system(size: 11, weight: .heavy, design: .default).italic())
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Header — phase tag + block title

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let phaseTag {
                Text(phaseTag.uppercased())
                    .font(.system(size: 11, weight: .heavy, design: .default).italic())
                    .tracking(1.0)
                    .foregroundStyle(Theme.Color.accentText)
            }
            Text(title)
                .font(.system(size: 30, weight: .heavy, design: .default).italic())
                .tracking(Theme.Tracking.headline)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Work — the movements + targets coming up

    private var workList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "Lo que viene")
            CardSurface(padding: 0, leftAccent: true) {
                VStack(spacing: 0) {
                    if workRows.isEmpty {
                        emptyRow
                    } else {
                        ForEach(workRows) { row in
                            if row.id > 0 { Hairline() }
                            workRow(row)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func workRow(_ row: WorkRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle().fill(Theme.Color.accent.opacity(0.7)).frame(width: 6, height: 6)
                .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 3 }
            Text(row.name)
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.s)
            if let work = row.work {
                MonoText(text: work, size: 13, weight: .medium, color: Theme.Color.muted)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var emptyRow: some View {
        Text("Sin detalle — empieza cuando estés listo.")
            .scaledFont(13, relativeTo: .footnote)
            .foregroundStyle(Theme.Color.muted)
            .padding(14)
    }

    // MARK: Footer — the big "Empezar" gate

    private var footer: some View {
        VStack(spacing: Theme.Spacing.s) {
            Text("Empieza cuando estés listo")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
            ExpertPrimaryButton(title: "EMPEZAR", height: 64, action: onEmpezar)
        }
        .frame(maxWidth: .infinity)
    }
}
