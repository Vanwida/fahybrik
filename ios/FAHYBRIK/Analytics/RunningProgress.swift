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

/// Seis razones, y se agrupan en DOS tratamientos. Esa agrupación es toda la
/// diferencia entre una pantalla honesta y una que da pena.
///
/// ES EL VOCABULARIO DE TODA LA APP, no el de esta pantalla: el contrato de
/// analíticas (`shared/domain/analytics/lectura.ts`) reutiliza estas mismas seis
/// razones a propósito, para que a un atleta sin test no se le pida el test tres
/// veces en la misma pantalla. Por eso vive aquí una sola vez.
enum Falta: Equatable {
    /// Le falta TIEMPO. Se le dibuja el plazo.
    case historia(llevas: Int, hacen: Int)
    /// No hay test de zonas: no se sabe qué es «suave» para él.
    case ancla
    /// No hay pulso medido, así que no hay nada que anclar.
    case sensor
    /// NO HAY RELOJ QUE LO MIDA, y es distinto de `sensor`: una banda de pulso no
    /// le da el sueño ni la variabilidad nocturna, así que pedirle la banda para
    /// desbloquear el sueño sería mandarle a comprar lo que no le sirve.
    case dispositivo
    /// La ocasión no se ha dado todavía (nunca corrió cansado).
    case ocasion
    /// Nadie le ha pedido nunca un ritmo: no hay contra qué cumplir.
    case intencion
    /// UNA RAZÓN QUE ESTE BINARIO NO CONOCE. No se puede decir por qué falta ni
    /// ofrecer salida, así que se trata como silencio: enseñar un candado sin
    /// motivo es exactamente el hueco mudo que este vocabulario existe para
    /// evitar. Y decodificar en vez de lanzar es lo que impide que una razón
    /// nueva en el servidor deje al atleta la pantalla entera en blanco.
    case desconocida
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
        case "dispositivo": self = .dispositivo
        case "ocasion": self = .ocasion
        case "intencion": self = .intencion
        default: self = .desconocida
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
        case .dispositivo: try c.encode("dispositivo", forKey: .por)
        case .ocasion: try c.encode("ocasion", forKey: .por)
        case .intencion: try c.encode("intencion", forKey: .por)
        case .desconocida: try c.encode("desconocida", forKey: .por)
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

    // ── EL VEREDICTO ES LA PUERTA A LOS DATOS, NO SU SUSTITUTO ────────────────
    //
    // Estas cuatro no alimentan el veredicto: son la DENSIDAD que crece según se
    // baja por la pantalla, y vienen de la pestaña anterior — la que servía
    // quince lecturas donde ésta enseñaba siete.
    //
    // El servidor las calculaba, las serializaba y las enviaba desde el primer
    // día, y este fichero decidía no decodificarlas. No fue un olvido: con un
    // contrato de raíz fijada, dibujar una lectura más costaba tocar el tipo, el
    // ensamblador y el modelo Codable a la vez, así que el coste se pagaba entero
    // aunque nadie la pintara. Es exactamente el problema que el contrato de
    // LECTURAS (`Lecturas.swift`) resuelve para todo lo que venga después.

    /// El umbral de RITMO y su VDOT, con de dónde salieron. Nulo = no tiene perfil
    /// de zonas de carrera, que es distinto de tenerlo a cero.
    ///
    /// OJO, SON DOS ANCLAS DISTINTAS: ésta es la de RITMO (de ella cuelgan las
    /// zonas de ritmo y el plan); `zonasMedidas` es la de PULSO. Un atleta puede
    /// tener una y no la otra, y confundirlas sería apagarle una lectura por un
    /// test que no era el que le faltaba.
    let umbral: UmbralRitmo?
    /// Sus bandas de ritmo. Cuelgan del umbral: vacías si no hay perfil.
    let zonasRitmo: [ZonaRitmo]
    /// Cadencia media (pasos/min) por semana — la única lectura de técnica que
    /// tenemos. Una semana sin ningún tramo con cadencia NO tiene punto.
    let cadencia: [PuntoSemana]
    /// Medias reales por tipo de sesión, de más a menos kilómetros. Es la EVIDENCIA
    /// del tercer peldaño: sin ella, ese peldaño se apoyaba en un número que la
    /// pantalla no podía dibujar.
    let porTipo: [TipoMedia]

    struct MismoTipo: Codable, Equatable {
        let tipo: String
        let ganaSKm: Double
    }
}

/// EL ANCLA DE RITMO, con su procedencia. El número sin de dónde sale no se puede
/// discutir, y un umbral derivado en el alta es real pero no está revisado — son
/// dos afirmaciones distintas y la pantalla las dice distinto.
struct UmbralRitmo: Codable, Equatable {
    /// Segundos por kilómetro. Nulo cuando hay VDOT pero no ritmo.
    let ritmoSKm: Double?
    /// El VDOT de Daniels, del selector único de marcas — no del último 5k suelto.
    let vdot: Double?
    /// De qué marca salió el VDOT, ya rotulado por el servidor. Nulo si no hay marca.
    let vdotDesde: String?
    /// `coach_test` | `athlete_test` | `onboarding_auto`.
    let origen: String?
    /// Derivado en el alta y sin confirmar: real, pero sin revisar.
    let sinRevisar: Bool
}

/// Una banda de ritmo del atleta. Bordes ABSOLUTOS: `fastS` menor = más rápido, y
/// `slowS` nulo = banda abierta por el lado lento (la Z1 no tiene techo).
struct ZonaRitmo: Codable, Equatable, Identifiable {
    let code: String
    let label: String
    /// El color que el perfil guardado declara, en hexadecimal. Aquí el color ES
    /// dato —lo que se mide es la zona—, así que se respeta el del servidor.
    let color: String
    /// El papel fisiológico de la banda (`recovery`, `aerobic_base`, `threshold`…).
    let role: String?
    let fastS: Double?
    let slowS: Double?
    let sortOrder: Int

    var id: String { code }
}

/// La media real de un tipo de sesión, sobre la ventana.
struct TipoMedia: Codable, Equatable, Identifiable {
    /// El FORMATO de la sesión en vocabulario del cable (`steady`, `intervals`…).
    /// Su nombre en castellano lo pone el cliente: una clave no se le enseña a nadie.
    let tipo: String
    let ritmoSKm: Double
    let metros: Int
    let sesiones: Int

    var id: String { tipo }
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


extension RunningProgressPayload {
    /// LA MISMA VENTANA QUE LA LECTURA, para la hoja de sesiones. El drill hereda
    /// el rango real del payload (custom from-to), no el periodo del selector
    /// viejo: si la cifra dice «12 semanas», la lista enseña esas 12 — dos
    /// ventanas distintas para el mismo número es la clase de divergencia que
    /// esta pantalla existe para matar.
    var periodoDeDrill: AnalyticsPeriod {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "Europe/Madrid")
        let hasta = String(generatedAtIso.prefix(10))
        let hastaDate = df.date(from: hasta) ?? Date()
        let desdeDate = Calendar.current.date(byAdding: .day, value: -windowWeeks * 7, to: hastaDate) ?? hastaDate
        return AnalyticsPeriod(key: .custom, from: df.string(from: desdeDate), to: hasta)
    }
}
