import Foundation

// EL LENGUAJE DEL ENTRENO EN VIVO — el núcleo, sin pintar nada.
//
// Es el equivalente Swift de `web/components/design-twin/kit-vivo.tsx`, y existe
// por lo mismo: la tanda del 29-jul acertó la ESTRUCTURA de las vistas en vivo y
// falló el LENGUAJE — siete pantallas correctas que no se reconocían como la
// misma app. El tinte de zona vivía solo en el rodaje, el numeral tenía cinco
// implementaciones y el sujeto caía a una altura distinta en cada pantalla.
//
// AQUÍ VIVE LO QUE ES UNA DECISIÓN, NO UN PÍXEL:
//
//   BandaViva      — dónde cae el sujeto (§10.3)
//   EscalaNumeral  — cuánto mide el numeral, de alto y de ancho (§10.2)
//   Delta          — si vas mejor o peor que tu objetivo
//   Trabajo        — si lo que haces se puede contar (§10.6)
//
// POR QUÉ ESTE FICHERO ESTÁ PARTIDO EN DOS (y el otro es `LenguajeVivoUI.swift`):
// este compila TAMBIÉN en el reloj (lista explícita del target en
// ios/project.yml), y el reloj no compila `Theme/Theme.swift` — no tiene
// `Theme.Color` ni `Theme.Typography`, se pinta con su propio `WatchTheme`. Es
// el mismo reparto que ya hace `ZoneColors.swift`: la IDENTIDAD de la zona se
// comparte, el color se queda en el teléfono.
//
// La frontera se eligió por lo que puede DIVERGIR. Que la muñeca pinte más
// pequeño es correcto; que la muñeca diga «+2s» donde el teléfono dice «+2 s vs
// objetivo», o que juzgue que vas bien cuando el teléfono dice que vas mal, es
// exactamente el fallo de los formateadores del 28-jul con otra cara. Por eso el
// JUICIO y la GRAFÍA se comparten y solo el pintado se queda fuera.
//
// Regla de mantenimiento (§0): si dentro de un mes hay que cambiar la banda o la
// escala, se cambia AQUÍ y cambia en las diez vistas. Una pantalla que vuelva a
// escribir su propio tamaño de sujeto está rompiendo el §10, no «adaptándolo a
// su caso».

// MARK: - §10.3 · La banda del sujeto — un ancla, no una caja

/// EL REPARTO DEL ALTO de toda vista en vivo, en puntos del lienzo lógico.
///
/// En una familia de vistas que se turnan durante el MISMO entreno el sujeto no
/// puede bailar: si en una está centrado y en la siguiente 200 pt más abajo, el
/// atleta reencuadra cada vez que cambia el formato. Se fija el ancla y todas la
/// respetan, sea cual sea el dato que caiga dentro.
///
/// CORREGIDO EL 29-JUL — y es la corrección que da sentido a todo lo demás: una
/// banda de ALTO FIJO obliga al sobrante a caer *entre* el sujeto y los apoyos.
/// En el EMOM, que solo tiene la traza de rondas debajo, quedaban ~230 pt de
/// vacío en mitad de la pantalla: el mismo «se apila y sobra cola» que el §6.1
/// prohíbe, con la cola en medio en vez de al final.
///
/// **La banda ancla el CENTRO ÓPTICO del sujeto; no le reserva un alto.** Lo que
/// el sujeto no ocupa se lo quedan los apoyos, que crecen hacia arriba hasta
/// tocarlo. El orden del sobrante lo aplica `MarcoVivoLayout`:
///
///   1. Primero crecen los apoyos (§6.1: «el sobrante entra en las filas»).
///   2. Si no hay apoyos que crecer, crece el sujeto — el numeral escala solo
///      hasta el techo en que deja de leerse cómodo (`EscalaNumeral`).
///   3. Si aun así sobra, a la vista le falta CONTENIDO, no espacio (§10.6).
enum BandaViva {
    /// Salir, pausa, en qué serie vas.
    static let cromo: CGFloat = 34
    /// La franja que no desaparece jamás: el minuto, el crono-puntuación, la ventana.
    static let contexto: CGFloat = 46
    /// El alto MÁXIMO del sujeto — el techo de la banda, no una reserva.
    static let sujeto: CGFloat = 340
    /// La acción: se alcanza con una mano y NO compite con el sujeto (§10.5).
    static let accion: CGFloat = 76
    /// Relleno del marco y hueco entre filas (= `Theme.Spacing.m`, que el reloj
    /// no compila; el valor se repite aquí a propósito y está fijado por test).
    static let hueco: CGFloat = 12

