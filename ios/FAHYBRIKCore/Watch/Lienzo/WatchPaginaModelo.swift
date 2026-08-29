import SwiftUI

// EL LIENZO DE LA MUÑECA — la mitad que es MODELO.
//
// Aquí vive lo que una pantalla del reloj DECLARA (el modo, la página, el tinte,
// la nota, la altura del sujeto); el pintado —`WatchReloj`— se queda en el target
// del reloj, en `FAHYBRIKWatch/Lienzo/WatchLienzo.swift`.
//
// POR QUÉ ESTÁ AQUÍ Y NO EN EL RELOJ: los guiones son funciones puras estado →
// páginas, y son lo que decide qué lee el atleta en la muñeca. Compilando este
// modelo también en el target de iOS, `FAHYBRIKTests` (que es iOS) puede recorrer
// la cadena entera móvil → cable → muñeca y comprobar las páginas que salen. Antes
// vivía sólo en watchOS y por eso ese tramo no lo verificaba nadie.

// MARK: - Modo

/// Lo que el atleta PUEDE hacer ahora mismo — manda sobre el formato.
enum WatchModo: Equatable {
    /// Ni mirar ni tocar: el reloj enuncia y espera. Oferta atenuada, jamás petición.
    case ciego
    /// Mirar sin tocar: un dato a sangre. Gesto latente sin franja anunciada.
    case ojeada
    /// Mirar y tocar: aquí van la decisión y la franja a plena luz.
    case mando

    var pintaFranja: Bool {
        switch self {
        case .ciego, .mando: return true
        case .ojeada: return false
        }
    }

    var franjaAtenuada: Bool {
        switch self {
        case .ciego: return true
        case .ojeada, .mando: return false
        }
    }
}

// MARK: - Cuerpo de la página

/// Una fila del panel: su etiqueta en versales y su valor, con la unidad aparte
/// para poder pintarla más pequeña sin que le robe ancho a la cifra.
struct WatchFila: Identifiable {
    let id: String
    let etiqueta: String
    let valor: String
    var unidad: String? = nil
    /// Cola en la misma fila — «Z3 medio» junto a los ppm. Va con su color porque
    /// la zona ES lo que significa el pulso, no una fila aparte.
    var cola: String? = nil
    var colaTono: Color? = nil
}

/// Un botón de la página de controles.
struct WatchBoton: Identifiable {
    /// Cómo pesa un botón. No es estética: es cuánto cuesta equivocarse.
    enum Peso: Equatable {
        /// La acción más frecuente y más urgente: rellena en el naranja de la acción.
        case principal
        /// Una acción normal: superficie levantada.
        case normal
        /// La única destructiva. Va en rojo y CONFIRMADA.
        case destructiva
    }
    let id: String
    let titulo: String
    var peso: Peso = .normal
    /// Pregunta de confirmación. Presente ⇒ el botón pregunta antes de hacer.
    var confirma: String? = nil
    let onToca: () -> Void
}

/// El cuerpo ALTERNATIVO al numeral. Nil en `WatchPagina` = la página es un
/// sujeto a sangre, que es el caso de siempre y el de las siete familias.
enum WatchCuerpo {
    /// Varias filas y NINGÚN sujeto. Es la única página de la interfaz sin un
    /// número que gobierne, y eso es su definición: el panel al que se va a
    /// buscar una cifra, no la que se mira corriendo.
    case panel([WatchFila])
    /// Botones apilados. La única página que los tiene, porque es la única a la
    /// que se llega habiendo decidido dejar de mirar y tocar.
    case controles([WatchBoton])
}

// MARK: - Página

