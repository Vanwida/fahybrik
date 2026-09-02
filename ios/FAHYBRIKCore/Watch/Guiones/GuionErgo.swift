import SwiftUI

// (4) ERGO — el reloj no ve el monitor, y encima es el peor sitio para leer.
// Port del guion del doble (`web/components/design-twin/screens/watch-ergo/guion.ts`).
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. El `/500`, los metros, la potencia y las paladas los mide el PM5,
// los lee el móvil por BLE y al reloj llegan REPETIDOS: se pintan marcados `del
// móvil` y jamás con cara de medida propia. Sin monitor emparejado no llega
// ninguno de los cuatro, y entonces en la muñeca queda lo que el reloj tiene
// suyo — el pulso y el crono.
//
// De la ejecución 179 (remo, atleta 64) sale además el recordatorio de que ni
// siquiera lo que se guarda es lo prescrito: la plantilla dice «5×500 m» y lo
// capturado fueron 1.014,30 m en 392 s con UN solo split explícito, porque las
// dos primeras repeticiones llegaron fundidas.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Remando: mirar sin tocar (`ojeada`), y es la peor lectura de toda la app —
// el brazo describe un arco de medio metro cada dos segundos, así que lo que no
// se lea de un vistazo no se lee. Un dato gigante por página y cero controles
// anunciados. Con PM5 no hace falta ni el gesto: los 500 m los cierra la
// máquina. Sin PM5 el gesto existe (sin anunciarse) porque la serie no la puede
// cerrar nadie más que el atleta.
//
// En el descanso —120 s prescritos— estás sentado en el asiento con las manos
// libres: `mando`. Ahí van la cuenta atrás, lo que viene y el único control a
// plena luz. Un descanso de ergo SIEMPRE lo cierra el reloj (no hay recuperación
// abierta que justificar, a diferencia de la calle en `GuionSeries`).
//
// ── EL SUJETO SON DOS COSAS, Y EN LA MUÑECA DOS COSAS SON DOS PÁGINAS ──────
// El handoff pide «lo que queda + tu FC». Eso no cabe en un sujeto y no se
// encoge para que quepa: página 1 lo que falta de la serie, página 2 tu pulso,
// página 3 el `/500`. El ritmo se escribe por 500 m, no por km — es la unidad
// que lee el remero, no la de la calle.
//
// ── POR QUÉ `Estado` NO LLEVA `fase` + `t` COMO EL DOBLE ───────────────────
// El doble simula: guarda `hechosM`/`t` y calcula la FC con una rampa para poder
// rebobinar un mockup. Aquí no hay nada que rebobinar — el motor YA sabe el
// pulso y los metros hechos en cada tick, así que `Estado` los recibe resueltos
// (igual que `GuionSeries`). La única rampa que sobrevive vive en `CASOS`, para
// fabricar números de fixture con la misma aritmética que el doble, y no forma
// parte de la API del guion.
//
// ── DONDE ESTO ME CHIRRÍA, Y LO DEJO ESCRITO EN VEZ DE ARREGLARLO SOLO ─────
// Remando, el monitor del PM5 está a treinta centímetros de la cara y ya canta
// los metros, el `/500`, los vatios y las paladas. Lo ÚNICO que ese monitor no
// enseña es tu pulso (salvo que le hayas emparejado una banda, que casi nadie
// hace). Así que las páginas 1 y 3 de esta vista duplican lo que el atleta ya
// tiene delante, y la 2 es la que aporta algo que no está en ningún otro sitio.
// Mi lectura: con PM5 emparejado, la página 1 debería ser el pulso y los metros
// caer a la 2 — la muñeca complementa la máquina, no la repite. Los metros
// siguen mereciendo su página porque son la prueba de que la app y la máquina
// van al mismo compás (y de que la serie se cerrará sola donde toca), pero eso
// se comprueba una vez, no de un vistazo cada dos paladas. Respeto el orden del
// handoff y no lo cambio por mi cuenta; queda dicho aquí y en el informe.
//
// ── Y UNA COSA QUE NO ESTÁ, POR MUCHO QUE LA PIDA EL LAYOUT ────────────────
// «El /500 CONTRA EL OBJETIVO» no se puede pintar: casi ningún bloque de ergo
// prescribe un ritmo objetivo, sólo la distancia, y sin ese dato en la base no
// hay nada que comparar. Inventar un ritmo de referencia sería exactamente el
// valor por defecto con cara de dato que prohíbe el §7. La página 3 pinta tu
// ritmo y calla lo que no sabe.

