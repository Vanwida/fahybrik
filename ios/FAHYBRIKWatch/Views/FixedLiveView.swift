import SwiftUI

// FIXED — AMRAP, For Time, Chipper, Ladder, Rounds, HYROX sim.
//
// LA TABLA — qué numeral es el sujeto y cuál el segundo nivel, por formato y por
// cómo cierra el tramo. Vive aquí, no solo en el commit que la trajo: es la
// decisión que se pierde si no queda escrita donde se toma. El discriminador
// entre las dos filas de abajo es `fixedListIsStations`
// (`LiveTramo.swift`/`WorkoutSegment`) — el MISMO que ya usa el motor para saber
// si la lista es una ruta de estaciones o rondas que se repiten.
//
//   FORMATO                                    SUJETO                SEGUNDO NIVEL
//   ──────────────────────────────────────     ────────────────────  ──────────────────
//   AMRAP (ronda libre)                        rondas hechas (toque)  ventana que queda
//   For Time / Ladder / Rounds POR RONDAS       crono del bloque      ronda X / Y
//     repetidas (fixedListIsStations = false)   (ES la puntuación)
//   For Time / Chipper / Ladder / Rounds /      el reloj de LA        total del bloque
//     HYROX sim POR ESTACIONES                  ESTACIÓN — ver abajo  + posición X/Y
//     (fixedListIsStations = true)
//
// Dentro de "por estaciones" el sujeto cambia con cómo cierra ESA estación —
// tres casos, no dos (19-ago, se añade el segundo: antes "sin caja" metía
// carrera/ergómetro/reps en el mismo saco y un Run de 1.000 m dentro de una
// ruta mixta sólo enseñaba su crono, ni metros ni ritmo — la queja de fondo):
//   · caja de reloj ("2 min de bici")     → cuenta ATRÁS lo que queda de la caja
//     (`tramoWorkRemaining`). Es lo único que le dice si aprieta o afloja — antes
//     el reloj no lo sabía y siempre enseñaba el total del bloque (card 67).
//   · objetivo medible — metros (carrera  → cuenta ATRÁS lo que FALTA del
//     o ergómetro) / calorías (ergómetro)    objetivo (`GuionEstaciones.Cierre
//                                             .metros/.calorias`), igual que
//                                             una serie de calle suelta
//                                             (`GuionSeries`): «lo que faltan
//                                             son los metros» es la misma
//                                             pregunta corriendo O remando. La
//                                             carrera añade el RITMO de
//                                             segundo nivel; el ergómetro no
//                                             tiene ritmo/km y se queda con el
//                                             total del bloque.
//   · reps, o ningún objetivo declarado   → cuenta ARRIBA su propio parcial
//     (nada mide el cierre)                  (`tramoElapsedSeconds`) — «llevas
//                                             X en esta estación», igual que
//                                             el doble (`StationSubject` en
//                                             ActiveWorkoutView). Nada mide,
//                                             nada que contar hacia atrás sin
//                                             mentir (§7, ningún cero falso).
//
// AMRAP se queda fuera de la fila de estaciones a propósito: es ronda libre, no
// tiene ruta, y su sujeto ya acertaba. EMOM vive en su propio motor y vista — ya
// correcto, no toca este archivo (auditoría 18-ago).
//
// Página del cuerpo aparte. La pantalla ES el botón (+ ronda / estación hecha).
struct FixedLiveView: View {
    let session: WorkoutSession

    @State private var transitionKey: Int? = nil
    @State private var destello = WatchDestello()

