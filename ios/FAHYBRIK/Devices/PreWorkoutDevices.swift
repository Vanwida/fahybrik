import Foundation

// Which connectable devices are worth offering the athlete BEFORE they start —
// derived purely from what the session actually contains, so the pre-workout card
// only nudges a device the session will use (no dead "connect your rower" chip on a
// squat day). Pure + fully unit-testable; the card view renders whatever this
// returns.
//
// FUNCTIONAL / multi-machine (2026-08-04): a single EMOM can need Remo + Ski +
// Cinta at once. Slots are per MACHINE ROLE, not a single "PM5" chip. The athlete
// binds each role to a physical peripheral; the live engine routes the active
// tramo's modality to that binding. See PM5Pool + ErgCounterPolicy.

/// A Concept2 erg discipline that needs its own PM5 link when several appear in
/// one session (row + ski in the same EMOM). The monitor itself does not advertise
/// ski vs row — the SLOT is the athlete's assignment of "this PM5 is the ski".
enum ErgMachineRole: String, CaseIterable, Identifiable, Codable, Hashable {
    case row
    case ski
    case bike

    var id: String { rawValue }

    var modality: PrescriptionModality {
        switch self {
        case .row:  return .row
        case .ski:  return .ski
        case .bike: return .bike
        }
    }

    var titleES: String {
        switch self {
        case .row:  return "Remo"
        case .ski:  return "SkiErg"
        case .bike: return "BikeErg"
        }
    }

    var icon: String {
        switch self {
        case .row:  return "figure.rower"
        case .ski:  return "figure.skiing.crosscountry"
        case .bike: return "figure.indoor.cycle"
        }
    }

    /// Connect-gate header: one word per role so Remo and Ski are never one string.
    var machineWord: String {
        switch self {
        case .row:  return "el remo"
        case .ski:  return "el SkiErg"
        case .bike: return "la bici"
        }
    }

    init?(modality: PrescriptionModality) {
        switch modality {
        case .row:  self = .row
        case .ski:  self = .ski
        case .bike: self = .bike
        default:    return nil
        }
    }

    init?(wire: String) {
        self.init(rawValue: wire)
    }
}

/// A device the athlete can connect from the brief (or the free builder), before
/// the clock starts.
enum PreWorkoutDevice: Hashable, Identifiable {
    /// FTMS Bluetooth treadmill — for run work.
    case treadmill
    /// Concept2 PM5 bound to a specific erg role (row / ski / bike).
    case erg(ErgMachineRole)
    /// One unscoped PM5 when the session involves erg work but does not name a
    /// machine (legacy / bare timer). Live routes any erg tramo to this link.
    case ergAny
    /// Standard BLE heart-rate strap — for any cardio work (run, erg, conditioning).
    case heartRate

    var id: String {
        switch self {
        case .treadmill:     return "treadmill"
        case .erg(let r):    return "erg-\(r.rawValue)"
        case .ergAny:        return "erg-any"
        case .heartRate:     return "heartRate"
        }
    }

    /// The chip's device name (the live state word is appended by the card).
    var titleES: String {
        switch self {
        case .treadmill:     return "Cinta"
        case .erg(let r):    return r.titleES
        case .ergAny:        return "PM5"
        case .heartRate:     return "Banda de pulso"
        }
    }

    var icon: String {
        switch self {
        case .treadmill:     return "figure.run"
        case .erg(let r):    return r.icon
        case .ergAny:        return "antenna.radiowaves.left.and.right"
        case .heartRate:     return "heart.fill"
        }
    }

    /// True when this chip opens a Concept2 PM5 picker.
    var isPM5: Bool {
        switch self {
        case .erg, .ergAny: return true
        default: return false
        }
    }

    /// Role for a role-bound erg chip; nil for ergAny / non-PM5.
    var ergRole: ErgMachineRole? {
        if case .erg(let r) = self { return r }
        return nil
    }
}

enum PreWorkoutDeviceEligibility {
    /// The devices to offer for a session, in display order (primary machines
    /// first, the universal HR strap last):
    ///   · Cinta        — any RUN movement (segment or set inside a format).
    ///   · Remo/Ski/Bike — each distinct erg machine the session touches.
    ///   · PM5          — fallback when erg is involved but no machine is named.
    ///   · Banda        — any CARDIO work (run, erg, metcon/EMOM/…).
    ///
    /// A pure strength/mobility day offers nothing → the card doesn't show.
    static func devices(for segments: [WorkoutSegment]) -> [PreWorkoutDevice] {
        var machines = Set<ErgMachineRole>()
        var needsTreadmill = false
        var needsUnscopedErg = false
        var needsHR = false

        for s in segments {
            if s.involvesRun { needsTreadmill = true }
            if isCardio(s) { needsHR = true }

            let named = namedErgRoles(in: s)
            if !named.isEmpty {
                machines.formUnion(named)
            } else if s.involvesErg {
                // Erg work with no machine tag (legacy bare segment, title-only).
                needsUnscopedErg = true
            }
        }

        var out: [PreWorkoutDevice] = []
        if needsTreadmill { out.append(.treadmill) }
        // Stable role order: row → ski → bike (matches HYROX station order habits).
        for role in ErgMachineRole.allCases where machines.contains(role) {
            out.append(.erg(role))
        }
        // Unscoped only when we could not name any machine — never stack both.
        if needsUnscopedErg && machines.isEmpty {
            out.append(.ergAny)
        }
        if needsHR { out.append(.heartRate) }
        return out
    }

