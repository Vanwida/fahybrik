import Foundation

// LA TARJETA QUE SE COMPARTE — el modelo, aparte del dibujo.
//
// Card 132. El contrato visual es la pantalla `compartir-entreno` del doble
// (web/components/design-twin/screens/compartir-entreno/), aprobada por Alex el
// 24-ago: EL VÍDEO MANDA. Lo que sale de la app no es un cartel a pantalla
// completa sino UNA TARJETA con transparencia alrededor, que Instagram trata
// como pegatina: el atleta la mueve y la escala donde no le tape la cara — que
// es exactamente lo que hoy hace a mano con una captura, pero legible y con
// marca.
//
// Este fichero es el QUÉ cabe y el QUÉ se dice cuando no cabe todo. El recorte
// vive aquí y no en la vista por la misma razón que en el doble: una tarjeta
// que recorta callando miente sobre el entreno — quien la ve cree que eso fue
// todo lo que hiciste. Lo que no entra SE DECLARA («+N más»), siempre.

// MARK: - Las formas

/// Una repetición de una serie, con lo que salió. `8 × 400` no son ocho líneas
/// de «400 m»: son ocho NÚMEROS distintos, y esos números son justamente lo que
/// la gente enseña. El primero y el último cuentan una historia; la media sola,
/// ninguna.
struct RepeticionCartel: Equatable {
    /// Lo que se repitió, cuando NO lo dice ya la pauta (una pirámide). Nil en
    /// una tanda uniforme — ahí la cabecera ya dice «400 m» y repetirlo roba
    /// sitio al número.
    let etiqueta: String?
    /// El tiempo de esa repetición: «1:26».
    let valor: String
    /// El mismo tiempo en segundos — alimenta la barra proporcional. Nil cuando
    /// el valor no es un tiempo: entonces no hay barra, nunca una inventada.
    let segundos: Double?
    /// El ritmo, cuando aporta: «3:35 /km».
    let ritmo: String?
    /// La mejor de la tanda. Se marca sola a partir del dato — no la elige nadie.
    let mejor: Bool
}

/// Una línea de bloque de lista: un movimiento con su dosis o su resultado.
struct LineaCartel: Equatable {
    let nombre: String
    /// La dosis prescrita («4×5 · 80%») o lo hecho («4×5 · 110 kg»).
    let dato: String?
    /// True cuando `dato` es lo que SALIÓ, no lo que tocaba: va a plena tinta.
    let esHecho: Bool
}

/// DOS FORMAS DE BLOQUE, porque hay dos cosas distintas que enseñar.
///
/// `lista` — movimientos distintos con su dosis (fuerza, circuito, estación):
/// lo que interesa es QUÉ se hizo. `serie` — la misma cosa repetida con su
/// marca cada vez (tandas de carrera y de ergo): lo que interesa es CÓMO fue
/// cayendo. Meter una tanda como lista («8 × 400 m») tira justo el dato por el
/// que se comparte.
enum CuerpoBloqueCartel: Equatable {
    case lista([LineaCartel])
    case serie([RepeticionCartel])
}

struct BloqueCartelCompartir: Equatable {
    let titulo: String
    /// La cabecera del formato cuando dice algo: «4 rondas», «EMOM 12′».
    let pauta: String?
    let cuerpo: CuerpoBloqueCartel

    var lineas: Int {
        switch cuerpo {
        case .lista(let l): return l.count
        case .serie(let r): return Int(ceil(Double(r.count) / Double(Presupuesto.columnasDeSerie(r.count))))
        }
    }

    var cosas: Int {
        switch cuerpo {
        case .lista(let l): return l.count
        case .serie(let r): return r.count
        }
    }
}

/// La tarjeta de UN entreno — antes (lo que toca) o después (lo que salió).
struct TarjetaEntrenoDatos: Equatable {
    /// El chip: «MARTES». El día, no la fecha larga — en una story la fecha sobra.
    let chip: String
    let titulo: String
    /// Solo en la de después: el titular de lo que pasó (Tiempo · Volumen · …).
    let resultado: [(etiqueta: String, valor: String)]
    let bloques: [BloqueCartelCompartir]

