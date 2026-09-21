import SwiftUI

// LA LÁMINA DE CORRER, DECIDIDA UNA SOLA VEZ (FH-30).
//
// EL DOMINIO, ENTERO: una VENTANA de carrera en la muñeca. No es «el rodaje» —
// es *qué mide esta pieza* (metros | segundos | nada) × *contra qué objetivo*
// (un hito de distancia | un reloj | nada) × *en qué estado está* (rodaje
// continuo | serie de trabajo | recuperación) × *quién la pinta* (el motor, sin
// móvil; o el cable, en espejo). Doce combinaciones, UNA pantalla.
//
// POR QUÉ ESTE FICHERO EXISTE. La cara la decidían dos sitios: `RodajeVivoPage`
// leyendo el motor y `MirrorRodajeFace` leyendo la trama. Con la decisión
// duplicada, el espejo sólo aprendió el PRIMERO de los tres estados: una serie
// de calle (del coach o del constructor libre) caía por otra rama y el atleta
// veía una pantalla distinta según si el móvil estaba conectado o no. Lo mismo
// que ya pasó con los guiones y por lo que existe `GuionDelEspejo`.
//
// Aquí las dos vías proyectan su fuente a `Ventana` —un dato plano, sin motor y
// sin cable— y `lectura(_:)` decide. La vista sólo pinta. Y como todo esto vive
// en FAHYBRIKCore, se puede probar desde FAHYBRIKTests que las DOS proyecciones
// del MISMO entreno dan exactamente la misma lectura, que es lo único que
// significa «misma cara».
enum RodajeLamina {

    // MARK: - Lo que hay que saber de la ventana

    /// La pieza de carrera en curso, en dato plano. Lo que no se sabe viaja nil:
    /// un cero con cara de medida es la mentira que el §7 vino a matar.
    struct Ventana: Equatable {
        /// La pieza es UN TRAMO de una carrera estructurada (una serie, su
        /// recuperación, un calentamiento). Falso = un rodaje de corrido.
        var esSerie: Bool = false
        /// La recuperación entre series. Sólo existe dentro de una estructura.
        var enRecupera: Bool = false
        var enPausa: Bool = false
        /// Calle (GPS). La cinta y el interior nunca dicen «sin señal».
        var esCalle: Bool = true
        /// Los metros MEDIDOS de esta pieza (Apple, cinta o GPS). Nil = nadie los
        /// ha contado todavía — nunca el objetivo prescrito haciendo de medida.
        var metros: Double? = nil
        var objetivoMetros: Double? = nil
        var objetivoSegundos: Double? = nil
        /// Segundos DENTRO de esta pieza.
        var segundosPieza: Double = 0
        /// Lo que queda de la recuperación cuando la cierra un reloj. Nil en una
        /// recuperación por distancia o abierta: ahí no hay plazo que enseñar.
        var quedaRecupera: Double? = nil
        var ritmoSecPorKm: Int? = nil
        /// El veredicto del motor sobre el ritmo prescrito, ya juzgado (una sola
        /// regla para el móvil y para las dos vías del reloj).
        var enObjetivo: Bool = false
        /// El nombre de la parte cuando NO es la principal («Calentamiento»).
        /// Nil en la principal: ahí el contexto lo lleva la cuenta de series.
        var parte: String? = nil
        var serieN: Int = 1
        var serieTotal: Int = 1
        /// Lo que viene después de la recuperación, ya redactado.
        var siguiente: String? = nil
        /// El toque de «empezar ya» / cerrar tramo está disponible ahora mismo.
        var puedeAvanzar: Bool = false
    }

