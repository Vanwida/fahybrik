import Foundation

// LEY DEL TRAMO EN MÁQUINA — un contrato, todos los formatos.
//
// MAPA DE RAÍZ (formato × carril), 19-ago. El código manda; esto es lo que
// el motor YA sabía y lo que no aplicaba:
//
//   Formato        Cursor vivo              PM5 (remo=ski=bike)     FTMS (cinta)
//   -------------  -----------------------  ----------------------  ---------------------
//   EMOM           emomInterval             SÍ (HUD + reset)        NO: superficieViva
//                                           rotation set            exigía kind==.running
//                                                                   y excluía EMOM
//   intervalos     conditioningRound        SÍ en policy            NO: misma puerta de
//                                           si kind/modality erg    kind==.running
//   Tabata/DeathBy conditioningRound        justRow / formatClock   igual
//   For Time       fixedStation SÓLO si     SÍ si estación          SÍ si kind running
//   chipper/HYROX  lista sin `rounds`       si no: segmento entero  si no: 0 m
//   rondas/circuito segmento (no sabe el    connect sí, sample NO   igual
//                   movimiento)             si kind=.reps
//   series/fuerza  NINGUNO (setTable)       connect por involvesErg  no
//   superserie     NINGUNO                  el set abierto no era    no
//                                           el tramo → tramoIsErg
//                                           false en el remo
//   warmup/cool    NINGUNO (checklist)      no HUD, lap sin metros   «6 min sin metros»
//   rodaje/steady  segmento                 SÍ si kind erg          SÍ si kind running
//   AMRAP          segmento acumulado       policy cumulative;      igual
//                                           sample caía si !isErg
//
// GPS carrera sin cinta = otro carril. No se mezcla aquí.
//
// LEY (la misma en todos los formatos):
//   1. Conectar ≠ empezar. El sample no entra en previa ni en pausa.
//   2. 0 → objetivo se ve. La máquina dueña del HUD es la del TRAMO, no la del
//      segmento plegado.
//   3. Al cambiar serie/ronda/estación: nueva clave → reset de ventana.
//   4. El total es la suma de tramos, no el reloj sucio de la máquina.
//
// Un esquema NUEVO que no entre en el `switch` de `worksMachine` no compila.
// El test `MachineTramoLawTests` construye un remo y una cinta por esquema y
// falla si el motor no abre un tramo de máquina.

enum MachineLane: Equatable {
    /// Remo = ski = bike erg. Un protocolo (PM5).
    case pm5
    /// Cinta. Otro protocolo (FTMS). Misma ley.
    case ftms
}

enum MachineTramoLaw {

    /// Qué carril mide esta modalidad. GPS de calle no es máquina.
    static func lane(for modality: PrescriptionModality) -> MachineLane? {
        if modality.isErg { return .pm5 }
        if modality == .run { return .ftms }
        return nil
    }

    /// Todos los formatos del catálogo trabajan la máquina cuando la ventana
    /// viva es medible. Exhaustivo a propósito: un `case` nuevo obliga a decidir.
    static func worksMachine(_ scheme: PrescriptionScheme) -> Bool {
        switch scheme {
        case .forTime, .amrap, .emom, .tabata, .deathBy, .intervals, .steady,
             .chipper, .ladder, .rounds, .hyroxSim, .sets, .superset,
             .warmup, .cooldown:
            return true
        }
    }

    /// El HUD de la máquina es el sujeto cuando el TRAMO es máquina.
    static func machineOwnsHUD(tramo: LiveTramo) -> Bool {
        lane(for: tramo.modality) != nil
    }

    /// ¿El PM5 debe entrar en el acumulador de ESTA ventana?
    ///
    /// Con cursor (EMOM / serie / estación / set) manda la modalidad del tramo:
    /// un remo de superserie cuenta, la sentadilla del turno siguiente no.
    /// Sin cursor (el segmento ES el tramo: AMRAP / rondas libres) se acepta
    /// si el bloque involucra un ergo — tirar el sample era «se conecta y no
    /// trabaja».
    static func recordsPM5(tramo: LiveTramo, segment: WorkoutSegment?) -> Bool {
        if tramo.isErg { return true }
        guard tramo.cursor == .segment, segment?.involvesErg == true, !tramo.isRun else {
            return false
        }
        return true
    }

    /// Gemelo FTMS de `recordsPM5`.
    static func recordsFTMS(tramo: LiveTramo, segment: WorkoutSegment?) -> Bool {
        if tramo.isRun { return true }
        guard tramo.cursor == .segment, segment?.involvesRun == true, !tramo.isErg else {
            return false
        }
        return true
    }
}
