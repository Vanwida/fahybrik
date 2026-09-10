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
    /// EMOM gana sobre ergo: el minuto de ski/bici sigue en `.emom` (mismo cromo);
    /// las métricas PM5 entran como sujeto inyectado, no como otro árbol.
    static func de(_ session: WorkoutSession) -> SuperficieViva {
        if session.currentSegmentIsPartnerRelay { return .relay }
        // Warmup that opens a run lives in the run chrome (same view). A mobility
        // warmup with no run after still uses the structural host.
        if session.currentBlockIsStructural && !session.calentamientoEnLaCarrera {
            return .structural
        }
        if session.isRunStructureActive { return .runStructure }
        // El FORMATO manda sobre el tramo: EMOM/HYROX no cambian de cromo al pasar
        // ski → run → descanso; solo cambia la banda sujeto dentro del mismo shell.
        // El descanso intra-EMOM sigue en `.emom` (contexto EMOM + banda descanso).
        if session.currentSegment?.isEMOM == true { return .emom }
        if session.isTramoResting { return .rest }
        if session.tramoIsRun { return .run }
        if session.calentamientoEnLaCarrera { return .run }
        if session.tramoIsErg { return .ergo }
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

    /// Todas las ramas montan el mismo `MarcoVivo` global; solo cambia el sujeto.
    var montaMarcoPropio: Bool { false }

    /// Carrera estructurada o rodaje: estas dos ramas son UN live.
    var esCarrera: Bool {
        self == .run || self == .runStructure
    }
}

/// Qué bandas outdoor/cinta inyecta `RunLiveShellView` cuando el tramo mide run.
/// No es un entry point — solo elige sujeto/apoyos dentro del shell único.
enum RunLiveChrome: Equatable {
    case outdoor
    case treadmill(empiezaSinCinta: Bool)
    case host

    static func de(_ session: WorkoutSession) -> RunLiveChrome {
        // Métricas de carrera (outdoor/cinta) cuando el tramo mide run — también
        // dentro de EMOM/HYROX, sin cambiar la superficie `.emom`.
        let runMetrics = session.tramoIsRun
            || session.calentamientoEnLaCarrera
            || SuperficieViva.de(session).esCarrera
        guard runMetrics, let env = session.runEnvironment else { return .host }
        switch RunCoverAutoOpen.decide(environment: env) {
        case .outdoor: return .outdoor
        case .treadmill(let sinCinta): return .treadmill(empiezaSinCinta: sinCinta)
        }
    }
}

/// UN presentador. La puerta de bloque y el live no pueden estar a la vez.
///
/// En 50 (FH-55) las tapas Outdoor/Treadmill ya no existen. El leftover de
/// Libre + calentamiento era el `ZStack` que montaba `cromoDeCarrera` debajo
/// de `BlockPreviewGate` mientras `isAwaitingBlockStart`. Dos canales, el
/// mismo hueco de clase que dos `fullScreenCover(isPresented:)` (Apple: cada
/// Bool es una presentación). El Watch ya hace XOR (`LiveFlowView.liveArea`).
/// WorkoutKit `CustomWorkout.warmup` es un paso del mismo workout, no otra
/// sesión ni otra tapa.
enum PresentadorVivo: Equatable {
    case puerta
    case live(SuperficieViva)

    static func de(_ session: WorkoutSession) -> PresentadorVivo {
        if session.isAwaitingBlockStart { return .puerta }
        return .live(SuperficieViva.de(session))
    }
}
