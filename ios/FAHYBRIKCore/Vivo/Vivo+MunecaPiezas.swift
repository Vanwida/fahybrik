import Foundation

// LAS PIEZAS DEL CUADRO DE LA MUÑECA — el lienzo, la escala de tipo y las
// medidas de cada línea, sin pintar nada (espejo de la parte pura de
// `kit-reloj/tokens.ts` y de `piezas.tsx`). La vista de la muñeca NO mide ni
// decide: `Vivo.cuadroMuneca` le dice qué pintar y a qué cuerpo.
//
// Medir texto es una ESTIMACIÓN con métricas de SF Pro (`Vivo.anchoTexto`),
// determinista: la misma en el doble web, en el examen de oro y en el reloj.

extension Vivo {

    // MARK: - El lienzo

    /// El lienzo de la muñeca en pt. La app de la muñeca pasa el tamaño de su
    /// pantalla; el útil es lo que queda dentro de las safe areas del modelo (§3).
    struct MedidasMuneca: Equatable {
        var ancho: Double
        var alto: Double
        /// Hasta dónde llega la hora del sistema por arriba, en pt desde el borde de la pantalla. La pinta
        /// watchOS arriba a la derecha, más baja cuanto más grande es el reloj, y nada suyo puede pisarla.
        /// El lienzo del kit no la lleva (0: vale `arribaSafe`); el reloj real la MIDE por talla
        /// (`WatchPantalla.horaAbajo`) y el núcleo mide todo contra `arriba`, no contra el 24 fijo.
        var horaAbajo: Double = 0

        /// 42 mm, 46 mm y 49 mm (el ajuste por ancho los sirve a todos).
        static let mm42 = MedidasMuneca(ancho: 187, alto: 223)
        static let mm46 = MedidasMuneca(ancho: 208, alto: 248)
        static let mm49 = MedidasMuneca(ancho: 205, alto: 251)

        /// Safe areas: arriba la hora del sistema, lados, abajo. `arribaSafe` es el suelo del lienzo del kit;
        /// el reloj real sube hasta `arriba` cuando su hora baja más.
        static let arribaSafe: Double = 24
        /// Aire entre la base de la hora y la primera fila.
        static let aireHora: Double = 2
        static let abajoSafe: Double = 12
        static let ladoSafe: Double = 10
        /// Aire del héroe: 1 pt por lado.
        static let aireHeroe: Double = 2
        /// Lo que dejan las esquinas redondeadas y el aro sobre el ancho útil de 46 mm:
        /// ~176 pt a la primera fila (el contexto) y ~160 a la última (el pie).
        static let anchoUtil46: Double = 188
        static let cabeza46: Double = 176
        static let pie46: Double = 160

        var anchoUtil: Double { ancho - 2 * Self.ladoSafe }
        /// Lo que se reserva arriba: la hora del sistema y su aire, o el suelo del kit si la hora queda por encima.
        var arriba: Double { max(Self.arribaSafe, horaAbajo + Self.aireHora) }
        var altoUtil: Double { alto - arriba - Self.abajoSafe }
        var anchoHeroe: Double { anchoUtil - Self.aireHeroe }
        /// Las esquinas se comen lo mismo en proporción a cualquier tamaño.
        var anchoCabeza: Double { anchoUtil * Self.cabeza46 / Self.anchoUtil46 }
        var anchoPie: Double { anchoUtil * Self.pie46 / Self.anchoUtil46 }

        /// Desde el área útil (lo que ya descontó las safe areas).
        static func deUtil(ancho: Double, alto: Double) -> MedidasMuneca {
            MedidasMuneca(ancho: ancho + 2 * ladoSafe, alto: alto + arribaSafe + abajoSafe)
        }
    }

    // MARK: - La escala de tipo (P7): un cuerpo por papel

