import SwiftUI

// Tests guiados — el hub de TESTS del atleta. Una pantalla que cierra el círculo de las marcas: arriba lo
// que calibran los tests (cuánto llevas y tus zonas actuales), después cada test de la batería con su
// última marca, el cambio contra la anterior, la curva y la acción — «Probarme» (crea o reutiliza la
// asignación de HOY con el endpoint de arranque y lanza el flujo NORMAL de sesión, así que el cursor
// guiado y el audio funcionan tal cual), «Continuar» cuando la asignación de hoy ya existe, o «Añadir
// resultado» cuando la sesión corrió pero el número nunca se capturó.
//
// Se llega desde Inicio y desde Analíticas (cover a pantalla completa) y desde Perfil (empujada). Estados
// honestos en todos: cargando, error con reintento y vacío para el atleta cuyo coach aún no ha programado
// nada — nunca un 0/0 roto ni una curva inventada.
//
// ESTE FICHERO CARGA, NAVEGA Y PRESENTA. Lo que se PINTA es `TestsHubPantalla`, alimentada con una lectura
// ya resuelta (`LecturaTestsHub`), y lo que se CARGA es `CargaTestsHub`: así cada estado se puede mirar en
// la galería de pruebas sin red.
struct TestsHubView: View {
    let bearer: String?
    /// La fuente de FC máxima del atleta, que se pasa a las sesiones lanzadas (el mismo contrato que las
    /// de Inicio).
    var hrZones: HRZoneProfile? = nil
    /// No nil cuando se presenta como cover (Inicio, Analíticas): pinta la ✕. Nil cuando está empujada
    /// (Perfil): la barra de navegación lleva la vuelta.
    var onClose: (() -> Void)? = nil
    /// Tras completar una sesión lanzada desde aquí, para que quien llama refresque su plan y su batería.
    var onSessionCompleted: () -> Void = {}

    @State private var carga = CargaTestsHub()
    @State private var reloadNonce = 0

    @State private var workoutLaunch: WorkoutLaunch? = nil
    /// El slug cuyo `/start` está en vuelo (la acción de esa tarjeta gira).
    @State private var startingSlug: String? = nil
    /// El slug cuyo `/start` falló (aviso en línea en esa tarjeta).
    @State private var startFailedSlug: String? = nil
    @State private var captureTarget: CaptureTarget? = nil
    /// La salida del atleta que aún no tiene batería: la biblioteca de marcas, donde «Probarme» lanza un
    /// intento medido por el mismo motor en vivo.
    @State private var showMarksLibrary = false
    @State private var jumpBriefTest: CalibrationTestStatus? = nil
    @State private var jumpLaunch: JumpLaunch? = nil
    @State private var jumpReport: JumpReportLaunch? = nil

    private struct CaptureTarget: Identifiable {
        let id: String            // assignmentId
        let specs: [StoreResultSpec]
    }

    private var reloadToken: String { "\(bearer ?? "-")#\(reloadNonce)" }

    /// Lo cargado y lo que está en marcha, traducido a la lectura que la pantalla pinta.
    private var lectura: LecturaTestsHub {
        LecturaTestsHub.desde(EntradaTestsHub(
            cargando: carga.cargando,
            fallo: carga.fallo,
            estado: carga.estado,
            zonas: carga.zonas,
            zonasCargadas: carga.zonasCargadas,
            historiales: carga.historiales,
            preparando: startingSlug,
            falloAlPreparar: startFailedSlug,
            haySesion: bearer != nil,
            hoy: FechaES.iso(Date())
        ))
    }

