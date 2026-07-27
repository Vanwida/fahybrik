import SwiftUI

// ErgPreStartFlow — the erg mirror of the run pre-start: a DEDICATED full-screen
// step between "Empezar" and the live engine. First you connect, you accept YOUR
// machine ("USAR ESTE PM5"), and ONLY then the piece starts. Plan, libre and
// benchmark all pass through here.
//
// Why a sequence and not a gate on the brief's button: Alex, testing the rower —
// "primero hay una pantalla de conectarse, se acepta la conexión, y una vez se
// conecta se empieza. No podemos empezar todo a la vez." A morphing CTA on the
// brief still reads as the workout already opening; a dedicated screen reads as
// what it is: connect first.
struct ErgPreStartFlow: View {
    /// Shown small over the connect screen so the athlete knows WHAT they're starting.
    let sessionTitle: String
    /// "el remo" | "el SkiErg" | "la bici" — the connect header speaks the machine.
    let machineWord: String
    /// A benchmark has NO escape: the monitor measures the mark; without it there
    /// is nothing to save. A prescribed/free session keeps the honest manual out.
    let isBenchmark: Bool
    /// Fired when the athlete accepted a live monitor (or took the manual escape).
    let onStart: () -> Void
    /// Backs out without starting.
    let onCancel: () -> Void

    @State private var pm5 = PM5ConnectionStore.shared

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button(action: onCancel) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.Color.muted)
                            .frame(width: 40, height: 40)
                            .background(Theme.Color.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Cancelar")
                    Spacer()
                    VStack(spacing: 1) {
                        Text("Conecta \(machineWord)")
                            .font(Theme.Typography.headlineS)
                            .foregroundStyle(Theme.Color.foreground)
                        Text(sessionTitle)
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.faint)
                            .lineLimit(1)
                    }
                    Spacer()
                    // Symmetry spacer so the title stays centered.
                    Color.clear.frame(width: 40, height: 40)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)

                // The ONE connect journey: scan → pick YOUR machine → "USAR ESTE PM5".
                // Its accept button fires onDone → we start. Same screen the brief's
                // top card opens, so there are never two ways to pair an erg.
                PM5LiveStreamView(store: pm5, onDone: onStart)

                if !isBenchmark {
                    // The honest escape for a session done on a non-BLE erg: it starts,
                    // the monitor just won't feed the laps. A benchmark never offers
                    // this — a mark the app didn't measure doesn't exist.
                    Button(action: onStart) {
                        Text("Empezar sin monitor · lo apuntas tú")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, Theme.Spacing.s)
                }
            }
        }
    }
}
