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

// MARK: - Connection / data-provenance strip
//
// A glanceable row of small chips telling the athlete (and, via the record, the
// coach) WHERE the live data comes from this segment: the erg (PM5), the heart-
// rate source, the cinta, and phone GPS on runs. Each chip is on (accent) when
// that source is live, muted when not. Tapping a machine chip opens the existing
// picker (`DevicePickerSheet` / `PM5LiveStreamView`) — including after `.lost`
// / `.idle`. HR never hides when the source drops.

// MARK: - Live recipe device bar
//
// Every device the session recipe needs — always on the live chrome, not only the
// current tramo. Disconnect mid-workout → chip stays tappable; reconnect must not
// reset block/set cursor (pickers only, never `beginBlock`).

struct LiveRecipeDeviceBar: View {
    let devices: [PreWorkoutDevice]
    let pool: PM5Pool
    let treadmillLink: DeviceLink
    let hrLink: DeviceLink
    let onTapErg: (PM5ConnectionStore, String) -> Void
    let onTapTreadmill: () -> Void
    let onTapHR: () -> Void

    @State private var watch = WatchPresence.shared

    var body: some View {
        if devices.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(devices) { device in
                        chip(for: device)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Dispositivos del entreno")
        }
    }

    @ViewBuilder
    private func chip(for device: PreWorkoutDevice) -> some View {
        if device == .heartRate, hrPresentation == .appleWatch {
            Button(action: onTapHR) {
                DeviceChip(icon: "applewatch", text: "Pulso · Apple Watch",
                           link: .connected(name: "Apple Watch"))
            }
            .buttonStyle(.plain)
            .accessibilityHint("Toca para conectar una banda de pecho")
        } else {
            let link = link(for: device)
            Button {
                Haptics.light()
                tap(device, link: link)
            } label: {
                DeviceChip(icon: device.icon, text: chipText(device, link: link), link: link)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(device.titleES), \(link.isLive ? "conectado" : stateWord(link))")
            .accessibilityHint("Toca para conectar o cambiar")
        }
    }

    private var hrPresentation: HRChipPresentation {
        HRChipPresentation.resolve(bandLink: hrLink, watchAvailable: watch.appAvailable)
    }

    private func link(for device: PreWorkoutDevice) -> DeviceLink {
        switch device {
        case .treadmill: return treadmillLink
        case .heartRate: return hrLink
        case .erg, .ergAny:
            guard let store = pool.store(for: device) else { return .idle }
            if case .streaming = store.connectionState {
                return .connected(name: store.connectedDeviceName ?? device.titleES)
            }
            var mapped = store.connectionState.deviceLink
            if case .connected = mapped, store.connectedDeviceName == nil {
                mapped = .connected(name: device.titleES)
            }
            if store.connectionLost, !store.isConnected {
                return .lost
            }
            return mapped
        }
    }

    private func tap(_ device: PreWorkoutDevice, link: DeviceLink) {
        switch device {
        case .treadmill: onTapTreadmill()
        case .heartRate: onTapHR()
        case .erg, .ergAny:
            guard let store = pool.store(for: device) else { return }
            onTapErg(store, device.titleES)
        }
    }

    private func chipText(_ device: PreWorkoutDevice, link: DeviceLink) -> String {
        if let name = link.deviceName { return "\(device.titleES) · \(name)" }
        return "\(device.titleES) · \(stateWord(link))"
    }

    private func stateWord(_ link: DeviceLink) -> String {
        switch link {
        case .connected:    return "listo"
        case .connecting:   return "conectando"
        case .scanning:     return "buscando"
        case .lost:         return "se perdió · conectar"
        case .idle:         return "conectar"
        case .unavailable:  return "sin señal"
        case .failed:       return "reintentar"
        }
    }
}

// MARK: - Structured block / interval strip
//
// Concept2-style interval list: the prescribed segments of the current block as
// a horizontal row of chips, current highlighted, done = checked + dimmed,
// upcoming = muted. Each chip shows the per-segment target so the athlete sees
// "where am I in the structured block" and what's next.

