import SwiftUI
import PhotosUI

// Idea 1 — the 5-phase capture flow (faithful to the doc mockups):
//   1 · pick     → choose the source app + the screenshot (library or camera)
//   2 · (preview)→ the picked shot + "Leer captura"
//   3 · reading  → "Leyendo…" scan over the image
//   4·5 · review → auto-filled, EDITABLE fields (verde = detectado, ámbar =
//                  revisar) + "Confirmar y guardar" → the honest-logging path.
//
// Reachable from the done-workout detail ("Subir captura de otra app") and from a
// not-done session's brief ("Registrar con captura"). It owns no plan state — it
// just reads → reviews → confirms, then hands back via `onSaved`.
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

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            switch phase {
            case .pick:        pickPhase
            case .reading:     readingPhase
            case .review:      reviewPhase
            case .unavailable: unavailablePhase
            case .failed:      failedPhase
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onChange(of: pickedItem) { _, item in loadPicked(item) }
        .sheet(isPresented: $showCamera) {
            CameraPicker { ui in handlePicked(ui) }
                .ignoresSafeArea()
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(phaseKicker)
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.1)
                    .foregroundStyle(phase == .reading ? Theme.Color.accentText : Theme.Color.accentText)
                Text(phaseTitle)
                    .font(.system(size: 18, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: Theme.Spacing.s)
            Button {
                Haptics.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 36, height: 36)
                    .background(Theme.Color.surfaceElevated)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.s)
    }

    private var phaseKicker: String {
        switch phase {
        case .pick:        return "SUBIR CAPTURA"
        case .reading:     return "LEYENDO CAPTURA"
        case .review:      return "REVISAR Y GUARDAR"
        case .unavailable: return "SUBIR CAPTURA"
        case .failed:      return "SUBIR CAPTURA"
        }
    }
    private var phaseTitle: String {
        switch phase {
        case .pick:        return sessionTitle ?? "¿De qué app?"
        case .reading:     return "No cierres"
        case .review:      return "Tú mandas"
        case .unavailable: return "Lectura por IA"
        case .failed:      return "No se pudo leer"
        }
    }

    // MARK: - Phase 1·2 — pick source + screenshot

    private var pickPhase: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Entrenaste fuera y no llevabas el reloj conectado. Sube la foto del resumen de tu app y la leemos por ti.")
                    .scaledFont(12, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)

                LabelText(text: "¿De qué app?", size: 9)
                sourceChips

                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity)
                        .frame(maxHeight: 280)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                        )
                    pickButtons(replace: true)
                } else {
                    dropzone
                    pickButtons(replace: false)
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .safeAreaInset(edge: .bottom) {
            if image != nil {
                VStack(spacing: 6) {
                    ExpertPrimaryButton(title: "LEER CAPTURA", action: startReading)
                    Text("Concept2 PM5 · Garmin · Coros · Strava · Apple")
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.m)
                .background(Theme.Color.background)
            }
        }
    }

    private var sourceChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(CaptureApp.allCases) { app in
                    let on = selectedApp == app
                    Button {
                        Haptics.light()
                        selectedApp = on ? nil : app
                    } label: {
                        Text(app.label)
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(on ? Theme.Color.accentText : Theme.Color.muted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(on ? Theme.Color.accent.opacity(0.16) : Theme.Color.surface)
                            .overlay(
                                Capsule().stroke(on ? Theme.Color.accent : Theme.Color.hairline, lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 1)
        }
    }

    private var dropzone: some View {
        VStack(spacing: 8) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text("Sube la foto del resumen")
                .font(.system(size: 13, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            Text("Tiempo, distancia, ritmo y splits — la IA los coloca en su sitio.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                .foregroundStyle(Theme.Color.hairlineStrong)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    @ViewBuilder
    private func pickButtons(replace: Bool) -> some View {
        HStack(spacing: 8) {
            PhotosPicker(selection: $pickedItem, matching: .images, photoLibrary: .shared()) {
                pickLabel(icon: "photo", text: replace ? "Otra foto" : "Elegir captura", primary: !replace && !cameraAvailable)
            }
            if cameraAvailable {
                Button {
                    Haptics.light()
                    showCamera = true
                } label: {
                    pickLabel(icon: "camera", text: "Hacer foto", primary: false)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func pickLabel(icon: String, text: String, primary: Bool) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 14, weight: .semibold))
            Text(text).font(.system(size: 13, weight: .heavy))
        }
        .foregroundStyle(primary ? Theme.Color.accentOn : Theme.Color.accentText)
        .frame(maxWidth: .infinity)
        .frame(height: 46)
        .background(primary ? Theme.Color.accent : Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(primary ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // MARK: - Phase 3 — reading (scan over the image)

    private var readingPhase: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 8)
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 320)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                        .overlay(ScanOverlay())
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
            }
            .padding(.horizontal, Theme.Spacing.m)

            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    ProgressView().tint(Theme.Color.accent)
                    Text("Leyendo resultado…")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Theme.Color.foreground)
                }
                Text("Cruzamos lo que pedía el entreno con lo que muestra la foto. No cierres.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Theme.Spacing.xl)
            }
            Spacer()
        }
    }

    // MARK: - Phase 4·5 — review (editable, honest)

    @ViewBuilder
    private var reviewPhase: some View {
        if let model {
            ReviewBody(
                model: model,
                isSaving: isSaving,
                onConfirm: confirm
            )
        }
    }

    // MARK: - 501 / failure

    private var unavailablePhase: some View {
        InfoState(
            icon: "camera.metering.unknown",
            title: "Lectura por foto no disponible aún",
            message: "Todavía no hemos activado la lectura por IA. Puedes registrar el entreno a mano.",
            primaryTitle: "Entendido",
            primaryAction: onClose,
            secondaryTitle: nil,
            secondaryAction: nil
        )
    }

    private var failedPhase: some View {
        InfoState(
            icon: "arrow.triangle.2.circlepath",
            title: "No pudimos leer la captura",
            message: "Prueba con una foto más nítida del resumen, o revisa tu conexión.",
            primaryTitle: "Reintentar",
            primaryAction: { phase = .pick },
            secondaryTitle: "Cerrar",
            secondaryAction: onClose
        )
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

// MARK: - Review body (separate so @ObservedObject drives field edits)

private struct ReviewBody: View {
    @ObservedObject var model: CaptureReviewModel
    let isSaving: Bool
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Cada valor en su campo. Verde = lo leímos, ámbar = revísalo. Toca cualquiera para corregir.")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.bottom, 4)

                    CaptureFieldCard(label: "Tiempo total", unit: "", field: $model.totalTime, kind: .time)
                    if hasAny(model.distance) {
                        CaptureFieldCard(label: "Distancia", unit: "m", field: $model.distance, kind: .decimal)
                    }
                    CaptureFieldCard(label: "Ritmo medio", unit: model.paceUnitLabel, field: $model.avgPace, kind: .time)
                    if hasAny(model.avgHr) {
                        CaptureFieldCard(label: Vocab.fcMedia, unit: Vocab.ppm, field: $model.avgHr, kind: .int)
                    }
                    if hasAny(model.avgPower) {
                        CaptureFieldCard(label: "Potencia media", unit: "W", field: $model.avgPower, kind: .decimal)
                    }
                    if hasAny(model.spm) {
                        CaptureFieldCard(label: "Cadencia", unit: "spm", field: $model.spm, kind: .int)
                    }
                    if hasAny(model.calories) {
                        CaptureFieldCard(label: "Calorías", unit: "kcal", field: $model.calories, kind: .decimal)
                    }

                    if !model.segments.isEmpty {
                        splitsCard
                    }

                    rpeCard
                    notesCard
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }

            VStack(spacing: 6) {
                ExpertPrimaryButton(
                    title: isSaving ? "GUARDANDO…" : "CONFIRMAR Y GUARDAR",
                    action: onConfirm
                )
                .disabled(isSaving)
                Text("Nada se guarda hasta que confirmas. Marca la sesión HECHA y llega al coach.")
                    .scaledFont(10, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
            .background(Theme.Color.background)
        }
    }

    private func hasAny(_ f: EditableField) -> Bool {
        // Show a metric row only when the IA detected it OR it has a value — we
        // never prompt for power/spm/cals a screenshot didn't contain.
        f.value != nil || f.detected == .detected
    }

    private var splitsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Splits · \(model.segments.count) series", size: 9)
                    Spacer()
                    Text("\(detectedSplits)/\(model.segments.count) leídos")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundStyle(Theme.Color.ok)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                ForEach(Array(model.segments.indices), id: \.self) { i in
                    Hairline().opacity(0.5)
                    SplitRow(index: i + 1,
                             time: $model.segments[i].time,
                             pace: $model.segments[i].pace,
                             paceUnit: model.paceUnitLabel)
                }
            }
        }
    }

    private var detectedSplits: Int {
        model.segments.filter { $0.pace.status == .detected || $0.time.status == .detected }.count
    }

    private var rpeCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "RPE — añádelo", size: 9)
                    Spacer()
                    StatusBadge(status: model.rpe.status)
                }
                HStack(spacing: 4) {
                    ForEach(1...10, id: \.self) { n in
                        let on = model.rpe.value.map { Int($0.rounded()) } == n
                        Button {
                            Haptics.light()
                            model.rpe.value = Double(n)
                        } label: {
                            Text("\(n)")
                                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                                .foregroundStyle(on ? Theme.Color.accentOn : Theme.Color.foreground)
                                .frame(width: 26, height: 26)
                                .background(on ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Esfuerzo percibido \(n) de 10")
                    }
                }
            }
        }
    }

    private var notesCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Notas", size: 9)
                TextField("Opcional", text: $model.notes, axis: .vertical)
                    .lineLimit(2...4)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.vertical, 4)
                    .accessibilityLabel("Notas del entreno")
            }
        }
    }
}

