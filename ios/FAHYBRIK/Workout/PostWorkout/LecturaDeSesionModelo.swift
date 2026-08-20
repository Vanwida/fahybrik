import Foundation

// EL MODELO DE LA LECTURA DE UNA SESIÓN — qué ve el atleta al terminar algo que NO
// es una carrera sola. `LecturaDeCarreraDesdeDetalle` contesta «¿la carrera midió
// lo pedido?»; esto contesta la pregunta que viene ANTES — qué hiciste, cuando la
// sesión mezcla fuerza, ergómetro, correr y trabajo funcional en cualquier orden, o
// es puramente una de esas cosas.
//
// PORT del doble (card 118, rehecho en la card 124):
// `web/components/design-twin/screens/lectura-sesion/modelo.ts`. Mismas siete
// capas, mismas reglas — ver `LecturaDeSesionDesdeDetalle` para dónde el CABLE de
// hoy no da lo mismo que el doble simulaba (el hierro no trae series por separado,
// solo un total de reps y una carga máxima por ejercicio).
//
// LA REGLA QUE NO SE SALTA (card 124): la distancia de los totales NUNCA mezcla
// modalidades — ni siquiera dos máquinas de ergómetro distintas, que miden
// movimientos tan distintos entre sí como correr y remar. Si la sesión midió
// distancia en más de una, el total no la enseña: vive en el desglose.

// MARK: - El desglose — un bloque, en su propio idioma

enum ModalidadDeBloque: Equatable {
    case correr
    case ergometro(ErgMachineRole)
    case fuerza
    case funcional
}

/// Un tramo de la sesión, tal y como lo cerró el entreno. A diferencia del
/// modelo del doble (una unión discriminada por modalidad), aquí es un struct
/// plano: Swift no tiene TS unions y el propio decodificador (`SegmentActualDTO`)
/// ya es plano — partirlo en cuatro tipos solo movería la misma información a
/// cuatro sitios.
struct Bloque: Equatable {
    var modalidad: ModalidadDeBloque
    /// «Peso muerto» · «Trineos» · «Calentamiento». Lo que el atleta reconoce.
    var etiqueta: String
    /// Nulo = este tramo no llevó cronómetro propio: no se inventa uno.
    var duracionS: Double? = nil
    /// Nulo = no se midió. Nunca se pinta un guion en su lugar.
    var fcMediaPpm: Double? = nil
    /// A qué ronda pertenece — solo cuando la sesión SE PRESCRIBIÓ en rondas (un
    /// simulacro, un metcon). Nil = la sesión no tiene esa estructura, y el
    /// desglose se lee como lista plana: el agrupado sale del dato, nunca de una
    /// rama especial de la pantalla.
    var ronda: Int? = nil
    /// Descanso prescrito DESPUÉS de este tramo, si lo hubo.
    var descansoS: Double? = nil

    // Correr / ergómetro:
    var distanciaM: Double? = nil

    // Fuerza — DEGRADADO respecto al doble (ver LecturaDeSesionDesdeDetalle): el
    // cable de hoy da un total de repeticiones y una carga máxima por ejercicio,
    // NUNCA la serie a serie (`5×5 a 100 kg`). `repsTotal`/`kg` son ese total y esa
    // carga; no se inventa un número de series.
    var repsTotal: Int? = nil
    var kg: Double? = nil

    // Funcional: reps O metros — nunca los dos, y ninguno si no se contó.
    var reps: Int? = nil
    var metros: Double? = nil

    /// Ritmo por km, DERIVADO — nunca se guarda un `pace` (misma regla que la
    /// lectura de carrera).
    var ritmoDeCorrerSkm: Double? {
        guard modalidad == .correr, let d = distanciaM, d > 0, let dur = duracionS else { return nil }
        return dur / (d / 1000)
    }

    /// Ritmo por 500 m de un ergómetro — mismo principio, otra unidad de pista.
    var ritmoDeErgometroS500m: Double? {
        guard case .ergometro = modalidad, let d = distanciaM, d > 0, let dur = duracionS else { return nil }
        return dur / (d / 500)
    }
}

/// Un tramo del desglose: sus bloques y, si TODOS traen ronda, cuál.
struct GrupoDesglose: Equatable {
    /// Nil = la sesión no se prescribió en rondas: se lee como lista plana.
    var ronda: Int?
    var bloques: [Bloque]
}

