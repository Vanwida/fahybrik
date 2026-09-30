import SwiftUI

// LAS DOS SALIDAS: PAUSAR, O IRSE (#13).
//
// INTENCIÓN DE DISEÑO, para que nadie lo «mejore» después hasta convertirlo en un embudo de retención: no hay
// oferta de descuento, ni «¿seguro?» tres veces, ni copy que culpabilice. Lo único que dice cualquiera de las
// dos hojas es lo que el atleta aún no sabe: cuánta pausa le queda y que irse no pierde lo que ya pagó. Si la
// salida se hace pegajosa, el atleta deja de fiarse de la app también en la entrada.
//
// Las dos son hojas con el cascarón de Perfil (`PantallaPerfil`): el título con su papel, el contenido y UNA
// acción anclada abajo. Antes colgaban su botón destructivo del final del scroll, detrás de un selector y una nota.

// MARK: - Piezas compartidas

/// El selector de motivo: el conjunto cerrado de razones, a la vista. Los mismos cuatro códigos en todas partes (0104).
private struct SelectorDeMotivo: View {
    let titulo: String
    @Binding var motivo: PauseReason

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            SelectorDeOpcionesPerfil(
                opciones: PauseReason.allCases.map { (clave: $0, titulo: $0.label) },
                elegida: $motivo
            )
        }
    }
}

/// Cuánto del presupuesto de pausa está gastado y cuánto gastaría esta elección.
private struct MedidorDePausa: View {
    /// Días ya idos.
    let consumidos: Int
    /// Días que sumaría la elección actual. 0 cuando solo se informa.
    let pendientes: Int
    let total: Int

    /// El tramo que aún no es de verdad (lo que gastaría esta pausa) es el mismo acento, más suave.
    private static let suavidadDelPendiente: Double = 0.45

    var body: some View {
        GeometryReader { geo in
            let unidad = total > 0 ? geo.size.width / CGFloat(total) : 0
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Theme.Color.accent)
                    .frame(width: min(geo.size.width, unidad * CGFloat(consumidos)))
                Rectangle()
                    .fill(Theme.Color.tinte(Theme.Color.accent, Self.suavidadDelPendiente, sobre: Theme.Color.surfaceSunken))
                    .frame(width: min(max(0, geo.size.width - unidad * CGFloat(consumidos)), unidad * CGFloat(pendientes)))
                Spacer(minLength: 0)
            }
        }
        .frame(height: 10)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

/// El bloque que explica «qué pasa después»: una tarjeta tintada del acento del club (lo que te espera) o
/// neutra (un aviso sin apremio). El texto es la tinta del tema.
private struct BloqueDeNota<Contenido: View>: View {
    var realce = true
    @ViewBuilder let contenido: Contenido

    var body: some View {
        contenido
            .papel(.cuerpo)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.l)
            .tarjetaPerfil(realce: realce)
    }
}

/// Una línea con su viñeta: lo que conviene saber antes de decidir.
private struct Vineta: View {
    let texto: String

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Circle().fill(Theme.Color.accent).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(texto)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Pausa

struct PauseSheet: View {
    let state: LifecycleState
    let bearer: String?
    /// Called after a successful pause so the caller can reload.
    let onDone: () -> Void
    /// The athlete ran out of budget and chose to leave instead.
    let onSwitchToBaja: () -> Void

    @State private var reason: PauseReason = .vacaciones
    @State private var returnDate: Date = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    @State private var inFlight = false
    @State private var error: String?

    /// Days this pause costs: today through the day before returning, inclusive.
    private var cost: Int {
        let today = LifecycleDate.iso(Date())
        guard let gap = LifecycleDate.days(from: today, to: LifecycleDate.iso(returnDate)) else { return 0 }
        return max(0, gap)
    }

    private var exceedsBudget: Bool { cost > state.pause.availableDays }
    private var exhausted: Bool { state.pause.availableDays <= 0 }

    var body: some View {
        PantallaPerfil(titulo: "Pausar mi plan", cierre: .cerrar, cierreActivo: !inFlight) {
            if exhausted {
                exhaustedBody
            } else {
                pauseBody
            }
            if let error {
                AvisoEnLineaPerfil(tono: .peligro, texto: error)
            }
        } pie: {
            if exhausted {
                AccionTextoPerfil(titulo: "Darme de baja", peligro: true, accion: onSwitchToBaja)
            } else {
                AccionAncladaPerfil(
                    titulo: buttonTitle,
                    enCurso: inFlight,
                    habilitada: !exceedsBudget && cost > 0
                ) {
                    Task { await submit() }
                }
            }
        }
        .interactiveDismissDisabled(inFlight)
    }