/// Una página del reloj. Lo que no cabe no encoge: se va a la siguiente.
struct WatchPagina: Identifiable {
    let id: String
    /// Banda superior de una línea: dónde estás.
    let contexto: String
    let modo: WatchModo
    /// El numeral a sangre.
    let sujeto: String
    var unidad: String? = nil
    var tono: Color = WatchTheme.ink
    /// Segundo nivel — y no hay tercero.
    var segundoEtiqueta: String? = nil
    var segundoValor: String? = nil
    var segundoTono: Color? = nil
    /// Franja de acción. En `ojeada` el lienzo no la pinta (gesto latente).
    var accion: String? = nil
    var onToca: (() -> Void)? = nil
    /// Versales al pie: procedencia u honestidad.
    var nota: String? = nil
    /// EL LATIDO — un golpe de escala en el numeral cuando este número cambia.
    ///
    /// Existe para el reloj de pared (`GuionRelojDePared`): en un tabata la
    /// cifra no se lee a tiempo de servir para nada —ni en los 20 s de trabajo
    /// ni en los 10 de parada hay ninguna decisión que cambie sabiendo el
    /// segundo exacto—, así que lo que se usa es el ESTADO: trabajas o paras.
    /// El latido es la confirmación de que la ronda cambió, sin pedir que se
    /// enfoque el número para leerlo. Sube el valor para disparar el golpe; que
    /// el número en sí sea el mismo o distinto no importa, sólo el cambio.
    var latido: Int = 0
    /// Cuerpo alternativo al numeral (panel o controles). Cuando viene, el lienzo
    /// lo pinta y `sujeto` no se usa: son excluyentes, y por eso las dos páginas
    /// que lo llevan se construyen con `panel(...)` / `controles(...)`, que no
    /// piden sujeto.
    var cuerpo: WatchCuerpo? = nil
    /// El fondo de esta página manda sobre el tinte de zona. Lo usa el DESCANSO:
    /// es el único tramo en marcha en el que la zona deja de gobernar, porque lo
    /// que importa es que estás parado, no a qué intensidad estabas.
    var fondo: Color? = nil
}

extension WatchPagina {
    /// LA PÁGINA PANEL. Sin sujeto a propósito: una página que intenta ser panel y
    /// sujeto a la vez es la «letra pequeña alrededor» que hay que quitar.
    static func panel(id: String, contexto: String, filas: [WatchFila], nota: String? = nil) -> WatchPagina {
        WatchPagina(id: id, contexto: contexto, modo: .ojeada, sujeto: "",
                    nota: nota, cuerpo: .panel(filas))
    }

    /// LA PÁGINA DE CONTROLES. `mando` porque a esta se llega parado: aquí la
    /// decisión se anuncia y se puede tocar.
    static func controles(id: String, contexto: String, botones: [WatchBoton]) -> WatchPagina {
        WatchPagina(id: id, contexto: contexto, modo: .mando, sujeto: "",
                    cuerpo: .controles(botones))
    }

    /// True cuando esta página gobierna con un numeral. Las dos que no —el panel y
    /// los controles— se saltan la aritmética del sujeto.
    var tieneSujeto: Bool { cuerpo == nil }

    /// Las filas, si esta página es un panel. Nil en las otras dos.
    var filas: [WatchFila]? {
        if case .some(.panel(let f)) = cuerpo { return f }
        return nil
    }

    /// Los botones, si esta página es la de controles. Nil en las otras dos.
    var botones: [WatchBoton]? {
        if case .some(.controles(let b)) = cuerpo { return b }
        return nil
    }
}

// MARK: - Destello

/// Golpe de luz a pantalla completa por SUCESO (cierre de serie, ronda nueva).
struct WatchDestello: Equatable {
    var n: Int = 0
    var color: Color = WatchTheme.orangeSoft
}

// MARK: - Zona (nombres de box, no jerga de corredor)

enum WatchZonaNombre {
    static func de(_ zone: HRZone) -> String {
        switch zone {
        case .z1: return "muy suave"
        case .z2: return "suave"
        case .z3: return "medio"
        case .z4: return "fuerte"
        case .z5: return "máximo"
        }
    }
}

// MARK: - Honestidad (§7)

