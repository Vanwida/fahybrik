import SwiftUI

// LA CARA POR RONDAS de los formatos count-up — la lista mientras quepa, el
// contador cuando no. Porta la propuesta aprobada del doble
// (`design-twin/screens/vivo-rondas`, docs/DECISIONS.md 2026-08-10/11
// «Rondas ≠ estaciones»).
//
// LA DISTINCIÓN QUE LO GOBIERNA: una lista de N ESTACIONES es heterogénea y
// colapsarla destruye información (eso lo resuelve la ruta de estaciones de
// `ForTimeLiveHUD`); una lista de N RONDAS es homogénea — la fila 7 repite la
// fila 6 — así que colapsarla no quita información: la CONCENTRA. El contador
// no es otra metáfora, es LA MISMA LISTA CON EL CURSOR ABIERTO: la que
// cerraste arriba (tachada, con su parcial), la que haces en el numeral, la
// que viene abajo.
//
// EL UMBRAL NO ES UNA CONSTANTE: `ViewThatFits` prueba la lista contra el
// marco REAL del dispositivo y cae al contador cuando la lista no cabe. Es la
// aritmética del marco calculada por el motor de layout — el doble la tuvo que
// estimar a mano (213 pt de apoyos, fila de 35 → cinco rondas) porque el HTML
// no sabe medirse; Swift sí. En apaisado la superficie scrollea (la acción va
// clavada debajo) y la propuesta de alto es infinita, así que la lista gana
// siempre — que es lo correcto: ahí no hay nada que empuje.
//
// El trabajo de la ronda se escribe UNA VEZ (§10.6): la lista de dos líneas
// por fila gastaba 681 pt en repetir el mismo trabajo doce veces, y fue lo que
// el 10-ago dejó un EMPEZAR fuera de pantalla.

// MARK: - Las lecturas puras (espejo de vivo-rondas/data.ts)

enum RoundsReadings {
    /// La media de lo CERRADO. Con una sola ronda no se dice: un punto no es
    /// un ritmo (la misma regla que la proyección de For Time).
    static func mediaS(_ cerradas: [Double]) -> Double? {
        guard cerradas.count >= 2 else { return nil }
        return cerradas.reduce(0, +) / Double(cerradas.count)
    }

    /// Dónde acabas al ritmo de lo cerrado. La ronda en vuelo no cuenta:
    /// nadie sabe por dónde vas dentro de ella.
    static func proyeccionS(rondas: Int, cerradas: [Double]) -> Double? {
        mediaS(cerradas).map { ($0 * Double(rondas)).rounded() }
    }

    /// La última contra tu media. Menos de tres segundos no es caerse, es
    /// ruido de cronómetro.
    static func caidaS(_ cerradas: [Double]) -> Double? {
        guard let media = mediaS(cerradas), let ultima = cerradas.last else { return nil }
        let delta = ultima - media
        return abs(delta) >= 3 ? delta : nil
    }

    /// Por debajo de 4 pt por tramo el hilo deja de leerse como tramos: pasa a
    /// barra continua y la CUENTA la dice el numeral. Un «death by» de cien
    /// rondas llega aquí.
    static func hiloPorTramos(rondas: Int, anchoPt: CGFloat) -> Bool {
        rondas > 0 && anchoPt / CGFloat(rondas) >= 4
    }
}

/// La aritmética del umbral — el espejo Swift de `vivo-rondas/data.ts`, con el
/// alto REAL del hueco medido por geometría en vez de estimado a mano.
///
/// La clave que hace al umbral PURO EN RONDAS (mismas rondas → misma metáfora,
/// da igual lo que pese el trabajo escrito): la banda del trabajo tiene alto
/// FIJO, igual que la banda del sujeto de `MarcoVivo` en el doble. Sin banda
/// fija, dos WODs de 8 rondas con líneas distintas rendirían caras distintas y
/// el atleta vería la pantalla cambiar de forma entre entrenos iguales.
enum RoundsListBudget {
    /// El cromo del formato (strip) con su respiración.
    static let stripPt: CGFloat = 40
    /// La banda del trabajo de la cara-lista, FIJA: hasta cuatro líneas de
    /// 25 pt (con su interlineado real, ~30 pt + huecos de 6) caben enteras;
    /// más movimientos enseñan tres y un «+N más».
    static let bandaListaPt: CGFloat = 144
    /// Cabecera de la lista («Recorre las rondas» + su relleno).
    static let cabeceraPt: CGFloat = 34
    /// Una fila de UNA línea: texto 17 + relleno 10+10 + hairline.
    static let filaPt: CGFloat = 38
    /// Los huecos del VStack (12 × 2) alrededor de banda y lista.
    static let huecosPt: CGFloat = 24

