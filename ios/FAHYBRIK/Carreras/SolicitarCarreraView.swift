import SwiftUI

// "Pedir carrera" — the honest fallback when an athlete's FUTURE target race is
// not yet in the official calendar. A target objective can't be a pasted PAST
// result link, so instead of the result importer the athlete describes the race
// (name · city · date) and sends it to their coach, who curates the calendar and
// adds it. We reuse the existing athlete→coach chat (ChatService.sendMessage) —
// no new backend — so the request lands in the same thread the coach already
// reads. No target is fixed here; that happens once the coach adds the event.
//
// Pushed from BuscarCarreraSheet's "¿No encuentras tu carrera?" affordance.
// `onSent` dismisses the whole picker sheet after the athlete confirms.
struct SolicitarCarreraView: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Called after the athlete acknowledges a successful send — the caller
    /// dismisses the picker sheet.
    let onSent: () -> Void

    @State private var raceName: String = ""
    @State private var city: String = ""
    @State private var hasDate: Bool = false
    @State private var date: Date = Date()

    @State private var submitting = false
    @State private var errorText: String? = nil
    @State private var sent = false

    private var canSubmit: Bool {
        !raceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                if sent {
                    confirmation
                } else {
                    form
                }
            }
        }
        .navigationTitle(sent ? "Solicitud enviada" : "Pedir carrera")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Form

    private var form: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            intro
            field(
                label: "CARRERA",
                placeholder: "Nombre del evento (p.ej. HYROX Valencia)",
                text: $raceName,
                autocapitalization: .words
            )
            field(
                label: "CIUDAD (OPCIONAL)",
                placeholder: "Ciudad o sede",
                text: $city,
                autocapitalization: .words
            )
            dateSection

            if let errorText {
                errorBanner(errorText)
            }

            Spacer(minLength: Theme.Spacing.l)

            submitButton
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("¿Tu carrera no está en el calendario?")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Cuéntanos cuál es y tu coach la añade. Cuando esté en el calendario podrás fijarla como tu objetivo.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field(
        label: String,
        placeholder: String,
        text: Binding<String>,
        autocapitalization: TextInputAutocapitalization
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: label)
            TextField(placeholder, text: text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.foreground)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(true)
                .padding(.horizontal, 13)
                .padding(.vertical, 12)
                .background(Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
    }

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $hasDate.animation(.easeInOut(duration: 0.18))) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sé la fecha")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    Text(hasDate ? "Indícanos el día de la carrera" : "Si no, la dejamos por confirmar")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .tint(Theme.Color.accent)

            if hasDate {
                DatePicker(
                    "Fecha de la carrera",
                    selection: $date,
                    in: Date()...,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(Theme.Color.accent)
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
        }
    }

    @ViewBuilder
    private var submitButton: some View {
        if submitting {
            HStack(spacing: 10) {
                ProgressView().tint(Theme.Color.accentOn)
                Text("Enviando…")
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .tracking(1)
                    .foregroundStyle(Theme.Color.accentOn)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(Theme.Color.accent.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .accessibilityLabel("Enviando solicitud")
        } else {
            ExpertPrimaryButton(title: "ENVIAR A MI COACH", enabled: canSubmit) {
                submit()
            }
        }
    }

    // MARK: - Confirmation

    private var confirmation: some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .padding(.top, Theme.Spacing.xxl)
            Text("Se lo hemos enviado a tu coach")
                .scaledFont(19, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("En cuanto la añada al calendario podrás fijarla como tu carrera objetivo. Te avisará por el chat.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "HECHO") {
                onSent()
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.xxl)
        .frame(maxWidth: .infinity)
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.danger)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.danger.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Send

    /// The chat message the coach receives. Plain Spanish, no jargon — it reads
    /// like the athlete typed it, because it lands in their real chat thread.
    private func requestMessage() -> String {
        let trimmedName = raceName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedCity = city.trimmingCharacters(in: .whitespacesAndNewlines)

        var lines = ["Hola, quiero fijar una carrera objetivo que no está en el calendario:"]
        lines.append("Carrera: \(trimmedName)")
        if !trimmedCity.isEmpty {
            lines.append("Ciudad: \(trimmedCity)")
        }
        lines.append("Fecha: \(hasDate ? Self.dateFormatter.string(from: date) : "por confirmar")")
        lines.append("¿Puedes añadirla al calendario?")
        return lines.joined(separator: "\n")
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d 'de' MMMM 'de' yyyy"
        return f
    }()

    private func submit() {
        guard canSubmit else { return }
        guard let bearer else {
            errorText = "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
            return
        }
        submitting = true
        errorText = nil
        let message = requestMessage()
        Task { @MainActor in
            do {
                _ = try await ChatService.sendMessage(bearer: bearer, body: message)
                submitting = false
                Haptics.success()
                withAnimation(.easeInOut(duration: 0.2)) { sent = true }
            } catch {
                submitting = false
                Haptics.error()
                errorText = "No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo."
            }
        }
    }
}
