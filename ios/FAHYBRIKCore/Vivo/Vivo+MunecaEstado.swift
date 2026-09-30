import Foundation

// EL ADAPTADOR DEL MOTOR A LA MUÑECA — de `WorkoutSession` (el motor que ya
// corre en el reloj) al `Vivo.EstadoVivo` y al `CuadroMuneca` que pinta. No
// hay un segundo adaptador: reutiliza `Vivo.planDe(_:zonas:entorno:)` y
// `Vivo.estadoDe(_:plan:externo:)`, los mismos del iPhone (`VivoIphoneView`).
//
// Lo único propio de la muñeca es de dónde salen tres lecturas que el motor no
// ve: el ritmo ACTUAL (`Vivo.VentanaDeRitmo`, sobre lo que entrega el builder),
// el estado del GPS y el enlace con el móvil.
//
// El ritmo que llega manda SIEMPRE, también cuando no se sabe: el motor sabe la
// MEDIA del tramo (`liveCoveredPaceSecPerKm`) y la muñeca no la rotula «ritmo».
// Sin ritmo actual, el héroe cae a lo que falta o al crono (P3), jamás a un
// número que parece una medida de ahora y no lo es.

extension Vivo {

    /// Lo que la muñeca sabe y el motor no.
    struct FuentesMuneca: Equatable {
        /// Ritmo ACTUAL suavizado (~10 s), s/km; `nil` = no se sabe (`Vivo.ritmoActual`).
        var ritmoActual: Double? = nil
        var gps: EstadoGps = .noAplica
        var enlace: Enlace = .solo
        /// Campos que dependen de un aparato y no llegan (además de los del enlace).
        var viejos: [CampoVivo] = []
        /// Pasos por minuto del podómetro, si los hay.
        var cadencia: Double? = nil
    }

    /// El GPS de la muñeca desde la precisión del último fijado (m): con fijado suficiente,
    /// listo; sin fijado o con mala precisión, buscando. La misma vara que el iPhone
    /// (`GPSSignalQuality`). El cuadro ignora este estado en cinta y en pasos sin GPS.
    static func estadoGps(precisionM: Double?) -> EstadoGps {
        guard let precisionM else { return .buscando }
        return GPSSignalQuality.from(horizontalAccuracyM: precisionM) == .searching ? .buscando : .listo
    }

    /// El plan de la sesión en pasos, con las zonas y el entorno que ya lleva el motor.
    static func planDe(_ sesion: WorkoutSession, test: Bool = false) -> PlanVivo {
        planDe(sesion.plan, zonas: sesion.hrZones, entorno: sesion.runEnvironment, test: test)
    }

    /// El estado vivo de la muñeca: el del motor con el ritmo actual, el GPS y el enlace de la muñeca.
    static func estadoDeMuneca(_ sesion: WorkoutSession, plan: PlanVivo, fuentes: FuentesMuneca = FuentesMuneca()) -> EstadoVivo {
        let externo = LecturaExterna(cadencia: fuentes.cadencia, ritmo: fuentes.ritmoActual, gps: fuentes.gps, viejos: fuentes.viejos)
        var e = estadoDe(sesion, plan: plan, externo: externo)
        // El ritmo actual manda aunque sea nil: la media del tramo no es «ritmo».
        e.lecturas.ritmo = fuentes.ritmoActual
        e.enlace = fuentes.enlace
        return e
    }

    /// Todo lo que pinta la muñeca ahora mismo, del motor.
    static func cuadroDeMuneca(_ sesion: WorkoutSession, plan: PlanVivo, fuentes: FuentesMuneca = FuentesMuneca(),
                               registro: RegistroVueltas = RegistroVueltas(), entorno: EntornoMuneca = EntornoMuneca()) -> CuadroMuneca {
        cuadroMuneca(estadoDeMuneca(sesion, plan: plan, fuentes: fuentes), registro: registro, entorno: entorno)
    }
}
