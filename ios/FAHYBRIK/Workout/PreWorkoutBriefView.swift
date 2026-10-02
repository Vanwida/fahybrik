import SwiftUI

// LA FICHA DE LA SESIÓN — lo que el atleta ve ANTES de empezar (el doble: `/design/ficha-ruta`, «La ruta»).
//
// Responde en este orden: qué es y cuánto lleva (la cabecera), qué quiere el coach (su nota, entera si cabe), cómo es
// la sesión por partes (la ruta, FIJA arriba al hacer scroll, y debajo UN bloque con la forma de su formato) y qué
// hago ahora (la acción anclada abajo, siempre visible y siempre la misma: «Empezar»).
//
// FH-95. Dos pasadas por la MISMA vista: Plan → esta ficha («Empezar») → Dispositivos → esta ficha otra vez con la
// tarjeta del reloj y la ÚNICA puerta de empezar. Los caminos a mano («¿Ya lo entrenaste sin la app?», la captura)
// solo en la primera pasada, y una prueba no los tiene.
//
// DE DÓNDE SALE LO QUE SE PINTA. Todo sale de `LecturaSesionPrevia` (la acción y los caminos) y de su `ficha`
// (`LecturaFicha`: la cabecera y los bloques con su forma), que se construyen del detalle rico de la asignación
// (`AssignmentDetail`); el `WorkoutPlan` solo lanza el motor. Esta vista monta el cromo, el scroll, las hojas y la
// acción, y suelta el vivo; el contenido que scrollea es `FichaContenido` (`Workout/SesionPrevia/Ficha/`).
struct PreWorkoutBriefView: View {
    /// La forma del vivo: SOLO para lanzar el motor (y el título). Nunca se pinta la prescripción desde aquí.
    let plan: WorkoutPlan
    /// El detalle rico: la única fuente de lo que se pinta. Nil/vacío → «Sin detalle», nunca una sesión inventada.
    var detail: AssignmentDetail? = nil
    /// Empezar → Dispositivos (solo en la primera pasada).
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

    /// El bloque que se lee en la ruta. Nil: el primero de trabajo (`LecturaFicha.bloqueInicial`).
    @State private var bloqueElegido: BloqueFicha.ID? = nil
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
            ScrollView {
                FichaContenido(
                    lectura: l.ficha,
                    elegido: $bloqueElegido,
                    alAbrirTecnica: { techniqueItem = $0 },
                    cierre: { cierre(l) }
                )
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

    // MARK: - El final de la página

    /// Lo último que se lee: en la segunda pasada, el estado del reloj; en la primera, los caminos honestos para
    /// quien entrenó sin el cronómetro (o, en una prueba, por qué no los hay).
    @ViewBuilder
    private func cierre(_ l: LecturaSesionPrevia) -> some View {
        if l.muestraReloj {
            PreWorkoutWatchCard(mirror: mirror)
        } else {
            FichaCaminos(
                prueba: l.ficha.cabecera.prueba,
                caminos: l.secundarias,
                alRegistrarAMano: onManualLog,
                alRegistrarConCaptura: onCaptureLog
            )
        }
    }

    // MARK: - La acción anclada

    // Una sola acción, siempre la misma: «Empezar». En la primera pasada sigue a Dispositivos; en la segunda abre el
    // vivo (cronómetro y vueltas, cuyo resumen registra el resultado). «Ya lo hice» NO va aquí: queda al final de la
    // página, para que nadie lo confunda con la puerta de empezar.
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
                glifo: .play,
                completa: true,
                alto: Theme.Size.accionAnclada,
                glifoAlFinal: false,
                impacto: .medio,
                accion: { alTocar(l.accion) }
            )
        }
        .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
    }

    private func alTocar(_ accion: LecturaSesionPrevia.Accion) {
        switch accion {
        case .continuar: onStart()
        case .empezar:   releaseLive()
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
