import SwiftUI
import PhotosUI

// Idea 1 — the 5-phase capture flow (faithful to the doc mockups):
//   1 · pick     → choose the source app + the screenshot (library or camera)
//   2 · (preview)→ the picked shot + "Leer captura"
//   3 · reading  → "Leyendo…" scan over the image
//   4·5 · review → auto-filled, EDITABLE fields (Detectado = leído, Revisar =
//                  a mirar) + "Confirmar y guardar" → the honest-logging path.
//
// Reachable from the done-workout detail ("Subir captura de otra app") and from a
// not-done session's brief ("Registrar con captura"). It owns no plan state — it
// just reads → reviews → confirms, then hands back via `onSaved`.
//
// La piel es la del kit de «El día»: el marco de hoja (título, cierre y la acción anclada de cada fase),
// chips y campos del kit. La revisión (campos editables) vive en `WorkoutCaptureReview.swift`.
struct WorkoutCaptureView: View {
    let assignmentId: String
    let sessionTitle: String?
    let bearer: String?
    let onClose: () -> Void
    /// Fired after a successful confirm — the caller refreshes its plan/detail so
    /// the day flips to HECHO and the coach signal lands.
    let onSaved: () -> Void

    enum Phase { case pick, reading, review, unavailable, failed }

    @State private var phase: Phase = .pick
    @State private var selectedApp: CaptureApp? = nil
    @State private var pickedItem: PhotosPickerItem? = nil
    @State private var image: UIImage? = nil
    @State private var imageData: Data? = nil
    @State private var model: CaptureReviewModel? = nil
    @State private var isSaving = false
    @State private var showCamera = false
    @State private var showLibrary = false

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    /// La acción anclada existe solo donde hay algo que hacer: leer la foto elegida o confirmar la revisión.
    private var hasAnchoredAction: Bool {
        switch phase {
        case .pick:   return image != nil
        case .review: return model != nil
        default:      return false
        }
    }

    var body: some View {
        MarcoDeHojaDia(phaseTitle, cerrar: onClose, conAccion: hasAnchoredAction) {
            switch phase {
            case .pick:        pickPhase
            case .reading:     readingPhase
            case .review:      reviewPhase
            case .unavailable: unavailablePhase
            case .failed:      failedPhase
            }
        } accion: {
            anchoredAction
        }
        .onChange(of: pickedItem) { _, item in loadPicked(item) }
        .photosPicker(isPresented: $showLibrary, selection: $pickedItem, matching: .images, photoLibrary: .shared())
        .sheet(isPresented: $showCamera) {
            CameraPicker { ui in handlePicked(ui) }
                .ignoresSafeArea()
        }
    }

    private var phaseTitle: String {
        switch phase {
        case .pick, .unavailable, .failed: return "Subir captura"
        case .reading:                     return "Leyendo captura"
        case .review:                      return "Revisar y guardar"
        }
    }

    @ViewBuilder
    private var anchoredAction: some View {
        switch phase {
        case .pick:
            BotonAccionDia(hoja: "Leer captura", ocupado: false, textoOcupado: "Leyendo…", voz: "Leyendo captura", accion: startReading)
        case .review:
            BotonAccionDia(hoja: "Confirmar y guardar", ocupado: isSaving, textoOcupado: "Guardando…", voz: "Guardando", accion: confirm)
            Text("Nada se guarda hasta que confirmas. Marca la sesión como hecha y le llega al coach.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        default:
            EmptyView()
        }
    }

    // MARK: - Phase 1·2 — pick source + screenshot

    private var pickPhase: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            if let sessionTitle {
                Text(sessionTitle)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text("Entrenaste fuera y no llevabas el reloj conectado. Sube la foto del resumen de tu app y la leemos por ti.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)

            sourceChips

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .frame(maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                            .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
                    )
                    .accessibilityLabel("Captura elegida")
            } else {
                dropzone
            }
            pickButtons
        }
    }

    private var sourceChips: some View {
        FilaChipsDia("¿De qué app?") {
            ForEach(CaptureApp.allCases) { app in
                ChipFiltroDia(texto: app.label, elegido: selectedApp == app) {
                    selectedApp = selectedApp == app ? nil : app
                }
            }
        }
    }

