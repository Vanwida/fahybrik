import SwiftUI
import UIKit

// LA HOJA DE LA NOTA DE VOZ: grabar → onda en vivo y tiempo → parar → vista previa (escuchar / repetir) → enviar.
// Se levanta como hoja desde el compositor. El motor (permiso, grabación, reproducción, paquete a enviar) es
// `VoiceRecorderEngine`; aquí sólo se pinta lo que el motor dice, con el marco de hoja de «El día»: título, cierre
// de 48 pt y la acción de la fase anclada abajo.

// MARK: - La lectura del motor

/// Lo que la hoja necesita para pintar UNA fase: valores, sin el motor. Es lo que permite capturar cada fase sin
/// micrófono y lo que separa «qué dice el motor» de «cómo se ve».
struct LecturaNotaDeVoz {
    var fase: VoiceRecorderEngine.Phase
    /// El tiempo que lleva grabando.
    var transcurrido: TimeInterval
    /// La duración de lo grabado (fase `recorded`).
    var duracion: TimeInterval
    var niveles: [CGFloat]
    var avance: Double
    var sonando: Bool

    /// La onda que se enseña en la vista previa cuando el medidor no dejó niveles (una grabación sin señal): una onda
    /// plana sería una nota rota a ojos del atleta.
    static let nivelesDeRelleno: [CGFloat] = [0.3, 0.6, 0.8, 0.5, 0.7, 0.9, 0.55, 0.4, 0.75, 0.6, 0.5, 0.85, 0.65, 0.45]
}

// MARK: - La hoja, pura

/// La hoja de la nota de voz ya resuelta: cada fase con su contenido y su acción anclada.
struct NotaDeVozHoja: View {
    let lectura: LecturaNotaDeVoz
    let alCerrar: () -> Void
    let alGrabar: () -> Void
    let alParar: () -> Void
    let alEscuchar: () -> Void
    let alRepetir: () -> Void
    let alEnviar: () -> Void
    let alAbrirAjustes: () -> Void

    var body: some View {
        MarcoDeHojaDia("Nota de voz", cerrar: alCerrar) {
            contenido
                .frame(maxWidth: .infinity, minHeight: Self.altoDelCuerpo)
        } accion: {
            accion
        }
    }

    /// El alto mínimo del cuerpo: que las cuatro fases ocupen lo mismo y la hoja no salte al cambiar de una a otra.
    private static let altoDelCuerpo: CGFloat = 176

    // MARK: Contenido por fase

    @ViewBuilder
    private var contenido: some View {
        switch lectura.fase {
        case .idle: reposo
        case .recording: grabando
        case .recorded: grabada
        case .denied: sinMicro
        }
    }

