import SwiftUI

// (10) EL RELOJ DE PARED — los cuatro formatos que corta el crono cuando no hay
// ni GPS ni máquina, y que al reordenar las superficies se quedaron sin pantalla.
// Port del guion del doble
// (`web/components/design-twin/screens/watch-reloj-de-pared/guion.ts`).
//
// ── EL HUECO, DICHO SIN ADORNOS ────────────────────────────────────────────
// Sin esta familia, `intervals`/`tabata`/`death_by`/`steady` funcional caían al
// suelo honesto —el crono del bloque, con el movimiento y su dosis— que dice
// menos pero no dice nada falso. Lo que no decía es lo único que gobierna estos
// cuatro formatos: la ventana de trabajo/descanso. Y no se arregla enchufándolos
// al EMOM: `GuionEmom` lee el plan del EMOM y su fase propia, así que una tabata
// ahí pintaría una cuenta atrás muerta.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo, y se acaba ahí. Sin GPS que valga (estás en el sitio) y sin
// máquina que emparejar (burpees, planchas, un trineo): el reloj lo sabe TODO de
// estos cuatro formatos, porque todo lo que hay que saber es qué hora es. Es la
// familia donde la muñeca sola basta.
//
// ── LA TESIS: UNA FAMILIA, CUATRO SUJETOS ──────────────────────────────────
// Lo compartido es el mecanismo (el reloj de pared corta y nadie mide el
// trabajo). Lo que NO se comparte es la pregunta, y el sujeto sale de la
// pregunta:
//
//   formato     │ la pregunta                       │ el sujeto         │ el aro
//   ────────────┼────────────────────────────────────┼────────────────────┼──────────
//   intervals   │ ¿cuánto a ESTE y cuántos faltan?   │ cuenta atrás       │ segmentado
//   tabata      │ ¿trabajo o paro?                   │ LA RONDA           │ segmentado
//   death_by    │ ¿cuántas me tocan este minuto?     │ LAS REPETICIONES   │ continuo
//   steady      │ ¿cuánto queda?                     │ cuenta atrás       │ continuo
//
// Meterlos a los cuatro en la misma pantalla con el mismo sujeto es exactamente
// el error del suelo de hoy: sale un crono para todo y ninguno contesta lo suyo.

enum GuionRelojDePared {

    enum Formato: Equatable { case intervals, tabata, deathBy, steady }

    /// Estado RESUELTO, no la plantilla estática del caso (el doble simula una
    /// reproducción; aquí el motor ya ha hecho ese trabajo). Un `nil` en
    /// `totalRondas` es dato, no un hueco: un death by no tiene un número de
    /// rondas fijo — la 12 existe si llegas.
    struct Estado {
        var formato: Formato
        /// Cómo lo escribió el coach. Sólo lo pintan intervals y steady: tabata
        /// y death by son un único movimiento por definición y decirlo a partir
        /// de la ronda 2 sería repetir lo que ya sabes.
        var movimiento: String?
        var rondaActual: Int
        var totalRondas: Int?
        var enDescanso: Bool
        /// Lo que queda del tramo en el que estás (trabajo o parada). La ventana
        /// entera la lleva el aro, que se resuelve aparte — ver `GuionDelEspejo.Aro`.
        var quedaS: Double
        /// Lo que el coach escribió para gobernar el esfuerzo. Sólo intervals, y
        /// sólo trabajando: en la parada no hay esfuerzo contra el que medirse.
        var objetivo: String? = nil
        /// Las repeticiones DE ESTE MINUTO — el death by entero. `nil` fuera de
        /// death by.
        var repsDelMinuto: Int? = nil
        /// El atleta ha declarado que no llegó. El bloque se acaba ahí.
        var fallado: Bool = false
        /// Sólo cuando `fallado`: el minuto anterior al que no llegaste.
        var rondasSuperadas: Int? = nil
        var zonaViva: HRZone? = nil
        var bpm: Int? = nil
    }

