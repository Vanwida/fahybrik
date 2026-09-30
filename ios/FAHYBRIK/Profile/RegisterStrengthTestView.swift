import SwiftUI

// «REGISTRAR TEST DE FUERZA» — el atleta apunta un levantamiento y un peso × repeticiones. El backend
// calcula y guarda el 1RM (la fórmula del coach es la que manda); el «1RM estimado» de aquí es solo una
// estimación Epley al instante. Al guardar con éxito el anfitrión vuelve a pedir los máximos para que
// «Mi fuerza» lo refleje.
struct RegisterStrengthTestView: View {
    let bearer: String?
    /// FREE: the definitive value is stored by the app, not "tu coach".
    var hasCoach: Bool = true
    /// Called after a successful save so the host can re-fetch the maxes.
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var exerciseSlug: String = StrengthService.STRENGTH_LIFTS[0].slug
    @State private var weightKg: Double? = nil
    /// Empieza VACÍO, igual que el peso que tiene al lado. Un contador parado en 5 convertía un 100×3 real
    /// en un 100×5 en cuanto el atleta no lo tocaba (116,7 kg estimados en vez de 110), y ese número
    /// gobierna el % de fuerza del próximo plan.
    @State private var reps: Int? = nil
    @State private var saving = false
    @State private var errorText: String? = nil

    private let repsRange = 1...20
    private var canSave: Bool {
        (weightKg ?? 0) > 0 && reps.map(repsRange.contains) == true && !saving
    }

    /// «≈ 117 kg»: la estimación al instante, o nil hasta que los datos valen.
    private var estimatePreview: String? {
        guard let w = weightKg, w > 0, let reps, repsRange.contains(reps) else { return nil }
        let est = StrengthService.estimatedOneRm(weightKg: w, reps: reps)
        return "≈ \(Formato.esDecimal(est)) kg"
    }

    /// Lo que falta para que haya estimación, dicho como el acto que lo llena (§6.2 bis). Nil cuando ya se puede.
    private var estimateMissing: String? {
        if let reps, !repsRange.contains(reps) {
            return "Las repeticiones van de \(repsRange.lowerBound) a \(repsRange.upperBound)"
        }
        switch ((weightKg ?? 0) <= 0, reps == nil) {
        case (true, true):   return "Escribe el peso y las repeticiones"
        case (true, false):  return "Escribe el peso que moviste"
        case (false, true):  return "Escribe cuántas repeticiones hiciste"
        case (false, false): return nil
        }
    }

    var body: some View {
        PantallaPerfil(titulo: "Registrar fuerza", cierre: .cancelar, cierreActivo: !saving) {
            seccion("Levantamiento") {
                SelectorDeOpcionesPerfil(
                    opciones: StrengthService.STRENGTH_LIFTS.map { (clave: $0.slug, titulo: $0.label) },
                    elegida: $exerciseSlug
                )
            }
            seccion("Resultado del test") {
                GrupoPerfil {
                    CampoNumeroPerfil(etiqueta: "Peso levantado", unidad: "kg", valor: $weightKg)
                    CampoEnteroPerfil(etiqueta: "Repeticiones", valor: $reps)
                }
                NotaPerfil("El peso máximo que moviste y cuántas repeticiones limpias hiciste. Con eso estimamos tu 1RM.")
            }
            seccion("1RM estimado") {
                // Hasta que no están los dos datos no hay 1RM que estimar: en vez de una raya, la línea
                // dice qué falta por escribir.
                if let preview = estimatePreview {
                    Text(preview).papel(.dato).foregroundStyle(Theme.Color.foreground)
                } else if let missing = estimateMissing {
                    Text(missing).papel(.cuerpo).foregroundStyle(Theme.Color.muted)
                }
                NotaPerfil(
                    hasCoach
                        ? "Estimación Epley al momento. Tu coach guarda el valor definitivo (puede usar otra fórmula)."
                        : "Estimación al momento. El valor definitivo se calcula al guardar."
                )
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
        guard let bearer, let w = weightKg, w > 0,
              let reps, repsRange.contains(reps), !saving else { return }
        saving = true
        errorText = nil
        Task {
            do {
                _ = try await StrengthService.submitTest(
                    exerciseSlug: exerciseSlug,
                    weightKg: w,
                    reps: reps,
                    bearer: bearer
                )
                await onSaved()
                dismiss()
            } catch {
                errorText = "No pudimos guardar el test. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
    }
}
