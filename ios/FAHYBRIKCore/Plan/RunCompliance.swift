import Foundation

// EL VEREDICTO, TAL Y COMO VIAJA POR EL CABLE.
//
// `GET /api/athlete/assignments/{id}/detail` sirve `run_compliance` como HERMANO
// de `execution`, nunca dentro de él. Lo construye `buildRunCompliance`
// (web/lib/dashboard/coach/run-compliance.ts) con el MISMO motor
// (`evaluateRunSegment`) que juzga la sesión en el panel del coach.
//
// LA REGLA QUE SOSTIENE ESTE FICHERO: aquí NO se juzga nada. Dos motores para el
// mismo hecho es cómo coach y atleta acaban leyendo veredictos distintos de la
// misma serie. Este fichero solo sabe LEER lo que ya se decidió una vez.
//
// LO QUE NO TRAE, Y HAY QUE IR A BUSCARLO A `execution.segments[]`: `tramos[]` no
// lleva un solo número medido — ni duración, ni distancia, ni ritmo, ni pulso.
// Lleva el juicio y con qué se juzgó. La fusión es por `position` y vive en
// `LecturaDeCarreraDesdeDetalle.swift`.

/// `run_compliance`: seis claves, y ninguna más. Espeja `RunComplianceResult`.
struct RunCompliance: Codable, Equatable {
    var summary: ResumenTrabajo
    var tramos: [RunComplianceTramo]
    var recoverySummary: ResumenRecuperacion
    var recoveryTramos: [RecoveryComplianceTramo]
    var workDurationSummary: ResumenDuracionTrabajo
    var recoveryDurationSummary: ResumenDuracionRecuperacion

    /// EL UMBRAL DE PENDIENTE DEL COACH, en %: a partir de ahí el ritmo bruto deja
    /// de ser comparable. **Método suyo, no mecanismo nuestro** — hay quien corrige
    /// el ritmo por pendiente en vez de retirarlo, así que el número no puede vivir
    /// en una constante de este binario.
    ///
    /// Nulo mientras el servidor no lo sirva (y en cualquier detalle cacheado de
    /// antes): entonces se lee con el suelo de `MetodoDeLectura.porDefecto`, que es
    /// exactamente lo que se leía hasta ahora. En cuanto llegue, manda él.
    ///
    /// **NOMBRE PENDIENTE DE CONFIRMAR** con quien está subiendo la regla a
    /// `shared/domain/running/gradient.ts`. Si el servidor lo llama de otra forma,
    /// se cambia AQUÍ y en ningún otro sitio: nadie más lee esta clave.
    var gradientThresholdPct: Double?

    /// Toda clave es opcional al decodificar: una respuesta anterior a esta tanda
    /// —o un despliegue a medias— no puede tumbar el detalle entero de una sesión
    /// por no traer un resumen que nadie está mirando todavía.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        summary = try c.decodeIfPresent(ResumenTrabajo.self, forKey: .summary) ?? .vacio
        tramos = (try c.decodeIfPresent(LossyArray<RunComplianceTramo>.self, forKey: .tramos))?
            .wrappedValue ?? []
        recoverySummary = try c.decodeIfPresent(ResumenRecuperacion.self, forKey: .recoverySummary)
            ?? .vacio
        recoveryTramos = (try c.decodeIfPresent(
            LossyArray<RecoveryComplianceTramo>.self, forKey: .recoveryTramos))?.wrappedValue ?? []
        workDurationSummary = try c.decodeIfPresent(
            ResumenDuracionTrabajo.self, forKey: .workDurationSummary) ?? .vacio
        recoveryDurationSummary = try c.decodeIfPresent(
            ResumenDuracionRecuperacion.self, forKey: .recoveryDurationSummary) ?? .vacio
        gradientThresholdPct = try c.decodeIfPresent(Double.self, forKey: .gradientThresholdPct)
    }

    /// El método del coach que viaja en este payload, listo para leer la carrera.
    /// Sin número servido, el suelo de siempre.
    var metodoDeLectura: MetodoDeLectura {
        guard let umbral = gradientThresholdPct, umbral.isFinite, umbral > 0 else {
            return .porDefecto
        }
        return MetodoDeLectura(pendienteQueRetiraElRitmoPct: umbral)
    }

    /// UN PORCENTAJE NULO NO ES UN CERO. `pctDentro` viene nulo cuando no había
    /// nada evaluable, y eso significa «no hay porcentaje que enseñar», no «cero
    /// por ciento». Los opcionales de aquí abajo lo respetan.
    struct ResumenTrabajo: Codable, Equatable {
        var total = 0
        var evaluable = 0
        var dentro = 0
        var fueraRapido = 0
        var fueraLento = 0
        var sinDato = 0
        var pctDentro: Double?
        static let vacio = ResumenTrabajo()
    }

    struct ResumenRecuperacion: Codable, Equatable {
        var total = 0
        var evaluable = 0
        var controlada = 0
        var demasiadoRapida = 0
        var sinDato = 0
        var pctControlada: Double?
        static let vacio = ResumenRecuperacion()
    }

    struct ResumenDuracionTrabajo: Codable, Equatable {
        var total = 0
        var evaluable = 0
        var completa = 0
        var incompleta = 0
        var sinDato = 0
        var pctCompleta: Double?
        static let vacio = ResumenDuracionTrabajo()
    }

    /// Ojo: `pctControlada` se llama IGUAL que el de `ResumenRecuperacion` y no es
    /// lo mismo — aquel responde «¿respetó la intensidad?» y este «¿respetó el
    /// tiempo?». Viven en objetos distintos justamente para no colapsarse.
    struct ResumenDuracionRecuperacion: Codable, Equatable {
        var total = 0
        var evaluable = 0
        var controlada = 0
        var excedida = 0
        var sinDato = 0
        var pctControlada: Double?
        static let vacio = ResumenDuracionRecuperacion()
    }
}

