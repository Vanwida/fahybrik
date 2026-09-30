import SwiftUI
import StoreKit

// EL RESUMEN AL TERMINAR — el registro que se va a guardar.
//
// Arquetipo «configurar» (CONTRATO-UI §6.2): el sujeto es el REGISTRO, no los campos. Arriba,
// la duración en el tono de cómo acabó (hecha · a medias); debajo, lo que se midió, tu resultado
// y cómo fue; abajo, anclado, GUARDAR, que funciona sin tocar nada.
//
// Está partido por responsabilidad:
//   · `LecturaResumen`             qué se enseña, en qué orden y con qué estado (pura, probada);
//   · `Resumen/ResumenSecciones`   cómo se pinta cada sección, con el kit del día;
//   · `+Guardado`                  el guardado: los dos caminos, la cola, el rechazo, la reseña;
//   · `+Envio`                     lo que viaja por el cable (métricas, tramos, puntuación, marca).
// Este fichero guarda el estado y compone. El estado no es `private` porque las extensiones de
// los otros dos ficheros lo leen y lo escriben; nadie fuera de este tipo lo toca.
struct PostWorkoutSummaryView: View {
    let session: WorkoutSession
    /// La asignación del servidor a la que se atribuye esta ejecución. Nil en un libre (el plan de
    /// demo sin semana): entonces no hay sincronización y se cierra en local.
    let assignmentId: String?
    /// Solo (por defecto) → /api/sync/workout-execution. Dobles «entrenar juntos» → el endpoint
    /// conjunto (enlaza a la pareja y comparte el resultado). El mismo cuerpo.
    var logTarget: WorkoutLogTarget = .solo
    /// «Ya lo hice»: el atleta entrenó sin el reloj en vivo y lo apunta después. No hay laps
    /// medidos, así que el resumen esconde lo que sale del dispositivo (zonas, FC, tramos) y pide
    /// el resultado de la sesión a mano. Se guarda con source='manual'.
    var manualEntry: Bool = false
    /// ENTRENO LIBRE. Con él la ejecución se guarda por `FreeWorkoutAPI` (título, modalidad,
    /// prescripción + las MISMAS métricas) en vez del camino del coach. Nil = el camino de siempre.
    var freeContext: FreeWorkoutContext? = nil
    let onSave: () -> Void

    // Esfuerzo percibido 1-10. Nil hasta que el atleta toca un número: un RPE puesto de antes se
    // guardaría y se leería como si lo hubiera dicho. Nunca se siembra ni tiene valor por defecto.
    @State var rpe: Int? = nil
    @State var notes: String = ""
    /// Duración a mano («Ya lo hice»): solo en formatos que no puntúan por tiempo (en los que sí,
    /// «Tiempo final» ES la duración).
    @State var manualTotalSeconds: Int? = nil
    // La puntuación del metcon/HYROX: solo en los formatos que la tienen (`LecturaResumen.puntuacion`).
    @State var scoreTimeSeconds: Int? = nil
    @State var scoreRounds: Int? = nil
    @State var scoreReps: Int? = nil
    /// RX / Escalado de cada bloque puntuado, por `BloqueRx.id`. Se declara aquí, al terminar (el
    /// vivo nuevo no lo pinta). Sembrado con lo que sellaron las vueltas.
    @State var rxDeclarado: [Int: DeclaracionRx] = [:]
    @State var isSaving: Bool = false
    /// El último envío quedó en la cola (5xx / sin cobertura): se sigue en el resumen y la acción
    /// pasa a REINTENTAR. Un 4xx no pasa por aquí: va a `keptOnPhone`.
    @State var saveFailed: Bool = false
    /// El 5xx / sin cobertura ya está en RequestQueue. Reintentar vacía esa cola; NO vuelve a
    /// enviar (un segundo POST de un libre crearía una segunda sesión).
    @State var retryFromQueue: Bool = false
    /// La entrada de la cola de ese GUARDAR sin cobertura: tras vaciarla, dice si el servidor la
    /// entregó, la sigue esperando o la RECHAZÓ.
    @State var queuedRequestId: UUID? = nil
    /// El servidor RECHAZÓ el entreno (4xx) y el móvil lo guarda (`RequestQueue.rejected`): abajo
    /// pasa a «Guardado en tu móvil» + CERRAR (DECISIONS 2026-09-25). Sin REINTENTAR: repetir un
    /// 4xx da el mismo 4xx, y era una pantalla sin salida.
    @State var keptOnPhone: Bool = false
    /// La hoja del movimiento del reloj tras GUARDAR el primer entreno grabado en la muñeca
    /// (DECISIONS 2026-09-25). El resumen se cierra cuando la hoja se va.
    @State var askSensorConsent: Bool = false

