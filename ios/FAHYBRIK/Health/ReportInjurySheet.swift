import SwiftUI

// «REPORTAR MOLESTIA» — el atleta registra un episodio nuevo. Los campos casan 1:1 con el subconjunto del diálogo de
// registro del coach que ve el atleta: Zona (obligatoria) · Gravedad (obligatoria, «Leve» por defecto) · ¿Desde
// cuándo? (hoy por defecto) · una nota libre para el coach.

struct ReportInjurySheet: View {
    let bearer: String?
    let coachName: String?
    /// FREE: the note is the athlete's own record, not a message to a coach.
    var hasCoach: Bool = true
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var zone: InjuryZone? = nil
    @State private var severity: InjurySeverity = .leve
    @State private var onsetDate: Date = Date()
    @State private var note: String = ""
    @State private var saving = false
    @State private var errorText: String? = nil

    private var canSave: Bool { zone != nil }
    private var coachLabel: String { etiquetaDeCoach(coachName) }

    var body: some View {
        PantallaPerfil(titulo: "Reportar molestia", cierre: .cancelar, cierreActivo: !saving) {
            campo("Zona", obligatorio: true) {
                SelectorDeOpcionesPerfil(
                    opciones: InjuryZone.allCases.map { (clave: $0, titulo: $0.label) },
                    elegidaOpcional: $zone
                )
            }
            campo("Gravedad", obligatorio: true) {
                SelectorDeOpcionesPerfil(
                    opciones: InjurySeverity.allCases.map { (clave: $0, titulo: $0.label) },
                    elegida: $severity
                )
            }
            campo("¿Desde cuándo?") {
                GrupoPerfil {
                    DatePicker(selection: $onsetDate, in: ...Date(), displayedComponents: .date) {
                        Text("Fecha").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    }
                    .datePickerStyle(.compact)
                    .tint(Theme.Color.accentText)
                    .accessibilityLabel("Fecha de inicio de la molestia")
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.s)
                    .frame(minHeight: Theme.Size.toque + Theme.Spacing.m)
                }
                NotaPerfil("Si no lo sabes exacto, déjalo en hoy.")
            }
            campo(hasCoach ? "Cuéntale a \(coachLabel)" : "Apunta lo que notas") {
                GrupoPerfil {
                    NotaEditorPerfil(text: $note, placeholder: "Cómo empezó, qué notas, qué lo empeora… (opcional)")
                }
            }
            if let errorText { AvisoEnLineaPerfil(tono: .peligro, texto: errorText) }
        } pie: {
            AccionAncladaPerfil(titulo: saving ? "Enviando…" : "Enviar", enCurso: saving, habilitada: canSave, accion: send)
        }
        .interactiveDismissDisabled(saving)
    }

    private func campo<Contenido: View>(
        _ titulo: String,
        obligatorio: Bool = false,
        @ViewBuilder _ contenido: () -> Contenido
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo) {
                if obligatorio { InfoPill(text: "Obligatorio", estilo: .acento) }
            }
            contenido()
        }
    }

    private func send() {
        guard let bearer, let zone, !saving else { return }
        saving = true
        errorText = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = InjuryCreateBody(
            zone: zone,
            severity: severity,
            onsetDate: InjuryDateText.wireDate(onsetDate),
            note: trimmed.isEmpty ? nil : trimmed
        )
        Task { @MainActor in
            do {
                _ = try await InjuryService.report(bearer: bearer, body: body)
                Haptics.success()
                await onSaved()
                dismiss()
            } catch {
                Haptics.error()
                errorText = "No pudimos enviar tu reporte. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
    }
}
