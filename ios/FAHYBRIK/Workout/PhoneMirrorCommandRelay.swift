import Foundation

// LOS COMANDOS NUEVOS DE LA MUÑECA (F2) — qué hace el móvil con cada uno.
//
// Regla: se aplica al motor SOLO donde el motor ya tiene el equivalente, y el móvil solo
// anuncia (`PhoneMirrorFrameBuilder.capacidades`) lo que atiende de verdad: un móvil que dice
// «deshecho» sin deshacer nada es peor que uno que calla.

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
    static func aplicar(_ kind: String, declaracion: Vivo.Declaracion? = nil, activa: Bool? = nil, a engine: WorkoutSession) -> Resultado {
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
            // Reabre el último tramo de correr cerrado a mano (`stepBack` retrocede de SEGMENTO, no de tramo).
            // Pasados los 5 s, o si lo último no fue el cierre de un tramo, el motor no hace nada.
            return engine.undoRunLegClose() ? .aplicado : .pendiente("undo: no hay un tramo de correr que reabrir")
        case MirrorWire.CommandKind.plus30:
            // «+30 s»: `vivoSumar30` reparte por los cuatro descansos del motor (serie, lista fija, rotativo, EMOM).
            return engine.vivoSumar30() ? .aplicado : .pendiente("plus30: no hay descanso que estirar")
        case MirrorWire.CommandKind.vozMuneca:
            // La muñeca dice que habla ella (o que ya no): el móvil calla su entrenador de voz para no decirlo dos
            // veces. Sin valor, sí: un reloj que anuncia su voz es que habla.
            AudioCoach.shared.setWristSpeaks(activa ?? true)
            return .aplicado
        default:
            return .ajeno
        }
    }
}