    /// Lo que se PINTA. Sin cierres y sin motor: la vista le cuelga el gesto si
    /// `toca` lo permite, y traduce `notaEnTinta` a su color.
    struct Lectura: Equatable {
        var contexto: String
        var sujeto: String
        var unidad: String = ""
        var tonoSujeto: Color = WatchTheme.ink
        var ritmo: String? = nil
        /// Veredicto en tinta («en objetivo»). Nil = no hay nada que juzgar.
        var veredicto: String? = nil
        /// La etiqueta del segundo nivel («ritmo», «luego», o el veredicto).
        var etiquetaSegundo: String = "ritmo"
        /// La lámina reserva la fila de la acción.
        var accion: Bool = false
        var nota: String? = nil
        /// La nota es una OFERTA («toca · empezar ya»), no una advertencia
        /// atenuada: se pinta en tinta.
        var notaEnTinta: Bool = false
        /// La pantalla acepta el toque que avanza el tramo.
        var toca: Bool = false
    }

    // MARK: - La decisión

    static func lectura(_ v: Ventana) -> Lectura {
        let ritmoSec = ritmoHonesto(v)
        let medida = RodajeMedida.vivo(medidaDe(v, ritmo: ritmoSec))
        guard v.esSerie else { return pintar(medida, pausa: v.enPausa, base: "rodaje") }

        let ritmo = textoRitmo(ritmoSec)
        let veredicto: String? = v.enObjetivo ? "en objetivo" : nil

        // LA RECUPERACIÓN VA ANTES QUE LA PAUSA a propósito: parar el entreno
        // durante un trote de vuelta no convierte la pantalla en otra cosa, y el
        // atleta sigue pudiendo salir antes de tiempo.
        if v.enRecupera {
            let sujeto = sujetoRecupera(v, medida)
            return Lectura(
                contexto: "recupera · viene la \(max(1, min(v.serieTotal, v.serieN + 1)))",
                sujeto: sujeto.texto,
                unidad: sujeto.unidad,
                tonoSujeto: sujeto.tono,
                // El segundo nivel de la recuperación NO es el ritmo: es lo que
                // viene. Esa es la única pregunta que se hace trotando.
                ritmo: v.siguiente,
                etiquetaSegundo: "luego",
                accion: true,
                nota: "toca · empezar ya",
                notaEnTinta: true,
                toca: v.puedeAvanzar
            )
        }

        if v.enPausa {
            return Lectura(
                contexto: medida.quedan ? "en pausa · te quedan" : "en pausa · llevas",
                sujeto: medida.sujeto,
                unidad: medida.unidad,
                ritmo: ritmo,
                veredicto: veredicto,
                etiquetaSegundo: veredicto ?? "ritmo"
            )
        }

        // Un calentamiento TAMBIÉN es una pierna de trabajo: sin el nombre de la
        // parte se anunciaba «serie 1 de 6» mientras el atleta trotaba para
        // entrar en calor.
        let base = v.parte ?? "serie \(v.serieN) de \(v.serieTotal)"
        return Lectura(
            contexto: medida.quedan ? "\(base) · te quedan" : base,
            sujeto: medida.sujeto,
            unidad: medida.unidad,
            // Sin señal no hay ritmo que pintar y, por tanto, tampoco veredicto:
            // juzgar una medida que no existe es peor que callar.
            ritmo: medida.notaSinSenal ? nil : ritmo,
            veredicto: medida.notaSinSenal ? nil : veredicto,
            etiquetaSegundo: medida.notaSinSenal ? "ritmo" : (veredicto ?? "ritmo"),
            nota: medida.notaSinSenal ? WatchNota.sinSenal : nil,
            toca: v.puedeAvanzar
        )
    }

    /// El rodaje de corrido y las dos pausas: sujeto, unidad y contexto salen de
    /// la medida, no del estado.
    static func pintar(_ medida: RodajeMedida.Lectura, pausa: Bool, base: String) -> Lectura {
        let ritmo = textoRitmo(medida.ritmoSecPorKm)
        if pausa {
            return Lectura(
                contexto: medida.quedan ? "en pausa · te quedan" : "en pausa · llevas",
                sujeto: medida.sujeto,
                unidad: medida.unidad,
                ritmo: ritmo
            )
        }
        if medida.notaSinSenal {
            return Lectura(
                contexto: "\(base) · llevas",
                sujeto: medida.sujeto,
                nota: WatchNota.sinSenal
            )
        }
        return Lectura(
            contexto: medida.quedan ? "\(base) · te quedan" : "\(base) · llevas",
            sujeto: medida.sujeto,
            unidad: medida.unidad,
            ritmo: ritmo
        )
    }

