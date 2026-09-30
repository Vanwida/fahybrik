import SwiftUI

// Dobles · la simulación conjunta. La estrategia de reparto de las 8 estaciones entre los dos atletas (una
// barra de reparto por estación), la tirada juntos, los relevos de la RoxZone y la nota táctica del coach.
//
// Piel de «El día»: cabecera fija con su ‹, una tarjeta por estación con los papeles de la escala (15 pt de
// suelo), y el guardado anclado abajo SOLO cuando hay cambios sin guardar. El atleta es el acento del club y la
// pareja el azul de `Theme.Color.partner`; la nota del coach es una cita con el filo del acento.
//
// Se compone con los átomos de Dobles (`DoblesPiezas`, `DoblesShared`).
//
// HUECO DEL SERVIDOR: `DoblesService.fetchSimulation` devuelve nil mientras no haya endpoint. Sin datos se pinta
// un vacío honesto: JAMÁS se inventan el reparto ni la nota del coach. La estrategia se pinta solo cuando llega.
// No hay «empezar la simulación»: la simulación no trae asignación que lanzar (no hay endpoint de arranque),
// así que ese botón, que no hacía nada, se retiró en vez de prometer algo que no ocurre.
struct DoblesSimulationView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var simulation: DoblesSimulation? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var coachName: String? = nil
    @State private var loading = true

    // #23 (reparto de la pareja) — el estado editable de las estaciones. El atleta ajusta el reparto desde SU
    // punto de vista; `baseline` detecta los cambios sin guardar.
    @State private var editStations: [DoblesEstacionEditable] = []
    @State private var baseline: [DoblesEstacionEditable] = []
    @State private var saving = false
    @State private var aviso: AvisoDia.Contenido? = nil

    private var isDirty: Bool { editStations != baseline }

    private var selfName: String { simulation?.selfName ?? "Tú" }
    private var partnerName: String { simulation?.partnerName ?? partner?.firstName ?? "Compañero" }

    /// Nombre del coach — dato AGNÓSTICO de la API de semana del atleta (coaches.full_name), jamás hardcodeado.
    /// Un genérico neutro cuando falta; nunca se inventa un nombre.
    private var coachLabel: String { coachName ?? "Coach" }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDobles(
                titulo: simulation?.title ?? "Simulación Doubles",
                apoyo: introLine,
                salida: .volver,
                alSalir: { dismiss() }
            )
            contenido
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .avisoDia($aviso)
        .task(id: bearer) { await reload() }
    }

    /// «{día} · la hacéis juntos. {intro}» armada con el payload.
    private var introLine: String? {
        guard let sim = simulation else { return nil }
        var parts: [String] = []
        if let day = sim.dayLabel, !day.isEmpty {
            parts.append("\(day) · la hacéis juntos.")
        } else {
            parts.append("La hacéis juntos.")
        }
        if let intro = sim.intro, !intro.isEmpty { parts.append(intro) }
        let joined = parts.joined(separator: " ")
        return joined.isEmpty ? nil : joined
    }

    // MARK: - Contenido por estado

    @ViewBuilder
    private var contenido: some View {
        if loading {
            ScrollView {
                DoblesSimulacionEsqueleto()
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDisabled(true)
        } else if let simulation {
            let cuerpo = ScrollView {
                DoblesSimulacionCuerpo(
                    simulation: simulation,
                    selfName: selfName,
                    partnerName: partnerName,
                    coachLabel: coachLabel,
                    coachName: coachName,
                    provenance: provenanceLabel,
                    estaciones: $editStations
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollBounceBehavior(.basedOnSize)
            // Guardar es la puerta de la pantalla, y solo existe con cambios: el reparto llega a la pareja al
            // instante (sin flujo de aprobación); la procedencia es lo que lo delata.
            if isDirty {
                cuerpo.anchoredAction {
                    AccionDobles(titulo: saving ? "Guardando…" : "Guardar reparto", enCurso: saving) {
                        Task { await performSave() }
                    }
                }
            } else {
                cuerpo
            }
        } else {
            CenteredScreen {
                EmptyView()
            } lead: {
                EmptyView()
            } content: {
                sinSimulacion
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    @ViewBuilder
    private var sinSimulacion: some View {
        if partner == nil {
            DoblesNoPartnerState(
                message: "La simulación es de los dos: con un compañero conectado veréis el reparto de las 8 estaciones, los relevos y la nota táctica.",
                bearer: bearer,
                onInvited: { Task { await reload() } }
            )
        } else {
            RedesignEmptyState(
                symbol: "flag.checkered",
                title: "Sin simulación programada",
                message: "Cuando tu coach programe una simulación conjunta verás aquí el reparto de las 8 estaciones, los relevos y la nota táctica.",
                exit: .explained(note: "La programa tu coach. Aparece aquí en cuanto la publique.")
            )
        }
    }

    // MARK: - Carga

    /// El vínculo de pareja + la identidad del coach + la simulación conjunta. Se repite tras una invitación para
    /// que una pareja recién emparejada deje de ver el estado sin pareja.
    private func reload() async {
        loading = true
        if let bearer {
            partner = try? await PartnerService.fetchPartner(bearer: bearer)
            // La identidad del coach sale de la API de semana del atleta (la misma fuente que lee Perfil), para
            // atribuir la nota táctica al coach de verdad.
            if let resp = try? await PlanService.fetchWeek(bearer: bearer),
               let name = resp.coachName?.trimmingCharacters(in: .whitespacesAndNewlines),
               !name.isEmpty {
                coachName = name
            }
        }
        simulation = await DoblesService.fetchSimulation(bearer: bearer)
        loadEditState(from: simulation)
        loading = false
    }

    /// Siembra el estado editable desde la simulación cargada (desde el punto de vista del lector).
    private func loadEditState(from sim: DoblesSimulation?) {
        guard let sim else { editStations = []; baseline = []; return }
        let stations = sim.stationSplits.map { s in
            DoblesEstacionEditable(
                id: s.id,
                stationIndex: s.resolvedStationIndex,
                label: s.station,
                carrier: s.resolvedCarrier,
                selfShare: s.selfShare,
                note: s.splitNote ?? ""
            )
        }
        editStations = stations
        baseline = stations
    }

    // MARK: - Procedencia y guardado

    /// «Propuesta de {coach}» (el coach) / «Ajustado por {atleta} · hace 2 h» (un atleta).
    private var provenanceLabel: String? {
        guard let sim = simulation, let name = sim.lastEditedByName else { return nil }
        switch sim.lastEditedByKind {
        case "coach": return "Propuesta de \(name)"
        case "athlete":
            if let rel = relativeTimeES(sim.updatedAt) { return "Ajustado por \(name) · \(rel)" }
            return "Ajustado por \(name)"
        default: return nil
        }
    }

    /// Tiempo relativo compacto en español desde un ISO8601 («hace 2h», «ayer»).
    private func relativeTimeES(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fmt.date(from: iso) ?? {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f.date(from: iso)
        }()
        guard let date else { return nil }
        let mins = max(0, Int(Date().timeIntervalSince(date) / 60))
        if mins < 1 { return "ahora" }
        if mins < 60 { return "hace \(mins) min" }
        let hours = mins / 60
        if hours < 24 { return "hace \(hours)h" }
        let days = hours / 24
        return days == 1 ? "ayer" : "hace \(days) días"
    }

    /// Arma el cuerpo del PUT desde el punto de vista del atleta y guarda. Si sale bien, el DTO devuelto
    /// refresca la vista (la procedencia pasa a este atleta); si falla, las ediciones se quedan y un aviso que
    /// se lee (se queda hasta descartarlo) lo dice.
    private func performSave() async {
        guard let bearer, !saving else { return }
        saving = true
        let body = DoblesSimulationEditBody(
            stationSplits: editStations.map { s in
                let trimmed = s.note.trimmingCharacters(in: .whitespacesAndNewlines)
                let share = s.carrier == .split ? s.selfShare : (s.carrier == .mine ? 1 : 0)
                return DoblesSimulationEditBody.Station(
                    stationIndex: s.stationIndex,
                    carrier: s.carrier.rawValue,
                    selfShare: share,
                    note: trimmed.isEmpty ? nil : trimmed
                )
            }
        )
        if let updated = await DoblesService.updateSimulation(body, bearer: bearer) {
            simulation = updated
            loadEditState(from: updated)
            Haptics.success()
        } else {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: "No se pudo guardar. Inténtalo de nuevo.")
        }
        saving = false
    }
}

// MARK: - Una estación como la edita el atleta

/// Una estación tal como la edita el atleta — centrada en él (quién la lleva y su parte).
struct DoblesEstacionEditable: Identifiable, Equatable {
    let id: String
    let stationIndex: Int
    let label: String
    var carrier: DoblesCarrier
    var selfShare: Double
    var note: String
}

// MARK: - El cuerpo con la simulación

/// Lo que hay bajo la cabecera con la simulación: la leyenda, una tarjeta editable por estación, la nota del
/// coach y sus consejos. Solo dibuja; el guardado vive en `DoblesSimulationView`.
struct DoblesSimulacionCuerpo: View {
    let simulation: DoblesSimulation
    let selfName: String
    let partnerName: String
    let coachLabel: String
    let coachName: String?
    let provenance: String?
    @Binding var estaciones: [DoblesEstacionEditable]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            leyenda

            // El reparto de las estaciones, editable: el atleta ajusta quién hace cada una.
            if estaciones.isEmpty {
                RedesignEmptyState(
                    symbol: "square.split.2x1",
                    title: "Sin reparto de estaciones",
                    message: "El coach aún no ha definido el reparto de las estaciones.",
                    exit: .explained(note: "En cuanto lo defina podréis ajustarlo los dos desde aquí.")
                )
                .padding(.vertical, Theme.Spacing.l)
            } else {
                VStack(spacing: Theme.Spacing.s) {
                    ForEach($estaciones) { $estacion in
                        DoblesEstacionTarjeta(estacion: $estacion, selfName: selfName, partnerName: partnerName)
                    }
                }
            }

            // La nota táctica del coach (una cita con el filo del acento).
            if let note = simulation.coachNote, !note.isEmpty {
                notaDelCoach(note)
            }

            // Los consejos del coach antes de la simulación: la misma tarjeta que el predicho de carrera,
            // alimentada por `coach_tips` (se oculta vacía). El nombre del coach es el real, ya resuelto.
            DoblesCoachTipsCard(title: "Antes de la sim", coachName: coachName, tips: simulation.coachTipsList)
        }
    }

    private var leyenda: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.l) {
                nombres
                Spacer(minLength: 0)
                procedencia
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(spacing: Theme.Spacing.l) { nombres }
                procedencia
            }
        }
    }

    @ViewBuilder
    private var nombres: some View {
        // El punto es el color de quién es (el relleno de la identidad); el nombre va en la tinta del tema.
        punto(color: Theme.Color.accent, etiqueta: selfName)
        punto(color: Theme.Color.partner, etiqueta: partnerName)
    }

    @ViewBuilder
    private var procedencia: some View {
        if let provenance {
            Text(provenance)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func punto(color: SwiftUI.Color, etiqueta: String) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(etiqueta)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiqueta)
    }

    private func notaDelCoach(_ note: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(coachLabel)
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.accentText)
            Text(note)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, Theme.Spacing.m)
        .padding(.horizontal, Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.Color.accent).frame(width: 4)
        }
        .caraDobles(.neutra, radio: Theme.Radius.fila)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Nota del coach \(coachLabel): \(note)")
    }
}