    /// EL ANCLA: a cuántos puntos del borde superior del área segura cae el
    /// centro óptico del sujeto. **En las diez vistas, el mismo.**
    ///
    /// Se DERIVA de las filas de arriba en vez de escribirse a mano, para que
    /// mover el cromo mueva el ancla de forma coherente en vez de dejar dos
    /// números que se contradicen en silencio. Sobre el lienzo del iPhone 17 Pro
    /// (874 pt, safe 59/34 → 781 útiles) sale a 286 pt bajo el área segura, que
    /// son 345 pt desde el borde de la pantalla:
    ///
    ///     relleno 12 + CROMO 34 + hueco 12 + CONTEXTO 46 + hueco 12 + media banda 170
    ///
    /// 345 pt es donde ya caía el numeral del rodaje, que es la vista que Alex
    /// aprobó: el ancla no inventa una altura, fija la que funcionaba.
    static var centroSujeto: CGFloat {
        hueco + cromo + hueco + contexto + hueco + sujeto / 2
    }

    /// Alto mínimo que hace falta para que el reparto vertical tenga sentido. Por
    /// debajo (el móvil girado: 402 pt) la estrategia `gobierna` ya no se sostiene
    /// y el marco degrada a `centra`, que es lo que manda el §6.1 cuando una
    /// estrategia se queda sin sitio. La VOZ no cambia: mismo tinte, mismo
    /// numeral, misma acción.
    static let altoMinimoVertical: CGFloat = 640
}

// MARK: - §10.2 · Un solo numeral, y es el del cero rachado

/// CUÁNTO MIDE EL NUMERAL. Una escala, con dos peldaños vivos.
///
/// Los números grandes de una vista en vivo se leen a tres metros, sudando y en
/// movimiento. Van todos con la misma cara (mono recta, pesada, tabular — la del
/// cero rachado) y con el MISMO criterio de tamaño. Nada de tres tratamientos
/// distintos para el 139 del pulso, el 0:25 del reloj y el 5×100 de la serie.
enum EscalaNumeral {
    /// El número que gobierna la pantalla.
    case sujeto
    /// El TRABAJO, que es lo segundo más importante de la pantalla (§10.6).
    case segundo

    /// Fracción del alto disponible que ocupa el numeral. Con el lienzo del
    /// iPhone 17 Pro (781 pt útiles) el 16 % del sujeto sale a ~125 pt: se lee de
    /// pie, a dos metros y con el móvil en el suelo.
    var fraccion: CGFloat {
        switch self {
        case .sujeto:  return 0.16
        case .segundo: return 0.07
        }
    }

    /// Suelo: por debajo de esto el número deja de ser un instrumento.
    var minimo: CGFloat {
        switch self {
        case .sujeto:  return 64
        case .segundo: return 30
        }
    }

    /// Techo: por encima el número ya no gana nada y se come la pantalla.
    var maximo: CGFloat {
        switch self {
        case .sujeto:  return 140
        case .segundo: return 56
        }
    }

    /// El avance de un glifo de la monoespaciada del sistema, en ems. SF Mono
    /// avanza 0,6 em por carácter, y de ahí sale el presupuesto de ancho.
    static let avanceMono: CGFloat = 0.6

    /// Por debajo de este número de glifos el ancho no puede morder: «139»,
    /// «0:21» y «1:54» caben de sobra a 140 pt. Solo las cifras largas se enteran
    /// de que el presupuesto existe.
    static let glifosSinRiesgo = 4

    /// El numeral respira contra los bordes del lienzo en vez de tocarlos.
    static let margenLateral: CGFloat = 0.94

    /// EL TAMAÑO DEL NUMERAL — el menor de los dos techos: el que deja el ALTO y
    /// el que deja el ANCHO.
    ///
    /// La escala por alto sola NO basta, y esto costó una vista: «139», «0:21» y
    /// «1:54» caben de sobra a 125 pt, pero «5 × 100» son siete avances de la
    /// mono (0,6 em cada uno) = 525 pt sobre un lienzo de 378. Sin presupuesto de
    /// ancho la fuerza tuvo que partir su prescripción en dos peldaños y «5 × 100»
    /// dejó de leerse como UNA cosa, que es justo lo que el atleta tiene delante.
    ///
    /// - Parameters:
    ///   - texto: la cifra que se va a pintar. Su longitud es el presupuesto.
    ///   - alto: alto disponible para el numeral (la banda del sujeto).
    ///   - ancho: ancho disponible del lienzo.
    ///   - escalaTipografica: el factor de Dynamic Type (§4). Crece el número con
    ///     el ajuste de texto del sistema **hasta que topa con la caja**: a partir
    ///     de ahí manda la caja, porque un numeral recortado se lee peor que uno
    ///     que no creció.
    static func tamano(texto: String,
                       alto: CGFloat,
                       ancho: CGFloat,
                       escala: EscalaNumeral,
                       escalaTipografica: CGFloat = 1) -> CGFloat {
        let porAlto = min(max(escala.minimo, alto * escala.fraccion), escala.maximo)
        let deseado = porAlto * max(1, escalaTipografica)
        guard let porAncho = techoDeAncho(texto: texto, ancho: ancho) else {
            return min(deseado, escala.maximo * max(1, escalaTipografica))
        }
        return min(deseado, porAncho)
    }

