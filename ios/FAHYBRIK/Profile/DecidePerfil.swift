import Foundation

// LO QUE PERFIL DECIDE, PURO Y CON TEST (`FAHYBRIKTests/Profile/DecidePerfilTests`).
//
// La pantalla PINTA lo que sale de aquí y no calcula nada. Está separado porque es donde viven las
// decisiones que importan (qué reclama al atleta, qué puerta se queda a la vista, cuándo el sujeto
// es una invitación y cuándo un perfil), y así se prueban una a una en vez de a través de una
// captura. Espejo de `web/components/design-twin/kit-perfil/decision.ts`; las cinco filas de
// Rendimiento son de `RendimientoEstados` (RendimientoPerfil.swift).

// MARK: - El texto compuesto

enum TextosPerfil {
    /// El separador de las líneas compuestas («división Open · 34 años · 172 cm»). El espacio ANTES
    /// del punto medio es de no separación: así un salto de línea nunca deja un «·» colgando al
    /// principio de la línea siguiente.
    static let sep = "\u{00A0}· "

    static func unir(_ partes: [String]) -> String { partes.joined(separator: sep) }
    static func unir(_ partes: String...) -> String { unir(partes) }

    /// «Apple Salud, Apple Watch y COROS».
    static func listaConY(_ nombres: [String]) -> String {
        guard nombres.count > 1, let ultimo = nombres.last else { return nombres.joined() }
        return "\(nombres.dropLast().joined(separator: ", ")) y \(ultimo)"
    }
}

// MARK: - Lo que dice «Pendiente»

extension TextosPerfil {
    /// La pregunta de COROS, tal como la hacía el diálogo del sistema.
    static let preguntaCoros = "¿Esto es el entreno?"

    /// Con la hora de la actividad cuando el proveedor la trae: «…en COROS, de las 7:12».
    static func detalleCoros(inicio: String?) -> String {
        "Hay un entreno previsto hoy y una actividad nueva en COROS\(inicio.map { ", de las \($0)" } ?? ""). "
            + "Si dices que no, la actividad queda en el historial y el plan no se toca."
    }

    /// El aviso que confirma lo que acaba de contestar. «Ahora no» dice la verdad: no se borra, se vuelve
    /// a preguntar (el servidor conserva la pregunta).
    static func avisoDeRespuesta(_ respuesta: RespuestaCoros) -> String {
        switch respuesta {
        case .si: return "Hecho: esa actividad es tu entreno de hoy."
        case .no: return "La actividad queda en el historial. El plan no se toca."
        case .ahoraNo: return "Vale. Te lo volvemos a preguntar la próxima vez que abras Perfil."
        }
    }

    /// Si no se pudo guardar la respuesta, la fila se queda para poder repetirla.
    static let fallaLaRespuestaDeCoros = "No pudimos guardar tu respuesta. Inténtalo de nuevo."

    /// Título y detalle de una fila de «Pendiente».
    static func pendiente(_ p: PendientePerfil) -> (titulo: String, detalle: String) {
        switch p {
        case let .coros(inicio):
            return (preguntaCoros, detalleCoros(inicio: inicio))
        case let .suscripcion(motivo):
            return (motivo == .pagoPendiente ? "Tu pago está pendiente" : "Tu suscripción está cancelada", "Míralo en tu suscripción")
        case let .pareja(motivo, email):
            let quien = email ?? "tu compañero/a"
            switch motivo {
            case .sinPareja: return ("Aún no has añadido a tu compañero/a", "Invítale por email para entrenar juntos en Dobles")
            case .caducada: return ("La invitación a \(quien) caducó", "Puedes volver a invitarle")
            case .rechazada: return ("\(quien) rechazó la invitación", "Puedes invitar a otra persona")
            }
        }
    }
}

// MARK: - Las puertas y lo que reclama

enum ClavePuerta: CaseIterable, Hashable {
    case identidad, entreno, dispositivos, cuenta, privacidad, ayuda
}

/// El color va en la marca, nunca en el texto. `invita` = el atleta puede hacer algo; `neutro` = una
/// decisión suya.
enum TonoMarca: Equatable {
    case neutro, ok, invita, aviso, peligro

