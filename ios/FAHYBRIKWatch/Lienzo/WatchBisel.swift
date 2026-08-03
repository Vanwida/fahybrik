import SwiftUI

// EL BISEL — el progreso dibujado en el borde del lienzo.
//
// En un reloj el sitio más barato son las esquinas redondeadas: trazar el
// progreso ahí cuesta CERO altura de contenido y se ve de reojo. Espejo de
// `kit-watch/bisel.tsx`.
//
// Regla de significado:
//   · el ARO es la ESTRUCTURA (cuánto queda de esto), siempre naranja suave;
//   · el FONDO es el CUERPO (tu zona) o el ESTADO (recuperación).

private enum Bisel {
    static let grosor: CGFloat = 5
    static let inset: CGFloat = 5
    static let colorAro = WatchTheme.orangeSoft
    static let colorVia = Color.white.opacity(0.12)
    /// Hueco entre segmentos del aro troceado (pt a lo largo del perímetro).
    static let huecoSegmento: CGFloat = 0.035
}

// MARK: - Aro continuo

/// Una sola cosa en marcha (minuto EMOM, descanso, ventana AMRAP).
/// `remaining` es lo que QUEDA, de 1 a 0: el trazo se retrae hacia las 12.
struct WatchAroContinuo: View {
    let remaining: Double

    var body: some View {
        let queda = min(1, max(0, remaining))
        ZStack {
            Circle()
                .stroke(Bisel.colorVia, lineWidth: Bisel.grosor)
            Circle()
                .trim(from: 0, to: queda)
                .stroke(
                    Bisel.colorAro,
                    style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.9), value: queda)
        }
        .padding(Bisel.inset)
        .allowsHitTesting(false)
    }
}

// MARK: - Aro segmentado

/// Una porción por repetición (serie 3 de 8). `hechas` cerradas; la en curso
/// se rellena con `fraccion` (0…1).
struct WatchAroSegmentado: View {
    let total: Int
    let hechas: Int
    let fraccion: Double

    var body: some View {
        let n = max(1, total)
        let paso = 1.0 / Double(n)
        let hueco = Bisel.huecoSegmento
        let avance = min(1, max(0, fraccion))

        ZStack {
            ForEach(0..<n, id: \.self) { i in
                let start = Double(i) * paso + hueco / 2
                let endBase = Double(i + 1) * paso - hueco / 2
                let lleno: Double = {
                    if i < hechas { return 1 }
                    if i == hechas { return avance }
                    return 0
                }()
                let end = start + max(0, (endBase - start) * lleno)

                // Carril apagado del segmento.
                Circle()
                    .trim(from: start, to: endBase)
                    .stroke(Bisel.colorVia, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))
                    .rotationEffect(.degrees(-90))

                if lleno > 0 {
                    Circle()
                        .trim(from: start, to: max(start + 0.001, end))
                        .stroke(Bisel.colorAro, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                }
            }
        }
        .padding(Bisel.inset)
        .allowsHitTesting(false)
        .animation(.easeOut(duration: 0.35), value: hechas)
        .animation(.linear(duration: 0.6), value: fraccion)
    }
}

// MARK: - Helper AnyView

extension View {
    /// Empaqueta un bisel para pasarlo a `WatchReloj.bisel`.
    func watchBisel() -> AnyView { AnyView(self) }
}