    static func == (a: TarjetaEntrenoDatos, b: TarjetaEntrenoDatos) -> Bool {
        a.chip == b.chip && a.titulo == b.titulo && a.bloques == b.bloques
            && a.resultado.map(\.etiqueta) == b.resultado.map(\.etiqueta)
            && a.resultado.map(\.valor) == b.resultado.map(\.valor)
    }
}

/// Un día de la tira semanal. Los CINCO estados del plan (`EstadoDiaPlan`) se
/// pintan sin colapsar los que mentirían: `parcial` NO es `hecha` (afirmaría un
/// trabajo completo que no ocurrió) y `saltada` NO se disfraza de descanso — la
/// tira cuenta la semana que fue, y decidir si se comparte es del atleta.
struct DiaCartelSemana: Equatable {
    let letra: String
    let estado: EstadoDiaPlan
}

/// Una sesión de la lista semanal: día, qué fue. Sin datos inventados — la
/// semana del plan no sabe cuánto DURÓ cada entreno hecho, así que no lo dice.
struct SesionCartelSemana: Equatable {
    let dia: String
    let titulo: String
}

struct TarjetaSemanaDatos: Equatable {
    /// «SEMANA 34».
    let chip: String
    /// El nombre que el COACH le puso (microciclo o foco). Dato del coach.
    let titulo: String
    let dias: [DiaCartelSemana]
    /// «4/5 sesiones» — solo lo que la semana sabe de verdad.
    let totales: String
    let sesiones: [SesionCartelSemana]
}

/// Lo que la hoja de compartir enseña y exporta.
enum TarjetaCompartible: Equatable, Identifiable {
    case entreno(TarjetaEntrenoDatos)
    case semana(TarjetaSemanaDatos)

    /// Para `.sheet(item:)` — el contenido de la hoja es uno por presentación.
    var id: String {
        switch self {
        case .entreno(let d): return "entreno·\(d.chip)·\(d.titulo)"
        case .semana(let d): return "semana·\(d.chip)"
        }
    }
}

// MARK: - El presupuesto

/// EL PRESUPUESTO ES DE ALTO, NO DE LÍNEAS — y sus números son el CONTRATO con
/// el doble (`modelo.ts`, mismos valores): si cambia un cuerpo de letra allí,
/// cambia aquí, y el recorte sigue siendo verdad. Cada valor es COTA SUPERIOR,
/// huecos incluidos: un presupuesto corto produce el fallo silencioso que esto
/// existe para evitar (líneas cortadas por el borde sin que nada avise).
enum Presupuesto {
    /// La tarjeta: ancho fijo y alto tope, en píxeles de la story (1080×1920).
    /// 700 de 1080 es dos tercios del ancho; por encima del alto deja de ser
    /// una firma de esquina y vuelve a comerse el vídeo.
    static let ancho: CGFloat = 700
    static let altoMaximo: CGFloat = 700
    static let padding: CGFloat = 40

    static let titular: CGFloat = 152
    static let resultado: CGFloat = 100
    static let cabeceraBloque: CGFloat = 78
    static let linea: CGFloat = 48
    static let mas: CGFloat = 58
    static let club: CGFloat = 82
    static let tira: CGFloat = 88

    /// Cuántas repeticiones por fila: ocho parciales en una sola columna
    /// convierten la tarjeta de esquina en un cartel.
    static func columnasDeSerie(_ n: Int) -> Int { n > 5 ? 2 : 1 }
}

// MARK: - El recorte

enum RecorteCartel {

    struct Resultado: Equatable {
        let visibles: [BloqueCartelCompartir]
        let ocultos: Int
    }