enum GuionErgo {

    enum Fase: Equatable { case remando, descanso }

    struct Estado {
        var fase: Fase
        /// La serie en curso. Durante el descanso, la que VIENE.
        var serie: Int
        var totalSeries: Int
        /// La prescripción del tramo, en metros («500 m»). Fija por plantilla:
        /// sirve para «cuánto falta» remando y para «lo que viene» en descanso.
        var tramoM: Double
        /// ¿El móvil tiene el PM5 emparejado y leyendo? Sin él no llegan
        /// metros, ni `/500`, ni potencia, ni paladas — sólo lo que el reloj
        /// mide por su cuenta (pulso y tiempo).
        var maquina: Bool
        /// Metros remados DENTRO del tramo, según el PM5. Sólo lo sabe la
        /// máquina: `nil` sin PM5 emparejado.
        var hechosM: Double?
        /// El ritmo medido de ESTE tramo, en s/500 m — por 500, no por km, que
        /// es como lo lee un remero. Lo repite el móvil desde el PM5; `nil`
        /// sin máquina o mientras el tramo no cierra su primer split.
        var ritmoSec500: Int?
        /// Segundos dentro de la fase actual (remando o descanso).
        var segundosEnFase: Double
        /// Lo que queda del descanso, ya resuelto por el motor. Sólo aplica en
        /// `.descanso`: el descanso de un ergo SIEMPRE lo cierra el reloj, así
        /// que aquí no hay un "descanso abierto" que degradar a crono libre.
        var quedaDescansoS: Double?
        var zonaViva: HRZone?
        var bpm: Int?
        /// Nombre del movimiento («SkiErg», «Remo»). El contexto lo pinta;
        /// no se fabrica «Remo» para un ski. Al final, con defecto, para que
        /// `CASOS` y el escaparate sigan compilando.
        var etiqueta: String = "Ergo"
        /// La pieza se mide en calorías, no en metros. Misma pareja que el cable
        /// (`objetivoEsCalorias`): 12 cal no se pinta como metros.
        var esCalorias: Bool = false
    }

    struct Gestos {
        /// Cerrar la serie. Sin PM5 emparejado es la única forma de cerrarla.
        var cerrarSerie: (() -> Void)?
        /// Adelantar el descanso y volver al asiento.
        var empezarYa: (() -> Void)?

        init(cerrarSerie: (() -> Void)? = nil, empezarYa: (() -> Void)? = nil) {
            self.cerrarSerie = cerrarSerie
            self.empezarYa = empezarYa
        }
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        let modo: WatchModo = e.fase == .descanso ? .mando : .ojeada
        let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zonaViva, modo: modo)
        let resto = [pulso].compactMap { $0 }

        if e.fase == .descanso {
            return [paginaDescanso(e, g)] + resto
        }

        // Sin máquina, o sin objetivo de m/cal (un 2 min): pulso y crono.
        // No se fabrica un 0/0 con cara de metros.
        if !e.maquina || e.tramoM <= 0 {
            return paginasSinMaquina(e, g, pulso: pulso)
        }

