import SwiftUI

// EL HIERRO EN VIVO — la serie que tienes delante, en el lenguaje del §10.
//
// La diferencia con correr o con un ergómetro no es estética: es DE MANDO. Allí
// el aparato mide y la app cuenta; aquí la app no puede medir NADA — ni una
// repetición, ni un kilo, ni el RIR. **Gobierna el atleta**, y el reloj solo
// entra cuando sueltas la barra. De ahí salen las reglas de esta pantalla:
//
//   1. El sujeto es LA SERIE (`5 × 100 kg`), no el ejercicio ni el cronómetro.
//   2. La acción es `unicaSalida` (§10.5): el toque es lo ÚNICO que cierra la
//      serie, y ese es exactamente el sitio donde el relleno naranja significa
//      algo. En el EMOM, donde cierra el reloj, va en contorno.
//   3. Nada pasa de prescrito a hecho sin que él lo diga (§7). Lo que sintió se
//      pregunta; no se copia del plan.
//   4. El descanso es DOSIS, así que cuando corre es él quien manda la banda.
//
// QUÉ CAMBIÓ EL 29-JUL. La pantalla anterior (`StrengthLiveHUD`, `StrengthSetsHUD`
// y `PrefilledRepStepper`, borradas) no tenía sujeto: era una tabla. El dato que
// gobierna —qué serie te toca y con cuánto— vivía dentro de una fila de lista de
// 14 pt en `monospaced`, mientras el `readoutHero` se lo llevaba un contador de
// repeticiones que en un 5×5 no dice nada. El pulso se pintaba «—» sin reloj
// (§7), había cuatro tratamientos de número grande (§10.2) y el descanso era una
// banderita de 18 pt en una esquina cuando es la mitad de la dosis.
//
// EL ANCHO, QUE ES LO QUE ROMPIÓ ESTA FAMILIA UNA VEZ: «5 × 100» son siete
// avances de la monoespaciada y a 125 pt miden 525 sobre un lienzo de 378. La
// tentación es partir la prescripción en dos peldaños («100 kg» con un «5 reps»
// colgando), y eso INVIERTE la jerarquía — en fuerza se leen las repeticiones y
// luego la carga, y son UNA cosa. La cifra no se parte: `EscalaNumeral` tiene
// presupuesto de ancho y la encoge lo justo. El arreglo va a la raíz.
//
// EL MOTOR NO SE HA TOCADO: `confirmSet`, `setSetReps`, `setSetLoadCascade`,
// `setSetRPE/RIR`, `setSetSkipped`, `startRest` y el cebado de la carga siguen
// siendo los mismos. FH-46 solo cambia el CUÁNDO: al cerrar el ejercicio se
// declara un kg con la `KgWheel` que ya existía.

