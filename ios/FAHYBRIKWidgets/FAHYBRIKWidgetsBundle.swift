import WidgetKit
import SwiftUI

// The FAHYBRID widget extension (#64). Today it hosts a single member: the outdoor
// run's Live Activity (lock screen + Dynamic Island). New widgets join this bundle.
@main
struct FAHYBRIKWidgetsBundle: WidgetBundle {
    var body: some Widget {
        RunLiveActivityWidget()
    }
}
