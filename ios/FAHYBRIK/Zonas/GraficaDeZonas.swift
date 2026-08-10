import Foundation

// TIEMPO EN ZONAS — el dato de la gráfica y toda su aritmética, sin una vista.
//
// El espejo Swift de `web/lib/zones/chart.ts`. Llega dentro de una sección de
// nota (forma `grafica`), pero NO es del comunicado: es del ATLETA, y la misma
// pieza es la que va a dibujar sus Analíticas.
//
// LA REGLA QUE MANDA SOBRE TODAS: una semana sin dato NO es un cero. El servidor
// manda sólo las semanas que midió y aquí las que faltan vuelven como una celda
// vacía. Un cero dice «no entrenó» y el hueco dice «no lo sabemos», y no son lo
// mismo ni para el atleta ni para el coach.
//
// Vive suelto del dibujo porque todo lo que esta gráfica puede equivocar es
// cuenta: qué semanas faltan, cuánto mide una barra, dónde empieza un rango. Aquí
// se prueba con un test; la vista sólo pinta rectángulos.
//
// MECANISMO, no método. Los cortes de las bandas los pone el coach y llegan
// resueltos en segundos por zona; esto sólo los apila. Las etiquetas son el
// CÓDIGO de la zona («Z3»), nunca un nombre de intensidad: cómo se llama Z3 es
// vocabulario de entrenador y llega del servidor donde hace falta.

// MARK: - Lo que llega por el cable

/// Una semana YA MEDIDA. Sólo llegan las semanas con dato: la ausencia se dice
/// no mandándola, y quien dibuja la reconstruye como hueco (`celdas`).
struct SemanaEnZonas: Codable, Equatable {
    /// Lunes de la semana, «YYYY-MM-DD». Cadena y no `Date`: la estrategia de
    /// fechas del cable espera un ISO 8601 completo y una fecha suelta tumbaría
    /// la fila entera.
    let weekStart: String
    let z1S: Int
    let z2S: Int
    let z3S: Int
    let z4S: Int
    let z5S: Int
    /// El tiempo que NO se pudo repartir: sin pulso, o con pulso pero sin umbral.
    let noHrS: Int
    /// Lo que el motor dice que suma. No se dibuja con él a propósito: la barra
    /// se levanta de sus bandas (`segundos`), y así lo que se pinta y lo que se
    /// rotula no pueden decir dos cosas distintas del mismo dato.
    let totalS: Int?

    /// Explícitas para poder escribir un decodificador tolerante sin perder el
    /// codificador sintetizado: la bandeja se cachea en disco con un coder plano
    /// y estas mismas claves son las que vuelven a leerse al arrancar en frío.
    enum CodingKeys: String, CodingKey {
        case weekStart, z1S, z2S, z3S, z4S, z5S, noHrS, totalS
    }

    /// Tolerante campo a campo: a una semana a la que le falte una zona le falta
    /// esa zona, no la semana. Sin esto un `z4_s` ausente tiraría la fila entera
    /// y la gráfica enseñaría un hueco donde sí hubo entreno.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weekStart = try c.decode(String.self, forKey: .weekStart)
        z1S = Self.leerSegundos(c, .z1S)
        z2S = Self.leerSegundos(c, .z2S)
        z3S = Self.leerSegundos(c, .z3S)
        z4S = Self.leerSegundos(c, .z4S)
        z5S = Self.leerSegundos(c, .z5S)
        noHrS = Self.leerSegundos(c, .noHrS)
        totalS = Self.leerSegundosOpcional(c, .totalS)
    }

    init(weekStart: String, z1S: Int = 0, z2S: Int = 0, z3S: Int = 0,
         z4S: Int = 0, z5S: Int = 0, noHrS: Int = 0, totalS: Int? = nil) {
        self.weekStart = weekStart
        self.z1S = z1S
        self.z2S = z2S
        self.z3S = z3S
        self.z4S = z4S
        self.z5S = z5S
        self.noHrS = noHrS
        self.totalS = totalS
    }

    /// Segundos que pueden llegar como entero o como decimal: Postgres sirve
    /// `numeric` y el JSON lo escribe con coma flotante en cuanto una suma no es
    /// redonda. Los dos son el mismo segundo.
    private static func leerSegundos(
        _ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys
    ) -> Int {
        leerSegundosOpcional(c, key) ?? 0
    }

    private static func leerSegundosOpcional(
        _ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys
    ) -> Int? {
        if let entero = try? c.decodeIfPresent(Int.self, forKey: key) { return entero }
        if let decimal = try? c.decodeIfPresent(Double.self, forKey: key) {
            return decimal.isFinite ? Int(decimal.rounded()) : nil
        }
        return nil
    }
}

