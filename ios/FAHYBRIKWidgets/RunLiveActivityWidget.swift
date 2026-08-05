import ActivityKit
import WidgetKit
import SwiftUI

// The outdoor run's Live Activity (#64): lock screen banner + Dynamic Island. Renders
// PURELY from RunActivityAttributes.ContentState (pre-formatted strings pushed by the
// app), so it never re-derives anything and can't drift from the on-screen HUD. Self-
// contained styling (the Fabrik orange is defined locally, not pulled from the app's
// Theme) so the widget target links nothing from the app.

/// Fabrik orange (#F06A2A) — the one brand accent the widget needs. Kept local so the
/// extension doesn't drag the app's UIKit-backed Theme into its target.
private let fabrikOrange = Color(red: 0xF0 / 255, green: 0x6A / 255, blue: 0x2A / 255)

struct RunLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            RunLiveActivityLockScreen(state: context.state)
                // Casi opaco a propósito: al 35 % el fondo de pantalla se colaba y
                // el texto blanco sobre una foto clara no se leía. La pantalla
                // bloqueada puede tener CUALQUIER imagen detrás, así que el
                // contraste no puede depender de ella.
                .activityBackgroundTint(Color.black.opacity(0.92))
                .activitySystemActionForegroundColor(fabrikOrange)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    islandMetric(value: s.paceLabel.isEmpty ? s.timeLabel : s.paceLabel,
                                 unit: s.paceLabel.isEmpty ? "tiempo" : "/km",
                                 accent: !s.paused)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // Sin zona la métrica SE VA de la isla, no se queda como guion: la
                    // pantalla bloqueada no ofrece ninguna acción para arreglarlo, y la
                    // región de al lado ya dice el porqué (`paceLabel` trae la razón).
                    // Es lo mismo que hace la banda de abajo, que omite su chip (§7).
                    if !s.zoneLabel.isEmpty {
                        islandMetric(value: s.zoneLabel, unit: "zona", accent: false)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.paused ? "PAUSA" : (s.legLabel.isEmpty ? "Carrera" : s.legLabel))
                        .font(.system(size: 13, weight: .heavy).italic())
                        .foregroundStyle(s.paused ? fabrikOrange : .secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Label(s.distanceLabel, systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                            .labelStyle(.titleAndIcon)
                        Spacer()
                        Label(s.timeLabel, systemImage: "clock")
                            .labelStyle(.titleAndIcon)
                    }
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: s.paused ? "pause.fill" : "figure.run")
                    .foregroundStyle(fabrikOrange)
            } compactTrailing: {
                Text(s.paceLabel)
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .foregroundStyle(s.paused ? .secondary : .primary)
            } minimal: {
                Image(systemName: s.paused ? "pause.fill" : "figure.run")
                    .foregroundStyle(fabrikOrange)
            }
            .keylineTint(fabrikOrange)
        }
    }

    private func islandMetric(value: String, unit: String, accent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 20, weight: .heavy, design: .monospaced))
                .foregroundStyle(accent ? fabrikOrange : .primary)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
        }
    }
}

// The lock-screen / banner presentation: pace hero on the left, the run's live figures
// on the right, with a paused treatment when stopped.
struct RunLiveActivityLockScreen: View {
    let state: RunActivityAttributes.ContentState

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            // EL SUJETO ES EL RITMO, Y SI NO HAY RITMO ES EL TIEMPO. Nunca una
            // palabra con «/km» detrás: la unidad convierte cualquier cosa en una
            // medida falsa. El tiempo siempre es cierto, así que es la degradación
            // honesta mientras el GPS no pueda avalar un ritmo.
            let hayRitmo = !state.paceLabel.isEmpty
            VStack(alignment: .leading, spacing: 2) {
                Text(state.paused ? "PAUSA" : (hayRitmo ? "RITMO" : "TIEMPO"))
                    .font(.system(size: 10, weight: .heavy).italic())
                    .tracking(0.6)
                    .foregroundStyle(state.paused ? fabrikOrange : .secondary)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(hayRitmo ? state.paceLabel : state.timeLabel)
                        .font(.system(size: 34, weight: .heavy, design: .monospaced))
                        .foregroundStyle(state.paused ? .secondary : .primary)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    if hayRitmo {
                        Text("/km").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                if !state.legLabel.isEmpty {
                    chip(state.legLabel, systemImage: "flag.checkered")
                }
                chip(state.distanceLabel, systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                HStack(spacing: 8) {
                    if !state.zoneLabel.isEmpty { chip(state.zoneLabel, systemImage: "heart.fill") }
                    // El tiempo no se repite: si ya es el sujeto de la izquierda,
                    // ponerlo otra vez al lado es ruido.
                    if hayRitmo { chip(state.timeLabel, systemImage: "clock") }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .foregroundStyle(.secondary)
            .labelStyle(.titleAndIcon)
    }
}
