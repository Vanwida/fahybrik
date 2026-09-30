import SwiftUI

// LOS TOKENS DE PINTURA DE LA CARA DE CORRER DE LA MUÑECA.
//
// Aquí solo se traduce a SwiftUI lo que el núcleo puro ya decide: los hex de
// `Vivo.C`, la escala de `Vivo.TipoMuneca`, los altos de `Vivo.Fila`, el aire
// entre filas y las safe areas de `Vivo.MedidasMuneca`. Ninguna vista de esta
// carpeta escribe un tamaño, un peso o un color que no salga de aquí o del
// `CuadroMuneca` (modelo §3, P6 y P7). SF nativo (en el reloj, SF Compact),
// cifras de ancho fijo, rectas, y NADA por debajo de 15 pt (`Vivo.suelo`).

// MARK: - Las medidas del lienzo, por el entorno

private struct MunecaMedidasKey: EnvironmentKey {
    static let defaultValue = Vivo.MedidasMuneca.mm46
}

extension EnvironmentValues {
    /// El lienzo real de este reloj. Lo inyecta `MunecaMedidor`; la MISMA medida
    /// con la que quien alimenta la muñeca ha calculado el `CuadroMuneca`.
    var munecaMedidas: Vivo.MedidasMuneca {
        get { self[MunecaMedidasKey.self] }
        set { self[MunecaMedidasKey.self] = newValue }
    }
}

// MARK: - Color

enum MunecaPaleta {
    static let fondo = WatchTheme.hex(Vivo.C.fondo)
    static let superficie2 = WatchTheme.hex(Vivo.C.superficie2)
    /// El carril apagado de una banda o de un contador.
    static let carril = WatchTheme.hex(Vivo.C.carril)
    static let tinta = WatchTheme.hex(Vivo.C.tinta)
    static let tinta2 = WatchTheme.hex(Vivo.C.tinta2)
    static let sobreAccion = WatchTheme.hex(Vivo.C.sobreAccion)

    /// Naranja de marca, SOLO acción (botones, control activo). El club puede
    /// traer el suyo: lo resuelve `WatchTheme`.
    static var accion: Color { WatchTheme.orange }

    /// El rango del objetivo dentro de una banda a ritmo. Espejo de `banda.tsx`,
    /// que lo lleva como literal: un gris más claro que el carril, sin ser tinta2.
    static let bandaObjetivo = WatchTheme.hex(0x6B6B70)
    /// La gota del Water Lock: el azul del sistema, no el de una zona.
    static let agua = WatchTheme.hex(0x5AC8FA)
    /// El velo de las capas a pantalla completa.
    static let velo = Color.black.opacity(0.72)

    /// El color de una zona del espectro del coach.
    static func zona(_ hex: UInt32) -> Color { WatchTheme.hex(hex) }
}

// MARK: - Tipo

enum MunecaTipo {
    static func peso(_ p: Int) -> Font.Weight {
        p >= 700 ? .bold : p >= 600 ? .semibold : .medium
    }

    /// Una cifra o un texto de la escala: SF, ancho fijo en las cifras.
    static func fuente(_ cuerpo: Double, _ peso: Int) -> Font {
        .system(size: CGFloat(cuerpo), weight: Self.peso(peso)).monospacedDigit()
    }

    static func contexto(_ cuerpo: Double) -> Font { fuente(cuerpo, Vivo.TipoMuneca.pesoContexto) }
    static let nota = fuente(Vivo.TipoMuneca.nota, Vivo.TipoMuneca.pesoNota)
    static let notaNegrita = fuente(Vivo.TipoMuneca.nota, 700)
    static let notaSemibold = fuente(Vivo.TipoMuneca.nota, 600)
    static let boton = fuente(17, 600)
    /// El peso de las cifras de dato (segundo, tercero y las filas de Datos).
    static let pesoDato = 600

    /// La reducción máxima de una línea de `cuerpo` sin pasar del suelo de 15 pt.
    static func reduccionMaxima(_ cuerpo: Double) -> CGFloat { CGFloat(Vivo.suelo / Swift.max(cuerpo, Vivo.suelo)) }
}

// MARK: - Forma

