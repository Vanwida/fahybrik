import SwiftUI
import AVFoundation

// EAN/UPC scan via AVFoundation. Scan → GET …/nutrition/barcode?code= → if
// found, present an editable confirmation form (FoodSearchView, source=.barcode)
// seeded with the per-100g macros for a 100g serving; the athlete adjusts the
// quantity / macros and confirms → POST. If not found, an inline card invites
// adding it manually.
//
// Camera permission copy lives in project.yml NSCameraUsageDescription.
struct BarcodeScannerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = BarcodeScannerModel()

    var body: some View {
        ZStack {
            BarcodeCameraPreview(session: model.session)
                .ignoresSafeArea()

            scanReticle

            VStack {
                topBar
                Spacer()
                if model.isLooking {
                    loadingCard
                } else if model.lastNotFound != nil {
                    notFoundCard
                } else {
                    instruction
                }
            }
        }
        .statusBarHidden(true)
        .task { await model.start() }
        .onDisappear { model.stop() }
        .sheet(item: $model.foundPrefill) { prefill in
            FoodSearchView(source: .barcode, prefill: prefill) {
                model.foundPrefill = nil
                dismiss()
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                Haptics.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Circle())
            }
            .accessibilityLabel("Cerrar")
            Spacer()
            Text("Escanear código")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.55))
                .clipShape(Capsule())
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
    }

    private var scanReticle: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Theme.Color.accent, lineWidth: 3)
            .frame(width: 280, height: 180)
            .shadow(color: Theme.Color.accent.opacity(0.6), radius: 18)
    }

    private var instruction: some View {
        Text("Apunta al código de barras del producto")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.55))
            .clipShape(Capsule())
            .padding(.bottom, Theme.Spacing.xxl)
    }

    private var loadingCard: some View {
        HStack(spacing: 10) {
            ProgressView().tint(.white)
            Text("Buscando producto…")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.7))
        .clipShape(Capsule())
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var notFoundCard: some View {
        VStack(spacing: 10) {
            Text("Producto no encontrado")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
            Text("Añádelo manualmente.")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.8))
            if let code = model.lastNotFound {
                MonoText(text: code, size: 11, color: .white.opacity(0.7))
            }
            HStack(spacing: 10) {
                Button {
                    Haptics.light()
                    model.reset()
                } label: {
                    Text("Escanear otro")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.18))
                        .clipShape(Capsule())
                }
                Button {
                    Haptics.light()
                    model.foundPrefill = FoodSearchView.Prefill(
                        barcode: model.lastNotFound
                    )
                } label: {
                    Text("Añadir manual")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
    }
}

// MARK: - ViewModel

@MainActor
final class BarcodeScannerModel: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    // When set, the confirmation form sheet appears, seeded with this prefill.
    @Published var foundPrefill: FoodSearchView.Prefill? = nil
    @Published var lastNotFound: String? = nil
    @Published var isLooking: Bool = false

    let session = AVCaptureSession()
    private var lastScanned: String? = nil
    private var lastScanAt: Date = .distantPast

    func start() async {
        guard await ensureAuthorized() else { return }
        guard !session.isRunning else { return }
        session.beginConfiguration()
        session.sessionPreset = .high
        // input
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)
        // output
        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            let supported: [AVMetadataObject.ObjectType] = [
                .ean8, .ean13, .upce, .pdf417, .qr, .code128, .code39, .code93, .itf14
            ]
            output.metadataObjectTypes = supported.filter { output.availableMetadataObjectTypes.contains($0) }
        }
        session.commitConfiguration()
        Task.detached { [session] in session.startRunning() }
    }

    func stop() {
        guard session.isRunning else { return }
        Task.detached { [session] in session.stopRunning() }
    }

    func reset() {
        foundPrefill = nil
        lastNotFound = nil
        lastScanned = nil
    }

    private func ensureAuthorized() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = obj.stringValue else { return }
        Task { @MainActor [weak self] in
            await self?.handleScan(value)
        }
    }

    private func handleScan(_ code: String) async {
        // Debounce duplicate scans within 1.5s, and don't re-scan while a
        // confirmation sheet is already up.
        if foundPrefill != nil { return }
        if code == lastScanned, Date().timeIntervalSince(lastScanAt) < 1.5 { return }
        lastScanned = code
        lastScanAt = Date()
        Haptics.light()

        isLooking = true
        defer { isLooking = false }
        let result = await NutritionService.shared.lookupBarcode(code: code)
        if let result, result.found {
            // Backend returns per-100g macros (`per` == "100g"); seed the
            // editable form for a default 100g serving — the athlete adjusts
            // quantity/macros before confirming. No fabricated values.
            lastNotFound = nil
            foundPrefill = FoodSearchView.Prefill(
                name: result.name ?? "Producto",
                kcal: result.kcal ?? 0,
                protein_g: result.proteinG ?? 0,
                carbs_g: result.carbsG ?? 0,
                fat_g: result.fatG ?? 0,
                quantity: 100,
                unit: "g",
                barcode: result.barcode ?? code,
                raw: result.raw
            )
        } else {
            lastNotFound = code
            foundPrefill = nil
        }
    }
}

// MARK: - AVCaptureSession preview bridge

struct BarcodeCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let v = PreviewUIView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {}

    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