/// De dónde salen las bandas del atleta. El número Y su evidencia: una banda
/// estimada que se enseña como medida es cómo un dato que nadie midió se
/// convierte en prueba (ver `HRZoneProfile.estimated`).
struct AnclaDeZonas: Codable, Equatable {
    /// Conjunto cerrado: `lthr_measured` · `lthr_declared` · `from_max_hr` ·
    /// `from_age`. Cadena y no enum: un origen que este binario no conozca deja
    /// el número, que sigue siendo cierto, en vez de tirar el ancla entera.
    let source: String
    let lthrBpm: Int
    /// La explicación que ESCRIBE el servidor, cuando la manda. Se prefiere
    /// siempre a la de aquí: la app no puede tener su propia versión de una
    /// frase que ya existe en el otro lado.
    var sourceLabel: String? = nil
}

/// Un rango de semanas que el coach ha marcado sobre la gráfica. Es DATO, no
/// dibujo: por eso se vuelve a pintar aquí, a este tamaño, sin ser una captura.
struct RangoDeZonas: Codable, Equatable {
    let label: String
    /// `atencion` · `bien` · `neutro`. Cadena y no enum por lo de siempre: un
    /// tono que no se conozca se lee neutro y el rango SE QUEDA.
    let tone: String
    /// Lunes de la primera semana y lunes de la última, las dos dentro.
    let weekStart: String
    let weekEnd: String

    var tono: TonoDeRango { TonoDeRango(cable: tone) }
}

/// Qué dice el coach de ese tramo. Tres y no cinco: llamar la atención, decir
/// que va bien, o sólo señalar. Un catálogo más fino sería su vocabulario.
enum TonoDeRango: String, CaseIterable {
    case atencion
    case bien
    case neutro

    init(cable: String?) {
        self = cable.flatMap(TonoDeRango.init(rawValue:)) ?? .neutro
    }
}

/// La gráfica entera, tal y como el servidor la resuelve al servir la nota. NO se
/// guarda dibujada: si se guardara, el día que el atleta conectara el reloj la
/// nota seguiría contando la historia vieja.
struct GraficaDeZonas: Codable, Equatable {
    /// Lunes de la PRIMERA semana de la ventana.
    let weekStart: String
    /// Cuántas semanas mide la ventana.
    let weeks: Int
    /// El filtro por tipo de entreno, si lo hubo. Nil = todo lo que hizo.
    var modality: String? = nil
    /// Sólo las semanas CON dato. Una fila mal formada se cae sola.
    @LossyArray var weeksData: [SemanaEnZonas] = []
    var anchor: AnclaDeZonas? = nil
    @LossyArray var ranges: [RangoDeZonas] = []

    /// ¿Hay alguna BARRA que dibujar? Cuando no la hay, la gráfica no se
    /// esconde: se dice con palabras (`PalabrasDeZonas.vacio`). Enseñar un eje
    /// con rejilla y nada dentro se leería como «no entrenaste», y esconder la
    /// sección dejaría al atleta sin saber que su coach fue a mirarlo.
    ///
    /// Se mira lo que se dibuja y no si llegó la fila: una semana medida a cero
    /// SÍ es una celda con dato (ahí sabemos que descansó, y eso no es un hueco),
    /// pero no levanta barra, así que un eje entero de ceros está igual de vacío.
    var estaVacia: Bool { celdas.allSatisfy { ($0.semana?.segundos ?? 0) <= 0 } }
}

// MARK: - El eje de semanas, con sus huecos

/// Una semana del eje: la que hay, o la que falta.
struct CeldaDeSemana: Identifiable, Equatable {
    let weekStart: String
    /// Nil = de esta semana no sabemos nada. Nunca es un cero.
    let semana: SemanaEnZonas?

    var id: String { weekStart }
}

