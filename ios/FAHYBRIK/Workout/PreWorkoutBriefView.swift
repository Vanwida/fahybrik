import SwiftUI

// LA FICHA DE LA SESIÓN — lo que el atleta ve ANTES de empezar (el doble: `sesion-previa`).
//
// Responde en este orden: qué voy a hacer (el sujeto, con el acento del club), cómo es cada cosa (los
// bloques, con la técnica a un toque) y qué hago ahora (la acción anclada abajo, siempre visible).
// Arquetipo Detalle, altura `llena` (CONTRATO-UI §6): el contenido va de un ítem a los veintitrés de una
// simulación HYROX; con poco, el sobrante lo absorbe el sujeto; con mucho, scrollea.
//
// FH-95. Dos pasadas por la MISMA vista: Plan → esta ficha («Continuar») → Dispositivos → esta ficha otra
// vez con la tarjeta del reloj y la ÚNICA puerta de empezar. Los caminos a mano («Ya lo hice», la
// captura) solo en la primera pasada.
//
// DE DÓNDE SALE LO QUE SE PINTA. El cuerpo sale del detalle rico de la asignación (`AssignmentDetail`,
// el mismo que lee `SessionExercisesSheet`); el `WorkoutPlan` solo lanza el motor. Qué se enseña, en
// qué orden y con qué acción lo decide `LecturaSesionPrevia` (pura, probada); esta vista monta el
// cromo, el scroll, las hojas y la acción, y suelta el vivo.
struct PreWorkoutBriefView: View {
    /// La forma del vivo: SOLO para lanzar el motor (y el título). Nunca se pinta la prescripción desde aquí.
    let plan: WorkoutPlan
    /// El detalle rico: la única fuente de lo que se pinta. Nil/vacío → «Sin detalle», nunca una sesión inventada.
    var detail: AssignmentDetail? = nil
    /// Continuar → Dispositivos (solo en la primera pasada).
    let onStart: () -> Void
    /// «Ya lo hice»: entrenó sin el cronómetro y lo registra después. Va directo al registro a mano.
    let onManualLog: () -> Void
    /// «Registrar con captura»: entrenó con OTRA app y trae el resultado con una captura que lee la IA.
    var onCaptureLog: () -> Void = {}
    /// Solo para una asignación REAL (el resultado tiene que atribuirse a una). Oculto en sesiones sueltas.
    var showCaptureLog: Bool = false
    /// #Marcas — un intento de marca: sin caminos a mano (una marca que la app no midió no existe).
    var isBenchmark: Bool = false
    /// Lo que la ficha necesita de FUERA del detalle (el coach, cuándo toca, cuánto dura).
    var contexto: ContextoFicha = ContextoFicha()
    let onClose: () -> Void

    // MARK: FH-95 · segunda pasada (después de Dispositivos — UNA sola puerta de empezar)
    var readyToStart: Bool = false
    var segments: [WorkoutSegment] = []
    var activityKind: String = "mixed"
    var hrZones: HRZoneProfile? = nil
    var startAnswers: Binding<SessionStartAnswers>? = nil
    var stampSession: ((WorkoutSession) -> Void)? = nil
    var onReleaseLive: ((WorkoutSession) -> Void)? = nil
    var onBackFromReady: (() -> Void)? = nil

    @State private var stagingSession: WorkoutSession? = nil
    @State private var mirror = PhoneLiveSession.shared

    /// La ficha del ejercicio (vídeo, consejos, descripción y nota del día): la MISMA que abre
    /// `SessionExercisesSheet`, un solo sitio para toda la información del ejercicio.
    @State private var techniqueItem: WorkoutItem? = nil
    /// Compartir el plan del día (card 132): la story de «esto es lo que toca».
    @State private var tarjetaParaCompartir: TarjetaCompartible? = nil

