import SwiftUI

// CORRER FUERA — ya no es entry point del live. `ActiveWorkoutView` monta siempre
// `RunLiveShellView`; las bandas outdoor viven en `RunOutdoorBands.swift`.
//
// Este tipo queda para previews, capturas y tests que piden «outdoor» explícito.
// El motor sigue siendo `OutdoorRunHUDModel`, gestionado por el shell.

struct OutdoorRunHUDView: View {
    let session: WorkoutSession
    let hrZones: HRZoneProfile?
    let alSalir: () -> Void
    let alVerBloques: () -> Void
    let alConectividad: () -> Void

    @State private var partnerStripCollapsed = false

    var body: some View {
        RunLiveShellView(
            session: session,
            hrZones: hrZones,
            accionTitulo: "HECHO",
            alTocarAccion: {},
            alSalir: alSalir,
            alVerBloques: alVerBloques,
            alConectividad: alConectividad,
            alTapPM5: {},
            alTapHR: {},
            alPausa: { session.togglePause() },
            pm5: PM5Pool.shared.any,
            hrLink: .idle,
            gpsActive: session.runEnvironment == .outdoor,
            partnerStripCollapsed: $partnerStripCollapsed
        )
        .onAppear {
            if session.runEnvironment == nil {
                session.runEnvironment = .outdoor
            }
        }
    }
}

#if DEBUG
private func rodajeDePrueba() -> WorkoutSession {
    let tramo = WorkoutSegment(order: 1, title: "Rodaje 40:00", kind: .running,
                               targetDurationSeconds: 2400, targetZone: .z2,
                               blockTitle: "Carrera", blockPosition: 1)
    let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                           estimatedDurationSeconds: 2400, blockContext: "Carrera",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    let sesion = WorkoutSession(plan: plan)
    sesion.runEnvironment = .outdoor
    return sesion
}

private func zonasDePrueba() -> HRZoneProfile {
    HRZoneProfile(
        lthrBpm: 170, estimated: true, source: "from_age",
        sourceLabel: "Zonas estimadas por tu edad", confidence: "estimated",
        zones: [
            HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
            HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
            HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
            HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
            HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
        ]
    )
}

#Preview("Correr en vivo · con pulso") {
    let sesion = rodajeDePrueba()
    sesion.liveHRBpm = 145
    return OutdoorRunHUDView(session: sesion, hrZones: zonasDePrueba(),
                             alSalir: {}, alVerBloques: {}, alConectividad: {})
}

#Preview("Correr en vivo · sin ancla de FC") {
    OutdoorRunHUDView(session: rodajeDePrueba(), hrZones: nil,
                      alSalir: {}, alVerBloques: {}, alConectividad: {})
}
#endif
