import SwiftUI

// #34 — el paso de captura que sale cuando el atleta TERMINA un test de calibración (o toca un test con
// «resultado pendiente» en la batería). PRECARGA los números medidos en la ejecución —el tiempo en vivo de
// una contrarreloj, la serie más pesada de un 1RM— para que el atleta solo confirme o edite, y después
// los envía al PUENTE ejecución→benchmark (`TestBatteryService.recordResults`), que calibra zonas y 1RM y
// recalcula el nivel. El feedback es HONESTO: afirma solo lo que de verdad cambió («Zonas actualizadas», y
// «Nivel recalculado» SOLO cuando el puente lo reporta).
//
// Un test puede prometer varios resultados (una batería de 1RM → sentadilla + peso muerto + press banca),
// así que pinta una entrada por `StoreResultSpec`, cada una con la forma que su `measure` necesita
// (tiempo → mm:ss; carga → kg; el resto → un número).
//
// ES UNA HOJA del día (`MarcoDeHojaDia`): título, cierre de 48 pt, el cuerpo que scrollea y la acción
// anclada abajo siempre visible. La usan tres sitios —el hub (`.sheet`), el reloj (`AppShell`) y el final
// de una sesión en vivo (`WorkoutContainer`, en línea, sin hoja)— y en los tres es la misma pieza.

struct TestResultCaptureSheet: View {
    let assignmentId: String
    let specs: [StoreResultSpec]
    /// slug → valor medido en la ejecución en vivo (vacío para el aviso de «resultado pendiente» que se
    /// abre desde la tarjeta).
    var prefill: [String: Double] = [:]
    let bearer: String?
    /// Se dispara cuando el atleta termina este paso — tras guardar con éxito O tras omitirlo. Quien llama
    /// cierra el flujo y refresca la batería.
    let onDone: () -> Void

    private enum Stage: Equatable { case editing, submitting, done }

    @State private var rows: [FilaDeResultado] = []
    @State private var stage: Stage = .editing
    @State private var result: RecordBatteryResult? = nil
    @State private var errorText: String? = nil

    // La verdad de las zonas en el paso de resultado. `preThresholds` fotografía el umbral ACTUAL por
    // modalidad al abrir (lo mejor posible) para poder enseñar el cambio real; `newZoneProfiles` es la
    // relectura tras guardar (el umbral nuevo tal como lo resolvió el servidor, no una cuenta del cliente).
    @State private var preThresholds: [String: Double] = [:]
    @State private var newZoneProfiles: [ZoneModalityProfile]? = nil
    /// La superposición de «Récord del test»: sube cuando el puente reporta marcas mejoradas.
    @State private var showCelebration = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var canSave: Bool {
        bearer != nil && TestResultGating.canSave(
            entries: rows.map { (value: $0.value, isOptional: $0.isOptional) }
        )
    }

    var body: some View {
        ZStack {
            if stage == .done {
                TestResultPasoFinal(
                    result: result,
                    specs: specs,
                    newZoneProfiles: newZoneProfiles,
                    preThresholds: preThresholds,
                    onDone: onDone
                )
            } else {
                MarcoDeHojaDia("Registra tu resultado", cerrar: cierra) {
                    editingContent
                } accion: {
                    BotonAccionDia(
                        hoja: "Guardar resultado",
                        activo: canSave,
                        ocupado: stage == .submitting,
                        textoOcupado: "Guardando…",
                        voz: "Guardando resultado"
                    ) {
                        Task { await save() }
                    }
                    BotonTextoDia("Ahora no", tono: .suave, centrado: true, desactivado: stage == .submitting, accion: onDone)
                }
            }

            if showCelebration, let result {
                TestRecordCelebrationView(
                    items: TestRecordCelebrationView.items(from: result.improvedEntries, specs: specs),
                    onDone: { showCelebration = false }
                )
                .transition(.opacity)
            }
        }
        // Guardando no se cierra: ni con la ✕ ni con el gesto de bajar la hoja.
        .interactiveDismissDisabled(stage == .submitting)
        .onAppear(perform: seedRows)
        .task { await snapshotCurrentThresholds() }
    }

