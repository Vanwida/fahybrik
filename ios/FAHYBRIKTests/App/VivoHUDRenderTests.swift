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
