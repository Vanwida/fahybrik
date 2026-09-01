import Foundation

// EL DECODIFICADOR: `AssignmentDetail` → `Carrera`.
//
// Es un JOIN POR `position`, y ahí está todo el trabajo. El servidor manda el
// mismo tramo partido en dos sitios y a propósito:
//
//   · `run_compliance.tramos[]` trae el JUICIO — veredicto, veredicto de
//     duración, ordinal, banda y pendiente prescrita — y **ni un solo número
//     medido**.
//   · `execution.segments[]` trae LO MEDIDO — cuándo empezó, cuánto duró, cuánto
//     se recorrió, a qué ritmo, con qué pulso, con qué pendiente — y **ningún
//     juicio**.
//
// Una `Repeticion` es la fusión de las dos por `position`. Las recuperaciones
// NUNCA están en `tramos`: llegan en `recovery_tramos`, con su propio vocabulario,
// y mezclarlas fue un bug real.
//
// LO QUE ESTE FICHERO NO HACE, Y ES LA MITAD DE SU DISEÑO:
//
//  · **No juzga.** Ni un veredicto se calcula aquí. Si falta, se pide al
//    servidor: dos motores para el mismo hecho es cómo coach y atleta acaban
//    leyendo veredictos distintos de la misma serie.
//  · **No resuelve la precedencia de la banda.** `Objetivo` sale de `band`, que
//    ya llega resuelta (`ComplianceBand.objetivo`).
//  · **No rellena un hueco.** Un nulo que llega nulo se queda nulo. Un
//    porcentaje ausente no es un cero y una pendiente ausente no es un llano.

enum LecturaDeCarreraDesdeDetalle {

    /// La modalidad que cuenta como correr, tal y como la escribe el servidor.
    private static let modalidadCarrera = SegmentKind.running.modality

    /// LA CARRERA QUE HAY EN ESTE DETALLE, o nil si no hay ninguna.
    ///
    /// `nil` significa exactamente «esta sesión no es una carrera, o no se ejecutó»
    /// — nunca «no pude leerla». Quien llama pinta entonces su vista de siempre.
    ///
    /// `zonas` es el perfil de pulso del atleta y solo hace falta para NOMBRAR la
    /// zona de una banda de pulso: sin él una banda de pulso no se dibuja, antes
    /// que pintarla de un color que no significa nada.
    /// Un tramo, reducido a lo único que decide si la sesión FUE una carrera.
    struct TramoParaClasificar: Equatable {
        let modalidad: String?
        let segundos: Int?
    }

    /// ¿CORRER ES LO QUE ESTA SESIÓN FUE?
    ///
    /// No basta con que haya un tramo de correr dentro. El entreno del 20-ago era
    /// fuerza y trineos con SEIS minutos de calentamiento corriendo, y se leyó como
    /// una carrera: «RITMO MEDIO 0:00 /km · corriste a una sola intensidad» ocupando
    /// la pantalla entera sobre 47 minutos de peso muerto, remo y trineos, de los
    /// que no se decía nada. La pregunta correcta no es «¿hay correr?» sino «¿es
    /// esto una carrera?».
    ///
    /// La regla: correr manda cuando se lleva MÁS DE LA MITAD del tiempo medido.
    /// El tiempo es la vara honesta —es lo que el atleta pasó haciendo cada cosa— y
    /// no depende de que un aparato midiera metros. Si ningún tramo trae duración
    /// (un registro a mano), se cuenta por número de tramos, que es lo único que
    /// queda. Sin tramos no hay sesión que leer.
    ///
    /// Deliberadamente NO se mira la plantilla: lo que se lee es lo que se hizo, y
    /// un atleta que se salta media sesión no debe recibir la lectura de la sesión
    /// que no hizo.
    static func correrManda(en tramos: [TramoParaClasificar]) -> Bool {
        guard !tramos.isEmpty else { return false }
        let esCorrer: (TramoParaClasificar) -> Bool = { $0.modalidad == modalidadCarrera }
        let conTiempo = tramos.filter { ($0.segundos ?? 0) > 0 }
        if !conTiempo.isEmpty {
            let total = conTiempo.reduce(0) { $0 + ($1.segundos ?? 0) }
            let corriendo = conTiempo.filter(esCorrer).reduce(0) { $0 + ($1.segundos ?? 0) }
            return total > 0 && corriendo * 2 > total
        }
        return tramos.filter(esCorrer).count * 2 > tramos.count
    }