    fileprivate var gravedad: Int {
        switch self {
        case .neutro: return 0
        case .ok: return 1
        case .invita: return 2
        case .aviso: return 3
        case .peligro: return 4
        }
    }

    fileprivate func peorCon(_ otro: TonoMarca) -> TonoMarca { otro.gravedad > gravedad ? otro : self }
}

struct EstadoPuerta: Equatable {
    var texto: String
    var tono: TonoMarca
}

struct PuertaPerfil: Equatable, Identifiable {
    let clave: ClavePuerta
    let titulo: String
    /// El nombre en minúsculas, para decir qué hay tras el pliegue («cuenta, privacidad y ayuda»).
    let corto: String
    /// El subtítulo REAL de la puerta; solo se enseña cuando no tiene un estado mejor que decir.
    let descripcion: String
    let estado: EstadoPuerta?

    var id: ClavePuerta { clave }

    /// El estado pide al atleta (aviso o peligro): la puerta no se pliega.
    var atencion: Bool {
        guard let tono = estado?.tono else { return false }
        return tono == .aviso || tono == .peligro
    }
}

/// Lo que espera una respuesta del atleta. Solo entran ACTOS: una suscripción que termina o una
/// invitación enviada no reclaman nada, son un estado y viven en su puerta.
enum PendientePerfil: Equatable, Identifiable {
    /// Una actividad nueva de COROS que puede ser el entreno previsto de hoy.
    case coros(inicio: String?)
    /// La suscripción necesita al atleta.
    case suscripcion(Motivo)
    /// Dobles sin compañero/a y sin invitación viva: invitar es un acto.
    case pareja(MotivoPareja, email: String?)

    enum Motivo: Equatable { case pagoPendiente, cancelada }
    enum MotivoPareja: Equatable { case sinPareja, caducada, rechazada }

    var id: String {
        switch self {
        case .coros: return "coros"
        case .suscripcion: return "suscripcion"
        case .pareja: return "pareja"
        }
    }
}

// MARK: - La sincronización de COROS (qué se hace con lo que contesta el servidor)

/// El aviso pasajero de una sincronización: una buena noticia (se va sola) o un fallo (se queda
/// hasta descartarlo). El TEXTO lo escribe `WearablesService`; aquí solo se decide el temperamento.
struct AvisoCoros: Equatable {
    enum Tono: Equatable { case ok, fallo }
    var tono: Tono
    var texto: String
}

/// Qué hay que enseñar tras hablar con COROS: nada, la pregunta «¿esto es el entreno?» o un aviso.
/// Una cosa o la otra, nunca las dos: con una pregunta pendiente no se avisa (Swift ya lo hacía).
enum ResultadoCoros: Equatable {
    case nada
    case pregunta(WearablePendingLink)
    case aviso(AvisoCoros)
}

// MARK: - Las decisiones

enum DecidePerfil {

    // MARK: Identidad

