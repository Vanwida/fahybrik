import Foundation

// LOS CUATRO ESTADOS DE UN BLOQUE (A10) Y SUS HUECOS — espejo de
// `kit-analiticas/mecanismo.ts#estadoDeBloque` y de `huecos.ts`.
//
// EL ESTADO SE DERIVA de lo que manda el servidor (cobertura, falta, último
// dato) y de los números del MÉTODO del coach; nunca de un flag que alguien
// tenga que acordarse de poner ni de un número escrito aquí (HARD RULE Nº0).
// Los umbrales que el servidor aún no sirve (`dato_viejo_dias`,
// `cobertura_poco_pct`…) llegan nulos, y entonces ese criterio NO se aplica: sin
// umbral no hay juicio — un bloque no puede salir «viejo» por un 14 inventado.
//
// LA PROSA DE UN HUECO VIVE AQUÍ, UNA VEZ (huecos.ts): el bloque no escribe su
// texto, lo deriva de la FALTA y de los números. Así el atleta y el coach dicen
// lo mismo ante el mismo hueco, y una frase se cambia en un sitio.

enum EstadoBloque: Equatable {
    case vacio, poco, lleno, viejo
}

/// A dónde lleva la salida de un hueco. Se decide en la tabla, nunca comparando
/// el texto del botón.
enum DestinoDeSalida: Equatable {
    case inicio, plan, carreras, dispositivos, chat, testsDeZonas
}

/// La salida de un hueco: un botón que lleva a un sitio, o el plazo que solo espera.
enum SalidaHueco: Equatable {
    case accion(String, DestinoDeSalida)
    case espera(String)
}

struct PlazoHueco: Equatable {
    let llevas: Int
    let hacen: Int
    /// «semanas» · «noches».
    let unidad: String
}

struct TextoHueco: Equatable {
    let titulo: String
    let cuerpo: String
    let salida: SalidaHueco
    let plazo: PlazoHueco?
}

enum AnaliticasEstados {

    // MARK: - El estado de un bloque

    /// vacío: ninguna lectura tiene dato y ninguna lleva historia empezada · poco:
    /// alguna espera historia (con algo ya andado), o no llega a las muestras
    /// mínimas o cubre menos ventana de la que el coach exige · viejo: el dato
    /// más reciente supera los días del coach · lleno: lo demás.
    static func estado(de lecturas: [LecturaAnalitica], hoy: String, metodo: MetodoDelPanel) -> EstadoBloque {
        let conDato = lecturas.conDato
        if conDato.isEmpty {
            return lecturas.contains(where: esperaHistoria) ? .poco : .vacio
        }
        let poco = lecturas.contains { l in
            if esperaHistoria(l) { return true }
            guard l.estado == .medida else { return false }
            if let minimas = metodo.muestrasMinimas, l.cobertura.muestras < minimas, l.cobertura.muestras > 0 { return true }
            if let tope = metodo.coberturaPocoPct, let pct = l.cobertura.pct, pct < tope { return true }
            return false
        }
        if poco { return .poco }
        if let viejo = metodo.datoViejoDias, let ultimo = ultimoDato(conDato),
           let dias = AnaliticasFechas.diasEntre(ultimo, hoy), dias > viejo {
            return .viejo
        }
        return .lleno
    }

    /// Espera TIEMPO con algo ya andado: una falta de historia con `llevas > 0`,
    /// tanto en una lectura apagada como en una medida en arranque en frío.
    static func esperaHistoria(_ l: LecturaAnalitica) -> Bool {
        if case .historia(let llevas, _)? = l.cobertura.falta { return llevas > 0 }
        return false
    }

    /// La primera falta de historia del bloque (para el plazo).
    static func faltaDeHistoria(_ lecturas: [LecturaAnalitica]) -> (llevas: Int, hacen: Int)? {
        for l in lecturas {
            if case .historia(let llevas, let hacen)? = l.cobertura.falta { return (llevas, hacen) }
        }
        return nil
    }

    /// El dato más reciente que sostiene las lecturas con número. Nulo si el
    /// servidor no lo sirve todavía.
    static func ultimoDato(_ lecturas: [LecturaAnalitica]) -> String? {
        lecturas.compactMap(\.cobertura.ultimoDato).max()
    }

    // MARK: - Los huecos: qué se dice cuando falta, y cuál es la salida

    private struct Vacio { let titulo: String; let cuerpo: String; let salida: SalidaHueco }