    /// Cuántas rondas caben LISTADAS en un hueco real de `alto` puntos.
    /// A partir de la siguiente, la lista se colapsa en el contador — no es un
    /// número elegido: es el primero que no cabe.
    static func rondasListadas(alto: CGFloat) -> Int {
        let paraFilas = alto - stripPt - bandaListaPt - cabeceraPt - huecosPt
        return max(0, Int(paraFilas / filaPt))
    }
}

// MARK: - El HUD

struct RoundsLiveHUD: View {
    let session: WorkoutSession
    @Environment(\.verticalSizeClass) private var vSizeClass

    private var seg: WorkoutSegment? { session.currentSegment }

    var body: some View {
        if session.isCondCountIn {
            // El pre-roll es de todos los formatos por igual: el número grande
            // y nada compitiendo con él.
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else if vSizeClass == .compact {
            // Apaisado: la superficie SCROLLEA (la acción va clavada debajo, ver
            // el host), así que nada empuja nada y la lista es siempre la cara.
            // Además un `GeometryReader` dentro de un ScrollView no tiene alto
            // que medir — este camino no es una preferencia, es el único honesto.
            caraLista
        } else {
            // La lista mientras quepa; el contador cuando no. El alto del hueco
            // lo dice la geometría REAL; la aritmética (banda fija + filas de a
            // 38) vive en `RoundsListBudget`, con nombre y derivación — y como
            // la banda del trabajo es FIJA, el umbral es puro en RONDAS: dos
            // WODs de ocho rondas rinden la misma cara, pese lo que pese su
            // trabajo escrito.
            GeometryReader { geo in
                let caben = RoundsListBudget.rondasListadas(alto: geo.size.height)
                Group {
                    if session.fixedListTotal <= caben { caraLista } else { caraContador }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            }
        }
    }

    // ── La cara de pocas rondas: manda el TRABAJO, la cuenta baja al cromo ──
    //
    // Con cuatro rondas nunca pierdes la cuenta, así que gobernar la pantalla
    // con un «1/4» sería gastar el sitio bueno en el dato fácil.
    private var caraLista: some View {
        VStack(spacing: 12) {
            RoundsContextStrip(session: session,
                               posicion: "Ronda \(min(session.fixedRoundsDone + 1, session.fixedListTotal)) de \(session.fixedListTotal)")
            SujetoTrabajoRonda(seg: seg, grande: true)
            RoundRowsList(session: session)
        }
    }

    // ── La cara de muchas rondas: manda la CUENTA, el trabajo escrito una vez ──
    //
    // Se compone DENTRO de su cota, recortando por PRIORIDAD (la re-verificación
    // adversarial midió 538 pt derramándose sobre el toggle RX y el chip del
    // siguiente tramo): primero cae la línea de lectura (su dato vive también en
    // «tu media»), luego el hilo (la cuenta ya la dice el numeral). Todas las
    // piezas tienen alto FIJO, así que el recorte depende del hueco, jamás del
    // contenido — la misma regla que hace al umbral puro en rondas.
    // La franja de acción es el botón del host (`RONDA HECHA` / `ÚLTIMA HECHA`,
    // ver `conditioningPrimaryTitle`): un botón aquí serían dos salidas.
    private var caraContador: some View {
        ViewThatFits(in: .vertical) {
            contadorNucleo(conHilo: true, conLectura: true, compacto: false)
            contadorNucleo(conHilo: true, conLectura: false, compacto: false)
            contadorNucleo(conHilo: false, conLectura: false, compacto: true)
            // El SUELO: en los cromos extremos (ergo sin emparejar, dobles) el
            // hueco baja de 200 pt y ninguna banda cabe. La cuenta se degrada
            // al cromo — que para eso es el sitio de la posición — y quedan
            // los números del momento. ViewThatFits pinta el último candidato
            // aunque no quepa, así que el último TIENE que caber siempre.
            contadorSuelo
        }
    }

    // Interno para que el test mida el suelo: el ultimo candidato TIENE que caber.
    var contadorSuelo: some View {
        VStack(spacing: 12) {
            RoundsContextStrip(
                session: session,
                posicion: "Ronda \(min(session.fixedRoundsDone + 1, session.fixedListTotal))/\(session.fixedListTotal)")
            // El deshacer NO se recorta (verif3 cazó al suelo recortándolo):
            // con una cerrada, su chip tachado viaja también aquí — 19 pt que
            // el peor cromo real (~187) sigue absorbiendo.
            if let anterior = session.fixedRoundSplits.last, session.fixedRoundsDone > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("Ronda \(session.fixedRoundsDone)")
                        .font(.system(size: 13, weight: .semibold))
                        .strikethrough(true, color: Theme.Color.muted)
                    Text(Formato.clock(anterior.seconds))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                }
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onLongPressGesture(minimumDuration: 0.5) { session.unmarkLastRound() }
                .accessibilityLabel("Ronda \(session.fixedRoundsDone), cerrada en \(Formato.clock(anterior.seconds)). Mantén pulsado para deshacerla.")
            }
            MetricRow3(cells: [
                .init(label: "Esta ronda", value: Formato.clock(parcialVivoS)),
                mediaCell,
                hrCell(session)
            ])
        }
    }

