import SwiftUI

// (6) EMOM — manda el reloj de pared, y el MODO cambia de ronda a ronda sin que
// cambie el formato. Es la vista que mejor demuestra que el modo va por delante.
// Port del guion del doble (`web/components/design-twin/screens/watch-emom/guion.ts`).
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. Y aquí se nota más que en ninguna otra vista, porque el dato real
// que hay detrás (ejecución 177) es UNA SOLA fila agregada: la modalidad en
// «other», el ski y la bici sin separar, y ni pulso por ronda ni tarea por ronda
// contados dentro del minuto. Sólo el agregado de toda la sesión y el contador
// de rondas completadas.
//
// De ahí sale la regla que ordena la vista entera: **el «10 de 12 cal» que pide
// el §10.6 no sale de la ejecución.** O lo repite el móvil desde la máquina
// emparejada, en vivo, o no existe. Y ni siquiera con la máquina delante sale el
// «de 12»: la plantilla prescribe 45 s de ski, no una dosis de calorías, así que
// lo único que la muñeca puede contar es LO QUE LLEVAS. El objetivo contra el
// que compararlo no lo escribió nadie, y fabricarlo sería inventarme la otra
// mitad.
//
// El contraste entre «con ergo» y «sin ergo» es justo eso: con ergo emparejado,
// «0 m» al empezar la ronda es legítimo (un CONTADOR se pinta en cero, §6.2
// bis); sin ergo emparejado no hay un contador a cero — no hay contador, y la
// tarea se pinta como la escribió el coach.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Los tres modos en la MISMA vista, cambiando de ronda a ronda:
//
//   · ronda de ski o de bici → `.ojeada`. Las manos están ocupadas pero el
//     cuerpo va estable: puedes echar un vistazo, no puedes ponerte a pulsar.
//   · ronda de burpees       → `.ciego`. Estás en el suelo. Ni miras ni tocas.
//   · los segundos de parada → `.mando`. De pie, mirando el reloj, decidiendo
//     si te da tiempo a beber.
//
// Mismo formato, tres pantallas distintas. Lo que las separa no es el EMOM: es
// lo que el cuerpo del atleta puede hacer en ese momento. Por eso el modo de la
// ronda de trabajo lo trae la TAREA (`ModoRonda`, nunca `.mando`: eso lo decide
// sólo la parada) y el guion no lo adivina.
//
// Sobre la acción «hecha»: el atleta acaba las calorías y EN ESE INSTANTE para
// y sí puede tocar. Por eso la página de trabajo declara `accion` aunque esté
// en `.ojeada` — el lienzo no la anuncia (esos 15 pt son del sujeto, corriendo
// no se lee una etiqueta), pero el gesto existe: toda la pantalla es el blanco
// y no hay que apuntar a nada.
//
// ── EL SUJETO: EL MINUTO DRENANDO ──────────────────────────────────────────
// Y no cambia al marcar la tarea. Lo que cambia es el TINTE del lienzo — pasa a
// verde y el mismo número se lee como «lo que te queda de respiro». Un dato,
// dos significados, cero pantallas nuevas. El tinte lo decide la VISTA que
// llame a este guion (igual que en `GuionSeries`, el «verde» de la recuperación
// no lo calcula el guion, lo calcula quien conoce la fase completa del motor);
// aquí sólo se deja `Fase`/`quedaDe` públicos para que esa vista pueda armarlo.
//
// El aro, en cambio, lleva la VENTANA ENTERA de un tirón, cruzando trabajo y
// parada, porque la ventana no se para porque tú acabes antes. El número dice
// en qué tramo estás; el aro dice cuánto le queda al minuto — lo dibuja la
// vista, no el guion, pero `Estado` lleva `ventanaS` y `enVentanaS` para que
// pueda hacerlo.
//
// ── LO QUE NO SE PORTA, Y POR QUÉ ──────────────────────────────────────────
// La fuente TS simula el pulso con una rampa (`bpmDe`/`rampa`) y los metros del
// ergo con un ritmo tomado de un único split real (`RITMO_ERGO_MS`), porque el
// doble no tiene sensor ni BLE detrás: fabrica una curva creíble para poder
// enseñar la pantalla. En Swift no hace falta fabricar nada — el motor en vivo
// (HealthKit + el móvil por BLE) YA da `bpm`, `zonaViva` y `metrosMaquina` como
// valores reales, igual que hacen `GuionSeries.Estado` y `GuionRodaje.Estado`
// con los suyos — así que `Estado` los recibe resueltos y el guion no simula
// nada. La fórmula del ritmo del ergo sólo reaparece, comentada como tal, en
// `CASOS` de aquí abajo: para dar a los tests un número de metros creíble donde
// la base de datos no tiene ninguno que citar.

