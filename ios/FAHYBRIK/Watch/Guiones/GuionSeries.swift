import SwiftUI

// (2) SERIES DE CALLE — la vista donde el modo cambia dos veces por serie. Port
// del guion del doble (`web/components/design-twin/screens/watch-series/`).
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Todo lo suyo, igual que el rodaje: pulso, ritmo y distancia por GPS. Nada
// repetido y nada declarado… salvo UNA cosa, y de ahí sale la vista entera:
// CUÁNDO SE ACABA LA SERIE.
//
// Las cinco repeticiones medidas de la ejecución 104 salieron 1600 · 1176 · 1200
// · 1220 · 950 m. Cinco tramos que deberían medir lo mismo y salen entre 950 y
// 1600 no los cerró un hito — los cerró el atleta. Así que el reloj sólo sabe
// cuánto falta cuando el coach escribió el tramo, y por eso hay tres formas de
// serie y no una.
//
// ── LAS TRES FORMAS, Y EL DATO REAL QUE OBLIGA A LA TERCERA ────────────────
//
//   · POR DISTANCIA (`3x1000m`, plantilla 314) → el hito cierra. El sujeto son
//     LOS METROS QUE FALTAN y drenan hacia cero: corriendo, la única pregunta es
//     cuánto me queda.
//   · POR TIEMPO (`5x(5' Z4 / 1' Z2)`, plantilla 318 — el fartlek) → el reloj
//     cierra. El sujeto es la CUENTA ATRÁS del tramo. El doble no cubría esta
//     forma y en la biblioteca es la mitad de las series de correr: un fartlek
//     no tiene metros que prometer, tiene minutos.
//   · ABIERTA → no la cierra nadie más que tú. La pregunta «cuánto falta» NO
//     TIENE RESPUESTA, y fabricarla sería inventar la mitad de una prescripción
//     que el coach no escribió (§7). Lo único que el reloj sabe son los metros
//     que LLEVAS, y crecen. El sujeto no cambia de tamaño ni de sitio: cambia de
//     sentido, y aparece el toque para cerrar.
//
// ── QUÉ PUEDE HACER EL ATLETA, Y AQUÍ ESTÁ EL GIRO ─────────────────────────
// Dentro de la serie va a tope y con el brazo en movimiento: `ojeada`. Un dato
// gigante y CERO controles anunciados. Esto corrige la vista vieja, que durante
// la serie ofrecía «Toca · serie hecha» a plena luz — le pedía al atleta que
// decidiera mientras esprintaba. El gesto sigue existiendo donde hace falta (en
// la serie abierta, y toda la pantalla es el blanco), pero no se anuncia, y esos
// 15 pt de franja vuelven al numeral.
//
// En la recuperación el atleta está de pie, jadeando y mirando el reloj: `mando`.
// Ahí sí van la cuenta atrás, lo que viene y «empezar ya».
//
// ── POR QUÉ LOS METROS VAN SIN SEPARADOR DE MILLAR ─────────────────────────
// Se escribe `1200`, no `1.200`. El punto es un glifo más y en un lienzo de
// 188 pt eso baja el numeral por debajo del suelo de legibilidad. Y tampoco se
// usa la grafía de kilómetros del rodaje: en un tramo que drena de 1200 a 0 la
// unidad cambiaría sola a mitad de serie, y un numeral que muda de unidad
// mientras lo miras es peor que uno grande.

enum GuionSeries {

    enum Fase: Equatable { case trabajo, recupera }

    /// Cómo se cierra el tramo en curso. Es lo que decide el sujeto.
    enum Cierre: Equatable {
        /// Un hito de distancia: `metros` es el objetivo del tramo.
        case hito(metros: Double)
        /// El reloj: el tramo dura lo que dura.
        case reloj
        /// Sólo el atleta. Nadie más sabe dónde acaba esto.
        case atleta
    }

    struct Estado {
        var fase: Fase
        /// La serie en curso. Durante la recuperación, la que VIENE.
        var serie: Int
        var totalSeries: Int
        var cierre: Cierre
        /// Metros cubiertos DENTRO del tramo. `nil` = el GPS aún no fija.
        var metrosEnTramo: Double?
        /// Lo que queda del tramo o de la recuperación cuando los cierra el reloj.
        var quedaS: Double?
        /// Segundos dentro del tramo, para degradar cuando no hay ni metros.
        var enTramoS: Double
        /// El ritmo medido de ESTE tramo (no el medio del segmento).
        var ritmoSecPorKm: Int?
        /// El objetivo de intensidad prescrito y su veredicto en vivo.
        var objetivo: (label: String, status: TargetStatus)?
        /// Lo que viene después, ya redactado. `nil` = no lo escribió nadie.
        var loQueViene: String?
        var zonaViva: HRZone?
        var bpm: Int?
    }

    struct Gestos {
        /// Cerrar la serie corriendo. Sólo existe cuando no hay hito ni reloj.
        var cerrarSerie: (() -> Void)?
        /// Adelantar la recuperación.
        var empezarYa: (() -> Void)?

        init(cerrarSerie: (() -> Void)? = nil, empezarYa: (() -> Void)? = nil) {
            self.cerrarSerie = cerrarSerie
            self.empezarYa = empezarYa
        }
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        let modo: WatchModo = e.fase == .recupera ? .mando : .ojeada
        let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zonaViva, modo: modo)
        let resto = [pulso].compactMap { $0 }

