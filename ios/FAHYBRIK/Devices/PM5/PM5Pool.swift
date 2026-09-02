import Foundation
import Observation

// Session-scoped multi-PM5 owner. A functional EMOM can need Remo + Ski at the
// same time (two physical monitors); each `ErgMachineRole` gets its own
// `PM5ConnectionStore` + `PM5Service` so BLE links do not stomp each other.
//
// Routing rule (mechanism, HARD RULE Nº0):
//   · Live tramo modality → the store bound to that role (if connected).
//   · Fallback: the unscoped `any` store when the session only offered "PM5"
//     or the athlete connected a single monitor without a named role (mono-erg
//     ErgConnectCard). Never another role's monitor — that is «2 PM5 as 1».
//   · Non-erg tramo (wallballs, rest, Run) → no active store; other links stay up.
//
// Counter policy stays in `ErgCounterPolicy` — the pool only picks WHICH
// monitor receives program / which live sample feeds the session.

@Observable
final class PM5Pool {
    static let shared = PM5Pool()

    /// Unscoped link — mono-erg sessions, profile settings, legacy "PM5" chip.
    let any: PM5ConnectionStore

    /// Role-bound stores, created lazily on first chip open / connect.
    private var roleStores: [ErgMachineRole: PM5ConnectionStore] = [:]

    /// Bumped whenever any store's live sample or connection changes — surfaces
    /// that don't hold a direct store reference can re-read `active(for:)`.
    private(set) var epoch: UInt64 = 0

    /// `any` defaults to the legacy shared store so mono-erg / profile keep one
    /// CBCentralManager and one remembered pairing. Role stores get their own.
    init(any: PM5ConnectionStore = .shared) {
        self.any = any
        wire(any, role: nil)
    }

    // MARK: - Stores

    /// The store for a named erg role. Creates it (own CBCentralManager) on first use.
    func store(for role: ErgMachineRole) -> PM5ConnectionStore {
        if let existing = roleStores[role] { return existing }
        let s = PM5ConnectionStore(service: PM5Service())
        roleStores[role] = s
        wire(s, role: role)
        return s
    }

    /// Store behind a pre-workout chip.
    func store(for device: PreWorkoutDevice) -> PM5ConnectionStore? {
        switch device {
        case .erg(let role): return store(for: role)
        case .ergAny:        return any
        default:             return nil
        }
    }

    /// All stores that currently exist (role-bound + unscoped).
    var allStores: [PM5ConnectionStore] {
        [any] + ErgMachineRole.allCases.compactMap { roleStores[$0] }
    }

    /// Peripheral UUIDs already claimed by any link — other pickers hide them so
    /// the athlete cannot bind the same PM5 to Remo and Ski at once.
    var occupiedPeripheralIds: Set<UUID> {
        Set(allStores.compactMap(\.connectedIdentifier))
    }

    /// True when at least one PM5 is streaming.
    var anyConnected: Bool { allStores.contains(where: \.isConnected) }

    /// True when THIS role's store is streaming. Does not create a store and
    /// does not look at another role — two named machines are two links.
    func isRoleConnected(_ role: ErgMachineRole) -> Bool {
        roleStores[role]?.isConnected == true
    }

    // MARK: - Active routing

    /// Which store owns the numbers for this tramo modality right now.
    /// Prefers a role-bound connected store; falls back to `any` for mono-erg /
    /// unscoped. Does NOT fall back to another role: silence on Ski is honest
    /// when only Remo is paired.
    func activeStore(for modality: PrescriptionModality) -> PM5ConnectionStore? {
        if let role = ErgMachineRole(modality: modality) {
            if let s = roleStores[role], s.isConnected { return s }
            if any.isConnected { return any }
            return roleStores[role] ?? any
        }
        return nil
    }

    /// Convenience: modality of a LiveTramo.
    func activeStore(for tramo: LiveTramo) -> PM5ConnectionStore? {
        guard tramo.isErg else { return nil }
        return activeStore(for: tramo.modality)
    }

    /// Is a monitor streaming for this modality (or the unscoped fallback)?
    func isConnected(for modality: PrescriptionModality) -> Bool {
        activeStore(for: modality)?.isConnected == true
    }

    // MARK: - Lifecycle

    /// Release every PM5 this session holds. Idempotent.
    func disconnectAll() {
        for s in allStores { s.disconnect() }
    }

    // MARK: - Internals

    private func wire(_ store: PM5ConnectionStore, role: ErgMachineRole?) {
        store.onDidUpdate = { [weak self] in
            self?.epoch &+= 1
        }
        // Role is informational for diagnostics; selection uses the map key.
        _ = role
    }
}
