import Foundation

// ¿ESTOY MEJORANDO? — el payload de las analíticas de carrera, tal y como llega.
//
// `GET /api/athlete/analytics/running/progress` responde `RunningProgressPayload`
// (`web/lib/athlete/analytics/running-progress.ts`) SIN envoltorio: la raíz del
// cuerpo es el objeto entero, en snake_case.
//
// EL MOTOR NO ESTÁ AQUÍ, Y ESO ES LA MITAD DEL DISEÑO. El veredicto, su frase,
// la escalera de evidencia, el plazo, las seis coberturas y el reparto ya
// plegado con el objetivo del coach los decide `shared/domain/running/progress.ts`
// y los sirve el servidor. La app del atleta es Swift y no puede ejecutar
// TypeScript, así que si el motor se reescribiera aquí habría dos, y el día que
// discreparan nadie sabría cuál es el bueno. Este fichero solo sabe LEER.
//
// UNA SOLA LLAMADA TRAE LA PANTALLA ENTERA a propósito: veredicto, cobertura y
// los umbrales con los que se decidió salen del mismo instante. Pedirlos por
// separado permitiría que dos respuestas se contradijeran en pantalla.
//
// UN CERO NUNCA SUSTITUYE A UN HUECO — la disciplina que gobierna el payload
// entero y, por tanto, este tipado: sin muestras llega `null` o una lista vacía,
// y la cobertura dice por qué. Ningún opcional de aquí se colapsa a 0 al leer.

struct RunningProgressPayload: Codable, Equatable {
    let athleteId: String
    let generatedAtIso: String
    let windowWeeks: Int
    /// Los umbrales del coach REALMENTE usados. Que viajen es lo que permite a la
    /// pantalla decir «hacen falta 6 semanas» sin cablear el número.
    let method: CoachRunningThresholds
    let history: RunningHistory
    let verdict: Veredicto
    let coverage: Cobertura
    /// LAS CIFRAS DE DEBAJO, YA CALCULADAS. Son restas y divisiones triviales y
    /// justo por eso era tentador hacerlas al dibujar — pero dos de ellas DECIDEN
    /// (la subida de volumen es el segundo ingrediente de «cargando de más», y el
    /// % en banda decide si la cifra sale verde), así que recalcularlas aquí sería
    /// tener dos motores para el número que sostiene un veredicto. Las otras dos
    /// vienen por la misma puerta aunque hoy no decidan nada: media pantalla
    /// servida y media calculada al dibujar es cómo la siguiente cifra se añade
    /// donde toque por accidente.
    let deltas: Deltas
    let polarization: Polarizacion

    /// EL REPARTO, YA PLEGADO Y CON EL OBJETIVO DEL COACH.
    ///
    /// Va aparte de `history.zonasS` a propósito: la barra necesita las cinco
    /// zonas, pero la cifra que titula el bloque es el «% suave», y plegar cinco
    /// zonas en tres bandas es MÉTODO del coach. Si el servidor mandara solo los
    /// segundos, el 80 % acabaría cableado en Swift — justo lo que la Regla Nº0
    /// prohíbe.
    struct Polarizacion: Codable, Equatable {
        /// NULO cuando no hay ni un segundo repartido. Nunca 0/0/0: un reparto que
        /// suma cero no es equilibrado, es que no se sabe.
        let pct: Reparto?
        /// El que este coach persigue. La marca sobre la barra sale de aquí.
        let target: Reparto
        /// Los dos puntos de plegado, para colorear las cinco zonas por la banda a
        /// la que pertenecen sin adivinarlos.
        let lowMaxZone: Int
        let midMaxZone: Int
    }

    /// Tres bandas: fácil, medio, duro. Suma 100.
    struct Reparto: Codable, Equatable {
        let low: Int
        let mid: Int
        let high: Int
    }
}

// MARK: - Los umbrales del coach

