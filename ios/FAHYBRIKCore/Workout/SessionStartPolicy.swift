import Foundation

// UN START, LA RECETA ENTERA.
//
// Antes de que corra el reloj, la sesión declara qué fuentes exige el plan
// (cualquier bloque, cualquier set plegado). No el kind del segmento de ahora,
// no el primer ejercicio, no el título.
//
// Carrera: `involvesRun` o `hasRunStructure` — un HYROX plegado a `.reps` con
// sets de run cuenta. `kind == .running` era el agujero: el GO no preguntaba
// calle/cinta y el GPS no se encendía.
//
// Máquinas: `PreWorkoutDeviceEligibility` (roles nombrados + unscoped). Esta
// pieza sólo responde la pregunta de carrera, que tiene que vivir en Core
// porque el reloj no puede `beginBlock` sin ella.

enum SessionStartPolicy {

    static func needsRunEnvironment(in segments: [WorkoutSegment]) -> Bool {
        segments.contains { $0.involvesRun || $0.hasRunStructure }
    }

    static func needsRunEnvironment(_ plan: WorkoutPlan) -> Bool {
        needsRunEnvironment(in: plan.segments)
    }
}
