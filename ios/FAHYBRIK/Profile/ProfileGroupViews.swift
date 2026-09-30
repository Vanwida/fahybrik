import SwiftUI

// LAS CUATRO PUERTAS DE PERFIL QUE SON UNA LISTA — Entreno, Cuenta, Ayuda y legal e Identidad.
//
// Cada una es una `PantallaPerfil`: el título con el papel del día y debajo sus bloques, que son grupos
// de filas (`GrupoPerfil`) con su título de sección. Lo que hace cada fila no ha cambiado: mismos
// destinos, mismas hojas, mismos servicios. Dispositivos y Privacidad tienen su propio fichero.

// MARK: - Entreno

struct ProfileEntrenoView: View {
    let bearer: String?
    var hasCoach: Bool = true
    let coachName: String?

    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true
    @State private var contarRepesEnabled = SensorRepCounting.isEnabled

    var body: some View {
        PantallaPerfil(titulo: "Entreno") {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Tu semana")
                GrupoPerfil {
                    NavigationLink {
                        TrainingDaysView(bearer: bearer)
                    } label: {
                        FilaPerfil(
                            glifo: .diasDeEntreno,
                            titulo: "Mis días de entreno",
                            detalle: "Elige qué días entrenas y cómo se reparte tu semana"
                        )
                    }
                    .filaTocablePerfil()
                    NavigationLink {
                        InjuriesView(bearer: bearer, coachName: coachName, hasCoach: hasCoach)
                    } label: {
                        FilaPerfil(
                            glifo: .molestia,
                            titulo: "Molestias y lesiones",
                            detalle: hasCoach
                                ? "Reporta una molestia y sigue su evolución con tu coach"
                                : "Registra una molestia y sigue cómo evoluciona"
                        )
                    }
                    .filaTocablePerfil()
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Durante el entreno")
                GrupoPerfil {
                    FilaInterruptorPerfil(
                        glifo: .voz,
                        titulo: "Avisos de voz",
                        detalle: "En carrera: cambios de tramo, ritmo y parciales por kilómetro.",
                        activo: $voiceCoachEnabled
                    )
                    FilaInterruptorPerfil(
                        glifo: .repeticiones,
                        titulo: "Contar repeticiones",
                        detalle: contarRepesEnabled
                            ? "El reloj precarga las repeticiones y la velocidad. Puede equivocarse: corrige el número siempre que no cuadre."
                            : "Apagado. Las repeticiones las pones tú.",
                        pastilla: "Alpha",
                        activo: contarRepesBinding
                    )
                }
                NotaPerfil("En pruebas: se está calibrando con movimientos reales. Necesita el Apple Watch puesto durante el entreno.")
            }
        }
    }

    private var contarRepesBinding: Binding<Bool> {
        Binding(
            get: { contarRepesEnabled },
            set: { on in
                Haptics.light()
                SensorRepCounting.set(on)
                contarRepesEnabled = on
            }
        )
    }
}

// MARK: - Cuenta

struct ProfileCuentaView: View {
    let bearer: String?
    var hasCoach: Bool = true
    let coachName: String?
    let partnerName: String?
    let onSignOut: () -> Void

    @AppStorage(ThemeMode.storageKey) private var themeMode: ThemeMode = .system

    @State private var sheet: CuentaSheetKind? = nil
    @State private var showDeleteAccount: Bool = false

    private enum CuentaSheetKind: String, Identifiable {
        case methodology
        case coach
        var id: String { rawValue }
    }

    // «Exportar mis datos» vive en Perfil › Privacidad (Alex, 25-09), con su fila y su comportamiento
    // de siempre (ProfilePrivacidadView.swift).
    var body: some View {
        PantallaPerfil(titulo: "Cuenta") {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Apariencia")
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ThemeModePicker(selection: $themeMode)
                    NotaPerfil("«Auto» sigue la apariencia de tu iPhone.")
                }
                .padding(Theme.Spacing.l)
                .tarjetaDia()
            }

            if hasCoach {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("Tu plan")
                    GrupoPerfil {
                        Button {
                            Haptics.light()
                            sheet = .methodology
                        } label: {
                            FilaPerfil(
                                glifo: .plan,
                                titulo: "Cómo se construye tu plan",
                                detalle: "Microciclos diseñados por tu coach, semana a semana."
                            )
                        }
                        .filaTocablePerfil()
                        Button {
                            Haptics.light()
                            sheet = .coach
                        } label: {
                            FilaPerfil(
                                glifo: .coachFicha,
                                titulo: coachName.map { "Tu coach: \($0)" } ?? "Tu coach",
                                detalle: "Diseña tu metodología y tu plan."
                            )
                        }
                        .filaTocablePerfil()
                    }
                }
            }

            AccionTextoPerfil(titulo: "Eliminar mi cuenta", peligro: true) {
                Haptics.medium()
                showDeleteAccount = true
            }
            .disabled(bearer == nil)
        }
        .sheet(item: $sheet) { kind in
            switch kind {
            case .methodology: MethodologySheet()
            case .coach:       CoachSheet(coachName: coachName)
            }
        }
        .sheet(isPresented: $showDeleteAccount) {
            if let bearer {
                DeleteAccountConfirmView(
                    bearer: bearer,
                    partnerName: partnerName,
                    onCompleted: { onSignOut() }
                )
            }
        }
    }
}

