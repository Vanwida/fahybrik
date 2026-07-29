import SwiftUI

// "Registrar carrera" (#Marcas) — the Sunday 10K, without typing when possible.
//
// If they ran it with the watch, the activity is ALREADY synced — one tap uses the
// real GPS time. The manual fields stay for the race from before the app existed.
// Registered marks land in the same history as everything else, dated the day the
// race happened, and the coach hears about it through the same funnel.
struct RegisterRaceSheet: View {
    let mark: MarkView
    let bearer: String?
    /// The server's verdict on the saved mark (is_pr + previous best) — the host
    /// celebrates with it instead of inferring a record it can't know.
    let onSaved: (MarkWriteResult) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var candidates: [RegisterCandidate] = []
    @State private var date = Date()
    /// The race time, in seconds. Starts EMPTY, and nothing can be saved until the
    /// athlete types it: three wheels parked on 45 min meant whoever didn't touch
    /// them filed 45:00 as their 10K, and a wheel has no empty position to park on.
    /// `TimeHourMinSecRow` is the shared piece that does have one.
    @State private var manualSeconds: Int? = nil
    @State private var eventName = ""
    @State private var busy = false
    @State private var error: String? = nil

    private var manualTotal: Double? {
        manualSeconds.map(Double.init).flatMap { $0 > 0 ? $0 : nil }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        if !candidates.isEmpty {
                            fromWatch
                            Text("o a mano")
                                .font(Theme.Typography.caption)
                                .foregroundStyle(Theme.Color.faint)
                                .frame(maxWidth: .infinity)
                        }
                        manualForm
                        if let error {
                            Text(error)
                                .font(Theme.Typography.small)
                                .foregroundStyle(Theme.Color.danger)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.l)
                }
                .anchoredAction {
                    // Until the time is declared the button says what it needs, not a
                    // fabricated "0:00" — and it stays disabled.
                    PrimaryButton(
                        title: manualTotal.map { "Guardar \(mark.label) · \(Formato.clock($0))" }
                            ?? "Escribe tu tiempo",
                        enabled: !busy && manualTotal != nil
                    ) {
                        guard let total = manualTotal else { return }
                        Task { await save(value: total, day: date) }
                    }
                }
            }
            .navigationTitle("Registrar \(mark.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
        .compactSheet()
        .task { candidates = (try? await MarksService.fetchCandidates(slug: mark.slug, bearer: bearer)) ?? [] }
    }

    // MARK: - From the watch

    private var fromWatch: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "De tu reloj")
            ForEach(candidates) { candidate in
                CardSurface(padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Carrera · \(Formato.distanciaCubierta(candidate.distanceM) ?? "—")")
                                    .font(Theme.Typography.bodyEmph)
                                    .foregroundStyle(Theme.Color.foreground)
                                Text(candidateSubtitle(candidate))
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.faint)
                            }
                            Spacer()
                            Text(Formato.clock(Double(candidate.durationS)))
                                .font(.system(size: 16, weight: .bold, design: .monospaced))
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        // SecondaryButton has no `enabled` — save() already guards `busy`.
                        SecondaryButton(title: "Usar esta actividad") {
                            let day = ISO8601DateFormatter().date(from: candidate.startedAt) ?? Date()
                            Task { await save(value: Double(candidate.durationS), day: day) }
                        }
                    }
                }
            }
        }
    }

    /// El identificador interno de la fuente, dicho como lo diría una persona.
    private func deviceLabel(_ source: String) -> String {
        switch source.lowercased() {
        case "healthkit": return "de tu Apple Watch"
        case "polar": return "de tu Polar"
        case "garmin": return "de tu Garmin"
        default: return "de tu reloj"
        }
    }

    private func candidateSubtitle(_ candidate: RegisterCandidate) -> String {
        var parts: [String] = []
        if let rel = MarkFormat.relative(candidate.startedAt) { parts.append(rel) }
        if let source = candidate.source, !source.isEmpty { parts.append(deviceLabel(source)) }
        return parts.joined(separator: " · ")
    }

    // MARK: - Manual

    private var manualForm: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            CardSurface(padding: 14) {
                DatePicker("Fecha", selection: $date, in: ...Date(), displayedComponents: .date)
                    .font(Theme.Typography.body)
                    .tint(Theme.Color.accentText)
            }
            CardSurface(padding: 0) {
                TimeHourMinSecRow(label: "Tiempo", seconds: $manualSeconds)
            }
            CardSurface(padding: 14) {
                TextField("Nombre (opcional) · Cursa del Poblenou", text: $eventName)
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
    }

    // MARK: - Save

    @MainActor
    private func save(value: Double, day: Date) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        error = nil
        let dayFmt = DateFormatter()
        dayFmt.locale = Locale(identifier: "en_US_POSIX")
        dayFmt.timeZone = TimeZone(identifier: "Europe/Madrid")
        dayFmt.dateFormat = "yyyy-MM-dd"
        do {
            let result = try await MarksService.register(
                slug: mark.slug,
                value: value,
                date: dayFmt.string(from: day),
                eventName: eventName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : eventName.trimmingCharacters(in: .whitespacesAndNewlines),
                bearer: bearer
            )
            onSaved(result)
            dismiss()
        } catch {
            self.error = "No pudimos registrar la carrera. Revisa el tiempo y reintenta."
        }
    }
}