/// MÉTODO, no mecanismo. Llegan resueltos (su fila sobre los defectos) para que
/// ni un número de juicio viva en este binario.
struct CoachRunningThresholds: Codable, Equatable {
    /// Semanas de historial antes de atreverse a afirmar una tendencia.
    let minWeeksToJudge: Double
    /// s/km a partir de los cuales un cambio deja de ser ruido.
    let meaningfulGainSPerKm: Double
    /// Subida de volumen que, CRUZADA con el ritmo empeorando, hace saltar
    /// «cargando de más». Sola no juzga nada.
    let volumeSurgeRatio: Double
    /// A partir de qué % de repeticiones en banda se considera que clava lo pedido.
    let goodInBandPct: Double
    /// Repeticiones evaluadas mínimas antes de JUZGAR ese porcentaje. Por debajo,
    /// la cifra se enseña sin color: existe, pero no concluye.
    let minRepsToJudgeBand: Double
    /// Comparaciones mínimas para dar por buena la curva de correr cansado.
    let minPairsForCompromisedTrend: Double

    // El resto de la fila viaja y esta pantalla no la usa. Se decodifica igual
    // —es el mismo objeto— pero no se nombra lo que no se lee: un campo que
    // aparece sin usarse invita a que alguien lo use mañana creyendo que estaba
    // pensado para esto.
}

// MARK: - El veredicto, servido

/// Cinco clases, y ninguna más. El color del lienzo sale de aquí.
enum ClaseVeredicto: String, Codable, Equatable {
    case mejor, igual, cargando, peor
    case aunNo = "aun-no"
}

/// EL PELDAÑO: en qué se apoya el veredicto. La escalera la resolvió el servidor
/// —mejor señal disponible, no una sola— y aquí solo se nombra para poder decir
/// bajo qué gráfico se sostiene.
enum Peldano: Equatable {
    /// La única que aísla la forma del esfuerzo.
    case alPulso(ganaSKm: Double, semanas: Int)
    /// Menos limpia, hecho duro.
    case esfuerzos(ganaS: Double, metros: Int)
    /// Degradada, pero honesta: el mismo tipo de sesión contra sí mismo.
    case mismoTipo(ganaSKm: Double, semanas: Int)
}

extension Peldano: Codable {
    private enum K: String, CodingKey { case en, ganaSKm, ganaS, semanas, metros }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let en = try c.decode(String.self, forKey: .en)
        switch en {
        case "al-pulso":
            self = .alPulso(ganaSKm: try c.decode(Double.self, forKey: .ganaSKm),
                            semanas: try c.decode(Int.self, forKey: .semanas))
        case "esfuerzos":
            self = .esfuerzos(ganaS: try c.decode(Double.self, forKey: .ganaS),
                              metros: try c.decode(Int.self, forKey: .metros))
        case "mismo-tipo":
            self = .mismoTipo(ganaSKm: try c.decode(Double.self, forKey: .ganaSKm),
                              semanas: try c.decode(Int.self, forKey: .semanas))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .en, in: c, debugDescription: "peldaño desconocido: \(en)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        switch self {
        case .alPulso(let gana, let semanas):
            try c.encode("al-pulso", forKey: .en)
            try c.encode(gana, forKey: .ganaSKm)
            try c.encode(semanas, forKey: .semanas)
        case .esfuerzos(let gana, let metros):
            try c.encode("esfuerzos", forKey: .en)
            try c.encode(gana, forKey: .ganaS)
            try c.encode(metros, forKey: .metros)
        case .mismoTipo(let gana, let semanas):
            try c.encode("mismo-tipo", forKey: .en)
            try c.encode(gana, forKey: .ganaSKm)
            try c.encode(semanas, forKey: .semanas)
        }
    }
}

struct Veredicto: Codable, Equatable {
    let clase: ClaseVeredicto
    /// Dos o tres palabras, escritas por el servidor. Lo que antes se explicaba
    /// debajo se dibuja o no está.
    let frase: String
    let peldano: Peldano?
    /// Solo en «aún no», y solo cuando lo que falta es TIEMPO: el plazo, para
    /// dibujarlo como una barra que se llena.
    let plazo: Plazo?

