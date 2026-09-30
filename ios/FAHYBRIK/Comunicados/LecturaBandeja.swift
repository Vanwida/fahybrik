import Foundation

// LO QUE DECIDE LA BANDEJA Y LO QUE DICE — fuera de la vista.
//
// La pantalla PINTA una lectura ya resuelta: qué estado toca (cargando, error, vacía, con cosas) y qué
// frase lleva cada fila o cada pie son decisiones, y una decisión que vive dentro de una vista no se
// puede probar sin dibujarla. Foundation puro.

// MARK: - Qué estado toca

/// Los cuatro estados de la bandeja (CONTRATO-UI §5): con cosas, cargando, vacía y error. Los dos
/// últimos NO se disfrazan de otro: un fallo sin nada guardado no es «no hay nada».
enum EstadoBandeja: Equatable {
    /// La primera carga en frío, sin nada que enseñar todavía.
    case cargando
    /// La carga falló y no hay copia guardada: se dice, con su reintento.
    case error
    /// Cargó y el coach no ha publicado nada: el caso del atleta recién dado de alta.
    case vacia
    /// Hay algo publicado (aunque se esté revalidando o la revalidación haya fallado: lo que hay se enseña).
    case conCosas(BandejaComunicados)
}

enum DecideBandeja {
    /// El orden de las reglas ES la decisión: lo que hay gana a todo; luego «cargó y no hay nada»;
    /// luego el fallo; y solo sin ninguna de las tres, la carga en frío.
    static func estado(_ bandeja: BandejaComunicados, cargada: Bool, fallo: Bool) -> EstadoBandeja {
        if !bandeja.estaVacia { return .conCosas(bandeja) }
        if cargada { return .vacia }
        if fallo { return .error }
        return .cargando
    }
}

// MARK: - La línea que se lee sin abrir

/// Lo que dice cada fila de la bandeja bajo su título. Sin ello, la lista sería una columna de títulos y
/// habría que abrir cada cosa para saber qué te pide.
enum DetalleDeFila {
    /// Respondida, la pregunta enseña lo que elegiste y su consecuencia: en octubre eso es justo lo que el
    /// atleta viene a buscar.
    static func pregunta(_ pregunta: Comunicado) -> String? {
        guard let elegida = pregunta.opcionElegida else { return pregunta.body }
        let consecuencia = elegida.consequence.map { " \($0)" } ?? ""
        return "Le dijiste: \(elegida.content).\(consecuencia)"
    }

    /// Cuándo vence y por qué importa. Sin el porqué una tarea es un recado.
    static func tarea(_ tarea: Comunicado) -> String? {
        guard tarea.state != .hecho else { return tarea.body }
        let porque = tarea.body?.trimmingCharacters(in: .whitespacesAndNewlines)
        return [tarea.venceTexto(), porque]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ". ")
    }

    /// Un protocolo a medias dice por dónde va: volver a la bandeja y no ver que llevas cuatro de siete
    /// obliga a abrirlo solo para saberlo.
    ///
    /// Cuenta SOLO las casillas: un protocolo de lectura no lleva ninguna, así que no tiene avance que
    /// enseñar y se queda con su propia línea.
    static func protocolo(_ p: Comunicado) -> String? {
        let casillas = p.pasosMarcables.count
        guard casillas > 0, p.state != .hecho, p.pasosHechos > 0 else { return p.body }
        return "Llevas \(p.pasosHechos) de \(casillas) pasos."
    }

    /// El contador de «Para hacer»: lo que RECLAMA, no lo que hay.
    static func pendientes(_ n: Int) -> String {
        if n == 0 { return "nada pendiente" }
        return n == 1 ? "1 pendiente" : "\(n) pendientes"
    }
}

// MARK: - Los pies de los detalles

/// Lo que dice el pie de cada detalle sobre el acto: quién lo va a ver y cuánto falta.
enum PieDeDetalle {
    static func tarea(_ c: Comunicado) -> String {
        c.state == .hecho
            ? "\(c.nombreCoach) ya la ve cerrada."
            : "\(c.nombreCoach) verá que la has hecho."
    }

    /// La CTA no se activa hasta que están todas las casillas: el pie dice cuántas faltan.
    static func protocolo(_ c: Comunicado) -> String {
        let coach = c.nombreCoach
        if c.state == .hecho { return "\(coach) ya lo ve cerrado." }
        if c.protocoloCompleto { return "\(coach) verá que lo has hecho." }
        let faltan = c.pasosMarcables.count - c.pasosHechos
        return faltan == 1
            ? "Te queda 1 paso por marcar."
            : "Te quedan \(faltan) pasos por marcar."
    }

    static func preguntaRespondida(_ c: Comunicado) -> String {
        "Respondido. \(c.nombreCoach) lo verá."
    }

    static func preguntaBloquea(_ c: Comunicado) -> String {
        "Mientras no lo digas, \(c.nombreCoach) deja esta parte del plan a la espera."
    }
}
