import Foundation
import SwiftUI
import UserNotifications
import UIKit

// MARK: - Notification kinds
//
// Mirrors the backend `notifications` enum (shared/schema/notifications.ts).
// The push payload carries `{ aps: {...}, type: "<kind>", ... }`; we route on
// `type`. Keep this in sync with the backend enum — adding a case here without
// a backend producer is harmless (it falls through to .unknown routing).
enum PushNotificationKind: String {
    case planPublished = "plan_published"
    case chatMessage = "chat_message"
    case weekAdjustmentPending = "week_adjustment_pending"
    case monthlyBlockPending = "monthly_block_pending"
    case renewal
    case paymentFailed = "payment_failed"

    /// Tab the deep link should land on. Chat is presented as a sheet over the
    /// Today tab, so chat routes to `.today` + a sheet flag (see PushRouter).
    var destination: PushRouter.Destination {
        switch self {
        case .planPublished, .weekAdjustmentPending, .monthlyBlockPending:
            return .plan
        case .chatMessage:
            return .chat
        case .renewal, .paymentFailed:
            return .profile
        }
    }
}

// MARK: - PushRouter
//
// Single source of truth for "a notification was tapped, take me somewhere".
// TodayView observes `pendingDestination`; when set it switches the selected
// tab (and, for chat, raises the chat sheet) then clears it.
@Observable
@MainActor
final class PushRouter {
    static let shared = PushRouter()

    enum Destination: Equatable {
        case today
        case plan
        case chat
        case profile
    }

    /// Set when a notification is tapped. TodayView consumes + clears it.
    var pendingDestination: Destination?

    private init() {}

    func route(to destination: Destination) {
        pendingDestination = destination
    }
}

// MARK: - PushManager
//
// Owns APNS registration + token upload. Authorization is requested explicitly
// after login/onboarding (never on first cold launch) via `requestAuthorization`.
// The device token is captured by AppDelegate and handed here for upload.
@MainActor
final class PushManager {
    static let shared = PushManager()

    /// Bearer used to POST the device token. Set after auth; refreshed on
    /// sign-out (cleared) and re-login.
    private var bearer: String?

    /// Most recent APNS token (hex). Cached so we can re-POST if the bearer
    /// arrives after the token (token can register before login completes).
    private var pendingTokenHex: String?

    private init() {}

    func configure(bearer: String?) {
        self.bearer = bearer
        // If a token already arrived (e.g. user re-launched already authorized
        // and APNS handed us the token before we set the bearer), upload now.
        if bearer != nil, let hex = pendingTokenHex {
            Task { await uploadToken(hex) }
        }
    }

    /// Ask the user for notification permission, then register with APNS.
    /// Call AFTER login/onboarding completes — not on first launch.
    func requestAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            Task { @MainActor in
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /// Called by AppDelegate once iOS hands back the APNS token.
    func didRegister(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        pendingTokenHex = hex
        Task { await uploadToken(hex) }
    }

    private func uploadToken(_ hex: String) async {
        guard let bearer else { return } // wait until configured with a session
        let body = DeviceRegisterBody(
            device_token: hex,
            apns_env: Self.currentEnvironment,
            bundle_id: Bundle.main.bundleIdentifier ?? "com.fahybrid.app",
            app_version: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
            app_build: Bundle.main.infoDictionary?["CFBundleVersion"] as? String
        )
        do {
            try await APIClient.shared.postRaw(path: "api/devices/register", body: body, bearer: bearer)
        } catch {
            // Registration is best-effort: a failed POST simply means the user
            // won't get push until the next successful registration (re-tried
            // on next launch / re-config). Don't surface to the UI.
        }
    }

    /// `development` for debug/simulator builds (APNS sandbox), `production`
    /// for App Store / TestFlight (APNS production). The entitlement uses
    /// `development`; Xcode rewrites it to `production` on distribution builds.
    private static var currentEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
}

// Matches POST /api/devices/register Zod schema:
// { device_token, apns_env, bundle_id, app_version?, app_build? }.
// Field names are explicit snake_case (no encoder transform needed here, but
// APIClient's convertToSnakeCase keeps them intact).
private struct DeviceRegisterBody: Encodable {
    let device_token: String
    let apns_env: String
    let bundle_id: String
    let app_version: String?
    let app_build: String?
}

// MARK: - AppDelegate
//
// SwiftUI's pure App lifecycle doesn't expose the APNS UIApplicationDelegate
// callbacks (didRegisterForRemoteNotificationsWithDeviceToken etc.), so we
// bridge via @UIApplicationDelegateAdaptor in FAHYBRIKApp. This delegate also
// acts as the UNUserNotificationCenterDelegate for foreground presentation +
// tap routing.
final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushManager.shared.didRegister(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // No APNS token available (no provisioning / network). Push stays off;
        // nothing actionable in the UI.
    }

    // Foreground delivery: show a banner + play sound even while the app is
    // open (athletes expect to see a coach message land live).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound])
    }

    // Tap handling: route to the right surface based on the payload `type`.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let typeRaw = userInfo["type"] as? String,
           let kind = PushNotificationKind(rawValue: typeRaw) {
            Task { @MainActor in
                PushRouter.shared.route(to: kind.destination)
            }
        }
        completionHandler()
    }
}
