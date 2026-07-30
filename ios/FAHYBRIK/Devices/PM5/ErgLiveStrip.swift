import SwiftUI

// The monitor's live numbers as a STRIP, for the formats where the erg is real but
// the app cannot honestly say the athlete is on it right now.
//
// In an AMRAP or a For Time the athlete moves between movements in their own order:
// nothing in the model knows whether this second is the row or the burpees, so
// taking the screen over with the erg surface would be a lie about the subject —
// the subject there really is the format clock and the rounds. But throwing the
// monitor's data away was the other error ("no mostramos lo que tenemos de pm5"),
// so it lives here: one row, under the format, showing what the machine is actually
// reporting. Rotating and per-round formats never use this — there the tramo knows
// exactly what is being done and the full erg surface takes over.
struct ErgLiveStrip: View {
    let pm5: PM5ConnectionStore

    private var live: PM5LiveSample { pm5.live }

    var body: some View {
        HStack(spacing: 6) {
            cell(valor: splitString, label: "split /500m")
            cell(valor: live.powerWatts.map { "\($0)" }, label: "vatios",
                 color: Theme.Color.accentText)
            cell(valor: live.strokeRate.map { "\($0)" }, label: "s/min")
            cell(valor: live.distanceMeters.map { "\(Int($0))" }, label: "metros")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Datos del monitor")
    }

    /// El split, cuando lo hay. nil = no lo hay — el monitor manda 0 y el decodificador
    /// lo convierte en «nada», que es lo correcto: a palada parada no hay ritmo (no es
    /// cero, es que no existe). Los vatios y las paladas SÍ llegan en cero, y ese cero
    /// se pinta porque está medido (§6.2 bis).
    private var splitString: String? {
        guard let p = live.paceSecondsPer500m, p > 0 else { return nil }
        return Formato.ritmoCifras(p)
    }

    /// POR QUÉ falta la lectura. La tira sólo aparece con el monitor conectado (lo
    /// decide `ActiveWorkoutView`), así que nunca es un problema de enlace: o todavía
    /// no ha dicho nada, o lo ha dicho y ahora mismo no estás remando.
    private var motivoAusente: String {
        sinDatos ? "esperando la primera palada" : "sin remar"
    }

    /// El monitor está conectado pero no ha mandado NADA todavía.
    private var sinDatos: Bool {
        live.paceSecondsPer500m == nil && live.powerWatts == nil && (live.distanceMeters ?? 0) <= 0
    }

    /// `valor` nil = no hay medida: se pinta el porqué, nunca un guion. Es el mismo
    /// contrato que `ApoyoVivo` (Theme/LenguajeVivoUI.swift), en la voz de esta tira.
    private func cell(valor: String?, label: String,
                      color: Color = Theme.Color.foreground) -> some View {
        VStack(spacing: 1) {
            if let valor {
                Text(valor)
                    .font(.system(size: 22, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(color)
                    .lineLimit(1).minimumScaleFactor(0.5)
            } else {
                Text(motivoAusente)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .frame(height: 26)
            }
            Text(label.uppercased())
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(valor ?? motivoAusente)")
    }
}