        return [paginaProgreso(e)] + resto + [paginaRitmo(e)].compactMap { $0 }
    }

    // MARK: - Descanso

    private static func paginaDescanso(_ e: Estado, _ g: Gestos) -> WatchPagina {
        let queda = e.quedaDescansoS ?? 0
        return WatchPagina(
            id: "descanso",
            contexto: "Descanso · viene la \(e.serie)",
            // Sentado, manos libres, mirando el reloj. Aquí SÍ se decide.
            modo: .mando,
            sujeto: WatchFormat.countdown(queda),
            tono: WatchTinte.urgente(queda),
            segundoEtiqueta: "Luego",
            segundoValor: e.esCalorias
                ? "\(Int(e.tramoM.rounded())) cal"
                : WatchDistancia.completa(e.tramoM),
            accion: "Toca · empezar ya",
            onToca: g.empezarYa
        )
    }

    // MARK: - Remando, sin PM5 — EL MÍNIMO

    /// Sin PM5 emparejado no hay metros, ni `/500`, ni potencia, ni paladas: se
    /// caen DOS de las tres páginas de la vista. Y entonces la primera es
    /// necesariamente tu pulso (o, si no hay pulso, el tiempo), porque es lo
    /// único que queda que no venga de una máquina que no está.
    private static func paginasSinMaquina(_ e: Estado, _ g: Gestos, pulso: WatchPagina?) -> [WatchPagina] {
        let tiempo = WatchPaginasComunes.tiempo(
            segundos: e.segundosEnFase,
            contexto: "\(e.etiqueta) · en la serie",
            nota: WatchNota.sinMaquina,
            modo: .ojeada
        )
        // El gesto no se anuncia (`ojeada` no pinta franja) pero existe, y va
        // en la PRIMERA página, que es la que el atleta tiene delante: sin
        // metros que canten el final, la serie la cierra él.
        var primera = pulso ?? tiempo
        primera.accion = "Toca al acabar la serie"
        primera.onToca = g.cerrarSerie
        return pulso != nil ? [primera, tiempo] : [primera]
    }

    // MARK: - Remando, con PM5 — actuales / objetivo y tu ritmo

    private static func paginaProgreso(_ e: Estado) -> WatchPagina {
        let hechos = Int((e.hechosM ?? 0).rounded())
        let objetivo = Int(e.tramoM.rounded())
        return WatchPagina(
            id: "trabajo",
            contexto: e.etiqueta,
            modo: .ojeada,
            // Canónico §2: «187 de 400», no una barra (esa ya es /km y /500m).
            sujeto: Formato.trabajo(hecho: hechos, objetivo: objetivo),
            unidad: e.esCalorias ? "cal" : "m",
            // La serie que va cabe aquí sin costarle un punto al numeral, y sin
            // ella un «187 de 400» a secas no dice si es la primera o la última.
            segundoEtiqueta: "Serie",
            segundoValor: "\(e.serie) de \(e.totalSeries)",
            nota: WatchNota.delMovil
        )
    }

    /// `nil` sin split medido — no se fabrica un ritmo antes de que exista, y
    /// tampoco se pinta un objetivo: ver la cabecera, no hay ritmo prescrito
    /// que comparar en la base.
    private static func paginaRitmo(_ e: Estado) -> WatchPagina? {
        guard let ritmo = e.ritmoSec500 else { return nil }
        return WatchPagina(
            id: "ritmo",
            contexto: "\(e.etiqueta) · tu ritmo",
            modo: .ojeada,
            sujeto: WatchFormat.pace(ritmo),
            segundoValor: "/500 m",
            nota: WatchNota.delMovil
        )
    }

    // MARK: - El motor EN SOLITARIO → Estado
    //
    // El mismo papel que `GuionDelEspejo.ergo` hace para el cable. Cero
    // Bluetooth en el reloj: `maquina` solo es cierto si el motor ya tiene
    // `tramoErgDistanceMeters` / `tramoErgCalories` (el iPhone los escribió
    // vía `sampleErg`). Sin iPhone son nil — pulso y crono, no un contador
    // nuevo ni los metros de carrera.
    static func estadoSolitario(_ session: WorkoutSession) -> Estado {
        let tramo = session.currentTramo
        let esCalorias = (tramo.targetCalories ?? 0) > 0
        let objetivo: Double
        let hechos: Double?
        if esCalorias {
            objetivo = Double(tramo.targetCalories ?? 0)
            hechos = session.tramoErgCalories.map { Double($0) }
        } else {
            objetivo = tramo.targetDistanceMeters ?? 0
            hechos = session.tramoErgDistanceMeters
        }
        return Estado(
            fase: session.isTramoResting ? .descanso : .remando,
            serie: session.tramoRoundIndex + 1,
            totalSeries: max(1, session.tramoRoundTotal),
            tramoM: objetivo,
            maquina: hechos != nil,
            hechosM: hechos,
            ritmoSec500: nil,
            segundosEnFase: session.tramoElapsedSeconds,
            quedaDescansoS: session.isTramoResting ? session.tramoRestRemaining : nil,
            zonaViva: session.liveZone,
            bpm: session.liveHRBpm,
            etiqueta: tramo.label,
            esCalorias: esCalorias
        )
    }

    static func gestosSolitario(_ session: WorkoutSession) -> Gestos {
        Gestos(
            cerrarSerie: { session.primaryAdvance() },
            empezarYa: { session.primaryAdvance() }
        )
    }
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — ejecución 179 · asignación 359 ·
// atleta 64 (plantilla 507, «Remo · 5×500 m»). Mismos casos que el doble.
// ---------------------------------------------------------------------------

extension GuionErgo {