    /// EL RECORTE, DECLARADO — a DOS PASADAS, y no es un adorno: la línea de
    /// «+N más» solo existe si algo se cayó, y no se sabe si algo se cae hasta
    /// haber repartido el sitio. La primera pasada reparte sin reservarle
    /// hueco; si nada se cayó, esa es la respuesta. Si algo se cayó, se
    /// reparte otra vez con la línea ya descontada. (La versión de una pasada
    /// tenía un agujero medido en el doble: cuando lo único que se caía era el
    /// ÚLTIMO bloque, la línea se pintaba sin sitio y la tarjeta se pasaba de
    /// su tope — 702 px de 700.)
    static func recortar(
        _ bloques: [BloqueCartelCompartir],
        conClub: Bool,
        conResultado: Bool
    ) -> Resultado {
        let base = Presupuesto.altoMaximo - Presupuesto.padding * 2 - Presupuesto.titular
            - (conClub ? Presupuesto.club : 0)
            - (conResultado ? Presupuesto.resultado : 0)

        let primera = repartir(bloques, presupuesto: base)
        if primera.ocultos == 0 { return primera }
        // Quitar presupuesto nunca des-oculta nada: la segunda pasada sigue
        // teniendo ocultos > 0 y el resultado es estable.
        return repartir(bloques, presupuesto: base - Presupuesto.mas)
    }

    /// El recorte de la SEMANA: sin fila de héroe (la tira ya es el titular
    /// visual y los totales viajan en la cabecera de la lista — con héroe
    /// además de tira, lista y club la tarjeta pasaba de 780 px, medido).
    static func recortarSemana(
        _ sesiones: [SesionCartelSemana],
        conClub: Bool
    ) -> (visibles: [SesionCartelSemana], ocultos: Int) {
        let base = Presupuesto.altoMaximo - Presupuesto.padding * 2 - Presupuesto.titular
            - Presupuesto.tira - Presupuesto.cabeceraBloque
            - (conClub ? Presupuesto.club : 0)

        func corta(_ presupuesto: CGFloat) -> (visibles: [SesionCartelSemana], ocultos: Int) {
            let caben = max(0, Int(presupuesto / Presupuesto.linea))
            return (Array(sesiones.prefix(caben)), max(0, sesiones.count - caben))
        }

        let primera = corta(base)
        if primera.ocultos == 0 { return primera }
        return corta(base - Presupuesto.mas)
    }

    private static func repartir(
        _ bloques: [BloqueCartelCompartir],
        presupuesto inicial: CGFloat
    ) -> Resultado {
        var presupuesto = inicial
        var visibles: [BloqueCartelCompartir] = []
        var ocultos = 0

        for b in bloques {
            let paraLineas = presupuesto - Presupuesto.cabeceraBloque
            // Un bloque partido a la mitad se lee peor que un bloque ausente:
            // se le pide sitio para dos líneas, salvo que solo TENGA una.
            let minimo = CGFloat(min(2, b.lineas))
            if paraLineas < Presupuesto.linea * minimo {
                ocultos += b.cosas
                continue
            }
            let filasQueCaben = Int(paraLineas / Presupuesto.linea)

            switch b.cuerpo {
            case .serie(let reps):
                let cols = Presupuesto.columnasDeSerie(reps.count)
                let dentro = Array(reps.prefix(filasQueCaben * cols))
                ocultos += reps.count - dentro.count
                visibles.append(BloqueCartelCompartir(titulo: b.titulo, pauta: b.pauta, cuerpo: .serie(dentro)))
                presupuesto -= Presupuesto.cabeceraBloque
                    + CGFloat(Int(ceil(Double(dentro.count) / Double(cols)))) * Presupuesto.linea
            case .lista(let lineas):
                let dentro = Array(lineas.prefix(filasQueCaben))
                ocultos += lineas.count - dentro.count
                visibles.append(BloqueCartelCompartir(titulo: b.titulo, pauta: b.pauta, cuerpo: .lista(dentro)))
                presupuesto -= Presupuesto.cabeceraBloque + CGFloat(dentro.count) * Presupuesto.linea
            }
        }

        return Resultado(visibles: visibles, ocultos: ocultos)
    }
}