    var body: some View {
        TestsHubPantalla(
            lectura: lectura,
            acciones: AccionesTestsHub(
                alReintentar: { reloadNonce += 1 },
                alRefrescar: { reloadNonce += 1 },
                alProbarPorMiCuenta: {
                    Haptics.light()
                    showMarksLibrary = true
                },
                alEjecutar: { id, accion in ejecuta(accion, deTest: id) }
            ),
            alCerrar: onClose
        )
        // Empujada, la barra de navegación lleva la vuelta; el título ya lo pone la pantalla.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: reloadToken) { await carga.cargar(bearer: bearer) }
        .fullScreenCover(item: $workoutLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                hrZones: hrZones,
                onClose: {
                    workoutLaunch = nil
                    reloadNonce += 1
                },
                onCompleted: { _ in
                    reloadNonce += 1
                    onSessionCompleted()
                }
            )
        }
        .sheet(item: $captureTarget) { target in
            TestResultCaptureSheet(
                assignmentId: target.id,
                specs: target.specs,
                bearer: bearer,
                onDone: {
                    captureTarget = nil
                    reloadNonce += 1
                    onSessionCompleted()
                }
            )
        }
        .fullScreenCover(item: $jumpReport) { launch in
            JumpReportView(report: launch.report, onClose: { jumpReport = nil })
        }
        .fullScreenCover(item: $jumpLaunch) { launch in
            JumpCaptureView(
                launch: launch,
                bearer: bearer,
                onClose: { jumpLaunch = nil },
                onSaved: {
                    jumpLaunch = nil
                    reloadNonce += 1
                    onSessionCompleted()
                }
            )
        }
        .fullScreenCover(item: $jumpBriefTest) { test in
            if let brief = test.brief {
                JumpBriefView(
                    brief: brief,
                    onReady: {
                        jumpBriefTest = nil
                        Task { await startJumpCapture(test) }
                    },
                    onClose: { jumpBriefTest = nil }
                )
            }
        }
        // La biblioteca empuja sus propios destinos, así que viaja con su pila: el hub se abre como cover
        // desde Inicio y ahí no hay ninguna heredada.
        .fullScreenCover(isPresented: $showMarksLibrary) {
            NavigationStack {
                MarksLibraryView(bearer: bearer, hrZones: hrZones)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { showMarksLibrary = false }
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
            }
        }
    }

    // MARK: - Acciones

    /// Lo que hace cada acción, la de una tarjeta o la anclada: la lectura ya decidió cuál es.
    private func ejecuta(_ accion: AccionTest, deTest id: String) {
        guard let test = carga.estado?.tests.first(where: { $0.assignmentId == id }) else { return }
        switch accion {
        case .verResultado:
            abreInforme(test)
        case .anadirResultado:
            Task { await openCapture(test) }
        case .continuarSalto:
            jumpBriefTest = test
        case .continuarVivo:
            workoutLaunch = WorkoutLaunch(assignmentId: test.assignmentId, title: test.label)
        case .probarme:
            Task { await startTest(test) }
        }
    }

    private func abreInforme(_ test: CalibrationTestStatus) {
        if let report = test.jumpReport {
            jumpReport = JumpReportLaunch(id: test.assignmentId, report: report)
        } else if let profile = test.jumpProfile {
            jumpReport = JumpReportLaunch(
                id: test.assignmentId,
                report: CmjReportDTO.thin(
                    title: test.label,
                    dateLabel: FechaES.corta(test.scheduledFor, hoy: FechaES.iso(Date())) ?? test.scheduledFor,
                    profile: profile,
                    bodyMassKg: carga.estado?.athleteWeightKg
                )
            )
        }
    }

    /// «Probarme» → el endpoint de arranque crea o reutiliza la asignación de HOY, y se lanza por el mismo
    /// cover que una sesión planificada. Un salto NO entra al vivo: primero el briefing (trípode, carga,
    /// orden).
    private func startTest(_ test: CalibrationTestStatus) async {
        if test.isJumpVideo {
            jumpBriefTest = test
            return
        }
        guard let bearer, startingSlug == nil else { return }
        startingSlug = test.calibrationSlug
        startFailedSlug = nil
        do {
            let start = try await TestBatteryService.startTest(slug: test.calibrationSlug, bearer: bearer)
            Haptics.medium()
            workoutLaunch = WorkoutLaunch(assignmentId: start.assignmentId, title: test.label)
        } catch {
            startFailedSlug = test.calibrationSlug
            Haptics.error()
        }
        startingSlug = nil
    }

    /// Tras «Estoy listo»: materializa la asignación de hoy. La cámara se engancha aquí (el vivo no).
    private func startJumpCapture(_ test: CalibrationTestStatus) async {
        guard let bearer, startingSlug == nil else { return }
        startingSlug = test.calibrationSlug
        startFailedSlug = nil
        do {
            let start = try await TestBatteryService.startTest(slug: test.calibrationSlug, bearer: bearer)
            Haptics.medium()
            let includeLoaded = test.brief?.needs.contains(where: { $0.id == "load" }) ?? false
            jumpLaunch = JumpLaunch(
                id: start.assignmentId,
                assignmentId: start.assignmentId,
                includeLoaded: includeLoaded,
                loadKg: 15,
                bodyMassKg: carga.estado?.athleteWeightKg,
                attemptsWanted: 3
            )
        } catch {
            startFailedSlug = test.calibrationSlug
            Haptics.error()
        }
        startingSlug = nil
    }

    /// «Falta el resultado» → se resuelve el contrato `store_results` de la sesión y se abre la hoja de
    /// captura (a mano: la sesión ya corrió).
    private func openCapture(_ test: CalibrationTestStatus) async {
        guard let bearer else { return }
        do {
            let detail = try await PlanService.fetchAssignmentDetail(test.assignmentId, bearer: bearer)
            let specs = detail.storeResults
            guard !specs.isEmpty else { return }
            captureTarget = CaptureTarget(id: test.assignmentId, specs: specs)
        } catch {
            // El aviso se queda donde está; el atleta puede reintentar. Nunca se inventa.
        }
    }
}
