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
            Group {
                if context.state.positionLabel != nil {
                    VivoLiveActivityLockScreen(state: context.state)
                } else {
                    RunLiveActivityLockScreen(state: context.state)
                }
            }
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
            let vivo = s.positionLabel != nil
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if vivo {
                        islandMetric(value: s.heroLabel ?? s.timeLabel, unit: s.heroUnit ?? "", accent: !s.paused)
                    } else {
                        islandMetric(value: s.paceLabel.isEmpty ? s.timeLabel : s.paceLabel,
                                     unit: s.paceLabel.isEmpty ? "tiempo" : "/km",
                                     accent: !s.paused)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // Sin zona la métrica SE VA de la isla, no se queda como guion: la
                    // pantalla bloqueada no ofrece ninguna acción para arreglarlo, y la
                    // región de al lado ya dice el porqué (`paceLabel` trae la razón).
                    // Es lo mismo que hace la banda de abajo, que omite su chip (§7).
                    if vivo {
                        if let a = s.actionLabel, !a.isEmpty, !s.paused { VivoLiveActivityAccion(texto: a) }
                    } else if !s.zoneLabel.isEmpty {
                        islandMetric(value: s.zoneLabel, unit: "zona", accent: false)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.paused ? "PAUSA" : vivo ? (s.positionLabel ?? "") : (s.legLabel.isEmpty ? "Carrera" : s.legLabel))
                        .font(vivo ? .system(size: 15, weight: .bold) : .system(size: 13, weight: .heavy).italic())
                        .foregroundStyle(s.paused ? acentoMarca : vivo ? .primary : .secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if vivo {
                            if let v = s.verdictLabel, !v.isEmpty { Text(v).font(.system(size: 13, weight: .semibold)) }
                            Spacer()
                            Label(s.timeLabel, systemImage: "clock").labelStyle(.titleAndIcon)
                        } else {
                            Label(s.distanceLabel, systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                                .labelStyle(.titleAndIcon)
                            Spacer()
                            Label(s.timeLabel, systemImage: "clock")
                                .labelStyle(.titleAndIcon)
                        }
                    }
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary)
                }
            } compactLeading: {
                if vivo {
                    Text(s.heroLabel ?? "")
                        .font(.system(size: 15, weight: .semibold).monospacedDigit())
                        .foregroundStyle(s.paused ? .secondary : .primary)
                } else {
                    Image(systemName: s.paused ? "pause.fill" : "figure.run")
                        .foregroundStyle(acentoMarca)
                }
            } compactTrailing: {
                if vivo {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill").font(.system(size: 10)).foregroundStyle(acentoMarca)
                        Text(s.timeLabel).font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary)
                    }
                } else {
                    Text(s.paceLabel)
                        .font(.system(size: 13, weight: .heavy, design: .monospaced))
                        .foregroundStyle(s.paused ? .secondary : .primary)
                }
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


// MARK: - El vivo rehecho (28-09, I11): la MISMA lámina que la pantalla

/// La acción primaria, pintada como en el vivo (superficie, texto en tinta).
/// NO se pulsa: un botón interactivo exige un `LiveActivityIntent` (App Intents)
/// compilado en la app y en esta extensión, que no existe todavía.
struct VivoLiveActivityAccion: View {
    let texto: String
    var body: some View {
        Text(texto)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(Color.white.opacity(0.12), in: Capsule())
    }
}

/// La tarjeta de la pantalla de bloqueo del vivo rehecho: la marca y la posición
/// arriba con el crono; el héroe con su unidad y el veredicto abajo, y la acción.
struct VivoLiveActivityLockScreen: View {
    let state: RunActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Text("F")
                    .font(.system(size: 12, weight: .black).italic())
                    .foregroundStyle(.black)
                    .frame(width: 22, height: 22)
                    .background(acentoMarca, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                Text(state.paused ? "En pausa" : (state.positionLabel ?? ""))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(state.timeLabel)
                    .font(.system(size: 17, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    if let c = state.heroCaption, !c.isEmpty {
                        Text(c).font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
                    }
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text(state.heroLabel ?? "")
                            .font(.system(size: 44, weight: .semibold).monospacedDigit())
                            .foregroundStyle(state.paused ? .secondary : .primary)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        if let u = state.heroUnit, !u.isEmpty {
                            Text(u).font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
                        }
                        if let v = state.verdictLabel, !v.isEmpty {
                            Text(v).font(.system(size: 15, weight: .semibold)).foregroundStyle(.primary)
                        }
                    }
                }
                Spacer(minLength: 0)
                if let a = state.actionLabel, !a.isEmpty, !state.paused { VivoLiveActivityAccion(texto: a) }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }
}
