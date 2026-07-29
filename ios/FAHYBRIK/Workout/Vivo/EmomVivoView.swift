import SwiftUI

// EL MINUTO MANDA — el EMOM y el interval en vivo, hablando el lenguaje del §10.
//
// La tesis, en una frase: **en un EMOM gobierna EL RELOJ.** Acaba el minuto,
// acaba la ronda; no hay nada que detectar y no hay botón que la adelante. Y lo
// que te sobra del minuto ES tu descanso, así que el sujeto de la pantalla no es
// la tarea: es EL MINUTO DRENANDO.
//
// QUÉ CAMBIÓ EL 29-JUL Y POR QUÉ. La pantalla anterior (`EmomLiveHUD`, borrada)
// no era incorrecta: era MUDA, y sobre todo mentía con la jerarquía.
//
//   • El reloj vivía en una `CardSurface` que pesaba lo mismo que la tarjeta del
//     trabajo de debajo, así que el sujeto se leía como un ítem más (§10.4).
//   • El TRABAJO —«10 de 12 cal», lo que de verdad estás haciendo— iba en
//     `readoutS` dentro de un panel gris aparte, más pequeño que el reloj y con
//     la misma piel que el servicio. Es lo SEGUNDO más importante de la pantalla
//     y no se leía como tal (§10.6). Ahora entra EN LA BANDA, pegado al minuto
//     que lo gobierna y en el segundo peldaño del numeral.
//   • Había tres tratamientos de número grande en la misma pantalla
//     (`readoutHero` para el reloj, `readoutS` para el trabajo, `ExpertCell` para
//     el pulso) y ninguno era el numeral compartido (§10.2).
//   • La zona de pulso teñía una celda de 22 pt en vez del lienzo (§10.1).
//   • El pulso ausente se pintaba «—», que es justo lo que el §7 prohíbe.
//
// EL MOTOR NO SE HA TOCADO: `WorkoutSession` sigue siendo la misma fuente de
// verdad, con el mismo temporizador, los mismos pitidos de frontera y el mismo
// auto-avance. Lo que cambia es el idioma.
//
// LA VENTANA DE CAMBIO NO SE PINTA AQUÍ: es una fase con su propio sujeto
// (cuánto queda, hacia qué andas, cómo baja el pulso) y tiene pantalla propia —
// `RestSurface`, a la que `ActiveWorkoutView` enruta antes que a esta vista.

/// El EMOM en vivo, dentro del marco del §10.
///
/// El CROMO lo pone el anfitrión (`ActiveWorkoutView`): salir, pausa, atrás, el
/// vídeo de técnica y en qué tramo vas siguen siendo suyos, y esta vista solo los
/// coloca en la primera fila del marco. Así el ancla del §10.3 es EXACTA — las
/// filas se reservan aquí, no las estima nadie — sin que la pantalla pierda la
/// navegación que ya tenía.
struct EmomVivoView<Cromo: View>: View {
    let session: WorkoutSession
    /// El rótulo del botón, tal y como lo decide el anfitrión (SALTAR durante la
    /// cuenta atrás, SIGUIENTE, TERMINAR en el último intervalo).
    let accionTitulo: String
    let alTocarAccion: () -> Void
    @ViewBuilder var cromo: Cromo