// MARK: - Ayuda y legal

struct ProfileAyudaLegalView: View {
    let bearer: String?
    var hasCoach: Bool = true

    @State private var sheet: AyudaSheetKind? = nil

    // La política de privacidad vive en Perfil › Privacidad (Alex, 25-09).
    private enum AyudaSheetKind: String, Identifiable {
        case terms
        case feedback
        var id: String { rawValue }
    }

    var body: some View {
        PantallaPerfil(titulo: "Ayuda y legal") {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Ayuda")
                GrupoPerfil {
                    Button {
                        Haptics.light()
                        sheet = .feedback
                    } label: {
                        FilaPerfil(
                            glifo: .sugerencia,
                            titulo: "Enviar sugerencia o error",
                            detalle: hasCoach
                                ? "Cuéntanos qué mejorar o reporta un fallo. Nos llega directamente al equipo, no a tu coach."
                                : "Cuéntanos qué mejorar o reporta un fallo. Nos llega directamente al equipo."
                        )
                    }
                    .filaTocablePerfil()
                }
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Legal")
                GrupoPerfil {
                    Button {
                        Haptics.light()
                        sheet = .terms
                    } label: {
                        FilaPerfil(glifo: .documento, titulo: "Términos", detalle: Marca.terminosTexto)
                    }
                    .filaTocablePerfil()
                }
            }
        }
        .sheet(item: $sheet) { kind in
            switch kind {
            case .terms:    LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms(hasCoach: hasCoach))
            case .feedback: AppFeedbackSheet(bearer: bearer)
            }
        }
    }
}

// MARK: - Identidad

struct ProfileIdentidadView: View {
    let bearer: String?
    var hasCoach: Bool = true

    @Environment(AppDataStore.self) private var store

    @State private var showPartnerInvite: Bool = false
    @State private var cancellingInvite: Bool = false
    @State private var showUnpairConfirm: Bool = false
    @State private var unpairInProgress: Bool = false

    private var identity: AthleteIdentity? { store.identity.value }
    private var partner: PartnerInfo? { store.partner.value?.partner }
    private var athleteModality: String? { store.partner.value?.athleteModality }
    private var subscription: SubscriptionInfo? { store.subscription.value }

    private var initialLoadDone: Bool {
        store.subscription.hasLoaded && store.partner.hasLoaded
    }

