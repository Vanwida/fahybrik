import SwiftUI
import ARKit
import RealityKit

// Photo food capture. ARKit gives us the camera frame; we ship the JPEG to the
// backend vision endpoint (POST …/nutrition/photo) which returns estimated
// items (name + absolute macros + confidence). The athlete reviews the
// estimates, deselects any that are wrong, and confirms → one POST per kept
// item with source="photo".
//
// If the server has no vision model configured it returns 501
// (vision_not_configured); we surface an honest "Foto-IA no disponible aún"
// state and offer manual entry.
//
// Branding: Theme.Color.accent (Fabrik orange) — no purple/sparkles AI cliché.
// Camera permission copy lives in project.yml NSCameraUsageDescription.
struct FoodScannerView: View {
    @StateObject private var model = FoodScannerModel()
    @Environment(\.dismiss) private var dismiss
    @State private var showManual: Bool = false

    var body: some View {
        ZStack {
            ARFoodScannerRepresentable(model: model)
                .ignoresSafeArea()

            VStack {
                topBar
                Spacer()
                bottomPanel
            }
        }
        .statusBarHidden(true)
        .sheet(isPresented: $showManual) {
            FoodSearchView(source: .manual) {
                showManual = false
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
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
    }

    @ViewBuilder
    private var bottomPanel: some View {
        if model.unavailable {
            unavailableCard
        } else if !model.results.isEmpty {
            resultsCard
        } else if model.isProcessing {
            processingCard
        } else {
            captureCard
        }
    }

    private var captureCard: some View {
        VStack(spacing: 12) {
            if let err = model.errorMessage {
                Text(err)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Capsule())
            } else {
                Text("Centra el plato en el encuadre")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Capsule())
            }

            Button {
                Haptics.light()
                Task { await model.captureAndAnalyze() }
            } label: {
                ZStack {
                    Circle()
                        .stroke(.white, lineWidth: 4)
                        .frame(width: 76, height: 76)
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 60, height: 60)
                    Image(systemName: "camera.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .accessibilityLabel("Capturar foto")
        }
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var processingCard: some View {
        VStack(spacing: 10) {
            ProgressView()
                .tint(.white)
                .scaleEffect(1.2)
            Text("Analizando con IA…")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(Color.black.opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var unavailableCard: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.metering.unknown")
                .font(.system(size: 26))
                .foregroundStyle(.white)
            Text("Foto-IA no disponible aún")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
            Text("Aún no hemos activado el análisis por foto. Puedes añadir la comida manualmente.")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
            Button {
                Haptics.light()
                showManual = true
            } label: {
                Text("Añadir manual")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var resultsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Estimación IA")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                MonoText(text: "revisa y confirma", size: 10, color: .white.opacity(0.7))
            }
            VStack(spacing: 8) {
                ForEach(model.results) { item in
                    itemRow(item)
                }
            }
            HStack(spacing: 12) {
                Button {
                    Haptics.light()
                    model.reset()
                } label: {
                    Text("Repetir")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Color.white.opacity(0.18))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                Button {
                    Haptics.light()
                    Task {
                        let ok = await model.confirmSelected()
                        if ok { dismiss() }
                    }
                } label: {
                    HStack {
                        if model.isSaving { ProgressView().tint(Theme.Color.accentOn) }
                        Text("Añadir \(model.selectedCount)")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(model.selectedCount > 0 ? Theme.Color.accent : Theme.Color.accent.opacity(0.4))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .disabled(model.selectedCount == 0 || model.isSaving)
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private func itemRow(_ item: FoodScannerModel.EstimatedItem) -> some View {
        Button {
            Haptics.light()
            model.toggle(item.id)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: item.selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(item.selected ? Theme.Color.accent : .white.opacity(0.5))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.food.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    MonoText(
                        text: "\(Int(item.food.kcal)) kcal · P\(Int(item.food.proteinG)) C\(Int(item.food.carbsG)) G\(Int(item.food.fatG))",
                        size: 10,
                        color: .white.opacity(0.75)
                    )
                }
                Spacer()
                if let conf = item.food.confidence {
                    Text("\(Int(conf * 100))%")
                        .font(.system(size: 11, weight: .bold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("\(item.food.name), \(item.selected ? "seleccionado" : "no seleccionado")")
    }
}

// MARK: - ViewModel

@MainActor
final class FoodScannerModel: ObservableObject {
    struct EstimatedItem: Identifiable {
        let food: PhotoFoodItem
        var selected: Bool
        var id: String { food.id }
    }

    @Published var isProcessing: Bool = false
    @Published var isSaving: Bool = false
    @Published var results: [EstimatedItem] = []
    @Published var unavailable: Bool = false
    @Published var errorMessage: String? = nil

    weak var arView: ARView?

    var selectedCount: Int { results.filter { $0.selected }.count }

    func toggle(_ id: String) {
        guard let idx = results.firstIndex(where: { $0.id == id }) else { return }
        results[idx].selected.toggle()
    }

    func captureAndAnalyze() async {
        guard let arView = arView, let frame = arView.session.currentFrame else {
            errorMessage = "Cámara no lista. Intenta de nuevo."
            return
        }
        errorMessage = nil
        isProcessing = true
        defer { isProcessing = false }

        let pixelBuffer = frame.capturedImage
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent),
              let imageData = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.8) else {
            errorMessage = "No se pudo procesar la imagen."
            return
        }

        do {
            let items = try await NutritionService.shared.analyzePhoto(imageData: imageData)
            if items.isEmpty {
                errorMessage = "No se reconoció comida — prueba con mejor luz."
            } else {
                results = items.map { EstimatedItem(food: $0, selected: true) }
                Haptics.light()
            }
        } catch is NutritionPhotoUnavailable {
            unavailable = true
        } catch {
            errorMessage = "No se pudo estimar — inténtalo de nuevo."
        }
    }

    /// POST one entry per selected item (source="photo"). Returns true only if
    /// every selected item saved successfully.
    func confirmSelected() async -> Bool {
        let selected = results.filter { $0.selected }
        guard !selected.isEmpty else { return false }
        isSaving = true
        defer { isSaving = false }
        var allOk = true
        for item in selected {
            let ok = await NutritionService.shared.addEntry(
                name: item.food.name,
                kcal: item.food.kcal,
                protein_g: item.food.proteinG,
                carbs_g: item.food.carbsG,
                fat_g: item.food.fatG,
                quantity: nil,
                unit: nil,
                source: .photo
            )
            allOk = allOk && ok
        }
        return allOk
    }

    func reset() {
        results = []
        errorMessage = nil
        unavailable = false
    }
}

// MARK: - ARView bridge

struct ARFoodScannerRepresentable: UIViewRepresentable {
    @ObservedObject var model: FoodScannerModel

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        DispatchQueue.main.async { model.arView = arView }

        let config = ARWorldTrackingConfiguration()
        arView.session.run(config)
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}
