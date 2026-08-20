import SwiftUI

// EL ESPEJO LEE LOS MISMOS GUIONES QUE EL MODO SOLITARIO.
//
// Aquí está la pieza que faltaba. El reloj corre en espejo la inmensa mayoría de
// las sesiones (el móvil es el motor y la muñeca pinta lo que le llega), así que
// mientras el espejo tuviera su propia pantalla, todo el diseño por formato vivía
// en el 10 % de los entrenos y el atleta veía una pantalla genérica en el 90 %.
//
// Lo que cambia: el cable ya no manda tres frases redactadas, manda EL TRAMO
// (`MirrorTramo`). Con eso, este fichero rellena el `Estado` que cada guion pide
// y devuelve exactamente las mismas páginas que pintaría el reloj sin móvil. Una
// pantalla por formato, no dos — y lo que se arregle en un guion se arregla en
// las dos vías a la vez.
//
// Degradación: sin tramo (un móvil viejo, o una trama previa a este cambio) cae
// en la lectura genérica de las frases de siempre. Nunca en blanco.

enum GuionDelEspejo {

    /// Las páginas de la muñeca para esta trama. `elapsed` lo tickea el reloj en
    /// local entre tramas; `bpm` es del sensor de la muñeca, no del móvil.
    static func paginas(
        _ f: MirrorStateFrame,
        bpm: Int?,
        elapsed: Double,
        avanzar: @escaping () -> Void,
        /// Death by: declarar que no llegaste al minuto. Distinto de `avanzar`
        /// (que en este formato marca el minuto como CUMPLIDO) — ver
        /// `MirrorWire.CommandKind.deathByFail`. Sin valor, degrada a `avanzar`
        /// para que un llamante que no lo pase no se quede sin ningún gesto.
        rendirse: (() -> Void)? = nil
    ) -> [WatchPagina] {
        guard let t = f.tramo else { return generico(f, bpm: bpm, elapsed: elapsed, avanzar: avanzar) }

        // El reloj de LA ventana, no el del tramo entero: en un 4×10 `lapElapsed`
        // suma las cuatro series y sus descansos de corrido (f4c7f0e9).
        let enTramo = t.enTramoS ?? elapsed
        switch guionPara(t) {
        case .fuerza:
            return GuionFuerza.paginas(fuerza(t, bpm: bpm, elapsed: enTramo),
                                       GuionFuerza.Gestos(serieHecha: avanzar))
        case .rodaje:
            return GuionRodaje.paginas(rodaje(t, f, bpm: bpm, elapsed: enTramo))
        case .series:
            return GuionSeries.paginas(series(t, bpm: bpm, elapsed: enTramo),
                                       GuionSeries.Gestos(cerrarSerie: avanzar, empezarYa: avanzar))
        case .emom:
            return GuionEmom.paginas(emom(t, bpm: bpm, elapsed: enTramo),
                                     GuionEmom.Gestos(marcarHecha: avanzar))
        case .ruta:
            // `GuionEstaciones.pagina` no lleva el pulso dentro (igual que en
            // `FixedLiveView`, que lo compone fuera del guion): se añade aquí,
            // al mismo nivel que el resto de casos.
            var pagina = [GuionEstaciones.pagina(estacion(t, f, elapsed: enTramo),
                                                  onEstacionHecha: avanzar)]
            if let pulso = WatchPaginasComunes.pulso(bpm: bpm, zone: zona(t.zonaViva), modo: .mando) {
                pagina.append(pulso)
            }
            return pagina
        case .ergo:
            return GuionErgo.paginas(ergo(t, bpm: bpm, elapsed: enTramo),
                                     GuionErgo.Gestos(cerrarSerie: avanzar, empezarYa: avanzar))
        case .relojDePared:
            return GuionRelojDePared.paginas(relojDePared(t, bpm: bpm),
                                             GuionRelojDePared.Gestos(rendirse: rendirse ?? avanzar))
        case .ninguno:
            return generico(f, bpm: bpm, elapsed: elapsed, avanzar: avanzar)
        }
    }

    // MARK: - Qué guion sirve este tramo

    private enum Cual { case fuerza, rodaje, series, emom, ruta, ergo, relojDePared, ninguno }