    // Interno (no privado) a propósito: la re-verificación exige medir la cara
    // que se PINTA, no solo la que se descarta, y los tests miden cada nivel.
    @ViewBuilder
    func contadorNucleo(conHilo: Bool, conLectura: Bool, compacto: Bool) -> some View {
        VStack(spacing: 12) {
            // Con el contador la cuenta ya gobierna la banda: ahí el cromo dice
            // el BLOQUE, que no está en ningún otro sitio (contrato §cromo).
            RoundsContextStrip(session: session, posicion: seg?.blockTitle)
            SujetoContadorRonda(session: session, seg: seg, compacto: compacto)
            if conHilo { HiloDeRondas(session: session) }
            MetricRow3(cells: [
                .init(label: "Esta ronda", value: Formato.clock(parcialVivoS)),
                mediaCell,
                hrCell(session)
            ])
            if conLectura, let lectura { lectura }
        }
    }

    /// Lo que lleva la ronda en vuelo: el reloj del bloque menos el sello de
    /// la última cerrada.
    private var parcialVivoS: Double {
        max(0, session.condElapsed - (session.fixedRoundSplits.last?.elapsed ?? 0))
    }

    /// La MEDIA, no el parcial de la última: ese ya lo dice la ronda tachada
    /// de la banda, y escribir el mismo número dos veces en la misma pantalla
    /// es como empiezan las tres grafías del ritmo.
    private var mediaCell: MetricRow3.Cell {
        // Sin unidad: «1:52 / ronda» envolvía la celda a dos líneas y esos
        // ~35 pt eran justo el margen del nivel 3 (verif2). La etiqueta ya
        // dice de qué es la media.
        let media = RoundsReadings.mediaS(session.fixedRoundSplits.map(\.seconds))
        return .init(label: "Tu media",
                     value: media.map { Formato.clock($0.rounded()) },
                     ausente: "desde la 2ª")
    }

    /// Dónde acabas y si te estás cayendo — SOLO de rondas cerradas. Es una
    /// FRASE, no una cifra: monoespaciar lo que no se mide lo disfraza de
    /// medida.
    private var lectura: Text? {
        let cerradas = session.fixedRoundSplits.map(\.seconds)
        guard let proyeccion = RoundsReadings.proyeccionS(rondas: session.fixedListTotal,
                                                          cerradas: cerradas) else { return nil }
        let cap = seg?.formatTotalSeconds
        let seComeElTope = cap.map { proyeccion > Double($0) } ?? false
        var frase = seComeElTope
            ? "Al ritmo de lo que llevas, te comes el tope."
            : "Al ritmo de lo que llevas, acabas sobre \(Formato.clock(proyeccion))."
        if let delta = RoundsReadings.caidaS(cerradas) {
            frase += delta > 0
                ? " La última te costó \(Int(delta.rounded())) s más que tu media."
                : " La última te costó \(Int((-delta).rounded())) s menos que tu media."
        }
        return Text(frase)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(seComeElTope ? Theme.Color.accentText : Theme.Color.muted)
    }
}

// MARK: - El cromo compartido de las dos caras

