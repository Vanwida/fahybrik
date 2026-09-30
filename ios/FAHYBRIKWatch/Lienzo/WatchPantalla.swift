import SwiftUI

// LA FORMA REAL DE LA PANTALLA DEL RELOJ — una sola fuente para todo lo que se
// dibuja pegado al borde (hoy, el aro de la sesión).
//
// Una pantalla de Apple Watch no es un rectángulo con esquinas circulares: es de
// curvatura continua, más «cuadrada» que un círculo del mismo tamaño. El aro con
// un radio fijo (56/208 del ancho, circular) se metía hacia dentro en las cuatro
// esquinas y no seguía el cristal. `ContainerRelativeShape` sí conoce la forma
// exacta, pero es una forma que solo se resuelve al pintarla: no da un `Path`, y
// el aro necesita recorrer el perímetro con `trim` a las 12 y en sentido horario.
//
// De dónde salen los números: no se han inventado. Xcode trae la máscara oficial
// de cada pantalla (`framebufferMask` del perfil de cada dispositivo del
// simulador, un PDF vectorial con el contorno del cristal). Se rasterizó cada una
// a 4× y se ajustó la esquina a una superelipse, |x/a|^n + |y/a|^n = 1, con una
// extensión `a` (pt que ocupa la curva a lo largo de cada borde) y un exponente
// `n` (cuánto de «cuadrada» es: 2 sería una elipse, más alto = más cuadrada). El
// error del ajuste contra la máscara es de 0,1 a 0,2 pt en todas las tallas.
// Las esquinas de una misma talla en pt son iguales entre generaciones que
// comparten cristal (SE y Series 4 a 6, Series 7 a 9, Series 10 a 12, Ultra 1 y 2,
// Ultra 3 y 4), por eso la tabla se indexa por ANCHO de pantalla.

enum WatchPantalla {

    /// La esquina de la pantalla: cuánto se extiende y cuánta curvatura continua lleva.
    struct Esquina: Equatable {
        /// Pt que ocupa la curva a lo largo de cada borde.
        let alcance: CGFloat
        /// Exponente de la superelipse (2 = elipse; más alto, más cuadrada).
        let exponente: Double
    }

    /// Medida del ajuste a la máscara de cada pantalla, por ancho en pt.
    private static let esquinasPorAncho: [(ancho: CGFloat, esquina: Esquina)] = [
        (162, Esquina(alcance: 37.9, exponente: 2.83)),  // 40 mm: SE, Series 4 a 6
        (176, Esquina(alcance: 47.7, exponente: 2.61)),  // 41 mm: Series 7 a 9
        (184, Esquina(alcance: 47.8, exponente: 3.00)),  // 44 mm: SE, Series 4 a 6
        (187, Esquina(alcance: 56.5, exponente: 2.62)),  // 42 mm: Series 10 a 12
        (198, Esquina(alcance: 51.4, exponente: 2.61)),  // 45 mm: Series 7 a 9
        (205, Esquina(alcance: 83.2, exponente: 3.29)),  // 49 mm: Ultra 1 y 2
        (208, Esquina(alcance: 63.9, exponente: 2.61)),  // 46 mm: Series 10 a 12
        (211, Esquina(alcance: 85.0, exponente: 3.19)),  // 49 mm: Ultra 3 y 4
    ]

    /// La esquina de la pantalla de este ancho. Un ancho que no está en la tabla (un
    /// reloj nuevo) toma la talla más parecida, con el alcance escalado por el ancho.
    static func esquina(ancho: CGFloat) -> Esquina {
        guard let cercana = esquinasPorAncho.min(by: { abs($0.ancho - ancho) < abs($1.ancho - ancho) }) else {
            return Esquina(alcance: 0, exponente: 2)
        }
        let escala = ancho / cercana.ancho
        return Esquina(alcance: cercana.esquina.alcance * escala, exponente: cercana.esquina.exponente)
    }

    // MARK: - La hora del sistema

    /// Dónde pinta watchOS la hora: arriba a la derecha, más baja y más metida cuanto más grande es el reloj.
    /// No es una constante: una primera fila a 24 pt fijos la pisaba en las tallas grandes, y el aro, que
    /// se mete hacia dentro en la esquina, chocaba con las cifras en todas.
    struct Hora: Equatable {
        /// Pt desde el borde de arriba hasta la base de las cifras.
        let abajo: CGFloat
        /// Pt desde el borde derecho hasta el final de las cifras.
        let margenDerecho: CGFloat
    }

    /// Alto y ancho de las cifras («15:52»): en todas las tallas medidas 10,5 a 11,5 pt de alto y 37 a
    /// 41 de ancho según los dígitos (el ancho se toma por arriba, la hora cambia cada minuto).
    static let altoCifras: CGFloat = 11
    static let anchoCifras: CGFloat = 42
    /// Aire que se deja a las cifras por todos lados: el aro no se acerca más.
    static let aireHora: CGFloat = 3

