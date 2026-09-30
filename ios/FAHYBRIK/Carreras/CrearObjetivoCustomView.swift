import SwiftUI

// CREAR UN OBJETIVO QUE NO ESTÁ EN EL CALENDARIO — el paso que se empuja desde «Buscar carrera» con
// «Crear objetivo personalizado». Crea una fila privada de `events` y pasa a «Fijar objetivo» con ella
// (que es donde se pregunta cómo la corres y a qué tiempo vas). Misma piel que el resto de la hoja
// (`MarcoDeHojaDia`, campos y chips de la familia) y el mismo envío de siempre.
//
// La variante de una Hunter Race ya no se pregunta aquí: esta pantalla nunca la mandaba (el cuerpo de
// creación no la lleva) y «Fijar objetivo», el paso siguiente, la pregunta y la guarda. Preguntarla dos
// veces, y la primera en balde, era un control que no hacía nada.

struct CrearObjetivoCustomView: View {
    @Environment(\.dismiss) private var volver

    var bearer: String?
    /// Cierra la hoja entera (la «✕»). Sin él, la «✕» vuelve al calendario, que es cerrar este paso.
    var cerrar: (() -> Void)? = nil
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

    @State private var submitting = false
    @State private var errorText: String?

    private enum Campo: Hashable { case nombre, ciudad, metros, division, url }
    @FocusState private var enFoco: Campo?

    init(bearer: String?, cerrar: (() -> Void)? = nil, onCreated: @escaping (RaceCalendarEvent) -> Void) {
        self.bearer = bearer
        self.cerrar = cerrar
        self.onCreated = onCreated
    }

    private var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting
    }

    var body: some View {
        MarcoDeHojaDia("Crear objetivo", atras: { volver() }, cerrar: cerrar ?? { volver() }) {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Tu evento no está en el calendario").papel(.subtitulo)
                    Text("Créalo aquí, indica para cuándo es y fíjalo como objetivo.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                campo("Nombre", "Nombre del evento", $name, .nombre)
                campo("Ciudad (opcional)", "Ciudad o sede", $city, .ciudad)
                FilaChipsDia("Tipo") {
                    ForEach(ObjectiveEventKind.allCases) { k in
                        ChipFiltroDia(texto: k.label, elegido: kind == k) { kind = k }
                    }
                }
                porTipo
                ObjectiveWhenSection(date: $date)
                campo("Web (opcional)", "https://…", $sourceUrl, .url, teclado: .URL)
                if let errorText { AvisoEnLineaDia(errorText) }
            }
        } accion: {
            BotonAccionDia(
                hoja: "Crear y continuar",
                activo: canSubmit,
                ocupado: submitting,
                textoOcupado: "Creando…",
                voz: "Creando tu objetivo",
                accion: submit
            )
        }
        .navigationBarHidden(true)
    }

    // Lo que se pregunta según el tipo: la distancia en un running, la división en el resto.
    @ViewBuilder
    private var porTipo: some View {
        switch kind {
        case .running:
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                FilaChipsDia("Distancia") {
                    ForEach(RunningDistancePreset.allCases) { p in
                        ChipFiltroDia(texto: p.label, elegido: distancePreset == p) { distancePreset = p }
                    }
                }
                if distancePreset == .custom {
                    CampoDia("Metros", enFoco: enFoco == .metros) {
                        TextField("Ej. 15000", text: $customMeters)
                            .keyboardType(.numberPad)
                            .focused($enFoco, equals: .metros)
                            .onChange(of: customMeters) { _, nuevo in customMeters = nuevo.filter(\.isNumber) }
                            .accessibilityLabel("Distancia en metros")
                    }
                }
                Toggle(isOn: $homologada) {
                    Text("Carrera homologada").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                }
                .tint(Theme.Color.accent)
                .frame(minHeight: 52)
            }
        case .hybrid:
            EmptyView()
        case .crossfit:
            campo("División", "Ej. RX · Scaled · Masters", $divisionLabel, .division)
        case .ocr, .other:
            campo("División (opcional)", "Categoría", $divisionLabel, .division)
        }
    }

    private func campo(
        _ etiqueta: String, _ ejemplo: String, _ texto: Binding<String>, _ id: Campo, teclado: UIKeyboardType = .default
    ) -> some View {
        CampoDia(etiqueta, enFoco: enFoco == id) {
            TextField(ejemplo, text: texto)
                .keyboardType(teclado)
                .textInputAutocapitalization(teclado == .URL ? .never : .sentences)
                .autocorrectionDisabled(teclado == .URL)
                .focused($enFoco, equals: id)
                .accessibilityLabel(etiqueta)
        }
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
