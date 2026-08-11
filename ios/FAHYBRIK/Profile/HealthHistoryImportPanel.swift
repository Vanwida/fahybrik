import SwiftUI

// «IMPORTAR TU HISTÓRICO» — la tarjeta que pide permiso para traerse el pasado.
//
// Vive dentro del bloque de Apple Salud de Perfil, debajo de su fila, y sólo aparece
// cuando la conexión está encendida: ofrecer traer un histórico que no se puede leer
// sería una promesa vacía.
//
// LA REGLA DE LA CASA, SIN EXCEPCIÓN: esto NUNCA se dispara solo. El barrido empieza
// porque un dedo pulsó «Importar», y una vez pulsado no se vuelve a preguntar nunca
// más — si se corta, se ofrece continuar, que no es lo mismo que volver a pedir
// permiso.
//
// El copy habla en atleta: qué se trae, para qué sirve y hasta dónde llega. Nada de
// «muestras», «backfill» ni «HealthKit».
struct HealthHistoryImportPanel: View {
    /// El atleta en sesión, para que el estado del import no se herede entre cuentas
    /// en un teléfono compartido.
    let athleteId: String?

    /// Sólo para las pruebas de render, que necesitan pintar los cuatro estados sin
    /// un HealthKit detrás. En la app siempre va nil y manda el singleton.
    var importerForTesting: HealthKitHistoryImporter? = nil

    // Propiedad calculada, no `@State`: el importador es un singleton `@Observable` y
    // el seguimiento de cambios lo hace SwiftUI al leerlo dentro del `body`. Es el
    // mismo patrón que `watchScheduler` en Perfil.
    private var importer: HealthKitHistoryImporter {
        importerForTesting ?? HealthKitHistoryImporter.shared
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            header
            body(for: importer.state)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .onAppear {
            // El singleton nace antes de que haya sesión, así que aquí es donde se
            // engancha al atleta que de verdad está dentro.
            if importerForTesting == nil { importer.rebind(athleteId: athleteId) }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .accessibilityHidden(true)
            Text("Importar tu histórico")
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    @ViewBuilder
    private func body(for state: HealthHistoryImportState) -> some View {
        if state.isComplete {
            done(state)
        } else if importer.running {
            inProgress
        } else if state.hasConsent {
            resumable
        } else {
            offer
        }
    }

    // MARK: - Los cuatro estados

    /// Sin consentir: qué se trae, para qué, y hasta dónde. Y el único toque que lo
    /// pone en marcha.
    private var offer: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Traemos tus entrenos y tu pulso de antes de tener la app, hasta dos años atrás. Así tu entrenador ve de dónde vienes desde el primer día, en vez de esperar tres meses a tener con qué compararte.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Text("Puede tardar unos minutos. Puedes seguir usando la app mientras tanto.")
                .scaledFont(10, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
            actionButton(title: "Importar mi histórico") {
                importer.consentAndStart()
            }
        }
    }

    /// En marcha: el año que va cayendo, la barra, y la salida.
    private var inProgress: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            // El estado y la barra se leen JUNTOS (la barra es la misma información,
            // dibujada), pero «Detener» se queda fuera: combinar el grupo entero lo
            // fundiría en un solo elemento y VoiceOver perdería el botón.
            Text(importer.currentYear.map { "Importando \($0)…" } ?? "Importando…")
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
    }

    /// Consentido y a medias — se paró solo o lo paró el atleta. Nunca se vuelve a
    /// pedir permiso: se ofrece seguir.
    private var resumable: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if let error = importer.lastError {
                Text(error)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.warning)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(reachedLine ?? "Se quedó a medias.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            progressBar(importer.progress)
            actionButton(title: "Continuar") { importer.resumeIfConsented() }
        }
    }

    /// Terminado. Se queda como constancia de hasta dónde se llegó, sin botón: no hay
    /// nada más que traer.
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
    }

    // MARK: - Piezas

    private func actionButton(title: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Text(title)
                .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.accentOn)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Theme.Color.accent)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Barra de progreso propia (no `ProgressView`) para que use el naranja de marca
    /// y el mismo radio que el resto de la pantalla.
    private func progressBar(_ value: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.surfaceSunken)
                Capsule()
                    .fill(Theme.Color.accent)
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }

    // MARK: - Copy con fecha

    private var reachedLine: String? {
        guard let reached = importer.reachedBack else { return nil }
        return "Vamos por \(Self.monthYear.string(from: reached)). Falta el resto."
    }

    private func doneLine(_ state: HealthHistoryImportState) -> String {
        guard let reached = state.cursor else { return "Histórico importado." }
        return "Histórico importado hasta \(Self.monthYear.string(from: reached))."
    }

    private static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return f
    }()
}