    /// MANDA LA MODALIDAD, NO EL NOMBRE DEL FORMATO. Y esto no es una preferencia
    /// de estilo: es que las dos fuentes de entreno NO escriben el mismo formato
    /// para la misma cosa.
    ///
    /// Comprobado contra la biblioteca real:
    ///   · «Correr · Series» del constructor libre → `scheme: intervals`
    ///     (`FreeWorkout.swift:108`).
    ///   · Las series de correr del coach (plantilla 314, «3x1000m (1'30\" rest)»)
    ///     → `scheme: SETS`, con la distancia y el descanso dentro de cada set.
    ///   · Y el fartlek de la plantilla 318 → `sets` otra vez, con medida de tiempo.
    ///
    /// Con una regla que empezara por «si el formato es `sets`, es fuerza», las
    /// series de correr del COACH se habrían pintado como una tabla de hierro —
    /// «100 kg» donde tocaban «los metros que faltan». El mismo entreno se vería
    /// distinto según quién lo escribió, que es justo lo que no puede pasar.
    ///
    /// Así que la pregunta correcta no es cómo se llama el formato, es QUÉ MIDE
    /// esto: la modalidad del tramo primero, y dentro de ella, si viene troceado.
    private static func guionPara(_ t: MirrorTramo) -> Cual {
        // El EMOM y la RUTA son formatos que mandan sobre la modalidad: un EMOM de
        // ski y uno de burpees son la misma pantalla, porque lo que gobierna es el
        // reloj de pared. Igual la ruta de estaciones de un HYROX, que atraviesa
        // correr y máquinas contra un solo crono.
        if t.formato == PrescriptionScheme.emom.rawValue { return .emom }
        if esRuta(t.formato) { return .ruta }

        switch t.modalidad {
        case PrescriptionModality.run.rawValue:
            // Troceado si el motor cuenta rondas, o si la ventana la cierra algo
            // que no es el propio bout entero (un hito o un reloj por repetición).
            return (t.rondaTotal ?? 0) > 1 ? .series : .rodaje
        case PrescriptionModality.strength.rawValue:
            return .fuerza
        case PrescriptionModality.row.rawValue,
             PrescriptionModality.ski.rawValue,
             PrescriptionModality.bike.rawValue:
            return .ergo
        default:
            // EL RELOJ DE PARED: intervals/tabata/death_by/steady cuando nadie
            // mide la máquina y no hay GPS — burpees, planchas, un trineo.
            // Ninguno de los tres casos anteriores los reclama (no son de
            // correr, ni de fuerza, ni de ergo), y son justo la familia que se
            // quedó sin pantalla al reordenar las superficies del entreno.
            return esRelojDePared(t.formato) ? .relojDePared : .ninguno
        }
    }

    /// Los cuatro formatos que corta el reloj de pared. `sets`/`forTime`-y-cía
    /// quedan fuera a propósito: cada uno tiene ya su propio guion.
    private static func esRelojDePared(_ formato: String?) -> Bool {
        [PrescriptionScheme.intervals, .tabata, .deathBy, .steady]
            .map(\.rawValue).contains(formato ?? "")
    }

    /// Los formatos que se recorren como una RUTA de estaciones contra un solo
    /// crono. AMRAP queda fuera a propósito: su lista se repite y nadie sabe en
    /// qué movimiento estás (lo declara el propio motor).
    private static func esRuta(_ formato: String?) -> Bool {
        [PrescriptionScheme.forTime, .chipper, .hyroxSim, .rounds, .ladder]
            .map(\.rawValue).contains(formato ?? "")
    }

    // MARK: - Trama → Estado de cada guion