/// El formato, dónde vas (solo cuando el numeral no lo dice ya) y el reloj del
/// bloque — que es el score de un For Time y no puede irse de la pantalla. El
/// último minuto de un tope cuenta hacia ATRÁS y se pone rojo, el mismo giro
/// que hacía el reloj grande.
private struct RoundsContextStrip: View {
    let session: WorkoutSession
    let posicion: String?

    private var cap: Int? { session.currentSegment?.formatTotalSeconds }
    private var capRemaining: Double? {
        guard let cap else { return nil }
        let r = Double(cap) - session.condElapsed
        return (r <= 60 && r > 0) ? r : nil
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(session.currentSegment?.formatScheme?.displayName.uppercased() ?? "")
                .font(.system(size: 10, weight: .heavy)).tracking(1.0)
                .foregroundStyle(Theme.Color.accentText)
                .fixedSize()
            if let posicion {
                // NUNCA `.fixedSize()`: un título de bloque largo comprimía al
                // vecino y el reloj del For Time — el score — acababa partido
                // un dígito por línea (verif2). El título cede; el reloj no.
                // `muted`, no `faint`: en el SUELO esta línea es la ÚNICA
                // mención de la ronda, y faint da 3,08:1 sobre surface — bajo
                // AA (verif3). La misma regla que el chip del deshacer.
                Text(posicion)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .layoutPriority(-1)
            }
            Spacer(minLength: 6)
            Text(Formato.clock(capRemaining ?? session.condElapsed, anchoFijo: true))
                .font(.system(size: 17, weight: .semibold, design: .monospaced))
                .foregroundStyle(capRemaining != nil ? Theme.Color.danger : Theme.Color.foreground)
                .monospacedDigit()
            // El tope, SIEMPRE visible mientras corre: una lectura que dice «te
            // comes el tope» sobre un tope invisible no se puede juzgar. En el
            // último minuto el reloj ya ES la cuenta atrás roja y el cap sobra.
            if let cap, capRemaining == nil {
                Text("cap \(Formato.clock(Double(cap)))")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .stripChrome()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(session.currentSegment?.formatScheme?.displayName ?? "Formato"), \(posicion ?? "ronda \(session.fixedRoundsDone + 1) de \(session.fixedListTotal)"). Tiempo \(Formato.clock(session.condElapsed))")
    }
}

// MARK: - Los dos sujetos

/// El trabajo de la ronda, escrito una vez. Un movimiento por línea y no todos
/// en una tira: cuatro líneas cortas se leen de pie; una tira de «8 Back Squat
/// · 75% · 12,5 m Sled Push…» no.
private struct SujetoTrabajoRonda: View {
    let seg: WorkoutSegment?
    let grande: Bool

    private var lineas: [String] {
        (seg?.declaredComponents ?? []).map { c in
            let cuerpo = c.work.map { "\($0) \(c.name)" } ?? c.name
            return c.detail.map { "\(cuerpo) · \($0)" } ?? cuerpo
        }
    }

    /// La banda es FIJA (la clave del umbral puro en rondas): hasta cuatro
    /// líneas caben enteras; un WOD de más movimientos enseña tres y lo dice
    /// («+2 más» — el detalle completo vive en la previa), en vez de crecer y
    /// mover el umbral con el peso del texto.
    private var visibles: [String] {
        lineas.count <= 4 ? lineas : Array(lineas.prefix(3))
    }

