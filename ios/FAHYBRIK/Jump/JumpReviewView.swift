import SwiftUI

// LA REVISIÓN DE UN SALTO — el vídeo, la altura que sale de dos fotogramas y los dos ajustes que el
// atleta puede hacer: mover el despegue y el aterrizaje de fotograma en fotograma. Se conserva o se
// descarta.
//
// El vídeo manda (arriba, sobre negro: es una imagen, no una superficie del tema) y debajo va el panel de
// control con la altura como dato. La acción de conservar es la del pie del panel; descartar, la salida
// discreta a su lado.

struct JumpReviewView: View {
    let url: URL
    let fps: Double
    let frameCount: Int
    @Binding var takeoff: Int
    @Binding var landing: Int
    @Binding var quality: String
    var onKeep: () -> Void
    var onDiscard: () -> Void

    private enum Mark { case takeoff, landing }
    @State private var mark: Mark = .takeoff

    private var current: Int { mark == .takeoff ? takeoff : landing }
    /// Solo se conserva un salto posible: más de 1 s en el aire es un aterrizaje mal
    /// marcado, y el servidor no lo guarda (0278).
    private var isPlausible: Bool {
        JumpPhysics.isPlausible(takeoffFrame: takeoff, landingFrame: landing, fps: fps)
    }
    private var heightLabel: String {
        guard let h = JumpPhysics.heightCm(takeoffFrame: takeoff, landingFrame: landing, fps: fps) else {
            return "—"
        }
        return JumpPhysics.displayCm(h)
    }

    var body: some View {
        VStack(spacing: 0) {
            JumpFramePreview(url: url, frame: current, fps: fps)
                .frame(maxWidth: .infinity)
                .background(SwiftUI.Color.black)
                .accessibilityLabel("Vídeo del salto, fotograma \(current + 1)")

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    lectura
                    SegmentoDia(
                        items: [(Mark.takeoff, "Despegue"), (Mark.landing, "Aterrizaje")],
                        valor: $mark, etiqueta: "Fotograma que estás ajustando", completo: true
                    )
                    Text(mark == .takeoff
                         ? "Último frame con un pie en el suelo."
                         : "Primer frame que vuelve a tocar.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)

                    if !isPlausible {
                        AvisoEnLineaDia("Más de 1 s en el aire no es un salto. Revisa el aterrizaje.")
                    }

                    paso
                }
                .padding(EdgeInsets(top: Theme.Spacing.l, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.l, trailing: Theme.Spacing.pantalla))
            }
            .scrollBounceBehavior(.basedOnSize)
            // El panel pide su alto antes que el vídeo: un vídeo vertical, contenido a su ancho, mediría
            // más que la pantalla y se llevaría los controles.
            .layoutPriority(1)

            acciones
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    /// La altura, con su incertidumbre y los fotogramas por segundo del vídeo.
    private var lectura: some View {
        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
            Text(heightLabel)
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
            if let u = JumpPhysics.uncertaintyCm(fps: fps) {
                Text("± \(max(1, Int(u.rounded()))) cm")
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: Theme.Spacing.s)
            Text(String(format: "%.0f fps", fps))
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
        }
        .accessibilityElement(children: .combine)
    }

    /// Mover el fotograma de uno en uno, con el que toca ver.
    private var paso: some View {
        HStack(spacing: Theme.Spacing.m) {
            botonDePaso(.chevron, girado: true, etiqueta: "Fotograma anterior") { nudge(-1) }
            Text("\(current + 1) / \(max(frameCount, 1))")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .monospacedDigit()
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Fotograma \(current + 1) de \(max(frameCount, 1))")
            botonDePaso(.chevron, girado: false, etiqueta: "Fotograma siguiente") { nudge(1) }
        }
    }

    private func botonDePaso(_ glifo: GlifoDia, girado: Bool, etiqueta: String, _ accion: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            IconoDia(glifo, tam: 20, peso: .bold)
                .rotationEffect(.degrees(girado ? 180 : 0))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 64, height: Theme.Size.toque)
                .background(Theme.Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.94))
        .accessibilityLabel(etiqueta)
    }

    /// Conservar es la acción; descartar, la salida discreta. Anclados abajo, siempre a la vista.
    private var acciones: some View {
        HStack(spacing: Theme.Spacing.s) {
            BotonTextoDia("Descartar", tono: .suave, centrado: true, accion: onDiscard)
            BotonAccionDia(
                "Conservar",
                completa: true,
                estado: isPlausible ? .normal : .inactivo,
                accion: onKeep
            )
        }
        .padding(EdgeInsets(top: Theme.Spacing.m, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.m, trailing: Theme.Spacing.pantalla))
        .background(Theme.Color.background)
        .overlay(alignment: .top) { Hairline() }
    }

    private func nudge(_ d: Int) {
        let maxF = max(0, frameCount - 1)
        if mark == .takeoff {
            takeoff = min(max(0, takeoff + d), max(0, landing - 1))
        } else {
            landing = min(max(takeoff + 1, landing + d), maxF)
        }
        if fps + 0.1 < 200 { quality = "low_fps" }
    }
}
