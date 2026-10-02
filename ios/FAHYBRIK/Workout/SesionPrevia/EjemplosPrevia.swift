#if DEBUG
import SwiftUI

// CASOS DE EJEMPLO DE LO QUE PASA ANTES DE ENTRENAR — para las `#Preview` de la ficha y de la puerta de bloque.
//
// Son casos, no datos de producción: cada uno cubre una forma del dominio que la ficha tiene que saber pintar, y
// pasa por el mismo camino que la app (`PreWorkoutBriefView` → `LecturaSesionPrevia` → `LecturaFicha.desde`).
//
//   · fuerza: una rampa de cargas con tempo y descanso, un %RM resuelto a kilos con tu 1RM y la nota del coach;
//   · simulación: ocho estaciones precedidas de la misma carrera;
//   · EMOM: dos movimientos que se alternan minuto a minuto;
//   · series: una carrera por tramos con su estructura (seis veces fuerte, trote en medio);
//   · sin detalle: la asignación llega sin ejercicios.

enum EjemplosPrevia {

    // MARK: Las sesiones

    static var fuerza: AssignmentDetail {
        detalle("Fuerza A · sentadilla y empuje",
                nota: "La sentadilla manda hoy. Las dos primeras series son para entrar en calor: ligeras y con el tempo marcado. En el press, para una repetición antes del fallo.",
                minutos: 70, bloques: [
            bloque(1, "Calentamiento", "straight_sets", [
                item(1, "BikeErg", "bike_erg", rx(.sets, .bike, [serie(.duration(seconds: 300), .rpe(value: 3, min: nil, max: nil))])),
                item(2, "Leg Swings", "mobility", rx(.sets, .mobility, [serie(.reps(10)), serie(.reps(10))]), cues: "Sin rebotes"),
            ]),
            bloque(2, "Fuerza", "straight_sets", [
                item(3, "Back Squat", "strength", rx(.sets, .strength, [
                    serie(.reps(5), .kg(value: 60, min: nil, max: nil), descanso: 90, tempo: "3-1-1"),
                    serie(.reps(5), .kg(value: 70, min: nil, max: nil), descanso: 90, tempo: "3-1-1"),
                    serie(.reps(5), .kg(value: 80, min: nil, max: nil), descanso: 150, tempo: "3-1-1"),
                    serie(.reps(5), .kg(value: 80, min: nil, max: nil), descanso: 150, tempo: "3-1-1"),
                    serie(.reps(5), .kg(value: 80, min: nil, max: nil), tempo: "3-1-1"),
                ]), nota: "Baja hasta que el muslo pase la paralela. Pausa de un segundo abajo.", video: Self.videoDeEjemplo),
                item(4, "Bench Press", "strength",
                     rx(.sets, .strength, Array(repeating: serie(.reps(8), .percentRM(value: 70, min: nil, max: nil), descanso: 120, tempo: "2-0-1"), count: 4)),
                     carga: ResolvedLoad(pctLabel: "70 %", kgLabel: "56 kg", minKg: 56, maxKg: nil, oneRmKg: 80, needsReview: false)),
                item(5, "Pull-Up", "strength",
                     rx(.sets, .strength, Array(repeating: serie(.reps(6), .rpe(value: 8, min: nil, max: nil), descanso: 90), count: 3))),
            ]),
            bloque(3, "Vuelta a la calma", "straight_sets", [
                item(6, "Foam roll lower body", "mobility", rx(.sets, .mobility, [serie(.duration(seconds: 300))])),
            ]),
        ])
    }

