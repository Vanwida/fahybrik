import SwiftUI

// «DIAGNÓSTICO DEL RELOJ» — la pantalla escondida de la fase 0 (docs/el-reloj-primero/):
// los últimos eventos del enlace, de las sesiones y de los guardados, del iPhone y del
// reloj juntos, en el orden en que pasaron. Es para quien prueba en el gimnasio: dice
// si Apple lanzó la app del reloj, si el espejo se unió, cuándo se cortó y si el
// entreno llegó al servidor, sin Xcode delante.
//
// Se abre con siete toques en el número de versión de Perfil. No es producto: no
// tiene espejo en «el doble» y el atleta no la busca.

struct DiagnosticoRelojView: View {
    let bearer: String?

    @Environment(\.dismiss) private var dismiss
    @State private var events: [DiagEvent] = []
    @State private var pending = 0
    @State private var lastResult: String?
    @State private var soloFallos = false
    @State private var sending = false

    private var shown: [DiagEvent] {
        soloFallos ? events.filter { $0.outcome == .failed } : events
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    cabecera
                    Toggle("Solo fallos", isOn: $soloFallos)
                        .scaledFont(14, relativeTo: .subheadline)
                }
                Section("Últimos \(shown.count)") {
                    ForEach(shown, id: \.clave) { fila($0) }
                }
            }
            .navigationTitle("Diagnóstico del reloj")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: DiagnosticoRelojView.texto(events)) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Compartir el registro")
                }
            }
            .task { await recargar() }
            .refreshable { await recargar() }
        }
    }

    private var cabecera: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Este iPhone · \(String(DiagnosticsLog.shared.installId.uuidString.prefix(8))) · \(AppBundleMetadata.displayVersion ?? "—")")
                .scaledFont(12, relativeTo: .caption, monospaced: true)
                .foregroundStyle(Theme.Color.muted)
            Text(pending == 0 ? "Todo enviado" : "\(pending) sin enviar")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(pending == 0 ? Theme.Color.foreground : Theme.Color.warning)
            if let lastResult {
                Text("Último envío: \(lastResult)")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            Button(sending ? "Enviando…" : "Enviar ahora") {
                Task {
                    sending = true
                    await DiagnosticsUploader.shared.flush(bearer: bearer)
                    await recargar()
                    sending = false
                }
            }
            .disabled(sending || bearer == nil)
        }
        .padding(.vertical, Theme.Spacing.xs)
    }

    private func fila(_ e: DiagEvent) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: Theme.Spacing.s) {
                Text(DiagnosticoRelojView.hora(e.at))
                    .scaledFont(11, relativeTo: .caption2, monospaced: true)
                    .foregroundStyle(Theme.Color.faint)
                Text(e.device == .watch ? "Reloj" : "iPhone")
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                Text(e.name)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote, monospaced: true)
                    .foregroundStyle(e.outcome == .failed ? Theme.Color.danger : Theme.Color.foreground)
            }
            let error = [e.domain, e.code.map(String.init)].compactMap { $0 }.joined(separator: " ")
            let linea = [error.isEmpty ? nil : error, e.detail].compactMap { $0 }.joined(separator: " · ")
            if !linea.isEmpty {
                Text(linea)
                    .scaledFont(11, relativeTo: .caption2, monospaced: true)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(3)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func recargar() async {
        events = DiagnosticsLog.shared.recent(limit: 300)
        pending = DiagnosticsLog.shared.pendingCount()
        lastResult = await DiagnosticsUploader.shared.lastResult
    }

    /// La hora local con milisegundos: lo que se compara entre los dos aparatos.
    static func hora(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) else { return iso }
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f.string(from: date)
    }

    /// El registro como texto, para mandarlo por donde sea.
    static func texto(_ events: [DiagEvent]) -> String {
        events.map { e in
            [e.at, e.device.rawValue, e.kind.rawValue, e.name, e.outcome?.rawValue, e.domain,
             e.code.map(String.init), e.workoutId.map { String($0.uuidString.prefix(8)) }, e.detail, e.appBuild]
                .map { $0 ?? "" }
                .joined(separator: " | ")
        }
        .joined(separator: "\n")
    }
}

private extension DiagEvent {
    /// Instalación + seq: único en todo el registro.
    var clave: String { "\(installId.uuidString)#\(seq)" }
}
