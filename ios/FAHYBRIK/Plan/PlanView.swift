import SwiftUI

// PESTAÑA PLAN — dónde estás hoy dentro del bloque, y qué toca.
//
// QUÉ PASÓ AQUÍ (docs/DECISIONS.md, 6-ago-2026)
// ---------------------------------------------
// Esta pantalla era una LISTA de los siete días del microciclo, y a la vez
// `InicioView` pintaba su propia versión de «qué toca hoy» — mismo
// `store.planWeek`, mismo `SessionMarkState`, mismo destino
// (`WorkoutContainer`/`ExecutedWorkoutView`): dos renderizados y dos copys para
// la misma pregunta. Ahora la responde el Plan, UNA vez, y el atleta ve el
// entreno CON el porqué al lado.
//
// LA COMPOSICIÓN, de arriba abajo
// -------------------------------
//   · CabeceraDelBloque — el bloque, «Semana N de M» y la línea del coach.
//   · CarrilSemana      — los siete días con su sello. Tocar un día lo abre;
//                         pulsación larga saca sus acciones (mover · técnica ·
//                         corregir · borrar libre).
//   · Héroe             — la sesión de hoy en grande, o el día de descanso. Una
//                         SEGUNDA sesión del día va como fila compacta debajo,
//                         no como un segundo héroe.
//   · EntradaAlCiclo    — la puerta a `PlanCicloView`, de alto fijo.
//   · Acción anclada    — empezar hoy · ver lo hecho · ver lo de mañana.
//
// ALTURA (contrato §6.1): la pantalla es `llena` — el cromo de arriba y la puerta
// de abajo son fijos y TODO el sobrante se lo lleva el héroe, que es el sujeto.
// El día de descanso degrada a `centra`.
//
// Las mutaciones (mover · marcar · deshacer · borrar) y sus menús viven en
// `PlanAcciones.swift`; las piezas, en `PlanHoyAtoms.swift` y `PlanHeroeHoy.swift`.

struct PlanView: View {
    var bearer: String? = nil
    /// FREE tier switch (athlete without coach). False hides the chat action and
    /// swaps the coach-flavored empty copy for the athlete-direct free one.
    var hasCoach: Bool = true

    // The shared cache-first data layer: a tab switch into Plan renders instantly
    // from the store's warm slice, then revalidates in the background.
    @Environment(AppDataStore.self) var store

    // ── La semana, ya resuelta ────────────────────────────────────────────────
    @State var semana: SemanaDelPlan? = nil
    @State private var posicion: PosicionEnBloque? = nil
    @State private var coachName: String? = nil
    @State private var pausado: Bool = false
    @State private var pausadoDesde: String? = nil
    @State private var hayProximaSemana: Bool = false
    @State private var cargando: Bool = true
    @State private var falloDeCarga: Bool = false

    // ── El desglose de HOY (solo hoy: la semana entera encarecería la carga) ──
    @State private var desgloseHoy: DesgloseSesion = .vacio
    /// De QUÉ sesión es el desglose que hay en memoria. Sin esto, mover el
    /// entreno de hoy y fallar la siguiente petición dejaría en pantalla los
    /// bloques de OTRA sesión — un desglose real, de la sesión equivocada (§7).
    @State private var desgloseDe: String? = nil
    /// Los minutos MEDIDOS de la sesión de ayer — solo se piden el día que hoy es
    /// descanso, que es cuando la tarjeta de ayer los enseña.
    @State private var medidoAyer: Int? = nil

    // ── Navegación (los mismos destinos de siempre) ───────────────────────────
    @State var workoutLaunch: WorkoutLaunch? = nil
    @State private var executedLaunch: WorkoutLaunch? = nil
    @State var techniqueTarget: AthleteWeekDaySession? = nil
    /// El día que el atleta tocó en el carril y lleva DOS sesiones: hay que
    /// preguntarle cuál abre.
    @State private var diaAElegir: DiaDelPlan? = nil
    /// La sesión elegida en esa hoja. Se abre en `onDismiss` y no en el toque:
    /// levantar un cover mientras la hoja se está cerrando se pierde a medias.
    @State private var elegidaEnLaHoja: AthleteWeekDaySession? = nil
    @State var showChat = false
    @State private var showPartnerPlan = false
    @State private var showHistory = false
    @State private var showCiclo = false
    @State private var partner: PartnerInfo? = nil