    /// Una simulación tipo HYROX: «Run 1 km, estación» ocho veces, que la ficha pliega en ocho estaciones.
    static var simulacion: AssignmentDetail {
        let paradas: [Parada] = [
            Parada("SkiErg", "ski_erg", .ski, .distance(meters: 1000)),
            Parada("Sled Push", "functional", .functional, .distance(meters: 50), kg: 152),
            Parada("Sled Pull", "functional", .functional, .distance(meters: 50), kg: 103),
            Parada("Burpee Broad Jump", "functional", .functional, .distance(meters: 80)),
            Parada("Rowing", "rowing", .row, .distance(meters: 1000)),
            Parada("Farmers Carry", "functional", .functional, .distance(meters: 200), kg: 24),
            Parada("Sandbag Lunges", "functional", .functional, .distance(meters: 100), kg: 20),
            Parada("Wall Balls", "functional", .functional, .reps(100), kg: 9),
        ]
        let items = paradas.enumerated().flatMap { i, parada in
            [item(2 * i + 1, "Run", "running", rx(.forTime, .run, [serie(.distance(meters: 1000))])),
             item(2 * i + 2, parada.nombre, parada.categoria, rx(.forTime, parada.modalidad, [serie(parada.medida, parada.carga)]))]
        }
        return detalle("Simulación HYROX",
                       nota: "Hoy haces la carrera entera de una tirada. No salgas a tope: quiero verte salir de cada estación corriendo, no andando.",
                       minutos: nil, bloques: [
            bloque(1, "Calentamiento", "straight_sets", [
                item(100, "BikeErg", "bike_erg", rx(.sets, .bike, [serie(.duration(seconds: 300), .rpe(value: 3, min: nil, max: nil))])),
            ]),
            bloque(2, "Simulación HYROX", "for_time", items),
        ])
    }

    /// Dos movimientos que alternan: el minuto impar, remo; el par, wall balls.
    static var emom: AssignmentDetail {
        detalle("EMOM 12 minutos", nota: nil, minutos: nil, bloques: [
            bloque(1, "Calentamiento", "straight_sets", [
                item(1, "BikeErg", "bike_erg", rx(.sets, .bike, [serie(.duration(seconds: 300), .rpe(value: 3, min: nil, max: nil))])),
            ]),
            bloque(2, "Remo y wall balls", "emom", [
                item(2, "Rowing", "rowing", rx(.emom, .row, [serie(.calories(12))], rondas: 12)),
                item(3, "Wall Balls", "functional", rx(.emom, .functional, [serie(.reps(12), .kg(value: 9, min: nil, max: nil))], rondas: 12)),
            ], nota: "Si acabas antes del minuto, descansa lo que sobre. Si no llegas, para y espera al siguiente."),
        ])
    }

