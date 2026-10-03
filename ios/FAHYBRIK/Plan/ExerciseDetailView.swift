import SwiftUI

// MARK: - Exercise detail sheet
//
// Opened from a tapped `WorkoutItemRow` inside the session detail. Shows the
// exercise's in-app demo (never Safari) — el enlace de YouTube del coach o el
// fichero que ha subido él, indistintamente: quien lo decide es `VideoDeTecnica`,
// aquí sólo se monta. Además, sus params prescritos para este bloque, consejos y
// descripción larga.
//
// Honest empties: no video → no player (no fake placeholder); no
// cues/description → that section is simply absent. The exercise description
// (`exerciseDescription`) is not yet shipped by the assignment-detail backend
// — it decodes nil and this view degrades to cues-only until it lands.

struct ExerciseDetailView: View {
    let item: WorkoutItem

    @Environment(\.dismiss) private var dismiss

    private var video: VideoDeTecnica? { VideoDeTecnica(item.exerciseVideoUrl) }

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
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                cromo
                ScrollView { columna }
            }
        }
        .presentationDragIndicator(.visible)
    }

    /// Lo que se scrollea: la ficha del ejercicio. Vive aparte del `ScrollView` para poder dibujarse tal cual
    /// en una prueba (el `ImageRenderer` no pinta un `ScrollView`).
    var columna: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            header

            if let video {
                VideoDeTecnicaPlayer(video: video)
                    .accessibilityLabel("Vídeo demostración de \(item.exerciseName)")
            }

            prescriptionSection

            if let cues = item.cues, !cues.isEmpty {
                section(title: "Consejos") {
                    Text(cues)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if let description = item.exerciseDescription, !description.isEmpty {
                section(title: "Descripción") {
                    Text(description)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if let notes = item.notaDelCoach {
                section(title: "Nota de tu coach") {
                    NotaDelCoachEjercicio(texto: notes)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    /// La línea de arriba de una hoja: qué clase de ejercicio es y la salida. Sin barra de navegación del
    /// sistema: la hoja del día lleva el mismo cromo que las pestañas.
    private var cromo: some View {
        HStack(spacing: Theme.Spacing.s) {
            EtiquetaDeModalidad(categoria: item.exerciseCategory)
            Spacer(minLength: Theme.Spacing.s)
            BotonCromoDia(.cerrar, etiqueta: "Cerrar") { Haptics.light(); dismiss() }
        }
        .padding(.leading, Theme.Spacing.pantalla)
        .padding(.trailing, Theme.Spacing.s)
        .frame(minHeight: 56)
    }

    // PRESCRIPCIÓN — prefers the structured per-set prescription:
    //   · strength pyramid → a per-set table (set#, reps, load, tempo, rest);
    //   · uniform strength → a collapsed "N× …" line;
    //   · run/ergo/functional/… → a modality summary line;
    //   · legacy items (no structured prescription) → the scalar param summary.
    @ViewBuilder
    private var prescriptionSection: some View {
        if let rows = setRows, !rows.isEmpty {
            section(title: "Prescripción") {
                VStack(alignment: .leading, spacing: 10) {
                    if let collapsed = collapsedSets {
                        Text(collapsed).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
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
            section(title: "Prescripción") {
                Text(line).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else if let summary = paramsSummary {
            section(title: "Prescripción") {
                Text(summary).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // "Según tu 1RM · 52–64 kg" — the resolved absolute load beside the %.
    private func resolvedLoadChip(_ rl: ResolvedLoad) -> some View {
        // Con texto grande la carga pasa DEBAJO de su etiqueta: a tamaño accesible una fila no cabe.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.s) { cargaResuelta(rl) }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) { cargaResuelta(rl) }
        }
    }

    @ViewBuilder
    private func cargaResuelta(_ rl: ResolvedLoad) -> some View {
        Text("Según tu 1RM")
            .papel(.notaFuerte)
            .foregroundStyle(Theme.Color.muted)
        Text(rl.kgLabel)
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.accentText)
        if rl.needsReview {
            Text("sin confirmar")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// La tabla de series. Una `Grid`, no columnas de ancho fijo: cada columna mide lo que su contenido pide y
    /// el texto no se encoge por debajo del suelo (con texto grande, la celda se parte en dos líneas). `nil`
    /// = ese set no declara ese campo, y entonces la celda se queda VACÍA: la columna sigue alineada, pero no
    /// se pinta un guion que se lee como si fuera el valor (§7).
    private func setTable(_ rows: [PrescriptionRenderer.SetRow]) -> some View {
        let showTempo = rows.contains { $0.tempo != nil }
        let showRest = rows.contains { $0.rest != nil }
        return Grid(alignment: .leading, horizontalSpacing: Theme.Spacing.l, verticalSpacing: Theme.Spacing.m) {
            GridRow {
                cabeceraDeSerie("Set")
                cabeceraDeSerie("Reps")
                cabeceraDeSerie("Carga")
                if showTempo { cabeceraDeSerie("Tempo") }
                if showRest { cabeceraDeSerie("Desc.") }
            }
            // Una vista suelta dentro de la `Grid` ocupa todas las columnas: el filete bajo la cabecera.
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            ForEach(rows) { row in
                GridRow {
                    celdaDeSerie("\(row.index)", color: Theme.Color.muted)
                    celdaDeSerie(row.work)
                    celdaDeSerie(row.load, color: Theme.Color.accentText)
                    if showTempo { celdaDeSerie(row.tempo, color: Theme.Color.muted) }
                    if showRest { celdaDeSerie(row.rest, color: Theme.Color.muted) }
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
    }

    private func cabeceraDeSerie(_ texto: String) -> some View {
        Text(texto)
            .papel(.rotulo)
            .foregroundStyle(Theme.Color.muted)
    }

    private func celdaDeSerie(_ texto: String?, color: Color = Theme.Color.foreground) -> some View {
        Text(texto ?? "")
            .papel(.notaPesada)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var header: some View {
        Text(item.exerciseName)
            .papel(.saludo)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(title)
            content()
        }
    }
}

// MARK: - Las piezas de la hoja de técnica

/// La modalidad del ejercicio dicha con palabras y con su color: el punto es el de la modalidad en todo el
/// Plan (`Theme.Modality`), y la palabra sale del MISMO sitio, así que un punto no puede desviarse de la
/// palabra que lo nombra. Sustituye a las siglas («STR», «FUNC») de una etiqueta que nadie del box lee.
struct EtiquetaDeModalidad: View {
    let categoria: String

    var body: some View {
        let clase = Theme.Modality.kind(categoria)
        HStack(spacing: Theme.Spacing.s) {
            Circle().fill(clase.color).frame(width: 10, height: 10)
                .accessibilityHidden(true)
            Text(clase.label.prefix(1).uppercased() + clase.label.dropFirst())
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// La nota que el coach dejó en este ejercicio: su voz, marcada con su filo de acento (el mismo que la línea
/// del coach en la cabecera de la semana; el sistema no escribe aquí).
private struct NotaDelCoachEjercicio: View {
    let texto: String

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Theme.Color.accent)
                .frame(width: 3)
            Text(texto)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
