import Foundation

// Which connectable devices are worth offering the athlete BEFORE they start —
// derived purely from what the session actually contains, so the pre-workout card
// only nudges a device the session will use (no dead "connect your rower" chip on a
// squat day). Pure + fully unit-testable; the card view renders whatever this
// returns.

/// A device the athlete can connect from the brief (or the free builder), before
/// the clock starts.
enum PreWorkoutDevice: String, CaseIterable, Identifiable {
    /// FTMS Bluetooth treadmill — for run work.
    case treadmill
    /// Concept2 PM5 — for erg (row / ski / bike) work.
    case pm5
    /// Standard BLE heart-rate strap — for any cardio work (run, erg, conditioning).
    case heartRate

    var id: String { rawValue }

    /// The chip's device name (the live state word is appended by the card).
    var titleES: String {
        switch self {
        case .treadmill: return "Cinta"
        case .pm5:       return "Remo"
        case .heartRate: return "Banda de pulso"
        }
    }

    var icon: String {
        switch self {
        case .treadmill: return "figure.run"
        case .pm5:       return "antenna.radiowaves.left.and.right"
        case .heartRate: return "heart.fill"
        }
    }
}

enum PreWorkoutDeviceEligibility {
    /// The devices to offer for a session, in display order (primary machines
    /// first, the universal HR strap last):
    ///   • Cinta   — any RUN segment (continuous, series or structured run).
    ///   • Remo    — any ERG segment (row / ski / bike, PM5-driven).
    ///   • Banda   — any CARDIO segment (run, erg, or a conditioning/metcon/EMOM
    ///               block) where HR + zones matter. A pure strength/mobility day
    ///               offers nothing → the card doesn't show.
    static func devices(for segments: [WorkoutSegment]) -> [PreWorkoutDevice] {
        var out: [PreWorkoutDevice] = []
        if segments.contains(where: { $0.kind == .running }) { out.append(.treadmill) }
        if segments.contains(where: { $0.kind == .rowOrSki }) { out.append(.pm5) }
        if segments.contains(where: isCardio) { out.append(.heartRate) }
        return out
    }

    /// A cardiovascular segment — run, erg, or a conditioning/metcon/EMOM block,
    /// the work where a heart-rate strap earns its place.
    private static func isCardio(_ s: WorkoutSegment) -> Bool {
        s.kind == .running
            || s.kind == .rowOrSki
            || s.isConditioningTimer
            || s.isEMOM
            || s.isMetconFamily
    }
}

// MARK: - HR chip presentation (personal wearable vs chest strap)

/// How the pre-workout HEART-RATE chip should read — the market-standard split
/// (Garmin/Wahoo/Peloton) between a shared machine you pick by name and a PERSONAL
/// wearable that streams on its own. Pure + fully unit-testable; the card renders
/// whatever this returns.
///
/// The rule: a live/connecting BLE chest strap always wins the chip (the athlete
/// opted into the chest belt). Otherwise, if the Apple Watch app is available, the
/// chip is a positive, non-actionable "Apple Watch" state (HR arrives by itself at
/// start — nothing to connect). With neither, it's the unchanged "conectar" CTA.
enum HRChipPresentation: Equatable {
    /// The BLE strap is live, connecting or scanning → show its own link + name/state.
    case band
    /// No strap active but the Apple Watch app is present → HR is automatic; a
    /// positive "Pulso · Apple Watch" chip (tap still opens the picker to add a belt).
    case appleWatch
    /// Neither strap nor watch → the unchanged idle "conectar" call-to-action.
    case idle

    static func resolve(bandLink: DeviceLink, watchAvailable: Bool) -> HRChipPresentation {
        switch bandLink {
        case .connected, .connecting, .scanning, .reconnecting:
            return .band
        case .idle, .unavailable, .failed:
            return watchAvailable ? .appleWatch : .idle
        }
    }
}

// MARK: - PM5 connection state → the shared DeviceLink vocabulary

extension PM5ConnectionState {
    /// Map the Concept2 erg's own state onto the same `DeviceLink` the treadmill /
    /// HR chips use, so `DeviceChip` renders all three identically. The connected
    /// name is filled by the caller (it holds `connectedDeviceName`).
    ///
    /// NOTE: `.disconnecting` maps to `.idle`, NOT `.reconnecting`. The athlete asked
    /// to disconnect — showing "reconectando" (a busy state) made a clean disconnect
    /// look permanently stuck. `.idle` reads as "conectar", the honest intent, and the
    /// service force-settles to idle within a timeout regardless.
    var deviceLink: DeviceLink {
        switch self {
        case .idle:                        return .idle
        case .scanning:                    return .scanning
        case .connecting, .discoveringServices: return .connecting
        case .streaming:                   return .connected(name: "Remo")
        case .disconnecting:               return .idle
        case .failed(let msg):             return .failed(msg)
        }
    }
}
