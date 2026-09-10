import SwiftUI

// FH-77 — custom objective when the event isn't in the shared calendar.
// Creates a private `events` row then navigates to FijarObjetivoView.

struct CrearObjetivoCustomView: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    let onCreated: (RaceCalendarEvent) -> Void

    @State private var name = ""
    @State private var city = ""
    @State private var kind: ObjectiveEventKind = .running
    @State private var date = Date()
    @State private var sourceUrl = ""
    @State private var divisionLabel = ""
    @State private var homologada = false
    @State private var distancePreset: RunningDistancePreset = .km10
    @State private var customMeters = ""
    @State private var hunterVariant: HunterRaceVariant = .legend

    @State private var submitting = false
    @State private var errorText: String?

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                intro
                field(label: "NOMBRE", placeholder: "Nombre del evento", text: $name)
                field(label: "CIUDAD (OPCIONAL)", placeholder: "Ciudad o sede", text: $city)
                kindPicker
                kindSpecificFields
                dateSection
                field(label: "URL (OPCIONAL)", placeholder: "https://…", text: $sourceUrl)
                if let errorText { errorBanner(errorText) }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.l)
        }
        .anchoredAction { submitButton }
        .navigationTitle("Crear objetivo")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tu evento no está en el calendario")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Créalo aquí, indica para cuándo es y fíjalo como objetivo.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var kindPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "TIPO")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ObjectiveEventKind.allCases) { k in
                        PillChip(title: k.label, selected: kind == k) {
                            kind = k
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var kindSpecificFields: some View {
        switch kind {
        case .running:
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "DISTANCIA")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(RunningDistancePreset.allCases) { p in
                            PillChip(title: p.label, selected: distancePreset == p) {
                                distancePreset = p
                            }
                        }
                    }
                }
                if distancePreset == .custom {
                    field(label: "METROS", placeholder: "Ej. 15000", text: $customMeters)
                }
                Toggle(isOn: $homologada) {
                    Text("Carrera homologada")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                }
                .tint(Theme.Color.accent)
            }
        case .hybrid:
            if kind == .hybrid {
                VStack(alignment: .leading, spacing: 8) {
                    LabelText(text: "FORMATO HUNTER (SI APLICA)")
                    ForEach(HunterRaceVariant.allCases) { v in
                        PillChip(title: v.label, selected: hunterVariant == v) {
                            hunterVariant = v
                        }
                    }
                }
            }
        case .crossfit:
            field(label: "DIVISIÓN", placeholder: "Ej. RX · Scaled · Masters", text: $divisionLabel)
        default:
            field(label: "DIVISIÓN (OPCIONAL)", placeholder: "Categoría", text: $divisionLabel)
        }
    }

    private var dateSection: some View {
        ObjectiveWhenSection(date: $date)
    }

    private func field(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: label)
            TextField(placeholder, text: text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.foreground)
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

    @ViewBuilder
    private var submitButton: some View {
        if submitting {
            ProgressView().frame(maxWidth: .infinity)
        } else {
            ExpertPrimaryButton(title: "CREAR Y CONTINUAR", enabled: canSubmit) {
                submit()
            }
        }
    }

    private func errorBanner(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Theme.Color.danger)
    }

    private func submit() {
        guard canSubmit else { return }
        submitting = true
        errorText = nil

        var series = kind.wireSeries
        if kind == .hybrid { series = "hunter_race" }

        let isoDate = ObjectiveWhenDate.isoString(from: date)
        let meters: Int? = {
            if kind != .running { return nil }
            if distancePreset == .custom {
                return Int(customMeters.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            return distancePreset.meters
        }()

        let body = CreateCustomEventBody(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            type: kind.wireType,
            series: series,
            location: city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : city.trimmingCharacters(in: .whitespacesAndNewlines),
            startDate: isoDate,
            isTentative: false,
            sourceUrl: sourceUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : sourceUrl.trimmingCharacters(in: .whitespacesAndNewlines),
            divisionLabel: divisionLabel.isEmpty ? nil : divisionLabel,
            homologada: kind == .running ? homologada : nil,
            distanceMeters: meters
        )

        Task { @MainActor in
            do {
                let resp = try await RaceCalendarService.createCustomEvent(bearer: bearer, body: body)
                submitting = false
                let stub = RaceCalendarEvent(
                    eventId: resp.eventId,
                    slug: resp.slug,
                    name: body.name,
                    series: series,
                    type: kind.wireType,
                    family: kind.rawValue,
                    location: body.location,
                    country: nil,
                    region: nil,
                    startDate: isoDate,
                    endDate: nil,
                    isTentative: false,
                    divisionOptions: nil,
                    isCustom: true
                )
                onCreated(stub)
            } catch let err as RaceTargetError {
                submitting = false
                errorText = err.message
            } catch {
                submitting = false
                errorText = RaceTargetError.generic.message
            }
        }
    }

}

// Memberwise init for navigation stub (Decodable type without public init).
extension RaceCalendarEvent {
    init(
        eventId: String,
        slug: String,
        name: String,
        series: String?,
        type: String?,
        family: String?,
        location: String?,
        country: String?,
        region: String?,
        startDate: String?,
        endDate: String?,
        isTentative: Bool?,
        divisionOptions: [String]?,
        isCustom: Bool?
    ) {
        self.eventId = eventId
        self.slug = slug
        self.name = name
        self.series = series
        self.type = type
        self.family = family
        self.location = location
        self.country = country
        self.region = region
        self.startDate = startDate
        self.endDate = endDate
        self.isTentative = isTentative
        self.divisionOptions = divisionOptions
        self.isCustom = isCustom
    }
}
