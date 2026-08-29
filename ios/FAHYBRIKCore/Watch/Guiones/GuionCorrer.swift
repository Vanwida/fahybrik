import SwiftUI

// CORRER, EN LA MUÑECA — una sola interfaz de TRES páginas.
//
// Del mismo corte que la app de Entreno del Apple Watch: se desliza en horizontal
// y EL VIVO ES EL CENTRO, así que ni los datos ni los controles están nunca a más
// de un gesto — y volver al esfuerzo tampoco.
//
//   ◀  datos  ·  VIVO  ·  controles  ▶
//
// LA INTERFAZ NO CAMBIA: CAMBIA LO QUE HAY QUE DECIR. Se diseña primero para el
// caso mínimo —sin umbral, sin señal, sin nada— porque es el que ve todo el mundo
// el primer día. Un rodaje libre y un 5×1.000 del coach son las mismas tres
// páginas con distinto contenido, no dos pantallas: si fueran dos, el mismo
// entreno se vería distinto según quién lo escribió.
//
// LAS DOS PREGUNTAS, Y POR QUÉ SON DOS PÁGINAS. «¿Cómo va la carrera?» y «¿cuánto
// me falta?» no son la misma pregunta, y contestarlas en la misma caja ya confundió
// a un atleta de verdad: un tiempo restante junto a una distancia cubierta se lee
// como si fueran del mismo alcance. Así que los datos hablan de LA SESIÓN, el vivo
// habla de LA PIEZA, y cada página lo dice en su banda de arriba.
//
// EL SUJETO DEL VIVO ES LO QUE FALTA, medido en la unidad en que esa pieza se mide.
// Si no falta nada medible, cae al reloj de la pieza y la banda pasa a decir
// «llevas» — nunca se pinta un cero con cara de dato ni se inventa un ritmo.

enum GuionCorrer {

    /// La página que está puesta mientras corres. El lienzo la abre por este id.
    static let idVivo = "vivo"
    static let idDatos = "datos"
    static let idControles = "controles"

    // MARK: - Estado

    /// QUÉ MIDE la pieza que tienes delante. De aquí sale el sujeto del vivo, y es
    /// una decisión de la prescripción, no de la pantalla.
    enum Pieza: Equatable {
        /// Un tramo por metros: «10 km», «800 m». Falta el objetivo menos lo hecho.
        case distancia(objetivoM: Double, hechoM: Double?)
        /// Un tramo por reloj: «5:00 en umbral». Falta lo que queda de su ventana.
        case tiempo(quedaS: Double)
        /// Nadie la mide: no hay objetivo escrito, o el GPS todavía no ha fijado.
        /// El sujeto cae al reloj de la pieza.
        case abierta
    }

    enum Fase: Equatable {
        case corriendo
        case pausa
        /// El descanso es el ÚNICO tramo de una carrera en el que se puede mirar y
        /// tocar, así que es el único sitio donde el vivo anuncia un gesto.
        case recupera
    }

    struct Estado {
        /// Cómo se llama la pieza en la banda: «Rodaje», «Serie 3 de 5».
        var contextoPieza: String
        var fase: Fase = .corriendo
        var pieza: Pieza = .abierta
        /// El reloj de LA PIEZA (no el de la sesión): en un 6×800 con trote de
        /// vuelta, el de la sesión suma las series y los trotes de corrido.
        var enPiezaS: Double = 0
        /// El alcance de la SESIÓN, para la página de datos.
        var sesionS: Double = 0
        var sesionMetros: Double? = nil
        var sesionRitmoSecPorKm: Int? = nil
        /// El ritmo de ESTA pieza, que es el único accionable en marcha.
        var ritmoSecPorKm: Int? = nil
        /// El objetivo escrito y su veredicto ya juzgado por el motor compartido.
        var objetivoLabel: String? = nil
        var objetivoEstado: TargetStatus = .unknown
        var bpm: Int? = nil
        var zonaViva: HRZone? = nil
        /// Lo que viene después del descanso, ya redactado por el móvil.
        var siguiente: String? = nil
        /// ¿Los cortes son del COACH? Con estructura escrita, «Nuevo tramo» no se
        /// ofrece: el corte ya está escrito.
        var hayEstructura: Bool = false
        var hayBloqueSiguiente: Bool = false
    }

    struct Gestos {
        var pausar: () -> Void = {}
        var reanudar: () -> Void = {}
        var nuevoTramo: () -> Void = {}
        var siguienteBloque: () -> Void = {}
        var terminar: () -> Void = {}
        /// El gesto del descanso: empezar ya la que viene sin esperar al reloj.
        var empezarYa: () -> Void = {}
    }

    // MARK: - Las tres

    static func paginas(_ e: Estado, _ g: Gestos) -> [WatchPagina] {
        [datos(e), vivo(e, g), controles(e, g)]
    }

    // MARK: - 1 · Los datos

