import SwiftUI

// Sujeto de descanso dentro del shell Run global — no una app aparte.
// `LiveOrientationStrip` vive en los apoyos del shell (`RunLiveShellView`).

struct RestSubjectBand: View {
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
                HStack(alignment: .center, spacing: 10) {
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

    private var phaseWord: String {
        if session.currentSegment?.isEMOM == true { return "CAMBIO" }
        if let label = session.fixedRestKind.labelES { return label.uppercased() }
        return "DESCANSO"
    }

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

    private var isUrgent: Bool { session.tramoRestRemaining <= 3 }

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
    }

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
    }
}