/// El hierro en vivo, dentro del marco del §10.
///
/// El CROMO lo pone el anfitrión (`ActiveWorkoutView`) y esta vista solo lo coloca
/// en la primera fila: así el ancla del §10.3 es EXACTA sin que la pantalla pierda
/// la navegación que ya tenía.
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
    /// Rueda al CERRAR el ejercicio (FH-46): un kg para este tramo, no por serie.
    @State private var cierreDeCarga: CierreDeCarga?

    private var seg: WorkoutSegment? { session.currentSegment }
    private var descansando: Bool { session.restRemainingSeconds > 0 }
    private var porSeries: Bool { seg?.usesMultiSetStrength == true }
    private var admiteCarga: Bool { seg?.kind == .strength || seg?.kind == .sled }

    var body: some View {
        MarcoVivo {
            cromo
        } contexto: {
            contexto
        } sujeto: {
            BandaSujeto { sujeto }
        } apoyos: {
            apoyos
        } accion: {
            // LA FUERZA LA CIERRAS TÚ: el toque es lo único que puede cerrar la
            // serie, y por eso aquí —y no en el EMOM— se gana el relleno (§10.5).
            FranjaAccion(titulo: tituloDeAccion,
                         unicaSalida: true,
                         nota: notaDeAccion,
                         accion: ejecutarAccion)
        }
        .onAppear { cebarCarga() }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            editando = nil
            cierreDeCarga = nil
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
        .sheet(item: $cierreDeCarga) { cierre in
            HojaCargaAlCerrar(semillaKg: cierre.kg) { kg in
                session.confirmExerciseLoad(kg)
                cierreDeCarga = nil
                alTocarAccion()
            }
        }
    }

    // MARK: - La acción — una sola, y hace lo que dice

    /// EL ATLETA GOBIERNA: mientras queden series, el botón CIERRA LA SERIE que
    /// tienes delante; cuando ya no quedan, cierra el ejercicio y lo dice.
    ///
    /// Antes esto vivía en un botón «HECHO» de 12 pt dentro de una fila de lista,
    /// mientras el botón grande de abajo —el que se alcanza con el pulgar— cerraba
    /// el EJERCICIO entero. El gesto que haces cuatro veces era el pequeño y el que
    /// haces una vez, el grande.
    ///
    /// El motor no cambia: son las MISMAS llamadas (`confirmSet`, que dispara el
    /// descanso, y el avance del anfitrión). Lo que cambia es cuál las dispara.
    private var seriePendiente: Int? {
        guard porSeries else { return nil }
        return session.setRecords.firstIndex { !$0.confirmed && $0.status != "skipped" }
    }

    private var tituloDeAccion: String {
        if descansando { return "SALTAR DESCANSO" }
        guard let i = seriePendiente else { return accionTitulo }
        return "SERIE \(session.setRecords[i].setIndex) HECHA"
    }

    private var notaDeAccion: String? {
        if descansando { return "el descanso también es dosis" }
        guard seriePendiente == nil, porSeries else { return nil }
        return "todas las series cerradas"
    }

    private func ejecutarAccion() {
        if descansando { session.dismissRest(); return }
        if let i = seriePendiente { session.confirmSet(i); return }
        if let kg = kgAlCerrarEjercicio {
            cierreDeCarga = CierreDeCarga(kg: kg)
            return
        }
        alTocarAccion()
    }

    /// Fuerza/sled con kg resuelto o prescrito, y al menos una serie no saltada.
    /// El skip de todas las series es FH-47: aquí solo el cruce, no el botón.
    private var kgAlCerrarEjercicio: Double? {
        guard admiteCarga else { return nil }
        if !session.setRecords.isEmpty,
           session.setRecords.allSatisfy({ $0.status == "skipped" }) { return nil }
        return cargaKg ?? session.manualLoadKg ?? seg?.loadKg
    }

    // MARK: - Contexto — el pacto del coach para este ejercicio

    /// La franja que no desaparece jamás: qué te pidió el coach (`4×5 · 100 kg ·
    /// descanso 1:30`) y si hay reloj midiéndote.
    private var contexto: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(seg?.title ?? "Fuerza")
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let plan = lineaDelPlan {
                    Text(plan)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            ChipPulsoVivo(session: session)
        }
    }

    /// Lo que pidió el coach, en una línea. Solo lo que de verdad escribió: una
    /// prescripción sin repeticiones no inventa un «×5» (§7).
    private var lineaDelPlan: String? {
        var partes: [String] = []
        if porSeries, let dosis = Formato.dosisDeSeries(series: session.setRecords.count,
                                                        reps: session.setRecords.first?.repsPrescribed) {
            partes.append(dosis)
        }
        if let kg = seg?.loadKg, kg > 0 { partes.append(Formato.kg(kg)) }
        if let d = descansoPrescrito {
            partes.append("\(Vocab.descanso.lowercased()) \(Formato.clock(d, subMinuto: .segundos))")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    private var descansoPrescrito: Int? {
        session.setRecords.compactMap(\.restS).first
    }

    // MARK: - El sujeto

    @ViewBuilder
    private var sujeto: some View {
        if descansando {
            sujetoDescanso
        } else if porSeries, let i = indiceSerieActual {
            sujetoDeSerie(i)
        } else if seg?.repsArePrimable == true {
            sujetoPrescrito
        } else {
            sujetoContado
        }
    }

    /// EL DESCANSO ES DOSIS, y mientras corre es lo que está pasando. No una
    /// banderita en una esquina: el reloj manda la banda, como en cualquier otra
    /// vista donde el tiempo gobierna.
    private var sujetoDescanso: some View {
        Group {
            EtiquetaSujeto(texto: Vocab.descanso, tono: Theme.Color.info)
            Numeral(texto: Formato.clock(max(0, session.restRemainingSeconds), anchoFijo: true),
                    tono: Theme.Color.info)
            if let siguiente = textoSerieSiguiente {
                Text("Luego · \(siguiente)")
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
        }
    }

    /// LA SERIE QUE TIENES DELANTE. `5 × 100` es UNA cosa y así se lee — la cifra
    /// no se parte en dos peldaños, que invertiría la jerarquía; de que quepa se
    /// encarga el presupuesto de ancho de `EscalaNumeral` (§10.2).
    ///
    /// Y cuando el plan no trae medida, el sujeto DEGRADA a lo que sí hay: la
    /// carga sola (el circuito real del coach llega con 30 kg y ninguna
    /// repetición), y si tampoco, el nombre. Nunca un cero ni un guion (§7).
    @ViewBuilder
    private func sujetoDeSerie(_ i: Int) -> some View {
        let rec = session.setRecords[i]
        EtiquetaSujeto(texto: "\(Vocab.serie) \(rec.setIndex) de \(session.setRecords.count)")
        if let dosis = Formato.serie(reps: rec.repsActual ?? rec.repsPrescribed,
                                     cargaKg: rec.loadActualKg ?? rec.loadPrescribedKg) {
            Numeral(texto: dosis.cifra, unidad: dosis.unidad)
            NombreDelTrabajo(texto: seg?.title ?? "")
        } else {
            // Sin ninguna cifra el sujeto ES el nombre, y va en la voz de titular:
            // el mono es para lo que se compara columna a columna (§4).
            Text(seg?.title ?? "")
                .scaledFont(34, weight: .heavy, relativeTo: .largeTitle, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .lineLimit(2).minimumScaleFactor(0.6)
        }
        if let pastilla = pastillaIntensidad(i) {
            Text(pastilla)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.accentText)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, 5)
                .background(Theme.Color.accent.opacity(0.16), in: Capsule())
        }
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
    /// que quiere distinta. Mirando solo la serie, el 4×5 @ RIR 2 real se quedaba
    /// sin pastilla — el dato estaba escrito y la pantalla no lo enseñaba.
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
    private var textoSerieSiguiente: String? {
        guard let i = indiceSerieActual else { return nil }
        let rec = session.setRecords[i]
        guard !rec.confirmed else { return nil }
        return Formato.serie(reps: rec.repsPrescribed, cargaKg: rec.loadActualKg ?? rec.loadPrescribedKg)?.linea
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
                          pie: "lo que pide el plan")
            }
        }
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

    // MARK: - Los apoyos

    private var apoyos: some View {
        VStack(spacing: Theme.Spacing.s) {
            FilaApoyos {
                ApoyoVivo(etiqueta: Vocab.fc,
                          valor: session.liveHRBpm.map { "\($0)" },
                          unidad: Vocab.ppm,
                          tono: session.liveZone?.color ?? Theme.Color.foreground,
                          ausente: "sin reloj")
                ApoyoVivo(etiqueta: Vocab.vuelta,
                          valor: Formato.clock(session.lapElapsedSeconds, anchoFijo: true))
                ApoyoVivo(etiqueta: Vocab.total,
                          valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
            }
            if porSeries {
                RielDeSeries(series: session.setRecords,
                             actual: indiceSerieActual,
                             turnos: seg?.supersetSlots,
                             alTocar: { editando = SerieEnEdicion(indice: $0) })
            } else {
                ajustesDeTramo
            }
            Spacer(minLength: 0)
            SiguienteTramoChip(siguiente: session.nextSegment)
        }
        .frame(maxHeight: .infinity, alignment: .top)
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

/// Identidad de la hoja de kg al cerrar el ejercicio. `kg` es la semilla
/// (resuelto o prescrito); girar o no, HECHO declara ese valor.
private struct CierreDeCarga: Identifiable {
    let id = UUID()
    let kg: Double
}

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

// MARK: - Los controles de ajuste

/// Un entero con − y +. Ajustar es la excepción, así que no grita.
private struct PasoEntero: View {
    let etiqueta: String
    let valor: Int
    let alCambiar: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { alCambiar(max(0, valor - 1)) }
                Text("\(valor)")
                    .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { alCambiar(valor + 1) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); accion() }) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// Un decimal opcional (RPE / RIR). Vacío hasta el primer toque: lo que no se ha
/// contestado no se rellena con un cero (§7).
private struct PasoDecimal: View {
    let etiqueta: String
    let paso: Double
    let maximo: Double
    let valor: Double?
    let alCambiar: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { ajustar(-paso) }
                Text(valor.map { Formato.esDecimal($0) } ?? "sin decir")
                    .scaledFont(valor == nil ? 12 : 22,
                                weight: valor == nil ? .semibold : .heavy,
                                relativeTo: valor == nil ? .caption : .title2,
                                italic: valor != nil)
                    .monospacedDigit()
                    .foregroundStyle(valor == nil ? Theme.Color.muted : Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { ajustar(paso) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func ajustar(_ delta: Double) {
        Haptics.light()
        alCambiar(min(maximo, max(0, (valor ?? 0) + delta)))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// La rueda de carga: `KgWheel` (SwiftUI.Picker + `.pickerStyle(.wheel)`).
/// «esta y siguientes» dice lo que hace en el editor de serie; no se clona.
private struct RuedaDeCarga: View {
    let valor: Double
    let alCambiar: (Double) -> Void

    private var units: Binding<Int> {
        Binding(get: { max(1, Int((valor / 2.5).rounded())) },
                set: { alCambiar(Double($0) * 2.5) })
    }

    var body: some View {
        KgWheel(label: "\(Vocab.carga) · esta y siguientes", units: units)
            .frame(maxWidth: .infinity)
    }
}

/// Hoja al cerrar el ejercicio: la misma `KgWheel`, semilla = kg propuesto.
/// HECHO sin girar guarda ese propuesto. `Measurement<UnitMass>` no es un control.
private struct HojaCargaAlCerrar: View {
    let alConfirmar: (Double) -> Void
    @State private var units: Int

    init(semillaKg: Double, alConfirmar: @escaping (Double) -> Void) {
        self.alConfirmar = alConfirmar
        _units = State(initialValue: max(1, Int((semillaKg / 2.5).rounded())))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Text(Formato.kg(Double(units) * 2.5))
                    .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Button("HECHO") { alConfirmar(Double(units) * 2.5) }
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.accentText)
            }
            KgWheel(label: Vocab.carga, units: $units)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.Color.background)
        .compactSheet()
    }
}

// MARK: - Los dos estados de diseño, para abrirlos en el lienzo de Xcode

#if DEBUG
/// El caso real del plan del coach: Back Squat 4×5 @ 100 kg, RIR 2, descanso
/// 1:30 — y con el atleta en la serie 2. «5 × 100» son los siete avances de la
/// mono que rompieron esta familia una vez.
private func fuerzaDePrueba(zonas: HRZoneProfile? = nil, bpm: Int? = nil) -> WorkoutSession {
    func serie() -> PrescriptionSet {
        PrescriptionSet(measure: .reps(5),
                        target: .kg(value: 100, min: nil, max: nil),
                        modality: nil, restS: 90, tempo: nil, note: nil)
    }
    let p = Prescription(scheme: .sets, modality: nil,
                         sets: [serie(), serie(), serie(), serie()],
                         rounds: nil, workS: nil, restS: nil, totalS: nil,
                         target: .rir(value: 2, min: nil, max: nil),
                         note: nil, start: nil, increment: nil)
    let tramo = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength,
                               targetReps: 5, loadKg: 100,
                               blockTitle: "Fuerza", blockPosition: 1,
                               prescription: p)
    let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                           estimatedDurationSeconds: 1200, blockContext: "Fuerza",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    let sesion = WorkoutSession(plan: plan, hrZones: zonas)
    sesion.liveHRBpm = bpm
    // La serie 1 ya está cerrada: el atleta está delante de la 2. Se cierra el
    // descanso que dispara `confirmSet` para que el sujeto sea la SERIE y no la
    // cuenta atrás — el descanso tiene su propio estado y se ve al confirmar.
    sesion.primeSetsIfNeeded()
    sesion.confirmSet(0)
    sesion.dismissRest()
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

/// CON PULSO — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona (§10.1).
/// En fuerza el pulso baja entre series, así que Z2 es lo normal aquí.
#Preview("Fuerza en vivo · con pulso") {
    lienzoFuerza(fuerzaDePrueba(zonas: zonasFuerzaDePrueba(), bpm: 142))
}

/// SIN ANCLA DE FC — ni zonas del servidor ni reloj en la muñeca. NO hay tinte y
/// donde iría el pulso se dice por qué no está (§7). El sujeto no cambia: la
/// serie que tienes delante se sabe igual.
#Preview("Fuerza en vivo · sin ancla de FC") {
    lienzoFuerza(fuerzaDePrueba())
}
#endif
