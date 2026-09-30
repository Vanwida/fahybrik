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
    @State private var aviso: AvisoDia.Contenido? = nil

    var body: some View {
        PantallaPerfil(titulo: SensorConsentCopy.perfilTitulo) {
            bloque(titulo: SensorConsentCopy.grupo, pie: SensorConsentCopy.grupoPie) {
                GrupoPerfil { movimientoRow }
                NotaPerfil(SensorConsentCopy.notaAlPie)
            }
            bloque(titulo: SensorConsentCopy.grupoDatos, pie: SensorConsentCopy.grupoDatosPie) {
                GrupoPerfil {
                    exportRow
                    policyRow
                }
            }
        }
        .avisoDia($aviso)
        // La hoja pudo contestarse después de montar esta pantalla (vuelta atrás).
        .onAppear { subir = SensorCaptureConsent.isGranted }
        .sheet(item: $exportShareItem) { item in
            ShareSheet(items: [item.fileURL])
        }
        .sheet(isPresented: $showPolicy) {
            LegalSheet(title: SensorConsentCopy.politica, bodyText: LegalCopy.privacy)
        }
    }

    /// Un grupo de Privacidad: su título, la frase que explica qué es y, debajo, lo suyo.
    private func bloque<Contenido: View>(
        titulo: String,
        pie: String,
        @ViewBuilder contenido: () -> Contenido
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                TituloSeccionDia(titulo)
                NotaPerfil(pie)
            }
            contenido()
        }
    }

    // MARK: - El movimiento del reloj

    private var movimientoRow: some View {
        FilaInterruptorPerfil(
            glifo: .movimientoReloj,
            titulo: SensorConsentCopy.fila,
            detalle: subir ? SensorConsentCopy.filaSi : SensorConsentCopy.filaNo,
            activo: subirBinding
        )
    }

    private var subirBinding: Binding<Bool> {
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
        Button {
            Haptics.light()
            showPolicy = true
        } label: {
            FilaPerfil(glifo: .escudo, titulo: SensorConsentCopy.politica, detalle: Marca.privacidadTexto)
        }
        .filaTocablePerfil()
    }

    private var exportRow: some View {
        Button {
            Haptics.light()
            Task { await exportData() }
        } label: {
            FilaPerfil(
                glifo: .exportar,
                tonoDeFicha: exportError == nil ? .normal : .peligro,
                titulo: SensorConsentCopy.exportar,
                detalle: exportError ?? SensorConsentCopy.exportarLinea,
                detalleFuerte: exportError != nil
            ) {
                if exporting {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    ChevronDeFilaPerfil()
                }
            }
        }
        .filaTocablePerfil()
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
                aviso = .init(tono: .ok, texto: "Datos exportados")
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
}