    static func carrera(
        de detalle: AssignmentDetail,
        zonas: HRZoneProfile? = nil,
        tituloAlternativo: String? = nil,
        ahora: Date = Date()
    ) -> Carrera? {
        guard let ejecucion = detalle.execution else { return nil }
        // La lectura de carrera es para una CARRERA. Un calentamiento de seis
        // minutos dentro de una sesión de hierro no la convierte en una.
        guard correrManda(en: ejecucion.segments.map {
            TramoParaClasificar(modalidad: $0.modality, segundos: $0.durationSeconds)
        }) else { return nil }
        let segmentos = ejecucion.segments
            .filter { $0.modality == modalidadCarrera }
            .sorted { $0.position < $1.position }
        guard !segmentos.isEmpty else { return nil }
        // SIN METROS NO HAY CARRERA QUE LEER. Toda esta lectura habla de ritmo, y el
        // ritmo son metros entre segundos: sin distancia medida, la media salía 0 y
        // se pintaba «RITMO MEDIO 0:00 /km» a pantalla completa. Un cero afirma algo
        // falso; un hueco dice la verdad. Con sólo tiempo y pulso, la lectura
        // genérica ya cuenta lo que hubo, y sin inventarse nada.
        guard segmentos.contains(where: { ($0.distanceMeters ?? 0) > 0 }) else { return nil }

        let cumplimiento = detalle.runCompliance
        let ancla = ejecucion.startedAt.flatMap(ISO8601DateFormatters.parse)
        let repeticiones = repeticionesDe(
            segmentos: segmentos, cumplimiento: cumplimiento, ancla: ancla,
            piernasPrescritas: piernasPrescritas(detalle)
        )

        let objetivo = objetivoDe(cumplimiento?.tramos.compactMap(\.band), zonas: zonas)
        let objetivoRec = objetivoDe(cumplimiento?.recoveryTramos.compactMap(\.band), zonas: zonas)
        let traza = trazaDe(ejecucion.trace)
        let ruta = ejecucion.trace.map(rutaDe) ?? []

        let distancia = segmentos.compactMap(\.distanceMeters).reduce(0, +)
        let duracion = Double(ejecucion.totalDurationSeconds
            ?? segmentos.compactMap(\.durationSeconds).reduce(0, +))

        return Carrera(
            titulo: detalle.workout?.name ?? tituloAlternativo ?? "Carrera",
            cuando: FechaES.cuando(detalle.assignment.scheduledFor, ahora: ahora) ?? "",
            // Este camino lee del SERVIDOR, así que el entreno ya está guardado: no
            // hay nada que registrar y la pantalla se lee, no se rellena.
            momento: .revision,
            prescrito: lineaDelCoach(detalle),
            objetivo: objetivo ?? (detalle.workout == nil ? .ninguno : .sensacion),
            objetivoRecuperacion: objetivoRec,
            superficie: superficieDe(ejecucion, segmentos: segmentos),
            distanciaM: distancia,
            duracionS: duracion,
            fcMediaPpm: fcMedia(segmentos),
            fcMaxPpm: segmentos.compactMap(\.maxHr).max().map(Double.init),
            desnivelM: ejecucion.elevationGainM,
            traza: traza,
            repeticiones: repeticiones,
            // Estos tramos los cerró el entreno: salen de `segment_executions`,
            // que es lo que el motor grabó lap a lap. Aquí NADA se infiere del
            // ritmo, así que `detectados` no puede darse por este camino.
            certezaTramos: repeticiones.isEmpty ? nil : .marcados,
            kilometros: kilometrosDe(ejecucion.trace),
            zonasS: zonasDe(segmentos),
            derivado: .init(
                derivaPct: ejecucion.decouplingPct,
                bajadaPulsoPpm: ejecucion.hrRecovery60Bpm
            ),
            ruta: ruta,
            dicho: dichoDe(ejecucion),
            // El umbral de pendiente lo pone el ENTRENADOR y llega con la sesión.
            // Sin él, el suelo de siempre — y así una respuesta que todavía no lo
            // manda se lee exactamente igual que hasta hoy.
            metodo: cumplimiento?.metodoDeLectura ?? .porDefecto
        )
    }