    private var plan: EmomPlan? { session.currentSegment?.emomPlan }
    private var enCuentaAtras: Bool { session.emomCountInRemaining > 0 }
    /// Los últimos segundos, que es cuando el reloj deja de ser información y pasa
    /// a ser una orden.
    private var apura: Bool {
        !enCuentaAtras && session.emomPhaseRemaining <= WorkoutSession.emomUrgentThreshold
    }

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
            // EN UN EMOM EL TOQUE NO ES LA SALIDA: la ronda la cierra el reloj, y
            // este botón solo se adelanta. Por eso va en CONTORNO (§10.5) — antes
            // eran 96 pt de naranja macizo gritando más que el trabajo que
            // anunciaban.
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: false,
                         nota: notaDeAccion,
                         accion: alTocarAccion)
        }
    }

    /// Lo que el botón sella de verdad, cuando no es obvio. Sin esto «SIGUIENTE»
    /// parece que adelanta el reloj, y el reloj no lo adelanta nadie.
    private var notaDeAccion: String? {
        if enCuentaAtras { return nil }
        guard session.emomIntervalsRemaining > 0 else { return nil }
        return "el minuto se cierra solo"
    }

    // MARK: - Contexto — la cadencia, y con qué te está midiendo la app

    /// La franja que no desaparece jamás: cada cuánto suena el reloj, cuántas
    /// rondas son, y el pulso cuando de verdad hay reloj en la muñeca.
    private var contexto: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tituloFormato)
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                Text(cadencia)
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            // Sin reloj no se pinta un pulso: ni con un guion ni con un cero (§7).
            // Y sin ancla de FC tampoco hay zona con la que teñir el chip.
            if let bpm = session.liveHRBpm {
                chip("\(bpm) \(Vocab.ppm)", tono: session.liveZone?.color ?? Theme.Color.foreground)
            } else {
                chip("Sin reloj", tono: Theme.Color.muted)
            }
        }
    }

    private var tituloFormato: String {
        guard let plan else { return session.currentSegment?.title ?? "EMOM" }
        return "EMOM \(plan.intervalCount)"
    }

    /// Un EMOM llano se lee por su cadencia; un interval se lee por su reparto,
    /// que es el número contra el que el atleta se administra de verdad.
    private var cadencia: String {
        guard let plan else { return "" }
        let cada = "cada \(Formato.clock(plan.intervalSeconds, subMinuto: .segundos))"
        guard plan.hasTransition else { return cada }
        return "\(Formato.clock(plan.workSeconds, subMinuto: .segundos)) de trabajo · \(cada)"
    }

    private func chip(_ texto: String, tono: Color) -> some View {
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

    // MARK: - El sujeto — el minuto, y pegado a él lo que de verdad haces

    @ViewBuilder
    private var sujeto: some View {
        if enCuentaAtras {
            EtiquetaSujeto(texto: "Prepárate")
            Numeral(texto: "\(Int(session.emomCountInRemaining.rounded(.up)))",
                    tono: Theme.Color.accentText)
            if let primera = plan?.interval(session.emomIntervalIndex) {
                TrabajoVista(trabajo: trabajo(primera))
            }
        } else {
            EtiquetaSujeto(texto: rotuloRonda,
                           tono: apura ? Theme.Color.accentText : Theme.Color.muted)
            Numeral(texto: Formato.clock(max(0, session.emomPhaseRemaining), anchoFijo: true),
                    tono: apura ? Theme.Color.accentText : Theme.Color.foreground)
                .scaleEffect(apura ? 1.02 : 1)
                .animation(.easeOut(duration: 0.2), value: apura)
            // §10.6 — el trabajo entra EN LA BANDA. Un cronómetro pelado (un
            // entreno libre arrancado como reloj de box) no tiene qué nombrar, y
            // entonces no se pinta una ronda fantasma de guiones.
            if let actual = plan?.interval(session.emomIntervalIndex),
               session.currentSegment?.hasDeclaredWork == true {
                TrabajoVista(trabajo: trabajo(actual))
            }
        }
    }

    private var rotuloRonda: String {
        "\(Vocab.ronda) \(session.emomIntervalIndex + 1) de \(plan?.intervalCount ?? 0)"
    }

    /// EL TRABAJO DE ESTE MINUTO. En un EMOM no hay quien cuente burpees, así que
    /// lo que se sabe es LA DOSIS («12 cal»), no un contador — y esa se dice, que
    /// para eso el atleta la tiene delante. Fingir «0 de 12» cuando nadie está
    /// contando sería peor que no decir nada: parece un dato medido (§7).
    ///
    /// Cuando la tarea la cuenta una máquina, el tramo ya no llega aquí: el erg se
    /// queda con la pantalla (`ErgHUDContent`) y el minuto viaja encima.
    private func trabajo(_ itv: EmomInterval) -> Trabajo {
        Trabajo(nombre: itv.movement,
                hecho: nil,
                objetivo: nil,
                unidad: nil,
                dosis: itv.work == "—" ? nil : itv.work)
    }

    // MARK: - Los apoyos — la traza de rondas, y lo que viene

    /// DOS GRUPOS, y el sobrante entre ellos.
    ///
    /// Arriba lo que se mira MIENTRAS trabajas (la traza, lo que viene, el pulso);
    /// abajo lo que se toca ENTRE rondas (el sello Rx, lo que hay después del
    /// bloque), pegado a la acción porque es de la misma familia de gestos.
    ///
    /// El hueco va EN MEDIO y no al final a propósito. Es la parte del §10.3 que
    /// este formato no puede cumplir: su escalera del sobrante se queda sin
    /// peldaños —la traza y las lecturas no ganan nada creciendo, y el numeral ya
    /// está en su techo—, así que el espacio que sobra se usa para SEPARAR dos
    /// grupos de gestos en vez de quedarse como una banda muerta encima del botón.
    private var apoyos: some View {
        VStack(spacing: Theme.Spacing.s) {
            TrazaDeRondas(total: plan?.intervalCount ?? 0,
                          actual: session.emomIntervalIndex,
                          hechas: session.emomCompletedIntervals)
            if let luego = siguienteMovimiento {
                AnuncioSiguiente(rotulo: "Luego", texto: luego)
            }
            // «Hechas N de M» NO está aquí: la traza ya lo dibuja y el rótulo del
            // sujeto ya lo dice con palabras. Tres respuestas a la misma pregunta
            // es lo que dejaba sin sitio a los números que sí faltaban.
            FilaApoyos {
                ApoyoVivo(etiqueta: Vocab.fc,
                          valor: session.liveHRBpm.map { "\($0)" },
                          unidad: Vocab.ppm,
                          tono: session.liveZone?.color ?? Theme.Color.foreground,
                          ausente: "sin reloj")
                ApoyoVivo(etiqueta: Vocab.total,
                          valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
            }
            Spacer(minLength: 0)
            // Un EMOM es familia metcon: el eje Rx / escalado se sella aquí, como
            // antes. Se queda en los apoyos porque es un registro, no el trabajo.
            if session.currentSegmentIsMetcon {
                RxScaledToggle(session: session)
            }
            SiguienteTramoChip(siguiente: session.nextSegment)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    /// El movimiento que viene, SOLO cuando el EMOM alterna y de verdad cambia —
    /// así un EMOM uniforme no repite doce veces lo que ya está en la banda.
    private var siguienteMovimiento: String? {
        guard let plan, plan.isAlternating else { return nil }
        let i = session.emomIntervalIndex
        guard let sig = plan.interval(i + 1),
              let act = plan.interval(i),
              sig.movement != act.movement else { return nil }
        return sig.work != "—" ? "\(sig.work) · \(sig.movement)" : sig.movement
    }
}

// MARK: - La traza de rondas — dónde estás en el EMOM, de un vistazo

/// Las rondas a lo ancho, con la de ahora encendida.
///
/// Vive aquí y no en `Theme/LenguajeVivoUI.swift` porque es del RELOJ: solo tiene
/// sentido cuando el formato reparte el trabajo en ciclos. El lenguaje compartido
/// es el tinte, el numeral, el marco y la acción — no cada instrumento de cada
/// formato. Es la hermana de `BandaZonas` en la vista de correr.
struct TrazaDeRondas: View {
    let total: Int
    let actual: Int
    let hechas: Int

    /// Por encima de esto los peldaños son rayas de 2 pt y no dicen nada; entonces
    /// la traza se calla y el conteo lo lleva el apoyo «Hechas».
    private static let maximoLegible = 24

    var body: some View {
        if total > 1, total <= Self.maximoLegible {
            HStack(spacing: 3) {
                ForEach(0..<total, id: \.self) { i in
                    Capsule()
                        .fill(tono(i))
                        .frame(height: i == actual ? 10 : 6)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 10)
            .animation(.easeOut(duration: 0.3), value: actual)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(Vocab.ronda) \(actual + 1) de \(total), \(hechas) hechas")
        }
    }

    private func tono(_ i: Int) -> Color {
        if i == actual { return Theme.Color.accent }
        if i < hechas { return Theme.Color.ok.opacity(0.75) }
        return Theme.Color.hairlineStrong
    }
}

/// Lo que viene ahora mismo dentro del formato — el aviso que se enciende solo
/// cuando de verdad cambia el movimiento.
struct AnuncioSiguiente: View {
    let rotulo: String
    let texto: String

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            LabelText(text: rotulo, color: Theme.Color.accentText, size: 10)
            Text(texto)
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.accent.opacity(0.14),
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.accentText.opacity(0.45), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Los dos estados de diseño, para abrirlos en el lienzo de Xcode

#if DEBUG
/// Un EMOM 12 alternando burpees y wall balls — nadie los cuenta, así que lo que
/// se sabe es la DOSIS. Es el caso que dirige esta pantalla: si la tarea la
/// contase una máquina, el tramo ni llegaría aquí (se lo queda el erg).
private func emomDePrueba(zonas: HRZoneProfile? = nil, bpm: Int? = nil) -> WorkoutSession {
    func serie(_ reps: Int, _ nombre: String) -> PrescriptionSet {
        PrescriptionSet(measure: .reps(reps), target: nil, modality: nil,
                        restS: nil, tempo: nil, note: nombre)
    }
    let p = Prescription(scheme: .emom, modality: nil,
                         sets: [serie(10, "Burpees"), serie(12, "Wall balls")],
                         rounds: 12, workS: nil, restS: nil, totalS: nil,
                         target: nil, note: nil, start: nil, increment: nil)
    let tramo = WorkoutSegment(order: 1, title: "EMOM 12", kind: .reps,
                               targetReps: 10,
                               blockTitle: "Principal", blockPosition: 1,
                               prescription: p)
    let plan = WorkoutPlan(id: UUID(), name: "EMOM 12", format: .emom,
                           estimatedDurationSeconds: 720, blockContext: "Principal",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    let sesion = WorkoutSession(plan: plan, hrZones: zonas)
    sesion.emomPhaseRemaining = 41
    sesion.emomIntervalIndex = 3
    sesion.liveHRBpm = bpm
    return sesion
}

/// Las bandas tal y como las manda el servidor, sobre un umbral de 170 ppm.
private func zonasEmomDePrueba() -> HRZoneProfile {
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
private func lienzoEmom(_ sesion: WorkoutSession) -> some View {
    ZStack {
        Theme.Color.background.ignoresSafeArea()
        Ambiente(zona: sesion.liveZone)
        EmomVivoView(session: sesion, accionTitulo: "SIGUIENTE", alTocarAccion: {}) {
            HStack {
                Image(systemName: "xmark").foregroundStyle(Theme.Color.muted)
                Text("‖").foregroundStyle(Theme.Color.muted)
                Spacer()
                MonoText(text: "EMOM 12", size: 11, color: Theme.Color.muted)
                Spacer()
                MonoText(text: "1/1", size: 11, color: Theme.Color.muted)
            }
        }
    }
}

/// CON PULSO — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona
/// (§10.1) y el pulso se lee en el color de esa zona.
#Preview("EMOM en vivo · con pulso") {
    // 165 ppm sobre un umbral de 170 → Z4, que es donde vive un EMOM de verdad.
    lienzoEmom(emomDePrueba(zonas: zonasEmomDePrueba(), bpm: 165))
}

/// SIN ANCLA DE FC — el servidor no mandó zonas y no hay reloj en la muñeca. NO
/// hay tinte, no hay zona, y donde iría el pulso se dice por qué no está. Ni un
/// guion ni una barra vacía (§7). Es el atleta recién dado de alta, que es el
/// caso de diseño (§6.3) — no la versión rota de la de arriba.
#Preview("EMOM en vivo · sin ancla de FC") {
    lienzoEmom(emomDePrueba())
}
#endif
