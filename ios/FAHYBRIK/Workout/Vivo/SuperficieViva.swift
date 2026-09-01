import Foundation

// UN LIVE, UN DISEÑO — quién gana pinta la pantalla entera.
//
// El eje real no es ejercicio-frente-a-bloque: es este árbol de prioridad, el
// mismo que `ActiveWorkoutView` ya resolvía en `superficieViva` + `modalityHUD`.
// La migración a `MarcoVivo` estaba a medias (solo `.emom` y `.fuerza`). El resto
// caía al cromo antiguo (phaseRail PRINCIPAL naranja + ExpertActionButton 40 pt).
//
// Aquí el árbol YA NO puede devolver nil. Quien gana decide la LECTURA
// (ergo / ritmo / ronda / serie). El cromo y la acción son siempre `MarcoVivo`
// + `BotonVivo`. Un fork de cromo por formato es deuda; dejar el árbol viejo
// «por si acaso» es un parche.

/// La superficie que posee el live ahora mismo. Nunca es «el cromo antiguo».
enum SuperficieViva: Equatable, Hashable {
    case relay
    case structural
    case runStructure
    case rest
    case ergo
    case emom
    case conditioning
    case run
    case fuerza

    /// El tramo activo decide. Mismo orden que el árbol real de
    /// `liveSurface` + `modalityHUD` (relevo y estructural antes del HUD;
    /// carrera estructurada antes del descanso; la máquina antes del EMOM).
    ///
    /// El minuto de ski/bici de un EMOM es `.ergo`: la lectura la pone
    /// `ErgHUDContent` dentro de `MarcoVivo`, no `EmomVivoView` ni el cromo C.
    static func de(_ session: WorkoutSession) -> SuperficieViva {
        if session.currentSegmentIsPartnerRelay { return .relay }
        if session.currentBlockIsStructural { return .structural }
        if session.isRunStructureActive { return .runStructure }
        if session.isTramoResting { return .rest }
        if session.tramoIsErg { return .ergo }
        if session.currentSegment?.isEMOM == true { return .emom }
        // Un rodaje es `.running` + `.steady`. `isConditioningTimer` es verdad
        // porque `.steady` es `presentation.continuous` (el motor del timer).
        // Eso no lo convierte en un metcon: la lectura es el ritmo, la misma
        // familia que la tapa de cinta. Cerrar la X no puede caer a
        // `.conditioning`. rotating/fixed en una carrera (serie de intervalos)
        // sí son sujeto de formato — `TreadmillLegResolver.isRunSeries`.
        if session.currentSegment?.kind == .running {
            switch session.currentSegment?.formatScheme?.presentation {
            case .rotating, .fixed: return .conditioning
            default: return .run
            }
        }
        if session.currentSegment?.isConditioningTimer == true { return .conditioning }
        return .fuerza
    }

    /// EMOM y hierro ya montan `MarcoVivo` ellos. El resto entra por `HostVivo`.
    var montaMarcoPropio: Bool {
        switch self {
        case .emom, .fuerza: return true
        case .relay, .structural, .runStructure, .rest, .ergo, .conditioning, .run:
            return false
        }
    }
}
