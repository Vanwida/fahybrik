import SwiftUI

// #34 — the athlete's calibration battery card: "Tus tests · X / N" where N is
// what the COACH programmed (never a fixed 4), plus each test's state
// (pendiente → hazlo · resultado pendiente → nudge para añadir el número ·
// hecho ✓). It NEVER shows a broken "0/0": with nothing scheduled it renders an
// invitation with the counter painted in zero and no invented denominator.
//
// Tests guiados: the card SUMMARIZES and NAVIGATES — one tap anywhere opens the
// Tests hub (TestsHubView), where every action lives («Probarme», «Continuar»,
// «Añadir resultado», curvas, zonas). The rows here are read-only state.

/// «3/4» — cuántos tests has calibrado. UN solo sitio: el hub y la tarjeta de
/// Inicio lo escribían por separado, con la misma anatomía y dos tipografías
/// distintas para el denominador.
///
/// Se pinta TAMBIÉN en cero (contrato §6.2 bis): un contador en cero es
/// información, y es justo cuando más falta hace explicarlo. `total` es nil
/// cuando el coach todavía no ha publicado batería — entonces no hay
/// denominador que inventar (§7) y se enseña sólo lo que se sabe.
struct CalibrationCounter: View {
    let done: Int
    /// Nil = aún no hay batería publicada, así que no hay «de cuántos».
    let total: Int?
    /// El contador como SUJETO de la pantalla (estado vacío del hub), no como
    /// dato de la esquina de una tarjeta.
    var hero: Bool = false
    /// Qué cuenta, cuando no hay denominador que lo diga. Un «0» suelto a 48 pt
    /// es un glifo, no una cifra: sin el «de cuántos» hace falta la palabra para
    /// que se lea como el contador que es.
    var unidad: String? = nil

    private var complete: Bool { total.map { done >= $0 && $0 > 0 } ?? false }

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs) {
            Text("\(done)")
                .font(hero ? Theme.Typography.readoutL : Theme.Typography.readoutM)
                .foregroundStyle(complete ? Theme.Color.ok : Theme.Color.foreground)
            if let total {
                Text("/\(total)")
                    .font(hero ? Theme.Typography.readoutM : Theme.Typography.readoutS)
                    .foregroundStyle(Theme.Color.muted)
            } else if let unidad {
                Text(unidad)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.muted)
                    // Una cifra y una palabra respiran más que una cifra y su
                    // denominador, que van pegados a propósito.
                    .padding(.leading, Theme.Spacing.xs)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            total.map { "\(done) de \($0) tests con resultado" } ?? "\(done) tests calibrados"
        )
    }
}

struct TestBatteryCard: View {
    let status: BatteryStatus
    /// Open the Tests hub — the single action of the whole card.
    var onOpen: () -> Void = {}

    // Las DOS caras abren el hub: con batería para verla, y sin ella porque es
    // donde vive la salida del atleta nuevo (§6.2 bis — un hueco que se puede
    // llenar con un acto concreto se declara, y se declara con su acto).
    var body: some View {
        Button {
            Haptics.light()
            onOpen()
        } label: {
            if status.isScheduled { scheduledCard } else { notScheduledCard }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityHint(status.isScheduled
                           ? "Abre tus tests y benchmarks"
                           : "Abre tus tests para probarte por tu cuenta")
    }

    // MARK: Active battery

    private var scheduledCard: some View {
        CardSurface(padding: Theme.Spacing.l, topAccent: status.isComplete) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .firstTextBaseline) {
                    LabelText(text: "Tus tests · Calibración", color: Theme.Color.accentText)
                    Spacer(minLength: Theme.Spacing.s)
                    CalibrationCounter(done: status.completed, total: status.total)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.leading, Theme.Spacing.xs)
                }

