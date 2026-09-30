#if DEBUG
import SwiftUI

// CASOS DE EJEMPLO DE LO QUE PASA ANTES DE ENTRENAR — para las `#Preview` y la galería de pruebas
// (`GaleriaPreviaRenderTests`). Son casos, no datos de producción: cada uno cubre una forma del dominio
// que la ficha y la puerta tienen que saber pintar (tabla de hierro, carrera con zona, WOD con reloj,
// EMOM que alterna, superserie, sin detalle).

enum EjemplosPrevia {

    // MARK: Las sesiones

    /// Fuerza de pierna: calentamiento plegado, 4×5 uniforme con su carga según 1RM, una pirámide con tempo
    /// y descanso, la vuelta a la calma y la nota del coach.
    static var fuerza: AssignmentDetail {
        detalle("Fuerza · pierna", nota: "Hoy el peso muerto va pesado: si la barra se frena, corta la serie.", minutos: 55, bloques: [
            bloque(1, "Calentamiento", "straight_sets", [
                item(1, "Movilidad de cadera", "mobility", rx(.sets, .mobility, [serie(.duration(seconds: 60))]), cues: "Sin rebotes"),
                item(2, "Sentadilla goblet", "strength", rx(.sets, .strength, [serie(.reps(10))])),
            ]),
            bloque(2, "Fuerza", "straight_sets", [
                item(3, "Back Squat", "strength",
                     rx(.sets, .strength, Array(repeating: serie(.reps(5), .percentRM(value: 80, min: nil, max: nil), descanso: 180), count: 4)),
                     carga: ResolvedLoad(pctLabel: "80 %", kgLabel: "96 kg", minKg: 96, maxKg: nil, oneRmKg: 120, needsReview: false),
                     video: "https://example.com/squat.mp4"),
                item(4, "Peso muerto", "strength", rx(.sets, .strength, [
                    serie(.reps(5), .kg(value: 110, min: nil, max: nil), descanso: 150, tempo: "3-1-1"),
                    serie(.reps(3), .kg(value: 125, min: nil, max: nil), descanso: 180, tempo: "3-1-1"),
                    serie(.reps(1), .kg(value: 140, min: nil, max: nil), descanso: 240, tempo: "3-1-1"),
                ])),
            ]),
            bloque(3, "Vuelta a la calma", "straight_sets", [
                item(5, "Estiramiento de isquios", "mobility", rx(.sets, .mobility, [serie(.duration(seconds: 90))])),
            ]),
        ])
    }

    /// Una carrera con estructura: un solo ítem, dieciséis tramos en zona 4.
    static var carrera: AssignmentDetail {
        detalle("Fartlek 16 × 500 m", nota: nil, minutos: 50, bloques: [
            bloque(1, "Principal", "intervals", [
                item(1, "Carrera", "running", rx(.intervals, .run,
                     Array(repeating: serie(.distance(meters: 500), .hrZone(value: 4, min: nil, max: nil), descanso: 60), count: 16))),
            ]),
        ])
    }

    /// Un WOD con reloj, un EMOM que alterna y una superserie: las tres formas que se pliegan.
    static var wod: AssignmentDetail {
        detalle("Metcon de estaciones", nota: nil, minutos: 45, bloques: [
            bloque(1, "EMOM 12", "emom", [
                item(1, "Wall balls", "functional", rx(.emom, .functional, [serie(.reps(15))], rondas: 12)),
                item(2, "SkiErg", "ski_erg", rx(.emom, .ski, [serie(.calories(12))], rondas: 12)),
            ]),
            bloque(2, "Superserie", "superset", [
                item(3, "Press banca", "strength", rx(.sets, .strength, Array(repeating: serie(.reps(8), .kg(value: 60, min: nil, max: nil)), count: 4))),
                item(4, "Remo con barra", "strength", rx(.sets, .strength, Array(repeating: serie(.reps(10)), count: 3))),
            ]),
            bloque(3, "Metcon", "for_time", [
                item(5, "Burpees", "functional", rx(.forTime, .functional, [serie(.reps(20))])),
                item(6, "Remo", "rowing", rx(.forTime, .row, [serie(.distance(meters: 500))])),
                item(7, "Sandbag lunges", "functional", rx(.forTime, .functional, [serie(.distance(meters: 100))])),
            ]),
        ])
    }

    /// La asignación sin detalle (primera apertura sin red): el plan conserva el título.
    static var sinDetalle: AssignmentDetail {
        detalle("Series en cuesta", nota: nil, minutos: nil, bloques: [])
    }

    /// El plan que lanza el motor, sacado del detalle como lo saca la app.
    static func plan(de detalle: AssignmentDetail) -> WorkoutPlan {
        WorkoutPlan.from(detail: detalle) ?? WorkoutPlan(
            id: UUID(), name: detalle.workout?.name ?? "Sesión", format: .sets,
            estimatedDurationSeconds: (detalle.workout?.estimatedDurationMinutes ?? 0) * 60, blockContext: "",
            zoneTargets: [], equipment: [], segments: [], coachNote: detalle.workout?.coachNote,
            demoVideoUrl: nil, warmupChecklist: []
        )
    }

    // MARK: Las puertas

    static var puertaFuerza: (plan: WorkoutPlan, segmentos: [WorkoutSegment]) {
        let p = plan(de: fuerza)
        return (p, p.segments.filter { $0.blockTitle == "Fuerza" })
    }