// MARK: - Editable field card (dot · label · value · badge)

private struct CaptureFieldCard: View {
    enum Kind { case time, int, decimal }
    let label: String
    let unit: String
    @Binding var field: EditableField
    let kind: Kind

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(field.status.color)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(0.4)
                    .foregroundStyle(Theme.Color.faint)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboard)
                        .focused($focused)
                        .font(.system(size: 17, weight: .heavy, design: .default).monospacedDigit())
                        .foregroundStyle(field.value == nil ? Theme.Color.faint : Theme.Color.foreground)
                        .fixedSize(horizontal: true, vertical: false)
                        .onChange(of: text) { _, new in commit(new) }
                        .onAppear { text = display }
                    if !unit.isEmpty {
                        Text(unit)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            Spacer(minLength: 4)
            StatusBadge(status: field.status)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 10)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(focused ? Theme.Color.accent : Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var placeholder: String {
        switch kind {
        case .time: return "mm:ss"
        default:    return "—"
        }
    }
    private var keyboard: UIKeyboardType {
        switch kind {
        case .time:    return .numbersAndPunctuation
        case .int:     return .numberPad
        case .decimal: return .decimalPad
        }
    }

    private var display: String {
        guard let v = field.value else { return "" }
        switch kind {
        case .time: return Formato.clock(v)
        case .int:  return "\(Int(v.rounded()))"
        case .decimal:
            return Formato.esDecimal(v)
        }
    }

    private func commit(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { field.value = nil; return }
        switch kind {
        case .time:
            field.value = TimeMinSecRow.parse(trimmed).map(Double.init) ?? field.value
        case .int:
            field.value = Int(trimmed).map(Double.init) ?? field.value
        case .decimal:
            field.value = Double(trimmed.replacingOccurrences(of: ",", with: ".")) ?? field.value
        }
    }
}

