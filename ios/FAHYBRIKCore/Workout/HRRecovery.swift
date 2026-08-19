import Foundation
import Observation

// Tests guiados — HRR (heart-rate recovery) capture. When a calibration test's
// contract asks for an `hrr` result (slug `hrr60`), the session keeps listening
// to the live HR stream for a 90-second window AFTER the effort ends and this
// engine derives:
//
//   hr_end  = mean bpm over the FINAL 10 s of effort (the finishing intensity)
//   hr_60   = mean bpm around the 60 s post-effort mark (±5 s band)
//   hrr60   = hr_end − hr_60 (how far the pulse dropped in one minute)
//
// HONEST by construction: every number is derived from real samples or is nil —
// no signal → no value → the result is silently omitted (never an error, never a
// fabricated bpm). A NEGATIVE drop (pulse higher after a minute of rest than at
// the "end of effort") is a measurement artifact — the athlete had already
// stopped, or the strap glitched — and reads as nil too: junk must never enter
// the athlete's benchmark history.
//
// Pure Foundation + Observation and clock-free (offsets, not Dates) so the
// arithmetic is unit-testable; WorkoutSession bridges wall-clock Dates to
// offsets. Compiled into BOTH the iOS and watch targets (WorkoutSession
// references it), so keep it free of UIKit/SwiftUI.
@Observable
final class HRRecoveryCapture {
    /// Total post-effort listening window. Buffer past the 60 s mark so the
    /// measurement band is fully covered even with a laggy stream.
    static let windowSeconds: Double = 90
    /// How far back into the effort `hr_end` averages.
    static let effortTailSeconds: Double = 10
    /// The recovery mark: bpm ~60 s after the effort ended.
    static let hr60OffsetSeconds: Double = 60
    /// Samples within ±tolerance of the mark average into `hr60` (stream jitter).
    static let hr60ToleranceSeconds: Double = 5
    /// `hr60` requires at least one sample at/after this offset — proof the
    /// athlete actually reached the 60 s mark (a 57 s skip is NOT a 60 s value).
    static let hr60CoverageSeconds: Double = 58

    /// Mean bpm over the final `effortTailSeconds` of effort. Fixed at init from
    /// the session's rolling effort-tail buffer; nil when no signal reached the
    /// finish (e.g. no strap/watch).
    let hrEnd: Int?

    /// Post-effort samples as (seconds since the effort ended, bpm).
    private(set) var samples: [(offset: Double, bpm: Int)] = []

    /// `effortTail` = recent effort samples as (seconds BEFORE the finish, bpm).
    /// Entries outside [0, effortTailSeconds] are ignored (defensive — the
    /// session's buffer already prunes to ~the tail).
    init(effortTail: [(secondsBeforeFinish: Double, bpm: Int)]) {
        let tail = effortTail
            .filter { $0.secondsBeforeFinish >= 0 && $0.secondsBeforeFinish <= Self.effortTailSeconds }
            .map(\.bpm)
        hrEnd = Self.mean(tail)
    }

    /// Feed one post-effort reading. Out-of-window or non-positive readings are
    /// dropped (never an error).
    func addSample(bpm: Int, secondsSinceFinish: Double) {
        guard bpm > 0, secondsSinceFinish >= 0, secondsSinceFinish <= Self.windowSeconds else { return }
        samples.append((offset: secondsSinceFinish, bpm: bpm))
    }

    /// The recovery bpm at the 60 s mark: mean of the samples inside the ±5 s
    /// band, valid only once the stream actually covered the mark (≥ 58 s).
    /// Nil when the athlete skipped early or the signal dropped — omitted, never
    /// guessed.
    var hr60: Int? {
        let band = samples.filter { abs($0.offset - Self.hr60OffsetSeconds) <= Self.hr60ToleranceSeconds }
        guard band.contains(where: { $0.offset >= Self.hr60CoverageSeconds }) else { return nil }
        return Self.mean(band.map(\.bpm))
    }

    /// The headline result: bpm drop over the first minute of recovery. Nil when
    /// either side is missing OR the drop is negative (artifact — see header).
    var hrr60: Int? {
        guard let hrEnd, let hr60 else { return nil }
        let drop = hrEnd - hr60
        return drop >= 0 ? drop : nil
    }

    private static func mean(_ values: [Int]) -> Int? {
        guard !values.isEmpty else { return nil }
        return Int((Double(values.reduce(0, +)) / Double(values.count)).rounded())
    }
}