enum WatchNota {
    static let delMovil = "del móvil"
    static let sinMaquina = "sin máquina emparejada"
    static let sinAncla = "sin umbral · no hay zona"
    static let umbralEstimado = "umbral estimado"
    static let loDicesTu = "lo dices tú"
    static let sinSenal = "sin señal · buscando"
}

// MARK: - Tinte del lienzo

enum WatchTinte {
    /// EL RELLENO DE ZONA — PLANO y fuerte, no una banda que se desvanece.
    ///
    /// Estaba al 38 % debajo de un degradado que iba a negro puro arriba y abajo y
    /// dejaba el color vivo sólo en una franja estrecha del centro — justo donde va
    /// el numeral, que lo tapa. Así la zona no se leía, y el diagnóstico fácil era
    /// «el tinte es flojo»: bajarlo o subirlo no arregla nada, porque el problema
    /// era el degradado. Se corrige por la raíz: relleno plano y el negro reducido a
    /// una viñeta (`WatchVineta`).
    ///
    /// Por qué 45 y no más: el techo NO es de gusto, lo pone el ámbar de la Z4. El
    /// aro (`orangeSoft`) es un elemento gráfico que hay que entender, así que tiene
    /// que mantener 3:1 contra el lienzo, y sobre ámbar al 45 % se queda en 3,08:1
    /// — al 50 % ya es 2,67 y al 55 % 2,31, o sea que el aro desaparece. Con ese
    /// mismo 45 % el numeral blanco va de 7,18:1 (ámbar, el peor caso) a 12,25:1
    /// (azul). Medido, no elegido.
    static let maxOpacity: Double = 0.45

    /// Color de relleno del fondo, o nil → negro puro (sin ancla / sin zona).
    static func color(for zone: HRZone?) -> Color? {
        zone.map { WatchTheme.zoneColor($0) }
    }

    static func urgente(_ quedaS: Double) -> Color {
        quedaS > 0 && quedaS <= WatchTheme.urgentThreshold ? WatchTheme.orange : WatchTheme.ink
    }
}

// MARK: - Página del pulso (compartida por las nueve familias)

enum WatchPaginasComunes {
    /// Página del cuerpo. Sin pulso no se pinta (nil). Sin zona → ppm crudos + nota.
    static func pulso(bpm: Int?, zone: HRZone?, modo: WatchModo = .ojeada) -> WatchPagina? {
        guard let bpm else { return nil }
        if let zone {
            return WatchPagina(
                id: "pulso",
                contexto: "Pulso",
                modo: modo,
                sujeto: "\(bpm)",
                segundoValor: "Z\(zone.rawValue) \(WatchZonaNombre.de(zone))",
                segundoTono: WatchTheme.zoneColor(zone)
            )
        }
        return WatchPagina(
            id: "pulso",
            contexto: "Pulso",
            modo: modo,
            sujeto: "\(bpm)",
            segundoValor: "ppm",
            nota: WatchNota.sinAncla
        )
    }

