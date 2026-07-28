import CryptoKit
import Foundation
import WorkoutKit

// MARK: - AppleWatchWorkoutScheduler — the plan on the wrist, without the phone (#48)
//
// Mirrors the athlete's upcoming RUNS into the native Entrenamiento app on their
// Apple Watch (WorkoutKit). They raise their wrist, our session is at the top of the
// list with its real name and its real tramos, and they press start. No phone.
//
// NO ENTITLEMENT IS REQUIRED and no Apple approval is involved: the only gate is
// `WorkoutScheduler.requestAuthorization()` at runtime, which the athlete answers.
//
// WHAT GETS MIRRORED — runs only. See the scope note in `AppleWorkoutMapper`:
// `WorkoutGoal` has no reps, no load and no rounds, so fuerza / EMOM / AMRAP cannot
// travel without losing the work. Those run in our own watchOS app.
//
// THE TWO HARD PARTS
// ------------------
// 1. THE CAP. WorkoutKit holds a limited number of scheduled workouts, shown in a
//    ±7-day window. The number is `WorkoutScheduler.maxAllowedScheduledWorkoutCount`
//    and we READ it at runtime — never a literal. We also budget against workouts
//    scheduled by OTHER apps (see `syncedBudget`), so a full queue degrades to
//    "fewer of ours" instead of silent failures.
// 2. RECONCILIATION. The coach edits plans. Re-syncing must RETIRE what no longer
//    applies, not pile up. Every plan we schedule carries a DETERMINISTIC id derived
//    from its assignment id (`FahybrikWorkoutPlanID`), so on each sync we can tell
//    ours from other apps', match a scheduled entry to the assignment it came from,
//    and remove exactly the stale ones. `removeAllWorkouts()` is deliberately NEVER
//    called: it would also wipe workouts another app scheduled for the athlete.

// MARK: - Deterministic plan identity

/// The id we give every `WorkoutPlan` we schedule.
///
/// Two properties matter and both are load-bearing for reconciliation:
///   · DETERMINISTIC — the same assignment always produces the same id, so a
///     re-sync recognises what it already scheduled instead of duplicating it.
///     No local ledger to drift out of sync.
///   · RECOGNISABLE — the first bytes are a fixed FAHYBRID signature, so we can
///     look at the scheduler's queue and know which entries are ours. Everything
///     else belongs to another app and we never touch it.
enum FahybrikWorkoutPlanID {
    /// Signature bytes marking a plan as ours. Arbitrary but fixed forever: changing
    /// it would orphan every workout already on athletes' watches.
    private static let signature: [UInt8] = [0xFA, 0x48, 0x1B, 0x1D]

    /// Domain separator, so this digest can never collide with another use of the
    /// same assignment id elsewhere in the system.
    private static let namespace = "fahybrik.workoutkit.plan.v1:"

    static func planID(forAssignmentId assignmentId: String) -> UUID {
        let digest = SHA256.hash(data: Data((namespace + assignmentId).utf8))
        var bytes = signature
        bytes.append(contentsOf: digest.prefix(16 - signature.count))
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    /// True when this scheduled workout was put there by us.
    static func isOurs(_ id: UUID) -> Bool {
        let bytes = id.uuid
        return bytes.0 == signature[0] && bytes.1 == signature[1]
            && bytes.2 == signature[2] && bytes.3 == signature[3]
    }
}

// MARK: - The scheduler

/// WorkoutKit's plan type, spelled out because the app has its OWN `WorkoutPlan`
/// (the session the live engine executes — Workout/WorkoutModels.swift). The two are
/// unrelated and an unqualified `WorkoutPlan` here would silently resolve to ours.
private typealias WKPlan = WorkoutKit.WorkoutPlan

@MainActor
@Observable
final class AppleWatchWorkoutScheduler {
    static let shared = AppleWatchWorkoutScheduler()

    /// Athlete opt-in. Scheduling is never silent: nothing reaches the watch until
    /// they turn it on in Perfil.
    private static let enabledKey = "fahybrik.appleWatchWorkouts.enabled"

    /// How far ahead we mirror. WorkoutKit only SHOWS a ±7-day window, so pushing
    /// anything further is work the athlete would never see.
    static let horizonDays = 7

    private(set) var authorization: WorkoutScheduler.AuthorizationState = .notDetermined
    private(set) var isWorking = false
    /// How many of the athlete's runs are currently on the watch. Nil = never synced
    /// in this launch (the UI then says nothing rather than claiming zero).
    private(set) var scheduledCount: Int?

    private init() {
        isEnabled = UserDefaults.standard.bool(forKey: Self.enabledKey)
    }

    /// True on a device whose OS/hardware can schedule at all. Read from WorkoutKit,
    /// never inferred.
    var isSupported: Bool { WorkoutScheduler.isSupported }

    private(set) var isEnabled: Bool {
        didSet { UserDefaults.standard.set(isEnabled, forKey: Self.enabledKey) }
    }

