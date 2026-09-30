import SwiftUI

// "Fijar objetivo" — the detail step pushed from BuscarCarreraSheet when the athlete taps an event:
// cuándo es, cómo la corres y a qué tiempo vas. Lo que hay que preguntar depende de la FAMILIA de la
// carrera (y hoy la app ya lo hace así):
//   · híbrida (HYROX, DEKA…) → formato, división y categoría (o la variante, en una Hunter Race);
//   · running               → la distancia (y si es homologada);
//   · CrossFit, OCR, otra   → la división, en texto libre.
// El selector de tiempo lleva los peldaños de HYROX solo si es HYROX: para el resto solo «sin tiempo»
// y el exacto. Todo lo que se elige se manda como en la app (`SetTargetRaceBody`). Espejo de `fijar.tsx`.
//
// Fijar la hace la PRINCIPAL y la que había pasa a secundaria: se dice ANTES de fijar (antes ocurría
// sin avisar). Al terminar, `onTargetSet` cierra la hoja y quien la abrió recarga.
struct FijarObjetivoView: View {
    let event: RaceCalendarEvent
    var bearer: String?
    /// La frase que avisa de que el principal de ahora pasa a secundaria. nil = no hay otro principal
    /// (o es este mismo) y no hay nada que avisar.
    var pasaASecundaria: String? = nil
    /// Called after a successful set — the sheet dismisses + caller reloads.
    let onTargetSet: () -> Void
    /// Cierra la hoja entera (la «✕»). «Atrás» solo vuelve al calendario.
    var cerrar: () -> Void = {}

    @Environment(\.dismiss) private var volver

    // Los atributos ORTOGONALES (tokens de cable). Por defecto lo más común (individual/open/hombres):
    // se ven todas las opciones y se cambia cualquiera.
    @State private var format = "singles"
    @State private var division = "open"
    @State private var gender = "men"
    @State private var hunterVariant: HunterRaceVariant = .legend
    @State private var distancePreset: RunningDistancePreset = .km10
    @State private var customMeters = ""
    @State private var homologada = false
    @State private var divisionLabel = ""

    // Objetivo por rangos → goalTimeSeconds. Nada elegido → nil (se puede fijar sin meta).
    @State private var goalChoice: GoalChoice? = nil
    @State private var tiempo = TiempoExacto()

    @State private var submitting = false
    @State private var errorText: String? = nil
    @State private var eventDate: Date
    @FocusState private var metrosEnFoco: Bool
    @FocusState private var divisionEnFoco: Bool

    init(
        event: RaceCalendarEvent,
        bearer: String?,
        pasaASecundaria: String? = nil,
        onTargetSet: @escaping () -> Void,
        cerrar: @escaping () -> Void = {}
    ) {
        self.event = event
        self.bearer = bearer
        self.pasaASecundaria = pasaASecundaria
        self.onTargetSet = onTargetSet
        self.cerrar = cerrar
        _eventDate = State(initialValue: ObjectiveWhenDate.fromEventStart(event.startDate))
    }

    /// Catalog rows without a confirmed date show an extra hint under the label.
    private var catalogUndated: Bool { event.startDate == nil || event.tentative }

    private var esHunter: Bool { event.isHunterRace || event.series?.lowercased() == "hunter_race" }

    private var goalTotalSeconds: Int? { GoalChoice.metaS(goalChoice, tiempo: tiempo) }

    var body: some View {
        MarcoDeHojaCarreras("Fijar objetivo", atras: { volver() }, cerrar: cerrar) {
            VStack(alignment: .leading, spacing: 22) {
                cabeceraDelEvento
                ObjectiveWhenSection(date: $eventDate, showUndatedCatalogHint: catalogUndated)
                participacion
                pregunta
                if let errorText { AvisoEnLinea(errorText) }
                if let pasaASecundaria {
                    Text(pasaASecundaria)
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.Color.foreground.opacity(0.06), in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                }
            }
        } accion: {
            BotonPrimarioCarreras(
                titulo: "Fijar como mi carrera objetivo",
                ocupado: submitting,
                textoOcupado: "Guardando…",
                voz: "Guardando tu carrera objetivo",
                accion: submit
            )
        }
        .navigationBarHidden(true)
    }

    // MARK: - Event header

    private var cabeceraDelEvento: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if let series = event.seriesLabel {
                Text(series).papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
            }
            Text(event.name)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(cuandoYDonde).papel(.nota).foregroundStyle(Theme.Color.muted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaCarreras(realce: true)
        .accessibilityElement(children: .combine)
    }

