import ActivityKit
import WidgetKit
import SwiftUI

// The outdoor run's Live Activity (#64): lock screen banner + Dynamic Island. Renders
// PURELY from RunActivityAttributes.ContentState (pre-formatted strings pushed by the
// app), so it never re-derives anything and can't drift from the on-screen HUD. Self-
// contained styling (the brand accent is defined locally, not pulled from the app's
// Theme) so the widget target links nothing from the app.

/// The one brand accent the widget needs (#F06A2A). Kept local ON PURPOSE: pulling it
/// from the app's Theme would drag UIKit into an extension that must stay tiny.
///
/// PRECIO DE ESA DECISIÓN, y hay que saberlo al clonar: este hex es la ÚNICA copia del
/// acento fuera de Theme.swift / tokens.json. Una marca nueva que cambie el acento y no
/// toque esta línea se queda con el naranja anterior en la Isla Dinámica y en la pantalla
/// bloqueada — justo donde más se ve y donde nadie mira al hacer la revisión. Está en la
/// lista de puntos de clonado de docs/ios-clonabilidad.md.
private let acentoMarca = Color(red: 0xF0 / 255, green: 0x6A / 255, blue: 0x2A / 255)

struct RunLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            RunLiveActivityLockScreen(state: context.state)
                // SIN OPACIDAD, y esto es doctrina de Apple, no gusto: el fondo por
                // defecto de una Live Activity en la pantalla bloqueada YA es opaco
                // (blanco en claro, negro en oscuro). En cuanto le pones opacidad al
                // tint, el fondo de pantalla se transparenta y el texto puede caer
                // sobre cualquier foto — que es exactamente lo que pasaba. El HIG lo
                // dice literal: usar color de fondo y opacidad «sparingly», y cuidar
                // el contraste sobre todo en pantallas Always-On con luminancia
                // reducida, donde además el sistema fuerza modo oscuro.
                // https://developer.apple.com/design/human-interface-guidelines/live-activities
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(acentoMarca)
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
                        .foregroundStyle(s.paused ? acentoMarca : .secondary)
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
                    .foregroundStyle(acentoMarca)
            } compactTrailing: {
                Text(s.paceLabel)
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .foregroundStyle(s.paused ? .secondary : .primary)
            } minimal: {
                Image(systemName: s.paused ? "pause.fill" : "figure.run")
                    .foregroundStyle(acentoMarca)
            }
            .keylineTint(acentoMarca)
        }
    }

    private func islandMetric(value: String, unit: String, accent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 20, weight: .heavy, design: .monospaced))
                .foregroundStyle(accent ? acentoMarca : .primary)
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
                    .foregroundStyle(state.paused ? acentoMarca : .secondary)
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