    /// LA ZONA COMO SUJETO — la página que contesta «cómo de fuerte voy» sin
    /// pedir que se lea un número.
    ///
    /// Es OTRA pregunta que la del pulso, y las dos son legítimas: «156 ppm»
    /// dice cuántas pulsaciones tienes y sólo contesta la intensidad si el
    /// atleta se sabe sus bandas de memoria; «Z3» la contesta directa, y el
    /// color del lienzo la contesta sin ni siquiera leer.
    ///
    /// Sin zona NO SE PINTA (nil): no se insinúa un estado sobre una banda que
    /// nadie ha medido (§7). El pulso sigue teniendo su página en ppm crudos.
    ///
    /// El veredicto contra el objetivo va en dos palabras y sin sermón — el
    /// háptico de fuera de zona ya avisa, esto sólo dice de qué lado te fuiste.
    /// Sin objetivo prescrito no hay veredicto: un rodaje libre no está «mal» a
    /// ninguna intensidad.
    static func zona(_ posicion: HRZoneProfile.Posicion?,
                     bpm: Int?,
                     objetivo: HRZone? = nil,
                     modo: WatchModo = .ojeada) -> WatchPagina? {
        guard let posicion else { return nil }
        let z = posicion.zona
        let veredicto: String? = {
            guard let objetivo, objetivo != z else { return nil }
            return z.rawValue > objetivo.rawValue ? "vas por encima" : "vas por debajo"
        }()
        return WatchPagina(
            id: "zona",
            contexto: objetivo == nil ? "Zona" : "Zona · objetivo Z\(objetivo!.rawValue)",
            modo: modo,
            sujeto: z.label,
            tono: WatchTheme.zoneColor(z),
            segundoEtiqueta: WatchZonaNombre.de(z),
            // El estado sin el número que lo sostiene invita a desconfiar de él.
            segundoValor: bpm.map { "\($0) ppm" } ?? "—",
            segundoTono: veredicto == nil ? nil : WatchTheme.orangeSoft,
            nota: veredicto,
            // Que el numeral pegue un golpe al cambiar de zona ES el aviso: no
            // hay que estar mirando la cifra para enterarse.
            latido: z.rawValue
        )
    }

    static func tiempo(segundos: Double, contexto: String = "Llevas", nota: String? = nil, modo: WatchModo = .ojeada) -> WatchPagina {
        WatchPagina(
            id: "tiempo",
            contexto: contexto,
            modo: modo,
            sujeto: WatchFormat.clock(segundos),
            nota: nota
        )
    }
}

// MARK: - Altura del sujeto (ancho manda)

// EL HALLAZGO QUE MANDA SOBRE TODO LO DEMÁS: en la muñeca NO limita el alto,
// limita el ANCHO. El lienzo tiene 212 pt de alto útil y sólo 188 de ancho, así
// que un sujeto se queda pequeño por número de cifras mucho antes que por falta
// de sitio vertical:
//
//   glifos │ ejemplo  │ altura de cifra
//   ───────┼──────────┼────────────────
//      1   │ `9`      │ 150  (le daría para más, pero ahí manda el techo)
//      2   │ `43`     │ 110
//      3   │ `139`    │  73
//      4   │ `1:30`   │  55
//      5   │ `63:45`  │  44  ← el suelo
//      6   │ `102:40` │  37  ← ya no es un sujeto, es una línea de texto grande
//
// Consecuencia: **lo que no cabe NO SE ENCOGE, se parte en páginas.** Y una cifra
// menos no es un 20 % más de altura: es un 50 %, así que quitarle un glifo a un
// sujeto es la palanca de legibilidad más grande que hay en este lienzo.
//
// Esto era un `switch` sobre `texto.count`, que cuenta la coma y la unidad como
// cifras enteras: «4,76» + «km» salía a 4 glifos → 56 pt, cuando de verdad ocupa
// 2,86 y le caben 77. El numeral del vivo perdía un tercio de su tamaño por una
// aproximación.
enum WatchSujeto {
    /// El lienzo del Apple Watch en puntos, y lo que dejan sus safe areas.
    static let anchoUtil: CGFloat = 188
    static let altoUtil: CGFloat = 212

    /// Lo que se lleva cada fila del lienzo, si está.
    static let filaContexto: CGFloat = 14
    static let filaSegundo: CGFloat = 26
    static let filaAccion: CGFloat = 15
    static let filaNota: CGFloat = 13
    static let filaPuntos: CGFloat = 14
    /// Aire mínimo por encima y por debajo del sujeto.
    static let aire: CGFloat = 10

