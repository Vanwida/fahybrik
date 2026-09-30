import SwiftUI

// El chrome del espejo que no es la pila. PRIMARY without a phone
// frame = builder metrics, not a spinner; whether the phone is there is
// Apple's link (`owner.phoneUnlinked`), never a missing-frames timer.

/// Lo que se ve tras arrancar una carrera desde el iPhone y ANTES de que llegue la
/// primera trama: la muñeca ya graba y lo dice, en el lenguaje del lienzo (contexto de
/// 16 pt, el reloj en SF de cifras fijas, el pulso y lo que mide la propia muñeca).
/// Dice por qué falta el móvil: «Sin conexión» si el enlace de Apple está cortado,
/// «Esperando al iPhone» si no.
struct MirrorRecordingOnWristOverlay: View {
    let owner: WatchPrimaryOwner

    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            EntradaPagina(conVersion: false) {
                EntradaContexto(partes: ["Grabando en la muñeca"])
                Text(WatchFormat.clock(owner.builderElapsed))
                    .font(.entrada(EntradaTipo.heroe))
                    .foregroundStyle(entradaTinta(atenuado: atenuado))
                    .lineLimit(1)
                    .minimumScaleFactor(EntradaTipo.escalaHeroe)
                Text(owner.phoneUnlinked ? "Sin conexión con el iPhone" : "Esperando al iPhone")
                    .font(.entrada(EntradaTipo.nota, .medium))
                    .foregroundStyle(WatchTheme.dim)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                pulso
                if let medido {
                    Text(medido)
                        .font(.entrada(EntradaTipo.nota, .medium))
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(1)
                        .minimumScaleFactor(EntradaTipo.escalaSuelo)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// El pulso, con el color de su zona en el corazón; sin lectura, lo que falta.
    @ViewBuilder
    private var pulso: some View {
        if let bpm = owner.liveHR {
            HStack(spacing: EntradaTipo.hueco) {
                Image(systemName: "heart.fill")
                    .foregroundStyle(atenuado ? WatchTheme.dim : (owner.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim))
                Text("\(bpm)")
                    .font(.entrada(EntradaTipo.tercero))
                    .foregroundStyle(entradaTinta(atenuado: atenuado))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(Vocab.fc), \(bpm) \(Vocab.ppm)")
        } else {
            Text(WatchSinDato.pulso)
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
        }
    }

    /// Lo que la muñeca ya mide sola: las kcal y los metros, si los hay.
    private var medido: String? {
        var partes: [String] = []
        if owner.activeKcal > 0 { partes.append("\(Int(owner.activeKcal.rounded())) kcal") }
        if owner.distanceMeters > 0 {
            partes.append(Formato.distanciaCubierta(owner.distanceMeters) ?? "\(Int(owner.distanceMeters.rounded())) m")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}

struct MirrorSavingOverlay: View {
    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 10) {
                ProgressView()
                    .tint(WatchTheme.orange)
                WatchLabel(text: "Guardando…", accent: true)
            }
        }
    }
}

struct MirrorPausedOverlay: View {
    var body: some View {
        ZStack {
            WatchTheme.bg.opacity(0.92).ignoresSafeArea()
            VStack(spacing: 8) {
                Image(systemName: "pause.fill")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(WatchTheme.orange)
                WatchLabel(text: "En pausa", accent: true)
            }
        }
    }
}
