import SwiftUI

// MirrorHUD chrome that is not the coach script. Conectando = no local session.
// PRIMARY without a phone frame = builder metrics, not a spinner.

struct MirrorWaitingForPhoneOverlay: View {
    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
                .tint(WatchTheme.orange)
            WatchLabel(text: "Conectando…", accent: true)
            Text("El entreno se controla\ndesde el iPhone")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MirrorRecordingOnWristOverlay: View {
    let controller: MirrorSessionController

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            VStack(spacing: 8) {
                WatchLabel(text: "Grabando en la muñeca", accent: true)
                GiantNumber(text: WatchFormat.clock(controller.builderElapsed), size: 44)
                HStack(spacing: 8) {
                    HRPill(
                        bpm: controller.liveHR,
                        zoneColor: controller.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim
                    )
                    if controller.activeKcal > 0 {
                        Text("\(Int(controller.activeKcal.rounded())) kcal")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                    }
                    if controller.distanceMeters > 0 {
                        Text(Formato.distanciaCubierta(controller.distanceMeters) ?? "\(Int(controller.distanceMeters.rounded())) m")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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

struct MirrorRestOverlay: View {
    let base: Double
    let sinceFrame: (Date) -> Double

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            ZStack {
                WatchTheme.restBg.ignoresSafeArea()
                VStack(spacing: 6) {
                    StatusHeader(text: "Descanso", color: WatchTheme.zoneGreen)
                    Spacer(minLength: 0)
                    WatchLabel(text: "Vuelve en", color: WatchTheme.zoneGreen.opacity(0.85))
                    GiantNumber(
                        text: CountdownFormat.mirrored(max(0, base - sinceFrame(context.date))),
                        size: 80,
                        color: WatchTheme.zoneGreen
                    )
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
        }
    }
}
