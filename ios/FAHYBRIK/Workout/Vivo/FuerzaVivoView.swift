import SwiftUI

// EL HIERRO EN VIVO — la serie que tienes delante, en el lenguaje del §10.
//
// La diferencia con correr o con un ergómetro no es estética: es DE MANDO. Allí
// el aparato mide y la app cuenta; aquí la app no mide reps ni carga ni RIR —
// **gobierna el atleta**. Lo único que SÍ puede medir del levantamiento es la
// VELOCIDAD de la barra. De ahí las reglas:
//
//   1. El sujeto es LA DOSIS DE ESTA SERIE (`10 × 82,5 kg`), siempre.
//   2. La acción es `unicaSalida` mientras trabajas (§10.5): el toque es lo ÚNICO
//      que cierra la serie. Descansando NO lo es —el reloj también lo cierra— y
//      ahí va de contorno.
//   3. Nada pasa de prescrito a hecho sin que él lo diga (§7). Lo que sintió se
//      pregunta; no se copia del plan.
//   4. El descanso es DOSIS, así que cuando corre es él quien manda la banda.
//
// POR QUÉ EL SUJETO ES LA DOSIS Y NO LA CUENTA DE SERIE (la decisión que esta
// pantalla tenía que tomar, y es la CONTRARIA que la cara por rondas):
//
//   · LAS SERIES NO SON IGUALES. Lo que mueve la cuenta al numeral en un metcon
//     es que la ronda 12 repite literalmente la 11. En fuerza eso es FALSO: la
//     forma dominante del corpus es la pirámide —6-6-4-4-3, 10-8-8-6-4— así que
//     lo que cambia de una serie a la siguiente es justo la dosis. Es el dato que
//     se te cae de la cabeza, y equivocarse cuesta una serie mal hecha.
//   · EN FUERZA EL TRABAJO *ES* UN NUMERAL. El trabajo de un metcon son cuatro
//     líneas de movimientos y no cabe en la cifra grande — de ahí que allí el
//     numeral quede libre para la cuenta. «10 × 82,5» es exactamente la cifra para
//     la que se hizo el numeral del §10.2.
//
// No es una excepción al criterio de rondas: es su MISMA rama —«con pocas rondas
// manda el trabajo y la cuenta baja al cromo»— y el hierro está siempre en ella.
// La cuenta vive donde no cuesta nada: la etiqueta de encima y el riel.
//
// LO QUE SÍ COLAPSA AQUÍ ES EL RIEL, y su umbral se deriva del ANCHO medido: no
// crece hacia abajo como la lista de rondas, crece hacia dentro. Con doce series
// cada peldaño se queda en 26 pt y ahí no cabe ni «S12» — y 37 de las 75
// prescripciones de fuerza de la base tienen cinco series o más. No se colapsa a
// un cursor como el contador de rondas porque las series son HETEROGÉNEAS:
// colapsarlas destruye lo único que el riel sabe decir. Para lo heterogéneo la
// respuesta ya estaba decidida y es la de las estaciones: la VENTANA.
//
// EL MOTOR NO SE HA TOCADO: `confirmSet`, `setSetReps`, `setSetLoadCascade`,
// `setSetRPE/RIR`, `setSetSkipped`, `startRest` y el cebado de la carga siguen
// siendo los mismos. El DESCANSO es un estado de esta pantalla y no otra
// superficie porque así lo dice el motor: `superficieViva` resuelve `.fuerza`
// antes de llegar a `modalityHUD`, así que `RestSurface` (la del EMOM y los
// intervalos) nunca entra aquí. Lo que cambia es el idioma.

// MARK: - La velocidad de la barra, resuelta — lo medido y lo que no se sostiene

/// QUÉ DICE LA CELDA DE VELOCIDAD, que son cuatro cosas distintas y no dos.
///
/// La distinción que importa es entre DOS AUSENCIAS que no son la misma: sin
/// sensor no hay nada que prometer y la celda **no existe**; con sensor puesto y
/// una lectura que no se sostiene, la celda existe y dice que no se fía. Prometer
/// una medida que no va a llegar es la otra forma de mentir (§7), y pintar «rojo
/// con aplomo» sobre algo que el estimador no sostiene es peor que no medir.
enum VelocidadDeLaSerie: Equatable {
    /// El reloj no está capturando movimiento. La celda no se pinta.
    case sinSensor
    /// Sensor puesto y todavía sin ninguna repetición medida.
    case aunNo
    /// Medido, pero por debajo del mínimo de confianza: celda SIN cifra.
    case pocaConfianza
    case lectura(VelocityLiveReading)

    /// La lectura de una serie ya CERRADA, a partir de lo que el motor le estampó
    /// (`confirmSet` → `stampVelocity`). Nil cuando esa serie no trae medida.
    static func deSerieCerrada(_ rec: SetRecord) -> VelocityLiveReading? {
        guard let ms = rec.meanVelocityLastMs else { return nil }
        return VelocityLiveReading(
            metersPerSecond: ms,
            band: VelocityBand.from(velocityMs: ms, confidence: rec.velocityConfidence),
            lossPct: rec.velocityLossPct,
            confidence: rec.velocityConfidence ?? 0
        )
    }

    /// - Parameters:
    ///   - vivo: la lectura de la repetición que se acaba de cerrar DENTRO de la
    ///     serie en vuelo. Es lo que la app sabe mientras levantas, y va primero:
    ///     una lectura de hace tres minutos no describe la barra de ahora.
    ///   - cerrada: lo que quedó estampado en la última serie cerrada. Es lo que
    ///     se lee descansando, cuando la serie en vuelo ya no existe.
    ///   - sensorPuesto: de la SESIÓN, no del ejercicio.
    static func resolver(vivo: VelocityLiveReading?,
                         cerrada: VelocityLiveReading?,
                         sensorPuesto: Bool) -> VelocidadDeLaSerie {
        guard sensorPuesto else { return .sinSensor }
        if let v = vivo, v.band != .none { return .lectura(v) }
        if let c = cerrada { return c.band == .none ? .pocaConfianza : .lectura(c) }
        // Con sensor puesto y una lectura viva que no pasa el corte, lo honesto es
        // decir que no se fía — no callarse como si no hubiera puesto el reloj.
        return vivo != nil ? .pocaConfianza : .aunNo
    }

    var reading: VelocityLiveReading? {
        if case let .lectura(r) = self { return r }
        return nil
    }
}

// MARK: - La ventana del riel — la aritmética, no una preferencia

