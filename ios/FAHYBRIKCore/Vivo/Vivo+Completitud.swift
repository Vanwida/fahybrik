import Foundation

// LO QUE SE DECIDE AL TERMINAR — puro (P9, P13). Espejo de `kit-reloj/despues.ts`.
//
//   completitud   completa / parcial (con su motivo) / libre, decidida por lo HECHO, nunca cableada:
//                 hasta hoy el reloj guardaba `.partial` en cuanto el atleta terminaba (P0-2) y el móvil
//                 `.full` en cuanto acababa el plan. Un solo cálculo, el de este fichero, para los dos.
//
// Una PIEZA es lo que se juzga: una serie (su parcial) o un paso continuo (una tirada, un tempo). Las dos
// se cortan igual: cerradas a mano por debajo del umbral del coach.
//
// Lo que es MÉTODO (desde qué fracción una pieza cortada cuenta como hecha, cuánto tiempo quieto antes de
// guardar solo un enfriamiento libre) es del coach: dato con defecto (`Vivo.MetodoResumen`), que llega con
// el detalle (`WristMethod.finish`).
//
// NO se porta aquí `costeTrasEstacion` (el coste de la carrera comprometida): es del resumen de circuito y
// HYROX, que no es de este lote.

extension Vivo {

    // MARK: - El método del coach

    struct MetodoResumen: Equatable {
        /// Fracción de lo prescrito (0…1) a partir de la cual una pieza cortada a mano cuenta como hecha:
        /// una serie (900 de 1000 m) o un paso continuo (72′ de una tirada de 80′).
        var umbralHecho: Double
        /// Tras «Seguir» (enfriamiento libre), segundos sin moverse antes de guardar la sesión sola.
        var guardarQuietoS: Double
    }

    /// El defecto del producto: los mismos números que sirve el servidor cuando el coach no toca nada.
    static let metodoResumenDefecto = MetodoResumen(umbralHecho: 0.9, guardarQuietoS: 600)

    /// El método efectivo de un plan: lo que trae, o el defecto.
    static func metodoResumen(de metodo: WristMethod?) -> MetodoResumen {
        guard let f = metodo?.finish else { return metodoResumenDefecto }
        return MetodoResumen(umbralHecho: f.shortRepDoneFraction, guardarQuietoS: f.idleSaveS)
    }

    // MARK: - Lo hecho

    /// Lo hecho de una sesión, lo justo para decidir si está completa.
    struct HechoSesion: Equatable {
        /// Final natural (el motor cerró el último paso) o el atleta terminó antes.
        enum Final: Equatable { case natural, atleta }

        var pasos: [Paso]
        /// El último paso al que llegó.
        var i: Int
        var final: Final
        /// Un parcial por paso cerrado: decide si una serie o un paso continuo cerrado a mano llegó a lo prescrito.
        var parciales: [Parcial]
    }

    struct Completitud: Equatable {
        enum Estado: String, Equatable { case completa, parcial, libre }

        var estado: Estado
        /// «6 de 6 series», «5 de 5 rondas», «24′ de 80′»: la cuenta del bloque que manda.
        var cuenta: String?
        /// Por qué es parcial: «Terminaste en la serie 5 de 6», «La serie 3 se cortó en 620 m».
        var motivo: String?
    }

    // MARK: - Piezas de la cuenta

    private static let articuloDePosicion: [String: String] = [
        "serie": "la", "tramo": "el", "stride": "el", "cuesta": "la", "ronda": "la", "estación": "la",
    ]

    private static func nombrePosicion(_ p: Paso) -> (nombre: String, n: Int, de: Int)? {
        if let r = p.posicion?.ronda { return ("ronda", r.n, r.de) }
        guard let c = p.posicion?.serie ?? p.posicion?.tramo else { return nil }
        let nombre = p.posicion?.tramo != nil ? "tramo" : (p.clase == .fuerza || p.clase == .estacion ? "serie" : nombreClase(p.clase).lowercased())
        return (nombre, c.n, c.de)
    }

    private static func conArticulo(_ nombre: String) -> String { "\(articuloDePosicion[nombre] ?? "el") \(nombre)" }

