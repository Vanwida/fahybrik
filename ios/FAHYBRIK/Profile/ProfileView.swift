import SwiftUI

// Profile tab — élite athlete identity card + devices, methodology, account,
// legal, sign out. Every row is navigable: opens a NavigationLink to the
// existing detail (Suscripción → SubscriptionView, PM5 → PM5SettingsView)
// or a sheet with mocked content for the Pablo demo. Sign out wires through
// the onSignOut closure provided by AppRoot/TodayView.
struct ProfileView: View {
    let bearer: String?
    let onSignOut: () -> Void

    @State private var sheet: SheetKind? = nil

    private enum SheetKind: String, Identifiable {
        case methodology
        case coach
        case editProfile
        case notifications
        case privacy
        case terms
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        identityCard
                        aEventCard
                        SectionHeader(title: "Dispositivos")
                        devicesCard
                        SectionHeader(title: "Metodología")
                        methodologyCard
                        SectionHeader(title: "Cuenta")
                        accountCard
                        SectionHeader(title: "Legal")
                        legalCard
                        signOutButton
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationBarHidden(true)
        }
        .sheet(item: $sheet) { kind in
            sheetView(for: kind)
                .preferredColorScheme(.dark)
        }
    }

    // MARK: - Identity

    private var identityCard: some View {
        let p = TodayPersona.demo
        return CardSurface(padding: 14) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 56, height: 56)
                    Text(p.initials)
                        .font(.system(size: 22, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Color.white)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(p.name)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("34 · Pro · 5y entrenando · 184cm / 78kg")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                    HStack(spacing: 6) {
                        Text("HYROX Pro Men")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(Theme.Color.foreground)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Theme.Color.accent.opacity(0.18))
                            .clipShape(Capsule())
                        Text("Coach · Pablo")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Theme.Color.surface)
                            .overlay(
                                Capsule().stroke(Theme.Color.muted.opacity(0.3), lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                }
                Spacer()
            }
        }
    }

    private var aEventCard: some View {
        let p = TodayPersona.demo
        return CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "A-Event", color: Theme.Color.accent, size: 9)
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text(p.raceName)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    Text("\(p.daysToRace) días")
                        .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accent)
                }
                Text("18 jun 2026 · Palau Sant Jordi · Bib #427")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
                Hairline()
                HStack {
                    MonoText(text: "Bloque \(p.block) W\(p.week)D\(p.day)", size: 10, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "Predicción 1:06:42", size: 10, color: Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - Devices

    private var devicesCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                deviceRow(
                    icon: "watch.analog",
                    title: "Garmin Fenix 7",
                    subtitle: "sync hace 3m",
                    statusText: "conectado",
                    statusColor: Theme.Color.ok
                ) { sheet = .editProfile }
                Hairline()
                deviceRow(
                    icon: "applewatch",
                    title: "Apple Watch 9",
                    subtitle: "HealthKit · workouts + HRV",
                    statusText: "ok",
                    statusColor: Theme.Color.ok
                ) { sheet = .editProfile }
                Hairline()
                NavigationLink {
                    PM5SettingsView(store: PM5ConnectionStore.shared)
                } label: {
                    deviceRowContent(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "Concept2 PM5",
                        subtitle: PM5ConnectionStore.shared.rememberedDeviceName ?? "Sin emparejar",
                        statusText: PM5ConnectionStore.shared.rememberedDeviceName == nil ? "—" : "pareado",
                        statusColor: PM5ConnectionStore.shared.rememberedDeviceName == nil ? Theme.Color.muted : Theme.Color.ok
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func deviceRow(
        icon: String,
        title: String,
        subtitle: String,
        statusText: String,
        statusColor: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: { Haptics.light(); action() }) {
            deviceRowContent(
                icon: icon,
                title: title,
                subtitle: subtitle,
                statusText: statusText,
                statusColor: statusColor
            )
        }
        .buttonStyle(.plain)
    }

    private func deviceRowContent(
        icon: String,
        title: String,
        subtitle: String,
        statusText: String,
        statusColor: Color
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accent)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Text(statusText)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(statusColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(statusColor.opacity(0.15))
                .clipShape(Capsule())
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    // MARK: - Methodology

    private var methodologyCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileRow(
                    icon: "rectangle.3.group",
                    title: "ATR · bloques",
                    subtitle: "REAL → TRANS → ACC · cómo se construye tu plan",
                    action: { sheet = .methodology }
                )
                Hairline()
                profileRow(
                    icon: "person.crop.rectangle",
                    title: "Tu coach: Pablo Casals",
                    subtitle: "Fabrik Studio · Barcelona · 12 años élite",
                    action: { sheet = .coach }
                )
            }
        }
    }

    // MARK: - Account

    private var accountCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                NavigationLink {
                    SubscriptionView(bearer: bearer)
                } label: {
                    profileRowContent(
                        icon: "creditcard",
                        title: "Suscripción · €89/mes",
                        subtitle: "Próxima factura 15/06/2026"
                    )
                }
                .buttonStyle(.plain)
                Hairline()
                profileRow(
                    icon: "person.fill",
                    title: "Modificar perfil",
                    subtitle: "Nombre, peso, talla, 1RMs, mejores tiempos",
                    action: { sheet = .editProfile }
                )
                Hairline()
                profileRow(
                    icon: "bell",
                    title: "Notificaciones",
                    subtitle: "Push · Check-in · Mensajes de Pablo",
                    action: { sheet = .notifications }
                )
            }
        }
    }

    // MARK: - Legal

    private var legalCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileRow(
                    icon: "lock.shield",
                    title: "Privacidad",
                    subtitle: "fahybrid.com/privacy",
                    action: { sheet = .privacy }
                )
                Hairline()
                profileRow(
                    icon: "doc.text",
                    title: "Términos",
                    subtitle: "fahybrid.com/terms",
                    action: { sheet = .terms }
                )
            }
        }
    }

    private func profileRow(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); action() }) {
            profileRowContent(icon: icon, title: title, subtitle: subtitle)
        }
        .buttonStyle(.plain)
    }

    private func profileRowContent(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accent)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    // MARK: - Sign out

    private var signOutButton: some View {
        Button(action: { Haptics.medium(); onSignOut() }) {
            Text("Cerrar sesión")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.danger)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.danger.opacity(0.4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Sheets

    @ViewBuilder
    private func sheetView(for kind: SheetKind) -> some View {
        switch kind {
        case .methodology: MethodologySheet()
        case .coach:       CoachSheet()
        case .editProfile: EditProfileSheet()
        case .notifications: NotificationsSheet()
        case .privacy:     LegalSheet(title: "Política de privacidad", bodyText: LegalCopy.privacy)
        case .terms:       LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms)
        }
    }
}