    @ViewBuilder
    private var pauseBody: some View {
        SelectorDeMotivo(titulo: "Motivo", motivo: $reason)

        GrupoPerfil {
            DatePicker(
                selection: $returnDate,
                in: (Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())...,
                displayedComponents: .date
            ) {
                Text("Vuelvo el").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            }
            .datePickerStyle(.compact)
            .tint(Theme.Color.accentText)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.s)
            .frame(minHeight: Theme.Size.toque + Theme.Spacing.m)
        }

        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Vas a usar")
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                MedidorDePausa(consumidos: state.pause.consumedDays, pendientes: cost, total: state.pause.budgetDays)
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    if exceedsBudget {
                        Circle().fill(Theme.Color.danger).frame(width: 10, height: 10).accessibilityHidden(true)
                    }
                    Text("\(cost) de tus \(state.pause.availableDays) días disponibles")
                        .papel(exceedsBudget ? .notaFuerte : .nota)
                        .foregroundStyle(exceedsBudget ? Theme.Color.foreground : Theme.Color.muted)
                }
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaPerfil()
        }

        BloqueDeNota {
            if let vuelve = LifecycleDate.long(LifecycleDate.iso(returnDate)) {
                Text("No se te cobra mientras dure. Tu plaza queda reservada y el plan vuelve solo el \(vuelve).")
            } else {
                Text("No se te cobra mientras dure. Tu plaza queda reservada y el plan vuelve solo.")
            }
        }
    }

    private var buttonTitle: String {
        guard let vuelve = LifecycleDate.long(LifecycleDate.iso(returnDate)) else { return "Pausar" }
        return exceedsBudget ? "Te pasas de tus días" : "Pausar hasta el \(vuelve)"
    }

    // Budget spent. NOT a wall — a wall makes them cancel. Two honest ways out.
    @ViewBuilder
    private var exhaustedBody: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Pausa disponible")
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                MedidorDePausa(consumidos: state.pause.budgetDays, pendientes: 0, total: state.pause.budgetDays)
                Text("0 días · has usado tus \(state.pause.budgetDays)")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                if let renews = LifecycleDate.long(state.pause.renewsOn) {
                    Text("Se te renuevan el \(renews)").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaPerfil()
        }

        BloqueDeNota(realce: false) {
            Text("Ya has pausado \(state.pause.budgetDays) días en los últimos doce meses. Puedes seguir parado, pero el cobro no se para.")
        }

        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Vineta("Habla con tu entrenador para congelar el plan y no perder la plaza")
            Vineta("O date de baja y vuelve cuando quieras, si hay hueco")
        }
    }

    @MainActor
    private func submit() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        error = nil
        do {
            _ = try await LifecycleService.pause(
                reason: reason,
                returnDate: LifecycleDate.iso(returnDate),
                bearer: bearer
            )
            onDone()
        } catch {
            self.error = "No pudimos pausar tu plan. Reintenta en unos segundos."
        }
    }
}

// MARK: - Baja

struct BajaSheet: View {
    let state: LifecycleState
    let bearer: String?
    let onDone: () -> Void
    /// The athlete took the "mejor pausar" way out.
    let onSwitchToPause: () -> Void

    @State private var reason: PauseReason = .paron
    @State private var inFlight = false
    @State private var error: String?

    /// The last day already paid for. Nil when there is no live period.
    private var lastPaidDay: String? { state.billing.currentPeriodEnd }

    var body: some View {
        PantallaPerfil(titulo: "Darme de baja", cierre: .cerrar, cierreActivo: !inFlight) {
            SelectorDeMotivo(titulo: "¿Por qué te vas?", motivo: $reason)

            BloqueDeNota {
                if let dia = LifecycleDate.long(lastPaidDay) {
                    Text("Entrenas hasta el \(dia), el último día que tienes pagado. Ese día se cierra tu plaza y no se te vuelve a cobrar.")
                } else {
                    Text("Tu baja se aplica hoy. No tienes ningún periodo pagado por delante, así que no se te vuelve a cobrar.")
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                if let dia = LifecycleDate.long(lastPaidDay) {
                    Vineta("Puedes echarte atrás hasta el \(dia)")
                }
                Vineta("Tu historial, tus marcas y tus carreras se quedan")
                Vineta("Si quieres borrar tus datos, eso es aparte, en Cuenta")
            }

            if let error {
                AvisoEnLineaPerfil(tono: .peligro, texto: error)
            }
        } pie: {
            VStack(spacing: Theme.Spacing.xs) {
                // Destructiva: el peligro va en el TEXTO y en el borde de la acción, nunca en un fondo rojo.
                Button {
                    Haptics.medium()
                    Task { await submit() }
                } label: {
                    HStack(spacing: Theme.Spacing.s) {
                        if inFlight { ProgressView() }
                        Text(confirmTitle).papel(.accion).multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Theme.Color.danger)
                    .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
                    .padding(.horizontal, 22)
                    .overlay(Capsule().strokeBorder(Theme.Color.danger.opacity(0.6), lineWidth: 2))
                    .contentShape(Capsule())
                }
                .buttonStyle(PressScaleStyle(escala: 0.98))
                .disabled(inFlight)

                // Offered ONCE, quietly, and only when they actually have days left.
                if state.pause.availableDays >= 7 {
                    AccionTextoPerfil(titulo: "Mejor pausar \(state.availableWeeks) semanas", accion: onSwitchToPause)
                }
            }
        }
        .interactiveDismissDisabled(inFlight)
    }

    private var confirmTitle: String {
        guard let dia = LifecycleDate.long(lastPaidDay) else { return "Confirmar baja" }
        return "Confirmar baja el \(dia)"
    }

    @MainActor
    private func submit() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        error = nil
        do {
            _ = try await LifecycleService.scheduleBaja(reason: reason, bearer: bearer)
            onDone()
        } catch {
            self.error = "No pudimos tramitar tu baja. Reintenta en unos segundos."
        }
    }
}
