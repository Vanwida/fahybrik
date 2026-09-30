import SwiftUI

// Dobles · la semana conectada (el HUB). La semana del atleta, un selector que enseña la de su pareja en solo
// lectura (marcando lo opcional juntos y la simulación conjunta, que es obligatoria) y las puertas a las otras
// tres pantallas de la pareja.
//
// LA PIEL ES LA DE «EL DÍA»: cabecera fija con los papeles de la escala (nada por debajo de 15 pt), tarjetas de
// `caraDobles`, teselas del kit para el ritmo de la pareja. El atleta es el acento del club y la pareja el azul
// de `Theme.Color.partner`; el tinte de una fila conjunta es el del acento, no un naranja.
//
// PRESENTACIÓN. Se abre a pantalla completa desde Plan y desde Perfil (sin `NavigationStack` alrededor), así
// que esta pantalla lleva la SUYA: la cabecera es propia (con su ✕) y la barra del sistema se oculta; las otras
// tres se empujan con `NavigationLink` y cada una trae su ‹.
//
// HUECO DEL SERVIDOR. `DoblesService.fetchConnectedPlan` devuelve nil mientras no haya semana conectada; con
// eso se cuenta honestamente quién la publica y cuándo aparece. JAMÁS se inventan las sesiones de la pareja.
struct DoblesPlanView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var plan: DoblesConnectedPlan? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    /// Qué semana enseña el selector: la del atleta o la de su pareja (solo lectura).
    @State private var showingPartner = false
    // #56 — la presencia en vivo de la pareja (una lectura al aparecer) → el aviso «únete en vivo».
    // Aquí es informativo: esta vista de solo lectura no tiene flujo de empezar sesión.
    @State private var partnerLive: PartnerLiveStatus? = nil

    /// Nombre de pila de la pareja, del plan conectado o del vínculo.
    private var partnerFirstName: String {
        plan?.partnerName ?? partner?.firstName ?? "tu compañero"
    }

    private var apoyo: String {
        guard let plan else { return "Plan conectado" }
        let semana = plan.weekLabel ?? ""
        let conectada = "conectada con \(partnerFirstName)"
        return semana.isEmpty ? conectada : "\(semana) · \(conectada)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CabeceraDobles(titulo: "Tu semana", apoyo: apoyo, salida: .cerrar, alSalir: { dismiss() }) {
                    DoblesAvatarPair(selfInitials: "Yo", partnerInitials: partner?.initials ?? "·")
                }
                contenido
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task(id: bearer) { await reload() }
    }

    // MARK: - Contenido por estado

    @ViewBuilder
    private var contenido: some View {
        if loading {
            ScrollView {
                DoblesPlanEsqueleto()
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDisabled(true)
        } else if let plan {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    DoblesLiveBanner(state: DoblesLiveBannerState.from(partnerLive, hasOwnSessionToday: false))
                    DoblesPlanCuerpo(
                        plan: plan,
                        partnerName: partnerFirstName,
                        showingPartner: $showingPartner,
                        bearer: bearer
                    )
                }
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollBounceBehavior(.basedOnSize)
        } else {
            // Un vacío es UNA decisión: se centra en el alto que deja la cabecera.
            CenteredScreen {
                EmptyView()
            } lead: {
                DoblesLiveBanner(state: DoblesLiveBannerState.from(partnerLive, hasOwnSessionToday: false))
                    .padding(.horizontal, Theme.Spacing.pantalla)
            } content: {
                sinPlan
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    @ViewBuilder
    private var sinPlan: some View {
        if partner == nil {
            // Sin pareja VINCULADA: el atleta puede arreglarlo él mismo.
            DoblesNoPartnerState(
                message: "Cuando conectes con tu compañero veréis cada uno vuestro plan, lo que es opcional juntos y la simulación conjunta del sábado.",
                bearer: bearer,
                onInvited: { Task { await reload() } }
            )
        } else {
            // Con pareja, pero sin semana conectada: nada que pulsar, y se dice quién la publica.
            RedesignEmptyState(
                symbol: "calendar",
                title: "Semana conectada sin publicar",
                message: "En cuanto haya semana publicada para los dos veréis aquí cada plan, lo que es opcional juntos y la simulación conjunta.",
                exit: .explained(note: "La publica tu coach. No tienes que hacer nada: aparece sola.")
            )
        }
    }

    /// La identidad de la pareja (ya entregada) + la semana conectada (hueco del servidor) + la presencia en
    /// vivo de la pareja. Se repite tras una invitación para que la pantalla deje de decir que no hay pareja
    /// en cuanto la hay.
    private func reload() async {
        loading = true
        if let bearer {
            partner = try? await PartnerService.fetchPartner(bearer: bearer)
        }
        plan = await DoblesService.fetchConnectedPlan(bearer: bearer)
        loading = false
        // #56 — la presencia en vivo (solo con vínculo de pareja).
        if partner != nil, case .ok(let p) = await DoblesLiveClient.fetch(bearer: bearer) {
            partnerLive = p
        }
    }
}

// MARK: - La semana conectada con datos

/// Lo que hay debajo de la cabecera cuando hay semana: el ritmo de la pareja, el selector, los días y las
/// puertas a las otras pantallas. Solo dibuja; la carga y los estados viven en `DoblesPlanView`.
struct DoblesPlanCuerpo: View {
    let plan: DoblesConnectedPlan
    let partnerName: String
    @Binding var showingPartner: Bool
    var bearer: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            // #28 — el ritmo de la pareja arriba (solo con historia conjunta real).
            if let streak = plan.streak, streak.hasHistory {
                DoblesStreakSection(streak: streak, partnerName: partnerName)
            }
            DoblesPlanToggle(
                showingPartner: $showingPartner,
                partnerName: partnerName,
                partnerVisible: plan.partnerPlanVisible
            )
            dias
            enlaces
        }
    }

    @ViewBuilder
    private var dias: some View {
        let days = showingPartner ? plan.partnerDays : plan.selfDays
        if days.isEmpty {
            RedesignEmptyState(
                symbol: "calendar",
                title: showingPartner ? "Plan de \(partnerName) no disponible" : "Semana sin publicar",
                message: showingPartner
                    ? "Tu compañero aún no ha compartido su semana."
                    : "Tu coach aún no ha publicado esta semana.",
                // De verdad no hay nada que hacer desde aquí: depende de otra persona.
                exit: .explained(note: showingPartner
                    ? "Cuando la comparta, aparece aquí sin que tengas que hacer nada."
                    : "Cuando la publique, aparece aquí sin que tengas que hacer nada.")
            )
            .padding(.vertical, Theme.Spacing.l)
        } else {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(days) { day in
                    if day.togetherness == .jointMandatory {
                        // La fila de la simulación conjunta lleva a su pantalla.
                        NavigationLink {
                            DoblesSimulationView(bearer: bearer)
                        } label: {
                            DoblesPlanDayRow(day: day, abre: true)
                        }
                        .buttonStyle(PressScaleStyle())
                    } else {
                        DoblesPlanDayRow(day: day, abre: false)
                    }
                }
            }
        }
    }

    private var enlaces: some View {
        VStack(spacing: Theme.Spacing.s) {
            // Las analíticas compartidas (pantalla 2).
            NavigationLink {
                DoblesSharedAnalyticsView(bearer: bearer)
            } label: {
                DoblesFilaEnlace(
                    simbolo: "chart.bar.xaxis",
                    titulo: "Analíticas compartidas",
                    apoyo: "Compartís analíticas y resultados de cada sesión",
                    colorDelGlifo: Theme.Color.partner
                )
            }
            .buttonStyle(PressScaleStyle())

            NavigationLink {
                // El id real de la asignación opcional-juntos del plan (nil solo cuando esta semana no
                // hay ninguna).
                DoblesTrainTogetherView(sessionId: plan.trainTogetherSessionId, bearer: bearer)
            } label: {
                DoblesFilaEnlace(
                    simbolo: "figure.strengthtraining.traditional",
                    titulo: "Entrenar a la vez",
                    apoyo: "opcional · misma sesión, cada uno su carga"
                )
            }
            .buttonStyle(PressScaleStyle())

            NavigationLink {
                DoblesSimulationView(bearer: bearer)
            } label: {
                DoblesFilaEnlace(
                    simbolo: "flag.checkered",
                    titulo: "Simulación conjunta",
                    apoyo: "obligatoria juntos · reparto de estaciones",
                    realce: true
                )
            }
            .buttonStyle(PressScaleStyle())
        }
    }
}

