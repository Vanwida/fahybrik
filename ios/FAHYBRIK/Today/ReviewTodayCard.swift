import SwiftUI

// "Revisión con tu coach" — the Today/Inicio card for recurring 1:1 reviews (#21).
// Two mutually-exclusive live states (a third = nothing):
//   • PROPUESTA  — the coach proposed a review and the athlete hasn't booked yet →
//                  "{coach} te propone una revisión" + "Elige tu hueco" → slot picker.
//   • PRÓXIMA    — a review is reserved → "Próxima sesión con {coach} · {fecha}" +
//                  "Unirse" (opens Google Meet) when the link is ready.
//   • ninguno    — no proposal, no reservation → render NOTHING (no empty noise).
//
// Self-loading (own `.task(id:)`, like InicioView's steps row) so it stays localized
// and additive — no AppDataStore slice. Every value is REAL data from
// `GET /api/athlete/review` or an honest empty state. Light + dark off Theme tokens.
struct ReviewTodayCard: View {
    /// Live session bearer (single source of truth, passed from InicioView/AppShell).
    var bearer: String?
    /// The coach's display name (from the plan payload); the card uses the
    /// FIRST word. Nil → the generic "tu coach" — NEVER a fabricated name.
    var coachName: String? = nil

    @State private var state: AthleteReviewState?
    /// Set optimistically the instant a booking succeeds (authoritative from the book
    /// response) so the card flips PROPUESTA → PRÓXIMA without waiting for a refetch.
    @State private var booked: AthleteReviewAppointment?
    @State private var showSlotPicker = false

    @Environment(\.openURL) private var openURL

    /// Coach FIRST name for the warm copy; nil when the payload carries none —
    /// the copy then falls back to "tu coach" via `CoachRef`.
    private var coachFirstName: String? {
        let first = coachName?.split(separator: " ").first.map(String.init)
        let trimmed = first?.trimmingCharacters(in: .whitespaces)
        return (trimmed?.isEmpty == false) ? trimmed : nil
    }

    /// The reserved review to surface (a fresh booking wins over the fetched state).
    private var upcoming: AthleteReviewAppointment? { booked ?? state?.nextReview }
    /// Show the proposal only when nothing is reserved and the coach proposed.
    private var showProposal: Bool { upcoming == nil && (state?.proposalPending == true) }

    var body: some View {
        Group {
            if let next = upcoming {
                confirmedCard(next)
            } else if showProposal {
                proposalCard
            }
            // else: neither state → render nothing.
        }
        .task(id: bearer) {
            state = await ReviewService.fetchState(bearer: bearer)
        }
        .sheet(isPresented: $showSlotPicker) {
            ReviewSlotPickerSheet(bearer: bearer, coachFirstName: coachFirstName) { result in
                // Booked → reflect the confirmed session immediately.
                withAnimation(Theme.Motion.reveal) { booked = result.appointment }
            }
        }
    }

    // MARK: - Proposal state

    private var proposalCard: some View {
        CardSurface(padding: 18, topAccent: true) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    LabelText(text: "Revisión con tu coach")
                    Spacer(minLength: 8)
                    Image(systemName: "video.badge.plus")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                Text("\(CoachRef.start(coachFirstName)) te propone una revisión")
                    .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Elige tu hueco para una videollamada de 30 min y repasáis juntos tu progreso.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Haptics.medium()
                    showSlotPicker = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "calendar")
                            .font(.system(size: 13, weight: .heavy))
                        Text("Elige tu hueco")
                            .font(.system(size: 14, weight: .heavy, design: .default).italic())
                            .tracking(0.5)
                    }
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Elige tu hueco para la revisión con \(CoachRef.mid(coachFirstName))")
            }
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Confirmed (upcoming) state

    private func confirmedCard(_ review: AthleteReviewAppointment) -> some View {
        CardSurface(padding: 18) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    LabelText(text: "Próxima sesión con \(CoachRef.mid(coachFirstName))")
                    Spacer(minLength: 8)
                    Image(systemName: "video.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                Text(ReviewDateFormat.longDateTime(fromISO: review.requestedStart) ?? "Revisión reservada")
                    .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Videollamada · \(review.durationMinutes) min")
                    .scaledFont(12.5, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                joinControl(review)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// "Unirse" when the Meet link is ready; an honest "link coming" note otherwise.
    @ViewBuilder
    private func joinControl(_ review: AthleteReviewAppointment) -> some View {
        if let link = review.meetLink,
           !link.isEmpty,
           let url = URL(string: link) {
            Button {
                Haptics.medium()
                openURL(url)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 13, weight: .heavy))
                    Text("Unirse")
                        .font(.system(size: 14, weight: .heavy, design: .default).italic())
                        .tracking(0.5)
                }
                .foregroundStyle(Theme.Color.accentOn)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Theme.Color.accent)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Unirse a la videollamada con \(CoachRef.mid(coachFirstName))")
        } else {
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 11, weight: .semibold))
                Text("Te enviaremos el enlace de la videollamada")
                    .scaledFont(12, relativeTo: .caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Theme.Color.faint)
            .padding(.top, 2)
        }
    }
}