enum GuionEmom {

    // MARK: - La tarea de una ronda

    /// El modo restringido de una ronda de trabajo. Nunca `.mando`: la parada
    /// es la única fase que decide eso, y la decide el guion — no la tarea.
    enum ModoRonda: Equatable {
        case ciego, ojeada

        var comoModo: WatchModo {
            switch self {
            case .ciego: return .ciego
            case .ojeada: return .ojeada
            }
        }
    }

    /// Una tarea de ronda, tal y como la escribió el coach.
    struct TareaEmom {
        /// Cómo la escribió el coach: «Ski 45 s», «10 burpees».
        let texto: String
        /// ¿Puede mirar el reloj mientras la hace? De aquí sale la pantalla
        /// entera de la ronda de trabajo.
        let modo: ModoRonda
        /// La máquina de la ronda. `nil` = a pulso, y entonces no hay nada
        /// que contar.
        let ergo: String?
    }

    /// El tramo en el que está la ronda. Sólo dos: no hay «entre rondas» que
    /// no sea o trabajo o parada.
    enum Fase: Equatable { case trabajo, parada }

    // MARK: - El estado

    struct Estado {
        /// Rondas totales del EMOM.
        var rondas: Int
        /// Ronda en curso, desde 1. La avanza el reloj de pared, nunca el
        /// atleta.
        var ronda: Int
        /// La ventana entera de una ronda (trabajo + parada). Es lo que lleva
        /// el aro de un tirón, cruzando los dos tramos — la vista lo dibuja,
        /// el guion sólo da el número.
        var ventanaS: Double
        /// Lo que dura el trabajo. Igual a la ventana cuando el coach no
        /// separa parada (el EMOM a pulso: el respiro es lo que sobre del
        /// minuto, no un tramo prescrito aparte).
        var trabajoS: Double
        /// Las tareas, alternas por ronda: ronda 1 → `tareas[0]`, ronda 2 →
        /// `tareas[1]`, ronda 3 → `tareas[0]`…
        var tareas: [TareaEmom]
        /// Segundos dentro de la ventana de ESTA ronda, de 0 a `ventanaS`. Es
        /// el reloj de pared real del motor — no un `t` de reproducción.
        var enVentanaS: Double
        /// Segundo (dentro de la ventana) en que el atleta marcó la tarea.
        /// `nil` = aún no la ha marcado.
        var hechaEnS: Double?
        /// ¿Hay ergo emparejado AL MÓVIL? El reloj no ve la máquina jamás.
        var maquina: Bool
        /// Los metros que lleva la máquina EN ESTA RONDA, ya leídos del móvil
        /// y ya congelados si la tarea está marcada (soltar la máquina deja
        /// de sumar). `nil` = no hay ergo emparejado o la tarea es a pulso: no
        /// se pinta un contador a cero, se pinta la tarea como la escribió el
        /// coach. `0` al arrancar la ronda con ergo emparejado SÍ es
        /// legítimo — es un contador que empieza en cero, no un dato que
        /// falta.
        var metrosMaquina: Double?
        var bpm: Int?
        /// `nil` = sin ancla de FC → sin zona y sin tinte (el color es un
        /// dato, no una decoración).
        var zonaViva: HRZone?
    }

    struct Gestos {
        /// Marcar la tarea de la ronda. Se toca al parar, nunca mientras
        /// trabajas — por eso sólo existe mientras `hechaEnS` es `nil`.
        var marcarHecha: (() -> Void)?

        init(marcarHecha: (() -> Void)? = nil) {
            self.marcarHecha = marcarHecha
        }
    }

    // MARK: - Derivados del estado