    enum TipoMuneca {
        static let contexto: Double = 16
        static let pesoContexto = 600
        static let nota: Double = 15
        static let pesoNota = 500
        static let segundo: Double = 30
        static let tercero: Double = 22
        static let instruccion: Double = 22
        /// Una línea de nota que se pasa menos de un 4 % se deja en una: el
        /// estimador redondea SF hacia arriba y en SF cabe.
        static let holguraEstima: Double = 1.04
    }

    /// Lo que se lleva de alto cada fila de una lámina, en pt (caja de línea). El
    /// héroe se queda con lo que sobra: `altoHeroe`.
    enum Fila: Equatable {
        case contexto, etiquetaHeroe, banda, instruccion, segundo, tercero, nota
        /// Una nota en dos líneas («sin enlace · la muñeca sigue grabando»).
        case nota2
        case pista, boton

        var alto: Double {
            switch self {
            case .contexto: return 20
            case .etiquetaHeroe: return 18
            case .banda: return 32
            case .instruccion: return 26
            case .segundo: return 34
            case .tercero: return 26
            case .nota: return 18
            case .nota2: return 32
            case .pista: return 18
            case .boton: return 48
            }
        }
    }

    /// Aire entre filas.
    static let huecoFila: Double = 4

    /// Lo que le queda de alto al héroe con estas filas (cada una con su hueco).
    static func altoLibre(_ alturas: [Double], _ m: MedidasMuneca) -> Double {
        m.altoUtil - alturas.reduce(0) { $0 + $1 + huecoFila } - huecoFila
    }

    static func altoHeroe(_ filas: [Fila], _ m: MedidasMuneca) -> Double { altoLibre(filas.map(\.alto), m) }

    // MARK: - Lo que se pinta, medido

    struct LineaTexto: Equatable {
        var texto: String
        /// El cuerpo al que cabe, nunca por debajo de 15 pt.
        var cuerpo: Double
    }

    struct NotaVista: Equatable {
        var texto: String
        /// Un arranque en tinta2 delante del texto: «Luego ·», «Viene:».
        var prefijo: String? = nil
        /// En cuántas líneas va: 1 o 2 (nunca se encoge por debajo de 15 pt).
        var lineas: Int
    }

    struct HeroeMuneca: Equatable {
        var vista: HeroeVista
        var talla: TallaHeroe
        /// El alto que le dejan las filas presentes, ya sin la fila de su etiqueta.
        var altoMax: Double
    }

    /// Una línea de dato (segundo a 30 pt, tercero a 22): el valor baja de cuerpo,
    /// sin pasar de 15 pt, antes que salirse de su ancho.
    struct LineaDeDato: Equatable {
        var vista: LineaVista
        /// El cuerpo nominal del papel (30 o 22).
        var cuerpo: Double
        /// El cuerpo al que cabe el valor.
        var cuerpoValor: Double
        var ancho: Double
    }

    /// El contexto: «Tanda 2/3 · Serie 4/6 · 1′» pierde el «1′» antes que la
    /// posición, y solo si ni a 15 pt cabe; si cabe a 15 baja de 16 a 15.
    static func contextoQueCabe(_ partes: [String], _ m: MedidasMuneca) -> LineaTexto {
        var usadas = partes.filter { !$0.isEmpty }
        func cabe(_ x: [String]) -> Bool {
            anchoTexto(x.joined(separator: " · "), suelo, peso: TipoMuneca.pesoContexto) <= m.anchoCabeza
        }
        while usadas.count > 1, !cabe(usadas) { usadas.removeLast() }
        let texto = usadas.joined(separator: " · ")
        return LineaTexto(texto: texto, cuerpo: cuerpoQueCabe(texto, TipoMuneca.contexto, ancho: m.anchoCabeza, peso: TipoMuneca.pesoContexto))
    }

