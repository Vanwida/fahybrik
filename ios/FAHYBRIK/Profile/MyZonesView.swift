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
    @State private var showRegister = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Mis zonas")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showRegister = true
                } label: {
                    Label("Registrar test", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .accessibilityLabel("Registrar un test")
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterTestView(bearer: bearer) { await load() }
        }
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
        CenteredScreen {
            RedesignEmptyState(
                symbol: "speedometer",
                title: "Aún no tienes zonas",
                message: "Registra un test de ritmo (o pídeselo a tu coach) y calcularemos tus bandas al momento.",
                exit: .action(title: "Registrar test") { showRegister = true }
            )
        }
    }

    private var errorState: some View {
        CenteredScreen {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tus zonas",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar") { Task { await load() } }
            )
        }
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

// "Registrar test" — the athlete self-enters a test result, which the backend
// resolves into zone bands through the SAME path the coach uses (source =
// athlete_test). On success the parent re-fetches so "Mis zonas" reflects it.
// The pace unit is intrinsic to the modality (run → /km, ergo → /500m), so the
// athlete only picks the modality and types the umbral pace — never a unit.
struct RegisterTestView: View {
    let bearer: String?
    /// Called after a successful save so the host can re-fetch the zones.
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var modality: String = "run"
    @State private var thresholdSeconds: Int? = nil
    @State private var saving = false
    @State private var errorText: String? = nil

    // run → /km; row/ski/bike → /500m. Mirrors paceUnitForModality on the backend.
    private static let modalities: [(key: String, label: String)] = [
        ("run", "Carrera"), ("row", "Remo"), ("ski", "Ski-Erg"), ("bike", "Bike-Erg"),
    ]
    private var paceUnitLabel: String { modality == "run" ? "/km" : "/500m" }
    private var canSave: Bool { (thresholdSeconds ?? 0) > 0 && !saving }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    // Modality
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        Text("Modalidad")
                            .font(Theme.Typography.dataLabel)
                            .uppercaseTracked()
                            .foregroundStyle(Theme.Color.muted)
                        HStack(spacing: 6) {
                            ForEach(Self.modalities, id: \.key) { m in
                                Button {
                                    modality = m.key
                                    Haptics.light()
                                } label: {
                                    Text(m.label)
                                        .scaledFont(12, weight: .semibold, relativeTo: .caption)
                                        .foregroundStyle(modality == m.key ? Theme.Color.accentOn : Theme.Color.foreground)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 9)
                                        .background(modality == m.key ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(m.label)
                                .accessibilityAddTraits(modality == m.key ? .isSelected : [])
                            }
                        }
                    }

                    // Threshold pace
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        Text("Resultado del test")
                            .font(Theme.Typography.dataLabel)
                            .uppercaseTracked()
                            .foregroundStyle(Theme.Color.muted)
                        VStack(spacing: 0) {
                            TimeMinSecRow(label: "Ritmo umbral (\(paceUnitLabel))", seconds: $thresholdSeconds)
                        }
                        .brandSurface()
                        Text("Tu ritmo medio sostenible en el test (umbral). Con él calculamos tus 6 bandas.")
                            .scaledFont(12, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let errorText {
                        Text(errorText)
                            .scaledFont(12, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Registrar test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .safeAreaInset(edge: .bottom) {
                ExpertPrimaryButton(
                    title: saving ? "GUARDANDO…" : "GUARDAR TEST",
                    height: 46,
                    enabled: canSave,
                    action: save
                )
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
            }
        }
    }

    private func save() {
        guard let bearer, let seconds = thresholdSeconds, seconds > 0, !saving else { return }
        saving = true
        errorText = nil
        Task {
            do {
                try await ZonesService.submitTest(modality: modality, thresholdS: seconds, bearer: bearer)
                await onSaved()
                dismiss()
            } catch {
                errorText = "No pudimos guardar el test. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
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
