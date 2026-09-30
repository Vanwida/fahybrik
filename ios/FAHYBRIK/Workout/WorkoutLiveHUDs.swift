import SwiftUI

// LECTURAS del live, no cromo. `RunLiveHUD` y las listas estructurales son el
// SUJETO dentro de `HostVivo` / `MarcoVivo`. El cromo y la acción viven en
// `LenguajeVivoUI` (`BotonVivo`). Un fork de cromo por formato es deuda.
//
// Lo que ya NO vive aquí, y por qué:
//   • El EMOM y el hierro montan su propio `MarcoVivo` (`Workout/Vivo/`).
//   • El ergo es `ErgHUDContent` (Devices/PM5): la lectura de la máquina,
//     también dentro del mismo marco. Vertical y horizontal, el mismo sujeto.
//
// Todas leen `WorkoutSession` + `PM5ConnectionStore` como fuentes únicas — sin
// estado duplicado. Tokens de Theme/Atoms.

// MARK: - Shared center metric (big glanceable hero value)

// MARK: - Run HUD

// MARK: - Warmup / cooldown checklist (ONE structural completion)
//
// A readable checklist of every movement in the block, looping `prescription.rounds`
// as a display guide ("Ronda X de N"). The WHOLE block is gated behind ONE button
// in ActiveWorkoutView ("Calentamiento hecho") — never per-exercise logging.

struct StructuralBlockChecklist: View {
    let segments: [WorkoutSegment]
    let phaseName: String

    // Rounds guide: the max prescribed rounds across the block's movements (a
    // warmup circuit "3 rondas"); 1 when none, so a flat list still renders.
    private var rounds: Int {
        max(1, segments.compactMap { $0.prescription?.rounds }.max() ?? 1)
    }

    var body: some View {
        CardSurface(padding: 0, topAccent: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    LabelText(text: phaseName, size: 10)
                    Spacer()
                    if rounds > 1 {
                        Text("\(rounds) rondas")
                            .font(.system(size: 11, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                if rounds > 1 {
                    ForEach(1...rounds, id: \.self) { r in
                        Hairline()
                        roundHeader(r)
                        movementList
                    }
                } else {
                    Hairline()
                    movementList
                }

                Hairline()
                Text("Marca el bloque entero cuando termines.")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
        }
    }

    private func roundHeader(_ r: Int) -> some View {
        Text("Ronda \(r) de \(rounds)")
            .font(.system(size: 11, weight: .heavy, design: .default).italic())
            .tracking(0.6)
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 2)
    }

    private var movementList: some View {
        ForEach(segments) { seg in
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "circle")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                Text(seg.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: 6)
                if let line = seg.previewWorkLine {
                    Text(line)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Rx / Scaled toggle (metcon-family blocks)
//
// A WOD is done "as prescribed" (Rx) or "scaled". Block-scoped: set once, stamped
// onto each of the block's laps. An optional note captures HOW it was scaled.

// MARK: - Live scan path after a BLE drop (FH-59)
//
// The DeviceConnection law already promises a button back into the scan after
// `.idle` / `.lost`. This is WHICH chips the live host must keep mounted so that
// button exists when the athlete returns to a station — including after a drop.
// Pure: no BLE, no views. Recovery is scan + tap on DevicePickerSheet /
// PM5LiveStreamView. Never beginBlock, never finish, never auto-reconnect.

/// What the live host mounts so a drop has a scan path without leaving live.
struct LiveDeviceScanPath: Equatable {
    /// Cinta chip in ConnectionStrip. `.lost` / `.idle` do NOT hide it.
    var showCintaChip: Bool
    /// Host `TreadmillEntryButton` while the cover is closed — even if
    /// `SuperficieViva.de == .run`. Opening the cover reaches TreadmillHUDView's
    /// existing picker; the chip itself opens DevicePickerSheet.
    var showTreadmillEntry: Bool
    /// PM5 chip + CTA for the current tramo's pool store. PM5 drop lands in
    /// `.idle` (`connectionLost` is a side flag) — still shown.
    var showPM5Chip: Bool
    /// HR chip. Never hidden when `hrSource == nil` (that was the live hole).
    var showHRChip: Bool

    /// Opening the chip is `openPicker` / the PM5 sheet. Never `beginBlock`.
    var cintaOpensPicker: Bool { showCintaChip }
    var pm5OpensSheet: Bool { showPM5Chip }
    var hrOpensPicker: Bool { showHRChip }
    var requiresBeginBlock: Bool { false }

    /// `wantsCinta` / `wantsPM5` are the TRAMO that uses the source (and the
    /// return to it). Link state is an input so tests can drop to `.lost` (cinta)
    /// or `.idle` (PM5) and assert the chip stays. State never hides a chip.
    static func offer(
        wantsCinta: Bool,
        wantsPM5: Bool,
        treadmillCoverOpen: Bool,
        treadmillLink: DeviceLink,
        pm5State: PM5ConnectionState,
        pm5ConnectionLost: Bool,
        hrLink: DeviceLink,
        hrSource: WorkoutSession.HRSource?
    ) -> LiveDeviceScanPath {
        // `.lost` (FTMS) and `.idle` (PM5 / HR) must not hide the chip.
        _ = treadmillLink
        _ = pm5State
        _ = pm5ConnectionLost
        _ = hrLink
        _ = hrSource
        return LiveDeviceScanPath(
            showCintaChip: wantsCinta,
            showTreadmillEntry: wantsCinta && !treadmillCoverOpen,
            showPM5Chip: wantsPM5,
            showHRChip: true
        )
    }
}
