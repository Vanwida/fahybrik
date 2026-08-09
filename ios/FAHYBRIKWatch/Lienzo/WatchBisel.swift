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
    static let inset: CGFloat = 4
    static let colorAro = WatchTheme.orangeSoft
    static let colorVia = Color.white.opacity(0.12)
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

// MARK: - El trazado: la FORMA DE LA PANTALLA, no un círculo

/// EL BISEL SIGUE EL BORDE DEL RELOJ, Y ESO NO ES UN DETALLE.
///
/// El port de agosto dibujó los dos aros con `Circle()`, que es el idioma de un
/// reloj REDONDO (Garmin, Wear OS). En un Apple Watch la pantalla es un
/// rectángulo redondeado, y un círculo inscrito en él hace justo lo contrario de
/// lo que este kit persigue: se come las cuatro esquinas —el sitio más barato que
/// hay, porque no cuesta ni un punto de contenido— y estrecha el ancho útil, que
/// es EL recurso escaso de la muñeca (`kit-watch/modelo.ts`: aquí no limita el
/// alto, limita el ancho). Encima el trazo curva hacia dentro por abajo y se
/// mete por encima del segundo nivel.
///
/// Es el trazado de `kit-watch/bisel.tsx`, punto por punto: arranca en las 12 y
/// va en sentido horario, como cualquier reloj, para que `trim` avance igual que
/// el `strokeDashoffset` del doble.
struct BiselTrazado: Shape {
    var inset: CGFloat

    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        // La proporción del kit: 56 pt de radio sobre 208 de ancho. Se deriva del
        // ancho y no se fija en puntos para que valga en las tres cajas de Apple
        // Watch sin tocar nada (watchOS no expone el radio real de la pantalla).
        let base = w * (56.0 / 208.0)
        let r = max(0, min(base - inset, min(w, h) / 2 - inset))

        var p = Path()
        p.move(to: CGPoint(x: w / 2, y: inset))
        p.addLine(to: CGPoint(x: w - inset - r, y: inset))
        p.addArc(center: CGPoint(x: w - inset - r, y: inset + r), radius: r,
                 startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: w - inset, y: h - inset - r))
        p.addArc(center: CGPoint(x: w - inset - r, y: h - inset - r), radius: r,
                 startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: inset + r, y: h - inset))
        p.addArc(center: CGPoint(x: inset + r, y: h - inset - r), radius: r,
                 startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: inset, y: inset + r))
        p.addArc(center: CGPoint(x: inset + r, y: inset + r), radius: r,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

// MARK: - Aro continuo

/// Una sola cosa en marcha (minuto EMOM, descanso, ventana AMRAP).
/// `remaining` es lo que QUEDA, de 1 a 0: el trazo se retrae hacia las 12.
struct WatchAroContinuo: View {
    let remaining: Double

    var body: some View {
        let queda = min(1, max(0, remaining))
        ZStack {
            BiselTrazado(inset: Bisel.inset)
                .stroke(Bisel.colorVia, lineWidth: Bisel.grosor)
            BiselTrazado(inset: Bisel.inset)
                .trim(from: 0, to: queda)
                .stroke(
                    Bisel.colorAro,
                    style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .round)
                )
                .animation(.linear(duration: 0.9), value: queda)
        }
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
                BiselTrazado(inset: Bisel.inset)
                    .trim(from: start, to: endBase)
                    .stroke(Bisel.colorVia, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))

                if lleno > 0 {
                    BiselTrazado(inset: Bisel.inset)
                        .trim(from: start, to: max(start + 0.001, end))
                        .stroke(Bisel.colorAro, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))
                }
            }
        }
        .allowsHitTesting(false)
        .animation(.easeOut(duration: 0.35), value: hechas)
        .animation(.linear(duration: 0.6), value: fraccion)
    }
}

// MARK: - Aro de estructura

/// EL ON/OFF DE LA SERIE ENTERA — un arco por tramo de la fase, en orden.
///
/// Dos ejes y ninguna excepción (ver `FormaDelAro`): el HUE dice qué es el tramo
/// —trabajo naranja, recuperación gris— y el BRILLO dice dónde estás —hecho, en
/// curso, por venir—. El aro segmentado de arriba sigue valiendo para lo que se
/// cuenta por repeticiones iguales (fuerza, ergo); esto vale cuando los trozos
/// no son iguales Y la mitad de ellos son recuperación.
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

                BiselTrazado(inset: Bisel.inset)
                    .trim(from: desde, to: hasta)
                    .stroke(color.opacity(brillo(i)),
                            style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))

                if i == enCurso, avance > 0 {
                    BiselTrazado(inset: Bisel.inset)
                        .trim(from: desde, to: max(desde, desde + (hasta - desde) * avance))
                        .stroke(color, style: StrokeStyle(lineWidth: Bisel.grosor, lineCap: .butt))
                }
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

// MARK: - Helper AnyView

extension View {
    /// Empaqueta un bisel para pasarlo a `WatchReloj.bisel`.
    func watchBisel() -> AnyView { AnyView(self) }
}