/**
 AGRUPAR POR RONDA — y solo si el DATO lo trae, nunca por una rama del escenario.
 Bloques consecutivos con la misma ronda (o sin ronda, los dos) se pliegan en el
 mismo grupo: una sesión sin rondas —fuerza y trineos, fuerza pura— produce UN
 solo grupo con `ronda: nil`, que el desglose pinta sin cabecera y queda
 exactamente como una lista plana.
 */
func agruparPorRonda(_ bloques: [Bloque]) -> [GrupoDesglose] {
    var grupos: [GrupoDesglose] = []
    for b in bloques {
        if var ultimo = grupos.last, ultimo.ronda == b.ronda {
            ultimo.bloques.append(b)
            grupos[grupos.count - 1] = ultimo
        } else {
            grupos.append(GrupoDesglose(ronda: b.ronda, bloques: [b]))
        }
    }
    return grupos
}

// MARK: - La sesión

enum CompletitudDeSesion: Equatable {
    case completa
    case parcial
}

struct SesionEjecutada: Equatable {
    var titulo: String
    /// «Hoy» · «Ayer» · «Martes 20 de agosto».
    var cuando: String
    /// «07:15» y «08:02» — HH:MM local, de `started_at`/`ended_at`. Cualquiera de
    /// los dos ausente y no hay ventana horaria que enseñar (nunca se completa un
    /// extremo sumando la duración: eso sería fabricar el que falta).
    var horaInicio: String?
    var horaFin: String?
    var completitud: CompletitudDeSesion
    /// El icono de la cabecera — ya resuelto por el decodificador (mira los
    /// bloques Y el formato de los bloques prescritos; ver `tipoDeSesion`).
    var tipo: TipoDeEntreno
    /// El total de la sesión — dato de servidor, independiente de la suma de los
    /// bloques.
    var duracionTotalS: Double
    var bloques: [Bloque]
    /// El recuadro extra de los totales, cuando el tiempo no cuenta ya toda la
    /// historia (volumen de fuerza, rondas de un EMOM, el resultado redactado de
    /// un AMRAP). Nil en un for-time o una sesión libre: el tiempo ya responde.
    var resultado: ResultadoDeSesion?
    /// FC media y máxima DE LA SESIÓN ENTERA — dato de servidor (ver
    /// `LecturaDeSesionDesdeDetalle`). Nil = no se midió, o el servidor todavía no
    /// lo manda: en los dos casos no se pinta el recuadro, nunca se deriva aquí.
    var fcMediaPpm: Double?
    var fcMaxPpm: Double?
    var kcal: Double?
    /// Vacía sin GPS. Mismo `PuntoRuta` que la lectura de carrera: el mapa se
    /// reutiliza tal cual.
    var ruta: [PuntoRuta]
    /// El pulso de la sesión entera, para la gráfica — la traza REAL del archivo
    /// (`execution.trace`), nunca reconstruida: si no hay traza, no hay gráfica.
    var pulso: [Muestra]
    /// El reparto de pulso de la sesión — MISMO instrumento que el resto de la
    /// app (`ZoneCoverage.read`, resto mayor + hueco «Sin pulso» incluido). Nil
    /// = no se midió pulso en ningún bloque, y entonces no hay barra (§7).
    var zonas: ZoneCoverage?
    var rpe: Int?
    var dificultadLabel: String?
    var molestiaLabel: String?
}

// MARK: - El tipo de entreno — el icono de la cabecera (card 124)

enum TipoDeEntreno: Equatable {
    case correr, fuerza, hyrox, mixto, funcional
}

/**
 QUÉ FUE LA SESIÓN, para el icono teñido de la cabecera. Sale de DOS hechos, nunca
 de uno: el FORMATO de los bloques (¿se prescribió como reloj/tanda?) y qué
 MODALIDADES trae el desglose — mirar solo el formato metería una sesión de fuerza
 y trineos en el mismo cajón que un rodaje suelto, y mirar solo las modalidades no
 distinguiría un simulacro estructurado de una sesión mixta sin estructura.

 `formatosDeBloques` son los `format` tal y como los escribió el coach
 (`straight_sets`, `strength_block`, `amrap`, `for_time`, `hyrox_sim`…): la
 clasificación de método (§ Regla Nº0) no vive aquí, solo se LEE la palabra —
 el vocabulario de `WorkoutBlock.format` (lib/athlete/assignment-detail.ts), no
 el de `Theme.Modality.kind` (pensado para etiquetar un día del calendario, no
 para decidir «¿esto fue fuerza pura?»: no reconoce `straight_sets`, que es
 justo el formato más común de un día de hierro).
 */