    private static func vacio(_ b: BloqueDelPanel) -> Vacio {
        switch b {
        case .estado: return Vacio(titulo: "Sin carga todavía", cuerpo: "Tu estado sale de la carga de tus entrenos. Con el primero ya aparece.", salida: .accion("Empezar un entreno", .inicio))
        case .forma: return Vacio(titulo: "Tu forma aparece con los entrenos", cuerpo: "Cada entreno con esfuerzo, ritmo o pulso suma carga. Con seis semanas la curva es fiable; con una ya se ve algo.", salida: .accion("Empezar un entreno", .inicio))
        case .semanas: return Vacio(titulo: "Nada hecho todavía", cuerpo: "Aquí verás cada semana lo que tenías que hacer y lo que hiciste, por familia.", salida: .accion("Ver mi plan", .plan))
        case .intensidad: return Vacio(titulo: "Sin tiempo en zonas", cuerpo: "Las zonas salen de tu pulso. Con una banda o el reloj, cada entreno se reparte solo.", salida: .accion("Conectar banda de pulso", .dispositivos))
        case .progreso: return Vacio(titulo: "Sin marcas que seguir", cuerpo: "Cada familia tiene su número clave: el ritmo umbral, el 2000 m, tu sentadilla. Salen con los primeros entrenos.", salida: .accion("Empezar un entreno", .inicio))
        case .records: return Vacio(titulo: "Todavía sin récords", cuerpo: "Tu primera marca de cada prueba será un récord. Aquí se quedan todos, de todas las familias.", salida: .accion("Empezar un entreno", .inicio))
        case .carrera: return Vacio(titulo: "Elige tu carrera", cuerpo: "Con una carrera objetivo te decimos el tiempo previsto, el hueco por tramo y cómo llegas de fresco.", salida: .accion("Elegir carrera", .carreras))
        case .recuperacion, .desconocido: return Vacio(titulo: "Sin reloj conectado", cuerpo: "La variabilidad, el pulso en reposo y el sueño los mide tu reloj cada noche.", salida: .accion("Conectar tu reloj", .dispositivos))
        }
    }

    private static func viejo(_ b: BloqueDelPanel, dias: Int) -> Vacio {
        switch b {
        case .estado: return Vacio(titulo: "Sin entrenar desde hace \(dias) días", cuerpo: "La fatiga ya cayó; la forma baja un poco cada día que pasa.", salida: .accion("Empezar un entreno", .inicio))
        case .forma: return Vacio(titulo: "Último entreno hace \(dias) días", cuerpo: "La curva sigue: la forma baja despacio y la frescura sube. Es lo que pasa al parar.", salida: .accion("Empezar un entreno", .inicio))
        case .semanas: return Vacio(titulo: "Ninguna sesión en \(dias) días", cuerpo: "Las últimas semanas están vacías. Si estás lesionado o de viaje, díselo a tu coach.", salida: .accion("Escribir a mi coach", .chat))
        case .intensidad: return Vacio(titulo: "Sin pulso desde hace \(dias) días", cuerpo: "Lo último que se repartió por zonas es de hace semanas.", salida: .accion("Empezar un entreno", .inicio))
        case .progreso: return Vacio(titulo: "Marcas de hace \(dias) días o más", cuerpo: "Las tendencias se quedan donde estaban hasta que vuelvas.", salida: .accion("Empezar un entreno", .inicio))
        case .records: return Vacio(titulo: "Sin marcas nuevas desde hace \(dias) días", cuerpo: "Tus récords siguen aquí; el siguiente llega con el siguiente entreno.", salida: .accion("Empezar un entreno", .inicio))
        case .carrera: return Vacio(titulo: "Previsión de hace \(dias) días", cuerpo: "La previsión usa tus últimas marcas; sin entrenos nuevos no se mueve.", salida: .accion("Empezar un entreno", .inicio))
        case .recuperacion, .desconocido: return Vacio(titulo: "Reloj sin sincronizar desde hace \(dias) días", cuerpo: "Sin noches nuevas no hay contra qué leer tu basal.", salida: .accion("Sincronizar el reloj", .dispositivos))
        }
    }

    /// LA SALIDA DE UNA FALTA en esta pantalla. Igual que `ProgresoDeCarrera.salidaDe`
    /// salvo en una cosa: aquí conectar el reloj SÍ tiene botón, porque la portada
    /// puede empujar «Dispositivos y apps» (la pantalla de carrera no podía).
    /// Puntuar el esfuerzo no abre nada: se dice, no se promete un botón mudo.
    static func salida(de f: Falta) -> SalidaHueco? {
        switch f {
        case .ancla: return .accion("Hacer el test de zonas", .testsDeZonas)
        case .sensor: return .accion("Conectar banda de pulso", .dispositivos)
        case .dispositivo: return .accion("Conectar tu reloj", .dispositivos)
        case .objetivo: return .accion("Elegir tu carrera objetivo", .carreras)
        case .esfuerzo: return .espera("Puntúa el esfuerzo al terminar cada entreno")
        case .historia, .ocasion, .intencion, .plan, .desconocida: return nil
        }
    }