// MARK: - Un tramo juzgado

/// Un tramo de TRABAJO con su juicio. Ocho claves, ni una medida entre ellas.
struct RunComplianceTramo: Codable, Equatable {
    /// El ítem prescrito al que pertenece ("segment-{id}").
    let itemUid: String
    /// La `position` del `execution.segments[]` que lo ejecutó. **Nula = se
    /// prescribió y no se corrió**, y entonces no hay nada con lo que fusionarlo.
    let position: Int?
    let verdict: RunComplianceVerdict
    /// Pregunta INDEPENDIENTE de la intensidad. Nula = no se prescribió por tiempo.
    let durationVerdict: WorkDurationVerdict?
    /// 1..N sobre las repeticiones de trabajo del ítem. Nula cuando el servidor no
    /// pudo alinear el lap con un tramo prescrito.
    let repOrdinal: Int?
    /// El eje con el que se juzgó, redundante con `band.axis` — se lee de `band`.
    let bandAxis: String?
    let band: ComplianceBand?
    /// LO QUE PIDIÓ EL COACH, no lo que se midió. Es la rama 1 del corrector de
    /// pendiente y no depende de que hayamos medido nada. Nula ≠ cero: cero sería
    /// «llano PEDIDO», que es otra afirmación.
    let prescribedInclinePct: Double?
}

/// Una RECUPERACIÓN juzgada. **Cinco claves, y ni `rep_ordinal` ni
/// `prescribed_incline_pct` entre ellas** — el servidor no las manda aquí, así que
/// el tipo tampoco las finge.
struct RecoveryComplianceTramo: Codable, Equatable {
    let itemUid: String
    let position: Int?
    let verdict: RecoveryComplianceVerdict
    let durationVerdict: RecoveryDurationVerdict?
    let band: ComplianceBand?
}

// MARK: - La banda contra la que se juzgó

/// Espeja `ComplianceBand` de `shared/domain/adherence`: una unión discriminada
/// por `axis` con tres ramas (`pace` · `hr` · `rpe`).
///
/// Se guarda con el eje CRUDO a propósito. Un eje que esta versión de la app no
/// conozca todavía no puede tumbar la decodificación del detalle entero: se lee
/// como «no hay banda que dibujar», que es exactamente lo que significa.
struct ComplianceBand: Codable, Equatable {
    let axis: String
    /// s/km, el borde RÁPIDO (el número más pequeño). Nulo = sin tope por arriba.
    let fastS: Double?
    /// s/km, el borde LENTO. Nulo = sin tope por abajo (la zona más alta del
    /// atleta es abierta por definición).
    let slowS: Double?
    let minBpm: Double?
    let maxBpm: Double?

    /// LA BANDA, TIPADA — y **sin resolver ninguna precedencia**: eso ya lo hizo
    /// el servidor una vez. Aquí solo se nombra la rama.
    ///
    /// UN BORDE AUSENTE SE ESCRIBE COMO EL INFINITO QUE SIGNIFICA. «No más lento
    /// de 3:20» es una banda con borde lento infinito: nada es demasiado lento
    /// porque no se pidió un suelo. Escribirlo como un cero de relleno diría lo
    /// contrario, y el dominio ya sabe leer un borde no finito (ni lo mete en el
    /// eje de la curva ni lo escribe en el copy).
    func objetivo(zonas: HRZoneProfile?) -> Objetivo? {
        switch axis {
        case "pace":
            guard fastS != nil || slowS != nil else { return nil }
            return .ritmo(rapidoSkm: fastS ?? 0, lentoSkm: slowS ?? .infinity)
        case "hr":
            guard let min = minBpm, let max = maxBpm else { return nil }
            // La zona la nombra el perfil del atleta, que es de dónde salen todos
            // los colores de pulso de la app. Sin perfil no hay zona que nombrar y
            // no se inventa una: la banda se queda sin dibujar antes que pintarse
            // de un color que no significa nada (docs/DECISIONS: el color es dato).
            guard let zona = zonas?.zone(forBpm: Int(max.rounded())) else { return nil }
            return .zona(zona.rawValue, minPpm: min, maxPpm: max)
        case "rpe":
            // Hubo intención y no hay número contra el que medir una repetición.
            return .sensacion
        default:
            return nil
        }
    }
}