    /// LA PÁGINA DE LOS DATOS. Cuatro cifras de la sesión de un vistazo.
    ///
    /// Es la única página de la interfaz SIN un número que gobierne, y eso es su
    /// definición: el panel al que se va a buscar una cifra. Una página que intenta
    /// ser panel y sujeto a la vez es la «letra pequeña alrededor» que hay que
    /// quitar.
    ///
    /// El precio está medido y se acepta: cuatro filas bajan cada número a 24 pt
    /// (≈3,5 mm de alto), que se lee con el brazo levantado pero no de reojo en
    /// marcha. Para eso está la del centro.
    ///
    /// Cada fila existe sólo si su dato existe. Sin GPS no hay fila de distancia ni
    /// de ritmo: un cero ahí se lee como una medida, y no lo es.
    static func datos(_ e: Estado) -> WatchPagina {
        var filas: [WatchFila] = [
            WatchFila(id: "tiempo", etiqueta: "Tiempo", valor: WatchFormat.clock(e.sesionS))
        ]
        if let m = e.sesionMetros, let d = Formato.distanciaCifra(m) {
            filas.append(WatchFila(id: "distancia", etiqueta: "Distancia",
                                   valor: d.cifra, unidad: d.unidad))
        }
        if let r = e.sesionRitmoSecPorKm {
            filas.append(WatchFila(id: "ritmo", etiqueta: "Ritmo medio",
                                   valor: WatchFormat.pace(r), unidad: "/km"))
        }
        if let bpm = e.bpm {
            // LA ZONA NO ES UNA FILA APARTE: es lo que SIGNIFICA tu pulso, así que
            // va con él y con su color. Sin umbral medido no existe — y entonces el
            // pulso va en ppm crudos y la nota del pie dice por qué.
            filas.append(WatchFila(
                id: "pulso", etiqueta: "Pulso", valor: "\(bpm)", unidad: "ppm",
                cola: e.zonaViva.map { "Z\($0.rawValue) \(WatchZonaNombre.de($0))" },
                colaTono: e.zonaViva.map { WatchTheme.zoneColor($0) }
            ))
        }
        return .panel(
            id: idDatos,
            contexto: "La sesión",
            filas: filas,
            // Sin pulso no hay nada que explicar; con pulso y sin zona, sí.
            nota: (e.bpm != nil && e.zonaViva == nil) ? WatchNota.sinAncla : nil
        )
    }

    // MARK: - 2 · El vivo

    /// LA PÁGINA DEL ESFUERZO. El centro de la interfaz y la que está puesta
    /// mientras corres: un solo número, a sangre, y una sola línea debajo.
    ///
    /// CERO CONTROLES. Corriendo no se toca: el reloj no pide nada. La pantalla
    /// sigue siendo un blanco entero para el gesto latente, pero no se gasta una
    /// línea en anunciarlo — y esos 15 pt vuelven al número. El descanso es la
    /// excepción, porque es el único momento en que sí se puede tocar.
    static func vivo(_ e: Estado, _ g: Gestos) -> WatchPagina {
        if e.fase == .recupera { return recupera(e, g) }

        let falta = loQueFalta(e)
        let enPausa = e.fase == .pausa
        // La banda lo dice CON PALABRAS. La ambigüedad entre cubierto y restante ya
        // se pagó una vez, y un numeral solo no la deshace.
        let quePasa = falta == nil ? "llevas" : "te quedan"
        let quien = enPausa ? "En pausa" : e.contextoPieza

        return WatchPagina(
            id: idVivo,
            contexto: "\(quien) · \(quePasa)",
            // `ojeada`: hay gesto latente (la pantalla entera), pero no se anuncia.
            modo: .ojeada,
            sujeto: falta?.cifra ?? WatchFormat.clock(e.enPiezaS),
            unidad: falta?.unidad,
            // EN PAUSA EL DATO NO DESAPARECE, SE APAGA: sigues sabiendo dónde lo
            // dejaste. El aro se queda donde estaba y los controles de al lado
            // ofrecen «Reanudar».
            tono: enPausa ? WatchTheme.inkApagado : WatchTheme.ink,
            segundoEtiqueta: etiquetaDelRitmo(e),
            segundoValor: e.ritmoSecPorKm.map { "\(WatchFormat.pace($0)) /km" },
            // SIN COLOR. Mientras el lienzo lleve la zona, en esta pantalla no habla
            // en color nada más: un «en objetivo» verde sobre un lienzo verde no se
            // lee, y sobre un ámbar diría dos cosas a la vez. El veredicto es una
            // palabra.
            segundoTono: nil,
            nota: notaDelVivo(e)
        )
    }

    /// EL DESCANSO. El aro sigue siendo naranja —el aro es la estructura— y el fondo
    /// es el único apagado de la interfaz en marcha: aquí la zona deja de mandar,
    /// porque lo que importa es que estás parado, no a qué intensidad estabas. Es
    /// `restBg`, no un tinte de zona.
    private static func recupera(_ e: Estado, _ g: Gestos) -> WatchPagina {
        let queda: Double? = {
            if case let .tiempo(q) = e.pieza { return q }
            return nil
        }()
        return WatchPagina(
            id: idVivo,
            // «Viene la 4» y no «Descanso»: lo que hace falta saber parado es qué
            // toca después, no cómo se llama esto.
            contexto: e.siguiente.map { "Recupera · \($0)" } ?? "Recupera",
            // El único `mando` del vivo: aquí sí se puede tocar, así que se anuncia.
            modo: .mando,
            sujeto: queda.map(WatchFormat.countdown) ?? WatchFormat.clock(e.enPiezaS),
            tono: WatchTheme.zoneGreen,
            segundoEtiqueta: e.siguiente == nil ? nil : "Luego",
            segundoValor: e.siguiente,
            accion: "Toca · empezar ya",
            onToca: g.empezarYa,
            fondo: WatchTheme.restBg
        )
    }