    var body: some View {
        ZStack {
            WatchReloj(
                paginas: paginas,
                tinte: tinteLienzo,
                bisel: bisel,
                destello: destello
            )
            if let key = transitionKey, let comp = component(at: key) {
                TransitionScreen(
                    eyebrow: "Entras a",
                    title: comp.name,
                    subtitle: comp.work,
                    footer: "RUN ▸ ESTACIÓN",
                    onTap: { transitionKey = nil }
                )
                .task(id: key) {
                    try? await Task.sleep(nanoseconds: UInt64(WatchTheme.transitionDwell * 1_000_000_000))
                    if transitionKey == key { transitionKey = nil }
                }
            }
        }
        .onChange(of: session.fixedRoundsDone) { _, newValue in
            destello = WatchDestello(n: destello.n + 1, color: WatchTheme.orangeSoft)
            guard isHyroxSim, newValue > 0, newValue < session.fixedListTotal else { return }
            transitionKey = newValue
            WatchHaptics.transition()
        }
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = []
        if session.isCondCountIn {
            list.append(WatchPagina(
                id: "countin",
                contexto: statusText,
                modo: .ojeada,
                sujeto: WatchFormat.countdown(session.condCountInRemaining),
                tono: WatchTheme.orange
            ))
        } else if session.currentSegment?.formatScheme == .amrap {
            list.append(paginaAmrap)
        } else if isStationRoute {
            list.append(paginaEstacion)
        } else {
            list.append(paginaForTime)
        }
        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: session.isCondCountIn ? .ojeada : .mando
        ) {
            list.append(pulso)
        }
        return list
    }

    private var paginaAmrap: WatchPagina {
        let queda = session.condRemaining
        return WatchPagina(
            id: "amrap",
            contexto: statusText,
            modo: .mando,
            sujeto: "\(session.fixedRoundsDone)",
            segundoEtiqueta: "Queda",
            segundoValor: WatchFormat.countdown(queda),
            segundoTono: WatchTinte.urgente(queda),
            accion: "Toca · + ronda",
            onToca: { session.bumpAmrapRound() }
        )
    }

    /// Lista de RONDAS repetidas (no estaciones): el crono del bloque ES la
    /// puntuación, así que sigue siendo el sujeto — nada de esto cambia con la
    /// tabla de arriba, es justo la fila que ya acertaba.
    private var paginaForTime: WatchPagina {
        let ronda = min(session.fixedRoundsDone + 1, max(1, session.fixedListTotal))
        let total = max(1, session.fixedListTotal)
        return WatchPagina(
            id: "fortime",
            contexto: statusText,
            modo: .mando,
            sujeto: WatchFormat.clock(session.condElapsed),
            segundoEtiqueta: "Ronda",
            segundoValor: "\(ronda) / \(total)",
            accion: "Toca · ronda hecha",
            onToca: { session.markRoundDone() }
        )
    }

    /// Lista por ESTACIONES (ruta): el sujeto es el reloj — o el objetivo — de
    /// LA ESTACIÓN. La tabla al inicio del fichero dice por qué cuenta atrás,
    /// hacia el objetivo o arriba; `GuionEstaciones`
    /// (`FAHYBRIKCore/Watch/Guiones/`) es la implementación pura y probada,
    /// esto sólo la alimenta con la sesión viva.
    private var paginaEstacion: WatchPagina {
        let tramo = session.currentTramo
        let cierre: GuionEstaciones.Cierre
        if let boxed = tramo.boxedSeconds, boxed > 0 {
            cierre = .caja(segundos: boxed)
        } else if let metros = tramo.targetDistanceMeters {
            // Metros YA cubiertos de ESTA estación: carrera (GPS/cinta) o
            // ergómetro, según cuál mida esta estación — nunca los dos.
            // `tramoErgDistanceMeters` ya está anclado por estación (todo
            // tramo re-ancla su ventana de ergómetro en `syncTramoIfNeeded`).
            // `tramoRunCoveredMeters` DEPENDE de un arreglo en curso en el
            // motor (19-ago, otro agente): hoy, para una estación de carrera
            // dentro de una ruta MIXTA (no una carrera estructurada), cae a la
            // lectura de TODO el bloque en vez de la de esta estación sola —
            // el cuarto Run de la ruta de mañana leería ~4.000 m en vez de
            // 0→1.000. Se consume tal cual: cuando el motor la corrija, esta
            // vista queda arreglada sin tocarla.
            let cubiertos = tramo.isRun ? session.tramoRunCoveredMeters : session.tramoErgDistanceMeters
            cierre = .metros(objetivo: metros, cubiertos: cubiertos)
        } else if let calorias = tramo.targetCalories {
            cierre = .calorias(objetivo: calorias, cubiertas: session.tramoErgCalories)
        } else {
            cierre = .atleta
        }
        // El ritmo es la MISMA fórmula pura que ya usa una carrera de calle
        // (`RunLegDisplay.legPaceSecPerKm`: filtra el ruido bajo 10 m y el
        // techo de 20:00/km) — nunca una reimplementación. `tramoRunCoveredMeters`
        // hereda la misma dependencia de arriba.
        let ritmo = tramo.isRun
            ? RunLegDisplay.legPaceSecPerKm(coveredMeters: session.tramoRunCoveredMeters ?? 0,
                                            elapsedS: session.tramoElapsedSeconds)
            : nil
        let estado = GuionEstaciones.Estado(
            etiqueta: tramo.label,
            dosis: tramo.workLine,
            cierre: cierre,
            esCarrera: tramo.isRun,
            ritmoSecPorKm: ritmo,
            cajaRestanteSegundos: session.tramoWorkRemaining,
            enEstacionSegundos: session.tramoElapsedSeconds,
            bloqueSegundos: session.condElapsed,
            posicion: min(session.fixedRoundsDone + 1, session.fixedListTotal),
            total: session.fixedListTotal
        )
        return GuionEstaciones.pagina(estado, onEstacionHecha: { session.markRoundDone() })
    }

    // MARK: - Tinte / bisel

    private var tinteLienzo: Color? {
        if session.isCondCountIn { return WatchTheme.orange }
        return WatchTinte.color(for: session.liveZone)
    }

    private var bisel: AnyView? {
        if session.currentSegment?.formatScheme == .amrap,
           let total = session.currentSegment?.formatTotalSeconds, total > 0 {
            let rem = max(0, session.condRemaining / Double(total))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        if isStationRoute, session.fixedListTotal > 0 {
            return WatchAroSegmentado(
                total: session.fixedListTotal,
                hechas: session.fixedRoundsDone,
                fraccion: 0
            ).watchBisel()
        }
        return nil
    }

    // MARK: - Derived

    private var isHyroxSim: Bool { session.currentSegment?.formatScheme == .hyroxSim }

    /// El discriminador del motor (`WorkoutSegment.fixedListIsStations`): la lista
    /// es una RUTA de estaciones distintas, no rondas que se repiten.
    private var isStationRoute: Bool { session.currentSegment?.fixedListIsStations == true }

    private func component(at index: Int) -> WorkComponent? {
        let comps = session.currentSegment?.components ?? []
        guard !comps.isEmpty else { return nil }
        return comps[min(max(0, index), comps.count - 1)]
    }

    private var statusText: String {
        guard let seg = session.currentSegment, let scheme = seg.formatScheme else { return "" }
        if scheme == .amrap, let total = seg.formatTotalSeconds {
            return "AMRAP · \(WatchFormat.clock(Double(total)))"
        }
        if let rounds = seg.formatRounds {
            return "\(scheme.displayName) · \(rounds) rondas"
        }
        return scheme.displayName
    }
}
