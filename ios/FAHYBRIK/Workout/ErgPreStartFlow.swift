import SwiftUI

// ErgPreStartFlow — the erg mirror of the run pre-start: a DEDICATED full-screen
// step between "Empezar" and the piece. First you connect, you accept YOUR
// machine ("USAR ESTE PM5"), and ONLY then the piece starts. Presented by
// ActiveWorkoutView's pre-block gate — the ONE choke point every launch path
// crosses (plan, libre, test, benchmark) — never by the pre-workout brief, which
// the free/benchmark paths skip entirely.
//
// The store is the pool slot for THIS role (or pool.any for unscoped / mono).
// A Remo+Ski block presents this screen once per missing role so Ski is asked
// apart from Remo. Same PM5LiveStreamView(store:) the brief chips open —
// never a second scan engine, never .shared beside a role store.
struct ErgPreStartFlow: View {
    /// Shown small over the connect screen so the athlete knows WHAT they're starting.
    let sessionTitle: String
    /// "el remo" | "el SkiErg" | "la bici" — the connect header speaks the machine.
    let machineWord: String
    /// A benchmark has NO escape: the monitor measures the mark; without it there
    /// is nothing to save. A prescribed/free session keeps the honest manual out.
    let isBenchmark: Bool
    /// Pool store for the role being asked. Parent owns the pool.
    @Bindable var store: PM5ConnectionStore
    /// Remo / SkiErg / BikeErg — titles the picker so two PM5s are unambiguous.
    var roleTitle: String? = nil
    /// Fired when the athlete accepted a live monitor (or took the manual escape).
    let onStart: () -> Void
    /// Backs out without starting.
    let onCancel: () -> Void

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

                // The ONE connect journey: scan, pick YOUR machine, USAR ESTE PM5.
                // Same screen the brief's role chip opens — never two ways to pair.
                PM5LiveStreamView(store: store, onDone: onStart, roleTitle: roleTitle)

                if !isBenchmark {
                    // The honest escape for THIS role: the piece can start, this
                    // monitor just won't feed the laps. A benchmark never offers it.
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