    // ── Hojear la semana que viene DESLIZANDO EL CARRIL (Alex, 7-ago) ─────────
    // Sin botón: el gesto en la propia tira de días cambia qué semana alimenta
    // esta misma pantalla — la composición no cambia, solo el dato. Solo
    // lectura: nada se mueve ni se marca de una semana sin empezar.
    @State private var verProximaSemana = false
    @State private var semanaSiguiente: SemanaDelPlan? = nil
    @State private var posicionSiguiente: PosicionEnBloque? = nil
    @State private var cargandoSiguiente = false
    @State private var falloSiguiente = false

    // ── Acciones que pueden fallar ────────────────────────────────────────────
    @State var actionError: String? = nil
    @State var undoConfirmTarget: AthleteWeekDaySession? = nil
    @State var deleteFreeTarget: AthleteWeekDaySession? = nil

    var effectiveBearer: String? { bearer }
    private var isDobles: Bool { partner != nil }

    // MARK: - Cuerpo

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            contenido
        }
        .overlay(alignment: .top) { actionErrorBanner }
        .animation(.spring(response: 0.42, dampingFraction: 0.9), value: actionError)
        .task { store.activate(bearer: effectiveBearer); await cargar() }
        .modifier(PlanDialogos(
            undoTarget: $undoConfirmTarget,
            deleteFreeTarget: $deleteFreeTarget,
            onUndo: confirmUndo,
            onDeleteFree: confirmDeleteFree
        ))
        .fullScreenCover(item: $workoutLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: effectiveBearer,
                hrZones: store.identity.value?.hrZones,
                onClose: { workoutLaunch = nil },
                onCompleted: { _ in
                    workoutLaunch = nil
                    Task { await store.planMutated(); await cargar(force: true) }
                }
            )
        }
        .fullScreenCover(item: $executedLaunch) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: effectiveBearer,
                onClose: { executedLaunch = nil },
                onStale: { Task { await store.planMutated(); await cargar(force: true) } }
            )
        }
        .fullScreenCover(isPresented: $showPartnerPlan) {
            DoblesPlanView(bearer: effectiveBearer)
        }
        .fullScreenCover(isPresented: $showHistory) {
            HistoryView(bearer: effectiveBearer, onClose: { showHistory = false })
        }
        .fullScreenCover(isPresented: $showCiclo) {
            PlanCicloView(
                bearer: effectiveBearer,
                nombreBloque: semana?.nombreBloque,
                posicion: posicion,
                hayProximaSemana: hayProximaSemana,
                onClose: { showCiclo = false }
            )
            .environment(store)
        }
        .sheet(isPresented: $showChat) {
            // A custom @Observable environment value does NOT cross a presentation
            // boundary — ChatView reads its cache-first history from the store.
            ChatView(bearer: effectiveBearer).environment(store)
        }
        .sheet(item: $techniqueTarget) { session in
            SessionExercisesSheet(
                assignmentId: session.assignmentId,
                sessionTitle: session.title,
                bearer: effectiveBearer
            )
        }
        .sheet(item: $diaAElegir, onDismiss: {
            guard let elegida = elegidaEnLaHoja else { return }
            elegidaEnLaHoja = nil
            abrir(elegida)
        }) { dia in
            ElegirSesionDelDia(dia: dia) { session in
                elegidaEnLaHoja = session
                diaAElegir = nil
            }
            .compactSheet()
        }
    }

    /// Los CINCO estados que la pantalla resuelve (§5, más el plan en pausa, que
    /// es un vacío CON motivo y por eso también va centrado y con salida).
    @ViewBuilder
    private var contenido: some View {
        if cargando, semana == nil {
            esqueleto
        } else if pausado {
            estadoConCabecera { estadoEnPausa }
        } else if falloDeCarga, semana == nil {
            estadoConCabecera { estadoDeError }
        } else if let semana, semana.tieneAlgunaSesion {
            pantalla(semana)
        } else {
            estadoConCabecera { estadoSinPlan }
        }
    }

    // MARK: - La pantalla con datos

    private func pantalla(_ semana: SemanaDelPlan) -> some View {
        // La semana que la pantalla enseña AHORA: la actual, o la que viene si
        // se deslizó el carril. Todo lo de abajo lee de aquí — es la MISMA
        // composición, solo cambia el dato (Alex, 7-ago: «se muestra igual la
        // view, no te inventes una nueva»).
        let visible = verProximaSemana ? (semanaSiguiente ?? semana) : semana
        let posicionDeVisible = verProximaSemana ? posicionSiguiente : posicion

        return FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                cabeceraDeNavegacion
                CabeceraDelBloque(
                    nombre: visible.nombreBloque,
                    posicion: posicionDeVisible,
                    intencion: visible.intencion
                )
                carrilConGesto(visible)
                heroe(visible)
                if !verProximaSemana, let segunda = sesionSecundaria {
                    filaSegundaSesion(segunda)
                }
                EntradaAlCiclo(
                    nombre: visible.nombreBloque,
                    posicion: posicionDeVisible,
                    onAbrir: { showCiclo = true }
                )
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.s)
            .animation(.spring(response: 0.38, dampingFraction: 0.86), value: verProximaSemana)
        }
        .refreshable {
            if verProximaSemana { await cargarSiguiente(force: true) } else { await cargar(force: true) }
        }
        .anchoredAction { if !verProximaSemana { accionAnclada } }
    }

    // MARK: - Hojear la semana que viene deslizando el carril

    /// El carril, con el gesto que cambia de semana. Deslizar a la izquierda
    /// pide la que viene; a la derecha, vuelve a esta — un solo salto, nunca
    /// más allá de lo que el servidor confirmó que existe (`hasNextWeek`).
    private func carrilConGesto(_ semana: SemanaDelPlan) -> some View {
        CarrilSemana(semana: semana, idDestacado: diaDestacado(semana)?.id, onDia: tocarDia) { dia in
            accionesDelDia(dia)
        }
        // `simultaneous`: un DragGesture normal en el contenedor se come el tap
        // de los ChipDia hijos aunque tenga `minimumDistance` — así conviven.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24)
                .onEnded { valor in
                    guard abs(valor.translation.width) > abs(valor.translation.height) else { return }
                    if valor.translation.width < -40, !verProximaSemana, hayProximaSemana {
                        Haptics.light()
                        verProximaSemana = true
                        Task { await cargarSiguiente() }
                    } else if valor.translation.width > 40, verProximaSemana {
                        Haptics.light()
                        verProximaSemana = false
                    }
                }
        )
    }

    /// El día que el héroe presenta: hoy en la semana actual; hojeando otra,
    /// el primero que trae algo — nunca se inventa un día (§7).
    private func diaDestacado(_ semana: SemanaDelPlan) -> DiaDelPlan? {
        semana.hoy ?? semana.dias.first { !$0.sesiones.isEmpty }
    }

    private func cargarSiguiente(force: Bool = false) async {
        guard let token = effectiveBearer else {
            falloSiguiente = true
            return
        }
        if semanaSiguiente != nil, !force { return }
        cargandoSiguiente = semanaSiguiente == nil
        do {
            let resp = try await PlanService.fetchWeek(bearer: token, weekOffset: 1)
            semanaSiguiente = SemanaDelPlan.desde(resp)
            posicionSiguiente = PosicionEnBloque.desde(etiqueta: resp.macroSummary.weekLabel)
            falloSiguiente = false
        } catch {
            if semanaSiguiente == nil { falloSiguiente = true }
        }
        cargandoSiguiente = false
    }

    /// El héroe: la sesión del día destacado en grande, o el día que no toca
    /// nada. Hojeando otra semana el desglose real no se pide (solo el de HOY
    /// se trae — pedirlo de un día cualquiera encarecería cada deslizamiento);
    /// la tarjeta enseña lo que sí sabe sin fetch — título, formato, reloj — y
    /// abrir la sesión trae el detalle completo, como en cualquier otro sitio.
    @ViewBuilder
    private func heroe(_ semana: SemanaDelPlan) -> some View {
        if let dia = diaDestacado(semana), let sesion = dia.sesiones.first {
            let esHoy = dia.esHoy
            HeroeSesion(
                dia: dia,
                sesion: sesion,
                desglose: esHoy ? desgloseHoy : .vacio,
                marca: marca(sesion),
                onAbrir: { abrir(sesion) }
            )
            .frame(maxHeight: .infinity)
            .contextMenu { if esHoy { accionesDeSesion(sesion) } }
        } else if let dia = semana.hoy {
            HeroeDescanso(
                dia: dia,
                semana: semana,
                medidoAyer: medidoAyer,
                onAbrir: { abrir($0) }
            )
        } else if verProximaSemana {
            // La semana que viene existe (`hasNextWeek`) pero llegó vacía: el
            // coach todavía no le puso sesiones. Un hecho, no un error.
            RedesignEmptyState(
                symbol: "calendar.badge.clock",
                title: "Tu coach aún no ha llenado la semana que viene",
                message: "En cuanto le ponga sesiones las verás aquí.",
                exit: .explained(note: "Desliza a la derecha para volver a esta semana.")
            )
            .frame(maxHeight: .infinity)
        } else {
            // Hoy cae fuera de la semana servida — raro, pero no se inventa un día.
            RedesignEmptyState(
                symbol: "calendar",
                title: "Esta semana no incluye hoy",
                message: "Tu plan se publica por semanas y hoy queda fuera de la que tenemos.",
                exit: .action(title: "Recargar") { Task { await cargar(force: true) } }
            )
            .frame(maxHeight: .infinity)
        }
    }

    /// La SEGUNDA sesión del día (el caso AM+PM): fila compacta, no un segundo
    /// héroe. Es el patrón que la vieja portada de Inicio ya validaba.
    private func filaSegundaSesion(_ session: AthleteWeekDaySession) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            SessionCompactRow(
                slot: slot(for: session),
                title: session.title,
                meta: DuracionDeSesion.texto(session) ?? "También hoy",
                modality: session.modality,
                isFree: session.isSelfOrigin,
                onTap: { abrir(session) }
            )
            menuDeSesion(session)
        }
    }

    // MARK: - Cromo superior

    /// El cromo de la pestaña: chip de Dobles, historial y chat. Sin logo — el
    /// logo vive en Inicio.
    var cabeceraDeNavegacion: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            Spacer(minLength: Theme.Spacing.s)
            if isDobles, let partner {
                Button {
                    Haptics.light()
                    showPartnerPlan = true
                } label: {
                    HStack(spacing: 5) {
                        Circle().fill(Theme.Color.partner).frame(width: 6, height: 6)
                        Text("Dobles · \(partner.firstName)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.Color.surfaceElevated)
                    .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                    .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Modalidad Dobles con \(partner.firstName). Ver su plan")
            }
            botonDeCromo(symbol: "calendar", etiqueta: "Historial de entrenos") {
                showHistory = true
            }
            if hasCoach {
                botonDeCromo(symbol: "message", etiqueta: "Chat con tu coach") {
                    showChat = true
                }
            }
        }
        .frame(minHeight: 36)
    }

    private func botonDeCromo(symbol: String, etiqueta: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(etiqueta)
    }

    // MARK: - La acción anclada (§6.2: vive abajo, siempre visible)

    @ViewBuilder
    private var accionAnclada: some View {
        if let accion = accionDelDia {
            ExpertPrimaryButton(title: accion.titulo, height: 50, action: accion.hacer)
        }
    }

    /// Qué puede hacer el atleta AHORA, en una sola acción. Nunca ofrece empezar
    /// algo que ya está hecho, ni promete una sesión que no existe.
    ///
    /// Sin sesión de hoy y sin mañana que enseñar, no hay una TERCERA acción
    /// que inventar: el pie (`EntradaAlCiclo`) ya ofrece «ver el ciclo entero»,
    /// y una segunda entrada al mismo sitio es ruido, no una salida (encontrado
    /// por Alex, 7-ago: dos botones para lo mismo).
    private var accionDelDia: (titulo: String, hacer: () -> Void)? {
        if let sesion = sesionPrincipal {
            return marca(sesion).isFinished
                ? ("VER LO QUE HICISTE", { executedLaunch = launch(sesion) })
                : ("▶ EMPEZAR", { workoutLaunch = launch(sesion) })
        }
        if let manana = semana?.sesionDeManana {
            return ("VER LO DE MAÑANA", { abrir(manana.sesion) })
        }
        return nil
    }

    // MARK: - Los estados sin datos (§5)

    /// El esqueleto de la carga en frío: la MISMA silueta que la pantalla real,
    /// para que al llegar el dato nada salte de sitio. Nunca un estado vacío
    /// mientras todavía no se sabe si está vacío.
    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            cabeceraDeNavegacion
            VStack(alignment: .leading, spacing: 9) {
                SkeletonBar(width: 160, height: 14)
                SkeletonBar(height: 12)
            }
            HStack(spacing: 2) {
                ForEach(0..<7, id: \.self) { _ in
                    SkeletonBar(height: 62, radius: Theme.Radius.m)
                }
            }
            SkeletonBar(height: 260, radius: Theme.Radius.l)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu plan")
    }

    /// Envuelve un estado sin datos con el cromo persistente: el historial y el
    /// chat no pueden desaparecer solo porque no haya plan que enseñar.
    private func estadoConCabecera<Content: View>(@ViewBuilder _ content: @escaping () -> Content) -> some View {
        CenteredScreen {
            cabeceraDeNavegacion
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.s)
        } content: {
            content()
        }
        .refreshable { await cargar(force: true) }
    }

    /// La semana no tiene sesiones. Son TRES vacíos distintos y decirlos mal tiene
    /// coste real: durante meses esto afirmaba «tu coach aún no ha publicado tu
    /// plan» incluso cuando el plan estaba publicado y solo empezaba más tarde —
    /// el atleta lo leía como negligencia de su coach, y el propio coach perdía
    /// tiempo buscando un fallo que no existía.
    ///
    /// 1. Hay plan y empieza más adelante → se dice la fecha exacta.
    /// 2. Hay coach y no hay nada programado → se está preparando.
    /// 3. No hay coach → la semana es suya para llenarla.
    ///
    /// Ninguno de los tres afirma qué hará el coach ni cuándo (docs/DECISIONS.md,
    /// 7-ago): el caso 1 solo refleja lo que YA está programado.
    private var estadoSinPlan: some View {
        if let inicio = semana?.planStartsOn, let cuando = FechaES.conDia(inicio) {
            return RedesignEmptyState(
                symbol: "calendar.badge.clock",
                title: "Tu plan empieza el \(cuando)",
                message: "Esta semana no tienes sesiones. Ya está todo montado y te espera.",
                exit: (semana?.hasNextWeek ?? false)
                    ? .action(title: "Ver la semana que viene") {
                        Haptics.light()
                        verProximaSemana = true
                        Task { await cargarSiguiente() }
                    }
                    : .explained(note: "Aparecerá aquí el mismo día."),
                symbolColor: Theme.Color.accentText
            )
        }
        return RedesignEmptyState(
            symbol: "calendar.badge.clock",
            title: hasCoach ? "Tu plan se está preparando" : "Tu semana está en blanco",
            message: hasCoach
                ? "En cuanto tu coach lo asigne lo verás aquí, día a día."
                : "Construye un entreno desde Inicio y aparecerá aquí, día a día.",
            exit: hasCoach
                ? .action(title: "Escribir a tu coach") { Haptics.light(); showChat = true }
                : .explained(note: "Los entrenos que montes tú aparecen en esta semana.")
        )
    }

    /// Error de carga SIN caché: honesto y con reintento.
    private var estadoDeError: some View {
        RedesignEmptyState(
            symbol: "wifi.exclamationmark",
            title: "No pudimos cargar tu plan",
            message: "Revisa tu conexión e inténtalo de nuevo.",
            exit: .action(title: "Reintentar") {
                Haptics.light()
                cargando = true
                Task { await cargar(force: true) }
            }
        )
    }

    /// El coach paró el plan. Ni error ni vacío: el progreso está guardado y el
    /// atleta no ve sesiones caducadas.
    private var estadoEnPausa: some View {
        RedesignEmptyState(
            symbol: "pause.circle",
            title: "Tu plan está en pausa",
            message: "\(quienPausa) lo ha pausado mientras te recuperas. Tu progreso está guardado.",
            exit: .explained(note: pausadoDesdeTexto ?? "Retomamos en cuanto estés listo."),
            symbolColor: Theme.Color.accentText
        )
    }

    private var quienPausa: String {
        let coach = coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (coach?.isEmpty == false) ? coach! : "Tu coach"
    }

    private var pausadoDesdeTexto: String? {
        guard let iso = pausadoDesde, let fecha = FechaES.larga(iso) else { return nil }
        return "En pausa desde el \(fecha)."
    }

    // MARK: - Hoy, resuelto

    /// Las sesiones REALES de hoy, en orden (mañana antes que tarde).
    private var sesionesDeHoy: [AthleteWeekDaySession] {
        (semana?.hoy?.sesiones ?? []).sorted { rangoDeSlot($0) < rangoDeSlot($1) }
    }

    /// La sesión que manda en el héroe: la primera que todavía queda por hacer y,
    /// si ya están todas hechas, la primera del día (para poder abrir lo hecho).
    private var sesionPrincipal: AthleteWeekDaySession? {
        sesionesDeHoy.first { !marca($0).isFinished } ?? sesionesDeHoy.first
    }

    /// La otra sesión del día, cuando hay dos.
    private var sesionSecundaria: AthleteWeekDaySession? {
        guard sesionesDeHoy.count > 1, let principal = sesionPrincipal else { return nil }
        return sesionesDeHoy.first { $0.assignmentId != principal.assignmentId }
    }

    func marca(_ session: AthleteWeekDaySession) -> SessionMarkState {
        SessionMarkState.of(status: session.status, assignmentId: session.assignmentId)
    }

    private func slot(for session: AthleteWeekDaySession) -> SessionSlot {
        session.slot.lowercased().hasPrefix("pm") ? .pm : .am
    }

    private func rangoDeSlot(_ s: AthleteWeekDaySession) -> Int {
        s.slot.lowercased().hasPrefix("pm") ? 1 : 0
    }

    func launch(_ session: AthleteWeekDaySession) -> WorkoutLaunch {
        WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
    }

    // MARK: - Abrir

    /// Tocar una sesión ROUTEA POR ESTADO: una terminada (hecha o a medias) abre
    /// el detalle de lo que registraste; una pendiente abre la previa del entreno.
    /// Un solo punto de decisión, para que hecho y pendiente no se confundan.
    private func abrir(_ session: AthleteWeekDaySession) {
        guard !session.assignmentId.isEmpty else { return }
        if marca(session).isFinished {
            executedLaunch = launch(session)
        } else {
            workoutLaunch = launch(session)
        }
    }

    /// Tocar un día del carril: con una sesión la abre; con dos pregunta cuál; sin
    /// ninguna no hay nada que abrir y se responde con un toque háptico, no con
    /// una pantalla vacía.
    private func tocarDia(_ dia: DiaDelPlan) {
        switch dia.sesiones.count {
        case 0:  Haptics.light()
        case 1:  abrir(dia.sesiones[0])
        default: diaAElegir = dia
        }
    }

    // MARK: - Carga (cache-first + SWR, como el resto de la app)

    func cargar(force: Bool = false) async {
        guard effectiveBearer != nil else {
            cargando = false
            falloDeCarga = true
            return
        }
        // 1. Lo que ya está en memoria se pinta YA: cambiar de pestaña no gira.
        if let cached = store.planWeek.value {
            aplicar(cached)
            cargando = false
        }
        // 2. Se revalida en segundo plano (semana + macro + pareja).
        await store.loadPlanScreen(force: force)
        if let fresh = store.planWeek.value {
            aplicar(fresh)
            falloDeCarga = false
        } else if store.planWeek.hasLoaded {
            semana = SemanaDelPlan(dias: [], indiceHoy: nil, intencion: nil, nombreBloque: nil)
            falloDeCarga = false
        } else {
            falloDeCarga = true
        }
        partner = store.partner.value?.partner
        cargando = false
        // 3. Y solo entonces el desglose de HOY (y, si hoy es descanso, lo MEDIDO
        //    de ayer). Nunca la semana entera: encarecería cada apertura.
        await cargarDetalleDeHoy()
    }

    private func aplicar(_ resp: AthletePlanWeekResponse) {
        semana = SemanaDelPlan.desde(resp)
        // «Semana N de M» sale de la etiqueta que compone el servidor. Ver
        // `PosicionEnBloque` para por qué NO se calcula aquí ni sale de
        // `macro_progress.total_assigned_weeks`.
        posicion = PosicionEnBloque.desde(etiqueta: resp.macroSummary.weekLabel)
            ?? PosicionEnBloque.desde(etiqueta: store.macroProgress.value?.macro.weekLabel)
        coachName = resp.coachName
        pausado = resp.week.paused
        pausadoDesde = resp.week.pausedSince
        hayProximaSemana = resp.week.hasNextWeek ?? false
    }

    /// El desglose REAL de la sesión de hoy — sus bloques, su cabecera de formato
    /// y sus cifras. El resumen de fila (`shortPrescription`) es una frase y no
    /// basta para el héroe.
    private func cargarDetalleDeHoy() async {
        guard let token = effectiveBearer else { return }
        guard let sesion = sesionPrincipal else {
            // Hoy es descanso: de fuera solo hace falta cuánto duró DE VERDAD la
            // sesión de ayer. Sin ejecución no hay minutos, y no se rellenan.
            desgloseHoy = .vacio
            desgloseDe = nil
            await cargarMedidoDeAyer(token: token)
            return
        }
        medidoAyer = nil
        // Cambió la sesión de hoy → lo que hay en pantalla ya no es suyo.
        if desgloseDe != sesion.assignmentId {
            desgloseHoy = .vacio
            desgloseDe = sesion.assignmentId
        }
        // La caché local repinta al instante; la red confirma después.
        if let cache = AssignmentDetailCache.load(sesion.assignmentId) {
            desgloseHoy = DesgloseSesion.desde(cache)
        }
        if let detalle = try? await PlanService.fetchAssignmentDetail(sesion.assignmentId, bearer: token) {
            AssignmentDetailCache.save(detalle)
            desgloseHoy = DesgloseSesion.desde(detalle)
        }
    }

    private func cargarMedidoDeAyer(token: String) async {
        guard let ayer = semana?.sesionDeAyer else { medidoAyer = nil; return }
        var detalle = AssignmentDetailCache.load(ayer.sesion.assignmentId)
        if detalle?.execution?.totalDurationSeconds == nil {
            detalle = try? await PlanService.fetchAssignmentDetail(ayer.sesion.assignmentId, bearer: token)
        }
        guard let segundos = detalle?.execution?.totalDurationSeconds, segundos > 0 else {
            medidoAyer = nil
            return
        }
        medidoAyer = max(1, Int((Double(segundos) / 60).rounded()))
    }
}

#Preview {
    PlanView()
        .environment(AppDataStore())
}
