import SwiftUI

// ESTADO DEL HISTÓRICO DE SALUD — debajo de la fila de Apple Salud, NO un segundo
// botón de conexión.
//
// ESTÁNDAR DE MERCADO (Whoop / Strava / TrainingPeaks): un solo control enciende
// Apple Salud. El histórico se arranca al conectar (ver ProfileView.connectAppleHealth).
// Esta pieza solo DICE qué está pasando: importando, a medias, listo o error.
//
// «Continuar» solo aparece si el barrido se cortó (red, 401…). No es un segundo
// «sincronizar»: es retomar lo ya consentido al conectar.

struct HealthHistoryImportPanel: View {
    let athleteId: String?

    /// Solo tests de render: pinta estados sin el singleton real.
    var importerForTesting: HealthKitHistoryImporter? = nil

    private var importer: HealthKitHistoryImporter {
        importerForTesting ?? HealthKitHistoryImporter.shared
    }

    var body: some View {
        Group {
            // Sin consentimiento y sin barrido: el padre aún no ha arrancado (o la
            // conexión se acaba de encender). No pintamos un botón de oferta.
            if importer.state.isComplete {
                done(importer.state)
            } else if importer.running {
                inProgress
            } else if importer.state.hasConsent {
                resumable
            }
        }
        .onAppear {
            if importerForTesting == nil { importer.rebind(athleteId: athleteId) }
        }
    }

    // MARK: - Estados visibles

    private var inProgress: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(importer.currentYear.map { "Importando histórico \($0)…" } ?? "Importando histórico…")
                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.accentText)
                .monospacedDigit()
                .accessibilityLabel(
                    "Importando tu histórico, \(Int((importer.progress * 100).rounded())) por ciento"
                )
            progressBar(importer.progress)
            Button {
                Haptics.light()
                importer.stop()
            } label: {
                Text("Detener")
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Para la importación. Podrás continuar donde se quedó.")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var resumable: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let error = importer.lastError {
                Text(error)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.warning)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(reachedLine ?? "El histórico se quedó a medias.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            progressBar(importer.progress)
            Button {
                Haptics.light()
                importer.resumeIfConsented()
            } label: {
                Text("Continuar importación")
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Retoma el histórico donde se quedó.")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func done(_ state: HealthHistoryImportState) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
                .accessibilityHidden(true)
            Text(doneLine(state))
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Piezas

    private func progressBar(_ value: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.surfaceSunken)
                Capsule()
                    .fill(Theme.Color.accent)
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }

    private var reachedLine: String? {
        guard let reached = importer.reachedBack else { return nil }
        return "Histórico: vamos por \(Self.monthYear.string(from: reached))."
    }

    private func doneLine(_ state: HealthHistoryImportState) -> String {
        guard let reached = state.cursor else { return "Histórico importado." }
        return "Histórico hasta \(Self.monthYear.string(from: reached))."
    }

    private static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return f
    }()
}