    var isAuthorized: Bool { authorization == .authorized }

    // MARK: Authorization

    func refreshAuthorization() async {
        guard isSupported else { return }
        authorization = await WorkoutScheduler.shared.authorizationState
    }

    /// Ask the athlete. Returns true only on a real grant — a denial leaves the
    /// feature off rather than half-on.
    @discardableResult
    func enable(bearer: String?, week: AthletePlanWeekResponse?) async -> Bool {
        guard isSupported else { return false }
        authorization = await WorkoutScheduler.shared.requestAuthorization()
        guard authorization == .authorized else { return false }
        isEnabled = true
        await sync(bearer: bearer, week: week)
        return true
    }

    /// Turn it off and take our workouts back off the watch, so nothing we put there
    /// outlives the athlete's consent.
    func disable() async {
        isEnabled = false
        await removeAllOurs()
        scheduledCount = 0
    }

    // MARK: Sync

    /// Mirror the upcoming runs, retiring anything that no longer applies.
    ///
    /// `week` is the already-loaded current week (offset 0) so the common case costs
    /// no extra round-trip; the next week is fetched only when the 7-day horizon
    /// actually reaches into it.
    func sync(bearer: String?, week: AthletePlanWeekResponse?) async {
        guard isEnabled, isSupported, let bearer, !isWorking else { return }
        await refreshAuthorization()
        guard isAuthorized else { return }

        isWorking = true
        defer { isWorking = false }

        // `??` takes an autoclosure, which cannot be async — so the fallback fetch is
        // spelled out rather than folded into the coalesce.
        var loaded = week
        if loaded == nil { loaded = try? await PlanService.fetchWeek(bearer: bearer) }
        guard let current = loaded else { return }
        let todayIso = current.week.todayIso
        guard let lastIso = Self.isoDate(todayIso, plusDays: Self.horizonDays) else { return }

        var days = current.week.days
        // Only reach for the next week when the horizon genuinely crosses this one.
        if lastIso > current.week.weekEnd,
           let next = try? await PlanService.fetchWeek(bearer: bearer, weekOffset: 1) {
            days.append(contentsOf: next.week.days)
        }

        // ISO dates compare lexicographically — the convention the rest of the app
        // already uses for plan dates.
        let upcoming = days
            .filter { $0.isoDate >= todayIso && $0.isoDate <= lastIso }
            .sorted { $0.isoDate < $1.isoDate }

        var desired: [DesiredWorkout] = []
        for day in upcoming {
            guard let date = Self.dateComponents(fromIso: day.isoDate) else { continue }
            for session in day.sessions {
                // A finished session has nothing left to start from the wrist.
                guard !SessionMarkState.of(status: session.status, assignmentId: session.assignmentId).isFinished
                else { continue }
                guard let workout = await customWorkout(for: session, bearer: bearer) else { continue }
                desired.append(
                    DesiredWorkout(
                        assignmentId: session.assignmentId,
                        plan: WKPlan(.custom(workout),
                                     id: FahybrikWorkoutPlanID.planID(forAssignmentId: session.assignmentId)),
                        date: date
                    )
                )
            }
        }

        await reconcile(desired: desired)
    }

    /// Load the session's prescription (cache first, exactly like every other
    /// consumer) and encode it — or decide it does not belong on the wrist.
    private func customWorkout(for session: AthleteWeekDaySession, bearer: String) async -> CustomWorkout? {
        var detail = AssignmentDetailCache.load(session.assignmentId)
        if detail == nil {
            detail = try? await PlanService.fetchAssignmentDetail(session.assignmentId, bearer: bearer)
            if let detail { AssignmentDetailCache.save(detail) }
        }
        guard let detail else { return nil }

        // The honest filter: strength / EMOM / AMRAP never reach the watch.
        guard case let .eligible(structure, name) = AppleWorkoutMapper.eligibility(of: detail) else { return nil }

        return AppleWorkoutMapper.customWorkout(structure: structure, name: name, hrMax: hrZones)
    }

    // MARK: Reconciliation

    private struct DesiredWorkout {
        let assignmentId: String
        let plan: WKPlan
        let date: DateComponents
    }