    // MARK: - EL JOIN

    /// LA FUSIÓN, tramo a tramo.
    ///
    /// El ESQUELETO son los segmentos medidos y no los tramos juzgados, y el orden
    /// importa: un tramo prescrito que no se corrió llega con `position: null` y no
    /// tiene nada con lo que fusionarse — no es una repetición, es una ausencia, y
    /// el servidor ya la cuenta en su resumen. Al revés sí: un tramo CORRIDO sin
    /// juicio (un fartlek por sensaciones, donde no había banda) sigue siendo una
    /// repetición de pleno derecho, con sus números y sin veredicto.
    ///
    /// QUÉ CUENTA COMO REPETICIÓN: solo lo que el servidor ETIQUETÓ. `leg_role`
    /// dice si un lap fue trabajo o recuperación, y `leg_phase` separa el
    /// calentamiento y la vuelta a la calma del trabajo de verdad. Sin etiqueta no
    /// hay repetición: un rodaje continuo es una sola pieza, y contarla como «1 de
    /// 1» sería ponerle nota a algo que no tiene repeticiones. Lo que no es
    /// repetición sigue estando en la curva, que dibuja la sesión entera.
    static func repeticionesDe(
        segmentos: [SegmentActualDTO],
        cumplimiento: RunCompliance?,
        ancla: Date?,
        piernasPrescritas: [String: [RunLeg]] = [:]
    ) -> [Repeticion] {
        let trabajoPorPos = indice(cumplimiento?.tramos ?? [], \.position)
        let recuperacionPorPos = indice(cumplimiento?.recoveryTramos ?? [], \.position)

        // Sin `started_at` en los tramos (ejecuciones anteriores a que se grabara)
        // el eje de tiempo se reconstruye encadenando duraciones desde el inicio.
        // Es una aproximación DECLARADA y solo afecta a dónde cae la sombra del
        // tramo sobre la curva, nunca a un número que se lea.
        var reloj: Double = 0
        var ordinal = 0
        var ultimoTrabajo = 0
        var salida: [Repeticion] = []

        for s in segmentos {
            let inicio = instanteRelativo(s.startedAt, ancla: ancla) ?? reloj
            let duracion = Double(s.durationSeconds ?? 0)
            reloj = inicio + duracion

            let tramo = trabajoPorPos[s.position]
            let recuperacion = recuperacionPorPos[s.position]
            guard let papel = papelDe(s, juzgadoComoTrabajo: tramo != nil,
                                      juzgadoComoRecuperacion: recuperacion != nil)
            else { continue }

            let n: Int
            if papel == .trabajo {
                ordinal += 1
                n = tramo?.repOrdinal ?? ordinal
                ultimoTrabajo = n
            } else {
                // La recuperación hereda el número de la que cierra, porque es como
                // la cuenta el atleta: «el trote de la tercera».
                n = ultimoTrabajo
            }

            salida.append(Repeticion(
                n: n,
                papel: papel,
                modo: papel == .recuperacion
                    ? modoDe(s, prescrito: modoPrescrito(s, en: piernasPrescritas))
                    : nil,
                inicioS: inicio,
                duracionS: duracion,
                distanciaM: s.distanceMeters,
                ritmoSkm: ritmoDe(s),
                fcMediaPpm: s.avgHr.map(Double.init),
                pendientePct: s.avgGradientPct,
                pendientePrescritaPct: tramo?.prescribedInclinePct,
                veredicto: tramo?.verdict,
                veredictoDuracion: tramo?.durationVerdict,
                veredictoRecuperacion: recuperacion?.verdict,
                veredictoDuracionRecuperacion: recuperacion?.durationVerdict
            ))
        }
        return salida
    }

