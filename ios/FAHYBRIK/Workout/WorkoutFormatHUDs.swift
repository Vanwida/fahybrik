import SwiftUI

// Per-format LIVE timers for the active workout — the dedicated face of each
// conditioning format, routed by `currentSegment.formatScheme` in
// ActiveWorkoutView (el EMOM tiene el suyo, `Vivo/EmomVivoView`, con marco
// propio del §10). They read the session as
// the single source of state (the session owns the clock, audio and auto-advance,
// exactly as the EMOM engine does) and render with the shared Theme atoms.
//
//   FIXED   — the whole round is shown and REPEATED; the screen never advances.
//     · AmrapLiveHUD     count-DOWN window + big "+ Ronda" + rep tally + round list
//     · ForTimeLiveHUD   count-UP (cap flips to count-down) + round/station splits
//
// AQUÍ VIVÍAN CINCO PANTALLAS MÁS, Y SE FUERON EL 5-AGO (ver
// docs/entreno-vista-por-vista.html, «Lo que sobra»): `TabataLiveHUD`,
// `IntervalsLiveHUD`, `DeathByLiveHUD`, `SteadyLiveHUD` y `StructuredRunLiveHUD`.
// Ninguna tenía diseño detrás, y entre ellas y los dos HUD de correr había SEIS
// superficies capaces de pintar el mismo tramo de carrera —dos de ellas vivas a la
// vez, una debajo del `fullScreenCover` de la otra—, así que el atleta veía datos
// distintos según por dónde entrase.
//
// La regla que lo hace imposible: UNA VISTA POR LO QUE ESTÁS HACIENDO. Todo el live
// monta `RunLiveShellView`; correr outdoor/cinta son bandas sujeto inyectadas, no
// árboles paralelos. El descanso es `RestSubjectBand` en el shell; el ergo,
// `ErgHUDContent`.

// MARK: - Shared building blocks

// Con las cinco pantallas se fueron sus piezas: `WorkRestBanner` (la banda
// trabajo/descanso), `RotatingWorkCard` (la tarjeta «esta serie · luego…») y
// `PaceTargetBar` (el ritmo objetivo). Eran atajos de los formatos rotativos, y
// los dos que quedan —AMRAP y la ruta— no los usan: su descanso ya es
// `RestSubjectBand` y su objetivo lo pinta la banda sujeto del shell.

/// A 3-cell metric row matching the EMOM HUD's grid (total / progress / HR).
struct MetricRow3: View {
    /// Una celda de la fila. Era una tupla de cuatro `String` no opcionales, y por
    /// eso cada llamante colaba un `?? "—"` para poder rellenarla: el hueco no
    /// cabía en el tipo. `value` nil = no hay medida, y `ausente` dice por qué (§7).
    struct Cell {
        let label: String
        let value: String?
        var unit: String = ""
        var color: Color = Theme.Color.foreground
        var ausente: String? = nil
    }

    let cells: [Cell]
    var body: some View {
        let cols = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
        LazyVGrid(columns: cols, spacing: 4) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, c in
                ExpertCell(label: c.label, value: c.value, unit: c.unit, color: c.color, ausente: c.ausente)
            }
        }
    }
}

/// El pulso en vivo. Sin reloj emparejado no llega ninguna muestra, así que la
/// celda dice eso — que es accionable — en vez de una raya que no dice nada.
func hrCell(_ session: WorkoutSession) -> MetricRow3.Cell {
    MetricRow3.Cell(label: Vocab.fc,
                    value: session.liveHRBpm.map { "\($0)" },
                    unit: Vocab.ppm,
                    color: session.liveZone?.color ?? Theme.Color.foreground,
                    ausente: "sin reloj")
}

// MARK: - AMRAP

// MARK: - For Time / Chipper / Ladder / Rounds / HYROX sim

/// The permanent context of a route: the format, where he is in it, and the BLOCK
/// clock. It exists because the block clock is the score of a For Time, so it can
/// never leave the screen — not when the station becomes the subject, and not when
/// a monitor takes the screen over on an erg station.
struct ForTimeContextStrip: View {
    let session: WorkoutSession

    private var seg: WorkoutSegment? { session.currentSegment }
    private var cap: Int? { seg?.formatTotalSeconds }
    /// The final minute of a cap counts DOWN and turns red — the same flip the big
    /// clock does, kept here so the urgency survives the strip.
    private var capRemaining: Double? {
        guard let cap else { return nil }
        let r = Double(cap) - session.condElapsed
        return (r <= 60 && r > 0) ? r : nil
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(seg?.formatScheme?.displayName.uppercased() ?? "")
                .font(.system(size: 10, weight: .heavy)).tracking(1.0)
                .foregroundStyle(Theme.Color.accentText)
                .fixedSize()
            Text("\(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.faint)
                .fixedSize()
            Spacer(minLength: 6)
            Text(Formato.clock(capRemaining ?? session.condElapsed, anchoFijo: true))
                .font(.system(size: 17, weight: .semibold, design: .monospaced))
                .foregroundStyle(capRemaining != nil ? Theme.Color.danger : Theme.Color.foreground)
                .monospacedDigit()
        }
        .stripChrome()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(seg?.formatScheme?.displayName ?? "Formato"), estación \(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal). Tiempo \(Formato.clock(session.condElapsed))")
    }
}