    private static func tareaEn(_ e: Estado, ronda: Int) -> TareaEmom {
        e.tareas[(ronda - 1) % e.tareas.count]
    }

    static func tareaDe(_ e: Estado) -> TareaEmom { tareaEn(e, ronda: e.ronda) }

    static func faseDe(_ e: Estado) -> Fase {
        e.enVentanaS < e.trabajoS ? .trabajo : .parada
    }

    /// Lo que queda del TRAMO en el que estás — no de la ventana entera: eso
    /// lo lleva el aro, y lo dibuja la vista.
    static func quedaDe(_ e: Estado) -> Double {
        let fin = faseDe(e) == .trabajo ? e.trabajoS : e.ventanaS
        return max(0, fin - e.enVentanaS)
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        let fase = faseDe(e)
        // El modo es del MOMENTO, no de la página: si el atleta está en el
        // suelo haciendo burpees no puede mirar, esté en la página que esté.
        // Por eso el pulso hereda el modo de la ronda en vez de quedarse con
        // el `.ojeada` que trae por defecto `WatchPaginasComunes.pulso`.
        let modo: WatchModo = fase == .parada ? .mando : tareaDe(e).modo.comoModo
        let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zonaViva, modo: modo)
        let resto = [pulso].compactMap { $0 }
        let queda = quedaDe(e)

        if fase == .parada {
            let ultima = e.ronda >= e.rondas
            let siguiente = ultima ? nil : tareaEn(e, ronda: e.ronda + 1)
            let pagina = WatchPagina(
                id: "ronda",
                // «Para» y no «Descanso»: en un EMOM estos segundos no son
                // para recuperarse, son para QUITARSE de la máquina antes de
                // que empiece la ronda siguiente. La misma palabra que usa el
                // móvil («Para. Empieza el cambio»), para que el atleta no
                // aprenda dos vocabularios.
                contexto: ultima ? "Para · se acabó" : "Para · viene la \(e.ronda + 1)",
                // De pie, manos libres, mirando el reloj: puede mirar y
                // puede tocar.
                modo: .mando,
                sujeto: WatchFormat.countdown(queda),
                tono: WatchTinte.urgente(queda),
                segundoEtiqueta: siguiente != nil ? "Luego" : nil,
                segundoValor: siguiente?.texto
                // Sin nota: la cuenta atrás del cambio la mide el reloj con
                // su propio crono, y un dato que es suyo no necesita decir
                // de dónde viene.
            )
            return [pagina] + resto
        }