    static var puertaUnaCosa: (plan: WorkoutPlan, segmentos: [WorkoutSegment]) {
        let p = plan(de: carrera)
        return (p, p.segments)
    }

    static var puertaWod: (plan: WorkoutPlan, segmentos: [WorkoutSegment]) {
        let p = plan(de: wod)
        return (p, p.segments.filter { $0.blockTitle == "Metcon" })
    }

    // MARK: Andamio

    private static let sinParams = WorkoutItemParams(
        sets: nil, reps: nil, loadKg: nil, loadPct: nil, rpe: nil, restSeconds: nil,
        durationSeconds: nil, distanceKm: nil, distanceMeters: nil, paceSecPerKm: nil,
        cadenceSpm: nil, calories: nil, caloriesPerMin: nil, hrZone: nil, watts: nil
    )

    private static func serie(_ m: Measure, _ t: Target? = nil, descanso: Int? = nil, tempo: String? = nil) -> PrescriptionSet {
        PrescriptionSet(measure: m, target: t, modality: nil, restS: descanso, tempo: tempo, note: nil)
    }

    private static func rx(_ esquema: PrescriptionScheme, _ modalidad: PrescriptionModality, _ series: [PrescriptionSet], rondas: Int? = nil) -> Prescription {
        Prescription(scheme: esquema, modality: modalidad, sets: series, rounds: rondas, workS: nil, restS: nil,
                     totalS: nil, target: nil, note: nil, start: nil, increment: nil)
    }

    private static func item(_ id: Int, _ nombre: String, _ categoria: String, _ rx: Prescription,
                             carga: ResolvedLoad? = nil, cues: String? = nil, video: String? = nil) -> WorkoutItem {
        WorkoutItem(uid: "item-\(id)", templateSegmentId: id, exerciseId: "e\(id)", exerciseName: nombre,
                    exerciseSlug: nombre.lowercased(), exerciseCategory: categoria, exerciseVideoUrl: video,
                    cues: cues, exerciseDescription: nil, paramsJson: WorkoutItemParams(derivedFrom: rx),
                    prescription: rx, resolvedIntensity: nil, resolvedLoad: carga, notes: nil)
    }

    private static func bloque(_ pos: Int, _ titulo: String, _ formato: String, _ items: [WorkoutItem]) -> WorkoutBlock {
        WorkoutBlock(uid: "b\(pos)", title: titulo, format: formato, blockPosition: pos,
                     coachNote: nil, configJson: nil, items: items)
    }

    private static func detalle(_ nombre: String, nota: String?, minutos: Int?, bloques: [WorkoutBlock]) -> AssignmentDetail {
        AssignmentDetail(
            assignment: AssignmentInfo(id: "1", athleteId: "a", scheduledFor: "2026-09-30", status: "scheduled",
                                       slot: nil, templateId: nil, templateVersion: nil, completedAt: nil,
                                       perceivedExertion: nil, stationAssignment: nil, myRole: nil, storeResults: nil),
            workout: WorkoutDetail(name: nombre, focus: nil, coachNote: nota, estimatedDurationMinutes: minutos,
                                   blocks: bloques, storeResults: nil),
            execution: nil, runCompliance: nil, clockPrescription: nil, clockFormat: nil
        )
    }
}

// MARK: - Previews

#Preview("Ficha · fuerza") {
    PreWorkoutBriefView(plan: EjemplosPrevia.plan(de: EjemplosPrevia.fuerza), detail: EjemplosPrevia.fuerza,
                        onStart: {}, onManualLog: {}, showCaptureLog: true, onClose: {})
}

#Preview("Ficha · carrera · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    PreWorkoutBriefView(plan: EjemplosPrevia.plan(de: EjemplosPrevia.carrera), detail: EjemplosPrevia.carrera,
                        onStart: {}, onManualLog: {}, onClose: {})
}

#Preview("Ficha · WOD · lista para empezar") {
    PreWorkoutBriefView(plan: EjemplosPrevia.plan(de: EjemplosPrevia.wod), detail: EjemplosPrevia.wod,
                        onStart: {}, onManualLog: {}, onClose: {}, readyToStart: true)
}

#Preview("Ficha · sin detalle") {
    PreWorkoutBriefView(plan: EjemplosPrevia.plan(de: EjemplosPrevia.sinDetalle), detail: EjemplosPrevia.sinDetalle,
                        onStart: {}, onManualLog: {}, onClose: {})
}

#Preview("Puerta · un ítem") {
    let p = EjemplosPrevia.puertaUnaCosa
    BlockPreviewGate(title: "Principal", phaseTag: "Principal", blockNumber: 1, blockCount: 1, formatLabel: nil,
                     segments: p.segmentos, canGoBack: false, onStartBlock: {}, onBack: {}, onExit: {}, alVerBloques: {})
}

#Preview("Puerta · WOD · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    let p = EjemplosPrevia.puertaWod
    BlockPreviewGate(title: "Metcon", phaseTag: "Principal", blockNumber: 3, blockCount: 3, formatLabel: "For Time",
                     pacing: .circuito, segments: p.segmentos, canGoBack: true,
                     onStartBlock: {}, onBack: {}, onExit: {}, alVerBloques: {})
}
#endif
