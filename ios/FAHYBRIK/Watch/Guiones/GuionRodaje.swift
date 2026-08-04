import SwiftUI

// (1) RODAJE — la modalidad más rica del reloj, y la única sin una sola decisión
// dentro. Port del guion del doble (`web/components/design-twin/screens/watch-rodaje/`).
//
// ── POR QUÉ ESTO ES UN GUION Y NO UNA VISTA ────────────────────────────────
// Qué es EL dato en cada momento de un rodaje es una decisión de diseño, no de
// pintado: se prueba sin montar una pantalla y se lee entera de un vistazo. La
// vista (`ContinuousLiveView`) sólo pasa el estado y pinta lo que salga.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Todo lo suyo: pulso, ritmo y distancia. Corriendo al aire libre el GPS y el
// sensor óptico son del reloj — ni una máquina ni el móvil — así que aquí no hay
// un solo dato repetido ni un solo dato declarado.
//
// Con una excepción, que es el escenario mínimo: hasta que el GPS no fija, el
// ritmo y la distancia NO EXISTEN. No se pintan a cero — un «0,00 km» es un dato
// falso con cara de medida (§7): sus páginas desaparecen y el rodaje se queda en
// las dos cosas que el reloj mide pase lo que pase, tu pulso y el tiempo.
//
// ── EL SUJETO, Y LAS DOS FORMAS EN QUE DEGRADA ─────────────────────────────
// El sujeto de un rodaje es TU ZONA — el lienzo teñido y el pulso de numeral. Y
// cuelga de un ancla de FC que hoy no tiene casi nadie, así que sabe degradar:
// sin zona manda el RITMO, y el pulso no desaparece, baja de sitio y se pinta en
// ppm crudos con la nota que dice por qué no hay zona.
//
// ── LO QUE EL DOBLE NO CUBRÍA Y EL DATO REAL SÍ ────────────────────────────
// El doble modeló el rodaje SIN zona prescrita. En la biblioteca real es al
// revés: de los 212 bloques continuos, el patrón dominante es «Run 1h15' zona 2»
// — `{scheme: steady, target: hr_zone 2}`. Con una zona prescrita la pregunta
// del atleta deja de ser «a qué ritmo voy» y pasa a ser «voy en zona», así que:
//
//   · Con ancla Y zona prescrita → el pulso es el sujeto y el segundo nivel
//     JUZGA («en zona» / «te pasas» / «vas corto»), que es lo accionable.
//   · Sin ancla no hay zona viva y NO SE JUZGA: la zona prescrita se dice en el
//     contexto («Correr · Z2») y ahí se acaba. Prometer un veredicto sin umbral
//     sería inventar la mitad de la medida.

enum GuionRodaje {

    /// Lo que el guion necesita saber. Lo rellena la vista desde el motor
    /// (solitario) o, el día que el cable lo lleve, desde la trama del móvil.
    struct Estado {
        /// Correr al aire libre. En otro continuo (ergo sin monitor) no hay GPS
        /// que prometer, así que tampoco se dice «sin señal».
        var esCorrer: Bool
        /// La zona que escribió el coach. `nil` = rodaje sin zona prescrita.
        var zonaObjetivo: HRZone?
        /// La zona que se está midiendo AHORA. `nil` = sin ancla → sin tinte y
        /// sin veredicto (el color es un dato, §10.1).
        var zonaViva: HRZone?
        var bpm: Int?
        /// `nil` = el GPS todavía no fija; entonces no hay ritmo que pintar.
        var ritmoSecPorKm: Int?
        /// `nil` = idem. Nunca 0: un cero aquí es una medida falsa.
        var metros: Double?
        /// El objetivo de distancia, si lo escribió el coach.
        var objetivoMetros: Double?
        var segundos: Double
    }

    /// Un rodaje no tiene decisiones dentro. La única que existe es cerrar un
    /// bloque estructural (calentamiento / vuelta a la calma), y sólo entonces.
    struct Gestos {
        var hecho: (() -> Void)?

        init(hecho: (() -> Void)? = nil) { self.hecho = hecho }
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        // Con un bloque estructural hay algo que tocar → mando. Si no, ojeada de
        // principio a fin: terminar un rodaje no es un toque que el brazo pueda
        // disparar solo a cinco kilómetros de casa.
        let modo: WatchModo = g.hecho == nil ? .ojeada : .mando

        var conRitmo: [WatchPagina] = []
        if let ritmo = e.ritmoSecPorKm {
            conRitmo.append(WatchPagina(
                id: "ritmo",
                contexto: contexto(e),
                modo: modo,
                // La unidad va pegada al numeral: el ritmo son SIEMPRE cuatro
                // glifos («5:12») y ahí la cifra clava su altura.
                sujeto: WatchFormat.pace(ritmo),
                unidad: Formato.UnidadRitmo.porKm.rawValue,
                accion: g.hecho == nil ? nil : "Toca · hecho",
                onToca: g.hecho
            ))
        }
        if let metros = e.metros {
            conRitmo.append(WatchPagina(
                id: "distancia",
                // Un «5,24» sin decir de cuánto no informa de nada. El objetivo
                // va arriba y lo que falta lo dibuja el aro, así que ninguno de
                // los dos gasta la línea del segundo nivel.
                contexto: e.objetivoMetros.map { "De \(WatchDistancia.completa($0))" } ?? "Recorriste",
                modo: modo,
                sujeto: WatchDistancia.cifra(metros),
                unidad: WatchDistancia.unidad(metros),
                accion: g.hecho == nil ? nil : "Toca · hecho",
                onToca: g.hecho
            ))
        }