    /// El texto del hueco de un bloque en un estado que no es «lleno».
    static func textoHueco(bloque: BloqueDelPanel, estado: EstadoBloque, lecturas: [LecturaAnalitica], hoy: String, metodo: MetodoDelPanel) -> TextoHueco {
        let faltas = lecturas.compactMap(\.cobertura.falta)
        switch estado {
        case .vacio:
            let v = vacio(bloque)
            // Si la falta tiene una salida concreta (reloj, banda, test), manda esa.
            let concreta = faltas.lazy.compactMap { salida(de: $0) }.first { if case .accion = $0 { return true } else { return false } }
            return TextoHueco(titulo: v.titulo, cuerpo: v.cuerpo, salida: concreta ?? v.salida, plazo: nil)
        case .viejo:
            let dias = ultimoDato(lecturas).flatMap { AnaliticasFechas.diasEntre($0, hoy) } ?? metodo.datoViejoDias ?? 0
            let v = viejo(bloque, dias: dias)
            return TextoHueco(titulo: v.titulo, cuerpo: v.cuerpo, salida: v.salida, plazo: nil)
        case .poco, .lleno:
            return poco(bloque, lecturas: lecturas, metodo: metodo)
        }
    }

    /// Texto del bloque con poco dato, según la falta más frecuente entre sus lecturas.
    private static func poco(_ bloque: BloqueDelPanel, lecturas: [LecturaAnalitica], metodo: MetodoDelPanel) -> TextoHueco {
        if let historia = faltaDeHistoria(lecturas) {
            // La recuperación cuenta NOCHES (el basal); el resto, semanas de historia.
            let enNoches = bloque == .recuperacion
            let hacen = enNoches ? historia.hacen : (metodo.semanasMinimasForma ?? Int(ceil(Double(historia.hacen) / 7)))
            let llevas = enNoches ? historia.llevas : historia.llevas / 7
            let cuerpo: String
            switch bloque {
            case .estado: cuerpo = "La palabra de hoy necesita semanas de carga detrás para no engañar."
            case .forma: cuerpo = "La forma es una media de \(metodo.ctlDays) días: hasta las \(hacen) semanas sube por pura aritmética, no por ti."
            case .semanas: cuerpo = "Con pocas semanas se ve lo hecho, pero todavía no una tendencia."
            case .intensidad: cuerpo = "El reparto por zonas se estabiliza con más sesiones."
            case .progreso: cuerpo = metodo.muestrasMinimas.map { "Cada familia necesita \($0) sesiones para decir si mejoras." } ?? "Cada familia necesita unas sesiones para decir si mejoras."
            case .records: cuerpo = "Los primeros récords llegan con las primeras marcas."
            case .carrera: cuerpo = "La previsión se afina con cada marca nueva."
            case .recuperacion, .desconocido: cuerpo = "La basal necesita \(metodo.hrvMinNightsBaseline ?? historia.hacen) noches. Hasta entonces el delta mediría la basal, no a ti."
            }
            return TextoHueco(
                titulo: "Todavía es pronto",
                cuerpo: cuerpo,
                salida: .espera(enNoches ? "Se llena solo con las noches" : "Se llena solo con las semanas"),
                plazo: PlazoHueco(llevas: min(llevas, hacen), hacen: hacen, unidad: enNoches ? "noches" : "semanas")
            )
        }
        let otra = lecturas.compactMap(\.cobertura.falta).first { if case .historia = $0 { return false } else { return true } }
        let muestras = lecturas.map(\.cobertura.muestras).max() ?? 0
        let cuerpo = metodo.muestrasMinimas.map { "Con \($0) ya se ve la tendencia." } ?? "Con unas sesiones más ya se ve la tendencia."
        return TextoHueco(
            titulo: "\(muestras) \(muestras == 1 ? "sesión" : "sesiones") de momento",
            cuerpo: cuerpo,
            salida: otra.flatMap(salida(de:)) ?? .espera("Se llena solo con las sesiones"),
            plazo: nil
        )
    }

    /// Un bloque que el servidor declara PENDIENTE: existe, y se dice por qué está
    /// vacío. No se inventa nada dentro.
    static let pendiente = TextoHueco(
        titulo: "Muy pronto",
        cuerpo: "Este apartado está en construcción. Aparecerá solo, sin actualizar la app.",
        salida: .espera("Se llena solo"),
        plazo: nil
    )
}