    var body: some View {
        if lineas.isEmpty {
            // Un bloque sin trabajo declarado no tiene nada que subir a la
            // banda: el reloj del cromo y las rondas son toda su verdad.
            EmptyView()
        } else {
            VStack(spacing: grande ? 6 : 3) {
                ForEach(visibles, id: \.self) { linea in
                    Text(linea)
                        .font(.system(size: grande ? 25 : 17, weight: .heavy).italic())
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                if visibles.count < lineas.count {
                    Text("+\(lineas.count - visibles.count) más")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: grande ? RoundsListBudget.bandaListaPt : 90, alignment: .center)
            .accessibilityElement(children: .combine)
        }
    }
}

/// La banda del contador: la cerrada tachada (mantén para deshacer, el mismo
/// gesto que la lista), la cuenta en el numeral, el trabajo, la que viene.
private struct SujetoContadorRonda: View {
    let session: WorkoutSession
    let seg: WorkoutSegment?
    /// El nivel mínimo de la cascada: cae la insinuación de la ronda siguiente
    /// (puro dato informativo; el chip de la ANTERIOR se queda, que es el
    /// deshacer y una función no se recorta).
    var compacto: Bool = false

    private var activa: Int { min(session.fixedRoundsDone, session.fixedListTotal - 1) }

    var body: some View {
        VStack(spacing: 6) {
            if let anterior = session.fixedRoundSplits.last, session.fixedRoundsDone > 0 {
                // `muted` y no `faint`: esta línea es la ÚNICA memoria de lo que
                // costó la anterior y además es el blanco del deshacer — tiene
                // que pasar AA. Subordinada lo está de sobra: 13 contra 76.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("Ronda \(session.fixedRoundsDone)")
                        .font(.system(size: 13, weight: .semibold))
                        .strikethrough(true, color: Theme.Color.muted)
                    Text(Formato.clock(anterior.seconds))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                }
                .foregroundStyle(Theme.Color.muted)
                .contentShape(Rectangle())
                .onLongPressGesture(minimumDuration: 0.5) { session.unmarkLastRound() }
                .accessibilityLabel("Ronda \(session.fixedRoundsDone), cerrada en \(Formato.clock(anterior.seconds)). Mantén pulsado para deshacerla.")
            } else {
                // La fila se reserva igual: sin ella el numeral subiría en la
                // primera ronda y bajaría en la segunda, y el sujeto no baila.
                Color.clear.frame(height: 16).accessibilityHidden(true)
            }

            // El numeral DESNUDO, sin tarjeta: el sujeto gobierna la pantalla
            // (§10.2) y una CardSurface alrededor lo encogía a una celda más.
            // La tipografía es la del readout de la casa (mono de cifra), al
            // tamaño que el presupuesto del hueco permite — 96, no los 125 del
            // doble, y queda declarado como adaptación.
            LabelText(text: "Ronda", size: 10)
            Text("\(activa + 1)/\(session.fixedListTotal)")
                .font(.system(size: 96, weight: .heavy, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(height: 96)

            SujetoTrabajoRonda(seg: seg, grande: false)

            if !compacto {
                if activa + 1 < session.fixedListTotal {
                    // La que viene: solo su número. Una ronda pendiente no
                    // tiene nada que decir.
                    Text("Ronda \(activa + 2)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    Color.clear.frame(height: 16).accessibilityHidden(true)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - El hilo

/// FINO: dice dónde vas, no compite con el sujeto. Los parciales no se
/// dibujan — se DICEN en la lectura de abajo, que es precisa donde un dibujo
/// de barras casi iguales obliga a adivinar. La ronda en curso es una aguja,
/// no una barra que crece: por dónde vas DENTRO de ella es justo lo que nadie
/// cuenta, y un relleno parcial se lo estaría inventando.
private struct HiloDeRondas: View {
    let session: WorkoutSession

    private var rondas: Int { session.fixedListTotal }
    private var cerradas: Int { session.fixedRoundsDone }

    var body: some View {
        VStack(spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                LabelText(text: "Por dónde vas", size: 10)
                Spacer()
                Text("\(cerradas) de \(rondas) cerradas")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.Color.muted)
            }
            GeometryReader { geo in
                let porTramos = RoundsReadings.hiloPorTramos(rondas: rondas, anchoPt: geo.size.width)
                HStack(alignment: .center, spacing: porTramos ? 3 : 1) {
                    ForEach(0..<max(rondas, 1), id: \.self) { i in
                        let hecha = i < cerradas
                        let enCurso = i == cerradas
                        RoundedRectangle(cornerRadius: 3)
                            .fill(hecha
                                  ? Theme.Color.foreground.opacity(0.58)
                                  : (enCurso ? Theme.Color.accent : Theme.Color.hairlineStrong))
                            .frame(height: enCurso ? 11 : 6)
                    }
                }
                .frame(height: 11, alignment: .center)
            }
            .frame(height: 11)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(cerradas) rondas cerradas de \(rondas). Vas por la \(cerradas + 1).")
    }
}

// MARK: - Las filas (la cara de pocas rondas)

/// La misma lista de siempre, con el trabajo FUERA de las filas: una línea por
/// ronda. La activa se marca tocándola; la última cerrada se deshace
/// manteniéndola — nada que la lista sabía hacer se pierde.
private struct RoundRowsList: View {
    let session: WorkoutSession

    var body: some View {
        CardSurface(padding: 0, topAccent: true) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Recorre las rondas", size: 10)
                    Spacer()
                    Text("MARCA CADA RONDA")
                        .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                ForEach(0..<session.fixedListTotal, id: \.self) { i in
                    Hairline()
                    fila(i)
                }
            }
        }
    }

    @ViewBuilder
    private func fila(_ i: Int) -> some View {
        let done = i < session.fixedRoundsDone
        let active = i == session.fixedRoundsDone
        Button(action: { if active { session.markRoundDone() } }) {
            HStack(spacing: 10) {
                Text("Ronda \(i + 1)")
                    .font(.system(size: 14, weight: active ? .heavy : .semibold))
                    .foregroundStyle(done ? Theme.Color.faint : Theme.Color.foreground)
                    .strikethrough(done, color: Theme.Color.faint)
                    .lineLimit(1)
                Spacer(minLength: 6)
                if let cola = cola(i, done: done, active: active) {
                    Text(cola)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(active ? Theme.Color.accentText : Theme.Color.faint)
                        .lineLimit(1)
                }
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(done ? Theme.Color.ok : (active ? Theme.Color.accentText : Theme.Color.faint))
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(active ? Theme.Color.accent.opacity(0.08) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!active)
        .simultaneousGesture(LongPressGesture().onEnded { _ in
            if done && i == session.fixedRoundsDone - 1 { session.unmarkLastRound() }
        })
        .accessibilityLabel("Ronda \(i + 1), \(done ? "hecha" : (active ? "actual, toca para marcar" : "pendiente"))")
    }

    /// Lo que costó la cerrada (y lo que midió la máquina, si algo midió), lo
    /// que lleva la de ahora. Una pendiente no dice nada — un guion ahí se lee
    /// como un parcial de cero.
    private func cola(_ i: Int, done: Bool, active: Bool) -> String? {
        if done {
            guard i < session.fixedRoundSplits.count else { return nil }
            let s = session.fixedRoundSplits[i]
            let tiempo = Formato.clock(s.seconds)
            guard let trabajo = s.workLine else { return tiempo }
            return "\(trabajo) · \(tiempo)"
        }
        guard active else { return nil }
        return Formato.clock(max(0, session.condElapsed - (session.fixedRoundSplits.last?.elapsed ?? 0)))
    }
}

// MARK: - El suelo de los rotativos

/// El suelo honesto de los formatos ROTATIVOS y el continuo (tabata,
/// interválico sin medida, death-by, steady sin máquina): el reloj del bloque
/// y el pulso. Su cursor de ronda es `rotRoundIndex` — lo mueve el RELOJ del
/// motor, no el toque — así que la cara por rondas (que cuelga de
/// `fixedRoundsDone`) aquí mentiría congelada en «Ronda 1». No hay pantalla
/// diseñada para estos casos y esto no inventa una: dice menos, pero nada falso.
struct RotatingClockHUD: View {
    let session: WorkoutSession

    private var cap: Int? { session.currentSegment?.formatTotalSeconds }
    private var capFlip: Bool {
        guard let cap, !session.isCondCountIn else { return false }
        let remaining = Double(cap) - session.condElapsed
        return remaining <= 60 && remaining > 0
    }

    var body: some View {
        VStack(spacing: 12) {
            clock
            MetricRow3(cells: [
                .init(label: "Ronda",
                      value: session.tramoRoundTotal > 1
                          ? "\(min(session.tramoRoundIndex + 1, session.tramoRoundTotal))/\(session.tramoRoundTotal)"
                          : nil,
                      ausente: "sin series"),
                .init(label: "Tope",
                      value: cap.map { Formato.clock(Double($0)) },
                      ausente: "sin tope"),
                hrCell(session)
            ])
        }
    }

    @ViewBuilder
    private var clock: some View {
        if session.isCondCountIn {
            FormatClockHero(caption: "Prepárate",
                            value: "\(Int(session.condCountInRemaining.rounded(.up)))",
                            color: Theme.Color.accentText)
        } else if capFlip, let cap {
            FormatClockHero(caption: "Cierre del cap",
                            value: Formato.clock(max(0, Double(cap) - session.condElapsed), anchoFijo: true),
                            sub: "cap \(Formato.clock(Double(cap)))",
                            color: Theme.Color.danger, urgent: true)
        } else {
            FormatClockHero(caption: "Tiempo",
                            value: Formato.clock(session.condElapsed, anchoFijo: true),
                            sub: cap.map { "cap \(Formato.clock(Double($0)))" },
                            color: Theme.Color.foreground)
        }
    }
}