// MARK: - Split row (index · pace · time, editable)

private struct SplitRow: View {
    let index: Int
    @Binding var time: EditableField
    @Binding var pace: EditableField
    let paceUnit: String

    var body: some View {
        HStack(spacing: 8) {
            Text("\(index)")
                .font(.system(size: 12, weight: .heavy).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 18, alignment: .leading)
            SplitEdit(field: $pace, suffix: paceUnit, accent: true)
            Spacer(minLength: 6)
            SplitEdit(field: $time, suffix: "", accent: false)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }
}

private struct SplitEdit: View {
    @Binding var field: EditableField
    let suffix: String
    let accent: Bool
    @State private var text: String = ""

    var body: some View {
        HStack(spacing: 3) {
            Circle().fill(field.status.color).frame(width: 6, height: 6)
            TextField("mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .font(.system(size: 12, weight: .heavy).monospacedDigit())
                .foregroundStyle(field.value == nil ? Theme.Color.faint
                                 : (accent ? Theme.Color.accentText : Theme.Color.muted))
                .fixedSize(horizontal: true, vertical: false)
                .onChange(of: text) { _, new in
                    let t = new.trimmingCharacters(in: .whitespaces)
                    field.value = t.isEmpty ? nil : (TimeMinSecRow.parse(t).map(Double.init) ?? field.value)
                }
                .onAppear { if let v = field.value { text = Formato.clock(v) } }
            if !suffix.isEmpty {
                Text(suffix).font(.system(size: 8, weight: .semibold)).foregroundStyle(Theme.Color.faint)
            }
        }
    }
}

// MARK: - Small shared bits

private struct StatusBadge: View {
    let status: FieldStatus
    var body: some View {
        Text(status.label.uppercased())
            .font(.system(size: 8, weight: .heavy))
            .tracking(0.3)
            .foregroundStyle(status.color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(status.tint)
            .clipShape(Capsule())
    }
}

private struct ScanOverlay: View {
    @State private var phase: CGFloat = 0
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
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                    phase = 1
                }
            }
        }
    }
}

private struct InfoState: View {
    let icon: String
    let title: String
    let message: String
    let primaryTitle: String
    let primaryAction: () -> Void
    let secondaryTitle: String?
    let secondaryAction: (() -> Void)?

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text(title)
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(message)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            VStack(spacing: Theme.Spacing.s) {
                PrimaryButton(title: primaryTitle, action: primaryAction)
                if let secondaryTitle, let secondaryAction {
                    SecondaryButton(title: secondaryTitle, action: secondaryAction)
                }
            }
            .frame(maxWidth: 320)
            Spacer()
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity)
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