    /// La ✕ de la hoja: mientras se guarda no hace nada (cerrar a medias dejaría el envío en el aire).
    private func cierra() {
        guard stage != .submitting else { return }
        onDone()
    }

    // MARK: Editando

    @ViewBuilder
    private var editingContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Text("Confirma tu marca real. Fija tus zonas y tu 1RM y calibra tu plan con datos, no estimaciones.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach($rows) { $row in
                resultCard($row)
            }

            if let errorText {
                AvisoEnLineaDia(errorText)
            }

            if bearer == nil {
                Text("Inicia sesión para guardar tu resultado.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private func resultCard(_ row: Binding<FilaDeResultado>) -> some View {
        let measure = row.wrappedValue.measure
        let etiqueta = row.wrappedValue.spec.label
        return VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .center) {
                Text(etiqueta)
                    .papel(.rotulo)
                    .foregroundStyle(Theme.Color.foreground)
                if row.wrappedValue.isOptional, measure != .hrr {
                    Spacer(minLength: Theme.Spacing.s)
                    InfoPill(text: "Opcional", estilo: .neutro)
                }
            }
            if measure == .hrr {
                hrrReadout(row.wrappedValue)
            } else if measure == .time {
                TimeEntry(minText: row.minText, secText: row.secText, step: measure.step, etiqueta: etiqueta)
            } else {
                AmountEntry(
                    text: row.amountText,
                    unit: measure.unitLabel,
                    step: measure.step,
                    decimals: measure.usesDecimals,
                    etiqueta: etiqueta
                )
            }
        }
        .padding(Theme.Spacing.l + 2)
        .tarjetaDia(alAncho: true)
    }

    // La recuperación se MIDE (ventana posterior al esfuerzo), jamás se teclea: con valor sale como una
    // lectura de solo lectura; sin señal anuncia la omisión honesta — el guardado simplemente la salta.
    @ViewBuilder
    private func hrrReadout(_ row: FilaDeResultado) -> some View {
        if let value = row.value {
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                Text("−\(Int(value))")
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                Text(Vocab.ppm)
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            Text("Medido automáticamente al terminar el esfuerzo.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        } else {
            Text("Sin medición esta vez — se guarda el resto del test sin este dato.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Acciones

    private func seedRows() {
        guard rows.isEmpty else { return }
        rows = specs.map { FilaDeResultado.sembrada(spec: $0, precarga: prefill[$0.slug]) }
    }

    private func save() async {
        guard let bearer, canSave else { return }
        let entries: [TestResultEntry] = rows.compactMap { row in
            guard let v = row.value else { return nil }
            return TestResultEntry(slug: row.spec.slug, value: v)
        }
        guard !entries.isEmpty else { return }
        stage = .submitting
        errorText = nil
        do {
            let res = try await TestBatteryService.recordResults(
                assignmentId: assignmentId,
                entries: entries,
                bearer: bearer
            )
            result = res
            Haptics.success()
            stage = .done
            // Récord del test: el puente dice que se BATIÓ una marca.
            if !res.improvedEntries.isEmpty {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { showCelebration = true }
            }
            // Las zonas cambiaron → se relee el perfil resuelto por el servidor, para que la tarjeta
            // enseñe el umbral nuevo REAL (jamás una cuenta del cliente).
            if !res.zonesDerived.isEmpty {
                newZoneProfiles = try? await ZonesService.fetch(bearer: bearer).modalities
            }
        } catch {
            stage = .editing
            errorText = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."
        }
    }

    /// Fotografía el umbral ACTUAL por modalidad antes de guardar, para que la tarjeta de zonas
    /// actualizadas enseñe un cambio honesto. Lo mejor posible — sin foto, la tarjeta enseña el umbral
    /// nuevo sin cambio.
    private func snapshotCurrentThresholds() async {
        guard let bearer, preThresholds.isEmpty else { return }
        guard let profiles = try? await ZonesService.fetch(bearer: bearer).modalities else { return }
        preThresholds = Dictionary(
            profiles.compactMap { p in p.thresholdS.map { (p.modality, $0) } },
            uniquingKeysWith: { _, latest in latest }
        )
    }
}
