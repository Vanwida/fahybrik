import SwiftUI

@main
struct FAHYBRIKWatchApp: App {
    @StateObject private var planModel = WatchPlanModel.shared
    @StateObject private var connectivity = WatchConnectivityService.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(planModel)
                .environmentObject(connectivity)
                .onAppear {
                    connectivity.activate()
                }
        }
    }
}