    /// Trabajo, recuperación, o ninguna de las dos.
    ///
    /// Manda quien lo JUZGÓ; si nadie lo juzgó, manda la etiqueta con la que el
    /// motor lo grabó. Un calentamiento y una vuelta a la calma no son
    /// repeticiones: se corrieron, salen en la curva, y no entran en «5 de 6».
    private static func papelDe(
        _ s: SegmentActualDTO,
        juzgadoComoTrabajo: Bool,
        juzgadoComoRecuperacion: Bool
    ) -> PapelDeTramo? {
        if juzgadoComoTrabajo { return .trabajo }
        if juzgadoComoRecuperacion { return .recuperacion }
        switch s.legRole {
        case "work": return s.legPhase == "main" || s.legPhase == nil ? .trabajo : nil
        case "recovery": return .recuperacion
        default: return nil
        }
    }

    /// CÓMO SE RECUPERÓ. **Lo dice la prescripción, no un umbral.**
    ///
    /// Andar y trotar no se separan midiendo: pedirle a un ritmo o a una cadencia
    /// que decidan dónde acaba un paseo obliga a escribir un número que otro
    /// entrenador pondría en otro sitio, y eso es método metido en el código. La
    /// gramática ya lo dice —`rec(dur(90), 'caminar')` en cuestas, trote en series—
    /// y `leg_index` señala exactamente a qué tramo prescrito corresponde este lap.
    ///
    /// Sin modo prescrito se MIDE en vez de suponer, que es la misma doctrina que
    /// ya sigue el motor en vivo (`RunLeg.recuperaEnMovimiento`): si hubo ritmo,
    /// hubo movimiento; si no lo hubo, estuvo parado. Suponer que está parado tira
    /// dato real, y suponer que trota estira el eje de la curva con un paseo.
    static func modoDe(_ s: SegmentActualDTO, prescrito: RunRecoveryMode?) -> ModoRecuperacion {
        switch prescrito {
        case .trote: return .trote
        case .caminar: return .andando
        case .parado: return .parado
        case nil: return ritmoDe(s) == nil ? .parado : .trote
        }
    }

    /// El modo que el coach pidió para ESTE tramo, resuelto por `leg_index` sobre
    /// la lista plana de piernas de su ítem — la misma expansión que lee el motor
    /// en vivo, así que no hay una segunda alineación en ningún lado.
    static func modoPrescrito(
        _ s: SegmentActualDTO, en piernas: [String: [RunLeg]]
    ) -> RunRecoveryMode? {
        guard let uid = s.itemUid, let lista = piernas[uid],
              let i = s.legIndex, lista.indices.contains(i) else { return nil }
        return lista[i].recoveryMode
    }

    /// Los tramos PRESCRITOS de cada ítem, en la lista plana a la que apunta
    /// `leg_index`. Vacío cuando el bloque no trae estructura (camino heredado).
    static func piernasPrescritas(_ detalle: AssignmentDetail) -> [String: [RunLeg]] {
        var salida: [String: [RunLeg]] = [:]
        for bloque in detalle.workout?.blocks ?? [] {
            for item in bloque.items {
                guard let piernas = item.prescription?.runStructureLegs, !piernas.isEmpty
                else { continue }
                salida[item.uid] = piernas
            }
        }
        return salida
    }

    /// s/km. El servido manda; si no vino, la misma división que hace el servidor
    /// para juzgar, sobre los dos números medidos. Sin ninguno de los dos, nil —
    /// jamás un cero.
    static func ritmoDe(_ s: SegmentActualDTO) -> Double? {
        if let servido = s.avgPaceSPerKm, servido.isFinite, servido > 0 { return servido }
        guard let metros = s.distanceMeters, metros > 0,
              let segundos = s.durationSeconds, segundos > 0 else { return nil }
        return Double(segundos) / (metros / 1000)
    }

    private static func indice<T>(
        _ tramos: [T], _ posicion: KeyPath<T, Int?>
    ) -> [Int: T] {
        var salida: [Int: T] = [:]
        for t in tramos {
            guard let p = t[keyPath: posicion] else { continue }
            salida[p] = t
        }
        return salida
    }

    // MARK: - Lo que pidió el coach

