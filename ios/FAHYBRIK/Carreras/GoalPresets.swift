import SwiftUI

// Objetivo por rangos — the way athletes actually talk about a HYROX finish
// (sub-60 / sub-70 / sub-80 / sub-90) instead of dialing an exact clock. Each
// preset maps to `goal_time_seconds` (the SAME field the exact wheels write —
// zero server change); "Acabarla bien" is the no-clock first-race choice → nil.
//
// Single source of truth for the objective selector on EVERY surface (Carreras
// · Fijar objetivo, Carreras · Tu tiempo objetivo, onboarding · Tu objetivo) so the
// rungs and their mapping can never drift between screens. Espejo de `meta.tsx`.

/// The four HYROX finish-time rungs. Raw value = the goal time in seconds, so the
/// enum IS its own mapping (Sub-60 → 3600 … Sub-90 → 5400) and a stored goal time
/// can be matched straight back to its rung for pre-selection.
enum GoalPreset: Int, CaseIterable, Identifiable {
    case sub60 = 3600
    case sub70 = 4200
    case sub80 = 4800
    case sub90 = 5400

    var id: Int { rawValue }

    /// The `goal_time_seconds` this rung submits.
    var seconds: Int { rawValue }

    /// "Sub-60" … "Sub-90" — the big italic chip title. Es la MISMA palabra con que se dice una meta
    /// en el póster y en las tarjetas (`Formato.metaDeCarrera`): una sola grafía.
    var title: String { Formato.metaDeCarrera(rawValue) ?? "Sub-\(rawValue / 60)" }

    /// The small qualifier under the title (élite / avanzado / top 25% / la referencia).
    var descriptor: String {
        switch self {
        case .sub60: return "élite"
        case .sub70: return "avanzado"
        case .sub80: return "top 25%"
        case .sub90: return "la referencia"
        }
    }

    /// Which rung a stored goal time exactly matches, if any — so re-opening the
    /// selector pre-selects the chip (and a non-rung exact time falls to the
    /// "tiempo exacto" fallback instead of silently matching nothing).
    static func matching(_ seconds: Int?) -> GoalPreset? {
        guard let seconds else { return nil }
        return allCases.first { $0.seconds == seconds }
    }
}

/// The athlete's objective choice across the selector: a finish-time rung, the
/// no-clock "Acabarla bien", or the exact-time fallback (wheels / text field, the
/// host screen supplies its own). `nil` = nothing chosen yet (submits no goal).
enum GoalChoice: Equatable {
    case preset(GoalPreset)
    case finish
    case exact
}

/// Un tiempo exacto partido en horas, minutos y segundos: lo que giran las tres ruedas.
struct TiempoExacto: Equatable {
    var h = 1
    var m = 0
    var s = 0

    var segundos: Int { h * 3600 + m * 60 + s }

    init(h: Int = 1, m: Int = 0, s: Int = 0) {
        self.h = h
        self.m = m
        self.s = s
    }

    init(segundos: Int) {
        self.init(h: segundos / 3600, m: (segundos % 3600) / 60, s: segundos % 60)
    }
}

extension GoalChoice {
    /// La meta en segundos de una elección; «acabarla bien» y «nada elegido» son sin reloj.
    static func metaS(_ eleccion: GoalChoice?, tiempo: TiempoExacto) -> Int? {
        switch eleccion {
        case .preset(let p): return p.seconds
        case .exact: return tiempo.segundos > 0 ? tiempo.segundos : nil
        case .finish, nil: return nil
        }
    }

    /// Qué elección corresponde a una meta ya guardada: su peldaño si lo es, el tiempo exacto si no.
    /// Sin meta no hay nada elegido y las ruedas parten de 1 h.
    static func desde(metaS: Int?) -> (eleccion: GoalChoice?, tiempo: TiempoExacto) {
        guard let metaS, metaS > 0 else { return (nil, TiempoExacto()) }
        return (GoalPreset.matching(metaS).map { .preset($0) } ?? .exact, TiempoExacto(segundos: metaS))
    }
}