/// CUÁNTAS SERIES CABEN EN EL RIEL, y desde cuál se convierte en VENTANA.
///
/// El umbral no es un número elegido: es el primero que no cabe a lo ancho. Se
/// deriva del ancho REAL que el marco le da al riel (no de un lienzo supuesto),
/// igual que el umbral del contador de rondas se deriva del alto medido.
enum VentanaDeSeries {
    /// Lo que mide un avance de la monoespaciada, en fracción de su tamaño.
    static let avanceMono: CGFloat = 0.6
    /// EL TAMAÑO AL QUE LA DOSIS DEJA DE ENCOGERSE, que es el que manda aquí y no
    /// el nominal: el peldaño escribe en `Theme.Typography.readoutS` (22 pt) con
    /// `minimumScaleFactor(0.5)`, así que hasta 11 pt la dosis cabe encogiéndose y
    /// se sigue leyendo. El presupuesto se hace contra ese SUELO — hacerlo contra
    /// los 22 pt nominales declararía «no caben» cuatro peldaños que caben de
    /// sobra, y hacerlo por debajo dejaría pasar peldaños ilegibles.
    ///
    /// Que caiga en los mismos 11 px que estimó el doble no es coincidencia: allí
    /// se eligió a ojo el tamaño mínimo legible y aquí sale de la escala real.
    static let dosisMinimaPt: CGFloat = 11
    /// «10 × 82,5» — la dosis más larga que sale del corpus real, en glifos.
    static let glifosDosis = 10
    /// Relleno horizontal del peldaño y hueco entre peldaños.
    static let rellenoPeldanoPt: CGFloat = 8
    static let huecoPeldanoPt: CGFloat = 6

    /// Lo que necesita un peldaño para decir su dosis sin bajar del suelo legible.
    static let anchoPeldanoPt: CGFloat =
        (CGFloat(glifosDosis) * avanceMono * dosisMinimaPt).rounded(.up) + rellenoPeldanoPt

    /// La ventana: la cerrada de antes, la de ahora y la que viene.
    static let ventana = 3

    /// Cuántos peldaños con dosis caben en `ancho` puntos. Nunca menos que la
    /// ventana: por debajo de eso no hay nada que decidir, y encoger la dosis de
    /// tres peldaños se lee peor que enseñar tres apretados.
    static func caben(ancho: CGFloat) -> Int {
        guard ancho > 0 else { return ventana }
        let n = Int((ancho + huecoPeldanoPt) / (anchoPeldanoPt + huecoPeldanoPt))
        return max(ventana, n)
    }

    /// Los índices que pinta el riel. Con pocas series, todas; desde el umbral, la
    /// ventana pegada al cursor — y en los extremos se DESPLAZA en vez de
    /// encogerse, o la primera y la última serie tendrían dos peldaños de tres.
    static func visibles(total: Int, activa: Int, caben: Int) -> [Int] {
        guard total > 0 else { return [] }
        guard total > caben else { return Array(0..<total) }
        let ancho = min(ventana, total)
        let inicio = min(max(0, activa - 1), max(0, total - ancho))
        return Array(inicio..<(inicio + ancho))
    }
}

// MARK: - El presupuesto de los apoyos del hierro

/// LO QUE MIDE CADA APOYO, para que la cascada reparta contra el hueco real.
///
/// Altos FIJOS y declarados, no medidos por pieza: es lo que hace que el reparto
/// dependa del HUECO y jamás del contenido — dos ejercicios de cuatro series
/// rinden la misma cara pese lo que pesen sus nombres. La misma regla que hace
/// puro el umbral del contador de rondas. Los tests miden que la cara PINTADA
/// cabe en su cota; si un alto de aquí se queda corto, ahí salta.
enum ApoyosDelHierro {
    /// Un peldaño: rótulo de 11 + dosis en `readoutS` (22) + relleno de 9 y 9.
    static let rielPt: CGFloat = 62
    /// Y su cabecera, que SOLO existe cuando el riel es ventana: enseñando tres de
    /// doce hay que decir que son tres de doce, o el atleta cree que su ejercicio
    /// tiene tres. Con todas a la vista no hay nada que declarar y no se paga.
    static let cabeceraRielPt: CGFloat = 22
    /// La fila de celdas: etiqueta + `readoutS` + pie + relleno de 10 y 10.
    static let filaPt: CGFloat = 76
    /// La frase de la velocidad perdida: dos líneas a 12 pt.
    static let lecturaPt: CGFloat = 34
    /// El chip de lo que viene después de este tramo.
    static let siguientePt: CGFloat = 42
    /// Los ajustes de un tramo de UNA serie: paso, rueda de 84 y el salto.
    static let ajustesPt: CGFloat = 190
}

/// El hierro en vivo, dentro del marco del §10.
///
/// El CROMO lo pone el anfitrión (`ActiveWorkoutView`) y esta vista solo lo coloca
/// en la primera fila: así el ancla del §10.3 es EXACTA sin que la pantalla pierda
/// la navegación que ya tenía. La franja de CONTEXTO es suya, y ahí vive el strip
/// del formato con el reloj que no se va nunca.
struct FuerzaVivoView<Cromo: View>: View {
    let session: WorkoutSession
    let accionTitulo: String
    let alTocarAccion: () -> Void
    @ViewBuilder var cromo: Cromo

    /// La serie que el atleta está editando. Nil = ninguna, que es el estado
    /// normal: ajustar es la excepción, no el camino.
    @State private var editando: SerieEnEdicion?
    /// Espejo local de la carga de un tramo de UNA serie, cebado de la
    /// prescripción. Mismo contrato que tenía `StrengthLiveHUD`.
    @State private var cargaKg: Double?

    private var seg: WorkoutSegment? { session.currentSegment }
    private var descansando: Bool { session.restRemainingSeconds > 0 }
    private var porSeries: Bool { seg?.usesMultiSetStrength == true }
    private var admiteCarga: Bool { seg?.kind == .strength || seg?.kind == .sled }

    // LA SUPERSERIE — los ejercicios del bloque ROTAN, así que la pregunta que el
    // atleta se hace entre serie y serie deja de ser «cuál de las cuatro voy» y
    // pasa a ser «qué ejercicio toca y por qué vuelta». Esas dos cosas viven en el
    // turno (`SupersetSlot`), y la pantalla las dice donde ya miraba: la etiqueta
    // del sujeto lleva la vuelta y el nombre del trabajo lleva el ejercicio.
    private var esSuperserie: Bool { seg?.isSuperset == true }
    private func turno(_ i: Int) -> SupersetSlot? { seg?.supersetSlot(at: i) }

