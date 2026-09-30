import SwiftUI

// «MI SUSCRIPCIÓN» (Perfil → Mi suscripción).
//
// CUMPLIMIENTO (Apple, Guideline 3.1.3(b) «Multiplatform Services»): el atleta paga en la WEB (Stripe
// Checkout, alojado) antes de instalar la app. Esta pantalla no enseña precios ni empieza ningún cobro, jamás.
//
// Pausar y darse de baja SÍ viven en la app, nativos, contra nuestra propia API (#13). No es un paso fuera de la
// regla sino hacia ella: gestionar una suscripción que ya existe es justo lo que contempla la 3.1.3(b), y evita
// mandar al atleta al portal de Stripe para lo único que venía a hacer. El portal se queda para facturas y
// método de pago, como una fila discreta.
//
// REGLA DURA, sin cambios: cero superficie de compra dentro de la app — ni precios, ni «Suscríbete», ni
// «Comprar», ni «Mejorar plan».
//
// EL PLAN ES EL SUJETO: un bloque con el tono de su momento (en marcha, en pausa, baja programada, pago
// pendiente) y, si hay una sola cosa que hacer ya («Volver ya», «Cancelar la baja»), esa es su acción. Debajo,
// lo que dice el estado, la pausa disponible y las salidas de menos peso. El ciclo de vida manda sobre el estado
// crudo de Stripe cuando no coinciden: una pausa sigue «activa» en Stripe (el cobro se anula, no se cancela) y
// enseñar «Activa» contradiría las dos líneas de debajo.

/// Lo que dice el sujeto de la suscripción: la palabra de estado y el tono del bloque. Puro, para probarlo.
enum EstadoDeSuscripcion {
    static func resumen(info: SubscriptionInfo, lifecycle: LifecycleState?) -> (texto: String, tono: TonoDia) {
        if let lifecycle {
            if lifecycle.isPaused { return ("En pausa", .aviso) }
            if lifecycle.hasScheduledBaja { return ("Baja programada", .aviso) }
        }
        guard let raw = info.status else { return ("Sin suscripción", .neutro) }
        switch raw {
        case "active": return ("Activa", .ok)
        case "trialing": return ("Prueba", .ok)
        case "past_due", "unpaid", "incomplete": return ("Pago pendiente", .aviso)
        case "canceled", "incomplete_expired": return ("Cancelada", .neutro)
        case "paused": return ("Pausada", .neutro)
        default: return (raw, .neutro)
        }
    }
}

struct SubscriptionView: View {
    let bearer: String?

    @State private var info: SubscriptionInfo? = nil
    @State private var lifecycle: LifecycleState? = nil
    @State private var loading: Bool = true
    @State private var error: String? = nil
    @State private var actionInFlight: Bool = false
    @State private var safari: SafariURL? = nil
    @State private var sheet: LifecycleSheetKind? = nil

    private enum LifecycleSheetKind: String, Identifiable {
        case pause, baja
        var id: String { rawValue }
    }

    var body: some View {
        SubscriptionCuerpo(
            info: info, lifecycle: lifecycle, cargando: loading, error: error, enCurso: actionInFlight,
            alPausar: { sheet = .pause },
            alDarseDeBaja: { sheet = .baja },
            alVolver: { Task { await resume() } },
            alCancelarBaja: { Task { await undoBaja() } },
            alGestionarPago: { Task { await openPortal() } },
            alReintentar: { Task { await load() } }
        )
        .sheet(item: $safari) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .sheet(item: $sheet) { kind in
            lifecycleSheet(kind)
        }
        .task { await load() }
    }

    @ViewBuilder
    private func lifecycleSheet(_ kind: LifecycleSheetKind) -> some View {
        if let lifecycle {
            switch kind {
            case .pause:
                PauseSheet(
                    state: lifecycle,
                    bearer: bearer,
                    onDone: { sheet = nil; Task { await load() } },
                    onSwitchToBaja: { sheet = .baja }
                )
            case .baja:
                BajaSheet(
                    state: lifecycle,
                    bearer: bearer,
                    onDone: { sheet = nil; Task { await load() } },
                    onSwitchToPause: { sheet = .pause }
                )
            }
        }
    }

