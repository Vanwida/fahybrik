import Foundation

// MARK: - TestEnvironment — the single "are we under XCTest?" check
//
// Detects a unit-test process WITHOUT linking XCTest (this file is shared with
// the watch target, which has no test target). Two independent signals:
//   • `XCTestConfigurationFilePath` — set by Xcode/xcodebuild on the test HOST
//     process for every unit-test run.
//   • `NSClassFromString("XCTestCase")` — true whenever the XCTest bundle is
//     loaded into the process, even if a harness clears the env var above.
// Used as the single choke point that mutes real device I/O (speech synthesis,
// tone playback, AVAudioSession activation) so a unit-test run never makes
// noise and never needs the audio session — see `WorkoutAudio` and
// `AudioCoach`/`CoachSpeaker`.
enum TestEnvironment {
    static let isRunningUnitTests: Bool = {
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil { return true }
        return NSClassFromString("XCTestCase") != nil
    }()
}