        let tarea = tareaDe(e)
        let (etiqueta, valor) = segundoTrabajo(e, tarea)
        let pagina = WatchPagina(
            id: "ronda",
            contexto: "Ronda \(e.ronda) / \(e.rondas)",
            // El modo lo pone la TAREA, no el formato. Ski y bici, `.ojeada`;
            // burpees, `.ciego`. Es el giro entero de esta vista.
            modo: tarea.modo.comoModo,
            sujeto: WatchFormat.countdown(queda),
            tono: WatchTinte.urgente(queda),
            segundoEtiqueta: etiqueta,
            segundoValor: valor,
            // La oferta desaparece al marcarla: ya no hay nada que cerrar, y
            // el verde del lienzo (que decide la vista, no este guion) dice
            // el resto.
            accion: e.hechaEnS == nil ? "Al acabar · toca" : nil,
            onToca: e.hechaEnS == nil ? g.marcarHecha : nil,
            nota: notaDe(e, tarea)
        )
        return [pagina] + resto
    }

    /// El segundo nivel de una ronda de trabajo, que es EL TRABAJO (§10.6): ni
    /// va en gris de panel aparte ni es secundario. Con ergo emparejado sube a
    /// lo que la máquina lleva contado; sin él, se queda en lo que prescribió
    /// el coach.
    private static func segundoTrabajo(_ e: Estado, _ tarea: TareaEmom) -> (etiqueta: String?, valor: String) {
        guard tarea.ergo != nil, let metros = e.metrosMaquina else {
            return (nil, tarea.texto)
        }
        return (tarea.ergo, "\(WatchDistancia.cifra(metros)) \(WatchDistancia.unidad(metros))")
    }

    /// De dónde sale lo que se está pintando, dicho al pie y sin rodeos.
    private static func notaDe(_ e: Estado, _ tarea: TareaEmom) -> String {
        // A pulso no hay máquina que emparejar: la ronda la declaras tú y ya
        // está.
        guard tarea.ergo != nil else { return WatchNota.loDicesTu }
        return e.maquina ? WatchNota.delMovil : WatchNota.sinMaquina
    }

    // MARK: - Los casos que esta vista puede alcanzar

    /// Los dos movimientos alternos de la ejecución 177 (plantilla 506): ski y
    /// bici, 45 s de trabajo. La parada la escribió el coach (15 s), así que
    /// la ventana son 60 s.
    private static let TAREAS_MAQUINAS: [TareaEmom] = [
        TareaEmom(texto: "Ski 45 s", modo: .ojeada, ergo: "Ski"),
        TareaEmom(texto: "Bici 45 s", modo: .ojeada, ergo: "Bici"),
    ]

    /// Plantilla 462: 10 rondas de 60 s a 10 burpees. El coach no escribió
    /// parada — el respiro es lo que sobre del minuto — así que aquí trabajo y
    /// ventana son lo mismo, y es el único EMOM a pulso que existe.
    private static let TAREAS_BURPEES: [TareaEmom] = [
        TareaEmom(texto: "10 burpees", modo: .ciego, ergo: nil),
    ]

    /// SÓLO para las fixtures de aquí abajo: el ritmo del ÚNICO split de ergo
    /// que hay en toda la base (ejecución 179, remo: 500 m en 119,2 s), para
    /// que los casos «con máquina» enseñen un número creíble y no una cifra
    /// inventada de la nada. La producción NUNCA calcula esto — `Estado`
    /// recibe `metrosMaquina` ya resuelto del móvil por BLE.
    private static func metrosDeFixture(hastaS: Double) -> Double {
        ((500.0 / 119.2) * hastaS).rounded(.down)
    }

    static let CASOS: [(nombre: String, estado: Estado)] = [
        (
            "sin máquina · ski",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 12, hechaEnS: nil, maquina: false, metrosMaquina: nil,
                bpm: nil, zonaViva: nil
            )
        ),
        (
            "con máquina · ski",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 12, hechaEnS: nil, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 12),
                bpm: nil, zonaViva: nil
            )
        ),
        // El arranque de la ronda con ergo: el contador a cero que SÍ es
        // legítimo.
        (
            "con máquina · 0 m",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 0, hechaEnS: nil, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 0),
                bpm: nil, zonaViva: nil
            )
        ),
        // Marcada: el sujeto no cambia, cambia el lienzo — y la oferta
        // desaparece.
        (
            "marcada · respiro",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 38, hechaEnS: 31, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 31),
                bpm: nil, zonaViva: nil
            )
        ),
        (
            "parada · viene la bici",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 47, hechaEnS: nil, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 45),
                bpm: nil, zonaViva: nil
            )
        ),
        // El último segundo del cambio, que es cuando el numeral pesa más.
        (
            "parada · último segundo",
            Estado(
                rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 59, hechaEnS: nil, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 45),
                bpm: nil, zonaViva: nil
            )
        ),
        (
            "parada · última ronda",
            Estado(
                rondas: 20, ronda: 20, ventanaS: 60, trabajoS: 45, tareas: TAREAS_MAQUINAS,
                enVentanaS: 50, hechaEnS: nil, maquina: true, metrosMaquina: metrosDeFixture(hastaS: 45),
                bpm: nil, zonaViva: nil
            )
        ),
        (
            "a pulso · burpees",
            Estado(
                rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 60, tareas: TAREAS_BURPEES,
                enVentanaS: 9, hechaEnS: nil, maquina: false, metrosMaquina: nil,
                bpm: nil, zonaViva: nil
            )
        ),
        // El peor caso de ancho de la vista: el primer segundo de una ventana
        // de 60, que `WatchFormat.countdown` escribe «01:00» — cinco glifos,
        // justo en el suelo.
        (
            "a pulso · primer segundo",
            Estado(
                rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 60, tareas: TAREAS_BURPEES,
                enVentanaS: 0, hechaEnS: nil, maquina: false, metrosMaquina: nil,
                bpm: nil, zonaViva: nil
            )
        ),
    ]
}