// MARK: - Section header

private struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.6)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 4)
            .padding(.top, 4)
    }
}

// MARK: - Sheet content

private struct MethodologySheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ATR · cómo se construye tu plan")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu macrociclo se divide en tres bloques: REAL (resistencia), TRANS (transición) y ACC (aceleración / específico).")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.foreground)
                    blockCard(
                        code: "REAL",
                        name: "Resistencia base",
                        weeks: "4-6 semanas",
                        focus: "Aerobic capacity · Z2 mileage · fuerza máxima general · técnica HYROX baja intensidad."
                    )
                    blockCard(
                        code: "TRANS",
                        name: "Transición",
                        weeks: "2-3 semanas",
                        focus: "Threshold · Z3-Z4 polarizado · trabajo específico estaciones · introducción potencia."
                    )
                    blockCard(
                        code: "ACC",
                        name: "Aceleración",
                        weeks: "3-4 semanas",
                        focus: "VO2 + race pace · simulacros · taper · consolidación de PRs · pico el día A-event."
                    )
                    Text("Cada bloque tiene microciclos 7d con día clave + complementarios + descarga. CTL/ATL/TSB se monitorean diariamente. Tu posición actual: REAL · W2D4 · 42 días al A-event.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(20)
            }
        }
    }

    private func blockCard(code: String, name: String, weeks: String, focus: String) -> some View {
        CardSurface(padding: 14, topAccent: code == "REAL") {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(code)
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.6)
                        .foregroundStyle(Theme.Color.accent)
                    Spacer()
                    Text(weeks)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(focus)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

private struct CoachSheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(Theme.Color.surface).frame(width: 64, height: 64)
                            Text("PC")
                                .font(.system(size: 20, weight: .heavy, design: .default).italic())
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Pablo Casals")
                                .font(Theme.Typography.headlineS)
                                .foregroundStyle(Theme.Color.foreground)
                            Text("Coach · Fabrik Studio Barcelona")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    bullet("12 años entrenando atletas élite de HYROX y CrossFit.")
                    bullet("Top 50 HYROX World Championships 2023, 2024.")
                    bullet("Especialidad: polarización + ATR + análisis fisiológico continuo.")
                    bullet("Atletas actuales en cohorte Fabrik: 23 (3 Pro Men, 5 Pro Women).")
                    Hairline()
                    Text("Pablo escribe la metodología detrás de tu plan. Cada workout que ves se basa en una plantilla validada por él, ajustada a tu CTL/ATL/TSB y a tus weaknesses por estación.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(20)
            }
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("·")
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.accent)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}