    /// Una carrera por tramos con su estructura: seis veces 800 m a 4:10/km con 1:30 de trote en medio.
    static var series: AssignmentDetail {
        let trabajo = RunElement.segment(RunSegment(kind: .work, measure: .distance(m: 800), target: .pace(valueS: 250, minS: nil, maxS: nil),
                                                    resolved: nil, inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
        let trote = RunElement.segment(RunSegment(kind: .recovery, measure: .duration(s: 90), target: nil,
                                                  resolved: nil, inclinePct: nil, cadenceSpm: nil, recoveryMode: .trote))
        let tramos: RunStructure = [RunPhase(role: .main, elements: [.repeatBlock(times: 6, elements: [trabajo, trote])])]
        return detalle("Series 6 × 800 m",
                       nota: "Las dos primeras salen controladas: tienen que ser las más lentas. De la cuarta en adelante, aguanta el ritmo aunque duela.",
                       minutos: nil, bloques: [
            bloque(1, "Calentamiento", "straight_sets", [
                item(1, "Carrera", "running", rx(.steady, .run, [serie(.duration(seconds: 900), .hrZone(value: 2, min: nil, max: nil))])),
            ]),
            bloque(2, "Series", "intervals", [
                item(2, "Carrera", "running", rx(.intervals, .run, nil, structure: tramos)),
            ]),
            bloque(3, "Vuelta a la calma", "straight_sets", [
                item(3, "Carrera", "running", rx(.steady, .run, [serie(.duration(seconds: 600), .hrZone(value: 1, min: nil, max: nil))])),
            ]),
        ])
    }

    /// La asignación sin detalle (primera apertura sin red): el plan conserva el título.
    static var sinDetalle: AssignmentDetail {
        detalle("Series en cuesta", nota: "Hoy sal a rodar por sensaciones. Te escribo el detalle por el chat.", minutos: nil, bloques: [])
    }

    /// Lo que la ficha necesita de fuera del detalle, como lo trae el Plan.
    static let contexto = ContextoFicha(cuando: "Hoy", coach: "Pablo", duracion: .init(texto: "desde 1 h 10 min", llevaNumero: true))

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

    static var puertaUnaCosa: (plan: WorkoutPlan, segmentos: [WorkoutSegment]) {
        let p = plan(de: series)
        return (p, p.segments.filter { $0.blockTitle == "Series" })
    }

    static var puertaSimulacion: (plan: WorkoutPlan, segmentos: [WorkoutSegment]) {
        let p = plan(de: simulacion)
        return (p, p.segments.filter { $0.blockTitle == "Simulación HYROX" })
    }

    // MARK: Andamio

    /// Un vídeo con la forma de uno subido por el coach (Cloudflare Stream): sin cuenta real, así que el póster no llega
    /// y se ve la loseta con la marca de que hay vídeo.
    private static let videoDeEjemplo = "https://customer-ejemplo.cloudflarestream.com/0123456789abcdef0123456789abcdef/manifest/video.m3u8"

    private struct Parada {
        let nombre: String
        let categoria: String
        let modalidad: PrescriptionModality
        let medida: Measure
        let carga: Target?

        init(_ nombre: String, _ categoria: String, _ modalidad: PrescriptionModality, _ medida: Measure, kg: Double? = nil) {
            self.nombre = nombre
            self.categoria = categoria
            self.modalidad = modalidad
            self.medida = medida
            self.carga = kg.map { Target.kg(value: $0, min: nil, max: nil) }
        }
    }

    private static func serie(_ m: Measure, _ t: Target? = nil, descanso: Int? = nil, tempo: String? = nil) -> PrescriptionSet {
        PrescriptionSet(measure: m, target: t, modality: nil, restS: descanso, tempo: tempo, note: nil)
    }

    private static func rx(_ esquema: PrescriptionScheme, _ modalidad: PrescriptionModality, _ series: [PrescriptionSet]?,
                           rondas: Int? = nil, structure: RunStructure? = nil) -> Prescription {
        Prescription(scheme: esquema, modality: modalidad, sets: series, rounds: rondas, workS: nil, restS: nil,
                     totalS: nil, target: nil, note: nil, start: nil, increment: nil, structure: structure)
    }

    private static func item(_ id: Int, _ nombre: String, _ categoria: String, _ rx: Prescription,
                             carga: ResolvedLoad? = nil, cues: String? = nil, nota: String? = nil, video: String? = nil) -> WorkoutItem {
        WorkoutItem(uid: "item-\(id)", templateSegmentId: id, exerciseId: "e\(id)", exerciseName: nombre,
                    exerciseSlug: nombre.lowercased(), exerciseCategory: categoria, exerciseVideoUrl: video,
                    cues: cues, exerciseDescription: nil, paramsJson: WorkoutItemParams(derivedFrom: rx),
                    prescription: rx, resolvedIntensity: nil, resolvedLoad: carga, notes: nota)
    }

    private static func bloque(_ pos: Int, _ titulo: String, _ formato: String, _ items: [WorkoutItem], nota: String? = nil) -> WorkoutBlock {
        WorkoutBlock(uid: "b\(pos)", title: titulo, format: formato, blockPosition: pos,
                     coachNote: nota, configJson: nil, items: items)
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

/// La ficha de un caso, con el contexto que le daría el Plan.
private func ficha(_ detalle: AssignmentDetail, listo: Bool = false) -> some View {
    PreWorkoutBriefView(plan: EjemplosPrevia.plan(de: detalle), detail: detalle, onStart: {}, onManualLog: {},
                        showCaptureLog: true, contexto: EjemplosPrevia.contexto, onClose: {}, readyToStart: listo)
}

#Preview("Ficha · fuerza con rampa") { ficha(EjemplosPrevia.fuerza) }

#Preview("Ficha · simulación") { ficha(EjemplosPrevia.simulacion) }

#Preview("Ficha · EMOM · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    ficha(EjemplosPrevia.emom)
}

#Preview("Ficha · series · lista para empezar") { ficha(EjemplosPrevia.series, listo: true) }

#Preview("Ficha · sin detalle") { ficha(EjemplosPrevia.sinDetalle) }

#Preview("Puerta · un ítem") {
    let p = EjemplosPrevia.puertaUnaCosa
    BlockPreviewGate(title: "Series", phaseTag: "Principal", blockNumber: 2, blockCount: 3, formatLabel: nil,
                     segments: p.segmentos, canGoBack: false, onStartBlock: {}, onBack: {}, onExit: {}, alVerBloques: {})
}

#Preview("Puerta · simulación · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    let p = EjemplosPrevia.puertaSimulacion
    BlockPreviewGate(title: "Simulación HYROX", phaseTag: "Principal", blockNumber: 2, blockCount: 2, formatLabel: "For Time",
                     pacing: .circuito, segments: p.segmentos, canGoBack: true,
                     onStartBlock: {}, onBack: {}, onExit: {}, alVerBloques: {})
}
#endif