    private static func fuerza(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionFuerza.Estado {
        GuionFuerza.Estado(
            serie: t.rondaN ?? 1,
            totalSeries: t.rondaTotal ?? 0,
            cargaKg: t.cargaKg,
            reps: t.reps,
            // RIR y RPE no viajan sueltos: van dentro de la dosis que escribió el
            // coach, y esa se pinta tal cual en vez de descomponerla aquí.
            rir: nil,
            rpe: nil,
            esfuerzo: t.dosis,
            segundosEnSerie: elapsed,
            zonaViva: zona(t.zonaViva),
            bpm: bpm
        )
    }

    private static func rodaje(_ t: MirrorTramo, _ f: MirrorStateFrame, bpm: Int?, elapsed: Double) -> GuionRodaje.Estado {
        GuionRodaje.Estado(
            esCorrer: t.modalidad == PrescriptionModality.run.rawValue,
            zonaObjetivo: zona(f.targetZone),
            zonaViva: zona(t.zonaViva),
            bpm: bpm,
            ritmoSecPorKm: t.ritmoSecPorKm,
            metros: t.hechoMedida,
            objetivoMetros: t.objetivoMedida,
            segundos: elapsed
        )
    }

    private static func series(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionSeries.Estado {
        GuionSeries.Estado(
            fase: t.enDescanso ? .recupera : .trabajo,
            enMovimiento: t.recuperacionEnMovimiento,
            // La parte del entreno viaja por el cable: sin ella el calentamiento
            // de una serie llegaba a la muñeca como «Serie 1 / 6».
            parte: t.parte.flatMap(RunPhaseRole.init(rawValue:)) ?? .main,
            serie: t.rondaN ?? 1,
            totalSeries: t.rondaTotal ?? 1,
            cierre: cierre(t),
            metrosEnTramo: t.hechoMedida,
            quedaS: t.ventanaQueda,
            enTramoS: elapsed,
            ritmoSecPorKm: t.ritmoSecPorKm,
            objetivo: t.objetivoLabel.map { ($0, estado(t.objetivoEstado)) },
            loQueViene: t.siguiente,
            zonaViva: zona(t.zonaViva),
            bpm: bpm
        )
    }

    /// El EMOM. El cable trae la tarea de ESTA ronda, no el plan entero, así que
    /// la lista se rellena con ella y sólo la casilla de la ronda siguiente se
    /// cambia por `siguiente` — que es lo único que el guion necesita para
    /// anunciar «luego» en la parada. Rellenar el resto con la actual es honesto:
    /// nadie está mirando la ronda 9 desde la 3.
    private static func emom(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionEmom.Estado {
        let rondas = max(1, t.rondaTotal ?? 1)
        let ronda = min(max(1, t.rondaN ?? 1), rondas)
        let actual = GuionEmom.TareaEmom(
            texto: [t.etiqueta, t.dosis].compactMap { $0 }.joined(separator: " · "),
            // GROUND TRUTH de la prescripción, no si el móvil ya reporta datos:
            // antes de este campo TODA ronda viajaba `.ojeada`, así que una
            // ronda de burpees pintaba controles que el atleta, en el suelo,
            // no podía tocar.
            modo: t.tareaEsErgo ? .ojeada : .ciego,
            ergo: t.tareaEsErgo ? t.etiqueta : nil
        )
        var tareas = Array(repeating: actual, count: rondas)
        if let sig = t.siguiente, ronda < tareas.count {
            tareas[ronda] = GuionEmom.TareaEmom(texto: sig, modo: .ojeada, ergo: nil)
        }
        let ventana = t.ventanaTotal ?? 60
        let enVentana = t.ventanaQueda.map { max(0, ventana - $0) } ?? elapsed
        return GuionEmom.Estado(
            rondas: rondas,
            ronda: ronda,
            ventanaS: ventana,
            // LA PARADA ERA INALCANZABLE. `trabajoS = ventana` siempre hacía que el
            // guion nunca viera la fase de descanso, así que durante los 15-20 s de
            // parada la muñeca seguía diciendo «llevas N s de trabajo» y el aro
            // arrancaba a media vuelta. El cable SÍ trae `enDescanso`: cuando lo
            // dice, el trabajo se acabó en el segundo en que estamos.
            trabajoS: t.enDescanso ? min(enVentana, ventana) : ventana,
            tareas: tareas,
            enVentanaS: enVentana,
            // El móvil no manda «ya la marqué»: el descanso dentro del formato es
            // lo que sí viaja, y es lo mismo que ver desde fuera.
            hechaEnS: t.enDescanso ? 0 : nil,
            maquina: t.hechoMedida != nil,
            metrosMaquina: t.hechoMedida,
            bpm: bpm,
            zonaViva: zona(t.zonaViva)
        )
    }

    /// La estación en curso de una ruta (For Time / Chipper / HYROX sim /
    /// Rounds / Ladder). Lee la MISMA decisión que ya resuelve `GuionEstaciones`
    /// para el reloj en solitario (`FixedLiveView.paginaEstacion`) — antes esta
    /// vía tenía su propio modelo (`GuionRuta`), que sólo distinguía "tramo de
    /// carrera" de "estación ciega" y por eso el ski, el remo, los burpees y los
    /// wall balls caían siempre en el crono del BLOQUE ENTERO contando arriba,
    /// nunca en lo que llevan o les falta de esa estación. Reconciliado
    /// 20-ago — card 67, la reconciliación que `GuionEstaciones.swift` dejaba
    /// pendiente.
    private static func estacion(_ t: MirrorTramo, _ f: MirrorStateFrame, elapsed: Double) -> GuionEstaciones.Estado {
        let esCarrera = t.modalidad == PrescriptionModality.run.rawValue
        let cierre: GuionEstaciones.Cierre
        switch t.cierre {
        case "machineGoal":
            if let objetivo = t.objetivoMedida, objetivo > 0 {
                cierre = t.objetivoEsCalorias
                    ? .calorias(objetivo: Int(objetivo), cubiertas: t.hechoMedida.map(Int.init))
                    : .metros(objetivo: objetivo, cubiertos: t.hechoMedida)
            } else {
                // Un hito sin objetivo no es un hito de verdad (mismo criterio
                // que `cierre(_:)` para `GuionSeries` más abajo): cierra el
                // atleta.
                cierre = .atleta
            }
        case "sessionClock", "formatClock":
            if let total = t.ventanaTotal, total > 0 {
                cierre = .caja(segundos: Int(total))
            } else {
                cierre = .atleta
            }
        default:
            cierre = .atleta
        }
        let total = max(1, t.rondaTotal ?? 1)
        return GuionEstaciones.Estado(
            etiqueta: t.etiqueta ?? f.lineTitle ?? "Estación",
            dosis: t.dosis ?? f.detailLine,
            cierre: cierre,
            esCarrera: esCarrera,
            ritmoSecPorKm: t.ritmoSecPorKm,
            cajaRestanteSegundos: t.ventanaQueda,
            enEstacionSegundos: elapsed,
            // El crono TOTAL es la puntuación de una ruta, no el de la estación.
            bloqueSegundos: f.sessionElapsed,
            posicion: min(max(1, t.rondaN ?? 1), total),
            total: total
        )
    }

    /// El ergo. El reloj no ve la máquina: si el móvil no manda metros es que no
    /// hay monitor emparejado, y el guion se cae a pulso y crono él solo.
    private static func ergo(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionErgo.Estado {
        GuionErgo.Estado(
            fase: t.enDescanso ? .descanso : .remando,
            serie: t.rondaN ?? 1,
            totalSeries: max(1, t.rondaTotal ?? 1),
            tramoM: t.objetivoMedida ?? 0,
            maquina: t.hechoMedida != nil,
            hechosM: t.hechoMedida,
            // El /500 del PM5 todavía no viaja: el cable lleva ritmo por km, que es
            // de correr. Antes que traducir una cosa por otra, no se pinta.
            ritmoSec500: nil,
            segundosEnFase: elapsed,
            quedaDescansoS: t.enDescanso ? t.ventanaQueda : nil,
            zonaViva: zona(t.zonaViva),
            bpm: bpm
        )
    }

    /// El reloj de pared. `enTramoS` no entra aquí: el sujeto de los cuatro
    /// formatos es lo que QUEDA (`ventanaQueda`), nunca un crono que suba —eso
    /// es justo la degradación genérica que esta familia vino a sustituir.
    ///
    /// `fallado` no puede venir del cable: `deathByFail()` avanza el bloque en
    /// el mismo tick (`WorkoutSession.swift`), así que no hay una trama
    /// intermedia «acabas de fallar» que capturar — el atleta toca, el bloque
    /// cambia, y la SIGUIENTE trama ya es de otra cosa. La página de resumen del
    /// guion queda para el modo solitario, donde sí existe ese instante.
    private static func relojDePared(_ t: MirrorTramo, bpm: Int?) -> GuionRelojDePared.Estado {
        let formato: GuionRelojDePared.Formato
        switch t.formato {
        case PrescriptionScheme.tabata.rawValue: formato = .tabata
        case PrescriptionScheme.deathBy.rawValue: formato = .deathBy
        case PrescriptionScheme.steady.rawValue: formato = .steady
        default: formato = .intervals
        }
        let esDeathBy = formato == .deathBy

        // `death_by` no tiene un total de rondas: la ronda 12 existe si llegas.
        // El resto sí lo trae el cable, salvo que sea 1 (nada que contar) — un
        // total de 1 rondas no informa, así que se omite.
        var totalRondas: Int? = nil
        if !esDeathBy, let total = t.rondaTotal, total > 1 {
            totalRondas = total
        }

        let repsDelMinuto: Int? = esDeathBy ? t.reps : nil
        let zonaViva: HRZone? = zona(t.zonaViva)

        return GuionRelojDePared.Estado(
            formato: formato,
            movimiento: t.etiqueta,
            rondaActual: max(1, t.rondaN ?? 1),
            totalRondas: totalRondas,
            enDescanso: t.enDescanso,
            quedaS: t.ventanaQueda ?? 0,
            objetivo: t.objetivoLabel,
            repsDelMinuto: repsDelMinuto,
            zonaViva: zonaViva,
            bpm: bpm
        )
    }

    // MARK: - El aro, decidido como dato

    /// EL ARO — decidido aquí (puro, testeable) y sólo DIBUJADO por la vista.
    /// Regla del doble que el espejo pisoteaba: en las series el aro es el on/off
    /// alrededor del cuadrado — UNA PORCIÓN POR SERIE — no un anillo continuo.
    /// El continuo queda para lo que es una sola cosa en marcha (ventana EMOM,
    /// descanso, AMRAP). Y sin total conocido no hay aro: dibujar una fracción
    /// que nadie sabe es la mentira que el bisel vino a evitar.
    enum Aro: Equatable {
        case ninguno
        case continuo(queda: Double)
        case segmentado(total: Int, hechas: Int, fraccion: Double)
        /// El on/off de una serie de correr: un arco por tramo, trabajo y
        /// recuperación (ver `FormaDelAro`). Sólo existe cuando el móvil manda la
        /// forma — nunca se reconstruye aquí a partir de la cuenta de series.
        case estructura(arcos: [ArcoDeTramo], enCurso: Int, fraccion: Double)
    }

    static func aro(_ f: MirrorStateFrame) -> Aro {
        guard let t = f.tramo else { return .ninguno }
        // LA FORMA MANDA SOBRE LA CUENTA. Si el móvil sabe dibujar la parte
        // entera, el bisel la dibuja: contar sólo series de trabajo era lo que
        // hacía desaparecer la mitad del entreno del aro.
        if let forma = t.forma, forma.count > 1, let i = t.formaIndice, forma.indices.contains(i) {
            return .estructura(
                arcos: forma.map { ArcoDeTramo(trabajo: $0.trabajo, peso: $0.peso) },
                enCurso: i,
                fraccion: fraccionDelTramo(t)
            )
        }
        switch guionPara(t) {
        case .series, .fuerza, .ergo, .ruta:
            guard let total = t.rondaTotal, total > 1 else { return aroContinuo(t) }
            let hechas = max(0, (t.rondaN ?? 1) - 1)
            return .segmentado(total: total, hechas: hechas, fraccion: fraccionDelTramo(t))
        case .relojDePared:
            // Sólo intervals y tabata cuentan RONDAS — el aro de la tabla de la
            // pantalla nueva («segmentado, una por serie» / «segmentado, 8»).
            // Death by no tiene total fijo y steady es una ventana sin trocear:
            // los dos se quedan en el continuo de siempre.
            guard t.formato == PrescriptionScheme.intervals.rawValue
                    || t.formato == PrescriptionScheme.tabata.rawValue,
                  let total = t.rondaTotal, total > 1 else { return aroContinuo(t) }
            // El segmento en curso se deja SIN rellenar a propósito: `ventanaTotal`
            // aquí es sólo la ventana de TRABAJO, no el ciclo trabajo+parada
            // completo que dibujaría el aro del doble, y rellenarlo con ese
            // número saltaría hacia atrás en cuanto empieza la parada. El aro
            // sigue diciendo en qué ronda vas, que es lo que importa de reojo.
            return .segmentado(total: total, hechas: max(0, (t.rondaN ?? 1) - 1), fraccion: 0)
        case .rodaje, .emom, .ninguno:
            return aroContinuo(t)
        }
    }

    /// LO QUE LLEVAS DEL TRAMO EN CURSO (0…1). Por medida si alguien la mide, por
    /// reloj si lo cierra un reloj, y CERO cuando no lo sabe nadie: el arco en
    /// curso se queda encendido sin rellenar, que es la verdad — el aro dice por
    /// dónde vas, no cuánto llevas de algo que nadie mide.
    private static func fraccionDelTramo(_ t: MirrorTramo) -> Double {
        if let obj = t.objetivoMedida, obj > 0, let hecho = t.hechoMedida {
            return min(1, max(0, hecho / obj))
        }
        if let queda = t.ventanaQueda, let total = t.ventanaTotal, total > 0 {
            return min(1, max(0, 1 - queda / total))
        }
        return 0
    }

    private static func aroContinuo(_ t: MirrorTramo) -> Aro {
        guard let queda = t.ventanaQueda, let total = t.ventanaTotal, total > 0 else { return .ninguno }
        return .continuo(queda: max(0, min(1, queda / total)))
    }

    /// QUIÉN CIERRA la ventana — lo resuelve el motor y viaja resuelto, para que
    /// la muñeca no vuelva a decidirlo por su cuenta con otra regla.
    private static func cierre(_ t: MirrorTramo) -> GuionSeries.Cierre {
        switch t.cierre {
        case "machineGoal":
            // Un hito sin metros no es un hito: si el objetivo no viaja, quien
            // cierra de verdad es el atleta y el sujeto tiene que cambiar.
            guard let m = t.objetivoMedida, m > 0 else { return .atleta }
            return .hito(metros: m)
        case "sessionClock", "formatClock":
            return .reloj
        default:
            return .atleta
        }
    }

    // MARK: - La lectura genérica, para lo que aún no tiene guion

    /// EMOM, For Time, AMRAP y compañía todavía no tienen guion propio. Hasta que
    /// lo tengan se pintan con el MISMO lienzo — un sujeto, un segundo nivel, su
    /// contexto — en vez de con la pantalla vieja de tejas y botón de 52 pt.
    /// Prefiere el tramo (la tarea de ahora) sobre las frases del bloque, que
    /// están congeladas de la primera ronda a la última.
    private static func generico(
        _ f: MirrorStateFrame,
        bpm: Int?,
        elapsed: Double,
        avanzar: @escaping () -> Void
    ) -> [WatchPagina] {
        let t = f.tramo
        let queda = t?.ventanaQueda ?? f.countdownRemaining
        let descansando = t?.enDescanso ?? false
        let contexto: String = {
            if let n = t?.rondaN, let total = t?.rondaTotal { return "Ronda \(n) / \(total)" }
            return f.progressText ?? f.blockTitle ?? "Entreno"
        }()
        let principal = WatchPagina(
            id: "espejo",
            contexto: descansando ? "Descanso · \(contexto)" : contexto,
            // El móvil lleva el entreno: en la muñeca sólo hay un avance.
            modo: .mando,
            sujeto: queda.map { WatchFormat.countdown($0) } ?? WatchFormat.clock(elapsed),
            tono: queda.map { WatchTinte.urgente($0) } ?? WatchTheme.ink,
            segundoEtiqueta: descansando ? "Luego" : t?.etiqueta ?? f.lineTitle,
            segundoValor: descansando ? (t?.siguiente ?? f.lineTitle) : (t?.dosis ?? f.detailLine),
            accion: "Toca · hecho",
            onToca: avanzar
        )
        var list = [principal]
        if let pulso = WatchPaginasComunes.pulso(bpm: bpm, zone: zona(t?.zonaViva), modo: .mando) {
            list.append(pulso)
        }
        return list
    }

    // MARK: - Decodificación

    private static func zona(_ raw: Int?) -> HRZone? { raw.flatMap { HRZone(rawValue: $0) } }

    private static func estado(_ raw: String?) -> TargetStatus {
        switch raw {
        case "inTarget": return .inTarget
        case "tooFast":  return .tooFast
        case "tooSlow":  return .tooSlow
        default:         return .unknown
        }
    }
}
