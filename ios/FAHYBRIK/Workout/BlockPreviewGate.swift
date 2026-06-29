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
// Rendered full-screen over the live HUD by ActiveWorkoutView. Reuses the shared
// Theme atoms + PrescriptionRenderer-backed `WorkoutSegment.previewWorkLine`, so
// the work reads exactly like the pre-workout brief and the live HUD.
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
    /// The block's segments, in session order — the "what's coming" body.
    let segments: [WorkoutSegment]
    /// Whether stepping back to the previous block's preview is possible.
    let canGoBack: Bool
    let onEmpezar: () -> Void
    let onBack: () -> Void
    /// Leave the workout from the gate WITHOUT recording anything (clean discard).
    /// The athlete is never trapped on the "ready" screen.
    let onExit: () -> Void

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
                    let detail = [itv.work != "—" ? itv.work : nil, itv.detail]
                        .compactMap { $0 }
                        .joined(separator: " · ")
                    out.append(WorkRow(id: out.count, name: itv.movement, work: detail.isEmpty ? nil : detail))
                }
            } else if seg.isConditioningTimer, seg.components.count > 1 {
                // A FOLDED multi-movement conditioning block (AMRAP / For Time /
                // Chipper / …): list each movement of the round, exactly as the
                // live FIXED HUD shows it.
                for comp in seg.components {
                    let detail = [comp.work != "—" ? comp.work : nil, comp.detail]
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
                if let formatLabel {
                    Text(formatLabel)
                        .font(.system(size: 13, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Theme.Color.accentText.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
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
