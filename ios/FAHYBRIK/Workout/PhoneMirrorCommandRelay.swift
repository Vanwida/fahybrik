import Foundation

// LOS COMANDOS NUEVOS DE LA MUÑECA (F2) — qué hace el móvil con cada uno.
//
// Regla: se aplica al motor SOLO donde el motor ya tiene el equivalente. Donde falta,
// el comando queda definido en el cable (`MirrorWire.CommandKind`) y aquí con su TODO
// señalado: inventar el gesto en este sitio duplicaría lo que hoy vive dentro de una
// vista del iPhone, y un móvil que dice «deshecho» sin deshacer nada es peor que uno
// que calla. Mientras no estén, el móvil NO anuncia la capacidad
// (`PhoneMirrorFrameBuilder.capacidades`) y la muñeca no ofrece el botón.

enum PhoneMirrorCommandRelay {

    enum Resultado: Equatable {
        /// El motor lo atendió.
        case aplicado
        /// El comando es válido pero el motor aún no tiene con qué atenderlo (el porqué, para el registro).
        case pendiente(String)
        /// No es un comando de este relé.
        case ajeno
    }

    @MainActor
    static func aplicar(_ kind: String, declaracion: Vivo.Declaracion? = nil, a engine: WorkoutSession) -> Resultado {
        switch kind {
        case MirrorWire.CommandKind.anotar:
            // Lo que la muñeca declara en el descanso de fuerza (reps, carga, RIR o RPE): entra por la MISMA puerta que
            // el vivo del iPhone (`vivoDeclarar`), así que el motor no distingue quién lo dijo.
            guard let d = declaracion else { return .pendiente("anotar: sin dato") }
            engine.vivoDeclarar(d, pasos: Vivo.planDe(engine).pasos)
            return .aplicado
        case MirrorWire.CommandKind.newLap:
            // La deuda FH-30: el motor YA cierra una vuelta libre (`WorkoutSession.applyCommand`),
            // pero el móvil no le pasaba el comando de la muñeca. Sus propias reglas (no en una
            // estructura de series, no en pausa) deciden si la vuelta cuenta.
            engine.applyCommand(kind)
            return .aplicado
        case MirrorWire.CommandKind.undo:
            // TODO(motor): deshacer el cierre de un tramo de correr. El motor no lo tiene: `stepBack`
            // retrocede de SEGMENTO (no de pierna) y `VivoIphoneView.deshacer` es privado de una vista.
            // Se atiende cuando el motor exponga «reabrir el último tramo» y entonces se anuncia
            // `MirrorWire.Capacidad.deshacer`.
            return .pendiente("undo: el motor no reabre un tramo de correr")
        case MirrorWire.CommandKind.plus30:
            // «+30 s»: `vivoSumar30` reparte por los cuatro descansos del motor (serie, lista fija, rotativo, EMOM).
            return engine.vivoSumar30() ? .aplicado : .pendiente("plus30: no hay descanso que estirar")
        case MirrorWire.CommandKind.vozMuneca:
            // TODO(F4): la muñeca anuncia que habla ella; el móvil calla `AudioCoach` (correr) para no
            // decirlo dos veces y anuncia `MirrorWire.Capacidad.vozCalla`. Depende de la voz en el reloj.
            return .pendiente("vozMuneca: la voz del reloj llega en la fase 4")
        default:
            return .ajeno
        }
    }
}