    /// EL OBJETIVO SALE DE `band`, Y AQUÍ NO SE RESUELVE NADA. La precedencia
    /// zona-resuelta-contra-objetivo-explícito ya la resolvió el servidor una vez.
    ///
    /// Con bandas distintas por repetición —una pirámide, donde cada escalón lleva
    /// la suya— manda la primera. Los veredictos, que son lo que se lee, siguen
    /// siendo los de cada tramo contra la SUYA; lo único que se queda corto es la
    /// línea de apoyo que dice qué te pidieron, y decir la de la primera es más
    /// honesto que fabricar una envolvente que nadie prescribió.
    static func objetivoDe(_ bandas: [ComplianceBand]?, zonas: HRZoneProfile?) -> Objetivo? {
        guard let bandas else { return nil }
        for b in bandas {
            if let o = b.objetivo(zonas: zonas) { return o }
        }
        return nil
    }

    /// La línea del coach, tal y como la escribió — del ÚNICO redactor de
    /// prescripciones que tiene la app. Sin prescripción escrita se queda el título
    /// del bloque; sin ninguna de las dos no se pinta nada, que una nota inventada
    /// bajo el botón es peor que ninguna.
    static func lineaDelCoach(_ detalle: AssignmentDetail) -> String? {
        guard let bloques = detalle.workout?.blocks else { return nil }
        let uidsCorridos = Set(
            (detalle.execution?.segments ?? [])
                .filter { $0.modality == modalidadCarrera }
                .compactMap(\.itemUid)
        )
        for bloque in bloques {
            for item in bloque.items where uidsCorridos.contains(item.uid) {
                guard let rx = item.prescription else { continue }
                let linea = PrescriptionRenderer.summaryLine(rx)
                let piezas = [linea.headline, linea.pace].compactMap { $0 }
                if !piezas.isEmpty { return piezas.joined(separator: " · ") }
            }
        }
        // Ningún ítem corrido traía prescripción legible: queda el título del
        // bloque de carrera, que sigue siendo lo que el coach escribió.
        for bloque in bloques where bloque.items.contains(where: { uidsCorridos.contains($0.uid) }) {
            if !bloque.title.isEmpty { return bloque.title }
        }
        return nil
    }

    // MARK: - Lo medido

    /// EN CINTA LA DISTANCIA LA SELLA LA CORREA, no el GPS, y eso tiene que verse:
    /// un 5K en cinta no bate al de calle. Lo dice el aparato que midió — no hay
    /// campo dedicado en el detalle, y `source` es la respuesta honesta que hay.
    static func superficieDe(_ e: ExecutionSummary, segmentos: [SegmentActualDTO]) -> Superficie {
        let cinta = "treadmill"
        if e.source == cinta || e.contributingSources.contains(cinta) { return .cinta }
        return segmentos.contains { $0.source == cinta } ? .cinta : .calle
    }

    /// Media ponderada por duración: dos tramos de 20′ y uno de 1′ no pesan igual.
    static func fcMedia(_ segmentos: [SegmentActualDTO]) -> Double? {
        let con = segmentos.filter { $0.avgHr != nil && ($0.durationSeconds ?? 0) > 0 }
        let total = con.reduce(0.0) { $0 + Double($1.durationSeconds ?? 0) }
        guard total > 0 else { return nil }
        return con.reduce(0.0) { $0 + Double($1.avgHr!) * Double($1.durationSeconds ?? 0) } / total
    }

    /// Los segundos por zona de la sesión, sumando los de cada tramo. Vacío cuando
    /// no hubo banda de pulso: entonces no se dibuja reparto ninguno.
    static func zonasDe(_ segmentos: [SegmentActualDTO]) -> [Zona: Double] {
        var salida: [Zona: Double] = [:]
        for s in segmentos {
            for (clave, segundos) in s.zoneSeconds ?? [:] {
                guard let z = Int(clave.dropFirst()), clave.hasPrefix("z"), (1...5).contains(z)
                else { continue }
                salida[z, default: 0] += Double(segundos)
            }
        }
        return salida
    }

