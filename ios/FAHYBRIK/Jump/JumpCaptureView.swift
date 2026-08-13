import SwiftUI

// Tras el briefing: graba, confirma dos fotogramas, guarda.
// No es WorkoutContainer.

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

    private enum Phase { case record, review, summary }

    private var currentKind: String { series.rawValue }
    private var seriesAttempts: [JumpDraftAttempt] {
        attempts.filter { $0.kind == currentKind }
    }
    private var keptCount: Int { seriesAttempts.filter(\.kept).count }
    private var remaining: Int { max(0, launch.attemptsWanted - seriesAttempts.count) }

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
        }
        .task { await recorder.requestAccessAndConfigure() }
        .onDisappear { recorder.teardown() }
    }

    private var recordPhase: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cerrar", action: onClose)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Text("\(series.title) · \(seriesAttempts.count + 1)/\(launch.attemptsWanted)")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(Theme.Spacing.m)

            JumpCameraPreview(session: recorder.session)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .padding(.horizontal, Theme.Spacing.m)

            VStack(spacing: Theme.Spacing.s) {
                Text("Máxima intención hacia arriba. Teléfono quieto.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                if recorder.authorizationDenied {
                    Text("Sin cámara no se puede medir. Actívala en Ajustes.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.danger)
                }
                if series == .loaded {
                    Button("No tengo la carga — solo CMJ") {
                        skipLoaded = true
                        phase = .summary
                    }
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                }
                Button {
                    Task { await toggleRecord() }
                } label: {
                    Circle()
                        .fill(recorder.isRecording ? Theme.Color.danger : Theme.Color.accent)
                        .frame(width: 72, height: 72)
                        .overlay {
                            Circle().stroke(Theme.Color.foreground.opacity(0.3), lineWidth: 3)
                        }
                }
                .accessibilityLabel(recorder.isRecording ? "Parar" : "Grabar")
                .disabled(recorder.authorizationDenied || proposing)
            }
            .padding(Theme.Spacing.l)
        }
    }

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

    private var summaryPhase: some View {
        let free = best(of: "cmj")
        let loaded = best(of: "loaded_cmj")
        return VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack {
                Button("Cerrar", action: onClose).foregroundStyle(Theme.Color.foreground)
                Spacer()
            }
            Text("Resultado")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            if let free {
                readout("CMJ", JumpPhysics.displayCm(free))
            }
            if let loaded {
                readout("Con carga", JumpPhysics.displayCm(loaded))
            }
            if let free, let loaded, let bw = launch.bodyMassKg, launch.loadKg > 0 {
                let drop = free - loaded
                let lri = (drop / free) / (launch.loadKg / bw)
                readout("LRI", String(format: "%.2f", lri).replacingOccurrences(of: ".", with: ","))
            }
            if saveFailed {
                Text("No se pudo guardar. Inténtalo de nuevo.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.danger)
            }
            Spacer()
            ExpertPrimaryButton(
                title: saving ? "GUARDANDO…" : "GUARDAR",
                height: 52,
                enabled: !saving && free != nil,
                action: { Task { await save() } }
            )
        }
        .padding(Theme.Spacing.l)
    }

    private func readout(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(Theme.Typography.body).foregroundStyle(Theme.Color.muted)
            Spacer()
            Text(value)
                .font(.system(size: 22, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private func toggleRecord() async {
        if recorder.isRecording {
            proposing = true
            defer { proposing = false }
            guard let url = await recorder.stopRecording() else { return }
            let proposal = await JumpFrameMarker.propose(url: url)
            var draft = JumpDraftAttempt(
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

    private func best(of kind: String) -> Double? {
        attempts.filter { $0.kind == kind && $0.kept }.compactMap(\.heightCm).max()
    }

    private func save() async {
        guard let bearer, let free = best(of: "cmj") else { return }
        saving = true
        saveFailed = false
        var entries = [TestResultEntry(slug: "cmj", value: free)]
        if let loaded = best(of: "loaded_cmj") {
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
            onSaved()
        } catch {
            saveFailed = true
        }
        saving = false
    }
}
