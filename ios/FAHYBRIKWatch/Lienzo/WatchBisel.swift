import SwiftUI

// EL BISEL — el progreso dibujado en el borde del lienzo.
//
// En un reloj el sitio más barato son las esquinas redondeadas: trazar el
// progreso ahí cuesta CERO altura de contenido y se ve de reojo. Espejo de
// `kit-watch/bisel.tsx`. La forma que recorre es la REAL del cristal de cada
// reloj (`WatchPantallaTrazado`, ver `WatchPantalla.swift`): arranca a las 12 y va
// en sentido horario.
//
// Regla de significado:
//   · el ARO es la ESTRUCTURA (cuánto queda de esto), siempre naranja suave;
//   · el FONDO es el CUERPO (tu zona) o el ESTADO (recuperación).

private enum Bisel {
    static let grosor: CGFloat = 5
    static let inset: CGFloat = 4
    static let colorAro = WatchTheme.orangeSoft
    /// Hueco entre segmentos del aro troceado (pt a lo largo del perímetro).
    static let huecoSegmento: CGFloat = 0.035

    /// El gris de una recuperación en el aro de estructura. Es el `dim` de la
    /// paleta y no un blanco al X %: lo que separa un tramo suave de uno fuerte
    /// tiene que ser un color del tema, no una opacidad suelta.
    static let colorRecupera = WatchTheme.dim
    /// El BRILLO dice dónde estás. Hecho a plena luz, el de ahora a media, lo que
    /// viene apenas insinuado — lo justo para leer el ritmo del entreno de reojo.
    static let brilloHecho: Double = 1
    static let brilloEnCurso: Double = 0.40
    static let brilloPendiente: Double = 0.16
}

// MARK: - Aro de estructura

/// EL ON/OFF DE LA SERIE ENTERA — un arco por tramo de la fase, en orden.
///
/// Dos ejes y ninguna excepción (ver `FormaDelAro`): el HUE dice qué es el tramo
/// —trabajo naranja, recuperación gris— y el BRILLO dice dónde estás —hecho, en
/// curso, por venir—.
struct WatchAroEstructura: View {
    let arcos: [ArcoDeTramo]
    let enCurso: Int
    /// Avance dentro del tramo en curso (0…1). Cero cuando nadie lo mide: el arco
    /// se queda a medio brillo y no promete una fracción que no existe.
    let fraccion: Double

    var body: some View {
        let pesos = arcos.map { max(0, $0.peso) }
        let suma = pesos.reduce(0, +)
        let total = suma > 0 ? suma : Double(max(1, arcos.count))
        // El hueco se estrecha con el número de arcos: fijo, un 12×400 con sus
        // recuperaciones (23 arcos) sería más hueco que aro.
        let hueco = min(Bisel.huecoSegmento, 1.0 / (Double(max(1, arcos.count)) * 4))
        let avance = min(1, max(0, fraccion))

        ZStack {
            ForEach(Array(arcos.enumerated()), id: \.offset) { i, arco in
                let inicio = pesos.prefix(i).reduce(0, +) / total
                let ancho = (suma > 0 ? max(0, arco.peso) : 1) / total
                let desde = inicio + hueco / 2
                let hasta = max(desde, inicio + ancho - hueco / 2)
                let color = arco.trabajo ? Bisel.colorAro : Bisel.colorRecupera

                WatchPantallaTrazado(inset: Bisel.inset)
                    .trim(from: desde, to: hasta)
                    .stroke(color.opacity(brillo(i)),
                            style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))

                if i == enCurso, avance > 0 {
                    WatchPantallaTrazado(inset: Bisel.inset)
                        .trim(from: desde, to: max(desde, desde + (hasta - desde) * avance))
                        .stroke(color, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))
                }
            }
        }
        // La hora del sistema se queda libre: el aro se interrumpe donde la esquina pasa por sus cifras.
        .mask {
            GeometryReader { g in
                let hora = WatchPantalla.cajaDeLaHora(en: g.size)
                Rectangle()
                    .overlay {
                        Rectangle()
                            .frame(width: hora.width, height: hora.height)
                            .position(x: hora.midX, y: hora.midY)
                            .blendMode(.destinationOut)
                    }
                    .compositingGroup()
            }
        }
        .allowsHitTesting(false)
        .animation(.easeOut(duration: 0.35), value: enCurso)
        .animation(.linear(duration: 0.6), value: fraccion)
    }

    private func brillo(_ i: Int) -> Double {
        if i < enCurso { return Bisel.brilloHecho }
        if i == enCurso { return Bisel.brilloEnCurso }
        return Bisel.brilloPendiente
    }
}
