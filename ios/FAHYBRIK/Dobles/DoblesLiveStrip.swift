import SwiftUI

// #56 — the PARTNER LIVE STRIP shown at the top of the active workout: how the training
// partner is going right now (blue = the partner, brand-consistent with the dobles
// surfaces). Pure presentation over `DoblesLiveStripState`; it never fetches. Collapsible
// to a single line (the athlete's own workout is the focus), and it sits above the HUD so
// it never overlaps the controls.
struct DoblesLiveStrip: View {
    let state: DoblesLiveStripState
    @Binding var collapsed: Bool

    var body: some View {
        switch state {
        case .hidden:
            EmptyView()
        default:
            card
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: collapsed ? 0 : 8) {
            headerRow
            if !collapsed { expanded }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.partner.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.partner.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: - Header (always visible; drives the collapse toggle)

    private var headerRow: some View {
        HStack(spacing: 8) {
            DoblesAthleteAvatar(initials: initials, color: Theme.Color.partner, size: 24)
                .opacity(isStale ? 0.45 : 1)
            VStack(alignment: .leading, spacing: 1) {
                headerLine
                if collapsed, let sub = collapsedSubtitle {
                    Text(sub)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Button {
                withAnimation(.easeInOut(duration: 0.18)) { collapsed.toggle() }
            } label: {
                Image(systemName: collapsed ? "chevron.down" : "chevron.up")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(collapsed ? "Mostrar detalle de tu pareja" : "Plegar")
        }
    }

    @ViewBuilder
    private var headerLine: some View {
        switch state {
        case .live(let name, let paused, _, _, _, _, _):
            HStack(spacing: 6) {
                LivePulseDot(color: Theme.Color.partner, active: !paused)
                Text("CON \(name.uppercased()) · \(paused ? "EN PAUSA" : "EN VIVO")")
                    .font(.system(size: 11, weight: .heavy).italic())
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.partner)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        case .stale:
            Text("SIN SEÑAL")
                .font(.system(size: 11, weight: .heavy).italic()).tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
        case .finished(let name, _, _):
            Text("✓ \(name.uppercased()) HA TERMINADO")
                .font(.system(size: 11, weight: .heavy).italic()).tracking(0.8)
                .foregroundStyle(Theme.Color.ok)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .left(let name):
            Text("\(name.uppercased()) HA SALIDO")
                .font(.system(size: 11, weight: .heavy).italic()).tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        case .hidden:
            EmptyView()
        }
    }

    // MARK: - Expanded detail

    @ViewBuilder
    private var expanded: some View {
        switch state {
        case .live(_, _, let block, let progress, let elapsedS, let hrBpm, let ageS):
            VStack(alignment: .leading, spacing: 6) {
                if let line = workLine(block: block, progress: progress) {
                    Text(line)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                HStack(spacing: 12) {
                    metric(icon: "stopwatch", text: DoblesLiveFormat.clock(elapsedS))
                    if let hr = hrBpm {
                        metric(icon: "heart.fill", text: "\(hr)", tint: Theme.Color.danger)
                    }
                    Spacer(minLength: 0)
                    Text(DoblesLiveFormat.ago(ageS))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        case .stale(_, let ageS):
            Text("Última señal \(DoblesLiveFormat.ago(ageS)) · seguirá en cuanto vuelva la conexión")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        case .finished(_, let finalTimeS, let finalRpe):
            HStack(spacing: 10) {
                if let t = finalTimeS {
                    Text(DoblesLiveFormat.clock(t))
                        .font(.system(size: 18, weight: .heavy, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
                if let rpe = DoblesLiveFormat.rpe(finalRpe) {
                    Text("RPE \(rpe)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 0)
                Text("te espera en el resumen")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
            }
        case .left:
            Text("Tu sesión sigue igual, por tu cuenta.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
        case .hidden:
            EmptyView()
        }
    }

    // MARK: - Bits

    private func metric(icon: String, text: String, tint: Color = Theme.Color.muted) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
            Text(text)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private func workLine(block: String?, progress: String?) -> String? {
        let parts = [block, progress].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var collapsedSubtitle: String? {
        switch state {
        case .live(_, _, let block, let progress, _, _, _): return workLine(block: block, progress: progress)
        default: return nil
        }
    }

    private var isStale: Bool { if case .stale = state { return true } else { return false } }

    private var initials: String {
        let name = partnerName
        return name.isEmpty ? "·" : String(name.prefix(1)).uppercased()
    }

    private var partnerName: String {
        switch state {
        case .live(let n, _, _, _, _, _, _), .stale(let n, _),
             .finished(let n, _, _), .left(let n): return n
        case .hidden: return ""
        }
    }

    private var accessibilityText: String {
        switch state {
        case .live(let n, let paused, let block, let progress, let elapsedS, let hr, let age):
            var s = "Tu pareja \(n) \(paused ? "en pausa" : "en vivo")"
            if let w = workLine(block: block, progress: progress) { s += ", \(w)" }
            s += ", \(DoblesLiveFormat.clock(elapsedS))"
            if let hr { s += ", \(hr) pulsaciones" }
            s += ", \(DoblesLiveFormat.ago(age))"
            return s
        case .stale(let n, let age): return "\(n) sin señal, última hace \(age) segundos"
        case .finished(let n, let t, let rpe):
            var s = "\(n) ha terminado"
            if let t { s += ", \(DoblesLiveFormat.clock(t))" }
            if let r = DoblesLiveFormat.rpe(rpe) { s += ", RPE \(r)" }
            return s
        case .left(let n): return "\(n) ha salido de su sesión"
        case .hidden: return ""
        }
    }
}