    /// El techo que impone el ANCHO, o nil cuando la cifra es corta y no puede
    /// morder. Nil y no `.infinity` a propósito: «no aplica» y «un techo enorme»
    /// no son lo mismo, y quien llame tiene que poder distinguirlo.
    static func techoDeAncho(texto: String, ancho: CGFloat) -> CGFloat? {
        let glifos = texto.count
        guard glifos > glifosSinRiesgo, ancho > 0 else { return nil }
        return (ancho * margenLateral) / (avanceMono * CGFloat(glifos))
    }
}

// MARK: - La comparación honesta — lo que el ergo hacía bien y nadie copiaba

/// En qué dirección está lo bueno. En ritmo, menos es mejor; en vatios, más.
enum SentidoDelta {
    case menos
    case mas
}

/// El veredicto de una comparación contra un objetivo.
enum JuicioDelta: Equatable {
    /// Vas mejor que lo pedido.
    case mejor
    /// Vas peor que lo pedido.
    case peor
    /// Estás en el objetivo — dentro del margen en que la diferencia no es dato.
    case igual
}

/// LA DIFERENCIA CONTRA EL OBJETIVO — la pieza que convierte un número suelto en
/// una lectura.
///
/// «1:54» obliga al atleta a acordarse de su objetivo y restar de cabeza a 170
/// ppm; «+2 s vs objetivo» ya está interpretado. Y SIEMPRE se dice contra qué se
/// compara: un delta sin referente es un número que miente por omisión.
struct Delta: Equatable {
    /// La diferencia con signo, en la unidad de `unidad`. Nil = no hay nada que
    /// comparar, y entonces no se pinta nada (§7).
    let valor: Double
    /// «s» · «W».
    let unidad: String
    let sentido: SentidoDelta
    /// «vs objetivo» · «vs tu serie 1». Siempre se dice contra qué.
    let sufijo: String
    /// Qué se lee cuando la diferencia es cero. Depende de contra qué compares:
    /// «en el objetivo» no vale para «vs tu serie 1».
    let textoNulo: String

    /// Por debajo de media unidad la diferencia se redondearía a cero, y pintar
    /// «+0 s» es peor que decir «en el objetivo»: sugiere una precisión que no
    /// existe y encima se lee como un error.
    static let margenNulo: Double = 0.5

    var juicio: JuicioDelta {
        if abs(valor) < Self.margenNulo { return .igual }
        let mejor = sentido == .menos ? valor < 0 : valor > 0
        return mejor ? .mejor : .peor
    }

    /// Lo que se lee: «+2 s» · «−3 s» · «en el objetivo».
    var texto: String {
        juicio == .igual ? textoNulo : Formato.delta(valor, unidad)
    }

    /// Una cifra va en la voz de instrumento; «en el objetivo» NO es una cifra y
    /// monoespaciarla la disfraza de medida (§4).
    var esCifra: Bool { juicio != .igual }
}

// MARK: - §10.6 · Lo que de verdad haces no va en gris

/// EL TRABAJO — lo segundo más importante de la pantalla.
///
/// En un EMOM el sujeto es el minuto drenando, pero lo que de verdad haces es
/// «10 de 12 cal». Eso estaba más pequeño que el reloj y metido en un panel gris
/// aparte, como si fuera servicio. Lo secundario se pliega (§6, regla 4), pero el
/// trabajo NO es secundario.
struct Trabajo: Equatable {
    /// El movimiento: «Calorías», «Wall balls», «Sentadilla trasera».
    let nombre: String
    /// Nil = no hay nada que lo cuente. Entonces manda el nombre y NO se finge un
    /// cero (§7): un contador se pinta en cero, pero solo cuando de verdad cuenta.
    let hecho: Int?
    let objetivo: Int?
    /// «cal» · «reps» · «m». Nil cuando el nombre ya la lleva dentro.
    let unidad: String?

    /// Solo hay cifra que pintar cuando se sabe lo hecho Y lo pedido. Con uno de
    /// los dos no hay lectura: «10 de ?» no es información.
    var esContable: Bool { hecho != nil && objetivo != nil }

    /// «10 de 12», o nil cuando no hay nada que contar.
    var cifra: String? {
        guard let hecho, let objetivo else { return nil }
        return Formato.trabajo(hecho: hecho, objetivo: objetivo)
    }
}
