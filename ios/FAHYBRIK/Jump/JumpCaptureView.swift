import SwiftUI

// Tras el briefing: graba, confirma dos fotogramas, guarda.
// No es WorkoutContainer (que lo monta, sin cambiarlo, cuando la sesión programada ES un salto).
//
// TRES FASES, una pantalla cada una:
//   · grabar   — la cámara manda; el disparador es lo único que pesa.
//   · revisar  — `JumpReviewView`: el vídeo, la altura y el ajuste de los dos fotogramas.
//   · resumen  — lo conservado (`ResumenDeSalto`) y el guardado; al guardar, el informe.

struct JumpLaunch: Identifiable {
    let id: String
    let assignmentId: String
    let includeLoaded: Bool
    let loadKg: Double
    let bodyMassKg: Double?
    let attemptsWanted: Int
}

struct JumpCaptureView: View {
    let launch: JumpLaunch
    let bearer: String?
    var onClose: () -> Void
    var onSaved: () -> Void

    @StateObject private var recorder = JumpRecorder()
    @State private var series: JumpSeries = .cmj
    @State private var attempts: [JumpDraftAttempt] = []
    @State private var phase: Phase = .record
    @State private var reviewing: JumpDraftAttempt?
    @State private var frameCount = 1
    @State private var proposing = false
    @State private var saving = false
    @State private var saveFailed = false
    @State private var skipLoaded = false
    @State private var savedReport: JumpProfileDTO?

    private enum Phase { case record, review, summary }

