import SwiftUI

// "Mis zonas" — the athlete sees their OWN absolute pace bands per modality,
// the same way the coach's calculator shows them. Powered by GET
// /api/athlete/zones (read-only). AGNOSTIC: zone codes, labels and colours all
// come from the coach's stored snapshot, so this view renders whatever scheme
// the coach uses — it never hardcodes a zone count or palette.
//
// Honest states: a spinner while loading, a clear empty state when the athlete
// hasn't tested yet (no zones to show, no fabricated bands), and an error state
// with a retry when the fetch fails. The test that produced a profile is
// surfaced (name + date) — a NOTE here because there is no dedicated athlete
// test-history endpoint yet (see backend gap).
struct MyZonesView: View {
    let bearer: String?

    @State private var modalities: [ZoneModalityProfile] = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Mis zonas")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(Theme.Color.accentText)
        } else if failed {
            errorState
        } else if modalities.isEmpty {
            emptyState
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    intro
                    ForEach(modalities) { modality in
                        modalityCard(modality)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
    }

    // MARK: - Intro

    private var intro: some View {
        Text("Tus bandas de ritmo por modalidad. Cuando un entreno te pide una zona, este es el ritmo real que te toca.")
            .scaledFont(13, relativeTo: .footnote)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Modality card

    private func modalityCard(_ m: ZoneModalityProfile) -> some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                // Header: modality + pace unit, with the source test/date below.
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(m.modalityLabel)
                            .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer(minLength: 8)
                        Text(m.paceUnitLabel)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    if let sub = sourceSubtitle(m) {
                        Text(sub)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 13)
                .padding(.bottom, 11)

                ForEach(Array(m.zones.enumerated()), id: \.element.id) { idx, band in
                    if idx > 0 { Hairline() }
                    zoneRow(band)
                }
            }
        }
    }

    /// "Test umbral · 20 jun 2026" — only the parts genuinely present.
    private func sourceSubtitle(_ m: ZoneModalityProfile) -> String? {
        var parts: [String] = []
        if let threshold = m.thresholdLabel { parts.append("umbral \(threshold)") }
        if let date = m.recordedDateLabel { parts.append(date) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func zoneRow(_ band: ZoneBand) -> some View {
        HStack(spacing: 12) {
            // Colour swatch from the coach's stored zone hex (agnostic). Falls
            // back to a neutral chip when no colour is stored.
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color(zoneHex: band.color) ?? Theme.Color.faint)
                .frame(width: 4, height: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(band.code)
                    .scaledFont(13, weight: .bold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(band.label)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(band.rangeLabel)
                .font(.system(size: 13, weight: .semibold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(band.code), \(band.label), \(band.rangeLabel)")
    }

    // MARK: - Empty / error states

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "speedometer")
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text("Aún no tienes zonas")
                .scaledFont(16, weight: .bold, relativeTo: .headline)
                .foregroundStyle(Theme.Color.foreground)
            Text("Cuando completes un test de ritmo, tu coach calculará tus bandas y aparecerán aquí.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    private var errorState: some View {
        VStack(spacing: 10) {
            Text("No pudimos cargar tus zonas")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
            Button("Reintentar") { Task { await load() } }
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.accentText)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    // MARK: - Load

    private func load() async {
        guard let bearer else { loading = false; failed = true; return }
        loading = true
        failed = false
        do {
            modalities = try await ZonesService.fetch(bearer: bearer)
        } catch {
            failed = true
        }
        loading = false
    }
}

// Minimal hex → Color for backend-supplied zone colours (agnostic, coach data).
// File-private so it never collides with a broader app-wide colour utility.
// Accepts "#RRGGBB" / "RRGGBB" / "#RGB"; returns nil on anything else so callers
// fall back to a neutral swatch rather than rendering a wrong colour.
private extension Color {
    init?(zoneHex: String?) {
        guard var hex = zoneHex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
