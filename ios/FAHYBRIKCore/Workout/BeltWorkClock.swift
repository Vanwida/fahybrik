import Foundation

/// Reloj de TRABAJO en cinta FTMS. El de la sesión (lap / EMOM / AMRAP) es
/// de pared. Éste solo suma cuando la máquina manda velocidad.
enum BeltWorkClock {
    static let minMovingKmh: Double = 0.5

    enum Surface {
        case ftms
        case other
    }

    enum Window {
        case work
        case recovery
        case countIn
        case format
    }

    static func isMoving(_ speedKmh: Double?) -> Bool {
        (speedKmh ?? 0) > minMovingKmh
    }

    /// `beltMoving == nil`: no hay feed FTMS. El reloj de trabajo no se aplica.
    static func applies(surface: Surface, window: Window, beltMoving: Bool?) -> Bool {
        surface == .ftms && window == .work && beltMoving != nil
    }

    static func workTick(wallDt: TimeInterval, surface: Surface,
                         window: Window, beltMoving: Bool?) -> TimeInterval {
        guard applies(surface: surface, window: window, beltMoving: beltMoving) else {
            return wallDt
        }
        return (beltMoving ?? false) ? wallDt : 0
    }
}