    var body: some View {
        PantallaPerfil(titulo: "Identidad") {
            settingsCard
            if shouldShowPartnerSection {
                if partner == nil {
                    partnerInviteCard
                } else {
                    AccionTextoPerfil(
                        titulo: unpairInProgress ? "Deshaciendo…" : "Deshacer pareja de Dobles",
                        peligro: true,
                        enCurso: unpairInProgress
                    ) { showUnpairConfirm = true }
                }
            }
        }
        .sheet(isPresented: $showPartnerInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in
                Task { await store.refreshPartner(force: true) }
            }
        }
        .alert("Deshacer pareja de Dobles", isPresented: $showUnpairConfirm) {
            Button("Deshacer", role: .destructive) { Task { await performUnpair() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejaréis de compartir plan y analíticas. Las sesiones que ya hicisteis juntos se conservan. Podéis volver a emparejaros más adelante.")
        }
    }

    private var settingsCard: some View {
        GrupoPerfil {
            modalityRow
                .redacted(reason: initialLoadDone ? [] : .placeholder)
            if hasCoach {
                NavigationLink {
                    SubscriptionView(bearer: bearer)
                } label: {
                    FilaValorPerfil(
                        etiqueta: "Suscripción",
                        valor: subscriptionValue,
                        marca: subscriptionMarca,
                        chevron: true
                    )
                }
                .filaTocablePerfil()
            }
            FilaValorPerfil(
                etiqueta: "Objetivo",
                valor: goalTypeLabel(identity?.goalType),
                vacio: identity?.goalType == nil
            )
            FilaValorPerfil(etiqueta: "Idioma", valor: "Español")
        }
    }

    @ViewBuilder
    private var modalityRow: some View {
        if isDobles {
            NavigationLink {
                DoblesPlanView(bearer: bearer)
            } label: {
                FilaValorPerfil(etiqueta: "Modalidad", valor: modalityValue, chevron: true)
            }
            .filaTocablePerfil()
        } else {
            FilaValorPerfil(etiqueta: "Modalidad", valor: modalityValue)
        }
    }

    private var isDobles: Bool {
        if partner != nil { return true }
        if subscription?.planType == "dobles" { return true }
        if (athleteModality ?? "").lowercased() == "dobles" { return true }
        return false
    }

    private var modalityValue: String {
        if let partner {
            return "Dobles · con \(partner.firstName)"
        }
        if isDobles {
            return "Dobles · invita a tu compañero/a"
        }
        switch subscription?.planType {
        case "pro_elite": return "Pro"
        default:          return "Individual"
        }
    }

    private var subscriptionValue: String {
        guard let sub = subscription else { return "Gestionar" }
        switch sub.status {
        case "active":
            if let date = sub.formattedPeriodEnd {
                return sub.cancelAtPeriodEnd ? "Termina el \(date)" : "Activa · renueva \(date)"
            }
            return "Activa"
        case "trialing":
            return "Prueba" + (sub.formattedPeriodEnd.map { " · hasta \($0)" } ?? "")
        case "past_due", "unpaid", "incomplete":
            return "Pago pendiente"
        case "canceled", "incomplete_expired":
            return "Cancelada"
        case "paused":
            return "Pausada"
        default:
            return "Gestionar"
        }
    }

    /// El punto de estado de la suscripción: verde si va bien, rojo si pide arreglo; sin punto si no hay
    /// nada que decir (el color de estado va en la marca, nunca en el texto).
    private var subscriptionMarca: SwiftUI.Color? {
        switch subscription?.status {
        case "active", "trialing": return Theme.Color.ok
        case "past_due", "unpaid", "incomplete", "canceled", "incomplete_expired":
            return Theme.Color.danger
        default: return nil
        }
    }

    private var shouldShowPartnerSection: Bool {
        guard initialLoadDone else { return false }
        return isDobles
    }

    private var sentInvitation: SentInvitation? { store.partner.value?.sentInvitation }

    @ViewBuilder
    private var partnerInviteCard: some View {
        if let inv = sentInvitation, inv.state == .pending {
            pendingInvitationCard(inv)
        } else if let inv = sentInvitation, inv.state == .expired {
            terminalInvitationCard(
                headline: "La invitación a \(inv.inviteeEmail) caducó",
                detail: "Puedes volver a invitarle. Tendrá otros 14 días para aceptar.",
                cta: "Volver a invitar"
            )
        } else if let inv = sentInvitation, inv.state == .declined {
            terminalInvitationCard(
                headline: "\(inv.inviteeEmail) rechazó la invitación",
                detail: "Puedes invitar a otra persona a entrenar contigo en Dobles.",
                cta: "Invitar a otra persona"
            )
        } else {
            inviteCtaCard
        }
    }

    private var inviteCtaCard: some View {
        terminalInvitationCard(
            headline: "Aún no has añadido a tu compañero/a",
            detail: "Invítale por email para entrenar juntos en Dobles. Tendrá 14 días para aceptar.",
            cta: "Invitar a tu compañero/a"
        )
    }

    /// El bloque de Dobles que invita: lo que pasa, lo que sigue y UNA acción. Realzado con el acento del
    /// club, que es el color de «esto te espera».
    private func terminalInvitationCard(headline: String, detail: String, cta: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text(headline)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Haptics.light()
                showPartnerInvite = true
            } label: {
                AccionDia(cta, glifo: .mas)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia(realce: true)
    }

    private func pendingInvitationCard(_ inv: SentInvitation) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            InfoPill(text: "Invitación pendiente", estilo: .acento)
            Text("Enviada a \(inv.inviteeEmail)")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(inv.expiryText.map { "Esperando a que acepte · \($0)." }
                    ?? "Esperando a que acepte desde su email.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            AccionTextoPerfil(
                titulo: cancellingInvite ? "Cancelando…" : "Cancelar invitación",
                peligro: true,
                alineada: .leading,
                enCurso: cancellingInvite
            ) { Task { await cancelInvite() } }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia(realce: true)
    }

    private func performUnpair() async {
        guard let bearer, !unpairInProgress else { return }
        unpairInProgress = true
        defer { unpairInProgress = false }
        do {
            try await PartnerService.unlink(bearer: bearer)
            Haptics.success()
            await store.refreshPartner(force: true)
        } catch {
            Haptics.error()
        }
    }

    private func cancelInvite() async {
        guard let bearer, !cancellingInvite else { return }
        cancellingInvite = true
        defer { cancellingInvite = false }
        do {
            _ = try await PartnerService.cancelInvite(bearer: bearer)
            Haptics.light()
        } catch {}
        await store.refreshPartner(force: true)
    }
}