    /// El ejercicio del turno `i` — en una superserie, el movimiento que toca; en
    /// todo lo demás, el título del tramo, que YA es el ejercicio.
    private func movimiento(_ i: Int?) -> String {
        if let i, let t = turno(i) { return t.movement }
        return seg?.title ?? ""
    }

    var body: some View {
        MarcoVivo {
            cromo
        } contexto: {
            tira
        } sujeto: {
            BandaSujeto { sujeto }
        } apoyos: {
            CascadaApoyos { presupuesto in apoyos(presupuesto) }
        } accion: {
            FranjaAccion(titulo: tituloDeAccion,
                         // LA FUERZA LA CIERRAS TÚ, y ahí el relleno significa algo.
                         // Descansando NO: el reloj también cierra el descanso, así
                         // que saltarlo va de contorno (§10.5) — el naranja se guarda
                         // para cuando el toque es lo único que puede pasar la serie
                         // de prescrita a hecha.
                         unicaSalida: !descansando,
                         nota: notaDeAccion,
                         accion: ejecutarAccion)
        }
        .onAppear { cebarCarga() }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            editando = nil
            cargaKg = nil
            cebarCarga()
        }
        // AJUSTAR ES LA EXCEPCIÓN, y por eso vive en una hoja y no en la pantalla:
        // el editor de una serie (reps, carga, RPE, RIR) mide más que la banda de
        // apoyos entera, así que metido en la vista o la desbordaba o la obligaba a
        // rodar — y un `ScrollView` en la superficie que manejas entre series, con
        // las manos sudadas, es justo lo que no quieres tocar.
        .sheet(item: $editando) { serie in
            EditorDeSerie(session: session, indice: serie.indice)
                .presentationDetents([.medium])
        }
    }

    // MARK: - La acción — una sola, y hace lo que dice

    /// EL ATLETA GOBIERNA: mientras queden series, el botón CIERRA LA SERIE que
    /// tienes delante; cuando ya no quedan, cierra el ejercicio y lo dice.
    ///
    /// QUIÉN DECIDE QUÉ HACE EL TOQUE: el MOTOR, no esta vista. La regla «con series
    /// pendientes el toque cierra la SERIE, no el ejercicio» vivía aquí dentro, y por
    /// eso el botón «Siguiente» del reloj —que entra por `primaryAdvance` sin pasar
    /// por ninguna pantalla— cerraba el press de banca en la primera serie y saltaba
    /// al curl. Ahora la regla es del motor (`WorkoutSession.strengthPrimary`) y esta
    /// vista solo la NOMBRA.
    private var seriePendiente: Int? { session.pendingSetIndex }

    private var tituloDeAccion: String {
        if descansando { return "SALTAR EL DESCANSO" }
        guard let i = seriePendiente else { return accionTitulo }
        // En una superserie el número global («SERIE 7») no contesta nada: lo que
        // sitúa al atleta es la vuelta y el ejercicio, y eso lo dice el sujeto.
        if esSuperserie { return "SERIE HECHA" }
        return "SERIE \(session.setRecords[i].setIndex) HECHA"
    }

    private var notaDeAccion: String? {
        // Sin repetir lo que queda: eso lo dice el numeral, y la barra del strip
        // dice cuánto llevas. La nota dice lo único que no está escrito.
        if descansando { return "el descanso también es dosis" }
        guard seriePendiente == nil, porSeries else { return nil }
        return "todas las series cerradas"
    }

    private func ejecutarAccion() { alTocarAccion() }

    // MARK: - El strip del formato — la franja que no desaparece jamás

    /// FUERZA · dónde vas en la sesión · el reloj. Y cuando descansas, el descanso
    /// drenando en el sitio donde drena el tope de un metcon.
    ///
    /// Sustituye a la línea del plan, que ocupaba esta franja sin cambiar en todo el
    /// ejercicio y que en una pirámide MENTÍA (el 6-6-4-4-3 real del bloque 392 se
    /// escribía «5×6»). Lo que decía se dice ahora donde toca: la dosis de esta serie
    /// es el sujeto, las series están en el riel y el descanso prescrito es una celda.
    private var tira: some View {
        TiraFormatoVivo(
            formato: "FUERZA",
            posicion: posicionEnLaSesion,
            reloj: Formato.clock(session.elapsedSeconds, anchoFijo: true),
            cola: {
                if descansando, let total = descansoDeLaSerieCerrada, total > 0 {
                    BarraDrenaje(totalS: Double(total),
                                 restanteS: max(0, session.restRemainingSeconds))
                }
            },
            voz: vozDeLaTira
        )
    }

    /// El bloque como lo nombró el coach y dónde vas EN LA SESIÓN. Es lo único de la
    /// pantalla que no está escrito en otro sitio: la cuenta de series la dice la
    /// etiqueta del sujeto y el ejercicio está bajo el numeral.
    ///
    /// Y dice «ejercicio», que no es relleno: al lado de un «SERIE 3 DE 5» un «1 de
    /// 4» a secas se lee como otra cuenta de series.
    private var posicionEnLaSesion: String? {
        let i = session.currentSegmentIndex
        guard let region = session.plan.blockRegions.first(where: {
            i >= $0.firstIndex && i <= $0.lastIndex
        }) else { return seg?.blockTitle }
        let cuantos = region.lastIndex - region.firstIndex + 1
        guard cuantos > 1 else { return region.title }
        return "\(region.title) · ejercicio \(i - region.firstIndex + 1) de \(cuantos)"
    }

    private var vozDeLaTira: String {
        var partes = ["Fuerza"]
        if let p = posicionEnLaSesion { partes.append(p) }
        partes.append("tiempo \(Formato.clock(session.elapsedSeconds))")
        if descansando {
            partes.append("descanso, quedan \(Formato.clock(session.restRemainingSeconds))")
        }
        return partes.joined(separator: ". ")
    }

    /// El descanso que traía la serie que se acaba de cerrar — el TOTAL contra el
    /// que drena la barra. Es de la serie CERRADA y no de la que viene: son dos
    /// números distintos en una pirámide con descansos desiguales.
    private var descansoDeLaSerieCerrada: Int? {
        let cerradas = session.setRecords.filter { $0.confirmed || $0.status == "skipped" }
        return cerradas.last?.restS ?? session.setRecords.compactMap(\.restS).first
    }

    // MARK: - El sujeto

    @ViewBuilder
    private var sujeto: some View {
        if descansando {
            sujetoDescanso
        } else if porSeries, seriePendiente == nil, !session.setRecords.isEmpty {
            // TODAS CERRADAS. Sin esto el sujeto seguía siendo la última serie con su
            // «SERIE 4 DE 4», que se lee como si quedara por hacer justo cuando ya no
            // queda nada: el ejercicio pasa a ser el sujeto y el riel de abajo es el
            // resumen de lo que hiciste.
            EtiquetaSujeto(texto: "Ejercicio hecho")
            nombreComoSujeto(movimiento(indiceSerieActual))
        } else if porSeries, let i = indiceSerieActual {
            sujetoDeSerie(i)
        } else if seg?.repsArePrimable == true {
            sujetoPrescrito
        } else {
            sujetoContado
        }
    }

    /// EL DESCANSO ES DOSIS, y mientras corre es lo que está pasando.
    ///
    /// En TINTA NORMAL, no en azul. El §10.2 dice que el único sujeto que se pinta
    /// de un color es el PULSO, del color de su zona; los demás dejan el color al
    /// ambiente, que ya se ha teñido de calma porque el pulso ha bajado. Que estás
    /// descansando lo dicen la etiqueta, la forma de reloj de la cifra, la barra
    /// drenando arriba y la acción en contorno — cuatro señales sin gastar el
    /// presupuesto de color de la app.
    @ViewBuilder
    private var sujetoDescanso: some View {
        EtiquetaSujeto(texto: Vocab.descanso)
        Numeral(texto: Formato.clock(max(0, session.restRemainingSeconds), anchoFijo: true))
        if let siguiente = textoSerieSiguiente {
            // Lo que viene, dicho una vez. El pulso NO sube aquí aunque sea lo que de
            // verdad estás haciendo: vive en la fila de apoyos, que no desaparece.
            Text("Luego · \(siguiente)")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
        }
    }

    /// LA DOSIS DE LA SERIE QUE TIENES DELANTE, con la carga en cualquiera de sus
    /// formas — kilos, banda de porcentaje, peso corporal o uno por mano.
    ///
    /// `10 × 82,5` es UNA cosa y así se lee: la cifra no se parte, que invertiría la
    /// jerarquía; de que quepa se encarga el presupuesto de ancho de `EscalaNumeral`
    /// (§10.2). Un PORCENTAJE sí baja al segundo peldaño, y no por sitio: «6 × 75-85»
    /// se lee como kilos y no lo son.
    @ViewBuilder
    private func sujetoDeSerie(_ i: Int) -> some View {
        let rec = session.setRecords[i]
        // En una superserie la cuenta que sitúa es la VUELTA, no el número global de
        // la serie: «Ronda 2 de 4» y, debajo, el ejercicio que toca.
        let t = turno(i)
        EtiquetaSujeto(texto: t.map { "\(Vocab.ronda) \($0.round) de \($0.rounds)" }
            ?? "\(Vocab.serie) \(rec.setIndex) de \(session.setRecords.count)")
        if let dosis = dosisDeLaSerie(rec, indice: i) {
            if let cifra = dosis.sujeto {
                Numeral(texto: cifra.cifra, unidad: cifra.unidad)
            }
            if let segundo = dosis.segundo {
                Numeral(texto: segundo.cifra, escala: .segundo, unidad: segundo.unidad)
            }
            if dosis.sujeto != nil {
                NombreDelTrabajo(texto: movimiento(i))
            } else {
                // Sin cifra el sujeto ES el nombre, y va en la voz de titular: el
                // mono es para lo que se compara columna a columna (§4).
                nombreComoSujeto(movimiento(i))
            }
            if let pie = dosis.pieDeCarga {
                Text(pie)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }
        } else {
            nombreComoSujeto(movimiento(i))
        }
        // EL HUECO DECLARADO: un fondo LASTRADO sin lastre escrito no se rellena con
        // un cero ni se calla del todo — se dice, porque el atleta tiene que saber que
        // la decisión es suya. Solo donde una carga tiene sentido: un ejercicio de core
        // sin kilos no tiene ningún hueco que declarar.
        if admiteCarga, cargaDeLaSerie(rec, indice: i) == nil {
            // El copy le habla al ATLETA, no a quien construyó esto: «el plan no
            // dice» describe el sistema por dentro. Lo que él necesita saber es
            // que el peso lo elige él.
            Text("tú eliges el peso")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
        }
        if let pastilla = pastillaIntensidad(i) {
            Text(pastilla)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.accentText)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, 5)
                .background(Theme.Color.accent.opacity(0.16), in: Capsule())
        }
        // De dónde sale el número que estás viendo cuando NO lo has escrito tú: la
        // muñeca lo está contando. No es la velocidad (esa vive en su celda de la
        // fila) — es la procedencia de las repeticiones del numeral, que si no se
        // dice parece una errata del plan.
        if let contadas = sensorRepsLabel(for: i) {
            Text(contadas)
                .scaledFont(12, weight: .heavy, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    @ViewBuilder
    private func nombreComoSujeto(_ texto: String) -> some View {
        Text(texto)
            .scaledFont(34, weight: .heavy, relativeTo: .largeTitle, italic: true)
            .foregroundStyle(Theme.Color.foreground)
            .multilineTextAlignment(.center)
            .lineLimit(2).minimumScaleFactor(0.6)
    }

    /// LA CARGA DE ESTA SERIE, en la forma en que el coach la escribió.
    ///
    /// Lo DECLARADO manda sobre lo prescrito, y solo cuando el atleta lo ha dicho:
    /// en cuanto ajusta el peso, lo que gobierna la pantalla son sus kilos y no el
    /// porcentaje del plan. Mientras no toque nada, se enseña lo escrito — que en
    /// media prescripción del corpus no son kilos.
    private func cargaDeLaSerie(_ rec: SetRecord, indice: Int) -> Formato.CargaDeSerie? {
        if let real = rec.loadActualKg { return .kg(real) }
        if let prescrita = seg?.prescription?.sets.flatMap({
            $0.indices.contains(indice) ? $0[indice].prescribedCarga : nil
        }) { return prescrita }
        // El suelo: el tramo trae una carga plana y ninguna serie la desglosa.
        if let kg = rec.loadPrescribedKg { return .kg(kg) }
        return nil
    }

    private func dosisDeLaSerie(_ rec: SetRecord, indice: Int) -> Formato.DosisDeSerie? {
        Formato.dosisDeSerie(
            reps: rec.repsActual ?? rec.repsPrescribed,
            // La BANDA solo mientras la serie sigue siendo la del plan: en cuanto el
            // atleta dice qué hizo, lo que manda es su número, no el margen.
            repsMax: rec.confirmed ? nil : rec.repsPrescribedMax,
            carga: cargaDeLaSerie(rec, indice: indice)
        )
    }

    /// «sensor · 7» cuando la muñeca está llenando la serie abierta.
    private func sensorRepsLabel(for setIndex: Int) -> String? {
        guard session.setRecords.indices.contains(setIndex) else { return nil }
        let rec = session.setRecords[setIndex]
        guard !rec.confirmed,
              rec.repsSource == RepsSource.sensor.rawValue || rec.repsSource == RepsSource.sensorCorrected.rawValue,
              let n = rec.repsActual, n > 0 else { return nil }
        return "sensor · \(n)"
    }

    /// Un tramo de UNA serie con dosis escrita: el sujeto es lo prescrito, y
    /// confirmarlo cuesta cero toques (lo sella el botón de abajo). Ajustar es la
    /// excepción y vive en los apoyos.
    @ViewBuilder
    private var sujetoPrescrito: some View {
        EtiquetaSujeto(texto: session.repsSkipped ? "Saltado" : Vocab.objetivo)
        if session.repsSkipped {
            // Saltado: no hay cifra que enseñar y no se finge una. Manda el nombre.
            Text(seg?.title ?? "")
                .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(2).minimumScaleFactor(0.6)
        } else if let dosis = Formato.serie(reps: session.repsCurrentSegment,
                                            cargaKg: admiteCarga ? (cargaKg ?? seg?.loadKg) : nil) {
            Numeral(texto: dosis.cifra, unidad: dosis.unidad)
            NombreDelTrabajo(texto: seg?.title ?? "")
            if let p = seg?.prescribedRepsForLog, p != session.repsCurrentSegment {
                DeltaPastilla(delta: Delta(valor: Double(session.repsCurrentSegment - p),
                                           unidad: Vocab.reps,
                                           sentido: .mas,
                                           sufijo: "vs lo prescrito",
                                           textoNulo: "como estaba escrito"))
            }
        }
    }

    /// Puntuación abierta: las repeticiones SON el marcador y suben desde un cero
    /// legal. Aquí el cero sí es un dato — alguien está contando, y es el atleta.
    @ViewBuilder
    private var sujetoContado: some View {
        Button(action: { session.tap(); Haptics.light() }) {
            VStack(spacing: 6) {
                EtiquetaSujeto(texto: Vocab.reps, tono: Theme.Color.accentText)
                Numeral(texto: "\(session.repsCurrentSegment)", tono: Theme.Color.accentText)
                NombreDelTrabajo(texto: seg?.title ?? "")
                Text("toca para sumar una")
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Sumar repetición. Llevas \(session.repsCurrentSegment)")
    }

    /// Lo que el coach pidió de intensidad, traducido. El número solo no dice qué
    /// hacer, y el atleta que entra hoy no ha visto la escala nunca.
    ///
    /// La serie manda sobre el bloque, pero el bloque es el caso NORMAL: el coach
    /// escribe «RIR 2» una vez para el ejercicio entero y solo lo baja en la serie
    /// que quiere distinta.
    private func pastillaIntensidad(_ i: Int) -> String? {
        let p = seg?.prescription
        let deLaSerie = p?.sets.flatMap { $0.indices.contains(i) ? $0[i] : nil }
        if let rir = deLaSerie?.prescribedRir ?? bloqueRir { return Vocab.rirTraducido(Int(rir.rounded())) }
        if let rpe = deLaSerie?.prescribedRpe ?? bloqueRpe { return "\(Vocab.rpe) \(Formato.esDecimal(rpe))" }
        return nil
    }

    private var bloqueRir: Double? {
        if case let .rir(valor, minimo, _) = seg?.prescription?.target { return valor ?? minimo }
        return nil
    }

    private var bloqueRpe: Double? {
        if case let .rpe(valor, minimo, _) = seg?.prescription?.target { return valor ?? minimo }
        return nil
    }

    /// La serie que viene, para el descanso. Nil cuando esta era la última.
    ///
    /// En una superserie el descanso es justo donde se pierde el hilo —lo siguiente
    /// es OTRO ejercicio—, así que la línea lo nombra: «Luego · Remo · 10 × 60 kg».
    private var textoSerieSiguiente: String? {
        guard let i = indiceSerieActual else { return nil }
        let rec = session.setRecords[i]
        guard !rec.confirmed else { return nil }
        let cuenta = "\(Vocab.serie.lowercased()) \(rec.setIndex) de \(session.setRecords.count)"
        let dosis = dosisDeLaSerie(rec, indice: i)?.sujeto?.linea
        guard let movimiento = turno(i)?.movement else {
            return [cuenta, dosis].compactMap { $0 }.joined(separator: " · ")
        }
        return [movimiento, cuenta, dosis].compactMap { $0 }.joined(separator: " · ")
    }

    /// La serie que toca: la primera sin confirmar y sin saltar. Cuando están
    /// todas hechas manda la última, porque es la que el atleta acaba de cerrar.
    private var indiceSerieActual: Int? {
        guard !session.setRecords.isEmpty else { return nil }
        let pendiente = session.setRecords.firstIndex { !$0.confirmed && $0.status != "skipped" }
        return pendiente ?? session.setRecords.indices.last
    }

    // MARK: - Los apoyos — cascada por prioridad sobre el hueco MEDIDO

    /// QUÉ ENTRA EN LOS APOYOS, y el orden no es estético.
    ///
    /// El RIEL dice dónde vas y cómo fueron las anteriores (sin él la pantalla no
    /// sitúa) y además es la única puerta al ajuste, así que **no se recorta**: es
    /// una función, y una función no cae porque la pantalla venga apretada — la
    /// misma regla que protege el deshacer de la cara por rondas. La FILA lleva lo
    /// medido (velocidad, pulso) y el tiempo. La LECTURA interpreta lo que acabas de
    /// hacer. Y LO SIGUIENTE es contexto que se puede mirar al acabar, así que es lo
    /// primero que cae.
    ///
    /// La lectura y la fila no compiten por casualidad: la pérdida de velocidad se
    /// lee con la serie ya CERRADA —cara de descanso— y es la misma ranura
    /// contestando a «¿qué haces AHORA?».
    /// Interno (no privado) a propósito: la cota que hay que medir es la de la cara
    /// que se PINTA, no la del marco que la contiene — `MarcoVivoLayout` propone un
    /// alto fijo, así que medir la pantalla entera nunca delataría unos apoyos que
    /// se derraman. Los tests miden esto contra el hueco real.
    @ViewBuilder
    func apoyos(_ presupuesto: PresupuestoApoyos) -> some View {
        let plan = reparto(presupuesto)
        if plan.riel {
            RielDeSeries(series: session.setRecords,
                         actual: indiceSerieActual,
                         turnos: seg?.supersetSlots,
                         caben: VentanaDeSeries.caben(ancho: presupuesto.ancho),
                         alTocar: { editando = SerieEnEdicion(indice: $0) })
        }
        if plan.ajustes { ajustesDeTramo }
        if plan.fila { filaDeApoyos }
        if plan.lectura, let frase = lecturaDeVelocidad { frase }
        if plan.siguiente { SiguienteTramoChip(siguiente: session.nextSegment) }
    }

    struct Reparto: Equatable {
        var riel = false
        var ajustes = false
        var fila = false
        var lectura = false
        var siguiente = false
    }

    /// El reparto, contra el hueco real y en orden de prioridad. Vive aparte del
    /// pintado para que se pueda MEDIR sin montar la pantalla.
    func reparto(_ presupuesto: PresupuestoApoyos) -> Reparto {
        var p = presupuesto
        var salida = Reparto()
        if porSeries {
            let alto = ApoyosDelHierro.rielPt
                + (session.setRecords.count > VentanaDeSeries.caben(ancho: p.ancho)
                   ? ApoyosDelHierro.cabeceraRielPt : 0)
            // Obligatorio: es la única puerta al ajuste de una serie.
            salida.riel = p.cabe(alto, obligatorio: true)
        } else if seg?.repsArePrimable == true || admiteCarga {
            // Y en un tramo de UNA serie, los ajustes son la única forma de registrar.
            salida.ajustes = p.cabe(ApoyosDelHierro.ajustesPt, obligatorio: true)
        }
        salida.fila = p.cabe(ApoyosDelHierro.filaPt)
        if descansando, lecturaDeVelocidad != nil {
            salida.lectura = p.cabe(ApoyosDelHierro.lecturaPt)
        }
        if session.nextSegment != nil {
            salida.siguiente = p.cabe(ApoyosDelHierro.siguientePt)
        }
        return salida
    }

    /// La fila: lo MEDIDO primero, y el tiempo después.
    ///
    /// La velocidad abre la fila porque es lo único del levantamiento que la app
    /// mide — el resto es tiempo y pulso. Y va aquí y no en la banda porque no es lo
    /// que se te cae de la cabeza (nunca lo has sabido): es lo que la app te AÑADE,
    /// y se lee entre series, cuando decides con cuánto va la siguiente. La banda es
    /// del sujeto, que es la prescripción; esto es la ejecución.
    @ViewBuilder
    private var filaDeApoyos: some View {
        FilaApoyos {
            switch velocidad {
            case .sinSensor:
                // Sin sensor la celda NO EXISTE: prometer una medida que no va a
                // llegar es la otra forma de mentir (§7).
                EmptyView()
            case .aunNo:
                ApoyoVivo(etiqueta: Vocab.velocidad, valor: nil, ausente: "aún no")
            case .pocaConfianza:
                // Con sensor y sin lectura fiable la celda existe y dice que no se
                // fía, en vez de pintar un número que no se sostiene.
                ApoyoVivo(etiqueta: Vocab.velocidad, valor: nil, ausente: "poca confianza")
            case let .lectura(r):
                // El tono es el semáforo, y la PALABRA va en el pie: un dato que solo
                // se dice con color no lo lee quien no distingue el verde del ámbar.
                ApoyoVivo(etiqueta: Vocab.velocidad,
                          valor: r.mpsText,
                          tono: r.band.tono,
                          pie: "m/s · \(r.band.label.lowercased())")
            }
            ApoyoVivo(etiqueta: Vocab.fc,
                      valor: session.liveHRBpm.map { "\($0)" },
                      tono: session.liveZone?.color ?? Theme.Color.foreground,
                      ausente: "sin reloj",
                      pie: Vocab.ppm)
            // LA PAUSA, no una «vuelta»: lo que se pregunta entre series es cuánto
            // llevas parado, y sigue contando cuando el descanso prescrito ya se
            // agotó — que es justo cuando dejas de saberlo.
            ApoyoVivo(etiqueta: Vocab.pausa,
                      valor: session.secondsSinceLastSet.map { Formato.clock($0, anchoFijo: true) },
                      ausente: "aún no",
                      pie: "desde la última")
            // El descanso del plan cae cuando el sensor ocupa una celda: cuatro caben,
            // cinco no, y entre «lo que pide el plan» y lo que la barra ha hecho de
            // verdad gana lo medido. Sigue estando en la cara del descanso, que es
            // donde se cobra: drenando en el strip de arriba.
            if velocidad == .sinSensor, let d = descansoPrescrito {
                ApoyoVivo(etiqueta: Vocab.descanso,
                          valor: Formato.clock(d, subMinuto: .segundos),
                          pie: "prescrito")
            }
        }
    }

    private var descansoPrescrito: Int? {
        session.setRecords.compactMap(\.restS).first
    }

    // MARK: - La velocidad de la barra

    /// ¿Está el reloj capturando movimiento? Es de la SESIÓN, no del ejercicio: o
    /// hay un espejo mandando conclusiones, o alguna serie ya trae medida estampada.
    private var sensorPuesto: Bool {
        session.sensorConclusions != nil
            || session.setRecords.contains { $0.meanVelocityLastMs != nil }
    }

    private var velocidad: VelocidadDeLaSerie {
        VelocidadDeLaSerie.resolver(
            vivo: VelocityLive.reading(from: session.sensorConclusions),
            cerrada: ultimaSerieMedida.flatMap(VelocidadDeLaSerie.deSerieCerrada),
            sensorPuesto: sensorPuesto
        )
    }

    /// La última serie CERRADA que trae medida. Hacia atrás: la de ahora está en
    /// vuelo y su velocidad todavía no se ha estampado.
    private var ultimaSerieMedida: SetRecord? {
        session.setRecords.last { $0.confirmed && $0.meanVelocityLastMs != nil }
    }

    /// LO QUE HAS PERDIDO DENTRO DE LA SERIE, como FRASE y no como cifra —
    /// monoespaciar lo que hay que interpretar lo disfraza de medida (§4), y un
    /// número que hay que interpretar de cabeza a 170 ppm no se interpreta.
    ///
    /// Solo con la serie ya cerrada: es lo que se lee descansando, cuando decides
    /// con cuánto va la siguiente.
    private var lecturaDeVelocidad: Text? {
        guard descansando,
              let r = velocidad.reading,
              let perdida = r.lossPct, perdida > 0.5 else { return nil }
        return Text("Tu última repetición fue \(r.band.label.lowercased()): "
                    + "\(r.mpsText) m/s, un \(Int(perdida.rounded())) % menos que la primera de la serie.")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.Color.muted)
    }

    // MARK: - Los ajustes de un tramo de UNA serie

    @ViewBuilder
    private var ajustesDeTramo: some View {
        VStack(spacing: Theme.Spacing.s) {
            if seg?.repsArePrimable == true, !session.repsSkipped {
                PasoEntero(etiqueta: Vocab.reps,
                           valor: session.repsCurrentSegment,
                           alCambiar: { session.setReps($0) })
            }
            if admiteCarga {
                RuedaDeCarga(valor: cargaKg ?? seg?.loadKg ?? 20,
                             alCambiar: { cargaKg = $0; session.manualLoadKg = $0 })
            }
            if seg?.repsArePrimable == true {
                Button(action: { session.setRepsSkipped(!session.repsSkipped); Haptics.light() }) {
                    Text(session.repsSkipped ? "Deshacer salto" : "Saltar ejercicio")
                        .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(session.repsSkipped ? Theme.Color.accentText : Theme.Color.muted)
                        .underline()
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func cebarCarga() {
        guard admiteCarga else { cargaKg = nil; return }
        session.primeManualLoadIfNeeded()
        cargaKg = session.manualLoadKg
    }
}

// MARK: - El riel de series — dónde estás en el ejercicio

/// LAS SERIES A LO ANCHO, con la que tienes delante encendida.
///
/// Es un RIEL, no una tabla: dice en qué serie vas y cómo quedaron las anteriores.
/// La tabla que había antes crecía con el número de series hasta empujar la acción
/// fuera de la pantalla, y encima ponía el gesto que repites cuatro veces
/// («hecha») en un botón de 12 pt.
///
/// Y ES UNA VENTANA cuando no caben. No un cursor como el contador de rondas: las
/// rondas de un metcon son HOMOGÉNEAS (la 12 repite la 11) y colapsarlas concentra;
/// las series de fuerza son HETEROGÉNEAS —6-6-4-4-3— y colapsarlas destruye la
/// única cosa que el riel sabe decir. Con la ventana de tres, las dos preguntas que
/// se hace el que está levantando («cómo fue la última», «cambia la siguiente»)
/// siguen contestadas; con doce peldaños ilegibles, ninguna.
///
/// Tocar una serie abre su editor, y eso la ventana NO se lo lleva por delante: un
/// rediseño que quita una función y se llama mejora es lo que el deshacer de la
/// cara por rondas tuvo prohibido.
///
/// EN UNA SUPERSERIE EL RIEL ES LA VUELTA, no el bloque entero: tres ejercicios por
/// cuatro vueltas son doce peldaños, y doce no contestan «¿qué me queda de ESTA
/// vuelta?». Así que la rotación se recorta a los turnos de la vuelta en curso y
/// cada peldaño se rotula con su EJERCICIO en vez de con un número global.
struct RielDeSeries: View {
    let series: [SetRecord]
    let actual: Int?
    /// La rotación de la superserie, un turno por serie y en el mismo orden. Nil en
    /// una serie recta, donde los peldaños son las series del mismo ejercicio.
    var turnos: [SupersetSlot]? = nil
    /// Cuántos peldaños caben legibles en el ancho que el marco dio. Lo deriva
    /// `VentanaDeSeries.caben(ancho:)` de la geometría real.
    var caben: Int = VentanaDeSeries.ventana
    let alTocar: (Int) -> Void

    /// Los peldaños de la VUELTA en una superserie; todas las series en fuerza recta.
    private var delTurno: [SetRecord] {
        guard let turnos, let actual, turnos.indices.contains(actual) else { return series }
        let vuelta = turnos[actual].round
        return series.filter { rec in
            let i = rec.setIndex - 1
            return turnos.indices.contains(i) && turnos[i].round == vuelta
        }
    }

    /// Y de esos, los que se pintan: todos mientras quepan, y la ventana pegada al
    /// cursor cuando no.
    private var visibles: [SetRecord] {
        let candidatos = delTurno
        let cursor = candidatos.firstIndex { $0.setIndex - 1 == actual } ?? max(0, candidatos.count - 1)
        return VentanaDeSeries.visibles(total: candidatos.count, activa: cursor, caben: caben)
            .map { candidatos[$0] }
    }

    private var esVentana: Bool { delTurno.count > caben }

    private func turno(_ rec: SetRecord) -> SupersetSlot? {
        let i = rec.setIndex - 1
        guard let turnos, turnos.indices.contains(i) else { return nil }
        return turnos[i]
    }

    var body: some View {
        VStack(spacing: 6) {
            // La cabecera SOLO cuando es ventana: enseñando tres de doce hay que decir
            // que son tres de doce, o el atleta cree que su ejercicio tiene tres. Con
            // todas a la vista no hay nada que declarar y no se paga su alto.
            if esVentana {
                HStack(alignment: .firstTextBaseline) {
                    LabelText(text: "Tus series", size: 10)
                    Spacer()
                    Text("\(delTurno.filter(\.confirmed).count) cerradas de \(delTurno.count)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            HStack(spacing: VentanaDeSeries.huecoPeldanoPt) {
                ForEach(visibles) { rec in
                    let i = rec.setIndex - 1
                    Button(action: { Haptics.light(); alTocar(i) }) {
                        peldano(rec, esLaDeAhora: i == actual)
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel(voz(rec, esLaDeAhora: i == actual))
                }
            }
        }
    }

    private func peldano(_ rec: SetRecord, esLaDeAhora: Bool) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                if rec.confirmed, rec.status != "skipped" {
                    // Verde la que se hizo como estaba escrita, ÁMBAR la que se
                    // ajustó: antes de decidir la siguiente, eso es lo que quieres ver.
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(rec.status == "scaled" ? Theme.Color.warning : Theme.Color.ok)
                }
                Text(turno(rec)?.movement ?? "S\(rec.setIndex)")
                    .scaledFont(11, weight: .heavy, relativeTo: .caption2, italic: true)
                    .foregroundStyle(esLaDeAhora ? Theme.Color.accentText : Theme.Color.muted)
                    .lineLimit(1).minimumScaleFactor(0.5)
            }
            Text(dosis(rec))
                .font(Theme.Typography.readoutS)
                .foregroundStyle(esLaDeAhora ? Theme.Color.foreground : Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .padding(.horizontal, 4)
        .background(
            // Translúcida: el tinte de zona se ve DEBAJO, o el ambiente se corta
            // en una línea recta a media pantalla.
            esLaDeAhora ? Theme.Color.accent.opacity(0.16) : Theme.Color.surface.opacity(0.78),
            in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(esLaDeAhora ? Theme.Color.accentText.opacity(0.55) : Theme.Color.hairline,
                        lineWidth: esLaDeAhora ? 1.5 : 1)
        )
        .opacity(rec.status == "skipped" ? 0.45 : 1)
    }

    /// Lo prescrito, o lo REGISTRADO en cuanto se confirma: si en la 3 bajaste el
    /// peso, eso es justo lo que quieres ver antes de decidir la 4. Una serie sin
    /// dosis escrita —el circuito real del coach— no pinta un guion: se calla.
    private func dosis(_ rec: SetRecord) -> String {
        let reps = rec.confirmed ? (rec.repsActual ?? rec.repsPrescribed) : rec.repsPrescribed
        let kg = rec.confirmed ? (rec.loadActualKg ?? rec.loadPrescribedKg) : rec.loadPrescribedKg
        return Formato.serie(reps: reps,
                             repsMax: rec.confirmed ? nil : rec.repsPrescribedMax,
                             cargaKg: kg)?.linea ?? "·"
    }

    private func voz(_ rec: SetRecord, esLaDeAhora: Bool) -> String {
        let estado = rec.status == "skipped" ? "saltada"
            : rec.confirmed ? (rec.status == "scaled" ? "ajustada" : "hecha")
            : (esLaDeAhora ? "la que toca" : "pendiente")
        // El lector de pantalla dice lo mismo que se ve: en una rotación, el
        // ejercicio y la vuelta; en fuerza recta, el número de la serie.
        let quien = turno(rec).map { "\($0.movement), \(Vocab.ronda.lowercased()) \($0.round) de \($0.rounds)" }
            ?? "Serie \(rec.setIndex)"
        return "\(quien), \(estado), \(dosis(rec)). Tocar para ajustar"
    }
}

// MARK: - Los estados de diseño, para abrirlos en el lienzo de Xcode

#if DEBUG
/// El caso de la captura, verbatim de la plantilla 503: Back Squat 4×10 a 82,5 kg
/// con 1:30 de descanso, y el atleta en la serie 2.
private func fuerzaDePrueba(zonas: HRZoneProfile? = nil,
                            bpm: Int? = nil,
                            series: [Int] = [10, 10, 10, 10],
                            carga: Target = .kg(value: 82.5, min: nil, max: nil),
                            cerradas: Int = 1,
                            descansando: Bool = false) -> WorkoutSession {
    let sets = series.enumerated().map { i, reps in
        PrescriptionSet(measure: .reps(reps),
                        target: carga,
                        modality: nil,
                        // La última serie no lleva descanso: no se descansa después
                        // de la última, y la base lo escribe así.
                        restS: i == series.count - 1 ? nil : 90,
                        tempo: nil, note: nil)
    }
    let p = Prescription(scheme: .sets, modality: nil, sets: sets,
                         rounds: nil, workS: nil, restS: nil, totalS: nil,
                         target: .rir(value: 2, min: nil, max: nil),
                         note: nil, start: nil, increment: nil)
    let tramo = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength,
                               targetReps: series.first, loadKg: nil,
                               blockTitle: "Fuerza inferior pesada", blockPosition: 1,
                               prescription: p)
    let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                           estimatedDurationSeconds: 1200, blockContext: "Fuerza",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, warmupChecklist: [])
    let sesion = WorkoutSession(plan: plan, hrZones: zonas)
    sesion.liveHRBpm = bpm
    sesion.primeSetsIfNeeded()
    for i in 0..<cerradas { sesion.confirmSet(i) }
    if !descansando { sesion.dismissRest() }
    return sesion
}

private func zonasFuerzaDePrueba() -> HRZoneProfile {
    HRZoneProfile(
        lthrBpm: 170, estimated: false, source: "test",
        sourceLabel: "Zonas de tu test de umbral", confidence: "measured",
        zones: [
            HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
            HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
            HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
            HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
            HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
        ]
    )
}

@ViewBuilder
private func lienzoFuerza(_ sesion: WorkoutSession) -> some View {
    ZStack {
        Theme.Color.background.ignoresSafeArea()
        Ambiente(zona: sesion.liveZone)
        FuerzaVivoView(session: sesion, accionTitulo: "HECHO", alTocarAccion: {}) {
            HStack {
                Image(systemName: "xmark").foregroundStyle(Theme.Color.muted)
                Text("‖").foregroundStyle(Theme.Color.muted)
                Spacer()
                MonoText(text: "BACK SQUAT", size: 11, color: Theme.Color.muted)
                Spacer()
                MonoText(text: "1/1", size: 11, color: Theme.Color.muted)
            }
        }
    }
}

/// LA SERIE — el sujeto es la dosis, el reloj está arriba y la fila lleva lo medido.
#Preview("Hierro · serie 2 de 4") {
    lienzoFuerza(fuerzaDePrueba(zonas: zonasFuerzaDePrueba(), bpm: 142))
}

/// EL DESCANSO — la misma pantalla con el sujeto cambiado. En tinta normal, con la
/// barra drenando en el strip y la acción en contorno.
#Preview("Hierro · descansando") {
    lienzoFuerza(fuerzaDePrueba(zonas: zonasFuerzaDePrueba(), bpm: 128,
                                cerradas: 2, descansando: true))
}

/// LA PIRÁMIDE del bloque 392 real: 6-6-4-4-3 al 75-85 %. Cinco series que no son
/// iguales y una carga que no está en kilos y que NO se convierte.
#Preview("Hierro · pirámide al 75-85 %") {
    lienzoFuerza(fuerzaDePrueba(zonas: zonasFuerzaDePrueba(), bpm: 138,
                                series: [6, 6, 4, 4, 3],
                                carga: .percentRM(value: nil, min: 75, max: 85),
                                cerradas: 2))
}

/// SIN ANCLA DE FC — ni zonas del servidor ni reloj en la muñeca. NO hay tinte y
/// donde iría el pulso se dice por qué no está (§7). El sujeto no cambia.
#Preview("Hierro · sin ancla de FC") {
    lienzoFuerza(fuerzaDePrueba())
}
#endif
