import SwiftUI
import UIKit

// Full-screen "focus" HUD for the erg (row / ski). Opened from the erg work screen so
// the split /500m + watts read at 5 m — and, unlike the inline HUD, it opts into
// LANDSCAPE (#6): rotate the phone and the split fills the left half. Read-only: the
// PM5's resistance is the physical damper, so there are no controls like the treadmill,
// only a big glanceable readout kept in lock-step with the monitor.
struct ErgFocusHUDView: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }

    private var live: PM5LiveSample { pm5.live }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.m) {
                header
                if pm5.isConnected, noLiveData { noDataHint }
                if isLandscape { landscapeBody } else { portraitBody }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 12)
        }
        .allowsLandscape()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(legLine)
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let obj = objectiveLine {
                    Text(obj)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer()
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Cerrar pantalla completa")
        }
    }

    // MARK: - Portrait

    private var portraitBody: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer(minLength: 0)
            splitBlock(splitSize: 118, wattSize: 40)
            HStack(spacing: 8) {
                boxMetric(value: spm.map { "\($0)" } ?? "—", label: "s/min")
                boxMetric(value: distanceString, label: "metros")
            }
            Spacer(minLength: 0)
            metricStrip
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Landscape (big split left, the rest right)

    private var landscapeBody: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Split · real")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 2)
                Text(splitString)
                    .font(.system(size: 118, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text("/500m")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 9) {
                HStack(spacing: 8) {
                    boxMetric(value: watts.map { "\($0)" } ?? "—", label: "vatios", accent: true)
                    boxMetric(value: spm.map { "\($0)" } ?? "—", label: "s/min")
                }
                metricStrip
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Pieces

    private func splitBlock(splitSize: CGFloat, wattSize: CGFloat) -> some View {
        CardSurface(padding: Theme.Spacing.l, topAccent: true, elevated: true) {
            VStack(spacing: 4) {
                LabelText(text: "Split · real", size: 10)
                Text(splitString)
                    .font(.system(size: splitSize, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text("/500m")
                    .font(Theme.Typography.readoutLabel)
                    .foregroundStyle(Theme.Color.muted)
                Hairline()
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text(watts.map { "\($0)" } ?? "—")
                        .font(.system(size: wattSize, weight: .heavy, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
                    Text("W")
                        .font(Theme.Typography.readoutLabel)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func boxMetric(value: String, label: String, accent: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 26, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(accent ? Theme.Color.accentText : Theme.Color.foreground)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var metricStrip: some View {
        HStack(spacing: 8) {
            ExpertCell(label: "Split medio", value: avgSplitString, unit: "")
            ExpertCell(label: "Tiempo", value: WorkoutSession.formatElapsed(session.lapElapsedSeconds), unit: "")
            ExpertCell(label: "Pulso",
                       value: session.liveHRBpm.map { "\($0)" } ?? "—", unit: "bpm",
                       color: session.liveZone?.color ?? Theme.Color.foreground)
        }
    }

    private var noDataHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
            Text("Conectado, pero el PM5 aún no envía datos. Dale unas paladas.")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // MARK: - Derived (same rules as the inline ErgLiveHUD)

    private var noLiveData: Bool {
        live.paceSecondsPer500m == nil && live.powerWatts == nil && (live.distanceMeters ?? 0) <= 0
    }
    private var splitString: String {
        guard pm5.isConnected, let p = live.paceSecondsPer500m, p > 0 else { return "—:—" }
        let s = Int(p.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
    private var avgSplitString: String {
        guard pm5.isConnected, let p = live.avgPaceSecondsPer500m, p > 0 else { return "—:—" }
        let s = Int(p.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
    private var watts: Int? { pm5.isConnected ? live.powerWatts : nil }
    private var spm: Int? { pm5.isConnected ? live.strokeRate : nil }
    private var distanceString: String {
        if pm5.isConnected, let d = live.distanceMeters { return "\(Int(d))" }
        return "—"
    }
    private var legLine: String {
        session.currentSegment?.title ?? "Remo"
    }
    private var objectiveLine: String? {
        let seg = session.currentSegment
        if let d = seg?.targetDistanceMeters { return "\(Int(d)) m" }
        if let w = seg?.targetPowerWatts { return "\(w) W" }
        return nil
    }
}