        // El tiempo siempre, y es la degradación final: cuando no hay ni ritmo ni
        // distancia, ES la pantalla, y lleva el contexto y la razón.
        let sinMedida = conRitmo.isEmpty
        let tiempo = WatchPagina(
            id: "tiempo",
            contexto: sinMedida ? contexto(e) : "Llevas",
            modo: modo,
            sujeto: WatchFormat.clock(e.segundos),
            accion: g.hecho == nil ? nil : "Toca · hecho",
            onToca: g.hecho,
            // «Sin señal» sólo se dice corriendo: en un continuo bajo techo no
            // hay GPS que esperar y la frase sobraría.
            nota: e.ritmoSecPorKm == nil && e.esCorrer ? WatchNota.sinSenal : nil
        )

        let pulso = paginaPulso(e, modo: modo)

        // EL MÍNIMO: sin GPS quedan dos páginas, y la nota dice por qué son dos.
        if sinMedida {
            return [pulso, tiempo].compactMap { $0 }
        }

        // CON zona viva el pulso gobierna el rodaje y va primero: es el sujeto
        // que le da identidad. SIN ancla no hay zona que gobernar, así que manda
        // el ritmo y el pulso baja detrás de la distancia — unos ppm que no se
        // pueden comparar con nada informan menos que cuánto llevas corrido.
        if e.zonaViva != nil, let pulso {
            return [pulso] + conRitmo + [tiempo]
        }
        return conRitmo + [pulso].compactMap { $0 } + [tiempo]
    }

    // MARK: - La página del pulso, que aquí es la que JUZGA

    private static func paginaPulso(_ e: Estado, modo: WatchModo) -> WatchPagina? {
        guard let bpm = e.bpm else { return nil }
        // Sin zona viva no se juzga nada: ppm crudos y la razón al pie. Lo
        // resuelve el helper compartido, que ya escribe esa degradación.
        guard let viva = e.zonaViva else {
            return WatchPaginasComunes.pulso(bpm: bpm, zone: nil, modo: modo)
        }
        // Sin zona prescrita hay zona pero no hay contra qué compararla.
        guard let objetivo = e.zonaObjetivo else {
            return WatchPaginasComunes.pulso(bpm: bpm, zone: viva, modo: modo)
        }
        let (texto, tono) = veredicto(viva: viva, objetivo: objetivo)
        return WatchPagina(
            id: "pulso",
            contexto: "Pulso · objetivo Z\(objetivo.rawValue)",
            modo: modo,
            sujeto: "\(bpm)",
            segundoValor: texto,
            segundoTono: tono
        )
    }

    /// El veredicto en español de box: dice qué hacer, no en qué zona estás (eso
    /// ya lo dice el tinte del lienzo).
    static func veredicto(viva: HRZone, objetivo: HRZone) -> (String, Color) {
        if viva == objetivo { return ("en zona", WatchTheme.zoneGreen) }
        return viva.rawValue > objetivo.rawValue
            ? ("te pasas · afloja", WatchTheme.zoneAmber)
            : ("vas corto · aprieta", WatchTheme.zoneAmber)
    }

    // MARK: - Contexto

    /// Dónde estás, en una línea. La zona PRESCRITA vive aquí incluso cuando no
    /// se puede juzgar: el atleta tiene que saber qué le pidieron.
    static func contexto(_ e: Estado) -> String {
        let que = e.esCorrer ? "Correr" : "Continuo"
        guard let z = e.zonaObjetivo else { return que }
        return "\(que) · \(z.label)"
    }
}

// MARK: - La grafía de una distancia medida

/// Metros por debajo del kilómetro, kilómetros con dos decimales por encima.
/// Vive aquí y no en cada vista porque «5,24 km» y «5.24 km» en dos pantallas
/// del mismo entreno es exactamente lo que el contrato §2 vino a matar.
enum WatchDistancia {
    static func cifra(_ metros: Double) -> String {
        metros >= 1000
            ? Formato.esDecimal(metros / 1000, decimals: 2, siempreDecimales: true)
            : String(Int(metros))
    }

    static func unidad(_ metros: Double) -> String { metros >= 1000 ? "km" : "m" }

    /// Cifra y unidad juntas, para cuando la distancia va dentro de una frase
    /// («De 10,00 km»). Escrita IGUAL que la medida, para que al llegar el sujeto
    /// diga exactamente lo que prometía el contexto.
    static func completa(_ metros: Double) -> String {
        "\(cifra(metros)) \(unidad(metros))"
    }
}