extension GraficaDeZonas {
    /// La rejilla de la ventana con las semanas que faltan dentro, como huecos.
    ///
    /// El eje se ESTIRA si el servidor mandó una semana fuera de la ventana que
    /// declaró: ningún dato servido se cae del dibujo por un desfase de
    /// calendario entre los dos lados.
    var celdas: [CeldaDeSemana] {
        var porSemana: [String: SemanaEnZonas] = [:]
        for semana in weeksData { porSemana[semana.weekStart] = semana }

        let ancho = max(1, weeks)
        var primera = weekStart
        var ultima = Semanas.mas(weekStart, ancho - 1)
        for clave in porSemana.keys {
            if clave < primera { primera = clave }
            if clave > ultima { ultima = clave }
        }

        let cuantas = max(1, Semanas.entre(primera, ultima) + 1)
        return (0..<cuantas).map { i in
            let iso = Semanas.mas(primera, i)
            return CeldaDeSemana(weekStart: iso, semana: porSemana[iso])
        }
    }

    /// Cuántas semanas de la ventana no tienen dato. Se dice en voz alta: el
    /// hueco es la mitad de lo que esta gráfica cuenta.
    var semanasSinDato: Int { celdas.filter { $0.semana == nil }.count }

    /// La semana más alta, que es el techo del eje.
    var techo: Int { celdas.compactMap { $0.semana?.segundos }.max() ?? 0 }
}

// MARK: - La pila de una barra

/// Las seis franjas de una barra, de abajo arriba. El orden es FIJO: una pila
/// que se reordenara por tamaño no se podría comparar con la semana de al lado,
/// que es para lo único que sirve esta gráfica.
enum BandaDeZona: String, CaseIterable {
    case z1, z2, z3, z4, z5
    case sinZona

    /// La zona de la escala, o nil en el hueco (que no es una zona).
    var zona: HRZone? {
        switch self {
        case .z1: return .z1
        case .z2: return .z2
        case .z3: return .z3
        case .z4: return .z4
        case .z5: return .z5
        case .sinZona: return nil
        }
    }

    /// Cómo se llama en la leyenda. El CÓDIGO y no un nombre de intensidad:
    /// cómo se llama Z3 lo decide cada entrenador y llega del servidor.
    var etiqueta: String { zona?.label ?? "Sin zona" }
}

/// Una franja con su tramo ya acumulado: quien dibuja lee los dos bordes y no
/// lleva la cuenta, que es donde se cuelan los desfases de un píxel.
struct TrozoDeSemana: Identifiable, Equatable {
    let banda: BandaDeZona
    let segundos: Int
    /// Segundos acumulados bajo esta franja, y sobre ella.
    let desde: Int
    let hasta: Int

    var id: String { banda.rawValue }
}

extension SemanaEnZonas {
    /// Los segundos de una franja. Nunca negativos: un dato imposible es un dato
    /// que no está.
    func segundos(_ banda: BandaDeZona) -> Int {
        let bruto: Int
        switch banda {
        case .z1: bruto = z1S
        case .z2: bruto = z2S
        case .z3: bruto = z3S
        case .z4: bruto = z4S
        case .z5: bruto = z5S
        case .sinZona: bruto = noHrS
        }
        return max(0, bruto)
    }

    /// Las franjas con algo dentro, de abajo arriba y acumuladas.
    var pila: [TrozoDeSemana] {
        var trozos: [TrozoDeSemana] = []
        var acumulado = 0
        for banda in BandaDeZona.allCases {
            let s = segundos(banda)
            guard s > 0 else { continue }
            trozos.append(TrozoDeSemana(banda: banda, segundos: s,
                                        desde: acumulado, hasta: acumulado + s))
            acumulado += s
        }
        return trozos
    }

    /// El alto de la barra. Se suma de sus franjas y NO se lee de `total_s`: si
    /// el motor sumara distinto, la barra y su rótulo dirían dos cosas a la vez.
    var segundos: Int {
        BandaDeZona.allCases.reduce(0) { $0 + segundos($1) }
    }
}

// MARK: - El eje vertical

/// El techo del eje y dónde caen sus líneas.
struct EscalaDeZonas: Equatable {
    /// En segundos. Es la semana más alta y no un número redondo por encima: así
    /// la barra más alta llega al borde y la comparación usa todo el alto.
    let techo: Int
    /// Las líneas de rejilla, en segundos. La primera es el cero.
    let marcas: [Int]

    /// Los escalones de rejilla, del cuarto de hora a los dos días. Los mismos
    /// que la gráfica del coach: si aquí la rejilla cayera en otros sitios, la
    /// misma semana se leería con dos alturas distintas en las dos pantallas.
    private static let escalones = [
        15 * 60, 30 * 60, 3600, 2 * 3600, 3 * 3600, 4 * 3600,
        6 * 3600, 8 * 3600, 12 * 3600, 24 * 3600, 48 * 3600,
    ]