    private static func mayuscula(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    private enum EstadoPieza { case hecho, cortado, sinLlegar }

    /// Lo hecho de una pieza en la unidad de su medida: segundos y metros.
    private struct Pieza {
        var segundos: Double
        var metros: Double?
    }

    private struct EstadoDePaso {
        var estado: EstadoPieza
        var pieza: Pieza?
        /// La pieza es una serie o un tramo (tiene su cuenta), no un paso continuo.
        var esSerie: Bool
        var p: Paso
    }

    private static func hechoDePieza(_ p: Paso, _ x: Pieza) -> Double? {
        switch p.medida.tipo {
        case .distancia: return x.metros
        case .tiempo: return x.segundos
        default: return nil
        }
    }

    /// ¿Es un paso continuo? Sin serie ni tramo ni ronda que lo cuente: una tirada, un tempo, un rodaje.
    private static func esContinuo(_ p: Paso) -> Bool {
        p.posicion?.serie == nil && p.posicion?.tramo == nil && p.posicion?.ronda == nil
    }

    private static func estadoDePaso(_ r: HechoSesion, _ j: Int, _ metodo: MetodoResumen) -> EstadoDePaso {
        let p = r.pasos[j]
        if j > r.i || (j == r.i && r.final == .atleta) { return EstadoDePaso(estado: .sinLlegar, pieza: nil, esSerie: false, p: p) }
        let esSerie = p.posicion?.serie != nil || p.posicion?.tramo != nil
        // Una serie deja su vuelta y un paso continuo su parcial; lo demás (una ronda de circuito) no se corta aquí.
        let parcial = (esSerie || esContinuo(p)) ? r.parciales.first { $0.i == j } : nil
        let pieza = parcial.map { Pieza(segundos: $0.segundos, metros: $0.metros) }
        if let pieza, let pr = p.medida.prescrito, pr > 0, let hecho = hechoDePieza(p, pieza), hecho < pr * metodo.umbralHecho {
            return EstadoDePaso(estado: .cortado, pieza: pieza, esSerie: esSerie, p: p)
        }
        return EstadoDePaso(estado: .hecho, pieza: pieza, esSerie: esSerie, p: p)
    }

    /// «24′», «23″»: lo hecho de un paso por tiempo, al minuto por encima de dos (así se habla de una tirada).
    private static func fmtTiempoHecho(_ s: Double) -> String {
        s >= 120 ? fmtDuracion((s / 60).rounded() * 60) : fmtDuracion(s.rounded())
    }

    /// Lo hecho de una pieza, dicho en la unidad de lo prescrito: «24′», «1200 m» (de 3950 m), «8,23 km» (de 12 km).
    private static func fmtHecho(_ p: Paso, _ x: Pieza) -> String {
        if p.medida.tipo == .distancia, let m = x.metros {
            if fmtPrescrito(p.medida).hasSuffix("km") { return "\(String(format: "%.2f", m / 1000).replacingOccurrences(of: ".", with: ",")) km" }
            return "\(Int(m.rounded())) m"
        }
        return fmtTiempoHecho(x.segundos)
    }

    /// «La tirada», «El tempo»: el paso continuo con su artículo (el género va con el nombre de la clase).
    private static func pasoConArticulo(_ p: Paso) -> String {
        "\(femeninoDefecto.contains(p.clase) ? "La" : "El") \(nombreClase(p.clase).lowercased())"
    }

    // MARK: - La completitud

    /// ¿Completa? Toda pieza de trabajo de la parte principal hecha (una serie cortada a mano cuenta si llega al
    /// umbral del coach). Sin nada prescrito que cumplir (correr libre), no es ni completa ni parcial: es libre.
    static func completitud(_ r: HechoSesion, metodo: MetodoResumen = metodoResumenDefecto) -> Completitud {
        let principales = r.pasos.enumerated().filter { $0.element.rol == .trabajo && $0.element.fase == .principal && $0.element.medida.tipo != .abierta }
        if principales.isEmpty { return Completitud(estado: .libre, cuenta: nil, motivo: nil) }

        let estados = principales.map { estadoDePaso(r, $0.offset, metodo) }
        let primero = estados.first { $0.estado != .hecho }

        // La cuenta: por rondas si el circuito las tiene; si no, las series del bloque donde se rompió
        // (o del primero con series, si todo va bien).
        var cuenta: String?
        let conRonda = estados.filter { $0.p.posicion?.ronda != nil }
        if !conRonda.isEmpty {
            var rondas: [Int: Bool] = [:]
            for e in conRonda {
                let n = e.p.posicion!.ronda!.n
                rondas[n] = (rondas[n] ?? true) && e.estado == .hecho
            }
            cuenta = "\(rondas.values.filter { $0 }.count) de \(rondas.count) rondas"
        } else {
            // Una sesión de fuerza cuenta todas sus series; una de correr, las del bloque donde se rompió
            // (o el primero con series): «4 de 6 series».
            let fuerza = estados.allSatisfy { $0.p.clase == .fuerza || $0.p.clase == .estacion }
            let bloque = (primero ?? estados.first { nombrePosicion($0.p) != nil })?.p.bloque
            let del = estados.filter { nombrePosicion($0.p) != nil && (fuerza || $0.p.bloque == bloque) }
            if !del.isEmpty { cuenta = "\(del.filter { $0.estado == .hecho }.count) de \(del.count) series" }
        }

        guard let primero else { return Completitud(estado: .completa, cuenta: cuenta, motivo: nil) }

        let pos = nombrePosicion(primero.p)
        let quien = pos.map { "\(conArticulo($0.nombre)) \($0.n) de \($0.de)" }
        let motivo: String
        if primero.estado == .cortado, let x = primero.pieza, !primero.esSerie {
            // Un paso continuo cortado: la cuenta es lo hecho de lo prescrito («24′ de 80′»).
            let hasta = primero.p.medida.tipo == .distancia ? "en \(fmtHecho(primero.p, x))" : "a los \(fmtTiempoHecho(x.segundos))"
            cuenta = "\(fmtHecho(primero.p, x)) de \(fmtPrescrito(primero.p.medida))"
            motivo = "\(pasoConArticulo(primero.p)) se cortó \(hasta)"
        } else if primero.estado == .cortado, let s = primero.pieza {
            let hasta = primero.p.medida.tipo == .distancia && s.metros != nil ? "en \(Int(s.metros!.rounded())) m" : "a los \(fmtDuracion(s.segundos))"
            motivo = "\(quien.map(mayuscula) ?? "Un paso") se cortó \(hasta)"
        } else {
            motivo = quien.map { "Terminaste en \($0)" } ?? "Terminaste en \(nombreClase(primero.p.clase).lowercased())"
        }
        return Completitud(estado: .parcial, cuenta: cuenta, motivo: motivo)
    }

    // MARK: - Desde el motor

    /// Lo hecho de la sesión tal como está AHORA. Un final natural cuenta el último paso como alcanzado:
    /// el cursor del motor ya se recogió (la carrera estructurada vuelve a su tramo 0 al cerrar el bloque).
    /// Nil si el plan no tiene pasos que juzgar.
    static func hechoDe(_ sesion: WorkoutSession, natural: Bool) -> HechoSesion? {
        let pasos = planDe(sesion).pasos
        guard !pasos.isEmpty else { return nil }
        return HechoSesion(pasos: pasos,
                           i: natural ? pasos.count - 1 : indiceActual(pasos, sesion),
                           final: natural ? .natural : .atleta,
                           parciales: parcialesDe(pasos, sesion))
    }

    /// La completitud de la sesión, con el método del coach del plan.
    static func completitudDe(_ sesion: WorkoutSession, natural: Bool) -> Completitud? {
        hechoDe(sesion, natural: natural).map { completitud($0, metodo: metodoResumen(de: sesion.plan.wristMethod)) }
    }

    // MARK: - Cómo se dice

    private static let nombreEstado: [Completitud.Estado: String] = [.completa: "Completa", .parcial: "Parcial", .libre: "Libre"]

    /// «Completa · 6 de 6 series», «Parcial · 4 de 6 series», «Libre · 5,21 km».
    static func lineaCompletitud(_ c: Completitud, metros: Double? = nil) -> String {
        let nombre = nombreEstado[c.estado] ?? ""
        let detalle = c.estado == .libre ? metros.map { m in let d = fmtDistancia(m); return "\(d.valor) \(d.unidad)" } : c.cuenta
        return detalle.map { "\(nombre) · \($0)" } ?? nombre
    }

    /// La palabra de un RPE (0…10): la del coach si el plan la trae, la del defecto si no.
    static func palabraDelRpe(_ rpe: Int, metodo: WristMethod?) -> String {
        metodo?.rpeWord(rpe) ?? rpePalabraDefecto[rpe] ?? ""
    }
}