    /// ¿En cuántas líneas va una nota? Una si cabe en el ancho útil; si no, dos.
    static func lineasDeNota(_ texto: String, ancho: Double) -> Int {
        anchoTexto(texto, TipoMuneca.nota, peso: TipoMuneca.pesoNota) <= ancho * TipoMuneca.holguraEstima ? 1 : 2
    }

    static func notaVista(_ texto: String, prefijo: String? = nil, ancho: Double) -> NotaVista {
        let completo = prefijo.map { "\($0) \(texto)" } ?? texto
        return NotaVista(texto: texto, prefijo: prefijo, lineas: lineasDeNota(completo, ancho: ancho))
    }

    /// La fila que ocupa una nota: 18 pt en una línea, 32 en dos.
    static func filaDeNota(_ n: NotaVista) -> Fila { n.lineas == 2 ? .nota2 : .nota }

    /// Una instrucción («RPE 7 · fuerte»): 22 pt, al ancho útil.
    static func instruccionQueCabe(_ texto: String, _ m: MedidasMuneca) -> LineaTexto {
        LineaTexto(texto: texto, cuerpo: cuerpoQueCabe(texto, TipoMuneca.instruccion, ancho: m.anchoUtil))
    }

    /// El héroe con su talla: el mayor de la escala que cabe en el ancho y en lo que dejan las filas.
    static func heroeMuneca(_ h: HeroeVista, filas: [Fila], _ m: MedidasMuneca) -> HeroeMuneca {
        let alto = altoHeroe(filas, m) - (h.etiqueta != nil ? Fila.etiquetaHeroe.alto : 0)
        return HeroeMuneca(vista: h, talla: tallaHeroe(h.texto, unidad: h.unidad, ancho: m.anchoHeroe, altoMax: alto), altoMax: alto)
    }

    /// Lo que la etiqueta, el glifo, la unidad, la tendencia, la zona y el aviso le
    /// quitan de ancho al valor de una línea (los mismos anchos que la pieza web).
    private static let anchoGlifo: Double = 18
    private static let anchoTendencia: Double = 14
    private static let anchoZona: Double = 28
    private static let huecoEtiqueta: Double = 6
    private static let huecoUnidadLinea: Double = 3
    private static let huecoAviso: Double = 8

    static func lineaDeDato(_ l: LineaVista, cuerpo: Double, ancho: Double) -> LineaDeDato {
        var extra = 0.0
        if let e = l.etiqueta { extra += anchoTexto(e, TipoMuneca.nota) + huecoEtiqueta }
        if l.glifo { extra += anchoGlifo }
        if let u = l.unidad { extra += anchoTexto(u, TipoMuneca.nota) + huecoUnidadLinea }
        if l.tendencia != nil { extra += anchoTendencia }
        if l.zona != nil { extra += anchoZona }
        if let a = l.aviso { extra += anchoTexto("\(a.marca) \(a.texto)", TipoMuneca.nota) + huecoAviso }
        return LineaDeDato(vista: l, cuerpo: cuerpo, cuerpoValor: cuerpoQueCabe(l.valor, cuerpo, ancho: ancho - extra), ancho: ancho)
    }

    /// Lo que dice la cuenta atrás bajo el contexto, PURO: solo lo que el contexto
    /// no dice: el movimiento («Wall Balls») y contra qué entras («a 3:45–3:55»).
    /// Un rodaje «Rodaje · Z2 · 40′» ya lo lleva todo arriba: `nil`, y el 3-2-1 gana la fila.
    static func textoCuenta(_ p: Paso) -> String? {
        let contexto = contextoDe(p)
        let obj = principal(p).map { fmtObjetivo($0) }
        let nombre = p.nombre.flatMap { n in contexto.contains { $0.contains(n) } ? nil : n }
        let objetivo = obj.flatMap { o in contexto.contains(o) ? nil : "a \(o)" }
        let texto = [nombre, objetivo].compactMap { $0 }.joined(separator: " · ")
        return texto.isEmpty ? nil : texto
    }
}
