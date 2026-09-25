import SwiftUI

// MARK: - Privacidad
//
// Perfil › Privacidad (Alex, 25-09; el doble: consentimiento-sensores/perfil.tsx).
// La puerta es nueva y recoge lo que andaba suelto: el interruptor del movimiento
// del reloj, «Exportar mis datos» (antes en Cuenta) y la política (antes en Ayuda y
// legal), con sus filas y su comportamiento de siempre.
//
// La línea bajo el interruptor DICE QUÉ PASA AHORA, no qué es el interruptor:
// encendido, para qué sirve lo que sube; apagado, que no sube nada, que lo subido
// se borra y que los entrenos no pierden nada. Retirar cuesta un toque, igual que
// dar — sin «¿seguro?», que es como se castiga cambiar de idea.
//
// Lo que NO promete: que encenderlo suba los entrenos de antes. No está decidido.

struct ProfilePrivacidadView: View {
    let bearer: String?

    @State private var subir: Bool = SensorCaptureConsent.isGranted
    @State private var showPolicy: Bool = false

    // «Exportar mis datos», movido tal cual desde Cuenta.
    @State private var exporting: Bool = false
    @State private var exportShareItem: ExportShareItem? = nil
    @State private var exportError: String? = nil
    @State private var exportToast: String? = nil

    var body: some View {
        ZStack(alignment: .top) {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    privacyGroup(title: SensorConsentCopy.grupo, caption: SensorConsentCopy.grupoPie) {
                        movimientoRow
                    }
                    Text(SensorConsentCopy.notaAlPie)
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, Theme.Spacing.xs)
                    privacyGroup(title: SensorConsentCopy.grupoDatos, caption: SensorConsentCopy.grupoDatosPie) {
                        exportRow
                        Hairline()
                        policyRow
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
                .clampedToContainerWidth()
            }
            if let exportToast {
                ToastBanner(text: exportToast)
                    .padding(.top, Theme.Spacing.l)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle(SensorConsentCopy.perfilTitulo)
        .navigationBarTitleDisplayMode(.inline)
        // La hoja pudo contestarse después de montar esta pantalla (vuelta atrás).
        .onAppear { subir = SensorCaptureConsent.isGranted }
        .sheet(item: $exportShareItem) { item in
            ShareSheet(items: [item.fileURL])
        }
        .sheet(isPresented: $showPolicy) {
            LegalSheet(title: SensorConsentCopy.politica, bodyText: LegalCopy.privacy)
        }
    }

    /// El grupo de Perfil con título que explica y pie — el de «Dispositivos y apps».
    private func privacyGroup<Rows: View>(
        title: String,
        caption: String,
        @ViewBuilder rows: @escaping () -> Rows
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.foreground)
            Text(caption)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 2)
            CardSurface(padding: 0) {
                VStack(spacing: 0) { rows() }
            }
        }
    }

    // MARK: - El movimiento del reloj

    private var movimientoRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "watch.analog")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(SensorConsentCopy.fila)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subir ? SensorConsentCopy.filaSi : SensorConsentCopy.filaNo)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: Theme.Spacing.s)
            Toggle("", isOn: subirToggle)
                .labelsHidden()
                .tint(Theme.Color.accent)
                .accessibilityLabel(SensorConsentCopy.fila)
                .accessibilityValue(subir ? "activado" : "desactivado")
                .accessibilityHint(subir ? SensorConsentCopy.filaSi : SensorConsentCopy.filaNo)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    private var subirToggle: Binding<Bool> {
        Binding(
            get: { subir },
            set: { on in
                guard on != subir else { return }
                Haptics.light()
                SensorConsentPrompt.setUpload(on, bearer: bearer)
                subir = on
            }
        )
    }

    // MARK: - Tus datos

    private var policyRow: some View {
        Button(action: { Haptics.light(); showPolicy = true }) {
            ProfileNavRow(icon: "lock.shield", title: SensorConsentCopy.politica, subtitle: Marca.privacidadTexto)
        }
        .buttonStyle(.plain)
    }

    private var exportRow: some View {
        Button {
            Haptics.light()
            Task { await exportData() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "square.and.arrow.up.on.square")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(SensorConsentCopy.exportar)
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(exportError ?? SensorConsentCopy.exportarLinea)
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(exportError == nil ? Theme.Color.muted : Theme.Color.danger)
                        .lineLimit(2)
                }
                Spacer()
                if exporting {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .disabled(exporting || bearer == nil)
    }

    private func exportData() async {
        guard let bearer, !exporting else { return }
        exporting = true
        exportError = nil
        defer { exporting = false }
        do {
            let (data, filename) = try await AccountService.exportData(bearer: bearer)
            let safeName = filename.isEmpty ? "fahybrid-export.json" : filename
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            try? FileManager.default.removeItem(at: url)
            try data.write(to: url, options: [.atomic])
            await MainActor.run {
                exportShareItem = ExportShareItem(fileURL: url)
                showToast("Datos exportados")
            }
        } catch let APIError.http(status, _) {
            await MainActor.run {
                exportError = status == 401
                    ? "Sesión caducada. Vuelve a iniciar sesión."
                    : "No pudimos exportar tus datos (HTTP \(status))."
            }
        } catch {
            await MainActor.run {
                exportError = "No pudimos exportar tus datos. Revisa tu conexión."
            }
        }
    }

    private func showToast(_ text: String) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            exportToast = text
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            withAnimation(.easeOut(duration: 0.25)) {
                exportToast = nil
            }
        }
    }
}
