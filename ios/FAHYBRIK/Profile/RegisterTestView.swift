import SwiftUI

// «REGISTRAR TEST» — el atleta apunta el resultado de un test, y el backend lo resuelve en bandas de zona
// por el MISMO camino que usa el coach (source = athlete_test). Al guardar con éxito el anfitrión vuelve a
// pedir las zonas para que «Mis zonas» lo refleje. La unidad del ritmo es intrínseca a la modalidad (correr
// → /km, ergo → /500 m): el atleta solo elige la modalidad y escribe el ritmo umbral, nunca una unidad.
struct RegisterTestView: View {
    let bearer: String?
    /// Called after a successful save so the host can re-fetch the zones.
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var modality: String = "run"
    @State private var thresholdSeconds: Int? = nil
    @State private var saving = false
    @State private var errorText: String? = nil

    // run → /km; row/ski/bike → /500m. Mirrors paceUnitForModality on the backend.
    private static let modalities: [(clave: String, titulo: String)] = [
        ("run", "Carrera"), ("row", "Remo"), ("ski", "Ski-Erg"), ("bike", "Bike-Erg"),
    ]
    private var paceUnitLabel: String { modality == "run" ? Formato.UnidadRitmo.porKm.rawValue : Formato.UnidadRitmo.por500m.rawValue }
    private var canSave: Bool { (thresholdSeconds ?? 0) > 0 && !saving }

    var body: some View {
        PantallaPerfil(titulo: "Registrar test", cierre: .cancelar, cierreActivo: !saving) {
            seccion("Modalidad") {
                SelectorDeOpcionesPerfil(opciones: Self.modalities, elegida: $modality)
            }
            seccion("Resultado del test") {
                GrupoPerfil { CampoRitmoPerfil(etiqueta: "Ritmo umbral (\(paceUnitLabel))", segundos: $thresholdSeconds) }
                NotaPerfil("Tu ritmo medio sostenible en el test (umbral). Con él calculamos tus 6 bandas.")
            }
            if let errorText {
                AvisoEnLineaPerfil(tono: .peligro, texto: errorText)
            }
        } pie: {
            AccionAncladaPerfil(titulo: saving ? "Guardando…" : "Guardar test", enCurso: saving, habilitada: canSave, accion: save)
        }
        .interactiveDismissDisabled(saving)
        .compactSheet()
    }

    private func seccion<Contenido: View>(_ titulo: String, @ViewBuilder _ contenido: () -> Contenido) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            contenido()
        }
    }

    private func save() {
        guard let bearer, let seconds = thresholdSeconds, seconds > 0, !saving else { return }
        saving = true
        errorText = nil
        Task {
            do {
                try await ZonesService.submitTest(modality: modality, thresholdS: seconds, bearer: bearer)
                await onSaved()
                dismiss()
            } catch {
                errorText = "No pudimos guardar el test. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
    }
}