    struct Gestos {
        /// Death by: declarar que no llegaste a las repeticiones del minuto. Es
        /// el ÚNICO gesto de toda la familia — «lo logré» no se ofrece porque el
        /// minuto que se cumple solo ya cuenta como logrado.
        var rendirse: (() -> Void)?

        init(rendirse: (() -> Void)? = nil) { self.rendirse = rendirse }
    }

    // MARK: - El modo — lo que el cuerpo puede hacer, que manda sobre el formato

    /// Trabajando, los cuatro son `ciego`: en los casos reales la muñeca está
    /// ocupada (la que apoya en la plancha, las dos en el trineo, las dos en el
    /// suelo en un burpee). Un reloj que en ese momento pide algo está mal
    /// diseñado por definición.
    ///
    /// `steady` es la excepción: una movilidad se hace mirando al frente y con
    /// las manos libres, así que es `ojeada` de principio a fin.
    ///
    /// En la parada de un intervalo o de una tabata es `ojeada` y NO `mando`: no
    /// hay ninguna decisión que tomar — el reloj arranca la ronda siguiente él
    /// solo, y adelantarla rompería el on/off que escribió el coach.
    static func modoDe(_ e: Estado) -> WatchModo {
        switch e.formato {
        case .steady: return .ojeada
        case .deathBy: return e.fallado ? .mando : .ciego
        case .intervals, .tabata: return e.enDescanso ? .ojeada : .ciego
        }
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        let principal: WatchPagina
        switch e.formato {
        case .intervals: principal = paginaIntervals(e)
        case .tabata:    principal = paginaTabata(e)
        case .deathBy:   principal = paginaDeathBy(e, g)
        case .steady:    principal = paginaSteady(e)
        }
        // El pulso hereda el modo DEL MOMENTO: si estás en el suelo no puedes
        // mirar, estés en la página que estés.
        guard let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zonaViva, modo: modoDe(e)) else {
            return [principal]
        }
        return [principal, pulso]
    }

    /// (a) `intervals` — N repeticiones de trabajo/descanso CON LA MISMA DOSIS.
    ///
    /// El sujeto es la cuenta atrás del tramo en el que estás; el aro segmentado
    /// contesta «cuántos me faltan» sin gastar una línea de texto.
    ///
    /// Dos decisiones que lo separan del EMOM, y las dos salen de que aquí la
    /// dosis NO ROTA: el segundo nivel no es el movimiento —ya te lo sabes desde
    /// la primera ronda—, es el OBJETIVO (RPE, ritmo…) si el coach escribió uno;
    /// y en la parada no se dice qué viene, porque viene LO MISMO.
    private static func paginaIntervals(_ e: Estado) -> WatchPagina {
        let total = e.totalRondas ?? e.rondaActual
        let ultima = e.rondaActual >= total
        let contexto: String
        if e.enDescanso {
            contexto = ultima ? "Para · se acabó" : "Para · viene la \(e.rondaActual + 1)"
        } else {
            let mov = e.movimiento.map { "\($0) · " } ?? ""
            contexto = "\(mov)\(e.rondaActual) / \(total)"
        }
        // Sólo TRABAJANDO: en la parada no hay esfuerzo contra el que medirse.
        let objetivo = e.enDescanso ? nil : e.objetivo
        return WatchPagina(
            id: "intervalo",
            contexto: contexto,
            modo: modoDe(e),
            sujeto: WatchFormat.countdown(e.quedaS),
            tono: WatchTinte.urgente(e.quedaS),
            segundoValor: objetivo,
            // Va con nota porque no lo mide nadie —lo escribió el coach y lo
            // pones tú—; la cuenta atrás sí es del reloj y no la necesita.
            nota: objetivo != nil ? WatchNota.loDicesTu : nil
        )
    }

    /// (b) `tabata` — 20/10 × 8. Y NO es un intervalo rápido: es otro sujeto.
    ///
    /// En ventanas de 20 y 10 s la cifra no sirve para nada: no hay ninguna
    /// decisión que cambie sabiendo que quedan 14 en vez de 12, y en los 10 del
    /// descanso, para cuando enfocas el número el descanso se ha acabado. Lo que
    /// sí se usa, cada tres segundos, es el ESTADO — trabajas o paras — y eso
    /// viaja por el color del lienzo, el destello del cambio y una palabra en el
    /// contexto: ninguno de los tres pide enfocar la vista.
    ///
    /// El sujeto se lo lleva lo único que dura los cuatro minutos: EN QUÉ RONDA
    /// VAS. El latido en el numeral es la confirmación de que la ronda cambió,
    /// sin pedir que se lea el número.
    ///
    /// A propósito NO cuenta repeticiones: el motor guarda el mínimo de las
    /// rondas contadas porque un conteo a mitad de burpee es una cota inferior,
    /// no una puntuación — y en la muñeca esa cota con cara de marca sería la
    /// misma mentira.
    private static func paginaTabata(_ e: Estado) -> WatchPagina {
        let ultima = (e.totalRondas.map { e.rondaActual >= $0 }) ?? false
        return WatchPagina(
            id: "tabata",
            // Una palabra: es lo único que un tabata te pide leer.
            contexto: e.enDescanso ? (ultima ? "Para · se acabó" : "Para") : "Trabaja",
            modo: modoDe(e),
            sujeto: "\(e.rondaActual)",
            segundoValor: e.totalRondas.map { "de \($0) rondas" },
            latido: e.rondaActual
        )
    }

    /// (c) `death_by` — el minuto N pide N repeticiones.
    ///
    /// Las repeticiones DE ESTE MINUTO son el dato que define el formato: aquí
    /// son el sujeto, con latido — que suban de golpe al entrar el minuto ES el
    /// formato hablando.
    ///
    /// La acción es la única de toda la familia: «Al fallar · toca». «Lo logré»
    /// no se ofrece porque el minuto que se cumple solo ya cuenta como logrado
    /// (el motor avanza él mismo); el fallo, en cambio, sólo lo sabe el atleta y
    /// es lo único que puede acabar el bloque desde la muñeca. Va atenuada
    /// porque el modo es `ciego`: una oferta en reposo, jamás una petición
    /// mientras estás en el suelo.
    private static func paginaDeathBy(_ e: Estado, _ g: Gestos) -> WatchPagina {
        if e.fallado {
            let superadas = e.rondasSuperadas ?? max(0, e.rondaActual - 1)
            return WatchPagina(
                id: "muerto",
                contexto: "Se acabó · minuto \(e.rondaActual)",
                modo: .mando,
                sujeto: "\(superadas)",
                segundoValor: "rondas superadas"
            )
        }
        let reps = e.repsDelMinuto ?? 0
        return WatchPagina(
            id: "minuto",
            contexto: "Minuto \(e.rondaActual)",
            modo: modoDe(e),
            // La unidad pegada al numeral: sin ella un «7» sobre «Minuto 7» es
            // ambiguo.
            sujeto: "\(reps)",
            unidad: "reps",
            segundoEtiqueta: "Queda",
            segundoValor: WatchFormat.countdown(e.quedaS),
            segundoTono: WatchTinte.urgente(e.quedaS),
            accion: "Al fallar · toca",
            onToca: g.rendirse,
            // Las repeticiones salen del protocolo que escribió el coach, no de
            // nada que el reloj mida.
            nota: WatchNota.loDicesTu,
            latido: reps
        )
    }

    /// (d) `steady` funcional — una sola ventana larga, sin trocear.
    ///
    /// La pantalla más corta de las cuatro, y a propósito: hay UNA cosa que
    /// saber y la pantalla entera es esa cosa. Ni segundo nivel (no existe un
    /// segundo dato), ni acción (la ventana se agota sola), ni nota (el crono es
    /// del reloj). El movimiento se va a la banda de contexto, que es donde
    /// cuesta cero.
    private static func paginaSteady(_ e: Estado) -> WatchPagina {
        WatchPagina(
            id: "ventana",
            contexto: e.quedaS > 0 ? (e.movimiento ?? "Continuo") : "Se acabó",
            modo: modoDe(e),
            sujeto: WatchFormat.countdown(e.quedaS),
            tono: WatchTinte.urgente(e.quedaS)
        )
    }
}