                Text(stakeSubtitle)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 0) {
                    ForEach(Array(status.tests.enumerated()), id: \.element.id) { idx, test in
                        if idx > 0 { Hairline() }
                        rowContent(test)
                    }
                }
                .padding(.top, Theme.Spacing.xs)
            }
        }
    }

    private var stakeSubtitle: String {
        if status.isComplete {
            return "Batería completa. Tu plan está calibrado con tus números reales."
        }
        if status.firstPendingResult != nil {
            return "Añade el resultado que falta para calibrar tu plan."
        }
        return "Fijan tus zonas, tu 1RM y tu nivel. Hazlos frescos: marcan tus números."
    }

    private func rowContent(_ test: CalibrationTestStatus) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            stateGlyph(test.displayState)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(test.label)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Text(substatus(test))
                    .font(Theme.Typography.caption)
                    .foregroundStyle(substatusColor(test.displayState))
            }
            Spacer(minLength: Theme.Spacing.s)
            trailing(test)
        }
        .padding(.vertical, Theme.Spacing.m)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(test.label). \(substatus(test))")
    }

    @ViewBuilder
    private func stateGlyph(_ state: CalibrationTestStatus.DisplayState) -> some View {
        switch state {
        case .pending:
            Image(systemName: "stopwatch")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        case .resultPending:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
        }
    }

    private func substatus(_ test: CalibrationTestStatus) -> String {
        switch test.displayState {
        case .pending:       return dateLabel(test.scheduledFor)
        case .resultPending: return "Resultado pendiente"
        case .done:          return test.resultLabel ?? "Hecho"
        }
    }

    private func substatusColor(_ state: CalibrationTestStatus.DisplayState) -> Color {
        switch state {
        case .resultPending: return Theme.Color.warning
        case .done:          return Theme.Color.ok
        case .pending:       return Theme.Color.muted
        }
    }

    @ViewBuilder
    private func trailing(_ test: CalibrationTestStatus) -> some View {
        switch test.displayState {
        case .pending:
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        case .resultPending:
            Text("Añadir")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(Theme.Color.accentText)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.Color.accent.opacity(0.14))
                .clipShape(Capsule())
        case .done:
            EmptyView()
        }
    }

    // MARK: Sin batería publicada — una invitación, no un hueco gris
    //
    // Antes esto no llegaba a pintarse nunca: la sección de Inicio se escondía
    // entera cuando `total == 0`, así que el atleta recién dado de alta no veía
    // ni rastro de sus tests y no podía saber si la app estaba rota. Ahora se
    // declara, con el contador en cero y sin denominador inventado, y el toque
    // lleva al hub — que es donde vive el acto («Pruébate por tu cuenta»).

    private var notScheduledCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                CalibrationCounter(done: 0, total: nil)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    LabelText(text: "Tus tests · Calibración", color: Theme.Color.accentText)
                    Text("Aún no has calibrado nada")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Pruébate por tu cuenta mientras tu coach programa los tuyos.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
    }

    // "10 jul" from an ISO YYYY-MM-DD; the raw string if it can't parse (never
    // fabricated). Self-contained so the card carries its own tiny formatter.
    private func dateLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m) else { return iso }
        let months = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"]
        return "\(d) \(months[m - 1])"
    }
}

// MARK: - Self-loading Inicio section
//
// Loads the battery status for the athlete and renders the card once the state
// is KNOWN — with a battery or without one. The card is a SUMMARY: every action
// (run a test, capture a missing number, see the curves) lives in the Tests hub
// the tap opens.
//
// Antes se escondía cuando `total == 0`, y esa era la mitad silenciosa del peor
// caso mínimo: el atleta nuevo no veía sus tests en ninguna parte. El §6.2 bis
// decide esto — un hueco se declara cuando se puede llenar con un acto
// concreto, y desde el hub ya se puede.
//
// Lo que SÍ se calla es lo que no se sabe: si la petición falla no se pinta un
// «aún no has calibrado nada» que quizá sea mentira (§7).

struct TestBatteryInicioSection: View {
    let bearer: String?
    /// Bumped by Inicio (pull-to-refresh, a completed workout) to reload status.
    var reloadNonce: Int = 0
    /// Open the Tests hub — Inicio owns the cover.
    let onOpenHub: () -> Void

    @State private var status: BatteryStatus? = nil
    /// Nunca hemos conseguido leer el estado: mejor nada que una invitación que
    /// contradiga la batería que el atleta sí tiene.
    @State private var unknown = true

    var body: some View {
        Group {
            if let status, !unknown {
                TestBatteryCard(status: status, onOpen: onOpenHub)
            }
        }
        .task(id: reloadToken) { await load() }
    }

    // Reload whenever the bearer changes OR Inicio bumps the nonce.
    private var reloadToken: String { "\(bearer ?? "-")#\(reloadNonce)" }

    private func load() async {
        guard let bearer else { unknown = true; return }
        do {
            status = try await TestBatteryService.fetchStatus(bearer: bearer)
            unknown = false
        } catch {
            // Keep the last good status if we ever had one; otherwise stay quiet.
            if status == nil { unknown = true }
        }
    }
}