    private var lectura: LecturaSesionPrevia {
        LecturaSesionPrevia.desde(
            plan: plan,
            detalle: detail,
            listo: readyToStart,
            esMarca: isBenchmark,
            conCaptura: showCaptureLog,
            relojDisponible: WatchPresence.shared.appAvailable,
            contexto: ContextoFicha(
                cuando: contexto.cuando, coach: contexto.coach, esLibre: contexto.esLibre,
                duracion: contexto.duracion, esMarca: contexto.esMarca || isBenchmark
            )
        )
    }

    var body: some View {
        let l = lectura
        VStack(spacing: 0) {
            cromo(l)
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    SujetoSesionPrevia(lectura: l)
                    switch l.cuerpo {
                    case .bloques(let bloques):
                        CuerpoDeBloquesPrevia(bloques: bloques, alAbrirTecnica: { techniqueItem = $0 })
                    case .sinDetalle:
                        SinDetallePrevia()
                    }
                    if l.muestraReloj {
                        PreWorkoutWatchCard(mirror: mirror)
                    }
                }
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .anchoredAction { pie(l) }
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(item: $techniqueItem) { item in
            ExerciseDetailView(item: item)
        }
        .sheet(item: $tarjetaParaCompartir) { tarjeta in
            CompartirSheet(tarjeta: tarjeta)
        }
        .onAppear {
            guard readyToStart, stagingSession == nil else { return }
            stagingSession = WorkoutSession(plan: plan, hrZones: hrZones)
        }
    }

    // MARK: - Cromo (siempre a la vista: el atleta siempre puede irse)

    private func cromo(_ l: LecturaSesionPrevia) -> some View {
        CromoPrevia {
            BotonCromoDia(.atras, etiqueta: "Atrás") {
                if readyToStart { onBackFromReady?() } else { onClose() }
            }
        } derecha: {
            if l.compartible {
                BotonCromoDia(.compartir, etiqueta: "Compartir sesión") {
                    tarjetaParaCompartir = .entreno(TarjetaCompartibleBuilder.antes(plan: plan))
                }
            }
        }
    }

    // MARK: - La acción anclada

    // Dos caminos honestos para cerrar la sesión: la acción principal abre el vivo (cronómetro y vueltas,
    // cuyo resumen registra el resultado), y «Ya lo hice» va directo al resumen en modo a mano
    // (source='manual') para quien entrenó sin el cronómetro.
    private func pie(_ l: LecturaSesionPrevia) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            if let linea = l.lineaDeArranque {
                Text(linea)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            BotonAccionDia(
                l.accion.titulo,
                glifo: l.accion == .empezar ? .play : .flecha,
                completa: true,
                alto: Theme.Size.accionAnclada,
                glifoAlFinal: l.accion != .empezar,
                impacto: .medio,
                accion: { alTocar(l.accion) }
            )
            ForEach(l.secundarias, id: \.titulo) { secundaria in
                let yaLoHice = secundaria == .yaLoHice
                BotonTextoDia(
                    secundaria.titulo,
                    tono: yaLoHice ? .tinta : .suave,
                    centrado: true,
                    accion: yaLoHice ? onManualLog : onCaptureLog
                ) {
                    IconoDia(yaLoHice ? .check : .camara, tam: 17)
                }
                .accessibilityLabel(secundaria.etiquetaAccesible)
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
    }

    private func alTocar(_ accion: LecturaSesionPrevia.Accion) {
        switch accion {
        case .continuar, .continuarAPreparacion: onStart()
        case .empezar:                           releaseLive()
        }
    }

    /// La única puerta de empezar (FH-95): suelta el vivo con lo que se eligió en Dispositivos.
    private func releaseLive() {
        guard let staging = stagingSession,
              let answers = startAnswers?.wrappedValue,
              let onReleaseLive else { return }
        let live = PreWorkoutReleaseLive.release(
            staging: staging,
            answers: answers,
            activityKind: activityKind,
            stampSession: stampSession
        )
        onReleaseLive(live)
    }
}
