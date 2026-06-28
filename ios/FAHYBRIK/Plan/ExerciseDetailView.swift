import SwiftUI

// MARK: - Exercise detail sheet
//
// Opened from a tapped `WorkoutItemRow` inside the session detail. Shows the
// exercise's in-app YouTube demo (never Safari), its prescribed params for
// this block, cues and long-form description.
//
// Honest empties: no video → no player (no fake placeholder); no
// cues/description → that section is simply absent. The exercise description
// (`exerciseDescription`) is not yet shipped by the assignment-detail backend
// — it decodes nil and this view degrades to cues-only until it lands.

struct ExerciseDetailView: View {
    let item: WorkoutItem

    @Environment(\.dismiss) private var dismiss

    private var videoId: String? {
        guard let url = item.exerciseVideoUrl else { return nil }
        return YouTubeLinkParser.videoId(from: url)
    }

    // Legacy single-line summary, used only when the item carries no structured
    // prescription (or a structured prescription with no usable detail).
    private var paramsSummary: String? {
        WorkoutItemParamsFormatter.summary(item.paramsJson, category: item.exerciseCategory)
    }

    // Structured per-set rows for a strength prescription (pyramid → one row/set,
    // uniform → collapsed line). Nil for non-strength / no structured sets.
    private var setRows: [PrescriptionRenderer.SetRow]? {
        guard let p = item.prescription,
              p.modality == .strength || (p.modality == nil && item.exerciseCategory.lowercased() == "strength")
        else { return nil }
        return PrescriptionRenderer.setRows(p)
    }

    private var collapsedSets: String? {
        guard let p = item.prescription, setRows != nil,
              PrescriptionRenderer.setsAreUniform(p)
        else { return nil }
        return PrescriptionRenderer.collapsedSetsLabel(p)
    }

    // A modality summary line for non-strength items, built from the structured
    // prescription when present.
    private var structuredLine: String? {
        guard let p = item.prescription, setRows == nil else { return nil }
        let line = PrescriptionRenderer.summaryLine(p)
        var parts: [String] = []
        if let h = line.headline { parts.append(h) }
        if let pace = line.pace { parts.append(pace) }
        if let z = line.zone { parts.append(z.label) }
        // Backend-resolved absolute pace band for a zone target (the athlete's
        // own zones → "4:00–4:14/km"). Only present when the line targets a zone
        // and the athlete has tested that modality; never fabricated.
        if let ri = item.resolvedIntensity {
            parts.append(ri.rangeLabel)
            if ri.needsReview { parts.append("sin confirmar") }
        }
        if let det = line.detail { parts.append(det) }
        // Backend-resolved %RM→kg for a non-strength card carrying a %RM target.
        if let rl = item.resolvedLoad {
            parts.append(rl.kgLabel)
            if rl.needsReview { parts.append("sin confirmar") }
        }
        if let header = PrescriptionRenderer.wodHeader(p) { parts.insert(header, at: 0) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        header

                        if let videoId {
                            YouTubeEmbedView(videoId: videoId)
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                                .accessibilityLabel("Vídeo demostración de \(item.exerciseName)")
                        }

                        prescriptionSection

                        if let cues = item.cues, !cues.isEmpty {
                            section(title: "CONSEJOS") {
                                Text(cues)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                        }

                        if let description = item.exerciseDescription, !description.isEmpty {
                            section(title: "DESCRIPCIÓN") {
                                Text(description)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                        }

                        if let notes = item.notes, !notes.isEmpty {
                            section(title: "NOTA DE PABLO") {
                                Text(notes)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // PRESCRIPCIÓN — prefers the structured per-set prescription:
    //   · strength pyramid → a per-set table (set#, reps, load, tempo, rest);
    //   · uniform strength → a collapsed "N× …" line;
    //   · run/ergo/functional/… → a modality summary line;
    //   · legacy items (no structured prescription) → the scalar param summary.
    @ViewBuilder
    private var prescriptionSection: some View {
        if let rows = setRows, !rows.isEmpty {
            section(title: "PRESCRIPCIÓN") {
                VStack(alignment: .leading, spacing: 10) {
                    if let collapsed = collapsedSets {
                        MonoText(text: collapsed, size: 15, color: Theme.Color.foreground)
                    } else {
                        setTable(rows)
                    }
                    // Backend-resolved absolute load (the line's %RM × the athlete's
                    // own 1RM). Only present when the lift is tracked AND the athlete
                    // has a 1RM — never a fabricated kg.
                    if let rl = item.resolvedLoad {
                        resolvedLoadChip(rl)
                    }
                }
            }
        } else if let line = structuredLine {
            section(title: "PRESCRIPCIÓN") {
                MonoText(text: line, size: 15, color: Theme.Color.foreground)
            }
        } else if let summary = paramsSummary {
            section(title: "PRESCRIPCIÓN") {
                MonoText(text: summary, size: 15, color: Theme.Color.foreground)
            }
        }
    }

    // "Según tu 1RM · 52–64 kg" — the resolved absolute load beside the %.
    private func resolvedLoadChip(_ rl: ResolvedLoad) -> some View {
        HStack(spacing: 8) {
            Text("Según tu 1RM")
                .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
            MonoText(text: rl.kgLabel, size: 14, weight: .semibold, color: Theme.Color.accentText)
            if rl.needsReview {
                Text("sin confirmar")
                    .scaledFont(10, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: 0)
        }
    }

    private func setTable(_ rows: [PrescriptionRenderer.SetRow]) -> some View {
        let showTempo = rows.contains { $0.tempo != nil }
        let showRest = rows.contains { $0.rest != nil }
        return CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    detailSetHeader("SET", width: 40)
                    detailSetHeader("REPS", width: 56)
                    detailSetHeader("CARGA")
                    if showTempo { detailSetHeader("TEMPO", width: 64) }
                    if showRest { detailSetHeader("DESC.", width: 52) }
                }
                .padding(.vertical, 8)
                .background(Theme.Color.surfaceSunken)
                .overlay(alignment: .bottom) { Hairline() }
                ForEach(rows) { row in
                    if row.id > 0 { Hairline() }
                    HStack(spacing: 0) {
                        detailSetCell("\(row.index)", width: 40, color: Theme.Color.faint)
                        detailSetCell(row.work, width: 56)
                        detailSetCell(row.load ?? "—", color: row.load != nil ? Theme.Color.accentText : Theme.Color.faint)
                        if showTempo { detailSetCell(row.tempo ?? "—", width: 64, color: row.tempo != nil ? Theme.Color.muted : Theme.Color.faint) }
                        if showRest { detailSetCell(row.rest ?? "—", width: 52, color: row.rest != nil ? Theme.Color.muted : Theme.Color.faint) }
                    }
                    .padding(.vertical, 10)
                }
            }
        }
    }

    @ViewBuilder
    private func detailSetHeader(_ text: String, width: CGFloat? = nil) -> some View {
        let label = Text(text)
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 10)
        if let width { label.frame(width: width, alignment: .leading) }
        else { label.frame(maxWidth: .infinity, alignment: .leading) }
    }

    @ViewBuilder
    private func detailSetCell(_ text: String, width: CGFloat? = nil, color: Color = Theme.Color.foreground) -> some View {
        let cell = Text(text)
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 10)
        if let width { cell.frame(width: width, alignment: .leading) }
        else { cell.frame(maxWidth: .infinity, alignment: .leading) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            CategoryTag(category: item.exerciseCategory)
            Text(item.exerciseName)
                .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: title, color: Theme.Color.accentText)
            content()
        }
    }
}