// MARK: - Chip

/// One objective chip — a big italic title over a small uppercase qualifier.
/// Selected fills the club accent with `accentOn` text (the app's accent-on-fill
/// pattern, shared with the segmented selectors). Used both in the 2-up rung
/// grid and as the full-width "Acabarla bien" chip.
struct GoalPresetChip: View {
    let title: String
    let descriptor: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            guard !selected else { return }
            Haptics.light()
            action()
        } label: {
            VStack(spacing: 2) {
                Text(title)
                    .papel(.seccion)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(descriptor)
                    .papel(.etiqueta)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 72)
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 10)
            .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                    .strokeBorder(selected ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(descriptor)")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Rung grid

/// The 2-up grid of the four finish-time rungs, bound to a `GoalChoice`. Kept as
/// one component so every host screen renders identical rungs; each host adds its
/// own "Acabarla bien" chip (only where a finish goal is distinct) and its own
/// exact-time fallback (`MetaSelectorCarreras` does it for Carreras).
struct GoalPresetGrid: View {
    @Binding var choice: GoalChoice?

    private let columns = [
        GridItem(.flexible(), spacing: Theme.Spacing.m - 2),
        GridItem(.flexible(), spacing: Theme.Spacing.m - 2),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: Theme.Spacing.m - 2) {
            ForEach(GoalPreset.allCases) { preset in
                GoalPresetChip(
                    title: preset.title,
                    descriptor: preset.descriptor,
                    selected: choice == .preset(preset)
                ) {
                    choice = .preset(preset)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tu tiempo objetivo")
    }
}

// MARK: - Exact-time reveal link

/// The "Prefiero un tiempo exacto…" secondary affordance that drops the exact
/// wheels/field. The host toggles its `choice` to `.exact` and renders its own picker.
struct GoalExactLink: View {
    let action: () -> Void

    var body: some View {
        BotonTextoDia("Prefiero un tiempo exacto…", centrado: true, accion: action)
    }
}

// MARK: - El selector completo de Carreras

/// «¿A qué vas?»: cómo habla un atleta de HYROX (sub-60, sub-70…) en vez de marcar un reloj, con
/// «Acabarla bien» para la primera carrera sin reloj y el tiempo exacto como salida discreta. UNA pieza
/// para las dos hojas donde se elige (fijar una carrera nueva, cambiar el tiempo de una ya fijada).
/// Todo se resuelve al MISMO campo: la meta en segundos (o nada). Sin HYROX no hay peldaños de HYROX:
/// solo «sin tiempo» y el exacto.
struct MetaSelectorCarreras: View {
    let esHyrox: Bool
    @Binding var eleccion: GoalChoice?
    @Binding var tiempo: TiempoExacto

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if esHyrox { GoalPresetGrid(choice: $eleccion) }
            GoalPresetChip(
                title: esHyrox ? "Acabarla bien" : "Sin tiempo objetivo",
                descriptor: esHyrox ? "primera carrera · sin reloj" : "solo fecha y tipo",
                selected: eleccion == .finish
            ) {
                eleccion = .finish
            }
            if case .exact = eleccion {
                RuedasDeTiempoCarreras(tiempo: $tiempo)
            } else {
                GoalExactLink {
                    withAnimation(.easeOut(duration: 0.18)) { eleccion = .exact }
                }
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
private struct MetaSelectorPreview: View {
    @State private var eleccion: GoalChoice? = .preset(.sub90)
    @State private var tiempo = TiempoExacto()
    let esHyrox: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SubtituloDia("¿A qué vas?")
            MetaSelectorCarreras(esHyrox: esHyrox, eleccion: $eleccion, tiempo: $tiempo)
        }
        .padding(Theme.Spacing.pantalla)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.background)
    }
}

#Preview("Meta · HYROX") { MetaSelectorPreview(esHyrox: true) }
#Preview("Meta · otra carrera") { MetaSelectorPreview(esHyrox: false) }
#endif
