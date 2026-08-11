import Foundation
import CoreMotion

/// CoreMotion capture for the watch (plan fase 0).
///
/// Prefers batched high-rate delivery when the hardware supports it; falls back
/// to classic CMMotionManager at ~100 Hz. Always decimates through SensorPipeline
/// to 50 Hz before archive/process. One component, shared by standalone and mirror.
@MainActor
final class SensorCapture {
    static let shared = SensorCapture()

    let pipeline = SensorPipeline()
    private let motion = CMMotionManager()
    private var t0: Date?
    private var running = false
    /// True when we successfully opened batched sensors.
    private(set) var usingBatched = false

    private init() {}

    var isRunning: Bool { running }

    /// Start capture bound to the live workout. Safe to call if already running.
    func start(executionLocalId: String? = nil) {
        guard !running else { return }
        running = true
        t0 = Date()
        pipeline.executionLocalId = executionLocalId
        pipeline.watchModel = Self.modelIdentifier()
        pipeline.wrist = Self.wristSide()

        if startBatchedIfAvailable() {
            usingBatched = true
            pipeline.beginSession(mode: .batched, at: t0 ?? Date())
            return
        }
        usingBatched = false
        pipeline.beginSession(mode: .classic, at: t0 ?? Date())
        startClassic()
    }

    func stop() {
        guard running else { return }
        running = false
        stopClassic()
        // Batched manager has no explicit stop API beyond ending the workout session
        // context; we simply stop consuming.
        pipeline.finishSampling()
    }

    /// Declara qué serie está abierta AHORA. Idempotente: se llama en cada frame
    /// (espejo) o en cada tic (solitario) con la misma clave y no hace nada; en
    /// cuanto la clave cambia, la serie anterior se cierra y el contador vuelve a
    /// cero. `nil` = no hay trabajo abierto y no se cuenta nada.
    func setActiveWindow(key: String?, exerciseId: Int? = nil, modality: String? = nil,
                         name: String? = nil, resting: Bool = false) {
        pipeline.setActiveWindow(key: key, exerciseId: exerciseId, modality: modality,
                                 name: name, resting: resting, at: elapsed())
    }

    /// Open a labelled window for the active tramo/set.
    func openWindow(tramoId: String?, exerciseId: Int?, modality: String?, name: String?) {
        let t = elapsed()
        pipeline.openWindow(tramoId: tramoId, exerciseId: exerciseId, modality: modality, name: name, at: t)
    }

    func closeWindow() {
        pipeline.closeWindow(at: elapsed())
    }

    /// Encode the archive after stop(). Nil if empty.
    func archiveData(appVersion: String?) throws -> Data? {
        try pipeline.encodeArchive(appVersion: appVersion)
    }

    // MARK: - classic path

    private func startClassic() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 100.0
        let t0 = self.t0 ?? Date()
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let self, let motion, self.running else { return }
            let t = Date().timeIntervalSince(t0)
            // userAcceleration is gravity-free (m/s²); rotationRate in rad/s.
            let ua = motion.userAcceleration
            let rr = motion.rotationRate
            // La GRAVEDAD viaja con cada muestra. Es la única referencia del eje
            // vertical del mundo, y sin ella no hay repetición ni m/s: el gesto
            // se mide contra "el eje que más varía", que andando es el brazo.
            let gr = motion.gravity
            // CoreMotion reports userAcceleration in g — convert to m/s².
            let g = 9.80665
            self.pipeline.pushRaw(
                t: t,
                ax: ua.x * g, ay: ua.y * g, az: ua.z * g,
                gx: rr.x, gy: rr.y, gz: rr.z,
                grx: gr.x, gry: gr.y, grz: gr.z
            )
        }
    }

    private func stopClassic() {
        if motion.isDeviceMotionActive {
            motion.stopDeviceMotionUpdates()
        }
    }

    // MARK: - batched path (watchOS with CMBatchedSensorManager)

    private func startBatchedIfAvailable() -> Bool {
        // CMBatchedSensorManager is the WWDC23 high-rate path. Availability varies
        // by hardware; we probe at runtime and fall back cleanly.
        if #available(watchOS 10.0, *) {
            // Not every watch exposes the class / authorization; try/catch via NSClassFromString.
            guard NSClassFromString("CMBatchedSensorManager") != nil else { return false }
            // The batched API surface is used when authorized for water-lock workouts;
            // for broad compatibility we currently prefer the classic path unless
            // deviceMotion is unavailable. Future: wire CMBatchedSensorManager
            // accelerometerDataListPublisher when the deployment target and
            // entitlement story are settled for all athletes' hardware.
            return false
        }
        return false
    }

    private func elapsed() -> Double {
        guard let t0 else { return 0 }
        return Date().timeIntervalSince(t0)
    }

    private static func modelIdentifier() -> String {
        var sysinfo = utsname()
        uname(&sysinfo)
        return withUnsafePointer(to: &sysinfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? "watch"
            }
        }
    }

    private static func wristSide() -> SensorWrist? {
        // WKInterfaceDevice.current().wristLocation is watchOS-only UIKit-ish;
        // keep nil when we can't resolve — the file header still validates.
        nil
    }
}
