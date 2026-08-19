import Foundation

// THE single owner of "belt telemetry → the session's recording".
//
// It is a type and not a few lines inside `ActiveWorkoutView` for the same reason the
// increment math is a type: this is recording logic, and recording logic has to be
// testable and has to run for the WHOLE workout. It used to live in
// `TreadmillHUDModel` — a view model — which made the athlete's belt data a property
// of which screen was open. A run leg inside any other format (an EMOM, a For Time, a
// HYROX sim, a circuit) never opens the treadmill cover, so the belt streamed and the
// session recorded nothing.
//
// WHAT IT DOES NOT DECIDE: whether a sample counts. `WorkoutSession` owns that (the
// tramo must be running work, the session must not be paused/finished), exactly as it
// does for the monitor. This only converts raw telemetry into the increments the
// session accepts, and hands them over.
final class TreadmillSessionFeeder {

    private let session: WorkoutSession
    /// Continuous across legs and tramos ON PURPOSE: the segment total must not lose
    /// the metres that fall between two windows. (The HUD's ring keeps a SEPARATE
    /// tracker that it resets per leg, because a work bout must not inherit the
    /// recovery's metres — a different question with a different answer.)
    private var tracker = TreadmillDistanceTracker()

    init(session: WorkoutSession) {
        self.session = session
    }

    /// Hand one belt sample to the session. Safe to call for every sample of the whole
    /// workout: samples outside running work are dropped by the session's own guards.
    func ingest(_ sample: TreadmillSample) {
        // FTMS viva en un tramo de correr: ella firma los metros, aunque esta
        // muestra todavía no haya avanzado. Una fuente. La cinta tonta nunca
        // llega aquí, y entonces cuenta el HKWorkout indoor del reloj.
        session.claimTreadmillDistanceSource()
        let meters = tracker.increment(from: sample)
        if meters > 0 { session.sampleTreadmillDistance(deltaMeters: meters) }
        // A flat belt (0 %) is a real reading and counts toward the average; nil means
        // the machine reported no inclination at all, which is not a zero (§7).
        if let incline = sample.inclinePct { session.sampleTreadmillIncline(incline) }
        // La VELOCIDAD que declara la máquina, al archivo de la sesión — cruda, sin
        // pasar por `TreadmillSpeedResolver`. Ese resolutor existe porque algunas
        // cintas congelan su velocidad instantánea mientras el cuentakilómetros sigue
        // subiendo, y arregla lo que se PINTA. Lo que se guarda es lo que la máquina
        // dijo: la distancia va en la misma traza y sobre el mismo eje, así que quien
        // lea puede derivar la velocidad real y comparar las dos.
        if let mps = sample.speedMps { session.sampleTreadmillSpeed(metersPerSecond: mps) }
    }

    /// Forget the belt's history — a different machine, or a fresh session.
    func reset() { tracker.reset() }
}