        if e.fase == .recupera { return [paginaRecupera(e, g)] + resto }
        return [paginaTrabajo(e, g)] + resto
    }

    // MARK: - Trabajo

    private static func paginaTrabajo(_ e: Estado, _ g: Gestos) -> WatchPagina {
        // Con hito, el sujeto son los metros que FALTAN — y el contexto lo dice,
        // porque «326 m» a secas no distingue llevar de faltar (mismo patrón que
        // «REMO · TE FALTAN» en el ergo del doble).
        let base = "Serie \(e.serie) / \(max(e.totalSeries, e.serie))"
        let contexto = { if case .hito = e.cierre { return base + " · te faltan" } else { return base } }()
        let (sujeto, unidad) = sujetoDeTrabajo(e)
        let (etiqueta, valor, tono) = segundoDeTrabajo(e)
        return WatchPagina(
            id: "serie",
            contexto: contexto,
            // A tope y con el brazo en movimiento: un dato y ni un control anunciado.
            modo: .ojeada,
            sujeto: sujeto,
            unidad: unidad,
            segundoEtiqueta: etiqueta,
            segundoValor: valor,
            segundoTono: tono,
            // EL GESTO EXISTE SÓLO CUANDO NADA MÁS PUEDE CERRAR EL TRAMO. Con hito
            // o con reloj, cerrar solo es lo correcto: con la pantalla entera de
            // blanco y el brazo en movimiento, un toque de más terminaría una
            // serie que iba bien.
            accion: e.cierre == .atleta ? "Toca · serie hecha" : nil,
            onToca: e.cierre == .atleta ? g.cerrarSerie : nil
        )
    }

    /// El sujeto del trabajo, y sus tres sentidos.
    private static func sujetoDeTrabajo(_ e: Estado) -> (String, String?) {
        switch e.cierre {
        case let .hito(metros):
            // Lo que falta se redondea hacia ARRIBA: no se da por acabado un tramo
            // antes de tiempo. Sin GPS todavía no hay resta que hacer, así que se
            // enseña el tramo entero — es lo que falta, literalmente.
            let recorridos = e.metrosEnTramo ?? 0
            let faltan = max(0, metros - recorridos)
            return (String(Int(faltan.rounded(.up))), "m")
        case .reloj:
            // El fartlek: lo que queda del tramo. Si el motor no da el restante
            // (tramo por tiempo sin total), degrada al crono del tramo.
            if let queda = e.quedaS { return (WatchFormat.countdown(queda), nil) }
            return (WatchFormat.clock(e.enTramoS), nil)
        case .atleta:
            // Lo que LLEVAS, hacia abajo: no se apuntan metros sin correr. Sin GPS
            // no hay metros que enseñar y la verdad que queda es el crono.
            guard let metros = e.metrosEnTramo else {
                return (WatchFormat.clock(e.enTramoS), nil)
            }
            return (String(Int(metros.rounded(.down))), "m")
        }
    }

    /// El segundo nivel del trabajo: tu ritmo, medido por el GPS del reloj — y la
    /// etiqueta lo dice. Es el mismo sitio donde una cinta pondría «del móvil» y
    /// una serie a pulso no pondría nada, porque no habría ritmo que enseñar.
    ///
    /// TAL CUAL EL DOBLE, sin veredictos inventados encima: el aviso de ritmo
    /// fuera de banda ya es un HÁPTICO (la muñeca vibra, no sermonea), y esta
    /// línea se queda para el dato. Aquí hubo un «Frena / Aprieta» propio que no
    /// estaba en ningún diseño aprobado — rediseñar lo ya diseñado es el fallo
    /// que motivó revertirlo.
    private static func segundoDeTrabajo(_ e: Estado) -> (String?, String?, Color?) {
        guard let ritmo = e.ritmoSecPorKm else {
            // Sin ritmo medido no se pinta una etiqueta vacía: si hay objetivo
            // prescrito se enseña él solo, que es lo único cierto que hay.
            guard let objetivo = e.objetivo else { return (nil, nil, nil) }
            return ("Objetivo", objetivo.label, nil)
        }
        return ("GPS", "\(WatchFormat.pace(ritmo))\(Formato.UnidadRitmo.porKm.rawValue)", nil)
    }

    // MARK: - Recuperación

    private static func paginaRecupera(_ e: Estado, _ g: Gestos) -> WatchPagina {
        let (sujeto, unidad, tono) = sujetoDeRecuperacion(e)
        return WatchPagina(
            id: "recupera",
            contexto: "Descanso · viene la \(e.serie)",
            // De pie, jadeando, con las manos libres. Aquí SÍ se decide.
            modo: .mando,
            sujeto: sujeto,
            unidad: unidad,
            tono: tono ?? WatchTheme.ink,
            // Lo que viene sólo se puede anunciar si el coach lo escribió. Sin
            // tramo prescrito no se pinta «— m» ni un 0: la cuenta de series ya
            // la lleva el contexto y el resto no lo sabe nadie.
            segundoEtiqueta: e.loQueViene == nil ? nil : "Luego",
            segundoValor: e.loQueViene,
            accion: "Toca · ya",
            onToca: g.empezarYa
        )
    }

    private static func sujetoDeRecuperacion(_ e: Estado) -> (String, String?, Color?) {
        if case let .hito(metros) = e.cierre {
            // Recuperación por distancia (trote de 200 m): mismos metros que faltan.
            let faltan = max(0, metros - (e.metrosEnTramo ?? 0))
            return (String(Int(faltan.rounded(.up))), "m", nil)
        }
        if let queda = e.quedaS {
            return (WatchFormat.countdown(queda), nil, WatchTinte.urgente(queda))
        }
        // Recuperación abierta: el crono corre hacia arriba y la cierras tú.
        return (WatchFormat.clock(e.enTramoS), nil, nil)
    }
}