    // MARK: - Loading + actions

    @MainActor
    private func load() async {
        loading = true
        error = nil
        do {
            info = try await SubscriptionService.fetchSubscription(bearer: bearer)
        } catch {
            self.error = "No pudimos cargar la suscripción."
        }
        // The lifecycle is ADDITIVE: if it fails, the screen still renders the plan.
        lifecycle = try? await LifecycleService.fetchState(bearer: bearer)
        loading = false
    }

    @MainActor
    private func resume() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            try await LifecycleService.resume(bearer: bearer)
            await load()
        } catch {
            self.error = "No pudimos reanudar tu plan. Reintenta en unos segundos."
        }
    }

    @MainActor
    private func undoBaja() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            try await LifecycleService.cancelBaja(bearer: bearer)
            await load()
        } catch {
            self.error = "No pudimos cancelar tu baja. Reintenta en unos segundos."
        }
    }

    @MainActor
    private func openPortal() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            let url = try await SubscriptionService.openManagePortal(bearer: bearer)
            safari = SafariURL(url: url)
        } catch APIError.http(404, _) {
            // No Stripe customer yet — fall back to the account web.
            safari = SafariURL(url: SubscriptionService.accountWebURL)
        } catch {
            self.error = "No pudimos abrir la gestión. Reintenta en unos segundos."
        }
    }
}

// MARK: - El cuerpo

/// Lo que se pinta de «Mi suscripción» con el estado ya resuelto (sin servicios ni hojas).
struct SubscriptionCuerpo: View {
    let info: SubscriptionInfo?
    let lifecycle: LifecycleState?
    var cargando = false
    var error: String?
    var enCurso = false
    var alPausar: () -> Void = {}
    var alDarseDeBaja: () -> Void = {}
    var alVolver: () -> Void = {}
    var alCancelarBaja: () -> Void = {}
    var alGestionarPago: () -> Void = {}
    var alReintentar: () -> Void = {}

    var body: some View {
        if cargando && info == nil {
            PantallaPerfil(titulo: "Mi suscripción") { EsqueletoDeSuscripcion() }
        } else if let info {
            PantallaPerfil(titulo: "Mi suscripción") {
                sujeto(info)
                estado(info)
                if info.isActiveAccess { resto }
                if let error { AvisoEnLineaPerfil(tono: .peligro, texto: error) }
            }
        } else {
            PantallaPerfil(titulo: "Mi suscripción", alto: .llena) {
                ErrorDePantallaPerfil(
                    kicker: "Plan", titulo: error ?? "No pudimos cargar la suscripción", alReintentar: alReintentar
                )
            }
        }
    }

    // MARK: El sujeto: el plan

    /// La acción única de un momento que tiene UNA: volver de una pausa, cancelar una baja.
    private var accionDelMomento: (titulo: String, hace: () -> Void)? {
        guard let lifecycle, info?.isActiveAccess == true else { return nil }
        if lifecycle.isPaused { return ("Volver ya", alVolver) }
        if lifecycle.hasScheduledBaja { return ("Cancelar la baja, sigo", alCancelarBaja) }
        return nil
    }

    @ViewBuilder
    private func sujeto(_ info: SubscriptionInfo) -> some View {
        let resumen = EstadoDeSuscripcion.resumen(info: info, lifecycle: lifecycle)
        SujetoDia(tono: resumen.tono, etiqueta: "\(info.displayPlanLabel). \(resumen.texto)") {
            KickerDia("Plan") { InfoPill(text: resumen.texto, estilo: .velo) }
            TituloDia(info.displayPlanLabel)
            if let frase = frase(info) { ApoyoDia(frase) }
        } abajo: {
            if let accion = accionDelMomento {
                Button(action: accion.hace) { AccionDia(accion.titulo, enCurso: enCurso) }
                    .buttonStyle(PressScaleStyle(escala: 0.96))
                    .disabled(enCurso)
            }
        }
    }