    private var dropzone: some View {
        VStack(spacing: Theme.Spacing.s) {
            IconoDia(.foto, tam: 32, peso: .regular)
                .foregroundStyle(Theme.Color.muted)
            Text("Sube la foto del resumen")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            Text("Tiempo, distancia, ritmo y parciales: los colocamos en su sitio.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, Theme.Spacing.xl)
        .padding(.horizontal, Theme.Spacing.l)
        .tarjetaDia(alAncho: true)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var pickButtons: some View {
        VStack(spacing: Theme.Spacing.xs) {
            if image == nil {
                BotonAccionDia("Elegir captura", glifo: .foto, relleno: .acento, completa: true, glifoAlFinal: false) {
                    showLibrary = true
                }
            } else {
                BotonTextoDia("Elegir otra foto", tono: .tinta, centrado: true, accion: { showLibrary = true }) {
                    IconoDia(.foto, tam: 20)
                }
            }
            if cameraAvailable {
                BotonTextoDia("Hacer foto", tono: .tinta, centrado: true, accion: { showCamera = true }) {
                    IconoDia(.camara, tam: 20)
                }
            }
        }
    }

    // MARK: - Phase 3 — reading (scan over the image)

    private var readingPhase: some View {
        VStack(spacing: Theme.Spacing.l) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                    .overlay(ScanOverlay())
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                    .accessibilityHidden(true)
            }
            VStack(spacing: Theme.Spacing.s) {
                HStack(spacing: Theme.Spacing.s) {
                    ProgressView().tint(Theme.Color.accent)
                    Text("Leyendo resultado…")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                }
                Text("Cruzamos lo que pedía el entreno con lo que muestra la foto. No cierres.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.l)
    }

    // MARK: - Phase 4·5 — review (editable, honest)

    @ViewBuilder
    private var reviewPhase: some View {
        if let model {
            CaptureReviewBody(model: model)
        }
    }

    // MARK: - 501 / failure

    private var unavailablePhase: some View {
        SujetoDia(tono: .neutro, etiqueta: "Lectura por foto no disponible aún. Todavía no hemos activado la lectura por IA. Puedes registrar el entreno a mano.") {
            KickerDia("Subir captura")
            TituloDia("Lectura por foto no disponible aún")
            ApoyoDia("Todavía no hemos activado la lectura por IA. Puedes registrar el entreno a mano.")
        } abajo: {
            BotonAccionDia("Entendido", glifo: .check, accion: onClose)
        }
    }

    private var failedPhase: some View {
        VStack(spacing: Theme.Spacing.s) {
            SujetoErrorDia(
                kicker: "Subir captura",
                titulo: "No pudimos leer la captura",
                apoyo: "Prueba con una foto más nítida del resumen, o revisa tu conexión.",
                alReintentar: { phase = .pick }
            )
            BotonTextoDia("Cerrar", tono: .suave, centrado: true, accion: onClose)
        }
    }

    // MARK: - Actions

    private func loadPicked(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let ui = UIImage(data: data) else { return }
            await MainActor.run { handlePicked(ui) }
        }
    }

    private func handlePicked(_ ui: UIImage) {
        let normalized = Self.normalized(ui)
        image = normalized
        imageData = normalized.jpegData(compressionQuality: 0.82)
        Haptics.light()
    }

    private func startReading() {
        guard let imageData else { return }
        Haptics.medium()
        phase = .reading
        Task {
            do {
                let proposal = try await WorkoutVisionAPI.read(
                    assignmentId: assignmentId,
                    imageData: imageData,
                    app: selectedApp,
                    bearer: bearer
                )
                await MainActor.run {
                    model = CaptureReviewModel(proposal: proposal)
                    phase = .review
                    Haptics.light()
                }
            } catch is WorkoutVisionAPI.VisionUnavailable {
                await MainActor.run { phase = .unavailable }
            } catch {
                await MainActor.run { phase = .failed }
            }
        }
    }

    private func confirm() {
        guard let model, !isSaving else { return }
        isSaving = true
        let payload = model.buildPayload(assignmentId: assignmentId, app: selectedApp)
        Task {
            await WorkoutVisionAPI.confirm(payload, bearer: bearer)
            await MainActor.run {
                Haptics.heavy()
                onSaved()
            }
        }
    }

    // Re-encode to a bounded JPEG (≤ ~2000px) so the upload stays under the
    // backend's 10 MB cap, the mime is always allowed, and HEIC is normalised.
    private static func normalized(_ ui: UIImage) -> UIImage {
        let maxDim: CGFloat = 2000
        let longest = max(ui.size.width, ui.size.height)
        guard longest > maxDim else { return ui }
        let scale = maxDim / longest
        let target = CGSize(width: ui.size.width * scale, height: ui.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            ui.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

// MARK: - The scan line over the picked shot

private struct ScanOverlay: View {
    @State private var phase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.Color.background.opacity(0.45)
                Rectangle()
                    .fill(
                        LinearGradient(colors: [.clear, Theme.Color.accent, .clear],
                                       startPoint: .leading, endPoint: .trailing)
                    )
                    .frame(height: 2)
                    .shadow(color: Theme.Color.accent.opacity(0.6), radius: 6)
                    .offset(y: (geo.size.height - 4) * phase - (geo.size.height - 4) / 2)
            }
            .onAppear {
                guard !reduceMotion else { phase = 0.5; return }
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                    phase = 1
                }
            }
        }
    }
}

// MARK: - Camera capture (UIImagePickerController — guarded by availability)

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let ui = info[.originalImage] as? UIImage { parent.onImage(ui) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
