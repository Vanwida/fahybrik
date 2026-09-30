import SwiftUI

// "Registrar carrera" (#Marcas) — the Sunday 10K, without typing when possible.
//
// If they ran it with the watch, the activity is ALREADY synced — one tap uses the
// real GPS time. The manual fields stay for the race from before the app existed.
// Registered marks land in the same history as everything else, dated the day the
// race happened, and the coach hears about it through the same funnel.
//
// Una hoja de «El día»: `MarcoDeHojaDia` con la acción anclada abajo, campos de la familia (`CampoDia`) y
// el error dentro de la hoja, con su salida. Lo que se pinta vive en `RegistrarCarreraCuerpo`, sin servicio,
// para que la galería y las capturas pinten lo mismo que la hoja.
struct RegisterRaceSheet: View {
    let mark: MarkView
    let bearer: String?
    /// The server's verdict on the saved mark (is_pr + previous best) — the host
    /// celebrates with it instead of inferring a record it can't know.
    let onSaved: (MarkWriteResult) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var candidates: [RegisterCandidate] = []
    @State private var date = Date()
    /// El tiempo tal como lo escribe el atleta. Empieza VACÍO y no se puede guardar nada hasta que lo escribe:
    /// tres ruedas aparcadas en 45 min significaban que quien no las tocaba archivaba 45:00 como su 10K, y una
    /// rueda no tiene una posición vacía donde aparcar.
    @State private var tiempo = ""
    @State private var eventName = ""
    @State private var busy = false
    @State private var error: String? = nil
    @FocusState private var foco: CampoDeCarrera?

    private var manualTotal: Double? {
        TimeHourMinSecRow.parse(tiempo).map(Double.init).flatMap { $0 > 0 ? $0 : nil }
    }

    var body: some View {
        MarcoDeHojaDia("Registrar \(mark.label)", cerrar: { dismiss() }) {
            RegistrarCarreraCuerpo(
                candidatas: candidates,
                fecha: $date,
                tiempo: $tiempo,
                nombre: $eventName,
                foco: $foco,
                tiempoInvalido: !tiempo.isEmpty && manualTotal == nil,
                ocupado: busy,
                error: error,
                alUsar: { candidata in
                    let day = ISO8601DateFormatter().date(from: candidata.startedAt) ?? Date()
                    Task { await save(value: Double(candidata.durationS), day: day) }
                }
            )
        } accion: {
            // Until the time is declared the button says what it needs, not a fabricated "0:00" — and it stays
            // inactive.
            BotonAccionDia(
                hoja: manualTotal.map { "Guardar \(mark.label) · \(Formato.clock($0))" } ?? "Escribe tu tiempo",
                activo: manualTotal != nil, ocupado: busy,
                textoOcupado: "Guardando…", voz: "Guardando la carrera"
            ) {
                guard let total = manualTotal else { return }
                Task { await save(value: total, day: date) }
            }
        }
        .presentationDetents([.medium, .large])
        .task { candidates = (try? await MarksService.fetchCandidates(slug: mark.slug, bearer: bearer)) ?? [] }
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
        let nombre = eventName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let result = try await MarksService.register(
                slug: mark.slug,
                value: value,
                date: dayFmt.string(from: day),
                eventName: nombre.isEmpty ? nil : nombre,
                bearer: bearer
            )
            onSaved(result)
            dismiss()
        } catch {
            self.error = "No pudimos registrar la carrera. Revisa el tiempo y reintenta."
        }
    }
}

// MARK: - El cuerpo de la hoja

enum CampoDeCarrera { case tiempo, nombre }

/// Lo que se pinta dentro de la hoja: las actividades del reloj (si las hay), el formulario a mano y el error.
struct RegistrarCarreraCuerpo: View {
    let candidatas: [RegisterCandidate]
    @Binding var fecha: Date
    @Binding var tiempo: String
    @Binding var nombre: String
    var foco: FocusState<CampoDeCarrera?>.Binding
    /// Lo escrito no se entiende como un tiempo: el borde del campo avisa (y el botón anclado sigue diciendo
    /// «Escribe tu tiempo»).
    var tiempoInvalido = false
    let ocupado: Bool
    let error: String?
    let alUsar: (RegisterCandidate) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            if !candidatas.isEmpty {
                delReloj
                Text("o a mano")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity)
            }
            aMano
            if let error { AvisoEnLineaDia(error) }
        }
    }

    // MARK: From the watch

    private var delReloj: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("De tu reloj")
            ForEach(candidatas) { candidata in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    HStack(alignment: .top, spacing: Theme.Spacing.m) {
                        VStack(alignment: .leading, spacing: 2) {
                            // Si la actividad llegó sin distancia, el título es solo «Carrera»: el tiempo de
                            // al lado es el dato que importa para registrarla.
                            Text(Formato.distanciaCubierta(candidata.distanceM).map { "Carrera · \($0)" } ?? "Carrera")
                                .papel(.cuerpoFuerte)
                                .foregroundStyle(Theme.Color.foreground)
                            Text(Self.subtitulo(candidata))
                                .papel(.nota)
                                .foregroundStyle(Theme.Color.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        Text(Formato.clock(Double(candidata.durationS)))
                            .papel(.seccion)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                    .accessibilityElement(children: .combine)
                    BotonAccionDia(
                        "Usar esta actividad", glifo: .check, glifoAlFinal: false,
                        estado: ocupado ? .inactivo : .normal
                    ) { alUsar(candidata) }
                }
                .padding(Theme.Spacing.l)
                .tarjetaDia(alAncho: true)
            }
        }
    }

    /// El identificador interno de la fuente, dicho como lo diría una persona.
    private static func dispositivo(_ source: String) -> String {
        switch source.lowercased() {
        case "healthkit": return "de tu Apple Watch"
        case "polar": return "de tu Polar"
        case "garmin": return "de tu Garmin"
        default: return "de tu reloj"
        }
    }

    static func subtitulo(_ candidata: RegisterCandidate) -> String {
        var partes: [String] = []
        if let relativa = MarkFormat.relative(candidata.startedAt) { partes.append(relativa) }
        if let source = candidata.source, !source.isEmpty { partes.append(dispositivo(source)) }
        return partes.joined(separator: " · ")
    }

    // MARK: Manual

    private var aMano: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            CampoDia("Fecha") {
                HStack(spacing: 0) {
                    DatePicker("Fecha", selection: $fecha, in: ...Date(), displayedComponents: .date)
                        .labelsHidden()
                        .tint(Theme.Color.accentText)
                    Spacer(minLength: 0)
                }
            }
            CampoDia("Tiempo", enFoco: foco.wrappedValue == .tiempo, aviso: tiempoInvalido) {
                TextField("h:mm:ss", text: $tiempo)
                    .keyboardType(.numbersAndPunctuation)
                    .monospacedDigit()
                    .focused(foco, equals: .tiempo)
                    .accessibilityLabel("Tiempo")
            }
            CampoDia("Nombre (opcional)", enFoco: foco.wrappedValue == .nombre) {
                TextField("Cursa del Poblenou", text: $nombre)
                    .textInputAutocapitalization(.sentences)
                    .focused(foco, equals: .nombre)
                    .accessibilityLabel("Nombre de la carrera, opcional")
            }
        }
    }
}
