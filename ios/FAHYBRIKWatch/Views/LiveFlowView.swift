import SwiftUI

// The live workout shell (variant C · "Auto · 1 botón"). The LIVE screen is
// primary — one big button advances everything, zero navigation during effort.
// A horizontal swipe reaches the peripheral pages: LEFT → Pausar / Terminar,
// RIGHT → the session map. Between blocks the engine parks on the block gate;
// per-set rest overlays the live screen (keeping its state alive).
//
// NOTE (deviation): the map is reached by swipe-right rather than crown. The
// strength screen (SetTableLiveView) claims the crown for ±load (mockup 4d), so
// binding the crown to page navigation too would fight it. Swipe pages keep the
// crown free for load and match the Apple Workout paging model.
struct LiveFlowView: View {
    let session: WorkoutSession

    // 0 = map · 1 = live (default) · 2 = pause/finish. Swipe-left from live lands
    // on pause/finish; swipe-right on the map.
    @State private var page = 1

    var body: some View {
        TabView(selection: $page) {
            SessionMapView(session: session)
                .tag(0)
            liveArea
                .tag(1)
            PauseFinishPage(session: session)
                .tag(2)
        }
        .tabViewStyle(.page)
        // Parking on a block gate (auto block end, or "Siguiente bloque" fired from
        // the pause page) pulls the athlete back to the live area so the gate — and
        // the next block's Empezar — is what they see, not a stale side page.
        .onChange(of: session.isAwaitingBlockStart) { _, awaiting in
            if awaiting { page = 1 }
        }
    }

    // MARK: - Live area (gate · family · rest overlay)

    @ViewBuilder
    private var liveArea: some View {
        Group {
            if session.isAwaitingBlockStart {
                BlockGateView(session: session)
            } else {
                familyView
            }
        }
        .overlay {
            if session.restRemainingSeconds > 0 {
                RestBannerView(session: session)
            }
        }
    }

    @ViewBuilder
    private var familyView: some View {
        // #23 — HYROX dobles RELAY: the partner works this station while the athlete
        // recovers. Pre-empts the format routing (the athlete performs no work here —
        // nothing is logged); "Relevo ▸" advances to their own next station. Shares
        // the SAME engine flags as the phone (currentSegmentIsPartnerRelay / advanceRelay).
        if session.currentSegmentIsPartnerRelay {
            RelayLiveView(session: session)
        } else if let presentation {
            switch presentation {
            case .rotating:   RotatingLiveView(session: session)
            case .fixed:      FixedLiveView(session: session)
            case .continuous: ContinuousLiveView(session: session)
            case .setTable:   SetTableLiveView(session: session)
            case .list:       ChecklistLiveView(session: session)
            }
        } else {
            GenericLiveView(session: session)
        }
    }

    // The live HUD family for the current segment — the structured scheme first,
    // then a scalar-kind fallback for a legacy / freeform segment.
    private var presentation: FormatPresentation? {
        if let p = session.currentSegment?.prescription?.scheme.presentation { return p }
        switch session.currentSegment?.kind {
        case .running, .rowOrSki: return .continuous
        case .strength:           return .setTable
        default:                  return nil
        }
    }
}

// MARK: - Dobles relay (standalone wrist)

// #23 — the wrist RELAY screen: the partner works this station; the athlete
// recovers. Mirrors the phone's relay surface, compact for the wrist — status +
// "{partner} hace {station}" + recovery clock + live HR, and a single "Relevo ▸"
// that advances to the athlete's own next station. NOTHING is logged here (the
// relay never counts as the athlete's work volume — see advanceRelay).
private struct RelayLiveView: View {
    let session: WorkoutSession

    private var station: String {
        session.currentSegment?.doblesSplit?.stationLabel
            ?? session.currentSegment?.title ?? "esta estación"
    }
    private var partner: String {
        session.currentSegment?.doblesSplit?.partnerName ?? "Tu compañero"
    }

    var body: some View {
        LiveScaffold(status: "RELEVO", statusColor: WatchTheme.orangeSoft) {
            VStack(spacing: 4) {
                Text("\(partner) hace")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                Text(station)
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text("Recupera")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WatchTheme.orangeSoft)
                    .padding(.top, 1)
                GiantNumber(text: WatchFormat.clock(session.lapElapsedSeconds), size: 40)
                HRPill(bpm: session.liveHRBpm, zoneColor: WatchTheme.zoneGreen)
                if let next = session.nextSegment?.title {
                    Text("Sig: tú — \(next)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.top, 1)
                }
            }
        } bottom: {
            BigTapButton(title: "Relevo ▸") { session.advanceRelay() }
        }
    }
}

// MARK: - Generic fallback

// A legacy / freeform segment with no scheme and no locomotion kind: elapsed +
// the prescribed work line + a single advance. Honest — shows only what the
// segment actually carries.
private struct GenericLiveView: View {
    let session: WorkoutSession

    var body: some View {
        LiveScaffold(status: session.currentSegment?.title ?? "Entreno", statusColor: WatchTheme.dim) {
            VStack(spacing: 5) {
                WatchLabel(text: "Tiempo")
                GiantNumber(text: WatchFormat.clock(session.lapElapsedSeconds), size: 54)
                if let line = session.currentSegment?.previewWorkLine {
                    Text(line)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
            }
        } bottom: {
            BigTapButton(title: "Hecho ▸") { session.primaryAdvance() }
        }
    }
}
