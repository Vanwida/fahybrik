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
    static func aplicar(_ kind: String, a engine: WorkoutSession) -> Resultado {
        switch kind {
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
            // TODO(motor): «+30 s» del descanso vive hoy dentro de `VivoIphoneView.sumar30` (privado, y
            // reparte por cuatro descansos distintos). Cuando sea un método del motor se llama aquí y se
            // anuncia `MirrorWire.Capacidad.mas30`.
            return .pendiente("plus30: el descanso se estira solo desde la vista del iPhone")
        case MirrorWire.CommandKind.vozMuneca:
            // TODO(F4): la muñeca anuncia que habla ella; el móvil calla `AudioCoach` (correr) para no
            // decirlo dos veces y anuncia `MirrorWire.Capacidad.vozCalla`. Depende de la voz en el reloj.
            return .pendiente("vozMuneca: la voz del reloj llega en la fase 4")
        default:
            return .ajeno
        }
    }
}
