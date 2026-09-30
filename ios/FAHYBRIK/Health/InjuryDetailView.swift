import SwiftUI

// «EVOLUCIÓN DE UNA MOLESTIA» — tocar una molestia abre su evolución. Un episodio ABIERTO enseña las transiciones
// válidas de la máquina de estados + una nota (PATCH /athlete/injuries/[id]); uno RESUELTO es historial de solo
// lectura. Los dos enseñan la vuelta estimada por el coach (si la hay) y la línea del tiempo completa de
// `injury_updates` (entradas del coach y del atleta).

struct InjuryDetailView: View {
    let bearer: String?
    let coachName: String?
    /// FREE: updates are the athlete's own follow-up, never a note to a coach.
    let hasCoach: Bool
    let onChanged: () async -> Void

    @State private var injury: AthleteInjury
    @State private var selectedTransition: InjuryStatus? = nil
    @State private var note: String = ""
    @State private var saving = false
    @State private var errorText: String? = nil

    init(
        injury: AthleteInjury,
        bearer: String?,
        coachName: String?,
        hasCoach: Bool = true,
        onChanged: @escaping () async -> Void
    ) {
        _injury = State(initialValue: injury)
        self.bearer = bearer
        self.coachName = coachName
        self.hasCoach = hasCoach
        self.onChanged = onChanged
    }

    private var coachLabel: String { etiquetaDeCoach(coachName) }

    private var canSave: Bool {
        guard injury.isOpen else { return false }
        return selectedTransition != nil || !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        if injury.isOpen {
            PantallaPerfil(titulo: injury.zone.label) { contenido } pie: {
                AccionAncladaPerfil(titulo: saving ? "Guardando…" : "Guardar", enCurso: saving, habilitada: canSave, accion: saveUpdate)
            }
        } else {
            PantallaPerfil(titulo: injury.zone.label) { contenido }
        }
    }

    @ViewBuilder
    private var contenido: some View {
        resumen
        if injury.isOpen { actualizacion }
        lineaDelTiempo
    }

    // MARK: Resumen

    private var resumen: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                PastillaConMarcaPerfil(texto: injury.status.label, marca: injury.status.marca)
                PastillaConMarcaPerfil(texto: injury.severity.label, marca: injury.severity.marca)
            }
            Text(summaryTemporal)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if injury.isOpen, let ret = InjuryDateText.shortDate(injury.expectedReturn) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    IconoPerfil(.diasDeEntreno, tam: 18)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("\(coachLabel.conMayusculaInicial) estima tu vuelta el \(ret)")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaPerfil(realce: injury.isOpen && injury.expectedReturn != nil)
        .accessibilityElement(children: .combine)
    }

    private var summaryTemporal: String {
        if injury.status == .resuelta {
            if let d = InjuryDateText.shortDate(injury.resolvedDate) { return "Resuelta el \(d)." }
            return "Resuelta."
        }
        return "Registrada \(InjuryDateText.since(injury.onsetDate))."
    }

    // MARK: Actualización (solo abiertas)

    private var actualizacion: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                TituloSeccionDia("¿Cómo va?")
                NotaPerfil(hasCoach
                           ? "Actualiza el estado o deja una nota para \(coachLabel)."
                           : "Actualiza el estado o deja una nota.")
            }
            SelectorDeOpcionesPerfil(
                opciones: injury.status.allowedTransitions.map { (clave: $0, titulo: transitionLabel(to: $0)) },
                elegidaOpcional: $selectedTransition
            )
            GrupoPerfil {
                NotaEditorPerfil(text: $note, placeholder: "Añade una nota (opcional)")
            }
            if let errorText { AvisoEnLineaPerfil(tono: .peligro, texto: errorText) }
        }
    }

    /// Athlete-facing verb for a status transition (state-machine target → copy).
    private func transitionLabel(to status: InjuryStatus) -> String {
        switch status {
        case .enRecuperacion: return "Voy mejor"
        case .resuelta:       return "Ya está bien"
        case .activa:         return "Ha vuelto a molestar"
        }
    }

    private func saveUpdate() {
        guard let bearer, canSave, !saving else { return }
        saving = true
        errorText = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = InjuryUpdateBody(status: selectedTransition, note: trimmed.isEmpty ? nil : trimmed)
        Task { @MainActor in
            do {
                let updated = try await InjuryService.update(bearer: bearer, id: injury.id, body: body)
                Haptics.success()
                injury = updated
                selectedTransition = nil
                note = ""
                saving = false
                await onChanged()
            } catch let APIError.http(status, _) {
                Haptics.error()
                // 409 = the state machine rejected the transition (e.g. someone
                // else already resolved it). Surface it honestly.
                errorText = status == 409
                    ? "Ese cambio de estado ya no es válido. Vuelve atrás para ver el estado actual."
                    : "No pudimos guardar el cambio. Inténtalo de nuevo."
                saving = false
            } catch {
                Haptics.error()
                errorText = "No pudimos guardar el cambio. Revisa tu conexión."
                saving = false
            }
        }
    }

    // MARK: Línea del tiempo

    private var lineaDelTiempo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Evolución")
            GrupoPerfil {
                // La primera entrada, sintética: el reporte original.
                EntradaDeEvolucion(
                    titulo: "Molestia reportada",
                    quien: injury.registeredByCoach ? coachLabel.conMayusculaInicial : "Tú",
                    cuando: InjuryDateText.shortDate(injury.onsetDate),
                    detalle: injury.note,
                    marca: nil
                )
                ForEach(injury.updates) { u in
                    EntradaDeEvolucion(
                        titulo: u.status.map { "Pasó a \($0.label)" } ?? "Nota",
                        quien: u.recordedByCoach ? coachLabel.conMayusculaInicial : "Tú",
                        cuando: InjuryDateText.shortDate(u.recordedAt),
                        detalle: u.note,
                        marca: u.status?.marca
                    )
                }
            }
        }
    }
}

/// Una entrada de la línea del tiempo: qué pasó, quién y cuándo, y su nota. Un cambio de estado lleva la marca de su color.
private struct EntradaDeEvolucion: View {
    let titulo: String
    let quien: String
    let cuando: String?
    let detalle: String?
    let marca: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) { cabecera; Spacer(minLength: Theme.Spacing.s); fecha }
                VStack(alignment: .leading, spacing: 2) { cabecera; fecha }
            }
            Text(quien).papel(.nota).foregroundStyle(Theme.Color.muted)
            if let detalle, !detalle.isEmpty {
                Text(detalle)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var cabecera: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            if let marca { Circle().fill(marca).frame(width: 10, height: 10).accessibilityHidden(true) }
            Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
        }
    }

    @ViewBuilder
    private var fecha: some View {
        if let cuando { Text(cuando).papel(.nota).foregroundStyle(Theme.Color.muted) }
    }
}