    /// Bring the watch's queue in line with `desired`:
    ///   · anything of ours that is no longer wanted — or whose content the coach
    ///     changed, or that moved to another day — is REMOVED;
    ///   · anything wanted and not already there identically is SCHEDULED;
    ///   · workouts belonging to other apps are never read as ours and never touched;
    ///   · a workout the athlete already COMPLETED is left exactly as it is, so we
    ///     never erase a completion the wrist recorded.
    private func reconcile(desired: [DesiredWorkout]) async {
        let scheduler = WorkoutScheduler.shared
        let existing = await scheduler.scheduledWorkouts
        let ours = existing.filter { FahybrikWorkoutPlanID.isOurs($0.plan.id) }

        var wanted: [UUID: DesiredWorkout] = [:]
        for item in desired { wanted[item.plan.id] = item }

        // `kept` is everything of ours still occupying a slot (a completed workout
        // still takes one); `live` is only what the athlete can still START, which is
        // the number the UI reports.
        var kept: Set<UUID> = []
        var live: Set<UUID> = []

        for entry in ours {
            guard !entry.complete else {
                // Done on the wrist. Leave it; it ages out of the ±7-day window by
                // itself, and removing it would throw away the completion.
                kept.insert(entry.plan.id)
                continue
            }
            let match = wanted[entry.plan.id]
            let unchanged = match.map {
                $0.plan.workout == entry.plan.workout && Self.sameDay($0.date, entry.date)
            } ?? false

            if unchanged {
                kept.insert(entry.plan.id)
                live.insert(entry.plan.id)
            } else {
                // Stale, edited by the coach, or moved to another day. Remove with the
                // date components the scheduler GAVE us — re-deriving them risks a
                // mismatch that would silently leave the stale entry in place.
                await scheduler.remove(entry.plan, at: entry.date)
            }
        }

        // The cap is global to the scheduler, so other apps' entries eat into it.
        // Budget against what is actually free rather than overwriting someone else's
        // plan or firing schedule calls that quietly do nothing.
        let foreign = existing.count - ours.count
        let budget = max(0, WorkoutScheduler.maxAllowedScheduledWorkoutCount - foreign)

        // Chronological: if the queue cannot hold everything, the athlete keeps the
        // NEXT sessions, not an arbitrary slice.
        for item in desired.sorted(by: { Self.isBefore($0.date, $1.date) }) {
            guard kept.count < budget else { break }
            guard !kept.contains(item.plan.id) else { continue }
            await scheduler.schedule(item.plan, at: item.date)
            kept.insert(item.plan.id)
            live.insert(item.plan.id)
        }
        scheduledCount = live.count
    }

    /// Take every workout WE scheduled off the watch. Note this is a filtered sweep,
    /// not `removeAllWorkouts()` — that call would also delete workouts another app
    /// put on the athlete's watch, which is not ours to do.
    private func removeAllOurs() async {
        let scheduler = WorkoutScheduler.shared
        for entry in await scheduler.scheduledWorkouts where FahybrikWorkoutPlanID.isOurs(entry.plan.id) {
            await scheduler.remove(entry.plan, at: entry.date)
        }
    }

    // MARK: Completion

    /// The athlete finished this session in OUR app. Mark the wrist copy complete so
    /// the native Entrenamiento app stops offering it — otherwise the same session
    /// sits there looking undone and can be started twice.
    func markComplete(assignmentId: String) async {
        guard isEnabled, isSupported, isAuthorized else { return }
        let planID = FahybrikWorkoutPlanID.planID(forAssignmentId: assignmentId)
        let scheduler = WorkoutScheduler.shared
        for entry in await scheduler.scheduledWorkouts where entry.plan.id == planID && !entry.complete {
            await scheduler.markComplete(entry.plan, at: entry.date)
        }
    }

    // MARK: Athlete context

    /// The athlete's max-HR source, set by the app once identity is loaded. Only a
    /// MEASURED max ever resolves an HR band for the watch (see the mapper).
    var hrZones: HRZoneProfile?

    // MARK: Date helpers
    //
    // Plan dates are ISO "YYYY-MM-DD" strings with no time, so the components carry
    // day granularity and nothing more. Inventing an hour would put the session on
    // the wrist at a time the coach never prescribed.
    //
    // `nonisolated` because these are pure string/date arithmetic — they touch no
    // scheduler state, and hopping to the main actor to add seven days would be
    // noise (it also makes them directly testable).

    nonisolated static func dateComponents(fromIso iso: String) -> DateComponents? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return DateComponents(year: parts[0], month: parts[1], day: parts[2])
    }

    nonisolated static func isoDate(_ iso: String, plusDays days: Int) -> String? {
        guard let components = dateComponents(fromIso: iso),
              let date = Calendar.current.date(from: components),
              let shifted = Calendar.current.date(byAdding: .day, value: days, to: date)
        else { return nil }
        let c = Calendar.current.dateComponents([.year, .month, .day], from: shifted)
        guard let y = c.year, let m = c.month, let d = c.day else { return nil }
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    nonisolated static func sameDay(_ lhs: DateComponents, _ rhs: DateComponents) -> Bool {
        lhs.year == rhs.year && lhs.month == rhs.month && lhs.day == rhs.day
    }

    nonisolated static func isBefore(_ lhs: DateComponents, _ rhs: DateComponents) -> Bool {
        (lhs.year ?? 0, lhs.month ?? 0, lhs.day ?? 0) < (rhs.year ?? 0, rhs.month ?? 0, rhs.day ?? 0)
    }
}
