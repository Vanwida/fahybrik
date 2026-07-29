import SwiftUI

// THE REST SCREEN — a screen with its own subject, not a tinted pause.
//
// Between two work windows the athlete's questions change completely, and in this
// order: how long is left, what am I walking to, am I recovering, how did that one
// go. So the rest gets its own surface built on those four, instead of the old
// treatment (a 30 pt countdown in the corner of the work layout, a 10% blue wash).
//
// The blue is the IDENTITY of the phase, not a hint: a real field, a real border,
// and the countdown as the largest number the app ever draws — this is read from
// the floor, three metres away, sweating. Everything that helped while working
// (split, watts, stroke rate) is gone, because none of it is true any more.
//
// Shared by every engine that rests: an EMOM change window, a Tabata / interval
// rest. The structured-run engine keeps its own recovery leg surface.
struct RestSurface: View {
    let session: WorkoutSession
    @Environment(\.verticalSizeClass) private var vSizeClass
    private var isLandscape: Bool { vSizeClass == .compact }

    var body: some View {
        VStack(spacing: isLandscape ? 6 : 14) {
            phaseTag
            countdown
            if let next = session.nextTramoLine { nextUp(next) }
            Spacer(minLength: 0)
            if hrRecovery != nil || lastEffort != nil {
                HStack(alignment: .top, spacing: 10) {
                    if let hr = hrRecovery { recoveryCard(hr) }
                    if let effort = lastEffort { effortCard(effort) }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, isLandscape ? 14 : 18)
        .padding(.vertical, isLandscape ? 10 : 18)
        .background(Theme.Color.info.opacity(0.16))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.info.opacity(0.75), lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    // MARK: - 1 · Which phase this is (one word, so no one has to infer it)

    private var phaseTag: some View {
        HStack(spacing: 8) {
            Text(phaseWord)
                .font(.system(size: 13, weight: .heavy, design: .default).italic())
                .tracking(1.6)
                .foregroundStyle(Theme.Color.info)
            if session.tramoRoundTotal > 1 {
                Text("SERIE \(session.tramoRoundIndex + 1)/\(session.tramoRoundTotal)")
                    .font(.system(size: 11, weight: .heavy)).tracking(1)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
        }
    }

    /// An EMOM's gap is a CHANGE (walk to the next station), an interval's is a
    /// REST (stand and breathe). Naming them the same would flatten the difference
    /// the format exists to create.
    private var phaseWord: String {
        session.currentSegment?.isEMOM == true ? "CAMBIO" : "DESCANSO"
    }

    // MARK: - 2 · The subject: how long is left

    private var countdown: some View {
        Text(Formato.clock(session.tramoRestRemaining, anchoFijo: true))
            .font(.system(size: isLandscape ? 108 : 130, weight: .heavy, design: .monospaced)
                .monospacedDigit())
            .foregroundStyle(isUrgent ? Theme.Color.accentText : Theme.Color.info)
            .lineLimit(1)
            .minimumScaleFactor(0.4)
            .contentTransition(.numericText())
            .frame(maxWidth: .infinity)
            .accessibilityLabel("\(phaseWord.lowercased()), quedan \(Int(session.tramoRestRemaining.rounded())) segundos")
    }

    /// The last three seconds go accent — the same threshold the audible ticks use,
    /// so eyes and ears say the same thing.
    private var isUrgent: Bool { session.tramoRestRemaining <= 3 }

    // MARK: - 3 · What comes next

    private func nextUp(_ next: String) -> some View {
        VStack(spacing: 3) {
            Text("LUEGO")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(Theme.Color.muted)
            Text(next)
                .font(.system(size: isLandscape ? 22 : 28, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - 4 · Am I recovering? (real data, or nothing at all)

    /// Current bpm plus the drop from the peak of the window just finished — the
    /// only thing on this screen that says whether the rest is working. Shown only
    /// when HR is actually streaming; a rest with no belt shows no HR card rather
    /// than an em-dash pretending to be a measurement.
    private var hrRecovery: (bpm: Int, peak: Int?)? {
        guard let bpm = session.liveHRBpm else { return nil }
        return (bpm, session.lastTramoHRPeak)
    }

    private func recoveryCard(_ hr: (bpm: Int, peak: Int?)) -> some View {
        VStack(spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(hr.bpm)")
                    .font(.system(size: 34, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(session.liveZone?.color ?? Theme.Color.foreground)
                Text(Vocab.ppm)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            if let peak = hr.peak, peak > hr.bpm {
                Text("▼ \(peak - hr.bpm) desde \(peak)")
                    .font(.system(size: 12, weight: .heavy, design: .monospaced))
                    .foregroundStyle(Theme.Color.ok)
            } else {
                Text("PULSO")
                    .font(.system(size: 9, weight: .heavy)).tracking(1)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(hr.peak.map { p in
            p > hr.bpm ? "Pulso \(hr.bpm), ha bajado \(p - hr.bpm) desde \(p)" : "Pulso \(hr.bpm)"
        } ?? "Pulso \(hr.bpm)")
    }

    // MARK: - 5 · How the window just closed went

    /// The just-finished bout as it really happened: how long it took, and what the
    /// monitor measured when there was a monitor. Nil when nothing was recorded, so
    /// the card never invents closure that didn't exist.
    private var lastEffort: (time: String, work: String?)? {
        guard let seconds = session.lastTramoElapsedSeconds, seconds > 0 else { return nil }
        return (Formato.clock(seconds), session.lastTramoWorkLine)
    }

    private func effortCard(_ effort: (time: String, work: String?)) -> some View {
        VStack(spacing: 2) {
            Text(effort.time)
                .font(.system(size: 34, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(effort.work.map { "\($0) · LA QUE ACABAS DE HACER" } ?? "LA QUE ACABAS DE HACER")
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("La serie que acabas de hacer: \(effort.work.map { $0 + ", " } ?? "")\(effort.time)")
    }
}
