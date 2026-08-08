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
enum WatchModo {
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
    /// Tope del tinte de zona. Por encima el aro y las versales pierden contraste.
    static let maxOpacity: Double = 0.38

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

enum WatchSujeto {
    /// Techo / suelo del numeral (pt de cifra), espejo del kit-watch.
    static let techo: CGFloat = 110
    static let suelo: CGFloat = 44

    /// Altura de cifra por número de glifos. En la muñeca limita el ANCHO, no el alto.
    static func alto(para texto: String) -> CGFloat {
        let n = max(1, texto.count)
        let porAncho: CGFloat
        switch n {
        case 1: porAncho = techo
        case 2: porAncho = 96
        case 3: porAncho = 72
        case 4: porAncho = 56
        default: porAncho = suelo
        }
        return porAncho
    }
}