    /// MEDIDA, no supuesta: se lanzó la pantalla «hecho hoy» (negra, sin nada más arriba) en el simulador de
    /// cada talla que hay instalada y se tomó la caja de las cifras blancas de la captura. Las tallas sin
    /// simulador (41, 45 y 49 mm de Ultra 1 y 2) se interpolan por ancho entre las medidas vecinas;
    /// pendiente de comprobar en aparato.
    private static let horaPorAncho: [(ancho: CGFloat, hora: Hora)] = [
        (162, Hora(abajo: 21.0, margenDerecho: 10.5)),  // 40 mm
        (184, Hora(abajo: 25.0, margenDerecho: 12.0)),  // 44 mm
        (187, Hora(abajo: 28.0, margenDerecho: 14.5)),  // 42 mm
        (208, Hora(abajo: 31.5, margenDerecho: 16.0)),  // 46 mm
        (211, Hora(abajo: 34.0, margenDerecho: 18.0)),  // 49 mm Ultra 3
    ]

    /// La hora de un reloj de este ancho: la medida si hay, y si no la recta entre las dos vecinas (o la
    /// del extremo si el ancho queda fuera de la tabla).
    static func hora(ancho: CGFloat) -> Hora {
        let t = horaPorAncho
        guard let primera = t.first, let ultima = t.last else { return Hora(abajo: 0, margenDerecho: 0) }
        if ancho <= primera.ancho { return primera.hora }
        if ancho >= ultima.ancho { return ultima.hora }
        guard let i = t.lastIndex(where: { $0.ancho <= ancho }) else { return primera.hora }
        let a = t[i], b = t[i + 1]
        let f = (ancho - a.ancho) / (b.ancho - a.ancho)
        return Hora(abajo: a.hora.abajo + (b.hora.abajo - a.hora.abajo) * f,
                    margenDerecho: a.hora.margenDerecho + (b.hora.margenDerecho - a.hora.margenDerecho) * f)
    }

    /// La caja que ocupa la hora, con su aire, en una pantalla de este tamaño: lo que nada del lienzo pinta.
    static func cajaDeLaHora(en pantalla: CGSize) -> CGRect {
        let h = hora(ancho: pantalla.width)
        let derecha = pantalla.width - h.margenDerecho + aireHora
        let izquierda = derecha - anchoCifras - 2 * aireHora
        let abajo = h.abajo + aireHora
        let arriba = h.abajo - altoCifras - aireHora
        return CGRect(x: izquierda, y: arriba, width: pantalla.width - izquierda, height: abajo - arriba)
    }
}

/// El contorno de la pantalla, replegado `inset` pt hacia dentro. Arranca en las 12 y va en
/// sentido horario, como cualquier reloj, para que `trim` avance igual que el
/// `strokeDashoffset` del doble.
struct WatchPantallaTrazado: Shape {
    let inset: CGFloat

    /// Puntos por esquina: con un trazo de 5 pt a 0,1 pt de error no se ve el polígono.
    private static let puntosPorEsquina = 32

    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        let esquina = WatchPantalla.esquina(ancho: w)
        // Replegar la curva `inset` pt = mismo cuerpo con la esquina un `inset` más corta.
        let a = max(0, min(esquina.alcance - inset, min(w, h) / 2 - inset))
        let n = esquina.exponente

        var p = Path()
        p.move(to: CGPoint(x: w / 2, y: inset))
        // Cada esquina: su centro, los signos con que se recorre el cuarto de superelipse y si
        // se recorre de la cima al costado (`alReves`) o al revés, para seguir en sentido horario.
        let esquinas: [(centro: CGPoint, sx: CGFloat, sy: CGFloat, alReves: Bool)] = [
            (CGPoint(x: w - inset - a, y: inset + a), 1, -1, true),      // arriba a la derecha
            (CGPoint(x: w - inset - a, y: h - inset - a), 1, 1, false),    // abajo a la derecha
            (CGPoint(x: inset + a, y: h - inset - a), -1, 1, true),     // abajo a la izquierda
            (CGPoint(x: inset + a, y: inset + a), -1, -1, false),         // arriba a la izquierda
        ]
        for c in esquinas {
            for i in 0...Self.puntosPorEsquina {
                let t = CGFloat(i) / CGFloat(Self.puntosPorEsquina)
                let theta = (c.alReves ? 1 - t : t) * .pi / 2
                let u = CGFloat(pow(Double(cos(theta)), 2 / n))
                let v = CGFloat(pow(Double(sin(theta)), 2 / n))
                p.addLine(to: CGPoint(x: c.centro.x + c.sx * a * u, y: c.centro.y + c.sy * a * v))
            }
        }
        p.closeSubpath()
        return p
    }
}