    /// La frase que sostiene al título: lo que va a pasar, dicho en claro.
    private func frase(_ info: SubscriptionInfo) -> String? {
        guard let lifecycle, info.isActiveAccess else {
            return info.isActiveAccess ? nil : "Tu plan se gestiona desde la web de \(Marca.nombre). Cuando esté activo, aquí verás tu acceso completo."
        }
        if lifecycle.isPaused, let vuelve = LifecycleDate.long(lifecycle.pause.returnsOn) {
            return "Vuelves solo el \(vuelve). Ese día tendrás tu semana publicada."
        }
        if lifecycle.hasScheduledBaja, let dia = LifecycleDate.long(lifecycle.baja.scheduledFor) {
            return "Hasta el \(dia) todo sigue igual: tienes plan, chat y tu entrenador. Puedes cancelar la baja cuando quieras."
        }
        return nil
    }

    // MARK: Lo que dice el estado

    @ViewBuilder
    private func estado(_ info: SubscriptionInfo) -> some View {
        if info.isActiveAccess {
            if let lifecycle, lifecycle.isPaused {
                GrupoPerfil {
                    FilaValorPerfil(etiqueta: "Cobro", valor: "Parado · no se te cobra")
                    FilaValorPerfil(etiqueta: "Tu plaza", valor: "Reservada")
                }
            } else if let lifecycle, let dia = LifecycleDate.long(lifecycle.baja.scheduledFor) {
                GrupoPerfil {
                    FilaValorPerfil(etiqueta: "Entrenas hasta", valor: dia)
                    FilaValorPerfil(etiqueta: "Próximo cobro", valor: "Ninguno")
                }
            } else if let date = info.formattedPeriodEnd {
                GrupoPerfil {
                    FilaValorPerfil(etiqueta: info.cancelAtPeriodEnd ? "Acceso hasta" : "Próximo cobro", valor: date)
                }
            }
        }
    }

    // MARK: Pausa disponible y salidas

    /// La pausa, la gestión de pago y la baja: lo que está al alcance de quien está dentro. Con el ciclo de vida
    /// ilegible (sin red, backend antiguo) nunca se esconde el portal.
    @ViewBuilder
    private var resto: some View {
        if let lifecycle {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Pausa disponible")
                GrupoPerfil {
                    FilaValorPerfil(
                        etiqueta: "Te quedan",
                        valor: "\(lifecycle.pause.availableDays) días de \(lifecycle.pause.budgetDays)"
                    )
                }
                NotaPerfil(presupuesto(lifecycle))
            }
            if !lifecycle.isPaused && !lifecycle.hasScheduledBaja {
                GrupoPerfil {
                    Button(action: alPausar) { FilaPerfil(titulo: "Pausar mi plan") }
                        .filaTocablePerfil()
                        .disabled(enCurso)
                }
            }
        }
        // Gestionar una suscripción que YA existe (facturas, método de pago) en la propia UI de Stripe: ya no es
        // la salida, es el papeleo.
        GrupoPerfil {
            Button(action: alGestionarPago) { FilaPerfil(titulo: "Gestionar pago · facturas") }
                .filaTocablePerfil()
                .disabled(enCurso)
        }
        if let lifecycle, !lifecycle.isPaused, !lifecycle.hasScheduledBaja {
            AccionTextoPerfil(titulo: "Darme de baja", peligro: true, accion: alDarseDeBaja)
        }
    }

    private func presupuesto(_ lifecycle: LifecycleState) -> String {
        if let renews = LifecycleDate.long(lifecycle.pause.renewsOn) {
            return "Se te renuevan el \(renews)"
        }
        return "Se renuevan cada doce meses"
    }
}

/// El esqueleto: el sujeto y, debajo, dos filas.
private struct EsqueletoDeSuscripcion: View {
    var body: some View {
        VStack(alignment: .leading, spacing: PantallaPerfil<EmptyView, EmptyView>.entreBloques) {
            SujetoDia(tono: .neutro, etiqueta: "Cargando tu suscripción") {
                SkeletonBar(width: 96, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(height: 44, radius: 10).frame(maxWidth: 230)
                SkeletonBar(height: 17, radius: 6).frame(maxWidth: 300)
            }
            EsqueletoDeFilasPerfil(filas: 2, conFicha: false)
        }
    }
}