    /// Altura de las cifras respecto al cuerpo de la fuente (cap height de la mono):
    /// la conversión entre «quiero un número de 100 pt» y el `font-size` real.
    static let capEm: CGFloat = 0.70
    /// En una monoespaciada TODOS los glifos avanzan lo mismo (0,6 em en Menlo), así
    /// que el sujeto se mide contando glifos y no estimando por carácter.
    static let avanceMono: CGFloat = 0.60
    /// La unidad («m», «kg», «/km») va pegada al numeral a un 30 % del cuerpo.
    static let unidadEm: CGFloat = 0.30
    /// EL DECIMAL NO ES EL DATO, ES LA PRECISIÓN, y por eso va a un 42 %. Con la coma
    /// avanzando como una cifra más, «4,76» se leía «4 , 76»: la coma abría un hueco
    /// idéntico al de un dígito y partía el número en dos.
    static let decimalEm: CGFloat = 0.42

    /// Techo: por encima el glifo pelea con la curva del bisel y no gana legibilidad.
    static let techo: CGFloat = 150
    /// Suelo: la altura a la que un sujeto deja de pesar sobre su apoyo y pasa a
    /// leerse como una línea de texto grande.
    static let suelo: CGFloat = 43
    /// Y el otro tope, el que de verdad se cruza: cinco cifras enteras.
    static let glifosMax = 5

    /// Parte un sujeto en la CIFRA que se lee y el DECIMAL que la afina.
    static func partirDecimal(_ texto: String) -> (entero: String, decimal: String) {
        guard let i = texto.firstIndex(of: ",") else { return (texto, "") }
        return (String(texto[texto.startIndex..<i]), String(texto[i...]))
    }

    /// Ancho de un sujeto medido en glifos de cuerpo entero, decimal y unidad aparte.
    static func anchoEnGlifos(_ texto: String, unidad: String? = nil) -> CGFloat {
        let (entero, decimal) = partirDecimal(texto)
        return CGFloat(entero.count)
            + CGFloat(decimal.count) * decimalEm
            + CGFloat(unidad?.count ?? 0) * unidadEm
    }

    /// Lo que el ANCHO del lienzo deja para este texto y su unidad.
    static func altoPorAncho(_ texto: String, unidad: String? = nil) -> CGFloat {
        anchoUtil / (max(1, anchoEnGlifos(texto, unidad: unidad)) * avanceMono) * capEm
    }

    /// Lo que el PRESUPUESTO VERTICAL deja, una vez puestos los apoyos de la página.
    static func altoPorPresupuesto(_ p: WatchPagina, varias: Bool) -> CGFloat {
        var ocupado = filaContexto
        if p.segundoValor != nil { ocupado += filaSegundo }
        if p.modo.pintaFranja, p.accion != nil { ocupado += filaAccion }
        if p.nota != nil { ocupado += filaNota }
        if varias { ocupado += filaPuntos }
        return min(techo, altoUtil - ocupado - 2 * aire)
    }

    /// LA altura de cifra que de verdad alcanza este sujeto: el menor de los dos
    /// límites. En la muñeca casi siempre gana el ancho.
    static func alto(de p: WatchPagina, varias: Bool) -> CGFloat {
        min(altoPorPresupuesto(p, varias: varias),
            altoPorAncho(p.sujeto, unidad: p.unidad))
    }

    /// El diagnóstico de una página: si no cabe, POR QUÉ no cabe. Lo recorre la
    /// suite sobre las páginas de los guiones, así que un sujeto que no entra rompe
    /// el test en vez de llegar a la muñeca con el número encogido.
    enum Veredicto: Equatable {
        case cabe(CGFloat)
        case demasiadosGlifos(Int)
        case sinSitio(CGFloat)
    }

    static func veredicto(de p: WatchPagina, varias: Bool) -> Veredicto {
        // Las páginas sin sujeto (panel, controles) no pasan por esta aritmética.
        guard p.tieneSujeto else { return .cabe(0) }
        let enteras = partirDecimal(p.sujeto).entero.count
        if enteras > glifosMax { return .demasiadosGlifos(enteras) }
        let alto = alto(de: p, varias: varias)
        return alto >= suelo ? .cabe(alto) : .sinSitio(alto)
    }
}
