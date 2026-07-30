import SwiftUI

// Reusable building blocks for the faithful iOS redesign (handoff:
// design_handoff_fhp/App Atleta - Flujo.dc.html). The screen agents COMPOSE
// these — they don't recreate them. Everything here is built on Theme tokens,
// our Fabrik orange (NOT the handoff red), and the SF type system; semantic
// data-viz colors (ok/warning/danger/info) stay semantic.
//
// Where a component reuses an existing atom (CardSurface, LabelText, MonoText,
// InstrumentReadout) it does so rather than duplicating. New components live
// here; shared primitives stay in Atoms.swift.

// MARK: - Session slot (AM / PM)

/// A session's time-of-day slot. The handoff badges AM in the modality accent
/// and PM in the partner/ergo blue — but slot color in our system follows the
/// session's MODALITY, not a fixed AM=orange/PM=blue rule. `SessionSlot` only
/// carries the label; callers pass the modality color separately.
enum SessionSlot: String, CaseIterable, Hashable {
    case am = "AM"
    case pm = "PM"

    var label: String { rawValue }
}

// MARK: - Modality dot

/// Small filled dot colored by modality — used in Plan day rows and compact
/// session rows. Decorative; callers provide an accessible label on the row.
struct ModalityDot: View {
    let modality: String?
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(Theme.Modality.color(modality))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Slot badge

/// The small rounded "AM" / "PM" badge from the handoff hero: a tinted chip
/// with the slot letters in the modality color over a sunken face.
struct SlotBadge: View {
    let slot: SessionSlot
    /// Modality color the badge tints to (defaults to brand accent).
    var color: Color = Theme.Color.accent

    /// The slot letters render as small TEXT, so a brand-orange modality color
    /// must use the text-safe role split (orange fails AA on the light sunken
    /// face). Other modality colors (info blue, foreground) are already AA. On
    /// dark, accentText == the brand orange, so dark is unchanged.
    private var textColor: Color {
        color == Theme.Color.accent ? Theme.Color.accentText : color
    }

    var body: some View {
        Text(slot.label)
            .font(.system(size: 10, weight: .heavy, design: .monospaced))
            .tracking(0.5)
            .foregroundStyle(textColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.Color.surfaceSunken)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
            .accessibilityLabel(slot == .am ? "Mañana" : "Tarde")
    }
}

// MARK: - Libre chip

/// Small accent chip marking an athlete-built "entreno libre" (no prescrito).
/// Mirrors `TestBadge`'s shape with the brand-accent text role (AA on both the
/// light + dark surfaces). Shown wherever a self-origin session is listed.
struct LibreBadge: View {
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "sparkle")
                .font(.system(size: compact ? 9 : 10, weight: .semibold))
            Text("Libre")
                .font(.system(size: compact ? 10 : 11, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(Theme.Color.accentText)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 2 : 3)
        .background(Theme.Color.accent.opacity(0.14))
        .clipShape(Capsule())
        .accessibilityLabel("Entreno libre")
    }
}

// MARK: - Session hero card

/// The Inicio hero: an elevated card with an orange top-edge accent, an AM/PM
/// badge + kicker, an italic-heavy title, a mono meta line, and a primary
/// "▶ Empezar" CTA. Mirrors the handoff hero (`#141A22`, 5px top accent) using
/// our layered surfaces and brand orange.
struct SessionHeroCard: View {
    let slot: SessionSlot
    /// Eyebrow, e.g. "Carrera · sesión principal".
    let kicker: String
    /// Italic-heavy session title, e.g. "Intervalos de umbral".
    let title: String
    /// Mono meta, e.g. "≈ 55 min · 3 bloques · 5×1000m @ 3:45/km".
    let meta: String
    /// Modality, used to tint the slot badge + accent.
    var modality: String? = nil
    var ctaTitle: String = "▶ Empezar"
    /// Marks an athlete-built "entreno libre" — adds the accent "Libre" chip.
    var isFree: Bool = false
    let onStart: () -> Void

    private var modalityColor: Color { Theme.Modality.color(modality) }