func tipoDeSesion(bloques: [Bloque], formatosDeBloques: [String]) -> TipoDeEntreno {
    let esFuerzaPorFormato = !formatosDeBloques.isEmpty && formatosDeBloques.allSatisfy { formato in
        let s = formato.lowercased()
        return s.contains("straight_sets") || s.contains("strength")
    }
    if esFuerzaPorFormato { return .fuerza }

    let modalidades = Set(bloques.map(\.modalidad.familia))
    let estructurada = formatosDeBloques.contains { formato in
        let s = formato.lowercased()
        return s.contains("for_time") || s.contains("amrap") || s.contains("emom")
            || s.contains("hyrox") || s.contains("circuit") || s.contains("intervals")
    }
    let tieneCorrer = modalidades.contains(.correr)
    let tieneOtroCardio = modalidades.contains(.ergometro) || modalidades.contains(.funcional)

    // Reloj o tanda + correr + otra máquina/movimiento: la firma de un simulacro
    // HYROX, tenga la forma de reloj que tenga.
    if estructurada, tieneCorrer, tieneOtroCardio { return .hyrox }

    if modalidades.count == 1 {
        if tieneCorrer { return .correr }
        if modalidades.contains(.fuerza) { return .fuerza }
        return .funcional
    }
    // Sin bloques logueados no hay nada que mirar: el neutro es el más honesto.
    if modalidades.isEmpty { return .funcional }

    // Varias modalidades sin la estructura de un simulacro: la mezcla libre.
    return .mixto
}

private enum FamiliaDeModalidad: Equatable { case correr, ergometro, fuerza, funcional }

private extension ModalidadDeBloque {
    var familia: FamiliaDeModalidad {
        switch self {
        case .correr: return .correr
        case .ergometro: return .ergometro
        case .fuerza: return .fuerza
        case .funcional: return .funcional
        }
    }
}

// MARK: - Los totales — la foto de la sesión entera (card 124)

/**
 Las máquinas y modos que cuentan como distancia CUBIERTA — nunca dos se suman
 entre sí. Ojo: `ergometro` no es un cajón único. Remar 500 m y esquiar 500 m
 miden dos movimientos tan distintos como correr y remar; sumarlos solo por
 compartir la palabra «ergómetro» sería la MISMA mezcla que la regla de la card
 124 prohíbe, con la máquina en vez de la modalidad como disfraz.
 */
private func cubetaDeDistancia(_ b: Bloque) -> String? {
    switch b.modalidad {
    case .correr: return "correr"
    case .ergometro(let maquina): return "ergometro:\(maquina.rawValue)"
    // La fuerza no cubre distancia. El funcional cuenta metros como DOSIS de un
    // movimiento (40 m de burpee broad jump), no como desplazamiento continuo:
    // mezclarlo con lo que corrió el atleta sería inventar un ritmo que nadie
    // corrió.
    case .fuerza, .funcional: return nil
    }
}

private let nombreDeCubeta: [String: String] = [
    "correr": "corriendo",
    "ergometro:row": "remando",
    "ergometro:ski": "en ski erg",
    "ergometro:bike": "en bici",
]

struct TotalDeDistancia: Equatable {
    var metros: Double
    /// «corriendo» · «remando» — se dice SIEMPRE con qué se hizo (card 124).
    var modo: String
    /// Nil si algún tramo de esa modalidad no llevaba su propio cronómetro: un
    /// ritmo medio sobre una duración incompleta sería un ritmo inventado.
    var ritmoSkm: Double?
}

/**
 La distancia total, y SOLO cuando una única cubeta la midió. Con cero cubetas no
 hay recuadro (nadie recorrió nada medible); con dos o más el recuadro tampoco
 existe — la card 124 es explícita: «si la midió en varias, el total NO enseña
 distancia: vive en el desglose».
 */