enum MunecaForma {
    /// Ancho de los botones del descanso: «+30 s» y la acción del momento.
    static let anchoMas30: CGFloat = 60
    /// Lo mínimo que se le deja a «+30 s» en un reloj estrecho (el resto es de la acción del momento).
    static let anchoMas30Minimo: CGFloat = 46
    static let anchoEmpezarYa: CGFloat = 114
    static let altoBoton = CGFloat(Vivo.Fila.boton.alto)
    /// Un control de la página izquierda: lo que tiene de ancho y de alto a 46 mm.
    static let controlAncho: CGFloat = 86
    static let controlAlto: CGFloat = 58
    static let controlRadio: CGFloat = 20
    static let controlHueco: CGFloat = 12
    static let controlAireRotulo: CGFloat = 5
    /// Un botón tocable no baja de 44 pt.
    static let tocableMin = CGFloat(Vivo.Fila.botonReal)
    /// El aire lateral del rótulo dentro de un botón (poco: en 40 mm cada punto cuenta).
    static let aireBoton: CGFloat = 4
    /// El de los botones de un descanso, que comparten fila y en 40 mm rozan lo que su rótulo mide.
    static let aireRotuloBoton: CGFloat = 2
    static let huecoBotones: CGFloat = 4
    /// La tarjeta del km: radio, aire y sitio desde arriba.
    static let capaRadio: CGFloat = 26
    static let capaDesdeArriba: CGFloat = 26
    static let capaLados: CGFloat = 4
    /// El valor de la tarjeta del km (cifra grande, sin unidad).
    static let capaValor: CGFloat = 56
    /// La marca de la banda: la raya de «dentro» y el triángulo de «fuera».
    static let pistaBanda: CGFloat = 8
    static let alturaMarca: CGFloat = 16
    static let radioMarca: CGFloat = 2
    static let opacidadZonaFuera: Double = 0.26
    static let contornoMarca: CGFloat = 1.5
    /// El aire mínimo entre el rótulo de la banda y su palabra.
    static let huecoBanda: CGFloat = 6
    /// La sangría del cuerpo de la página Datos desde la izquierda, y el alto de una fila a 46 mm.
    static let sangriaDatos: CGFloat = 10
    static let altoFilaDato: Double = 38
    /// Una fila de la página Vueltas a 46 mm; el hueco que se guarda a la derecha (ahí van los puntos de la corona).
    static let altoFilaVuelta: Double = 30
    static let aireDerechaVueltas: CGFloat = 10
    /// El ancho máximo de la columna del número de vuelta («km 12», «2·4»).
    static let anchoNumeroVuelta: Double = 34
    /// Una fila de la Estructura: el punto, el aire entre punto y texto, y el aire entre filas.
    static let puntoEstructura: CGFloat = 8
    static let puntoAire: CGFloat = 8
    static let puntoBaja: CGFloat = 5
    static let huecoEstructura: CGFloat = 8
    /// Una marca por ronda del Tabata: el punto y el aire entre puntos (la fila mide `Vivo.Fila.pista`).
    static let marcaRonda: CGFloat = 8
    static let marcaRondaAire: CGFloat = 6
    /// La interlínea de SF sobre el cuerpo, y el aire entre la línea de una fila de lista y su detalle.
    static let interlinea: Double = 1.2
    static let huecoLineasLista: Double = 2

    /// La anotación de fuerza: una columna de dato (alto y esquina), el borde del dato encendido, la píldora de una serie
    /// y la marca ✓ / aro.
    static let radioColumna: CGFloat = 16
    /// El hueco entre el valor de una columna y su etiqueta.
    static let huecoDatoColumna: CGFloat = 4
    static let bordeActivo: CGFloat = 2
    static let anchoPildora: CGFloat = 178
    static let marcaTalla = CGFloat(Vivo.MedidaPildora.marca)
    /// La página Ejercicios: la sangría del cuerpo y de las series, el punto del ejercicio, el número de serie y lo que se apaga lo que viene.
    static let sangriaEjercicios: CGFloat = 12
    static let sangriaSerie: CGFloat = 15
    static let puntoEjercicio: CGFloat = 8
    static let anchoNumeroSerie: CGFloat = 12
    static let opacidadLuego: Double = 0.7
    /// El recorrido del contador de muescas de la corona del dato (solo cuenta muescas, no es un valor).
    static let recorridoCorona: Double = 1000

    /// El aviso de deshacer: el aire entre lo que se cerró y «Deshacer», y el alto de su barra que se vacía.
    static let huecoDeshacer: CGFloat = 3
    static let altoBarraDeshacer: CGFloat = 2

    /// Lo que se apaga la página cuando hay pausa: el dato no desaparece, se apaga.
    static let opacidadPausa: Double = 0.32
    static let trackingPausa: CGFloat = 1.2
    static let iconoControl: CGFloat = 22
    /// Los tres puntos de las áreas (izquierda · vivo · derecha), abajo y solo un momento.
    static let puntoArea: CGFloat = 5
    static let puntoAreaAire: CGFloat = 5
    static let puntoAreaAbajo: CGFloat = 5
    static let puntoAreaApagado: Double = 0.35
    static let puntosAreaSegundos: Double = 1.6

    /// El degradado del fondo del Vivo: negro arriba (el aro y la hora del sistema) y
    /// abajo (el OLED no gasta), el tinte a la vista en el centro. Espejo de `carcasa.tsx#Fondo`.
    static let degradadoFondo: [Gradient.Stop] = [
        .init(color: .black, location: 0),
        .init(color: .black.opacity(0.7), location: 0.16),
        .init(color: .black.opacity(0), location: 0.44),
        .init(color: .black.opacity(0.55), location: 0.72),
        .init(color: .black, location: 1),
    ]
    /// El velo de la pausa: transparente hasta el 30 % y negro casi opaco a partir del 70 %.
    static let degradadoPausa: [Gradient.Stop] = [
        .init(color: .black.opacity(0), location: 0.3),
        .init(color: .black.opacity(0.85), location: 0.7),
    ]
}