    /// Cinco líneas contando el cero, como mucho.
    private static let maxIntervalos = 4

    init(techo segundos: Int) {
        let alto = max(1, segundos)
        let paso = Self.escalones.first { alto / $0 <= Self.maxIntervalos }
            ?? Self.escalones[Self.escalones.count - 1]
        var marcas: [Int] = []
        var t = 0
        while t <= alto {
            marcas.append(t)
            t += paso
        }
        self.techo = alto
        self.marcas = marcas
    }

    /// Dónde cae un valor dentro del alto disponible, de 0 (el suelo) a 1.
    func fraccion(_ segundos: Int) -> Double {
        guard techo > 0 else { return 0 }
        return min(1, max(0, Double(segundos) / Double(techo)))
    }
}

// MARK: - Los rangos del coach, alineados con las semanas

/// Un rango ya recortado a lo que se ve: qué celdas ocupa dentro del eje.
struct RangoDibujado: Identifiable, Equatable {
    let id: String
    let etiqueta: String
    let tono: TonoDeRango
    /// Índice de la primera y la última celda que ocupa, las dos dentro.
    let desde: Int
    let hasta: Int
    /// Lunes de esas dos celdas. Son las fechas RECORTADAS y no las que mandó el
    /// coach: lo que se escribe tiene que ser lo que se dibuja, y un rango que
    /// empieza antes de la ventana se dibuja desde el borde.
    let desdeSemana: String
    let hastaSemana: String

    var celdas: Int { hasta - desde + 1 }

    /// «23 feb a 27 abr», o una sola fecha cuando ocupa una semana.
    var semanas: String {
        let a = PalabrasDeZonas.semanaCorta(desdeSemana)
        guard desde != hasta else { return a }
        return "\(a) a \(PalabrasDeZonas.semanaCorta(hastaSemana))"
    }
}

extension GraficaDeZonas {
    /// Los rangos del coach sobre el eje de arriba. Un rango que no pisa la
    /// ventana no se dibuja, y el que la pisa a medias SE RECORTA: la banda es un
    /// eje, no un resumen de todo lo que él marcó alguna vez.
    var rangosDibujados: [RangoDibujado] {
        let celdas = self.celdas
        guard !celdas.isEmpty else { return [] }

        return ranges.enumerated().compactMap { i, rango in
            let inicio = celdas.firstIndex { $0.weekStart >= rango.weekStart }
            let fin = celdas.lastIndex { $0.weekStart <= rango.weekEnd }
            guard let desde = inicio, let hasta = fin, desde <= hasta else { return nil }
            return RangoDibujado(
                id: "\(i)-\(rango.weekStart)",
                etiqueta: rango.label,
                tono: rango.tono,
                desde: desde,
                hasta: hasta,
                desdeSemana: celdas[desde].weekStart,
                hastaSemana: celdas[hasta].weekStart
            )
        }
    }
}

// MARK: - Las palabras

enum PalabrasDeZonas {
    /// Un rato, con la grafía de la casa: «45 min» · «6 h 35». El cero es «0» a
    /// secas, que es lo que va en la base del eje.
    ///
    /// Por debajo del minuto no se escribe «0 min» (§7: nada de defectos
    /// plausibles): es un minuto largo mal medido y se dice como «1 min».
    static func rato(_ segundos: Int) -> String {
        guard segundos > 0 else { return "0" }
        let minutos = max(1, Int((Double(segundos) / 60).rounded()))
        return Formato.duracion(minutos) ?? "1 min"
    }

    /// «3 jul» — la marca del eje de semanas.
    static func semanaCorta(_ iso: String) -> String {
        FechaES.corta(iso) ?? iso
    }

    /// El desglose de una semana en una frase: es a la vez lo que oye quien no ve
    /// la pantalla y lo que diría quien la mira. Los dos, lo mismo.
    static func desglose(_ celda: CeldaDeSemana) -> String {
        let cuando = "Semana del \(FechaES.larga(celda.weekStart) ?? celda.weekStart)"
        guard let semana = celda.semana, !semana.pila.isEmpty else {
            return "\(cuando): sin datos"
        }
        let detalle = semana.pila
            .map { "\($0.banda.etiqueta) \(rato($0.segundos))" }
            .joined(separator: ", ")
        return "\(cuando): \(rato(semana.segundos)) en total. \(detalle)"
    }