    private var cuandoYDonde: String {
        let cuando = catalogUndated
            ? "Fecha por confirmar"
            : event.startDate.flatMap { FechaES.corta($0, hoy: RaceDate.todayISO(), conDia: true) } ?? event.dateText
        return [event.location.flatMap { $0.isEmpty ? nil : $0 }, cuando].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: - Lo que se pregunta según la familia

    @ViewBuilder
    private var participacion: some View {
        switch event.objectiveFamily {
        case .hybrid where esHunter:
            // Chips y no el segmentado: «Sprinter · 3,5 km» en un tercio del ancho se encogía por debajo
            // del suelo de 15 pt (el segmentado reduce la letra para caber). Los chips pasan en horizontal.
            FilaChipsCarreras("Formato") {
                ForEach(HunterRaceVariant.allCases) { v in
                    ChipFiltroCarreras(texto: v.label, elegido: hunterVariant == v) { hunterVariant = v }
                }
            }
        case .hybrid:
            SegmentadoCarreras(
                etiqueta: "Formato",
                opciones: [FormatoCarrera.individual, .dobles, .relevos].map { (valor: $0.rawValue, texto: $0.etiqueta) },
                seleccion: $format
            )
            SegmentadoCarreras(
                etiqueta: "División",
                opciones: [DivisionCarrera.open, .pro, .elite].map { (valor: $0.rawValue, texto: $0.etiqueta) },
                seleccion: $division
            )
            SegmentadoCarreras(
                etiqueta: "Categoría",
                opciones: [CategoriaCarrera.hombres, .mujeres, .mixto].map { (valor: $0.rawValue, texto: $0.etiqueta) },
                seleccion: $gender
            )
        case .running:
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SegmentadoCarreras(
                    etiqueta: "Distancia",
                    opciones: RunningDistancePreset.allCases.map { (valor: $0, texto: $0.label) },
                    seleccion: $distancePreset
                )
                if distancePreset == .custom {
                    CampoCarreras("Metros", enFoco: metrosEnFoco) {
                        TextField("Metros", text: $customMeters)
                            .keyboardType(.numberPad)
                            .focused($metrosEnFoco)
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
        case .crossfit, .other, .ocr:
            CampoCarreras("División", enFoco: divisionEnFoco) {
                TextField("Ej. RX · Scaled · Masters", text: $divisionLabel)
                    .autocorrectionDisabled(true)
                    .focused($divisionEnFoco)
                    .accessibilityLabel("División")
            }
        }
    }

    // MARK: - «¿A qué vas?»

    private var pregunta: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("¿A qué vas?").subtituloCarreras()
                Text("Tu plan y tu analítica se enfocan en esto.").papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            MetaSelectorCarreras(esHyrox: event.isHyroxGoalGapEligible, eleccion: $goalChoice, tiempo: $tiempo)
            if event.isHyroxGoalGapEligible {
                Text("El objetivo se traduce en tiempos por estación según datos reales de tu división.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var resolvedDistanceMeters: Int? {
        guard event.objectiveFamily == .running else { return nil }
        if distancePreset == .custom {
            return Int(customMeters.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return distancePreset.meters
    }

    // MARK: - Submit

    private func submit() {
        guard !submitting else { return }
        guard let eventIdInt = Int(event.eventId) else {
            errorText = "No pudimos identificar este evento. Prueba con otra carrera."
            return
        }
        submitting = true
        errorText = nil
        let equipoHybrid = event.objectiveFamily == .hybrid && !esHunter
        let body = SetTargetRaceBody(
            eventId: eventIdInt,
            format: equipoHybrid ? format : nil,
            division: equipoHybrid ? division : nil,
            genderCategory: equipoHybrid ? gender : nil,
            goalTimeSeconds: goalTotalSeconds,
            objectiveVariant: esHunter ? hunterVariant.rawValue : nil,
            divisionLabel: divisionLabel.isEmpty ? nil : divisionLabel,
            distanceMeters: resolvedDistanceMeters,
            homologada: event.objectiveFamily == .running ? homologada : nil,
            startDate: ObjectiveWhenDate.isoString(from: eventDate)
        )
        Task { @MainActor in
            do {
                _ = try await RaceCalendarService.setTarget(bearer: bearer, body: body)
                submitting = false
                Haptics.success()
                onTargetSet()
            } catch let err as RaceTargetError {
                submitting = false
                Haptics.error()
                errorText = err.message
            } catch {
                submitting = false
                Haptics.error()
                errorText = RaceTargetError.generic.message
            }
        }
    }
}

// MARK: - Fijar el tiempo objetivo de una carrera YA fijada

/// "¿A qué vas?" for a race the athlete has ALREADY set as an objective.
///
/// `FijarObjetivoView` (above) is the first-time flow: it picks the event AND its attributes AND the
/// goal time. But an athlete who fixed a race without a time had no way back in. This is that
/// button's destination: the same goal selector (`MetaSelectorCarreras`, one source of truth) over the
/// race's EXISTING format · division · category, which the athlete already chose and is not re-asked for.
///
/// It posts to the same `POST /api/athlete/races/target` — the endpoint is idempotent per event, so
/// re-sending the identical attributes with a goal time updates the objective in place. Y por eso se
/// reenvía TODO lo que se eligió al fijarla (variante, división en texto libre, distancia,
/// homologada): un reenvío que se dejara alguno lo borraría.
struct FijarTiempoObjetivoSheet: View {
    let race: UpcomingRace
    var bearer: String?
    /// Called after a successful save so the host re-fetches the goal-gap.
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var goalChoice: GoalChoice?
    @State private var tiempo: TiempoExacto
    @State private var submitting = false
    @State private var errorText: String?

    init(race: UpcomingRace, bearer: String?, onSaved: @escaping () -> Void) {
        self.race = race
        self.bearer = bearer
        self.onSaved = onSaved
        // Pre-select whatever is stored: an exact rung selects its chip, any other time drops straight
        // into the wheels already dialled to it.
        let inicial = GoalChoice.desde(metaS: race.goalTimeSeconds)
        _goalChoice = State(initialValue: inicial.eleccion)
        _tiempo = State(initialValue: inicial.tiempo)
    }

    private var esHyrox: Bool { race.supportsHyroxGoalGap }

    private var goalTotalSeconds: Int? { GoalChoice.metaS(goalChoice, tiempo: tiempo) }

    /// Nothing chosen yet → nothing to save. "Acabarla bien" IS a choice (it clears the clock on
    /// purpose), so it stays enabled; an exact time of zero is not a time.
    private var puedeGuardar: Bool {
        guard let goalChoice, !submitting else { return false }
        if case .exact = goalChoice { return goalTotalSeconds != nil }
        return true
    }

    private var lineaDeLaCarrera: String {
        let cuando = race.raceDate.flatMap { FechaES.corta($0, hoy: RaceDate.todayISO(), conDia: true) } ?? "Fecha por confirmar"
        let ahora = race.goalTimeSeconds.flatMap(Formato.metaDeCarrera).map { "Ahora: \($0)" } ?? "Sin tiempo fijado"
        return [cuando, ahora].joined(separator: " · ")
    }

    var body: some View {
        MarcoDeHojaCarreras("Tu tiempo objetivo", cerrar: { dismiss() }) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(race.name).subtituloCarreras().fixedSize(horizontal: false, vertical: true)
                    Text(lineaDeLaCarrera).papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                .frame(maxWidth: .infinity, alignment: .leading)
                .tarjetaCarreras()
                .accessibilityElement(children: .combine)
                VStack(alignment: .leading, spacing: 3) {
                    Text("¿A qué vas?").subtituloCarreras()
                    Text("Tu plan y tu analítica se enfocan en esto.").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                MetaSelectorCarreras(esHyrox: esHyrox, eleccion: $goalChoice, tiempo: $tiempo)
                if let errorText { AvisoEnLinea(errorText) }
            }
        } accion: {
            BotonPrimarioCarreras(
                titulo: "Guardar",
                activo: puedeGuardar,
                ocupado: submitting,
                textoOcupado: "Guardando…",
                voz: "Guardando tu tiempo objetivo",
                accion: submit
            )
        }
        .presentationDetents([.large])
    }

    private func submit() {
        guard puedeGuardar else { return }
        // The race must carry the calendar event it came from; without it there is nothing to
        // re-target and we say so instead of failing silently.
        guard let eventId = race.eventId else {
            errorText = "Esta carrera no está enlazada al calendario oficial, así que no podemos guardarle un objetivo."
            return
        }
        submitting = true
        errorText = nil
        let body = SetTargetRaceBody(
            eventId: eventId,
            format: race.format ?? "singles",
            division: race.division ?? "open",
            genderCategory: race.genderCategory ?? "men",
            goalTimeSeconds: goalTotalSeconds,
            objectiveVariant: race.objectiveVariant,
            divisionLabel: race.divisionLabel,
            distanceMeters: race.distanceMeters,
            homologada: race.homologada,
            startDate: race.raceDate ?? ObjectiveWhenDate.isoString(from: Date())
        )
        Task { @MainActor in
            do {
                _ = try await RaceCalendarService.setTarget(bearer: bearer, body: body)
                submitting = false
                Haptics.success()
                onSaved()
                dismiss()
            } catch let err as RaceTargetError {
                submitting = false
                Haptics.error()
                errorText = err.message
            } catch {
                submitting = false
                Haptics.error()
                errorText = RaceTargetError.generic.message
            }
        }
    }
}