    /// EL RITMO, CON EL SUELO DE HONESTIDAD PUESTO AQUÍ Y NO EN CADA VÍA.
    ///
    /// Por debajo de 10 m medidos un ritmo no describe un esfuerzo, describe un
    /// sensor arrancando (`RunLegDisplay.minMetersForPace`): cuatro metros en un
    /// segundo salen a 4:10/km y parecen una medida. El reloj en solitario ya
    /// aplicaba ese suelo al ritmo de la pierna, pero el cable manda el del
    /// accesor del motor, que sólo lleva el TECHO — así que los primeros
    /// segundos de cada tramo las dos caras decían cosas distintas. La regla es
    /// de LA LECTURA, no de quién la alimente.
    private static func ritmoHonesto(_ v: Ventana) -> Int? {
        guard let ritmo = v.ritmoSecPorKm, ritmo > 0,
              ritmo <= RunLegDisplay.maxPaceSecPerKm,
              let metros = v.metros, metros >= RunLegDisplay.minMetersForPace
        else { return nil }
        return ritmo
    }

    private static func medidaDe(_ v: Ventana, ritmo: Int?) -> RodajeMedida.Entrada {
        RodajeMedida.Entrada(
            esCalle: v.esCalle,
            metrosApple: v.metros,
            ritmoSecPorKm: ritmo,
            objetivoMetros: v.objetivoMetros,
            objetivoSegundos: v.objetivoSegundos,
            segundosPieza: v.segundosPieza,
            esSerie: v.esSerie
        )
    }

    /// EL SUJETO DE LA RECUPERACIÓN, por orden de evidencia: si la serie iba por
    /// metros y nadie los ha medido, manda lo que dijera la medida (un crono, en
    /// tinta); si la cierra un reloj, lo que queda, en verde; y si no la cierra
    /// nadie, lo que llevas trotando.
    private static func sujetoRecupera(
        _ v: Ventana, _ medida: RodajeMedida.Lectura
    ) -> (texto: String, unidad: String, tono: Color) {
        if v.objetivoMetros != nil, v.metros == nil {
            return (medida.sujeto, medida.unidad, WatchTheme.ink)
        }
        if let total = v.objetivoSegundos, total > 0 {
            let queda = v.quedaRecupera ?? max(0, total - v.segundosPieza)
            return (WatchFormat.countdown(queda), "", WatchTheme.zoneGreen)
        }
        return (WatchFormat.clock(v.segundosPieza), "", WatchTheme.zoneGreen)
    }

    private static func textoRitmo(_ secPorKm: Int?) -> String? {
        secPorKm.map { "\(WatchFormat.pace($0)) \(Formato.UnidadRitmo.porKm.rawValue)" }
    }
}

// MARK: - La proyección del MOTOR (sin móvil)

extension RodajeLamina.Ventana {

    /// El reloj en solitario: el motor es la fuente.
    init(sesion s: WorkoutSession) {
        let serie = s.isRunStructureActive
        let leg = s.currentRunLeg
        let cuenta = RunLegDisplay.serie(legs: s.currentRunLegs ?? [], indice: s.runLegIndex)
        let metros: Double? = serie ? s.tramoRunCoveredMeters : s.liveRunDistanceMeters
        let ritmo: Int? = serie
            ? metros.flatMap { RunLegDisplay.legPaceSecPerKm(coveredMeters: $0, elapsedS: s.runLegElapsed) }
            : s.liveCoveredPaceSecPerKm
        let objetivo: (label: String, status: TargetStatus)? = serie
            ? leg.flatMap { RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: ritmo) }
            : nil
        let siguiente: RunLeg? = {
            guard serie, let legs = s.currentRunLegs else { return nil }
            let i = s.runLegIndex + 1
            return i < legs.count ? legs[i] : nil
        }()