    /// «3 semanas sin dato» · «1 semana sin dato». Vacío cuando no falta ninguna.
    static func semanasSinDato(_ cuantas: Int) -> String? {
        guard cuantas > 0 else { return nil }
        return cuantas == 1 ? "1 semana sin dato" : "\(cuantas) semanas sin dato"
    }

    /// Qué periodo mira la gráfica: «23 feb a 3 ago». Se dice siempre que no hay
    /// barras, porque sin dibujo el atleta no tiene de dónde sacar QUÉ semanas
    /// le está enseñando su coach.
    static func ventana(_ grafica: GraficaDeZonas) -> String {
        let celdas = grafica.celdas
        guard let primera = celdas.first, let ultima = celdas.last else { return "" }
        let a = semanaCorta(primera.weekStart)
        guard primera.weekStart != ultima.weekStart else { return a }
        return "\(a) a \(semanaCorta(ultima.weekStart))"
    }

    /// POR QUÉ no hay nada que dibujar, en la voz del atleta y sin culpar a
    /// nadie. Son DOS motivos distintos y hacen falta los dos:
    ///
    /// · sin umbral no se puede repartir NADA, por muchos entrenos que haya (las
    ///   bandas necesitan un ancla, y el ancla es justo lo que falta),
    /// · con umbral, lo que falta son entrenos con pulso en ese periodo.
    ///
    /// Nunca «no entrenaste»: eso no lo sabemos y casi siempre es mentira.
    static func vacio(_ grafica: GraficaDeZonas) -> String {
        guard grafica.anchor != nil else {
            return "Todavía no sabemos tu umbral, así que tu tiempo no se puede repartir en zonas."
        }
        return "De estas semanas todavía no hay entrenos con pulso."
    }

    /// De dónde salen las bandas, dicho al atleta. Se prefiere SIEMPRE la frase
    /// del servidor; la de aquí es el respaldo para que el número no salga
    /// desnudo, y dice el GRADO DE EVIDENCIA (medido · declarado · estimado), que
    /// es mecanismo nuestro, nunca el método de nadie.
    static func ancla(_ ancla: AnclaDeZonas) -> String {
        if let delServidor = ancla.sourceLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
           !delServidor.isEmpty {
            return "Sobre tu umbral de \(ancla.lthrBpm) \(Vocab.ppm), \(delServidor.lowercasedFirst)"
        }
        guard let evidencia = evidencia(ancla.source) else {
            return "Sobre tu umbral de \(ancla.lthrBpm) \(Vocab.ppm)"
        }
        return "Sobre tu umbral de \(ancla.lthrBpm) \(Vocab.ppm), \(evidencia)"
    }

    /// Los cuatro orígenes del conjunto cerrado. Uno que no se conozca no
    /// inventa una frase: se queda el número, que sigue siendo cierto.
    private static func evidencia(_ source: String) -> String? {
        switch source {
        case "lthr_measured": return "medido en tu test de umbral"
        case "lthr_declared": return "el que declaraste tú"
        case "from_max_hr":   return "estimado desde tu \(Vocab.fcMax.lowercased())"
        case "from_age":      return "estimado por tu edad"
        default:              return nil
        }
    }
}

private extension String {
    /// La frase del servidor entra a media oración, así que su mayúscula inicial
    /// sobra («… ppm, Medido en tu test» se lee partido).
    var lowercasedFirst: String {
        guard let primera = first else { return self }
        return primera.lowercased() + dropFirst()
    }
}

// MARK: - Aritmética de semanas

/// Sumar y restar semanas sobre fechas «YYYY-MM-DD». Con `Calendar` y no con
/// milisegundos: siete días no siempre son 604 800 segundos (los cambios de hora
/// existen) y una semana perdida por ahí desalinearía el eje entero.
enum Semanas {
    static func mas(_ iso: String, _ semanas: Int) -> String {
        guard let fecha = FechaES.fecha(iso),
              let movida = Calendar.current.date(byAdding: .weekOfYear, value: semanas, to: fecha)
        else { return iso }
        return FechaES.iso(movida)
    }

    /// Cuántas semanas hay de una a otra. Negativo si van al revés.
    static func entre(_ desde: String, _ hasta: String) -> Int {
        guard let a = FechaES.fecha(desde), let b = FechaES.fecha(hasta) else { return 0 }
        return Calendar.current.dateComponents([.weekOfYear], from: a, to: b).weekOfYear ?? 0
    }
}