    /// Rampa lineal saturada — SÓLO para fabricar los números de `CASOS` con la
    /// misma aritmética que `datos-reloj.ts`. No es parte de la API del guion:
    /// `Estado` recibe siempre datos ya resueltos (ver cabecera).
    private static func rampaFC(_ desde: Int, _ hasta: Int, _ t: Double, _ duracionS: Double) -> Int {
        guard duracionS > 0 else { return hasta }
        let k = min(1, max(0, t / duracionS))
        return Int((Double(desde) + Double(hasta - desde) * k).rounded())
    }

    /// FC media 133, máxima 162. La rampa remando dura 90 s (fijo, como en el
    /// doble); la del descanso, los 120 s prescritos.
    private static let fcDesde = 133
    private static let fcHasta = 162
    private static let descansoS: Double = 120

    /// 286 m a 500 m/119,2 s ≈ 68 s dentro del tramo — el punto de reproducción
    /// del doble, mitad de la pieza.
    private static let desdeS: Double = 68

    static let CASOS: [(nombre: String, estado: Estado)] = [
        (
            "sin PM5 · remando",
            Estado(
                fase: .remando, serie: 3, totalSeries: 5, tramoM: 500,
                maquina: false, hechosM: nil, ritmoSec500: nil,
                segundosEnFase: desdeS, quedaDescansoS: nil,
                zonaViva: nil, bpm: rampaFC(fcDesde, fcHasta, desdeS, 90)
            )
        ),
        (
            "sin PM5 · descanso",
            Estado(
                fase: .descanso, serie: 4, totalSeries: 5, tramoM: 500,
                maquina: false, hechosM: nil, ritmoSec500: nil,
                segundosEnFase: 8, quedaDescansoS: max(0, descansoS - 8),
                zonaViva: nil, bpm: rampaFC(fcHasta, fcDesde, 8, descansoS)
            )
        ),
        (
            "con PM5 · a mitad",
            Estado(
                fase: .remando, serie: 3, totalSeries: 5, tramoM: 500,
                maquina: true, hechosM: 286, ritmoSec500: 119,
                segundosEnFase: desdeS, quedaDescansoS: nil,
                zonaViva: nil, bpm: rampaFC(fcDesde, fcHasta, desdeS, 90)
            )
        ),
        // El arranque de la serie: «500 m» de tres glifos, el caso más ancho.
        (
            "con PM5 · arranque",
            Estado(
                fase: .remando, serie: 3, totalSeries: 5, tramoM: 500,
                maquina: true, hechosM: 0, ritmoSec500: 119,
                segundosEnFase: 0, quedaDescansoS: nil,
                zonaViva: nil, bpm: rampaFC(fcDesde, fcHasta, 0, 90)
            )
        ),
        // Y los últimos metros, cuando el numeral crece solo hasta su techo.
        (
            "con PM5 · últimos metros",
            Estado(
                fase: .remando, serie: 3, totalSeries: 5, tramoM: 500,
                maquina: true, hechosM: 496, ritmoSec500: 119,
                segundosEnFase: 118, quedaDescansoS: nil,
                zonaViva: nil, bpm: rampaFC(fcDesde, fcHasta, 118, 90)
            )
        ),
        // El día que un test escriba un umbral: aparecen la zona y el lienzo
        // teñido. Umbral 168 ppm medido, bpm≈155 → Z3 (158 es el techo de Z3
        // a este umbral: 168×0,94).
        (
            "con PM5 · con umbral",
            Estado(
                fase: .remando, serie: 3, totalSeries: 5, tramoM: 500,
                maquina: true, hechosM: 286, ritmoSec500: 119,
                segundosEnFase: desdeS, quedaDescansoS: nil,
                zonaViva: .z3, bpm: rampaFC(fcDesde, fcHasta, desdeS, 90)
            )
        ),
        // El último segundo del descanso, que es cuando el numeral es más
        // grande y cuando el naranja de aviso aparece.
        (
            "descanso · último segundo",
            Estado(
                fase: .descanso, serie: 4, totalSeries: 5, tramoM: 500,
                maquina: true, hechosM: 0, ritmoSec500: 119,
                segundosEnFase: descansoS - 1, quedaDescansoS: max(0, descansoS - (descansoS - 1)),
                zonaViva: nil, bpm: rampaFC(fcHasta, fcDesde, descansoS - 1, descansoS)
            )
        ),
    ]
}
