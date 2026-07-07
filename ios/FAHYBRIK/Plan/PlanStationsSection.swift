import SwiftUI

// Dobles HYROX — per-station partner split rendered inside PlanSessionSheet.
//
// Decision tree:
//   • assignment.stationAssignment == nil  → section not rendered.
//   • partner == nil                       → section not rendered.
//   • myRole resolved (backend OR shim)    → render rows.
//
// `assigned_to`:
//   "a"          → first partner (deterministic by `myRole`)
//   "b"          → second partner
//   "alternate"  → alternating, both decide at runtime.
struct PlanStationsSection: View {
    let stations: [StationAssignmentEntry]
    let partner: PartnerInfo
    /// "a" | "b" — resolved by `resolveMyRole(...)` before this view is rendered.
    let myRole: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(stations.enumerated()), id: \.element.id) { idx, station in
                        stationRow(station)
                        if idx < stations.count - 1 {
                            Hairline()
                        }
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: "ESTACIONES DOBLES")
            Text("Reparto con \(partner.firstName)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private func stationRow(_ station: StationAssignmentEntry) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(station.displayName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                // Explicit reparto note ("alterna 250m" / "tú 60 / compañero 40").
                if let note = station.note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            badge(for: station.assignedTo)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func badge(for assignedTo: String) -> some View {
        switch assignedTo {
        case "split", "alternate":
            tag(text: "Alternáis", color: Theme.Color.warning)
        case myRole:
            tag(text: "Tú haces", color: Theme.Color.ok, filled: true)
        default:
            tag(text: partner.firstName, color: Theme.Color.muted)
        }
    }

    private func tag(text: String, color: Color, filled: Bool = false) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.2)
            .foregroundStyle(filled ? Color.white : color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(filled ? color : color.opacity(0.14))
            .clipShape(Capsule())
    }
}

// MARK: - Role resolution
//
// `my_role` is the truth-source: backend (W5+) embeds it on the assignment
// envelope so iOS can render the split deterministically. While that field is
// not yet shipped, we fall back to a lexicographic comparison of the two user
// IDs. This is purely a UI hint — the server still owns the canonical mapping
// for any execution writes — and it stays stable across devices because both
// devices read the same IDs from the same partner endpoint.
enum DoblesRole {
    /// Returns "a" | "b" for the current device, or nil if it cannot be
    /// resolved. Prefer `explicit` (backend `my_role`) when present; otherwise
    /// fall back to a lexicographic comparison of the two athlete IDs.
    ///
    /// The fallback is symmetric across devices because both partners feed the
    /// comparator the same pair `(my, partner)` from the same source endpoint
    /// — they just see it from opposite sides.
    static func resolveMyRole(
        explicit: String?,
        currentAthleteId: String?,
        partnerAthleteId: String?
    ) -> String? {
        if let explicit, explicit == "a" || explicit == "b" {
            return explicit
        }
        guard
            let me = currentAthleteId, !me.isEmpty,
            let other = partnerAthleteId, !other.isEmpty
        else { return nil }
        // Lexicographic comparison: lower ID → "a", higher → "b".
        return me < other ? "a" : "b"
    }
}