    /// LO QUE FALTA de la pieza, en su unidad. Nil = no lo sabe nadie, y entonces el
    /// sujeto cae al reloj de la pieza.
    ///
    /// Los metros que faltan llevan los DOS decimales de la medida, no uno: 5,24 +
    /// 4,76 = 10,00, y si el que falta redondeara, la suma dejaría de dar.
    static func loQueFalta(_ e: Estado) -> Formato.Cifra? {
        switch e.pieza {
        case let .distancia(objetivo, hecho):
            // Sin metros medidos no hay resta que hacer: el GPS no ha fijado y lo
            // honesto es el reloj, no un «faltan 10,00 km» que no se ha movido.
            guard let hecho else { return nil }
            return Formato.distanciaCifra(max(0, objetivo - hecho))
        case let .tiempo(queda):
            return Formato.Cifra(cifra: WatchFormat.countdown(queda), unidad: nil)
        case .abierta:
            return nil
        }
    }

    /// La etiqueta del ritmo. Sin objetivo escrito dice «Ritmo»; con objetivo pasa a
    /// decir CÓMO VAS contra el suyo, en una palabra y sin sermón — el háptico de
    /// fuera de zona ya avisa. Un rodaje libre no está «mal» a ninguna intensidad,
    /// así que sin prescripción no hay veredicto.
    static func etiquetaDelRitmo(_ e: Estado) -> String {
        guard e.objetivoLabel != nil else { return "Ritmo" }
        switch e.objetivoEstado {
        case .inTarget: return "En objetivo"
        case .tooFast:  return "Vas rápido"
        case .tooSlow:  return "Vas lento"
        case .unknown:  return "Ritmo"
        }
    }

    /// La razón de que no haya cifra, cuando la hay. Sólo en el caso que la motiva:
    /// una pieza que SE MIDE por metros y todavía no tiene ninguno.
    private static func notaDelVivo(_ e: Estado) -> String? {
        guard case let .distancia(_, hecho) = e.pieza, hecho == nil else { return nil }
        return WatchNota.sinSenal
    }

    // MARK: - 3 · Los controles

    /// LA PÁGINA DE LOS CONTROLES. La única con botones, porque es la única a la que
    /// se llega habiendo decidido dejar de mirar y tocar. En las otras dos un botón
    /// le quitaría 52 pt al dato —el 21 % del lienzo— para ofrecer algo que
    /// corriendo no se usa.
    ///
    /// EL RELOJ NO SE VA: la banda de arriba mantiene el crono de la sesión, así que
    /// se decide sin perder de vista la carrera.
    static func controles(_ e: Estado, _ g: Gestos) -> WatchPagina {
        var botones: [WatchBoton] = []

        // PAUSAR: la más frecuente y la más urgente, así que arriba, la más grande y
        // en el naranja de la acción. Al volver dice «Reanudar».
        let enPausa = e.fase == .pausa
        botones.append(WatchBoton(
            id: "pausa",
            titulo: enPausa ? "Reanudar" : "Pausar",
            peso: .principal,
            onToca: enPausa ? g.reanudar : g.pausar
        ))

        // NUEVO TRAMO: cierra lo que llevas medido y empieza de cero sin tocar la
        // prescripción — produce un parcial con sus metros, su tiempo y su ritmo.
        // Sólo cuando los cortes son del ATLETA: si el coach escribió la estructura,
        // el corte ya está escrito y el botón no está.
        if !e.hayEstructura {
            botones.append(WatchBoton(id: "nuevoTramo", titulo: "Nuevo tramo", onToca: g.nuevoTramo))
        }

        // SIGUIENTE BLOQUE: saltar de bloque es una DECISIÓN, y las decisiones viven
        // aquí. Por eso el mapa de bloques deja de ser una página del vivo.
        if e.hayBloqueSiguiente {
            botones.append(WatchBoton(id: "siguiente", titulo: "Siguiente bloque", onToca: g.siguienteBloque))
        }

        // TERMINAR: abajo, en rojo y CONFIRMADA. Es la única destructiva de la
        // interfaz — un desliz de más no puede acabar una carrera.
        botones.append(WatchBoton(
            id: "terminar",
            titulo: "Terminar",
            peso: .destructiva,
            confirma: "¿Terminar y guardar?",
            onToca: g.terminar
        ))

        return .controles(
            id: idControles,
            contexto: "\(e.contextoPieza) · \(WatchFormat.clock(e.sesionS))",
            botones: botones
        )
    }
}