    /// Iniciales del avatar. VACÍAS sin nombre: un círculo con un guion no es un dato (§7).
    static func iniciales(_ nombre: String) -> String {
        nombre
            .split(whereSeparator: \.isWhitespace)
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    /// El subtítulo, hecho SOLO con los campos que hay: división (de su carrera), edad, años
    /// entrenando, altura y peso. No existe un «nivel» del atleta y no se inventa. Nil = no hay ni
    /// una métrica: el subtítulo se calla y en su sitio va la invitación a completarlo.
    ///
    /// «6 años entrenando» y «172 cm · 64,5 kg»: antes «6y entrenando» y «172cm / 64kg» (inglés a
    /// medias y sin espacio, contra CONTRATO-UI §2 y §3).
    static func subtituloIdentidad(_ id: IdentidadPerfil) -> String? {
        var partes: [String] = []
        if let division = id.division { partes.append("división \(division)") }
        if let edad = id.edad { partes.append("\(edad) años") }
        if let anos = id.anosEntrenando, anos > 0 {
            partes.append(anos == 1 ? "1 año entrenando" : "\(anos) años entrenando")
        }
        var cuerpo: [String] = []
        // La unidad va pegada a su cifra con un espacio de no separación: «170 / cm» en dos líneas no se lee.
        if let alto = id.alturaCm { cuerpo.append("\(Int(alto.rounded()))\u{00A0}cm") }
        if let peso = id.pesoKg { cuerpo.append("\(Formato.esDecimal(peso))\u{00A0}kg") }
        if !cuerpo.isEmpty { partes.append(TextosPerfil.unir(cuerpo)) }
        return partes.isEmpty ? nil : TextosPerfil.unir(partes)
    }

    /// El momento del sujeto. `porCompletar` es la invitación honesta: sin nombre, o sin ni una
    /// métrica que contar. Una foto que falta NO lo activa (nunca se obliga a poner la cara): la
    /// chapita de cámara del avatar es su única insistencia.
    enum ModoIdentidad: Equatable {
        case cargando, error, completo, porCompletar
    }

    static func modoIdentidad(_ l: LecturaPerfil) -> ModoIdentidad {
        if l.cargando { return .cargando }
        if l.errorCarga { return .error }
        if l.identidad.nombre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || subtituloIdentidad(l.identidad) == nil {
            return .porCompletar
        }
        return .completo
    }

    /// El título del sujeto: el nombre, o la pregunta cuando aún no lo hay.
    static func tituloIdentidad(_ id: IdentidadPerfil) -> String {
        let nombre = id.nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        return nombre.isEmpty ? "¿Cómo te llamas?" : nombre
    }

    /// La frase que acompaña al sujeto cuando NO hay subtítulo, y qué le cuesta al atleta cambiarlo.
    /// Solo promete lo que la app hace de verdad: con fecha de nacimiento el servidor saca una
    /// primera estimación de zonas de pulso (`from_age`; MyZonesView lo dice), y solo con coach hay
    /// zonas que enseñar.
    static func apoyoDeIdentidad(_ l: LecturaPerfil) -> String? {
        let id = l.identidad
        if id.nombre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Ponle nombre a tu perfil para empezar." }
        if subtituloIdentidad(id) != nil { return nil }
        if l.conCoach, id.edad == nil, id.fcMax == nil {
            return "Con tu fecha de nacimiento calculamos tus primeras zonas de pulso."
        }
        return "Cuéntanos tu edad, tu altura y tu peso."
    }

    /// La única acción del sujeto, la que más falta.
    static func accionIdentidad(_ l: LecturaPerfil) -> String {
        let modo = modoIdentidad(l)
        if modo == .error { return "Reintentar" }
        if l.identidad.nombre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Poner mi nombre" }
        return modo == .porCompletar ? "Completar mi perfil" : "Editar perfil"
    }

    // MARK: «Pendiente»

    /// Lo que espera una respuesta suya, en el orden en que CADUCA: la pregunta de COROS (ligada a
    /// la sesión de hoy) primero, el pago después, la pareja al final.
    ///
    /// Solo entran ACTOS. En frío o con la identidad caída no se sabe qué reclama: no se pinta nada
    /// (aparece cuando llega).
    static func pendientes(_ l: LecturaPerfil) -> [PendientePerfil] {
        if l.cargando || l.errorCarga { return [] }
        var fuera: [PendientePerfil] = []
        if let pregunta = l.corosPendiente { fuera.append(.coros(inicio: pregunta.inicio)) }
        if l.conCoach, let suscripcion = l.suscripcion {
            switch suscripcion {
            case .pagoPendiente: fuera.append(.suscripcion(.pagoPendiente))
            case .cancelada: fuera.append(.suscripcion(.cancelada))
            case .activa, .termina, .prueba, .pausada: break
            }
        }
        switch l.dobles {
        case .sinPareja?:
            fuera.append(.pareja(.sinPareja, email: nil))
        case let .invitacion(estado, email, _)?:
            switch estado {
            case .caducada: fuera.append(.pareja(.caducada, email: email))
            case .rechazada: fuera.append(.pareja(.rechazada, email: email))
            case .pendiente: break   // esperar no es un acto
            }
        case .conPareja?, nil:
            break
        }
        return fuera
    }

    // MARK: Las puertas

    private static func textoSuscripcion(_ s: SuscripcionPerfil) -> EstadoPuerta {
        switch s {
        case .activa:
            return EstadoPuerta(texto: "Suscripción activa", tono: .ok)
        case let .termina(el):
            return EstadoPuerta(texto: "Suscripción: termina el \(el)", tono: .aviso)
        case let .prueba(hasta):
            return EstadoPuerta(texto: hasta.map { TextosPerfil.unir("En prueba", "hasta \($0)") } ?? "En prueba", tono: .ok)
        case .pagoPendiente:
            return EstadoPuerta(texto: "Pago pendiente", tono: .peligro)
        case .cancelada:
            return EstadoPuerta(texto: "Suscripción cancelada", tono: .peligro)
        case .pausada:
            return EstadoPuerta(texto: "Suscripción pausada", tono: .neutro)
        }
    }

    private static func estadoIdentidad(_ l: LecturaPerfil) -> EstadoPuerta? {
        var partes: [String] = []
        var tono = TonoMarca.neutro
        switch l.dobles {
        case let .conPareja(nombre)?:
            partes.append(TextosPerfil.unir("Dobles", "con \(nombre)"))
        case .sinPareja?:
            partes.append(TextosPerfil.unir("Dobles", "sin compañero/a"))
            tono = tono.peorCon(.invita)
        case let .invitacion(estado, _, caduca)?:
            switch estado {
            case .pendiente:
                partes.append(TextosPerfil.unir("Dobles", caduca.map { "invitación enviada, caduca \($0)" } ?? "invitación enviada"))
            case .caducada:
                partes.append(TextosPerfil.unir("Dobles", "la invitación caducó"))
                tono = tono.peorCon(.aviso)
            case .rechazada:
                partes.append(TextosPerfil.unir("Dobles", "invitación rechazada"))
                tono = tono.peorCon(.aviso)
            }
        case nil:
            break
        }
        if l.conCoach, let suscripcion = l.suscripcion {
            let s = textoSuscripcion(suscripcion)
            // Una suscripción al día no es noticia: solo se dice si no hay nada más que contar.
            if s.tono != .ok || partes.isEmpty {
                partes.append(s.texto)
                tono = tono.peorCon(s.tono)
            }
        }
        return partes.isEmpty ? nil : EstadoPuerta(texto: TextosPerfil.unir(partes), tono: tono)
    }

    /// Las seis puertas, en el orden de siempre (Identidad, Entreno, Dispositivos, Cuenta, Privacidad,
    /// Ayuda y legal).
    static func puertas(_ l: LecturaPerfil) -> [PuertaPerfil] {
        // En frío o con la identidad caída no se sabe el estado de nada: se dice lo que hay dentro.
        let sabe = !l.cargando && !l.errorCarga

        let descripcionIdentidad: String
        if let objetivo = l.identidad.objetivo {
            descripcionIdentidad = TextosPerfil.unir("Modalidad, objetivo", objetivo.label)
        } else {
            descripcionIdentidad = l.conCoach ? "Modalidad, suscripción, objetivo e idioma" : "Modalidad, objetivo e idioma"
        }

        let estadoDispositivos: EstadoPuerta?
        if !sabe {
            estadoDispositivos = nil
        } else if l.dispositivos.isEmpty {
            estadoDispositivos = EstadoPuerta(texto: "Ningún dispositivo conectado", tono: .invita)
        } else {
            let nombres = TextosPerfil.listaConY(l.dispositivos.map(\.nombre))
            estadoDispositivos = EstadoPuerta(
                texto: "\(nombres) \(l.dispositivos.count == 1 ? "conectado" : "conectados")",
                tono: .ok
            )
        }

        // Permitir o retirar es una decisión suya, no un fallo: ni verde ni rojo.
        let estadoPrivacidad: EstadoPuerta? = sabe && l.movimientoReloj != .sinPreguntar
            ? EstadoPuerta(
                texto: "Movimiento del reloj: \(l.movimientoReloj == .permitido ? "permitido" : "retirado")",
                tono: .neutro
            )
            : nil

        return [
            PuertaPerfil(
                clave: .identidad, titulo: "Identidad", corto: "identidad",
                descripcion: descripcionIdentidad, estado: sabe ? estadoIdentidad(l) : nil
            ),
            PuertaPerfil(
                clave: .entreno, titulo: "Entreno", corto: "entreno",
                descripcion: "Días, molestias, avisos de voz y pruebas del reloj", estado: nil
            ),
            PuertaPerfil(
                clave: .dispositivos, titulo: "Dispositivos y apps", corto: "dispositivos",
                descripcion: "Apple Health, reloj, Garmin, Polar, COROS y más", estado: estadoDispositivos
            ),
            PuertaPerfil(
                clave: .cuenta, titulo: "Cuenta", corto: "cuenta",
                descripcion: l.conCoach ? "Apariencia, metodología y eliminar tu cuenta" : "Apariencia y eliminar tu cuenta",
                estado: nil
            ),
            PuertaPerfil(
                clave: .privacidad, titulo: "Privacidad", corto: "privacidad",
                descripcion: "Movimiento del reloj, tus datos y la política de privacidad", estado: estadoPrivacidad
            ),
            PuertaPerfil(
                clave: .ayuda, titulo: "Ayuda y legal", corto: "ayuda",
                descripcion: "Sugerencias y términos", estado: nil
            ),
        ]
    }

    /// Se queda a la vista lo que se usa (Identidad, Entreno, Dispositivos) y TODA puerta que dice
    /// algo del atleta: un dispositivo conectado o no, una decisión tomada sobre su privacidad, una
    /// suscripción que termina. Se pliega lo que no tiene nada que decir (Cuenta, Ayuda y legal, y
    /// Privacidad mientras no se le haya preguntado nada). Una puerta que pide al atleta NUNCA se
    /// pliega: es un caso de la misma regla. El orden interno es el de siempre.
    private static let siempreALaVista: Set<ClavePuerta> = [.identidad, .entreno, .dispositivos]

    static func agruparPuertas(_ puertas: [PuertaPerfil]) -> (visibles: [PuertaPerfil], plegadas: [PuertaPerfil]) {
        func visible(_ p: PuertaPerfil) -> Bool { siempreALaVista.contains(p.clave) || p.estado != nil }
        return (puertas.filter(visible), puertas.filter { !visible($0) })
    }

    // MARK: La sincronización de COROS

    /// La pregunta que sigue esperando cuando COROS NO está conectado: el servidor la conserva hasta
    /// que se contesta.
    static func preguntaPendiente(_ respuesta: WearablesResponse) -> WearablePendingLink? {
        respuesta.pendingLinks.first { $0.provider == WearablesService.coros }
    }

    /// Qué hay que enseñar tras una sincronización correcta: la pregunta si la hay (y entonces nada
    /// más), o un aviso si trajo algo que contar. `imported`, `skipReason` o `errored` son lo que
    /// hoy hace saltar la alerta; el temperamento es de la propia noticia: importar entrenos es una
    /// buena noticia (se va sola) y todo lo demás (COROS sin conectar, un fallo, un error suelto) es
    /// algo que hay que leer y se queda.
    static func resultado(sincronizacion respuesta: WearablesResponse) -> ResultadoCoros {
        if let pregunta = preguntaPendiente(respuesta) { return .pregunta(pregunta) }
        let importados = respuesta.imported ?? 0
        let saltada = respuesta.skipReason?.isEmpty == false
        guard importados > 0 || respuesta.skipReason != nil || (respuesta.errored ?? 0) > 0 else { return .nada }
        return .aviso(AvisoCoros(
            tono: (!saltada && importados > 0) ? .ok : .fallo,
            texto: WearablesService.corosSyncResultMessage(respuesta)
        ))
    }

    /// Un fallo de red o del servidor al sincronizar.
    static func aviso(falloDeSincronizacion error: Error) -> AvisoCoros {
        AvisoCoros(tono: .fallo, texto: WearablesService.corosSyncErrorMessage(error))
    }
}