private struct EditProfileSheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Modificar perfil")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Edita los campos que tu coach usa para ajustar tu plan. Conectado al dashboard de Pablo en tiempo real.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                    fieldRow(label: "Nombre", value: "Marc Vidal")
                    fieldRow(label: "Edad", value: "34")
                    fieldRow(label: "Talla / peso", value: "184 cm / 78 kg")
                    fieldRow(label: "HRmax estimado", value: "188 bpm · sprint test 14 abr")
                    fieldRow(label: "FTP run", value: "3:48 /km")
                    Hairline()
                    Text("1RM · fuerza")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.muted)
                    fieldRow(label: "Back squat", value: "165 kg")
                    fieldRow(label: "Deadlift", value: "180 kg")
                    fieldRow(label: "Bench", value: "115 kg")
                    fieldRow(label: "Strict press", value: "72 kg")
                    Hairline()
                    Text("HYROX best · estación")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.muted)
                    fieldRow(label: "SkiErg 1000m", value: "4:08")
                    fieldRow(label: "Sled Push 50m", value: "0:52")
                    fieldRow(label: "Wall Balls 100", value: "3:55")
                }
                .padding(20)
            }
        }
    }

    private func fieldRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(.vertical, 8)
    }
}

private struct NotificationsSheet: View {
    @State private var checkin = true
    @State private var coach = true
    @State private var summary = false
    @State private var quietHours = true

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Notificaciones")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    toggleRow(title: "Check-in matinal", subtitle: "07:30 · si no lo has hecho", binding: $checkin)
                    toggleRow(title: "Mensajes de Pablo", subtitle: "Coach · alta prioridad", binding: $coach)
                    toggleRow(title: "Resumen post-workout", subtitle: "RPE + zonas + recuperación", binding: $summary)
                    toggleRow(title: "Modo silencio · 22:00–07:00", subtitle: "Excepto coach urgente", binding: $quietHours)
                }
                .padding(20)
            }
        }
    }

    private func toggleRow(title: String, subtitle: String, binding: Binding<Bool>) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Toggle("", isOn: binding)
                .labelsHidden()
                .tint(Theme.Color.accent)
        }
        .padding(12)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct LegalSheet: View {
    let title: String
    let bodyText: String

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(title)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(bodyText)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(20)
            }
        }
    }
}

private enum LegalCopy {
    static let privacy = "FAHYBRID procesa datos biométricos (HR, HRV, sueño, peso) para construir tu plan. No los compartimos con terceros sin tu consentimiento explícito.\n\nLa versión completa está disponible en fahybrid.com/privacy. Si tienes dudas, escribe a privacy@fahybrid.com."
    static let terms = "El uso de FAHYBRID implica aceptar nuestros términos de servicio: la metodología es propiedad de Pablo Casals y Fabrik Studio. Tu suscripción se renueva mensualmente y puedes cancelarla desde la sección Suscripción.\n\nLa versión completa está disponible en fahybrid.com/terms."
}
