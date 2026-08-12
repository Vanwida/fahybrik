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
//   · Cromo superior    — el ciclo, el historial y el chat. La PUERTA AL CICLO
//                         vive aquí desde el 11-ago (Alex): estaba al pie como
//                         una tarjeta de dos líneas que se comía alto del héroe
//                         para decir lo que la cabecera ya dice.
//   · CabeceraDelBloque — el bloque, «Semana N de M» y la línea del coach.
//   · CarrilSemana      — los siete días con su sello. Tocar un día lo abre;
//                         pulsación larga saca sus acciones (mover · técnica ·
//                         corregir · borrar libre).
//   · Héroe             — la sesión de hoy en grande, o el día de descanso. Una
//                         SEGUNDA sesión del día va como fila compacta debajo,
//                         no como un segundo héroe.
//   · Acción anclada    — empezar hoy · ver lo hecho · ver lo de mañana.
//
// ALTURA (contrato §6.1): la pantalla es `llena` — el cromo de arriba es fijo y
// TODO el sobrante se lo lleva el héroe, que es el sujeto. El día de descanso
// degrada a `centra`.
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

    // ── El desglose del día MOSTRADO — sea hoy o uno que se hojeó ─────────────
    // No hay «el desglose de hoy» y por separado «el de otro día»: hay UN solo
    // día mostrado en cada momento, y esto es su desglose real (Alex, 7-ago:
    // «si cada día es una card, cuando pasa el día se ve la card del día»).
    @State private var desgloseMostrado: DesgloseSesion = .vacio
    /// De QUÉ sesión es el desglose que hay en memoria. Sin esto, cambiar de
    /// día y fallar la siguiente petición dejaría en pantalla los bloques de
    /// OTRA sesión — un desglose real, de la sesión equivocada (§7).
    @State private var desgloseDeMostrado: String? = nil
    /// Los minutos MEDIDOS de la sesión de ayer — solo se piden cuando HOY (el
    /// real, sin nada seleccionado) es descanso, que es cuando esa tarjeta
    /// concreta los enseña.
    @State private var medidoAyer: Int? = nil

    // ── Navegación (los mismos destinos de siempre) ───────────────────────────
    @State var workoutLaunch: WorkoutLaunch? = nil
    @State private var executedLaunch: WorkoutLaunch? = nil
    @State var techniqueTarget: AthleteWeekDaySession? = nil
    @State var showChat = false
    /// Sobre qué se abre el chat cuando se abre desde el menú de una sesión o de
    /// un ejercicio. Nil desde el cromo: entonces es la conversación a secas.
    @State var contextoDelChat: ChatContextChoice? = nil
    @State private var showPartnerPlan = false
    @State private var showHistory = false
    @State private var showCiclo = false
    @State private var partner: PartnerInfo? = nil

    // ── Un solo mecanismo: qué día muestra la card, ahora mismo (Alex, 7-ago) ─
    // Tocar un chip del carril, o deslizarlo entre semanas, hacen LO MISMO:
    // cambian cuál es el día mostrado. La card que lo pinta es siempre la
    // misma (`heroe(_:)`); solo cambia el dato. Nunca dos pantallas para lo
    // mismo, nunca un salto a otro sitio por tocar un chip.
    @State private var verProximaSemana = false
    @State private var semanaSiguiente: SemanaDelPlan? = nil
    @State private var posicionSiguiente: PosicionEnBloque? = nil
    @State private var cargandoSiguiente = false
    @State private var falloSiguiente = false
    /// El día elegido A MANO dentro de la semana visible. `nil` = el que toca
    /// por defecto (hoy en esta semana; el primero con algo al hojear otra).
    @State private var diaSeleccionadoId: String? = nil

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
        // El desglose real del día MOSTRADO — se pide cada vez que ese día
        // cambia (por tocar un chip o por deslizar de semana), nunca antes.
        .task(id: claveDeMostrado) { await cargarDetalleDeMostrado() }
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
            // El sujeto del ciclo sale de su propio camino, no de esta pantalla:
            // pasarle el nombre del bloque sería una segunda fuente del mismo dato.
            PlanCicloView(bearer: effectiveBearer, onClose: { showCiclo = false })
                .environment(store)
        }
        .sheet(isPresented: $showChat, onDismiss: { contextoDelChat = nil }) {
            // A custom @Observable environment value does NOT cross a presentation
            // boundary — ChatView reads its cache-first history from the store.
            ChatView(bearer: effectiveBearer, contextoInicial: contextoDelChat)
                .environment(store)
        }
        .sheet(item: $techniqueTarget) { session in
            SessionExercisesSheet(
                assignmentId: session.assignmentId,
                sessionTitle: session.title,
                bearer: effectiveBearer,
                // Preguntar por UN ejercicio: se cierra el índice y el chat se
                // abre con ese ejercicio ya señalado. Las dos hojas son de esta
                // pantalla, así que el relevo se resuelve aquí y no hace falta
                // una segunda puerta al chat.
                onPreguntar: hasCoach ? { ejercicio in
                    techniqueTarget = nil
                    preguntarPorEjercicio(ejercicio, de: session)
                } : nil
            )
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
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                cabeceraDeNavegacion
                CabeceraDelBloque(
                    nombre: semanaVisible?.nombreBloque,
                    posicion: posicionVisible,
                    intencion: semanaVisible?.intencion
                )
                carrilConGesto
                heroe
                if let segunda = sesionSecundariaMostrada {
                    filaSegundaSesion(segunda)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.s)
            .animation(.spring(response: 0.38, dampingFraction: 0.86), value: verProximaSemana)
            .animation(.spring(response: 0.3, dampingFraction: 0.88), value: diaSeleccionadoId)
        }
        .refreshable {
            if verProximaSemana { await cargarSiguiente(force: true) } else { await cargar(force: true) }
        }
        .anchoredAction { accionAnclada }
    }

    // MARK: - Un solo mecanismo: seleccionar un día cambia qué muestra la card

    /// La semana que la pantalla enseña AHORA: la actual, o la que viene si se
    /// deslizó el carril. TODO lo de abajo lee de aquí — es la MISMA
    /// composición siempre, solo cambia el dato (Alex, 7-ago).
    private var semanaVisible: SemanaDelPlan? { verProximaSemana ? (semanaSiguiente ?? semana) : semana }
    private var posicionVisible: PosicionEnBloque? { verProximaSemana ? posicionSiguiente : posicion }

    /// El día que la card muestra: el que el atleta seleccionó a mano dentro de
    /// la semana visible; si no seleccionó ninguno, hoy (en esta semana) o el
    /// primero con algo (hojeando otra) — nunca se inventa un día (§7).
    private func diaMostrado(_ semana: SemanaDelPlan) -> DiaDelPlan? {
        if let id = diaSeleccionadoId, let dia = semana.dias.first(where: { $0.id == id }) {
            return dia
        }
        return semana.hoy ?? semana.dias.first { !$0.sesiones.isEmpty }
    }

    private var diaMostradoActual: DiaDelPlan? { semanaVisible.flatMap(diaMostrado) }
    private var sesionMostrada: AthleteWeekDaySession? { diaMostradoActual?.sesiones.first }

    /// La OTRA sesión del día mostrado, cuando lleva dos (AM+PM) — de cualquier
    /// día que se esté viendo, no solo hoy.
    private var sesionSecundariaMostrada: AthleteWeekDaySession? {
        guard let dia = diaMostradoActual, dia.sesiones.count > 1, let principal = sesionMostrada else { return nil }
        return dia.sesiones.first { $0.assignmentId != principal.assignmentId }
    }

    /// Tocar un chip SELECCIONA ese día — no abre nada. Es el mismo mecanismo
    /// que deslizar de semana: cambia qué día alimenta la MISMA card. Entrar al
    /// detalle completo se hace tocando DENTRO de la card (Alex, 7-ago).
    private func seleccionarDia(_ dia: DiaDelPlan) {
        Haptics.light()
        diaSeleccionadoId = dia.id
    }

    /// El carril, con el gesto que cambia de semana. Deslizar a la izquierda
    /// pide la que viene; a la derecha, vuelve a esta — un solo salto, nunca
    /// más allá de lo que el servidor confirmó que existe (`hasNextWeek`). Cada
    /// salto de semana limpia la selección: se empieza en el día por defecto de
    /// la semana a la que se llega, no en un id que ya no pertenece a ella.
    @ViewBuilder
    private var carrilConGesto: some View {
        if let semanaVis = semanaVisible {
            CarrilSemana(semana: semanaVis, idDestacado: diaMostrado(semanaVis)?.id, onDia: seleccionarDia) { dia in
                accionesDelDia(dia)
            }
            // `simultaneous`: un DragGesture normal en el contenedor se come el
            // tap de los ChipDia hijos aunque tenga `minimumDistance` — así conviven.
            .simultaneousGesture(
                DragGesture(minimumDistance: 24)
                    .onEnded { valor in
                        guard abs(valor.translation.width) > abs(valor.translation.height) else { return }
                        if valor.translation.width < -40, !verProximaSemana, hayProximaSemana {
                            Haptics.light()
                            diaSeleccionadoId = nil
                            verProximaSemana = true
                            Task { await cargarSiguiente() }
                        } else if valor.translation.width > 40, verProximaSemana {
                            Haptics.light()
                            diaSeleccionadoId = nil
                            verProximaSemana = false
                        }
                    }
            )
        }
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

    /// El héroe: la sesión del día mostrado en grande —con su desglose REAL,
    /// sea hoy o un día que se hojeó—, o el día que no toca nada. Una sola
    /// composición para cualquier día; lo único que cambia es el dato.
    @ViewBuilder
    private var heroe: some View {
        if let dia = diaMostradoActual, let sesion = dia.sesiones.first {
            HeroeSesion(
                dia: dia,
                sesion: sesion,
                desglose: desgloseMostrado,
                marca: marca(sesion),
                onAbrir: { abrir(sesion) }
            )
            .frame(maxHeight: .infinity)
            .contextMenu { accionesDeSesion(sesion) }
        } else if let dia = diaMostradoActual {
            // El día sin nada — MISMA card, otro contenido. El marco de
            // ayer/mañana solo cuando el día mostrado es HOY de verdad.
            HeroeDescanso(
                dia: dia,
                semana: semana ?? SemanaDelPlan(dias: [], indiceHoy: nil, intencion: nil, nombreBloque: nil, planStartsOn: nil),
                medidoAyer: medidoAyer,
                mostrarContexto: dia.esHoy && !verProximaSemana,
                onAbrir: { abrir($0) }
            )
            .frame(maxHeight: .infinity)
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

    /// El cromo de la pestaña: chip de Dobles, ciclo, historial y chat. Sin logo
    /// — el logo vive en Inicio.
    ///
    /// El ciclo va PRIMERO de los tres iconos porque es el único que habla del
    /// plan que se está mirando: el historial y el chat son sitios a los que se va
    /// desde cualquier parte.
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
            botonDeCromo(symbol: "square.stack.3d.up", etiqueta: "Ver el ciclo entero") {
                showCiclo = true
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

    /// Qué puede hacer el atleta AHORA con lo que la card enseña, en una sola
    /// acción. Sigue al día MOSTRADO, sea hoy o uno que se hojeó — actuar sobre
    /// una sesión que no es la que se ve en pantalla sería la propia mentira
    /// que este botón existe para evitar.
    ///
    /// «Ver lo de mañana» solo aplica al descanso de HOY sin seleccionar nada:
    /// hojeando otro día ya se está mirando ESE día, no hace falta ofrecer
    /// otro salto. Y sin sesión ni mañana, no hay una TERCERA acción que
    /// inventar: el cromo de arriba ya lleva al ciclo entero, y una segunda
    /// entrada al mismo sitio es ruido, no una salida (Alex, 7-ago).
    private var accionDelDia: (titulo: String, hacer: () -> Void)? {
        if let sesion = sesionMostrada {
            return marca(sesion).isFinished
                ? ("VER LO QUE HICISTE", { executedLaunch = launch(sesion) })
                : ("▶ EMPEZAR", { workoutLaunch = launch(sesion) })
        }
        if !verProximaSemana, diaSeleccionadoId == nil, let manana = semana?.sesionDeManana {
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
                exit: hayProximaSemana
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

    // MARK: - Sesión, marca, lanzamiento

    func marca(_ session: AthleteWeekDaySession) -> SessionMarkState {
        SessionMarkState.of(status: session.status, assignmentId: session.assignmentId)
    }

    private func slot(for session: AthleteWeekDaySession) -> SessionSlot {
        session.slot.lowercased().hasPrefix("pm") ? .pm : .am
    }

    func launch(_ session: AthleteWeekDaySession) -> WorkoutLaunch {
        WorkoutLaunch(assignmentId: session.assignmentId, title: session.title)
    }

    // MARK: - Abrir

    /// Tocar DENTRO de la card ROUTEA POR ESTADO: una sesión terminada (hecha o
    /// a medias) abre el detalle de lo que registraste; una pendiente abre la
    /// previa del entreno. Un solo punto de decisión, para que hecho y
    /// pendiente no se confundan. Esto es lo único que sale de esta pantalla —
    /// tocar un chip del carril YA NO llega aquí, solo selecciona (Alex, 7-ago).
    private func abrir(_ session: AthleteWeekDaySession) {
        guard !session.assignmentId.isEmpty else { return }
        if marca(session).isFinished {
            executedLaunch = launch(session)
        } else {
            workoutLaunch = launch(session)
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
            semana = SemanaDelPlan(dias: [], indiceHoy: nil, intencion: nil, nombreBloque: nil, planStartsOn: nil)
            falloDeCarga = false
        } else {
            falloDeCarga = true
        }
        partner = store.partner.value?.partner
        cargando = false
        // El desglose del día mostrado lo dispara `.task(id: claveDeMostrado)`
        // en el body — no hace falta pedirlo aquí también.
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

    // MARK: - El desglose del día MOSTRADO

    /// La clave que dispara `cargarDetalleDeMostrado()`: cambia cada vez que
    /// cambia CUÁL es el día mostrado — por semana, por selección o por la
    /// sesión concreta. `.task(id:)` cancela y repite la petición sola.
    private var claveDeMostrado: String {
        "\(verProximaSemana)|\(diaSeleccionadoId ?? "")|\(sesionMostrada?.assignmentId ?? "")"
    }

    /// El desglose REAL del día que la card enseña AHORA — sus bloques, su
    /// cabecera de formato y sus cifras. El resumen de fila (`shortPrescription`)
    /// es una frase y no basta para la card, sea el día que sea (Alex, 7-ago:
    /// «no me la enseñes vacía»).
    private func cargarDetalleDeMostrado() async {
        guard let token = effectiveBearer else { return }
        guard let sesion = sesionMostrada else {
            desgloseMostrado = .vacio
            desgloseDeMostrado = nil
            // Solo el descanso de HOY sin seleccionar nada enseña ayer medido —
            // es el marco de `HeroeDescanso`, no el de un día hojeado aparte.
            if !verProximaSemana, diaSeleccionadoId == nil {
                await cargarMedidoDeAyer(token: token)
            } else {
                medidoAyer = nil
            }
            return
        }
        medidoAyer = nil
        // Cambió el día mostrado → lo que hay en pantalla ya no es suyo.
        if desgloseDeMostrado != sesion.assignmentId {
            desgloseMostrado = .vacio
            desgloseDeMostrado = sesion.assignmentId
        }
        // La caché local repinta al instante; la red confirma después.
        if let cache = AssignmentDetailCache.load(sesion.assignmentId) {
            desgloseMostrado = DesgloseSesion.desde(cache)
        }
        if let detalle = try? await PlanService.fetchAssignmentDetail(sesion.assignmentId, bearer: token) {
            AssignmentDetailCache.save(detalle)
            desgloseMostrado = DesgloseSesion.desde(detalle)
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
