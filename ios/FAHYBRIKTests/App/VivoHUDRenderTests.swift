import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL EMOM Y EL HIERRO EN VIVO, RENDERIZADOS DE VERDAD — sus dos estados de diseño.
//
// Hermana de `OutdoorRunHUDRenderTests`, y por lo mismo: no es una prueba de
// píxeles, es la prueba de que la pantalla se SOSTIENE en los dos estados que el
// §6.3 llama «el caso de diseño», y de paso el sitio de donde salen las capturas.
//
//   con pulso        — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona
//                      (§10.1) y el pulso se lee en el color de esa zona.
//   sin ancla de FC  — ni zonas del servidor ni reloj en la muñeca: NO hay tinte y
//                      donde iría el pulso se dice por qué no está (§7).
//
// El segundo NO es la versión rota del primero. En estas dos, además, el SUJETO no
// cambia entre los dos estados —el minuto se sabe igual, y la serie que tienes
// delante también—, que es precisamente la diferencia con correr: allí el pulso
// ERA el sujeto y sin él la pantalla degradaba a la siguiente verdad.
//
// El lienzo es el del iPhone 17 Pro dentro del área segura (402 × 781), que es el
// que usa la aritmética del ancla del §10.3.

final class VivoHUDRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 781)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - El EMOM

    @MainActor
    func testEmomConPulsoTineElLienzoDeTuZona() {
        let sesion = sesionDeEmom(zonas: Self.zonas())
        sesion.liveHRBpm = 165        // Z4 con el umbral de 170 — donde vive un EMOM
        let imagen = render(lienzo(sesion) {
            EmomVivoView(session: sesion, accionTitulo: "SIGUIENTE", alTocarAccion: {}) {
                Self.cromo("EMOM 12")
            }
        }, nombre: "emom-vivo-con-pulso")
        XCTAssertNotNil(imagen, "El EMOM en vivo tiene que renderizar con pulso")
    }

    @MainActor
    func testEmomSinAnclaDeFCSigueTeniendoSujeto() {
        // El minuto se sabe con reloj y sin él: el sujeto de un EMOM es el RELOJ,
        // no el pulso. Lo único que desaparece es el tinte y el chip (§7).
        let sesion = sesionDeEmom(zonas: nil)
        let imagen = render(lienzo(sesion) {
            EmomVivoView(session: sesion, accionTitulo: "SIGUIENTE", alTocarAccion: {}) {
                Self.cromo("EMOM 12")
            }
        }, nombre: "emom-vivo-sin-ancla-fc")
        XCTAssertNotNil(imagen, "Sin ancla de FC el EMOM no se rompe: el minuto sigue mandando")
    }

    // MARK: - El hierro

    @MainActor
    func testFuerzaConPulsoTineElLienzoDeTuZona() {
        let sesion = sesionDeFuerza(zonas: Self.zonas())
        sesion.liveHRBpm = 142        // Z2: en fuerza el pulso baja entre series
        let imagen = render(lienzo(sesion) {
            FuerzaVivoView(session: sesion, accionTitulo: "HECHO", alTocarAccion: {}) {
                Self.cromo("BACK SQUAT")
            }
        }, nombre: "fuerza-vivo-con-pulso")
        XCTAssertNotNil(imagen, "El hierro en vivo tiene que renderizar con pulso")
    }

    @MainActor
    func testFuerzaSinAnclaDeFCSigueTeniendoSujeto() {
        let sesion = sesionDeFuerza(zonas: nil)
        let imagen = render(lienzo(sesion) {
            FuerzaVivoView(session: sesion, accionTitulo: "HECHO", alTocarAccion: {}) {
                Self.cromo("BACK SQUAT")
            }
        }, nombre: "fuerza-vivo-sin-ancla-fc")
        XCTAssertNotNil(imagen, "Sin ancla de FC el hierro no se rompe: la serie se sabe igual")
    }

    // MARK: - Los HUD de formato, antes de que llegue la primera medida
    //
    // Los tres estados que hasta hoy se pintaban con una raya o, peor, con la
    // PRESCRIPCIÓN metida en el hueco de la medida. El caso es el mismo en los
    // tres: el atleta acaba de darle a empezar y todavía no hay nada medido.

    @MainActor
    func testRitmoSostenidoSinRecorridoNoInventaNiRitmoNiPulso() {
        // Un rodaje recién empezado: sin GPS no hay ritmo y sin reloj no hay pulso.
        // Antes salían «—:—» de media y «—» de % de zona; ahora cada celda dice por
        // qué está vacía, que es lo único accionable (§7).
        let sesion = sesionDeRodaje()
        let imagen = render(lienzo(sesion) {
            VStack { SteadyLiveHUD(session: sesion); Spacer() }
        }, nombre: "formato-sostenido-sin-medida")
        XCTAssertNil(sesion.liveCoveredPaceSecPerKm, "El caso de diseño es SIN ritmo medido")
        XCTAssertNotNil(imagen, "El sostenido tiene que sostenerse sin ninguna medida")
    }

    @MainActor
    func testSerieDeDistanciaSinRitmoMedidoEnsenaElRelojYNoElObjetivo() {
        // EL FALLO QUE ESTA CAPTURA FIJA: el hero caía al `targetPaceSecondsPerKm`
        // y pintaba el objetivo del coach donde va el ritmo que llevas, con el mismo
        // «/km» debajo. Lo único que los separaba era el color, y corriendo el color
        // no se lee. Ahora el sujeto degrada al RELOJ y la etiqueta lo dice.
        let sesion = sesionDeSeries()
        let imagen = render(lienzo(sesion) {
            VStack { IntervalsLiveHUD(session: sesion); Spacer() }
        }, nombre: "formato-series-sin-ritmo-medido")
        XCTAssertNil(sesion.liveCoveredPaceSecPerKm, "El caso de diseño es SIN ritmo medido")
        XCTAssertEqual(sesion.currentSegment?.targetPaceSecondsPerKm, 270,
                       "El objetivo EXISTE — justo por eso la captura vale: no debe salir arriba")
        XCTAssertNotNil(imagen, "La serie de distancia tiene que sostenerse sin ritmo medido")
    }

    @MainActor
    func testForTimeAntesDeLaPrimeraVueltaNoInventaUnParcial() {
        // Antes de la primera estación tachada no hay parcial que enseñar. Un «—»
        // en esa celda se lee como un parcial de cero; el hueco se dice.
        let sesion = sesionDeForTime()
        let imagen = render(lienzo(sesion) {
            VStack { ForTimeLiveHUD(session: sesion); Spacer() }
        }, nombre: "formato-fortime-sin-vueltas")
        XCTAssertTrue(sesion.fixedRoundSplits.isEmpty, "El caso de diseño es ANTES de la primera vuelta")
        XCTAssertNotNil(imagen, "El For Time tiene que sostenerse sin ninguna vuelta hecha")
    }

    // MARK: - El sujeto cae a la MISMA altura en las dos (§10.3)

    @MainActor
    func testLasDosVistasAnclanElSujetoDondeLoAnclaLaDeCorrer() {
        // La razón de ser del §10.3: en una familia de vistas que se turnan durante
        // el MISMO entreno el sujeto no puede bailar. Las tres montan `MarcoVivo`,
        // así que el ancla es literalmente el mismo número — y esto salta si alguien
        // le escribe a una de ellas su propio reparto de alto.
        XCTAssertEqual(BandaViva.centroSujeto, 286, accuracy: 0.001)
    }

    // MARK: - Fixtures

    /// Un EMOM 12 alternando burpees y wall balls: NADIE los cuenta, así que lo que
    /// se sabe es la dosis. Si los contase una máquina el tramo ni llegaría a esta
    /// vista — se lo quedaría la superficie del ergo.
    private func sesionDeEmom(zonas: HRZoneProfile?) -> WorkoutSession {
        func minuto(_ reps: Int, _ nombre: String) -> PrescriptionSet {
            PrescriptionSet(measure: .reps(reps), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nombre)
        }
        let p = Prescription(scheme: .emom, modality: nil,
                             sets: [minuto(10, "Burpees"), minuto(12, "Wall balls")],
                             rounds: 12, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "EMOM 12", kind: .reps,
                                   targetReps: 10,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "EMOM 12", format: .emom,
                               estimatedDurationSeconds: 720, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let sesion = WorkoutSession(plan: plan, hrZones: zonas)
        // Se avanza por el MOTOR, no colocando el índice a mano: `emomCompletedIntervals`
        // es `private(set)` y ponerlo a pelo daría una captura que dice «ronda 4» y
        // «hechas 0» a la vez. Una imagen incoherente no vale como prueba de nada.
        for _ in 0..<3 { sesion.primaryAdvance() }
        sesion.emomPhaseRemaining = 41
        sesion.elapsedSeconds = 3 * 60 + 19
        return sesion
    }

    /// El caso real del plan del coach: Back Squat 4×5 @ 100 kg, RIR 2, descanso
    /// 1:30 — y el atleta delante de la serie 2. «5 × 100» son los siete avances de
    /// la mono que rompieron esta familia una vez.
    private func sesionDeFuerza(zonas: HRZoneProfile?) -> WorkoutSession {
        func serie() -> PrescriptionSet {
            PrescriptionSet(measure: .reps(5),
                            target: .kg(value: 100, min: nil, max: nil),
                            modality: nil, restS: 90, tempo: nil, note: nil)
        }
        let p = Prescription(scheme: .sets, modality: nil,
                             sets: [serie(), serie(), serie(), serie()],
                             rounds: nil, workS: nil, restS: nil, totalS: nil,
                             target: .rir(value: 2, min: nil, max: nil),
                             note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength,
                                   targetReps: 5, loadKg: 100,
                                   blockTitle: "Fuerza", blockPosition: 1,
                                   prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                               estimatedDurationSeconds: 1200, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let sesion = WorkoutSession(plan: plan, hrZones: zonas)
        sesion.primeSetsIfNeeded()
        // La serie 1 cerrada; el descanso se salta para que el sujeto sea la SERIE
        // (el descanso tiene su propio estado, y se ve al confirmar).
        sesion.confirmSet(0)
        sesion.dismissRest()
        sesion.elapsedSeconds = 7 * 60 + 42
        sesion.lapElapsedSeconds = 48
        return sesion
    }

    /// Un rodaje de 30' recién arrancado, a pelo: sin GPS, sin cinta y sin reloj.
    /// Es el arranque de CUALQUIER rodaje — los primeros segundos son siempre así.
    private func sesionDeRodaje() -> WorkoutSession {
        let p = Prescription(scheme: .steady, modality: .run, sets: nil,
                             rounds: nil, workS: nil, restS: nil, totalS: 1800,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "Rodaje Z2", kind: .running,
                                   targetDurationSeconds: 1800,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: p)
        let sesion = sesionDe(tramo, nombre: "Rodaje Z2", formato: .steady, duracion: 1800)
        sesion.lapElapsedSeconds = 74
        sesion.elapsedSeconds = 74
        return sesion
    }

    /// Un 5×1000 a 4:30/km, en la primera serie y sin un metro medido todavía.
    /// El objetivo EXISTE: es justo lo que hacía que el fallo fuese invisible, porque
    /// el número que salía arriba era exactamente el que el atleta esperaba ver.
    private func sesionDeSeries() -> WorkoutSession {
        let bout = PrescriptionSet(measure: .distance(meters: 1000), target: nil, modality: .run,
                                   restS: 120, tempo: nil, note: nil)
        let p = Prescription(scheme: .intervals, modality: .run,
                             sets: [bout, bout, bout, bout, bout],
                             rounds: 5, workS: nil, restS: 120, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "5×1000", kind: .running,
                                   targetDistanceMeters: 1000,
                                   targetPaceSecondsPerKm: 270,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: p)
        let sesion = sesionDe(tramo, nombre: "5×1000", formato: .intervals, duracion: 1800)
        sesion.rotRoundIndex = 0
        sesion.rotPhaseRemaining = 0      // bout por DISTANCIA: no hay cuenta atrás
        sesion.lapElapsedSeconds = 96
        sesion.elapsedSeconds = 96
        return sesion
    }

    /// Un For Time de tres estaciones nada más darle a empezar: ninguna tachada, así
    /// que no hay ni un parcial que enseñar.
    private func sesionDeForTime() -> WorkoutSession {
        func estacion(_ m: Double, _ nombre: String) -> PrescriptionSet {
            PrescriptionSet(measure: .distance(meters: m), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nombre)
        }
        let p = Prescription(scheme: .forTime, modality: nil,
                             sets: [estacion(1000, "Remo"), estacion(1000, "SkiErg"),
                                    estacion(50, "Trineo")],
                             rounds: nil, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: "Tríada", kind: .reps,
                                   blockTitle: "Principal", blockPosition: 1,
                                   prescription: p)
        let sesion = sesionDe(tramo, nombre: "Tríada", formato: .forTime, duracion: 900)
        sesion.lapElapsedSeconds = 18
        sesion.elapsedSeconds = 18
        return sesion
    }

    /// El plan de un solo tramo que las tres de arriba comparten. Sin zonas y sin
    /// reloj a propósito: el caso de diseño del §6.3 es el atleta que no tiene nada.
    private func sesionDe(_ tramo: WorkoutSegment, nombre: String,
                          formato: PrescriptionScheme, duracion: Int) -> WorkoutSession {
        let plan = WorkoutPlan(id: UUID(), name: nombre, format: formato,
                               estimatedDurationSeconds: duracion, blockContext: "Principal",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan, hrZones: nil)
    }

    private static func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170, estimated: false, source: "test",
            sourceLabel: "Zonas de tu test de umbral", confidence: "measured",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    /// El cromo que en la app pone `ActiveWorkoutView` (salir · pausa · qué tramo).
    /// Aquí se imita con la misma altura para que la primera fila del marco pese lo
    /// que pesa de verdad: si la captura se hiciera sin él, el ancla del sujeto
    /// saldría de otro sitio y la imagen mentiría.
    @ViewBuilder
    private static func cromo(_ titulo: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("‖").font(.system(size: 16)).foregroundStyle(Theme.Color.muted)
            Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted.opacity(0.3))
            Spacer()
            VStack(spacing: 1) {
                Text("PRINCIPAL")
                    .font(.system(size: 9, weight: .heavy).italic())
                    .foregroundStyle(Theme.Color.accentText)
                MonoText(text: titulo, size: 11, color: Theme.Color.muted)
            }
            Spacer()
            MonoText(text: "1/1", size: 11, color: Theme.Color.muted)
        }
    }

    // MARK: - Render

    /// El lienzo entero: fondo, ambiente de zona y la vista encima — igual que lo
    /// monta `ActiveWorkoutView`. Sin el `Ambiente` la captura no enseñaría lo
    /// único que el §10.1 viene a fijar.
    @ViewBuilder
    private func lienzo(_ sesion: WorkoutSession, @ViewBuilder _ vista: () -> some View) -> some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            Ambiente(zona: sesion.liveZone)
            vista()
        }
    }

    @MainActor
    private func render(_ vista: some View, nombre: String) -> UIImage? {
        let renderer = ImageRenderer(
            content: vista
                .frame(width: Self.lienzo.width, height: Self.lienzo.height)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }

        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