    var body: some View {
        CardSurface(padding: 18, topAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    SlotBadge(slot: slot, color: modalityColor)
                    LabelText(text: kicker)
                    if isFree { LibreBadge(compact: true) }
                    Spacer(minLength: 0)
                }
                Text(title)
                    .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                MonoText(text: meta, size: 13, weight: .medium, color: Theme.Color.muted)
                    .padding(.top, 5)
                ExpertPrimaryButton(title: ctaTitle, height: 50, action: onStart)
                    .padding(.top, 15)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Compact session row

/// The PM-style compact row from the handoff: a sunken row with a modality
/// slot badge, a title + meta, and a chevron. Tapping fires `onTap`.
struct SessionCompactRow: View {
    let slot: SessionSlot
    let title: String
    let meta: String
    var modality: String? = nil
    /// Marks an athlete-built "entreno libre" — adds the accent "Libre" chip.
    var isFree: Bool = false
    var onTap: (() -> Void)? = nil

    private var modalityColor: Color { Theme.Modality.color(modality) }

    var body: some View {
        Button {
            Haptics.light()
            onTap?()
        } label: {
            HStack(spacing: 12) {
                SlotBadge(slot: slot, color: modalityColor)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        if isFree { LibreBadge(compact: true) }
                    }
                    Text(meta)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 13)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(onTap == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(slot == .am ? "Mañana" : "Tarde"), \(title), \(meta)")
        .accessibilityAddTraits(onTap == nil ? [] : .isButton)
    }
}

// MARK: - AM/PM switcher

/// Discrete RPE picker 6–10 (the handoff's range). Selected value fills orange
/// with `accentOn` text; mono digits. One value active at a time.
struct RPESelector: View {
    @Binding var value: Int?
    var range: ClosedRange<Int> = 6...10

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(range), id: \.self) { n in
                let selected = value == n
                Button {
                    Haptics.light()
                    value = selected ? nil : n
                } label: {
                    Text("\(n)")
                        .font(.system(size: 16, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("RPE \(n)")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }
}

// MARK: - Benchmark bar row

/// A station-vs-benchmark row: label + horizontal bar + signed delta time.
/// Color follows the SIGN of the delta — better (negative seconds) = ok green,
/// slightly worse = warning amber, worse = danger red. The caller decides the
/// amber threshold; we expose `severity` so the data layer owns the rule.
struct BenchmarkBarRow: View {
    enum Severity { case better, slightlyWorse, worse }

    let label: String
    /// Bar fill fraction 0…1 (e.g. how far over/under benchmark, normalized).
    let fraction: Double
    /// Pre-formatted signed delta, e.g. "+0:42" / "−0:08".
    let delta: String
    let severity: Severity

    private var color: Color {
        switch severity {
        case .better: return Theme.Color.ok
        case .slightlyWorse: return Theme.Color.warning
        case .worse: return Theme.Color.danger
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Color.surfaceElevated)
                    Capsule()
                        .fill(color)
                        .frame(width: geo.size.width * CGFloat(max(0, min(1, fraction))))
                }
            }
            .frame(width: 84, height: 6)
            MonoText(text: delta, size: 11, weight: .bold, color: color)
                .frame(width: 44, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(delta)")
    }
}

/// The same row as `BenchmarkBarRow` for a station whose placing within the field
/// is UNKNOWN: label, the athlete's real time, and the personal delta when there
/// is one — but no bar and no colour verdict. Lives here, beside its sibling, so
/// no surface is ever tempted to draw a half-full bar to fill the gap
/// (docs/CONTRATO-UI.md §7).
struct StationTimeRow: View {
    let label: String
    /// Pre-formatted time, e.g. "4:55". Nil when the station has no time.
    let time: String?
    /// Pre-formatted signed delta vs the athlete's trained level, e.g. "+0:42".
    let delta: String?

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            // El dato pesa más que su etiqueta (contrato §4): la hora va por
            // encima de los 12 pt del rótulo, y el delta secundario por debajo.
            // Sin tiempo y sin delta NO se pinta nada: esta fila nació justamente
            // para no rellenar un hueco con media barra (§7), y lo estaba
            // rellenando con dos guiones. El ancho fijo del delta se queda para
            // que las filas de al lado sigan cuadrando.
            if let time {
                MonoText(text: time, size: 13, weight: .bold, color: Theme.Color.foreground)
            }
            if let delta {
                MonoText(text: delta, size: 11, weight: .bold, color: Theme.Color.faint)
                    .frame(width: 44, alignment: .trailing)
            } else {
                Color.clear.frame(width: 44, height: 1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(time ?? "sin tiempo")")
    }
}

// MARK: - Pace bar chart

/// A row of N vertical bars (per-km splits) with per-bar color. Bars are simple
/// Theme-styled rects; height encodes relative pace. The data layer supplies
/// each bar's normalized height (0…1) and severity color.
struct PaceBarChart: View {
    struct Bar: Identifiable {
        let id = UUID()
        /// Normalized height 0…1.
        let height: Double
        let severity: BenchmarkBarRow.Severity
        /// Optional axis label under the bar (e.g. "k1").
        var label: String? = nil
    }

    let bars: [Bar]
    var maxHeight: CGFloat = 80

    private func color(_ s: BenchmarkBarRow.Severity) -> Color {
        switch s {
        case .better: return Theme.Color.ok
        case .slightlyWorse: return Theme.Color.warning
        case .worse: return Theme.Color.danger
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(bars) { bar in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(color(bar.severity))
                        .frame(maxWidth: .infinity)
                        .frame(height: max(4, maxHeight * CGFloat(max(0, min(1, bar.height)))))
                }
            }
            .frame(height: maxHeight, alignment: .bottom)
            if bars.contains(where: { $0.label != nil }) {
                HStack(spacing: 6) {
                    ForEach(bars) { bar in
                        Text(bar.label ?? "")
                            .font(.system(size: 9, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.faint)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Publish notice row

/// A circular avatar showing an initial over the chip surface. Used by the
/// publish notice, coach note row, and chat header. Falls back to a person
/// glyph when `initials` is empty.
struct CoachAvatar: View {
    let initials: String
    var size: CGFloat = 34
    var tint: Color = Theme.Color.accent

    /// The initials / person glyph are GLYPHS over the (white-in-light) elevated
    /// face, so a brand-orange tint must use the text-safe role split (orange
    /// only reaches ~3:1 on white). Non-orange tints pass through unchanged.
    private var glyphTint: Color {
        tint == Theme.Color.accent ? Theme.Color.accentText : tint
    }

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.surfaceElevated)
            if initials.isEmpty {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(glyphTint)
            } else {
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .heavy))
                    .foregroundStyle(glyphTint)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

// MARK: - Technique video placeholder

/// Striped/hatched rounded rect with a play glyph for a technique video.
/// Renders ONLY when a video is available; when none exists it renders NOTHING
/// (no "coming soon" placeholder — App Store 2.1 forbids placeholder content).
/// (No real player wired yet — BACKEND GAP: technique video URLs.)
struct TechniqueVideoPlaceholder: View {
    var title: String = "Técnica"
    var available: Bool = false

    var body: some View {
        if available {
            ZStack {
                // Diagonal hatch over a sunken face.
                DiagonalHatch()
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                    .background(Theme.Color.surfaceSunken)
                VStack(spacing: 8) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text(title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(height: 120)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Vídeo de técnica: \(title)")
        }
    }
}

/// Repeating 45° hatch lines used by the technique-video placeholder.
private struct DiagonalHatch: Shape {
    var spacing: CGFloat = 12
    func path(in rect: CGRect) -> Path {
        var path = Path()
        var x = -rect.height
        while x < rect.width {
            path.move(to: CGPoint(x: x, y: rect.height))
            path.addLine(to: CGPoint(x: x + rect.height, y: 0))
            x += spacing
        }
        return path
    }
}

// MARK: - Chat bubble

// MARK: - Dismissable sheet chrome
//
// A CONSISTENT escape for modally-presented content that would otherwise rely
// only on the easy-to-miss swipe-down — informational sheets with no nav bar of
// their own (the "cómo se construye tu plan" / coach / legal cards, the morning
// check-in). It wraps the content in the SAME chrome the rest of the app's
// sheets already use: a NavigationStack with an inline top-leading "Cerrar"
// bound to the environment dismiss, so every modal exits the same, findable way.
//
// The dismiss is read where the modifier is APPLIED (the sheet's content root,
// OUTSIDE the NavigationStack this introduces), so calling it closes the
// presentation — mirroring how DoblesPlanView dismisses its own cover.
extension View {
    /// Adds the app's standard top-leading "Cerrar" affordance to modal content
    /// that has no toolbar / nav bar of its own. Pass a custom `closeTitle` only
    /// when "Cerrar" doesn't fit the context.
    func dismissableSheet(closeTitle: String = "Cerrar") -> some View {
        modifier(DismissableSheetModifier(closeTitle: closeTitle))
    }
}

private struct DismissableSheetModifier: ViewModifier {
    let closeTitle: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(closeTitle) {
                            Haptics.light()
                            dismiss()
                        }
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityLabel("Cerrar")
                    }
                }
        }
    }
}