    // #58 — cómo ha ido, para el coach.
    @State var difficulty: PerceivedDifficulty? = nil
    @State var painExpanded: Bool = false
    @State var painArea: PainArea? = nil
    @State var painNote: String = ""

    // #65 — la celebración de récord y la imagen para compartir.
    /// Récords que devolvió el guardado: la celebración tapa el resumen hasta que se cierra, y
    /// ENTONCES se cierra el resumen.
    @State var celebrationRecords: [PersonalRecord] = []
    /// Una sola vez: true en cuanto el resumen se cerró tras un 2xx (o una cola que entregó). Evita
    /// que una respuesta tardía vuelva a cerrar.
    @State var didFinish: Bool = false
    /// La imagen para compartir de ESTE resumen (sin insignia de récord: los récords no se saben
    /// hasta guardar). Se repinta al aparecer y al cambiar el RPE.
    @State var summaryShareURL: URL? = nil

    // #28 — el cara a cara de dobles.
    /// Tras un cierre `.doublesJoint` cuando la pareja TAMBIÉN ha apuntado su lado: la tarjeta
    /// conjunta tapa el resumen (su «Seguir» cierra).
    @State var jointData: JointShareData? = nil
    /// Los récords de este guardado, retenidos mientras está la tarjeta conjunta para que la
    /// reseña siga viendo un récord de verdad al cerrarla.
    @State var pendingJointRecords: [PersonalRecord] = []

    // Cronómetro — los movimientos declarados DESPUÉS del trabajo. Nil = sin declarar (todavía, o
    // nunca: no hace falta para salir de aquí).
    @State var declaredItems: [FreeWorkoutItemPayload]? = nil
    @State var declaredSummary: String? = nil
    @State var showDeclareSheet = false

    // SIN PULSÓMETRO. La FC de sesión que el atleta anota cuando ninguna banda alimentó el entreno;
    // se inyecta en cada lap que no la midió, para que un reloj que falla nunca pierda el registro.
    @State var manualAvgHR: Int? = nil
    @State var manualMaxHR: Int? = nil
    // Ritmo a mano por segmento (s/km en correr, s/500 m en ergo), solo en los tramos que no
    // capturaron ninguno (sin GPS / sin parcial del PM5).
    @State var manualSegmentPaceSeconds: [UUID: Int] = [:]

    /// La acción de reseña de SwiftUI (#59). Solo a través de `maybeRequestReview`, que pregunta
    /// antes a `ReviewGate`.
    @Environment(\.requestReview) var requestReview

    var body: some View {
        ZStack {
            resumen
            if !celebrationRecords.isEmpty {
                PRCelebrationView(
                    records: celebrationRecords,
                    shareData: celebrationShareData,
                    onDone: dismissCelebration
                )
            }
            // #28 — el cara a cara (solo cuando la pareja también apuntó). Sustituye a la
            // celebración en un cierre conjunto, así que nunca se apilan.
            if let jointData {
                DoblesJointSummaryView(data: jointData, onDone: dismissJoint)
            }
        }
        .onAppear { seedCapturedScore(); seedRx(); renderSummaryCard(); stageFinishedDraft() }
        // El plan del libre llegó mientras el atleta rellenaba el resumen: el borrador de rescate
        // pasa a ser el de la asignación, no el de `/free`.
        .onChange(of: session.assignmentId) { _, _ in stageFinishedDraft() }
        .onChange(of: rpe) { _, _ in renderSummaryCard() }
        .fullScreenCover(isPresented: $showDeclareSheet) {
            FreeDeclareMovementsSheet(
                bearer: KeychainTokenStore.shared.read(),
                headerLine: freeContext.flatMap { $0.ranPrescription.flatMap(PrescriptionRenderer.wodHeader) },
                onDone: { movements in
                    applyDeclared(movements)
                    showDeclareSheet = false
                },
                onClose: { showDeclareSheet = false }
            )
        }
        .sensorConsentSheet(isPresented: $askSensorConsent, onClosed: onSave)
    }

    // MARK: - La lectura

    /// Lo que la pantalla enseña ahora mismo, decidido fuera de la vista.
    var lectura: LecturaResumen {
        LecturaResumen.desde(LecturaResumen.Entrada(
            manual: manualEntry,
            formato: session.plan.format,
            completa: session.completeness == .full,
            segundos: session.elapsedSeconds,
            hayRecorrido: hasRoute,
            hayZonas: zoneCoverage != nil,
            fcMedia: avgHRBpm,
            fcMax: maxHRBpm,
            hayTramos: TablaDeTramos.hayQuePintarla(segmentos: session.plan.segments, laps: session.laps),
            hayBloquesRx: !bloquesRx.isEmpty,
            pideMovimientos: freeContext?.awaitsMovementDeclaration == true,
            movimientosDeclarados: declaredItems != nil,
            guardadoEnMovil: keptOnPhone,
            guardando: isSaving,
            falloDeEnvio: saveFailed
        ))
    }

