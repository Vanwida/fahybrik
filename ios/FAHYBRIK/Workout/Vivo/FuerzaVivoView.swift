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
// siendo los mismos. Lo que cambia es el idioma.

/// El hierro en vivo, dentro del marco del §10.
///
/// El CROMO lo pone el anfitrión (`ActiveWorkoutView`) y esta vista solo lo coloca
/// en la primera fila: así el ancla del §10.3 es EXACTA sin que la pantalla pierda
/// la navegación que ya tenía.
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
    /// Antes esto vivía en un botón «HECHO» de 12 pt dentro de una fila de lista,
    /// mientras el botón grande de abajo —el que se alcanza con el pulgar— cerraba
    /// el EJERCICIO entero. El gesto que haces cuatro veces era el pequeño y el que
    /// haces una vez, el grande.
    ///
    /// QUIÉN DECIDE QUÉ HACE EL TOQUE: el MOTOR, no esta vista. La regla «con series
    /// pendientes el toque cierra la SERIE, no el ejercicio» vivía aquí dentro, y por
    /// eso el botón «Siguiente» del reloj —que entra por `primaryAdvance` sin pasar
    /// por ninguna pantalla— cerraba el press de banca en la primera serie y saltaba
    /// al curl. Ahora la regla es del motor (`WorkoutSession.strengthPrimary`) y esta
    /// vista solo la NOMBRA: lee cuál es la serie pendiente para rotular el botón, y
    /// el toque va por el mismo camino que el mando de la muñeca.
    private var seriePendiente: Int? { session.pendingSetIndex }

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

    private func ejecutarAccion() { alTocarAccion() }

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
            if let bpm = session.liveHRBpm {
                chipPulso("\(bpm) \(Vocab.ppm)", tono: session.liveZone?.color ?? Theme.Color.foreground)
            } else {
                chipPulso("Sin reloj", tono: Theme.Color.muted)
            }
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

    private func chipPulso(_ texto: String, tono: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "heart.fill").font(.system(size: 8, weight: .bold))
            Text(texto)
                .scaledFont(9, weight: .heavy, relativeTo: .caption2, italic: true)
                .uppercaseTracked(0.7)
                .lineLimit(1)
        }
        .foregroundStyle(tono)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.vertical, 4)
        .background(Theme.Color.surface.opacity(0.8), in: Capsule())
        .accessibilityElement(children: .combine)
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

    // MARK: - Los apoyos

    private var apoyos: some View {
        VStack(spacing: Theme.Spacing.s) {
            FilaApoyos {
                ApoyoVivo(etiqueta: Vocab.fc,
                          valor: session.liveHRBpm.map { "\($0)" },
                          unidad: Vocab.ppm,
                          tono: session.liveZone?.color ?? Theme.Color.foreground,
                          ausente: "sin reloj")
                // LA PAUSA, NO LA «VUELTA». La vuelta contaba desde que se abrió el
                // ejercicio, así que en un 4×10 sumaba las cuatro series y sus tres
                // descansos sin reiniciar: un número que no contesta ninguna pregunta
                // que se haga el que está levantando. Lo que sí se pregunta entre
                // series es cuánto lleva parado — y el descanso prescrito se agota y
                // desaparece justo cuando deja de saberlo.
                ApoyoVivo(etiqueta: Vocab.pausa,
                          valor: session.secondsSinceLastSet.map { Formato.clock($0, anchoFijo: true) },
                          ausente: "aún no")
                ApoyoVivo(etiqueta: Vocab.total,
                          valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
            }
            if porSeries {
                RielDeSeries(series: session.setRecords,
                             actual: indiceSerieActual,
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

/// UNA identidad de la serie que se está editando.
///
/// `Int` a secas no vale para `.sheet(item:)` —no es `Identifiable`— y envolverlo
/// aquí evita el otro camino, que es un `Bool` de «está abierta» más un índice
/// suelto: dos estados que se pueden contradecir y abrir el editor de la serie
/// equivocada.
struct SerieEnEdicion: Identifiable, Equatable {
    let indice: Int
    var id: Int { indice }
}

/// Las series a lo ancho, con la que tienes delante encendida.
///
/// Es un RIEL, no una tabla: dice en qué serie vas y cómo quedaron las anteriores,
/// y cabe igual con cuatro que con ocho. La tabla que había antes crecía con el
/// número de series hasta empujar la acción fuera de la pantalla, y encima ponía el
/// gesto que repites cuatro veces («hecha») en un botón de 12 pt.
///
/// Tocar una serie abre su editor. Ajustar es la excepción (§7): lo normal es que
/// la serie salga como está escrita y se cierre con el botón grande.
struct RielDeSeries: View {
    let series: [SetRecord]
    let actual: Int?
    let alTocar: (Int) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(series) { rec in
                let i = rec.setIndex - 1
                Button(action: { Haptics.light(); alTocar(i) }) {
                    peldano(rec, esLaDeAhora: i == actual)
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(voz(rec, esLaDeAhora: i == actual))
            }
        }
    }

    private func peldano(_ rec: SetRecord, esLaDeAhora: Bool) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                if rec.confirmed, rec.status != "skipped" {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(rec.status == "scaled" ? Theme.Color.warning : Theme.Color.ok)
                }
                Text("S\(rec.setIndex)")
                    .scaledFont(11, weight: .heavy, relativeTo: .caption2, italic: true)
                    .foregroundStyle(esLaDeAhora ? Theme.Color.accentText : Theme.Color.muted)
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

    /// Lo prescrito, o lo registrado en cuanto se confirma. Una serie sin dosis
    /// escrita —el circuito real del coach— no pinta un guion: se calla.
    private func dosis(_ rec: SetRecord) -> String {
        let reps = rec.confirmed ? (rec.repsActual ?? rec.repsPrescribed) : rec.repsPrescribed
        let kg = rec.confirmed ? (rec.loadActualKg ?? rec.loadPrescribedKg) : rec.loadPrescribedKg
        return Formato.serie(reps: reps, cargaKg: kg)?.linea ?? "·"
    }

    private func voz(_ rec: SetRecord, esLaDeAhora: Bool) -> String {
        let estado = rec.status == "skipped" ? "saltada"
            : rec.confirmed ? (rec.status == "scaled" ? "ajustada" : "hecha")
            : (esLaDeAhora ? "la que toca" : "pendiente")
        return "Serie \(rec.setIndex), \(estado), \(dosis(rec)). Tocar para ajustar"
    }
}

// MARK: - El editor de una serie — la excepción, en su propia hoja

/// Lo que sintió se PREGUNTA; no se copia del plan (§7). Por eso RPE y RIR entran
/// vacíos y se pueden dejar sin contestar.
///
/// Vive en una hoja y no en la pantalla porque no cabía: reps + carga + RPE + RIR
/// miden más que la banda de apoyos entera. Y porque ajustar no es el camino
/// normal — el camino normal es un toque en el botón grande.
struct EditorDeSerie: View {
    let session: WorkoutSession
    let indice: Int
    @Environment(\.dismiss) private var dismiss

    private var rec: SetRecord? {
        session.setRecords.indices.contains(indice) ? session.setRecords[indice] : nil
    }

    var body: some View {
        ScrollView {
            if let rec {
                VStack(spacing: Theme.Spacing.m) {
                    HStack {
                        Text("\(Vocab.serie) \(rec.setIndex) de \(session.setRecords.count)")
                            .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer()
                        Button("Listo") { dismiss() }
                            .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    HStack(spacing: Theme.Spacing.s) {
                        PasoEntero(etiqueta: Vocab.reps,
                                   valor: rec.repsActual ?? rec.repsPrescribed ?? 0,
                                   alCambiar: { session.setSetReps(indice, $0) })
                        PasoDecimal(etiqueta: Vocab.rpe, paso: 0.5, maximo: 10, valor: rec.rpe,
                                    alCambiar: { session.setSetRPE(indice, $0) })
                        PasoDecimal(etiqueta: Vocab.rir, paso: 1, maximo: 10, valor: rec.rir,
                                    alCambiar: { session.setSetRIR(indice, $0) })
                    }
                    if rec.loadPrescribedKg != nil || rec.loadActualKg != nil {
                        // Rueda con CASCADA: cambias esta y la heredan las series
                        // que faltan; las hechas conservan su peso real.
                        RuedaDeCarga(valor: rec.loadActualKg ?? rec.loadPrescribedKg ?? 20,
                                     alCambiar: { session.setSetLoadCascade(indice, $0) })
                    }
                    Button(action: {
                        session.setSetSkipped(indice, rec.status != "skipped"); Haptics.light()
                    }) {
                        Text(rec.status == "skipped" ? "Deshacer salto" : "Saltar esta serie")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(rec.status == "skipped" ? Theme.Color.accentText : Theme.Color.muted)
                            .underline()
                    }
                    .buttonStyle(.plain)
                }
                .padding(Theme.Spacing.l)
            }
        }
        .background(Theme.Color.background)
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

/// La rueda de carga: pasos de 2,5 kg, redondeando lo que entre a la rejilla de
/// discos. «esta y siguientes» dice lo que hace.
private struct RuedaDeCarga: View {
    let valor: Double
    let alCambiar: (Double) -> Void

    private var pasos: Binding<Int> {
        Binding(get: { max(1, Int((valor / 2.5).rounded())) },
                set: { alCambiar(Double($0) * 2.5) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: "\(Vocab.carga) · esta y siguientes", size: 10)
            Picker(Vocab.carga, selection: pasos) {
                ForEach(1...120, id: \.self) { u in
                    Text(KgWheel.kgLabel(Double(u) * 2.5))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .tag(u)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 84)
            .clipped()
        }
        .frame(maxWidth: .infinity)
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