    static func dichoDe(_ e: ExecutionSummary) -> Carrera.Dicho? {
        guard e.perceivedExertion != nil || e.perceivedDifficulty != nil else { return nil }
        return Carrera.Dicho(rpe: e.perceivedExertion, dificultad: e.perceivedDifficulty)
    }

    // MARK: - El archivo

    /// La curva. Sin traza disponible no hay `Traza`, que es lo que la lectura lee
    /// como «esta sesión es anterior al archivo» — y sin ninguna de las dos series
    /// tampoco: una traza vacía dibujaría un eje sin nada dentro.
    static func trazaDe(_ trace: ExecutionTrace?) -> Traza? {
        guard let trace, trace.available else { return nil }
        let ritmo = trace.displayCurve.pace?.muestras ?? []
        let pulso = trace.displayCurve.hr?.muestras ?? []
        guard !ritmo.isEmpty || !pulso.isEmpty else { return nil }
        return Traza(ritmo: ritmo, pulso: pulso)
    }

    /// LOS KILÓMETROS, con su instante de cruce.
    ///
    /// El cruce se acumula: el km 3 empieza donde acabó el 2. En cuanto uno se
    /// queda sin duración —hubo un hueco de señal ahí— los que vienen detrás dejan
    /// de tener sitio conocido, así que su marca no se dibuja. La FILA sigue
    /// existiendo y dice qué le faltó: el kilómetro se corrió.
    static func kilometrosDe(_ trace: ExecutionTrace?) -> [Kilometro] {
        guard let trace, trace.available else { return [] }
        var acumulado: Double? = 0
        return trace.splits.map { s in
            let cruce = acumulado
            if let a = acumulado, let d = s.durationS {
                acumulado = a + d
            } else {
                acumulado = nil
            }
            return Kilometro(
                n: s.index,
                parcial: s.partial,
                distanciaM: s.distanceM,
                cruceS: cruce,
                ritmoSkm: s.avgPaceSPerKm,
                fcMediaPpm: s.avgHr,
                sinCobertura: s.avgPaceSPerKm == nil
                    ? "El reloj perdió la señal en este kilómetro" : nil
            )
        }
    }

    /// EL RECORRIDO, normalizado a 0..1 y **con la forma respetada**: estirar cada
    /// eje a su propio rango convertiría una recta de ida y vuelta en un garabato.
    /// El eje largo manda y el corto se centra.
    static func rutaDe(_ trace: ExecutionTrace) -> [PuntoRuta] {
        let puntos = trace.route.points
        guard trace.route.available, puntos.count >= 2 else { return [] }
        let lats = puntos.map(\.lat), lons = puntos.map(\.lon)
        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLon = lons.min(), let maxLon = lons.max() else { return [] }
        // Un grado de longitud mide menos que uno de latitud, y cuanto más al norte
        // menos: sin corregirlo, una vuelta al parque sale aplastada.
        let mediaLat = (minLat + maxLat) / 2
        let anchoGrados = (maxLon - minLon) * cos(mediaLat * .pi / 180)
        let altoGrados = maxLat - minLat
        let lado = max(anchoGrados, altoGrados)
        guard lado > 0 else { return [] }
        let margenX = (lado - anchoGrados) / 2
        let margenY = (lado - altoGrados) / 2

        return puntos.map { p in
            let x = ((p.lon - minLon) * cos(mediaLat * .pi / 180) + margenX) / lado
            // La latitud crece hacia el norte y la pantalla hacia abajo.
            let y = 1 - ((p.lat - minLat) + margenY) / lado
            return PuntoRuta(x: x, y: y, zona: trace.route.zona(deCodigo: p.zoneCode))
        }
    }

    // MARK: - Tiempo

    /// Segundos desde el inicio de la ejecución. Nil cuando falta cualquiera de los
    /// dos instantes — se reconstruye encadenando duraciones, nunca se inventa un 0.
    static func instanteRelativo(_ iso: String?, ancla: Date?) -> Double? {
        guard let ancla, let iso, let t = ISO8601DateFormatters.parse(iso) else { return nil }
        let delta = t.timeIntervalSince(ancla)
        return delta >= 0 ? delta : nil
    }
}