    /// El recorrido GPS de una carrera al aire libre (nil / menos de 2 puntos = no fue fuera).
    var hasRoute: Bool {
        guard let poly = session.capturedRoutePolyline else { return false }
        return PolylineCodec.pointCount(poly) >= 2
    }

    /// La lectura de zonas, o nil cuando no hay barra que pintar. Preguntar a la lectura —y no «el
    /// diccionario no está vacío»— es lo que evita pintar una barra VACÍA para un lap con claves de
    /// zona que valen cero segundos, que insinuaría una medida que no hay (§7).
    private var zoneCoverage: ZoneCoverage? { ZoneCoverage.read(laps: session.laps) }

    private var avgHRBpm: Int? {
        let avgs = session.laps.compactMap(\.avgHRBpm)
        guard !avgs.isEmpty else { return nil }
        return avgs.reduce(0, +) / avgs.count
    }
    private var maxHRBpm: Int? { session.laps.compactMap(\.maxHRBpm).max() }

    private func medida(_ m: MetricaFCResumen) -> Int? {
        m == .media ? avgHRBpm : maxHRBpm
    }

    private func declaracion(_ m: MetricaFCResumen) -> Binding<Int?> {
        m == .media ? $manualAvgHR : $manualMaxHR
    }

    // MARK: - La pantalla

    private var resumen: some View {
        let l = lectura
        return FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                SujetoResumen(lectura: l, titulo: session.plan.name, compartir: summaryShareURL)
                ForEach(l.grupos, id: \.titulo) { grupo in
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        TituloSeccionDia(grupo.titulo)
                        ForEach(grupo.secciones, id: \.self) { seccion($0, l) }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Color.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { accionAnclada(l) }
    }

    @ViewBuilder
    private func seccion(_ s: LecturaResumen.Seccion, _ l: LecturaResumen) -> some View {
        switch s {
        case .recorrido:
            RecorridoResumen(polyline: session.capturedRoutePolyline ?? "")
        case .zonas:
            if let zoneCoverage {
                ZonasResumen(cobertura: zoneCoverage, umbral: session.hrZones.map {
                    "Umbral \($0.lthrBpm) \(Vocab.ppm)" + ($0.estimated ? " · estimado" : "")
                })
            }
        case .fcMedida:
            FCMedidaResumen(medidas: l.fcMedidas.compactMap { m in medida(m).map { (m, $0) } })
        case .fcDeclarable(let sinPulsometro):
            FCDeclarableResumen(metricas: l.fcPorDeclarar, sinPulsometro: sinPulsometro, valor: declaracion)
        case .tramos:
            TablaDeTramos(grupos: session.plan.segmentGroups, laps: session.laps,
                          ritmosManuales: $manualSegmentPaceSeconds)
                .disabled(l.bloqueada)
        case .duracionManual:
            DuracionManualResumen(segundos: $manualTotalSeconds)
                .disabled(l.bloqueada)
        case .resultado:
            if let puntuacion = l.puntuacion {
                ResultadoResumen(puntuacion: puntuacion, tiempo: $scoreTimeSeconds,
                                 rondas: $scoreRounds, reps: $scoreReps)
                    .disabled(l.bloqueada)
            }
        case .rx:
            DeclaracionRxCard(bloques: bloquesRx, declaradas: $rxDeclarado)
                .disabled(l.bloqueada)
        case .queHiciste(let pendiente):
            QueHicisteResumen(pendiente: pendiente, resumen: declaredSummary) {
                showDeclareSheet = true
            }
        case .esfuerzo:
            EsfuerzoResumen(rpe: $rpe)
        case .comoHaIdo:
            SessionFeedbackCard(difficulty: $difficulty, painExpanded: $painExpanded,
                                painArea: $painArea, painNote: $painNote)
        case .notas:
            NotasResumen(notas: $notes)
        }
    }

    /// GUARDAR / REINTENTAR; o, si el servidor lo rechazó, dónde está el entreno y CERRAR. Se
    /// asienta sin sacudida ni rojo: el atleta no ha perdido nada.
    private func accionAnclada(_ l: LecturaResumen) -> some View {
        VStack(spacing: 0) {
            Hairline()
            Group {
                if l.accion == .guardadoEnMovil {
                    FranjaGuardadoEnElMovil(onCerrar: closeKeptOnPhone)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                } else {
                    AccionAncladaResumen(titulo: l.accion.titulo, enCurso: l.accion == .guardando) {
                        if !isSaving { handleSave() }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.s)
        }
        .background { Theme.Color.background.ignoresSafeArea(edges: .bottom) }
    }
}