    struct Plazo: Codable, Equatable {
        let llevas: Int
        let hacen: Int
    }
}

// MARK: - La cobertura: por qué una lectura no se puede dar

/// Cinco razones, y se agrupan en DOS tratamientos. Esa agrupación es toda la
/// diferencia entre una pantalla honesta y una que da pena.
enum Falta: Equatable {
    /// Le falta TIEMPO. Se le dibuja el plazo.
    case historia(llevas: Int, hacen: Int)
    /// No hay test de zonas: no se sabe qué es «suave» para él.
    case ancla
    /// No hay pulso medido, así que no hay nada que anclar.
    case sensor
    /// La ocasión no se ha dado todavía (nunca corrió cansado).
    case ocasion
    /// Nadie le ha pedido nunca un ritmo: no hay contra qué cumplir.
    case intencion
}

extension Falta: Codable {
    private enum K: String, CodingKey { case por, llevas, hacen }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let por = try c.decode(String.self, forKey: .por)
        switch por {
        case "historia":
            self = .historia(llevas: try c.decode(Int.self, forKey: .llevas),
                             hacen: try c.decode(Int.self, forKey: .hacen))
        case "ancla": self = .ancla
        case "sensor": self = .sensor
        case "ocasion": self = .ocasion
        case "intencion": self = .intencion
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .por, in: c, debugDescription: "falta desconocida: \(por)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        switch self {
        case .historia(let llevas, let hacen):
            try c.encode("historia", forKey: .por)
            try c.encode(llevas, forKey: .llevas)
            try c.encode(hacen, forKey: .hacen)
        case .ancla: try c.encode("ancla", forKey: .por)
        case .sensor: try c.encode("sensor", forKey: .por)
        case .ocasion: try c.encode("ocasion", forKey: .por)
        case .intencion: try c.encode("intencion", forKey: .por)
        }
    }
}

/// Una por lectura. Nula = esa lectura SÍ se puede dar.
struct Cobertura: Codable, Equatable {
    let forma: Falta?
    let esfuerzos: Falta?
    let volumen: Falta?
    let reparto: Falta?
    let pedido: Falta?
    let cansado: Falta?
}

// MARK: - Los hechos

struct RunningHistory: Codable, Equatable {
    /// Semanas con nosotros. 0 cuando no ha corrido nunca, y 0 semanas de
    /// historia es una respuesta, no un hueco.
    let semanas: Int
    /// Tiene un ancla de umbral que vale como evidencia. Un umbral deducido de su
    /// fecha de nacimiento NO cuenta.
    let zonasMedidas: Bool
    let conPulso: Bool
    /// El pulso de referencia de `alPulso`. 0 cuando no hay ancla — es el único
    /// número de este payload que usa el cero como centinela, así que NO se usa
    /// para preguntar «¿hay ancla?»: eso lo dicen `zonasMedidas` y `alPulso`.
    let ppmReferencia: Int
    /// Declarada, no deducida: de ella sale el color de la serie, y el color es dato.
    let zonaReferencia: Int?
    let vo2: Vo2Lectura?
    /// Ritmo (s/km) al pulso de referencia, semana a semana. Una semana sin tramos
    /// válidos NO tiene punto: un cero se leería como «corrió infinitamente rápido».
    let alPulso: [PuntoSemana]
    let esfuerzos: [Esfuerzo]
    /// La sombra: los mismos esfuerzos en la ventana anterior. Vacío = aún no hay
    /// contra qué.
    let esfuerzosAntes: [Esfuerzo]
    let semanasKm: [PuntoSemana]
    /// Segundos por zona. Vacío del todo cuando el atleta no tiene ancla medida —
    /// nunca cinco ceros.
    let zonasS: [String: Double]
    let segundosCorriendo: Double
    let pedido: Pedido?
    let cansado: [PuntoCansado]
    let carrera: CarreraObjetivo?
    /// El tercer peldaño: el mismo tipo de sesión, comparado consigo mismo.
    let mismoTipo: MismoTipo?

