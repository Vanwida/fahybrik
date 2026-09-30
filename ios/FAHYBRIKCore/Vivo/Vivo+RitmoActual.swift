import Foundation

// EL RITMO ACTUAL — lo que corres AHORA, no la media (P3, modelo §2 y §8).
//
// El builder de Salud entrega la distancia acumulada a golpes (cada pocos
// segundos, y ninguno si estás quieto). De esas muestras (t, metros) sale UN
// número: el ritmo de los últimos 10 s. Es la lectura que juzga la banda del
// objetivo y la que se pinta en el héroe; la media del paso es otra cosa y se
// rotula «medio».
//
// Función PURA, Foundation: compila en el reloj y en el móvil, y se prueba sin
// GPS. Todo lo que aquí se decide es MECANISMO (cómo se sabe que un dato es
// creíble), no método del coach: otro entrenador no lo pondría en otro sitio.
//
// HONESTIDAD (la regla que manda): cuando no se sabe, `nil`. Jamás un cero, ni
// un ritmo de alguien de pie, ni el último valor congelado. El pintor cae
// entonces a lo siguiente que sí se sabe (lo que falta, el crono).

extension Vivo {

    /// Una muestra de la distancia ACUMULADA que entrega el builder: `t` en
    /// segundos de sesión activa (sin pausas; la misma escala que el reloj del
    /// paso) y `metros` desde el principio de la sesión.
    struct MuestraDeDistancia: Equatable {
        var t: Double
        var metros: Double
    }

    /// Las constantes del ritmo actual. Mecanismo nuestro: cada una lleva su porqué.
    enum RitmoActual {
        /// La ventana: lo que dura «ahora» (~10 s). Más corta baila con el GPS; más larga llega tarde a un cambio de ritmo.
        static let ventanaS: Double = 10

        /// Menos metros que esto en la ventana y no hay ritmo que decir: con 10 m el
        /// error de posición del GPS (unos 5 m) es la mitad de la medida.
        static let metrosMinimos: Double = 10

        /// Cuánto tiempo hay que haber MIRADO para fiarse: media ventana. Al arrancar,
        /// el primer fijado del GPS suele saltar y un ritmo sacado de 1 s de datos es ruido.
        static let observacionMinimaS: Double = ventanaS / 2

        /// Techo de honestidad (el mismo que el resto de la app): por encima de 20:00/km
        /// no se está corriendo y el número describiría a alguien caminando o de pie.
        static let techoS: Double = Vivo.ritmoTechoS

        /// Nadie corre más rápido que esto (11 m/s, ~1:30/km, un esprínter de élite): un
        /// tramo así es un salto del GPS, y se descarta ese tramo, no la ventana entera.
        static let velocidadMaximaMS: Double = 11

        /// Tope de la cola de muestras: no crece sin límite aunque el builder entregue muy seguido.
        static let muestrasMaximas = 64
    }

    /// El ritmo actual (s/km) sobre las muestras acumuladas, en el instante `ahora`
    /// (misma escala de `t`). `nil` si no se sabe: sin muestras, sin observación
    /// suficiente, quieto (menos de 10 m), más lento que 20:00/km, o con tramos
    /// imposibles que dejan menos de lo necesario.
    ///
    /// Cómo se cuenta:
    ///  · cada par de muestras seguidas es un tramo con su tiempo y sus metros;
    ///  · la ventana son los últimos 10 s hasta `ahora`; un tramo que la cruza
    ///    aporta la parte que cae dentro (a velocidad uniforme);
    ///  · desde la última muestra hasta `ahora` cuenta como quieto: si el builder
    ///    calla porque paraste, el ritmo se degrada solo hasta desaparecer;
    ///  · un tramo que retrocede (el GPS se corrige) o que va a más de 11 m/s (un
    ///    salto) no cuenta, ni sus metros ni su tiempo.
    static func ritmoActual(_ muestras: [MuestraDeDistancia], ahora: Double) -> Double? {
        guard ahora.isFinite else { return nil }
        // Solo lo que existe a `ahora`, finito, y en orden estricto de tiempo.
        var pts: [MuestraDeDistancia] = []
        for m in muestras where m.t.isFinite && m.metros.isFinite && m.t <= ahora {
            if let ultima = pts.last, m.t <= ultima.t { continue }
            pts.append(m)
        }
        guard let ultima = pts.last else { return nil }

        let desde = ahora - RitmoActual.ventanaS
        var tramos: [(t0: Double, t1: Double, metros: Double)] = []
        for (a, b) in zip(pts, pts.dropFirst()) { tramos.append((a.t, b.t, b.metros - a.metros)) }
        // Desde la última muestra hasta `ahora`: nadie ha dicho que te movieras.
        if ahora > ultima.t { tramos.append((ultima.t, ahora, 0)) }

        var segundos = 0.0
        var metros = 0.0
        for tr in tramos {
            let dt = tr.t1 - tr.t0
            guard dt > 0, tr.metros >= 0, tr.metros / dt <= RitmoActual.velocidadMaximaMS else { continue }
            let dentro = Swift.min(tr.t1, ahora) - Swift.max(tr.t0, desde)
            guard dentro > 0 else { continue }
            segundos += dentro
            metros += tr.metros * dentro / dt
        }

        guard segundos >= RitmoActual.observacionMinimaS, metros >= RitmoActual.metrosMinimos else { return nil }
        let ritmo = segundos / (metros / 1000)
        guard ritmo.isFinite, ritmo > 0, ritmo <= RitmoActual.techoS else { return nil }
        return ritmo
    }

    /// La cola de muestras que el reloj va llenando con lo que entrega el builder.
    /// Guarda lo justo para la ventana (y una muestra antes, para que el primer
    /// tramo de la ventana tenga su origen) y contesta `ritmo(ahora:)`.
    struct VentanaDeRitmo: Equatable {
        private(set) var muestras: [MuestraDeDistancia] = []
        private var acumulados: Double = 0

        init() {}

        /// Una lectura de la distancia ACUMULADA del builder.
        mutating func anotar(t: Double, metros: Double) {
            guard t.isFinite, metros.isFinite else { return }
            muestras.append(MuestraDeDistancia(t: t, metros: metros))
            acumulados = metros
            recortar(hasta: t)
        }

        /// Una lectura por DELTA (lo que entrega `onDistanceDelta`): la acumula ella.
        mutating func anotar(t: Double, deltaMetros: Double) {
            guard deltaMetros.isFinite, deltaMetros >= 0 else { return }
            anotar(t: t, metros: acumulados + deltaMetros)
        }

        /// Empezar de cero (otra sesión). Las pausas NO la reinician: el tiempo activo no avanza en ellas.
        mutating func reiniciar() {
            muestras = []
            acumulados = 0
        }

        func ritmo(ahora: Double) -> Double? { Vivo.ritmoActual(muestras, ahora: ahora) }

        private mutating func recortar(hasta t: Double) {
            let corte = t - RitmoActual.ventanaS
            // Se conserva la última muestra ANTERIOR al corte: es el origen del primer tramo de la ventana.
            if let k = muestras.lastIndex(where: { $0.t < corte }), k > 0 { muestras.removeFirst(k) }
            if muestras.count > RitmoActual.muestrasMaximas { muestras.removeFirst(muestras.count - RitmoActual.muestrasMaximas) }
        }
    }
}