    private var reposo: some View {
        VStack(spacing: Theme.Spacing.l) {
            IconoChat(.microfono, tam: 36, peso: .semibold)
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 88, height: 88)
                .background(Theme.Color.accentTint, in: Circle())
                .overlay(Circle().strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
            Text("Toca para grabar")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var grabando: some View {
        VStack(spacing: Theme.Spacing.l) {
            // El estado va en la marca (el punto) y en la palabra: «Grabando».
            HStack(spacing: Theme.Spacing.s) {
                Circle().fill(Theme.Color.danger).frame(width: 12, height: 12).accessibilityHidden(true)
                Text("Grabando").papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
            }
            LiveWaveform(levels: lectura.niveles, tint: Theme.Color.accent)
                .frame(height: 56)
            Text(Formato.clock(lectura.transcurrido))
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Grabando, \(Formato.clock(lectura.transcurrido))")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var grabada: some View {
        VStack(spacing: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                BotonRedondoChat(etiqueta: lectura.sonando ? "Pausar" : "Reproducir", estilo: .suave, accion: alEscuchar) {
                    if lectura.sonando { IconoChat(.pausa, tam: 20, peso: .bold) } else { IconoChat(.play, tam: 20, peso: .bold) }
                }
                StaticWaveform(
                    levels: lectura.niveles.isEmpty ? LecturaNotaDeVoz.nivelesDeRelleno : lectura.niveles,
                    progress: lectura.avance,
                    tint: Theme.Color.accent
                )
                .frame(height: 48)
            }
            Text(Formato.clock(lectura.duracion))
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private var sinMicro: some View {
        VStack(spacing: Theme.Spacing.m) {
            FichaDia(tono: .aviso) { IconoChat(.sinMicrofono, tam: 22) }
            Text("Micrófono desactivado")
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .accessibilityAddTraits(.isHeader)
            Text("Actívalo en Ajustes para grabar notas de voz.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Acción anclada por fase

    @ViewBuilder
    private var accion: some View {
        switch lectura.fase {
        case .idle:
            BotonAccionDia("Grabar nota de voz", relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio, accion: alGrabar)
        case .recording:
            BotonAccionDia("Detener", relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio, accion: alParar)
        case .recorded:
            BotonAccionDia("Enviar", relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio, accion: alEnviar)
            BotonTextoDia("Repetir", centrado: true, accion: alRepetir, icono: {
                IconoDia(.reintentar, tam: 18, peso: .bold)
            })
        case .denied:
            BotonAccionDia("Abrir Ajustes", relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio, accion: alAbrirAjustes)
        }
    }
}

// MARK: - La hoja viva

struct VoiceRecorderView: View {
    /// Se llama con la nota empaquetada cuando el atleta toca Enviar. La hoja se cierra; el temporal pasa a ser de
    /// quien lo recibe.
    let onSend: (ChatPickedAttachment) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var engine = VoiceRecorderEngine()

    /// Alto de la hoja: cabe la fase más alta (la vista previa con su acción y su «Repetir») sin llegar a media pantalla.
    private static let altoDeLaHoja: CGFloat = 400

    var body: some View {
        NotaDeVozHoja(
            lectura: LecturaNotaDeVoz(
                fase: engine.phase,
                transcurrido: engine.elapsed,
                duracion: engine.duration,
                niveles: engine.levels,
                avance: engine.playbackProgress,
                sonando: engine.isPlayingPreview
            ),
            alCerrar: { engine.discard(); dismiss() },
            alGrabar: { engine.start() },
            alParar: { engine.stop() },
            alEscuchar: { engine.togglePreview() },
            alRepetir: { engine.discard(); engine.start() },
            alEnviar: {
                guard let adjunto = engine.makeAttachment() else { return }
                Haptics.success()
                onSend(adjunto)
                dismiss()
            },
            alAbrirAjustes: {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
        )
        .presentationDetents([.height(Self.altoDeLaHoja), .large])
        .onDisappear { engine.teardownIfUnsent() }
    }
}

// MARK: - Waveforms

/// Medidor de nivel en vivo — la muestra más nueva en el borde de la derecha.
struct LiveWaveform: View {
    let levels: [CGFloat]
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
                    Capsule()
                        .fill(tint)
                        .frame(width: 3)
                        .frame(height: max(3, level * geo.size.height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
        .accessibilityHidden(true)
    }
}

/// Onda capturada con el relleno del avance de la reproducción (las barras ya sonadas en el tono, el resto atenuado).
struct StaticWaveform: View {
    let levels: [CGFloat]
    let progress: Double
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(levels.enumerated()), id: \.offset) { idx, level in
                    let frac = levels.isEmpty ? 0 : Double(idx) / Double(levels.count)
                    Capsule()
                        .fill(frac <= progress ? tint : Theme.Color.muted.opacity(0.5))
                        .frame(width: 3)
                        .frame(height: max(3, level * geo.size.height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Nota de voz · grabando") {
    NotaDeVozHoja(
        lectura: LecturaNotaDeVoz(fase: .recording, transcurrido: 14, duracion: 0, niveles: LecturaNotaDeVoz.nivelesDeRelleno + LecturaNotaDeVoz.nivelesDeRelleno, avance: 0, sonando: false),
        alCerrar: {}, alGrabar: {}, alParar: {}, alEscuchar: {}, alRepetir: {}, alEnviar: {}, alAbrirAjustes: {}
    )
}
#endif
