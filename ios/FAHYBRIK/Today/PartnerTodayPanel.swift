import SwiftUI

// "Tu pareja" — el panel de Hoy para los atletas de Dobles. Enseña cómo va HOY la pareja que el coach
// les ha emparejado, con la instantánea de entreno de `GET /api/athlete/partner` (source ==
// "doubles_pair"). Cada valor es dato REAL del endpoint o un vacío honesto: nada inventado.
//
// FUERA DEL DISEÑO FIRMADO, CONSERVADO. «Hoy · El día» no lo dibujó porque el contrato del doble no
// traía el dato, no porque se decidiera quitarlo; por eso sigue, vestido con los tokens del kit (título
// de sección, tarjeta plana, papeles tipográficos de 15 pt o más) y SIN una tarjeta nueva de diseño. Va
// tras «Contigo».
//
// De arriba abajo:
//   título  — «Tu pareja», como «Contigo»
//   cabecera — avatar de la pareja (azul de Dobles) + nombre + «Hoy · mismo entreno» + el estado de hoy
//   semana  — «Semana N de M» con su regleta, SOLO si hay sesiones compartidas esta semana (un «0/0» no
//             es un dato: es un hueco)
//   recientes — hasta tres sesiones terminadas (fecha · nombre · resultado · tiempo)
//   nota     — una línea según haya entrenado hoy o no
//
// La visibilidad es de quien lo monta: solo se construye con un `doubles_pair` (`PartnerEnvelope.
// isDoublesPair`), así que sin pareja, con una de facturación, cargando o con error, no se pinta.

struct PartnerTodayPanel: View {
    let partner: PartnerInfo

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Tu pareja")
            VStack(alignment: .leading, spacing: 14) {
                header
                if let semana { semanaRow(semana) }
                if !recent.isEmpty {
                    Hairline()
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        ForEach(recent) { session in recentRow(session) }
                    }
                }
                nudgeRow
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaDia()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Cabecera

    private var header: some View {
        HStack(spacing: 12) {
            CoachAvatar(initials: partner.initials, size: 44, tint: Theme.Color.partner)
            VStack(alignment: .leading, spacing: 2) {
                Text(partner.fullName)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 8)
            if let badge = todayBadge { statusBadge(badge) }
        }
        .accessibilityElement(children: .combine)
    }

    /// El coach ha PAUSADO el plan de la pareja (`partner_paused`): «En pausa» en vez de un estado de hoy.
    private var partnerPaused: Bool { partner.partnerPaused == true }

    /// «En pausa» si está pausada; «Hoy · mismo entreno» si tiene sesión hoy; si no, la etiqueta honesta
    /// de Dobles (no se inventa un «mismo entreno»).
    private var subtitle: String {
        if partnerPaused { return "En pausa" }
        return partner.today != nil ? "Hoy · mismo entreno" : "Tu pareja de Dobles"
    }

    // MARK: - Estado de hoy

    private struct BadgeSpec { let text: String; let color: Color; let tint: Color }

    /// La pastilla del estado de la sesión de hoy. Una pareja en pausa enseña «En pausa» en gris en vez
    /// de hecha/pendiente. Nil → sin sesión hoy (sin pastilla).
    private var todayBadge: BadgeSpec? {
        if partnerPaused {
            return BadgeSpec(text: "En pausa", color: Theme.Color.muted, tint: Theme.Color.neutralTint)
        }
        guard let today = partner.today else { return nil }
        switch today.status.lowercased() {
        case "completed":
            return BadgeSpec(text: "Hecho", color: Theme.Color.ok, tint: Theme.Color.okTint)
        case "missed":
            return BadgeSpec(text: "Perdido", color: Theme.Color.danger, tint: Theme.Color.dangerTint)
        case "skipped":
            return BadgeSpec(text: "Saltado", color: Theme.Color.muted, tint: Theme.Color.neutralTint)
        default: // scheduled / unknown → todavía por hacer
            return BadgeSpec(text: "Pendiente", color: Theme.Color.warning, tint: Theme.Color.warningTint)
        }
    }

    private func statusBadge(_ spec: BadgeSpec) -> some View {
        Text(spec.text)
            .papel(.rotulo)
            .foregroundStyle(spec.color)
            .padding(.horizontal, Theme.Spacing.m)
            .frame(minHeight: 32)
            .background(spec.tint, in: Capsule())
            .accessibilityLabel("Hoy: \(spec.text)")
    }

    // MARK: - Semana

    /// La semana compartida, solo si tiene sesiones (`total > 0`): un contador `0/0` no es un dato.
    private var semana: PartnerWeekProgress? {
        guard let week = partner.week, week.total > 0 else { return nil }
        return week
    }

    private func semanaRow(_ week: PartnerWeekProgress) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Text("Semana").papel(.rotulo).foregroundStyle(Theme.Color.muted)
            RegletaDia(n: week.completed, de: week.total)
            Text("\(week.completed)/\(week.total)").papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Semana, \(week.completed) de \(week.total) sesiones hechas")
    }

    // MARK: - Sesiones recientes

    private var recent: [PartnerRecentSession] {
        Array((partner.recent ?? []).prefix(3))
    }

    private func recentRow(_ session: PartnerRecentSession) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle()
                .fill(recentStatusColor(session.status))
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: Theme.Spacing.s) {
                    Text(session.workoutName ?? "Sesión")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                    // «juntos»: una sesión que entrenasteis a la vez (0074).
                    if session.isJoint { InfoPill(text: "juntos", estilo: .acento) }
                }
                Text(recentMeta(session)).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(session.workoutName ?? "Sesión"), \(session.isJoint ? "entrenasteis juntos, " : "")\(dateLabel(session.date)), \(recentMeta(session))"
        )
    }

    private func recentStatusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "completed": return Theme.Color.ok
        case "missed": return Theme.Color.danger
        default: return Theme.Color.faint
        }
    }

    /// «26 jun · 48 min · RPE 7»: cada tramo solo si existe. La fecha siempre; la duración y el RPE solo si el
    /// servidor los trae (nunca inventados). El resultado va primero (en HYROX el tiempo ES el resultado).
    private func recentMeta(_ session: PartnerRecentSession) -> String {
        var parts: [String] = [dateLabel(session.date)]
        if let score = session.scoreText { parts.append(score) }
        if let secs = session.durationSeconds, secs > 0 { parts.append(durationLabel(secs)) }
        if let rpe = session.perceivedExertion { parts.append("\(Vocab.rpe) \(Formato.esDecimal(rpe))") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Nota

    private var nudgeRow: some View {
        let trained = partner.today?.isDone ?? false
        return Text(nudgeText(trained: trained))
            .papel(.notaFuerte)
            .foregroundStyle(trained ? Theme.Color.foreground : Theme.Color.muted)
    }

    private func nudgeText(trained: Bool) -> String {
        let name = partner.firstName
        if partnerPaused { return "\(name) está en pausa" }
        if partner.today == nil { return "\(name) no tiene sesión hoy" }
        return trained ? "\(name) ya ha entrenado hoy" : "\(name) aún no ha entrenado hoy"
    }

    // MARK: - Formato

    /// «26 jun» desde un ISO «YYYY-MM-DD»; el texto tal cual si no se lee.
    private func dateLabel(_ iso: String) -> String {
        FechaES.corta(iso) ?? iso
    }

    /// «48 min» a partir de un minuto; por debajo, «0:45».
    private func durationLabel(_ seconds: Int) -> String {
        seconds >= 60 ? "\(seconds / 60) min" : Formato.clock(seconds)
    }
}