// MARK: - Slot picker sheet
//
// The athlete browses the offered slots (grouped by day) and reserves ONE. Mirrors
// BuscarCarreraSheet's shape: own NavigationStack, cancel toolbar, loading / error /
// empty / list states off Theme tokens. Booking is SELECT → CONFIRM (never a raw
// single tap) — a review creates a real Meet + calendar event for the coach and the
// athlete has no self-cancel flow, so a deliberate confirm prevents misfires.
struct ReviewSlotPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Coach FIRST name from the plan payload; nil → generic "tu coach" copy —
    /// never a fabricated name.
    var coachFirstName: String?
    /// Fires on a successful booking so the card flips to the confirmed session.
    let onBooked: (BookReviewResult) -> Void

    @State private var slots: [ReviewDaySlots] = []
    @State private var loading = true
    @State private var loadFailed = false
    @State private var selected: ReviewSlot?
    @State private var booking = false
    @State private var bookError: String?

    /// Adaptive time-pill grid — fills the row, wraps, no manual column math.
    private let gridColumns = [GridItem(.adaptive(minimum: 74), spacing: 8)]

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                            intro
                            content
                        }
                        .padding(.horizontal, Theme.Spacing.xl)
                        .padding(.top, Theme.Spacing.l)
                        .padding(.bottom, Theme.Spacing.xxl)
                    }
                    if !slots.isEmpty {
                        confirmBar
                    }
                }
            }
            .navigationTitle("Reserva tu revisión")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .tint(Theme.Color.accentText)
                }
            }
        }
        .task { await reload() }
    }

    // MARK: Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(CoachRef.start(coachFirstName)) te propone una revisión")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text("Elige el hueco que mejor te venga. Son 30 minutos por videollamada.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xxl)
        } else if loadFailed {
            errorState
        } else if slots.isEmpty {
            emptyState
        } else {
            slotList
        }
    }

    private var errorState: some View {
        VStack(spacing: Theme.Spacing.m) {
            emptyBlock(
                symbol: "wifi.exclamationmark",
                title: "No pudimos cargar los huecos",
                message: "Revisa tu conexión e inténtalo de nuevo."
            )
            Button {
                Task { await reload() }
            } label: {
                Text("Reintentar")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(.top, Theme.Spacing.l)
    }

    private var emptyState: some View {
        emptyBlock(
            symbol: "calendar.badge.clock",
            title: "Sin huecos ahora mismo",
            message: "\(CoachRef.start(coachFirstName)) te escribirá para cuadrar la llamada."
        )
        .padding(.top, Theme.Spacing.l)
    }

    private var slotList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(slots) { day in
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    SectionLabel(text: ReviewDateFormat.dayHeader(fromISODate: day.date))
                    LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 8) {
                        ForEach(day.slots) { slot in
                            ReviewSlotPill(
                                time: slot.time,
                                selected: selected?.ms == slot.ms
                            ) {
                                Haptics.light()
                                selected = slot
                                bookError = nil
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Confirm bar (pinned)

    private var confirmBar: some View {
        VStack(spacing: 8) {
            if let bookError {
                Text(bookError)
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.danger)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
            }
            Button {
                confirm()
            } label: {
                Group {
                    if booking {
                        ProgressView().tint(Theme.Color.accentOn)
                    } else {
                        Text(confirmTitle)
                            .font(.system(size: 16, weight: .heavy, design: .default).italic())
                            .tracking(1)
                    }
                }
                .foregroundStyle(Theme.Color.accentOn)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(AccentFillButtonStyle(enabled: selected != nil && !booking, radius: Theme.Radius.l))
            .disabled(selected == nil || booking)
            .accessibilityLabel(confirmTitle)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.l)
        .background(
            Theme.Color.background
                .overlay(Hairline(), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private var confirmTitle: String {
        guard let slot = selected else { return "Elige un hueco" }
        let label = ReviewDateFormat.shortDateTime(fromISO: slot.start) ?? slot.time
        return "Reservar · \(label)"
    }

    // MARK: Load + book

    @MainActor
    private func reload() async {
        loading = true
        bookError = nil
        do {
            let fetched = try await ReviewService.fetchSlots(bearer: bearer)
            slots = fetched
            loadFailed = false
            // Drop a selection that no longer exists in the refreshed offer.
            if let sel = selected, !fetched.contains(where: { $0.slots.contains(where: { $0.ms == sel.ms }) }) {
                selected = nil
            }
        } catch {
            slots = []
            loadFailed = true
        }
        loading = false
    }

    private func confirm() {
        guard let slot = selected, !booking else { return }
        booking = true
        bookError = nil
        Task { @MainActor in
            do {
                let result = try await ReviewService.book(requestedStart: slot.start, bearer: bearer)
                Haptics.success()
                onBooked(result)
                dismiss()
            } catch let APIError.http(status, _) where status == 409 {
                // The slot was taken (or a review already exists) meanwhile → honest
                // recovery: clear the pick, reload the fresh offer, THEN surface the
                // message (reload() clears bookError, so it must be set afterwards).
                booking = false
                selected = nil
                await reload()
                bookError = "Ese hueco ya no está disponible. Elige otro."
            } catch {
                booking = false
                bookError = "No pudimos reservar. Inténtalo de nuevo."
            }
        }
    }

    // MARK: Empty/error block

    private func emptyBlock(symbol: String, title: String, message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text(title)
                .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(message)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.xl)
    }
}

// MARK: - Coach reference copy
//
// One source for how the review surfaces name the coach when the payload
// carries no name: the generic "tu coach", capitalized at sentence start —
// NEVER a fabricated first name.
private enum CoachRef {
    /// Sentence-start reference: "Pablo" / "Tu coach".
    static func start(_ firstName: String?) -> String { firstName ?? "Tu coach" }
    /// Mid-sentence reference: "con Pablo" / "con tu coach".
    static func mid(_ firstName: String?) -> String { firstName ?? "tu coach" }
}

// MARK: - Slot time pill

private struct ReviewSlotPill: View {
    let time: String
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(time)
                .font(.system(size: 14, weight: .semibold, design: .monospaced).monospacedDigit())
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(time)\(selected ? ", seleccionado" : "")")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