    /// Distinct erg roles a segment's work will touch — from ergKind, set modalities,
    /// and the prescription's declared modality. Empty when there is no erg work
    /// or only an untyped "involves erg" signal.
    static func namedErgRoles(in segment: WorkoutSegment) -> Set<ErgMachineRole> {
        var roles = Set<ErgMachineRole>()
        if let k = segment.ergKind, let r = ErgMachineRole(wire: k) {
            roles.insert(r)
        }
        for wire in segment.ergMachines {
            if let r = ErgMachineRole(wire: wire) { roles.insert(r) }
        }
        if let sets = segment.prescription?.sets {
            for set in sets {
                if let m = set.modality, let r = ErgMachineRole(modality: m) {
                    roles.insert(r)
                }
            }
        }
        if let m = segment.prescription?.modality, let r = ErgMachineRole(modality: m) {
            roles.insert(r)
        }
        return roles
    }

    /// Named roles across a block, stable row to ski to bike. Folded `.reps`
    /// chippers still name Ski vs Row from set.modality / ergKind, not kind.isErg.
    static func namedErgRoles(in segments: [WorkoutSegment]) -> [ErgMachineRole] {
        var set = Set<ErgMachineRole>()
        for s in segments { set.formUnion(namedErgRoles(in: s)) }
        return ErgMachineRole.allCases.filter { set.contains($0) }
    }

    /// Roles the gate still has to ask. A named Remo+Ski block does not close
    /// because one of them is up — each role is its own accept-or-sin-monitor.
    /// Mono-erg (one named role) treats the unscoped `any` store as that role so
    /// the brief's ErgConnectCard (pool.any) is the same link Empezar respects.
    static func missingErgRoles(
        in segments: [WorkoutSegment],
        roleConnected: Set<ErgMachineRole>,
        anyConnected: Bool,
        skipped: Set<ErgMachineRole> = []
    ) -> [ErgMachineRole] {
        let named = namedErgRoles(in: segments)
        return named.filter { role in
            if skipped.contains(role) { return false }
            if roleConnected.contains(role) { return false }
            if named.count <= 1 && anyConnected { return false }
            return true
        }
    }

    /// Untagged erg work (legacy rowOrSki with no machine): one `any` gate.
    static func needsUnscopedErgConnect(
        in segments: [WorkoutSegment],
        anyConnected: Bool,
        skipped: Bool = false
    ) -> Bool {
        guard namedErgRoles(in: segments).isEmpty else { return false }
        return segments.contains(where: { $0.involvesErg }) && !anyConnected && !skipped
    }

    static func needsErgConnect(
        in segments: [WorkoutSegment],
        roleConnected: Set<ErgMachineRole>,
        anyConnected: Bool,
        skipped: Set<ErgMachineRole> = [],
        skippedUnscoped: Bool = false
    ) -> Bool {
        if !missingErgRoles(in: segments, roleConnected: roleConnected,
                            anyConnected: anyConnected, skipped: skipped).isEmpty {
            return true
        }
        return needsUnscopedErgConnect(in: segments, anyConnected: anyConnected,
                                       skipped: skippedUnscoped)
    }

    /// A cardiovascular segment — run, erg, or a conditioning/metcon/EMOM block,
    /// the work where a heart-rate strap earns its place.
    private static func isCardio(_ s: WorkoutSegment) -> Bool {
        s.kind == .running
            || s.kind == .rowOrSki
            || s.involvesErg
            || s.involvesRun
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
        case .connected, .connecting, .scanning:
            return .band
        // `.lost` falls through to the watch/idle presentation on purpose: the strap is
        // gone and nothing is bringing it back, so the honest chip is the one that
        // invites a tap (or credits the watch that IS still reading his pulse).
        case .idle, .lost, .unavailable, .failed:
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
        case .streaming:                   return .connected(name: "PM5")
        case .disconnecting:               return .idle
        case .failed(let msg):             return .failed(msg)
        }
    }
}
