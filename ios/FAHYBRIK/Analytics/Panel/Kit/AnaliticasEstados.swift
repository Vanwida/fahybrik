import Foundation

// LOS CUATRO ESTADOS DE UN BLOQUE (A10) Y SUS HUECOS — espejo de
// `kit-analiticas/mecanismo.ts#estadoDeBloque` y de `huecos.ts`.
//
// EL ESTADO SE DERIVA solo de lo que el servidor ya dice en cada lectura: si
// hay número (`estado`), y por qué falta o cuánto (`cobertura.falta`: historia,
// esfuerzo, marcas, viejo…). Ni un umbral escrito aquí ni uno que el método del
// coach aún no sirve (HARD RULE Nº0): el corte de «dato viejo» lo decide el
// servidor al emitir la falta `viejo`, no el cliente contando días.
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
    case inicio, plan, carreras, dispositivos, chat, tests
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

    /// vacío: ninguna lectura tiene número y ninguna lleva historia empezada ·
    /// viejo: todos los números son el último que hubo, fuera de la ventana ·
    /// poco: alguna lectura espera tiempo (con algo ya andado), sesiones sin
    /// puntuar o marcas por medir · lleno: lo demás.
    static func estado(de lecturas: [LecturaAnalitica]) -> EstadoBloque {
        let conDato = lecturas.conDato
        if conDato.isEmpty {
            return lecturas.contains(where: estaIncompleta) ? .poco : .vacio
        }
        if conDato.allSatisfy(esViejo) { return .viejo }
        return lecturas.contains(where: estaIncompleta) ? .poco : .lleno
    }

    /// El número es el último que hubo: el servidor lo marca con la falta `viejo`.
    static func esViejo(_ l: LecturaAnalitica) -> Bool {
        if case .viejo? = l.cobertura.falta { return true }
        return false
    }

    /// Un número que el reloj no ha renovado hoy: el servidor lo sirve como medida
    /// con la falta `dispositivo` (el readiness de un día anterior).
    static func esDatoAtrasado(_ l: LecturaAnalitica) -> Bool {
        if l.estado == .medida, case .dispositivo? = l.cobertura.falta { return true }
        return false
    }

    /// Espera TIEMPO con algo ya andado: una falta de historia con `llevas > 0`,
    /// tanto en una lectura apagada como en una medida en arranque en frío.
    static func esperaHistoria(_ l: LecturaAnalitica) -> Bool {
        if case .historia(let llevas, _)? = l.cobertura.falta { return llevas > 0 }
        return false
    }

    /// Le faltan sesiones puntuadas, marcas o una pareja que el atleta (o su
    /// coach) puede aportar: el número, si lo hay, se apoya en menos de lo que debería.
    static func estaIncompleta(_ l: LecturaAnalitica) -> Bool {
        if esperaHistoria(l) { return true }
        switch l.cobertura.falta {
        case .esfuerzo?, .marcas?, .pareja?: return true
        default: return false
        }
    }

    /// Cuánto se espera y en qué se cuenta. El servidor emite `historia` con la
    /// unidad natural de cada bloque: días en carga, semanas en el progreso y
    /// noches en la recuperación (`docs/DECISIONS.md`, hueco del contrato).
    struct PlazoDeHistoria: Equatable {
        let llevas: Int
        let hacen: Int
        let unidad: UnidadDePlazo
    }
    enum UnidadDePlazo: String, Equatable { case semanas, noches }

    /// El plazo de una falta de historia, en la unidad de su bloque.
    static func plazo(_ bloque: BloqueDelPanel, llevas: Int, hacen: Int) -> PlazoDeHistoria {
        switch bloque {
        case .recuperacion: return PlazoDeHistoria(llevas: llevas, hacen: hacen, unidad: .noches)
        case .progreso: return PlazoDeHistoria(llevas: llevas, hacen: hacen, unidad: .semanas)
        default:
            let semana = AnaliticasFechas.diasPorSemana
            return PlazoDeHistoria(llevas: llevas / semana, hacen: (hacen + semana - 1) / semana, unidad: .semanas)
        }
    }

    /// La primera falta de historia del bloque, en semanas (o noches en la recuperación).
    static func plazoDeHistoria(_ bloque: BloqueDelPanel, _ lecturas: [LecturaAnalitica]) -> PlazoDeHistoria? {
        for l in lecturas {
            if case .historia(let llevas, let hacen)? = l.cobertura.falta { return plazo(bloque, llevas: llevas, hacen: hacen) }
        }
        return nil
    }

    /// LA NOTA DE UNA LECTURA a la que le falta algo: lo que se dice en lugar de
    /// su número (o bajo él). Nada cuando la falta es un silencio (`ocasion`,
    /// `intencion`) o una razón que este binario no conoce.
    static func notaDeFalta(_ f: Falta, bloque: BloqueDelPanel, hoy: String) -> String? {
        switch f {
        case .historia(let llevas, let hacen):
            let p = plazo(bloque, llevas: llevas, hacen: hacen)
            return "Llevas \(min(p.llevas, p.hacen)) de \(p.hacen) \(p.unidad.rawValue) para que salga"
        case .esfuerzo(let sesiones):
            return sesiones == 1 ? "Una sesión sin puntuar el esfuerzo" : "\(sesiones) sesiones sin puntuar el esfuerzo"
        case .marcas(let faltan):
            return faltan == 1 ? "Falta una marca para afinarlo" : "Faltan \(faltan) marcas para afinarlo"
        case .dispositivo: return "Lo mide tu reloj"
        case .sensor: return "Necesita el pulso medido"
        case .ancla: return "Necesita tu test de zonas"
        case .objetivo: return "Necesita una carrera objetivo"
        case .plan: return "Necesita entrenos en tu plan"
        case .pareja: return "Lo configura tu coach"
        case .viejo(let ultimo): return "Último dato del \(AnaliticasFormato.fechaLegible(ultimo, hoy: hoy))"
        case .ocasion, .intencion, .desconocida: return nil
        }
    }

    /// La primera falta de historia del bloque, tal como viaja.
    static func faltaDeHistoria(_ lecturas: [LecturaAnalitica]) -> (llevas: Int, hacen: Int)? {
        for l in lecturas {
            if case .historia(let llevas, let hacen)? = l.cobertura.falta { return (llevas, hacen) }
        }
        return nil
    }

    /// El día del dato más reciente entre los números que ya son «viejos».
    static func ultimoDato(_ lecturas: [LecturaAnalitica]) -> String? {
        lecturas.compactMap { l -> String? in
            if case .viejo(let ultimo)? = l.cobertura.falta { return ultimo }
            return nil
        }.max()
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
    /// Puntuar el esfuerzo no abre nada: se dice, no se promete un botón mudo. Lo
    /// que resuelve el coach (plan, pareja) o solo el tiempo (historia, viejo) no
    /// lleva salida.
    static func salida(de f: Falta) -> SalidaHueco? {
        switch f {
        case .ancla: return .accion("Hacer el test de zonas", .tests)
        case .sensor: return .accion("Conectar banda de pulso", .dispositivos)
        case .dispositivo: return .accion("Conectar tu reloj", .dispositivos)
        case .objetivo: return .accion("Elegir tu carrera objetivo", .carreras)
        case .marcas: return .accion("Medir tus marcas", .tests)
        case .esfuerzo: return .espera("Puntúa el esfuerzo al terminar cada entreno")
        case .historia, .ocasion, .intencion, .plan, .viejo, .pareja, .desconocida: return nil
        }
    }

    private static func esAccion(_ s: SalidaHueco) -> Bool {
        if case .accion = s { return true }
        return false
    }

    /// El texto del hueco de un bloque en un estado que no es «lleno».
    static func textoHueco(bloque: BloqueDelPanel, estado: EstadoBloque, lecturas: [LecturaAnalitica], hoy: String, metodo: MetodoDelPanel) -> TextoHueco {
        let faltas = lecturas.compactMap(\.cobertura.falta)
        switch estado {
        case .vacio:
            let v = vacio(bloque)
            // Si la falta tiene una salida concreta (reloj, banda, test), manda esa.
            let concreta = faltas.lazy.compactMap { salida(de: $0) }.first(where: esAccion)
            return TextoHueco(titulo: v.titulo, cuerpo: v.cuerpo, salida: concreta ?? v.salida, plazo: nil)
        case .viejo:
            let dias = ultimoDato(lecturas).flatMap { AnaliticasFechas.diasEntre($0, hoy) } ?? 0
            let v = viejo(bloque, dias: dias)
            return TextoHueco(titulo: v.titulo, cuerpo: v.cuerpo, salida: v.salida, plazo: nil)
        case .poco, .lleno:
            return poco(bloque, lecturas: lecturas, metodo: metodo)
        }
    }

    /// Texto del bloque con poco dato: espera tiempo, faltan marcas, o sesiones sin puntuar.
    private static func poco(_ bloque: BloqueDelPanel, lecturas: [LecturaAnalitica], metodo: MetodoDelPanel) -> TextoHueco {
        if lecturas.contains(where: { if case .pareja? = $0.cobertura.falta { return true } else { return false } }) {
            return sinPareja
        }
        if let plazo = plazoDeHistoria(bloque, lecturas) {
            let hacen = plazo.hacen
            let cuerpo: String
            switch bloque {
            case .estado: cuerpo = "La palabra de hoy necesita semanas de carga detrás para no engañar."
            case .forma: cuerpo = "La forma es una media de \(metodo.ctlDays) días: hasta las \(hacen) semanas sube por pura aritmética, no por ti."
            case .semanas: cuerpo = "Con pocas semanas se ve lo hecho, pero todavía no una tendencia."
            case .intensidad: cuerpo = "El reparto por zonas se estabiliza con más sesiones."
            case .progreso: cuerpo = "Cada familia necesita unas semanas de entrenos para decir si mejoras."
            case .records: cuerpo = "Los primeros récords llegan con las primeras marcas."
            case .carrera: cuerpo = "La previsión se afina con cada marca nueva."
            case .recuperacion, .desconocido: cuerpo = "La basal necesita \(metodo.hrvMinNightsBaseline ?? hacen) noches. Hasta entonces el cambio mediría la basal, no a ti."
            }
            let enNoches = plazo.unidad == .noches
            return TextoHueco(
                titulo: "Todavía es pronto",
                cuerpo: cuerpo,
                salida: .espera(enNoches ? "Se llena solo con las noches" : "Se llena solo con las semanas"),
                plazo: PlazoHueco(llevas: min(plazo.llevas, hacen), hacen: hacen, unidad: plazo.unidad.rawValue)
            )
        }
        let marcas = lecturas.compactMap { l -> Int? in
            if case .marcas(let faltan)? = l.cobertura.falta { return faltan }
            return nil
        }
        if let faltan = marcas.max() {
            let tramos = lecturas.filter { l in
                if case .marcas? = l.cobertura.falta { return l.id.hasPrefix(IdsDelPanel.prefijoTramo) }
                return false
            }.map(\.tituloEs)
            let lista = tramos.prefix(3).joined(separator: ", ") + (tramos.count > 3 ? " y \(tramos.count - 3) más" : "")
            let sin = lista.isEmpty ? "" : "Sin marca de \(lista). "
            return TextoHueco(
                titulo: faltan == 1 ? "Falta la marca de un tramo" : "Faltan marcas de \(faltan) tramos",
                cuerpo: sin + "La previsión de cada tramo sale de tu mejor marca, de una carrera o de tu umbral. Con lo que tienes se afina con un poco más.",
                salida: salida(de: .marcas(faltan: faltan)) ?? .espera("Se afina con cada marca nueva"),
                plazo: nil
            )
        }
        let muestras = lecturas.map(\.cobertura.muestras).max() ?? 0
        let otra = lecturas.compactMap(\.cobertura.falta).first { if case .historia = $0 { return false } else { return true } }
        return TextoHueco(
            titulo: "\(muestras) \(muestras == 1 ? "sesión" : "sesiones") de momento",
            cuerpo: "Con unas sesiones más ya se ve la tendencia.",
            salida: otra.flatMap(salida(de:)) ?? .espera("Se llena solo con las sesiones"),
            plazo: nil
        )
    }

    /// La carrera es de dobles y no hay pareja: lo configura el coach, sin botón.
    static let sinPareja = TextoHueco(
        titulo: "Falta tu pareja",
        cuerpo: "Tu carrera es de dobles y todavía no tienes pareja asignada. Tu coach la configura.",
        salida: .espera("Lo configura tu coach"),
        plazo: nil
    )

    /// Un bloque que el servidor declara PENDIENTE: existe, y se dice por qué está
    /// vacío. No se inventa nada dentro.
    static let pendiente = TextoHueco(
        titulo: "Muy pronto",
        cuerpo: "Este apartado está en construcción. Aparecerá solo, sin actualizar la app.",
        salida: .espera("Se llena solo"),
        plazo: nil
    )
}
