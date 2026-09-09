import SwiftUI

// FH-102 — Real week rail for athlete programming (free + coached-adjacent surfaces).
// Mon–Sun strip from planWeek; move/edit/delete self-origin sessions.

struct SemanaAtletaOperativa: View {
    let bearer: String?
    @Environment(AppDataStore.self) private var store

    @Binding var selectedIso: String?
    var onOpenSession: (AthleteWeekDaySession) -> Void
    var onEditFree: (String) -> Void
    var onMutated: () -> Void

    @State private var deleteTarget: AthleteWeekDaySession? = nil
    @State private var moveTarget: AthleteWeekDaySession? = nil
    @State private var errorMessage: String? = nil

    private var planWeek: AthletePlanWeekResponse? { store.planWeek.value }

    var body: some View {
        Group {
            if let week = planWeek?.week {
                weekContent(week)
            } else if store.planWeek.hasLoaded || store.planWeek.loadFailed {
                emptyWeek
            }
        }
        .confirmationDialog(
            "¿Borrar este entreno libre?",
            isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }),
            titleVisibility: .visible,
            presenting: deleteTarget
        ) { session in
            Button("Borrar del todo", role: .destructive) {
                Task { await confirmDelete(session) }
            }
            Button("Cancelar", role: .cancel) { deleteTarget = nil }
        } message: { _ in
            Text("Lo creaste tú: se borra el entreno y lo registrado.")
        }
        .confirmationDialog(
            "Mover a otro día",
            isPresented: Binding(get: { moveTarget != nil }, set: { if !$0 { moveTarget = nil } }),
            titleVisibility: .visible,
            presenting: moveTarget
        ) { session in
            ForEach(moveDestinations(for: session), id: \.iso) { day in
                Button(day.label) {
                    Task { await performMove(session, to: day.iso) }
                }
            }
            Button("Cancelar", role: .cancel) { moveTarget = nil }
        }
        .alert("No se pudo completar", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var emptyWeek: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "Tu semana")
                Text("Aún nada esta semana. Tu primera sesión la construyes tú.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    @ViewBuilder
    private func weekContent(_ week: AthleteWeekPayload) -> some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    LabelText(text: "Tu semana")
                    Spacer(minLength: 8)
                    Text("toca un día")
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .accessibilityHidden(true)
                }
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(week.days) { day in
                        dayColumn(day, week: week)
                    }
                }
                if let day = selectedDay(in: week) {
                    Hairline()
                    dayPanel(day, week: week)
                }
                if let summary = weekSummaryLine {
                    Text(summary)
                        .scaledFont(11, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .animation(.easeOut(duration: 0.18), value: selectedIso)
    }

    private func selectedDay(in week: AthleteWeekPayload) -> AthleteWeekDay? {
        let iso = selectedIso ?? week.todayIso
        return week.days.first { $0.isoDate == iso }
    }

    private func dayColumn(_ day: AthleteWeekDay, week: AthleteWeekPayload) -> some View {
        let isToday = day.isoDate == week.todayIso
        let isSelected = day.isoDate == (selectedIso ?? week.todayIso)
        let load = dayLoad(day)
        return Button {
            Haptics.light()
            selectedIso = day.isoDate
        } label: {
            VStack(spacing: 4) {
                Text(dayLetter(forIso: day.isoDate))
                    .scaledFont(10, weight: isToday ? .heavy : .semibold, relativeTo: .caption2)
                    .foregroundStyle(isToday ? Theme.Color.accentText : Theme.Color.faint)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(barColor(load))
                    .frame(height: barHeight(load))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 3)
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .stroke(Theme.Color.accentText, lineWidth: 1.5)
                        .padding(.horizontal, -3)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
    }

    @ViewBuilder
    private func dayPanel(_ day: AthleteWeekDay, week: AthleteWeekPayload) -> some View {
        let list = realSessions(of: day)
        let isToday = day.isoDate == week.todayIso
        let isFuture = day.isoDate > week.todayIso
        VStack(alignment: .leading, spacing: 8) {
            LabelText(
                text: "\(isToday ? "Hoy" : dayLongLabel(forIso: day.isoDate)) · \(isFuture ? "lo que tienes" : "lo que hiciste")",
                color: Theme.Color.faint,
                size: 10
            )
            if list.isEmpty {
                Text(isToday ? "Aún no has entrenado hoy." : (isFuture ? "Nada programado ese día." : "Ese día no entrenaste."))
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            } else {
                VStack(spacing: 7) {
                    ForEach(list) { session in
                        sessionRow(session)
                        if session.id != list.last?.id { Hairline().opacity(0.5) }
                    }
                }
            }
        }
    }

    private func sessionRow(_ session: AthleteWeekDaySession) -> some View {
        let state = SessionMarkState.of(status: session.status, assignmentId: session.assignmentId)
        return Button {
            Haptics.light()
            onOpenSession(session)
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                Circle()
                    .fill(Theme.Modality.color(session.modality))
                    .frame(width: 7, height: 7)
                Text(session.title)
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                stateGlyph(state)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .contextMenu {
            if session.isSelfOrigin, state != .done {
                Button { onEditFree(session.assignmentId) } label: {
                    Label("Editar entreno libre", systemImage: "pencil")
                }
                Button { moveTarget = session } label: {
                    Label("Mover a otro día", systemImage: "calendar")
                }
            }
            if session.isSelfOrigin {
                Button(role: .destructive) { deleteTarget = session } label: {
                    Label("Borrar entreno libre", systemImage: "trash")
                }
            }
        }
    }

    private struct MoveDay: Identifiable {
        let iso: String
        let label: String
        var id: String { iso }
    }

    private func moveDestinations(for session: AthleteWeekDaySession) -> [MoveDay] {
        guard let week = planWeek?.week else { return [] }
        let origin = week.days.first { $0.sessions.contains { $0.assignmentId == session.assignmentId } }
        return week.days
            .filter { $0.isoDate != origin?.isoDate }
            .map { day in
                let n = realSessions(of: day).count
                let carga = n == 0 ? "libre" : (n == 1 ? "1 sesión" : "\(n) sesiones")
                let nombre = day.isoDate == week.todayIso ? "Hoy" : dayLongLabel(forIso: day.isoDate)
                return MoveDay(iso: day.isoDate, label: "\(nombre) · \(carga)")
            }
    }

    @MainActor
    private func performMove(_ session: AthleteWeekDaySession, to iso: String) async {
        moveTarget = nil
        guard let token = bearer, let id = Int(session.assignmentId) else {
            errorMessage = "No se pudo mover la sesión."
            return
        }
        do {
            _ = try await PlanService.moveSession(assignmentId: id, toDate: iso, bearer: token)
            Haptics.success()
            onMutated()
        } catch {
            Haptics.error()
            errorMessage = "No se pudo mover la sesión. Inténtalo de nuevo."
        }
    }

    @MainActor
    private func confirmDelete(_ session: AthleteWeekDaySession) async {
        deleteTarget = nil
        guard let token = bearer else { return }
        do {
            try await FreeSessionDelete.perform(assignmentId: session.assignmentId, bearer: token)
            Haptics.medium()
            onMutated()
        } catch {
            Haptics.error()
            errorMessage = "No se pudo borrar el entreno."
        }
    }

    private func realSessions(of day: AthleteWeekDay) -> [AthleteWeekDaySession] {
        day.sessions.filter { !$0.assignmentId.isEmpty }
    }

    private enum DayLoad { case done, pending, none }

    private func dayLoad(_ day: AthleteWeekDay) -> DayLoad {
        let real = realSessions(of: day)
        guard !real.isEmpty else { return .none }
        let anyDone = real.contains { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
        return anyDone ? .done : .pending
    }

    private var weekSummaryLine: String? {
        let done = (planWeek?.week.days ?? [])
            .flatMap(\.sessions)
            .filter { !$0.assignmentId.isEmpty }
            .filter { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
        guard !done.isEmpty else { return nil }
        var parts = ["\(done.count) \(done.count == 1 ? "sesión" : "sesiones")"]
        if let linea = VolumenPrevisto.lee(done.map(\.estDurationMinutes)).linea {
            parts.append(linea)
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func stateGlyph(_ state: SessionMarkState) -> some View {
        switch state {
        case .done:
            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Color.ok)
        case .partial:
            Image(systemName: "circle.lefthalf.filled").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Color.warning)
        case .missed:
            Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Color.danger)
        case .pending:
            EmptyView()
        }
    }

    private func dayLetter(forIso iso: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: iso) else { return "·" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEEE"
        return out.string(from: date).uppercased()
    }

    private func dayLongLabel(forIso iso: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: iso) else { return "Ese día" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE d"
        let raw = out.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    private func barColor(_ load: DayLoad) -> Color {
        switch load {
        case .done:    return Theme.Color.accent
        case .pending: return Theme.Color.accent.opacity(0.35)
        case .none:    return Theme.Color.surfaceSunken
        }
    }

    private func barHeight(_ load: DayLoad) -> CGFloat {
        switch load {
        case .done:    return 34
        case .pending: return 22
        case .none:    return 8
        }
    }
}