func distanciaTotalDeSesion(_ bloques: [Bloque]) -> TotalDeDistancia? {
    struct Acumulado { var metros: Double = 0; var duracionS: Double = 0; var completa = true }
    var porCubeta: [String: Acumulado] = [:]
    for b in bloques {
        guard let cubeta = cubetaDeDistancia(b), let distanciaM = b.distanciaM else { continue }
        var actual = porCubeta[cubeta] ?? Acumulado()
        actual.metros += distanciaM
        if let d = b.duracionS { actual.duracionS += d } else { actual.completa = false }
        porCubeta[cubeta] = actual
    }
    guard porCubeta.count == 1, let (cubeta, datos) = porCubeta.first, datos.metros > 0 else { return nil }
    return TotalDeDistancia(
        metros: datos.metros,
        modo: nombreDeCubeta[cubeta] ?? cubeta,
        ritmoSkm: datos.completa ? datos.duracionS / (datos.metros / 1000) : nil
    )
}

/**
 EL RITMO MEDIO DE CORRER — independiente de si la distancia total se enseña o
 no. En un simulacro la distancia total se calla porque mezclaría correr con
 ergómetro, pero «¿a qué ritmo corrí?» sigue teniendo una respuesta sin
 ambigüedad: solo mira los tramos de correr. Solo cuenta lo que trajo su propio
 cronómetro — nunca un ritmo sobre una duración a medias inventada.
 */
func ritmoMedioDeCorrer(_ bloques: [Bloque]) -> Double? {
    var metros = 0.0
    var segundos = 0.0
    for b in bloques {
        guard b.modalidad == .correr, let d = b.distanciaM, let dur = b.duracionS else { continue }
        metros += d
        segundos += dur
    }
    guard metros > 0 else { return nil }
    return segundos / (metros / 1000)
}

/**
 EL RESULTADO PROPIO DEL FORMATO — solo cuando el tiempo total NO lo cuenta ya.
 Un for-time o una sesión libre ya tienen su respuesta en «tiempo»; una sesión de
 fuerza o un EMOM tienen un resultado que el tiempo NO dice, y ese es el que gana
 un recuadro propio en la rejilla de totales.

 AMRAP se queda fuera aposta (ver `LecturaDeSesionDesdeDetalle`): el cable de hoy
 no da rondas+reps sueltas estructuradas para ese formato, solo el `score_label`
 ya redactado del servidor — y ese se enseña como está, no se despieza aquí.
 */
enum ResultadoDeSesion: Equatable {
    case fuerza(volumenKg: Double, serieMasPesada: SerieMasPesada?)
    case emom(rondasCompletadas: Int, rondasPrescritas: Int)
    /// AMRAP y cualquier otro formato con `score_label` — el resultado YA
    /// redactado por el servidor (`"5 rondas + 8 reps"`), enseñado tal cual. No
    /// se despieza en rondas/reps sueltas: el cable de hoy no da esos dos números
    /// por separado para AMRAP (sí para EMOM, que tiene su propio caso arriba).
    case texto(String)
}

struct SerieMasPesada: Equatable {
    var etiqueta: String
    var kg: Double
    var reps: Int
}

/**
 EL VOLUMEN — solo lo que llevó una carga medida en kilos.

 DEGRADADO respecto al doble: sin la serie a serie, `repsTotal × kg` es el total
 de reps del ejercicio por su carga MÁXIMA declarada — exacto cuando la carga fue
 uniforme (un 5×5 a un solo peso), una sobrestima en una pirámide. Es lo único que
 el cable de hoy puede dar sin inventar cuántas series hubo (ver el fichero del
 decodificador para el porqué).
 */
func volumenDeFuerza(_ bloques: [Bloque]) -> (volumenKg: Double, serieMasPesada: SerieMasPesada?) {
    var volumenKg = 0.0
    var masPesada: SerieMasPesada?
    for b in bloques {
        guard b.modalidad == .fuerza, let kg = b.kg, let reps = b.repsTotal else { continue }
        volumenKg += Double(reps) * kg
        if masPesada == nil || kg > masPesada!.kg {
            masPesada = SerieMasPesada(etiqueta: b.etiqueta, kg: kg, reps: reps)
        }
    }
    return (volumenKg, masPesada)
}