// MARK: - Mi plan / Plan de {pareja}

/// El selector de dos pastillas: «Mi plan» y «Plan de {pareja}» (solo lectura). Deshabilitado cuando la pareja
/// no ha compartido su plan. La activa es el relleno del acento del club con su tinta encima.
struct DoblesPlanToggle: View {
    @Binding var showingPartner: Bool
    let partnerName: String
    let partnerVisible: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            pastilla(titulo: "Mi plan", solo: false, activa: !showingPartner, habilitada: true) {
                showingPartner = false
            }
            pastilla(titulo: "Plan de \(partnerName)", solo: true, activa: showingPartner, habilitada: partnerVisible) {
                guard partnerVisible else { return }
                showingPartner = true
            }
        }
    }

    private func pastilla(
        titulo: String,
        solo: Bool,
        activa: Bool,
        habilitada: Bool,
        alTocar: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.light()
            withAnimation(Theme.Motion.reveal) { alTocar() }
        } label: {
            HStack(spacing: Theme.Spacing.xs + 2) {
                Text(titulo)
                    .papel(.rotulo)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                // «Solo lectura»: el ojo sustituye al emoji de antes y se lee como glifo.
                if solo {
                    Image(systemName: "eye")
                        .font(.system(size: 15, weight: .semibold))
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(activa ? Theme.Color.accentOn : (habilitada ? Theme.Color.foreground : Theme.Color.muted))
            .padding(.horizontal, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .background(activa ? Theme.Color.accent : Theme.Color.surfaceElevated, in: Capsule())
            .overlay(Capsule().strokeBorder(activa ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .disabled(!habilitada)
        .accessibilityLabel(solo ? "\(titulo), solo lectura" : titulo)
        .accessibilityAddTraits(activa ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Un día del plan

/// Un día de la semana conectada: su código, el punto de la modalidad, la sesión con su detalle y la marca de
/// cómo se comparte. La fila de la simulación conjunta (obligatoria juntos) es la única teñida del acento del
/// club y lleva su chevron: es la única que abre otra pantalla.
struct DoblesPlanDayRow: View {
    let day: DoblesPlanDay
    /// La fila abre otra pantalla (la simulación conjunta): lleva chevron.
    var abre = false

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    private var esConjunta: Bool { day.togetherness == .jointMandatory }
    private var esDescanso: Bool { day.togetherness == .rest }
    private var marcaVaDebajo: Bool { day.togetherness == .optionalTogether }

    var body: some View {
        Group {
            if tamanoDeTexto.isAccessibilitySize || marcaVaDebajo {
                // La marca pasa debajo cuando junto al título lo aplastaría: con texto enorme, o si es una
                // pastilla ancha («Opcional juntos»).
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    principal
                    marca
                }
            } else {
                HStack(alignment: .center, spacing: Theme.Spacing.m) {
                    principal
                    Spacer(minLength: Theme.Spacing.s)
                    marca
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Theme.Size.toque + Theme.Spacing.l, alignment: .leading)
        .caraDobles(esConjunta ? .acento : .neutra)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(abre ? .isButton : [])
    }

    private var principal: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            Text(day.dayLabel)
                .papel(.notaPesada)
                .foregroundStyle(esConjunta ? Theme.Color.foreground : Theme.Color.muted)
                .frame(minWidth: 44, alignment: .leading)
                .fixedSize()
            if !esDescanso, day.sessionTitle != nil {
                ModalityDot(modality: day.modality, size: 8)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(day.sessionTitle ?? "Descanso")
                    .papel(esConjunta ? .cuerpoFuerte : .cuerpo)
                    .foregroundStyle(esDescanso ? Theme.Color.muted : Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = day.detail, !detail.isEmpty {
                    Text(detail)
                        .papel(.nota)
                        .foregroundStyle(esConjunta ? Theme.Color.foreground : Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder
    private var marca: some View {
        switch day.togetherness {
        case .bothDone:
            HStack(spacing: Theme.Spacing.xs + 2) {
                SelloEstadoDia(estado: .hecha, tam: 20)
                Text("Los 2").papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
            }
        case .optionalTogether:
            InfoPill(text: "Opcional juntos", estilo: .neutro)
        case .eachOwn:
            Text("Cada uno").papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
        case .jointMandatory:
            HStack(spacing: Theme.Spacing.s) {
                InfoPill(text: "Juntos", estilo: .solido)
                if abre { IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.foreground) }
            }
        case .rest, .unknown:
            EmptyView()   // AUDIT-B2 — una marca desconocida no pinta nada
        }
    }

    private var accessibilityLabel: String {
        var parts = [day.dayLabel, day.sessionTitle ?? "Descanso"]
        if let d = day.detail, !d.isEmpty { parts.append(d) }
        switch day.togetherness {
        case .bothDone: parts.append("completado por los dos")
        case .optionalTogether: parts.append("opcional juntos")
        case .eachOwn: parts.append("cada uno por su cuenta")
        case .jointMandatory: parts.append("simulación conjunta obligatoria")
        case .rest, .unknown: break
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - El esqueleto

/// La semana conectada mientras llega: la misma silueta que lo que la sustituye (selector, días y puertas),
/// sin inventar ninguna sesión.
struct DoblesPlanEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.s) {
                SkeletonBar(height: Theme.Size.toque, radius: Theme.Size.toque / 2)
                SkeletonBar(height: Theme.Size.toque, radius: Theme.Size.toque / 2)
            }
            VStack(spacing: Theme.Spacing.s) {
                ForEach(0..<5, id: \.self) { _ in
                    SkeletonBar(height: Theme.Size.toque + Theme.Spacing.l, radius: Theme.Radius.tarjeta)
                }
            }
            VStack(spacing: Theme.Spacing.s) {
                ForEach(0..<3, id: \.self) { _ in
                    SkeletonBar(height: Theme.Size.toque + Theme.Spacing.l + Theme.Spacing.s, radius: Theme.Radius.tarjeta)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu semana conectada")
    }
}