    private var currentKind: String { series.rawValue }
    private var seriesAttempts: [JumpDraftAttempt] {
        attempts.filter { $0.kind == currentKind }
    }
    private var resumen: ResumenDeSalto {
        .de(intentos: attempts, loadKg: launch.loadKg, bodyMassKg: launch.bodyMassKg)
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            switch phase {
            case .record: recordPhase
            case .review:
                if let _ = reviewing {
                    reviewPhase
                }
            case .summary: summaryPhase
            }
            if let report = savedReport {
                JumpReportView(
                    report: CmjReportDTO.thin(
                        title: "Perfil de salto",
                        dateLabel: "Hoy",
                        profile: report,
                        bodyMassKg: launch.bodyMassKg
                    ),
                    onClose: onSaved
                )
            }
        }
        .task { await recorder.requestAccessAndConfigure() }
        .onDisappear { recorder.teardown() }
    }

    // MARK: - Grabar

    private var recordPhase: some View {
        VStack(spacing: 0) {
            HStack(spacing: Theme.Spacing.s) {
                InfoPill(text: "\(series.title) · \(seriesAttempts.count + 1)/\(launch.attemptsWanted)", estilo: .velo)
                Spacer(minLength: 0)
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: onClose)
            }
            .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.s, trailing: Theme.Spacing.s))

            JumpCameraPreview(session: recorder.session)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
                .padding(.horizontal, Theme.Spacing.pantalla)
                .accessibilityHidden(true)

            VStack(spacing: Theme.Spacing.s) {
                Text("Máxima intención hacia arriba. Teléfono quieto.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                if recorder.authorizationDenied {
                    AvisoEnLineaTests("Sin cámara no se puede medir. Actívala en Ajustes.") {
                        BotonTextoTests("Abrir Ajustes", tono: .tinta, accion: abreAjustes)
                    }
                }
                if series == .loaded {
                    BotonTextoTests("No tengo la carga — solo CMJ", tono: .suave, centrado: true) {
                        skipLoaded = true
                        phase = .summary
                    }
                }
                disparador
            }
            .padding(EdgeInsets(top: Theme.Spacing.l, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.l, trailing: Theme.Spacing.pantalla))
        }
    }

    /// El disparador. Grabando, el círculo pasa a un cuadrado —«parar»— además de a rojo: el estado no
    /// depende del color (§4.2).
    private var disparador: some View {
        Button {
            Task { await toggleRecord() }
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Theme.Color.foreground.opacity(0.3), lineWidth: 3)
                    .frame(width: 76, height: 76)
                if recorder.isRecording {
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .fill(Theme.Color.danger)
                        .frame(width: 30, height: 30)
                } else {
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 60, height: 60)
                }
            }
            .frame(width: 84, height: 84)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .accessibilityLabel(recorder.isRecording ? "Parar" : "Grabar")
        .disabled(recorder.authorizationDenied || proposing)
    }

    /// Sin permiso de cámara la salida es Ajustes, donde se concede: un aviso sin salida es una pared.
    private func abreAjustes() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - Revisar

    private var reviewPhase: some View {
        Group {
            if let draft = reviewing, let url = draft.clipURL {
                JumpReviewView(
                    url: url,
                    fps: draft.fps,
                    frameCount: frameCount,
                    takeoff: Binding(
                        get: { reviewing?.takeoffFrame ?? 0 },
                        set: { reviewing?.takeoffFrame = $0 }
                    ),
                    landing: Binding(
                        get: { reviewing?.landingFrame ?? 1 },
                        set: { reviewing?.landingFrame = $0 }
                    ),
                    quality: Binding(
                        get: { reviewing?.quality ?? "ok" },
                        set: { reviewing?.quality = $0 }
                    ),
                    onKeep: { finishReview(kept: true) },
                    onDiscard: { finishReview(kept: false) }
                )
            }
        }
    }

    // MARK: - Resumen

    private var summaryPhase: some View {
        let r = resumen
        return VStack(spacing: 0) {
            HStack(spacing: Theme.Spacing.s) {
                Text("Resultado")
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: onClose)
            }
            .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.s, trailing: Theme.Spacing.s))

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    // Sin ningún salto conservado no hay resultado que enseñar, y se dice.
                    if r.libreCm == nil {
                        Text("Aún no hay ningún salto conservado. Vuelve a grabar para tener resultado.")
                            .papel(.cuerpo)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    lecturas(r)
                    if saveFailed {
                        AvisoEnLineaTests("No se pudo guardar. Inténtalo de nuevo.")
                    }
                }
                .padding(EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xxl, trailing: Theme.Spacing.pantalla))
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .anchoredAction {
            BotonAccionTests(
                "Guardar",
                completa: true,
                alto: Theme.Size.accion,
                estado: saving ? .ocupado(texto: "Guardando…", voz: "Guardando el resultado") : (r.libreCm != nil ? .normal : .inactivo)
            ) {
                Task { await save() }
            }
            // El pie ancla con 16 y el margen de las pantallas del día es 20: los 4 restantes van dentro.
            .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
        }
    }

    private struct Lectura: Identifiable {
        let rotulo: String
        let cifra: String
        let unidad: String?
        var id: String { rotulo }
        var etiqueta: String { unidad.map { "\(rotulo): \(cifra) \($0)" } ?? "\(rotulo): \(cifra)" }
    }

    /// Las cifras del resumen: teselas de dos en dos, todas del mismo peso (son pruebas, no protagonistas).
    @ViewBuilder
    private func lecturas(_ r: ResumenDeSalto) -> some View {
        let todas: [Lectura] = [
            r.libreCm.map { Lectura(rotulo: "CMJ", cifra: "\(Int($0.rounded()))", unidad: "cm") },
            r.cargadoCm.map { Lectura(rotulo: "Con carga", cifra: "\(Int($0.rounded()))", unidad: "cm") },
            r.lri.map { Lectura(rotulo: "LRI", cifra: ResumenDeSalto.textoLri($0), unidad: nil) },
        ].compactMap { $0 }
        ForEach(Array(stride(from: 0, to: todas.count, by: 2)), id: \.self) { i in
            TeselasDia {
                ForEach(Array(todas[i..<min(i + 2, todas.count)])) { t in
                    TeselaDia(rotulo: t.rotulo, etiqueta: t.etiqueta) {
                        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs + 2) {
                            Text(t.cifra).papel(.dato).foregroundStyle(Theme.Color.foreground)
                            if let unidad = t.unidad {
                                Text(unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Lógica (sin cambios)

    private func toggleRecord() async {
        if recorder.isRecording {
            proposing = true
            defer { proposing = false }
            guard let url = await recorder.stopRecording() else { return }
            let proposal = await JumpFrameMarker.propose(url: url)
            let draft = JumpDraftAttempt(
                kind: currentKind,
                takeoffFrame: proposal.takeoff,
                landingFrame: proposal.landing,
                fps: proposal.fps,
                quality: proposal.quality,
                kept: true,
                clipURL: url
            )
            frameCount = proposal.frameCount
            reviewing = draft
            phase = .review
        } else {
            recorder.startRecording()
        }
    }

    private func finishReview(kept: Bool) {
        guard var draft = reviewing else { return }
        draft.kept = kept
        if !kept { draft.quality = "discarded" }
        attempts.append(draft)
        reviewing = nil
        advance()
    }

    private func advance() {
        if seriesAttempts.count >= launch.attemptsWanted {
            if series == .cmj, launch.includeLoaded, !skipLoaded {
                series = .loaded
                phase = .record
                return
            }
            phase = .summary
            return
        }
        phase = .record
    }

    private func save() async {
        let r = resumen
        guard let bearer, let free = r.libreCm else { return }
        saving = true
        saveFailed = false
        var entries = [TestResultEntry(slug: "cmj", value: free)]
        if let loaded = r.cargadoCm {
            entries.append(TestResultEntry(slug: "cmj_loaded", value: loaded))
        }
        let wire = attempts.map {
            JumpAttemptWire(
                kind: $0.kind,
                takeoffFrame: $0.takeoffFrame,
                landingFrame: $0.landingFrame,
                fps: $0.fps,
                quality: $0.quality,
                kept: $0.kept
            )
        }
        do {
            CompletedAssignmentsStore.markCompleted(launch.assignmentId)
            _ = try await TestBatteryService.recordJumpResults(
                assignmentId: launch.assignmentId,
                body: JumpResultsBody(
                    results: entries,
                    bodyMassKg: launch.bodyMassKg,
                    loadKg: launch.includeLoaded ? launch.loadKg : nil,
                    attempts: wire
                ),
                bearer: bearer
            )
            savedReport = JumpProfileDTO.from(
                unloaded: free,
                loaded: r.cargadoCm,
                loadKg: launch.includeLoaded ? launch.loadKg : nil,
                bodyMassKg: launch.bodyMassKg
            )
        } catch {
            saveFailed = true
        }
        saving = false
    }
}