    struct MismoTipo: Codable, Equatable {
        let tipo: String
        let ganaSKm: Double
    }
}

/// Un punto semanal. `semana` es el lunes en ISO — el servidor no manda etiquetas,
/// y esta pantalla no dibuja ninguna fecha.
struct PuntoSemana: Codable, Equatable {
    let semana: String
    let valor: Double
}

struct Esfuerzo: Codable, Equatable {
    let metros: Int
    let segundos: Double
}

/// Lo que le pidieron, agregado sobre la ventana.
struct Pedido: Codable, Equatable {
    let evaluadas: Int
    let dentro: Int
    let fueraLento: Int
    let fueraRapido: Int
    /// El porcentaje en banda, tal como lo saca el mismo sumador que resume una
    /// sesión. Nulo cuando no hay nada evaluable — **nunca un 0 %**.
    let pctEnBanda: Double?
    /// ¿Se puede JUZGAR ese porcentaje, o solo enseñarlo? Con pocas repeticiones
    /// la cifra existe pero no concluye, y entonces sale en tinta normal en vez de
    /// con color. **El juicio es el color**, así que quien decide el color no puede
    /// ser el cliente con un umbral copiado.
    let juzgable: Bool
}

// MARK: - Las cifras de debajo, servidas

/// Los cuatro deltas que la pantalla dibuja bajo cada titular. Ninguno se
/// recalcula aquí. Nulo = no hay base con la que compararlo, y entonces no se
/// pinta delta: un cero diría «lo medimos y no se movió».
struct Deltas: Codable, Equatable {
    /// Bajo los kilómetros. **RATIO, no porcentaje** (0,24 = +24 %) — las mismas
    /// unidades que el umbral con el que se compara. Quien lo escribe multiplica.
    /// NO JUZGA: subir kilómetros no es bueno ni malo, así que va en neutro.
    let volumen: SubidaDeVolumen?
    /// Bajo el titular de forma, **solo cuando no hay VO₂máx que lo titule** — si
    /// lo hay, el delta es el suyo y este llega nulo en vez de mandar dos deltas
    /// para el mismo titular. Positivo = ha mejorado.
    let forma: GananciaSemanal?
    /// La curva contra su sombra, a la distancia que titula el bloque.
    let esfuerzos: GananciaDeEsfuerzo?
    /// Cuánto ha bajado el coste de correr cansado. Positivo = mejorando.
    let cansado: MejoraCansado?

    struct SubidaDeVolumen: Codable, Equatable {
        let subidaRatio: Double
        let semanas: Int
    }
    struct GananciaSemanal: Codable, Equatable {
        let ganaSKm: Double
        let semanas: Int
    }
    struct GananciaDeEsfuerzo: Codable, Equatable {
        let ganaS: Double
        let metros: Int
    }
    struct MejoraCansado: Codable, Equatable {
        let mejoraSKm: Double
        let semanas: Int
    }
}

struct PuntoCansado: Codable, Equatable {
    let semana: String
    let costeSKm: Double
    let parejas: Int
}

struct CarreraObjetivo: Codable, Equatable {
    let nombre: String
    let dias: Int
    /// Sin base previa no se inventa un tiempo. Nulo = no se pinta cifra.
    let predichoS: Double?
}

/// EL VO₂MÁX ENTRA AQUÍ, Y NO EN PERFIL: en Perfil van las cosas que te
/// DESCRIBEN; esto contesta «¿estoy mejorando?».
struct Vo2Lectura: Codable, Equatable {
    let valor: Double
    /// NULO, no cero, cuando la serie todavía no da para una base: un cero dice
    /// «medimos y no se movió», y eso es justo lo que no sabemos.
    let delta: Double?
    /// Lo que abarca la serie DE VERDAD, no una ventana prometida.
    let ventanaSemanas: Int
    // `serie` viaja y esta pantalla NO la dibuja —la línea de Forma es `alPulso`—,
    // así que no se decodifica: un campo presente sin usarse acaba usándose mañana
    // por alguien que cree que estaba pensado para esto.
}