// MARK: - Una estación

/// Una estación editable: quién la hace (yo / compañero / repartida), la parte de cada uno cuando se reparte y
/// una nota de reparto opcional. Se ata por binding a la estación de `editStations`.
struct DoblesEstacionTarjeta: View {
    @Binding var estacion: DoblesEstacionEditable
    let selfName: String
    let partnerName: String

    /// Largo máximo de la nota de reparto (el servidor no acepta más).
    private static let largoMaximoDeNota = 120

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text(estacion.label)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)

            Picker("Reparto", selection: Binding(
                get: { estacion.carrier },
                set: { nuevo in
                    let repartida = estacion.selfShare
                    estacion.carrier = nuevo
                    // Fija la parte al portador completo para que el dato viaje honesto de ida y vuelta.
                    if nuevo == .mine { estacion.selfShare = 1 }
                    else if nuevo == .partner { estacion.selfShare = 0 }
                    else if repartida >= 0.999 || repartida <= 0.001 { estacion.selfShare = 0.5 }
                }
            )) {
                Text(selfName).tag(DoblesCarrier.mine)
                Text("Repartida").tag(DoblesCarrier.split)
                Text(partnerName).tag(DoblesCarrier.partner)
            }
            .pickerStyle(.segmented)

            if estacion.carrier == .split {
                // El slider compartido (lo usa también el editor del reparto del predicho de carrera): un solo
                // componente para que el reparto a pasos de 5 % no pueda divergir entre superficies.
                DoblesShareSlider(selfName: selfName, partnerName: partnerName, selfShare: $estacion.selfShare)
            }

            TextField("Nota (ej. alterna 250m)", text: Binding(
                get: { estacion.note },
                set: { estacion.note = String($0.prefix(Self.largoMaximoDeNota)) }
            ))
            .papel(.cuerpo)
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.m)
            .frame(minHeight: 44)
            .background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
            )
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra)
    }
}

// MARK: - El esqueleto

/// La simulación mientras llega: la misma silueta que lo que la sustituye (la leyenda y las tarjetas de
/// estación), sin inventar ningún reparto.
struct DoblesSimulacionEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.l) {
                SkeletonBar(width: 90, height: 20, radius: 6)
                SkeletonBar(width: 110, height: 20, radius: 6)
            }
            VStack(spacing: Theme.Spacing.s) {
                ForEach(0..<4, id: \.self) { _ in
                    SkeletonBar(height: 150, radius: Theme.Radius.tarjeta)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando la simulación")
    }
}