        self.init(
            esSerie: serie,
            enRecupera: serie && !(leg?.isWork ?? true),
            enPausa: s.isPaused,
            esCalle: RodajeMedida.esCalle(environment: s.runEnvironment),
            metros: metros,
            objetivoMetros: serie
                ? leg?.distanceMeters.map { Double($0) }
                : s.currentSegment?.targetDistanceMeters.map { Double($0) },
            objetivoSegundos: serie
                ? leg?.durationSeconds.map { Double($0) }
                : s.currentSegment?.targetDurationSeconds.map { Double($0) },
            segundosPieza: serie ? s.runLegElapsed : s.condElapsed,
            quedaRecupera: serie ? max(0, s.runLegRemaining) : nil,
            ritmoSecPorKm: ritmo,
            enObjetivo: objetivo?.status == .inTarget,
            parte: RunLegDisplay.nombreDeParte(leg?.phaseRole ?? .main),
            serieN: cuenta.n,
            serieTotal: cuenta.total,
            siguiente: RunLegDisplay.nextLegPreview(siguiente),
            puedeAvanzar: RodajeVivoToca.avanza(s)
        )
    }
}

// MARK: - La proyección del CABLE (en espejo)

extension RodajeLamina.Ventana {

    /// El reloj en espejo: la trama es la fuente. `elapsed` sólo se usa si la
    /// trama no trae el reloj de la ventana; `desdeTrama` envejece la cuenta
    /// atrás de la recuperación igual que ya hace `MirrorTimedRest` para decidir
    /// cuándo se acaba — si no, la pantalla enseñaría «0:04» en el mismo
    /// instante en que el reloj manda el avance.
    init(trama f: MirrorStateFrame, elapsed: Double, desdeTrama: TimeInterval = 0) {
        let t = f.tramo
        // LA MARCA DE CARRERA ESTRUCTURADA EN EL CABLE ES `parte`, no la cuenta
        // de rondas: el motor la escribe desde `currentRunLeg`, que sólo existe
        // dentro de una estructura. Un bloque rotatorio con una pieza de correr
        // también manda `rondaTotal > 1` y en solitario NO es una serie — se
        // pinta como rodaje —, así que contar rondas volvería a separar las dos
        // caras. Mismo criterio que `MirrorTimedRest.isTimedRunRest`.
        let serie = t?.parte != nil
        // Las calorías nunca son metros: un tramo medido en calorías no tiene
        // distancia que restar (`objetivoEsCalorias`).
        let porMetros = (t?.objetivoEsCalorias ?? false) == false
        let hecho: Double? = porMetros ? t?.hechoMedida : nil
        let objetivo: Double? = porMetros ? t?.objetivoMedida : nil

        self.init(
            esSerie: serie,
            enRecupera: serie && (t?.enDescanso ?? false),
            enPausa: f.phase == MirrorWire.Phase.paused,
            esCalle: RodajeMedida.esCalle(environment: f.runEnvironment),
            metros: f.beltDistanceM ?? hecho,
            objetivoMetros: f.beltTargetM ?? objetivo,
            objetivoSegundos: t?.ventanaTotal,
            segundosPieza: t?.enTramoS ?? elapsed,
            quedaRecupera: MirrorTimedRest.quedaViva(tramo: t, sinceFrame: desdeTrama) ?? t?.ventanaQueda,
            ritmoSecPorKm: f.beltPaceSecPerKm ?? t?.ritmoSecPorKm,
            enObjetivo: t?.objetivoEstado == "inTarget",
            parte: t?.parte
                .flatMap(RunPhaseRole.init(rawValue:))
                .flatMap(RunLegDisplay.nombreDeParte),
            serieN: t?.rondaN ?? 1,
            serieTotal: max(1, t?.rondaTotal ?? 1),
            siguiente: t?.siguiente,
            // El motor vive en el móvil: el toque VIAJA, no avanza nada aquí.
            puedeAvanzar: serie && f.phase == MirrorWire.Phase.active
        )
    }
}
