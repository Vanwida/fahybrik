import SwiftUI

// Tests guiados — the result step's DONE surface (mockup C), extracted from
// TestResultCaptureSheet. Honest feedback only: every recorded entry with its
// server-computed delta vs the previous mark, the "Tus zonas se han
// actualizado" card with the RE-FETCHED new umbral (never a client-side
// computation) + its delta vs the pre-save snapshot, and the remaining
// non-zone effects (1RM / nivel) exactly as the bridge reported them.
struct TestResultDoneView: View {
    let result: RecordBatteryResult?
    let specs: [StoreResultSpec]
    /// Post-save re-fetch of api/athlete/zones (the new umbral, server truth).
    let newZoneProfiles: [ZoneModalityProfile]?
    /// Umbral per modality as it stood BEFORE the save — powers the delta.
    let preThresholds: [String: Double]
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                Text(result?.improvedEntries.isEmpty == false ? "Récord del test" : "Resultado guardado")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
            }

            // Every recorded entry with its delta vs the previous mark (server
            // truth) — the honest per-number readback.
            if let entries = result?.entries, !entries.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.slug) { idx, entry in
                        if idx > 0 { Hairline() }
                        entryRow(entry)
                    }
                }
            }

            // "Tus zonas se han actualizado" — the rich card, with the NEW umbral
            // (re-fetched, server-resolved) and its delta vs the pre-save one.
            if let result, !result.zonesDerived.isEmpty {
                zonesUpdatedCard(result.zonesDerived)
            }

            let effects = result?.secondaryEffects ?? []
            if effects.isEmpty, result?.entries?.isEmpty != false, result?.zonesDerived.isEmpty != false {
                Text("Tu marca queda registrada en tu perfil.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            } else if !effects.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    ForEach(effects, id: \.self) { effect in
                        HStack(spacing: 9) {
                            Image(systemName: "arrow.up.right.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.accentText)
                            Text(effect)
                                .font(Theme.Typography.bodyEmph)
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
                }
                .padding(Theme.Spacing.l)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
            }

            PrimaryButton(title: "Hecho") {
                Haptics.light()
                onDone()
            }
            .padding(.top, Theme.Spacing.s)
        }
    }

    /// One saved entry: label · value · delta chip (green/red by the unit's
    /// better-direction; "primera marca" when there was nothing to beat).
    private func entryRow(_ entry: RecordBatteryResult.EntryDelta) -> some View {
        let spec = specs.first { $0.slug == entry.slug }
        let unit = spec?.unit ?? ""
        return HStack(spacing: Theme.Spacing.m) {
            Text(spec?.label ?? entry.slug)
                .font(Theme.Typography.bodyEmph)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            Spacer(minLength: Theme.Spacing.s)
            Text(BenchmarkDelta.valueLabel(unit: unit, value: entry.value))
                .font(.system(size: 15, weight: .bold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            if let prev = entry.prevValue {
                BenchmarkDeltaChip(unit: unit, delta: entry.value - prev)
            } else {
                Text("primera marca")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(.vertical, Theme.Spacing.s)
        .accessibilityElement(children: .combine)
    }

    /// The updated zones, per derived modality: the server-resolved NEW umbral
    /// (re-fetched — never computed client-side) + delta vs the pre-save umbral
    /// when it actually changed.
    private func zonesUpdatedCard(_ derived: [RecordBatteryResult.ZoneDerived]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: 9) {
                Image(systemName: "speedometer")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                Text("Tus zonas se han actualizado")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
            }
            VStack(spacing: 0) {
                ForEach(derived, id: \.modality) { zone in
                    zoneUpdateRow(zone)
                }
            }
            Text("El umbral nuevo ya marca los ritmos de tus próximos entrenos.")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
    }

    private func zoneUpdateRow(_ zone: RecordBatteryResult.ZoneDerived) -> some View {
        // Prefer the re-fetched profile (label + unit as the server renders
        // them); fall back to the response's threshold with the modality's
        // intrinsic unit (run → /km, ergo → /500m) while the re-fetch lands.
        let profile = newZoneProfiles?.first { $0.modality == zone.modality }
        let thresholdText = profile?.thresholdLabel
            ?? "\(PrescriptionRenderer.formatPace(Int(zone.thresholdS.rounded())))\(zone.modality == "run" ? "/km" : "/500m")"
        let delta = preThresholds[zone.modality].map { zone.thresholdS - $0 }
        return HStack(spacing: Theme.Spacing.m) {
            Text(profile?.modalityLabel ?? RecordBatteryResult.modalityLabel(zone.modality).capitalized)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: Theme.Spacing.s)
            Text("umbral \(thresholdText)")
                .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            if let delta, delta != 0 {
                BenchmarkDeltaChip(unit: "seconds", delta: delta)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}
