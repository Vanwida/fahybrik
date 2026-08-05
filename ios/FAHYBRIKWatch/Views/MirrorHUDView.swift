import SwiftUI

// The wrist HUD for MIRROR MODE. Every value is frame-driven — the phone's engine
// is the single authority; this screen renders its pushed snapshot and re-bases the
// clock locally between frames. Two pages (TabView .page): the LIVE glance (default)
// and a thin CONTROLS page. Layout borrows the standalone live idiom (LiveScaffold,
// the zone bar from ContinuousLiveView, the rest banner's green take-over) so the
// two modes read identically on the wrist.
struct MirrorHUDView: View {
    let controller: MirrorSessionController

    // 0 = live (default) · 1 = controls (one swipe away).
    @State private var page = 0
    @State private var lastZoneHapticAt: Date = .distantPast
    /// Local 3-2-1 ceil last felt — the count-in re-bases between frames, so
    /// ticks must fire here when the displayed second changes, not only when a
    /// phone frame lands (phone timers die in background).
    @State private var lastCountInCeil: Int? = nil
    /// La muñeca bajada. El lienzo lo resuelve para el vivo; aquí se aplica a las
    /// dos capas que lo tapan (pausa y descanso), que no pasan por él.
    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        TabView(selection: $page) {
            livePage.tag(0)
            controlsPage.tag(1)
        }
        .tabViewStyle(.page)
    }

    // MARK: - Live page

    private var livePage: some View {
        ZStack {
            if controller.state == .ending || phase == MirrorWire.Phase.finished {
                savingOverlay
            } else if phase == MirrorWire.Phase.gate {
                gateContent
            } else if phase == MirrorWire.Phase.countIn {
                countInContent
            } else {
                // LA CINTA YA NO TIENE PANTALLA APARTE. El tramo del cable trae
                // sus metros y su objetivo como los de cualquier carrera, así que
                // la pinta el mismo guion — con la marca «del móvil», que es lo
                // único que la distingue de correr fuera. Tener una rama propia
                // la dejaba fuera del lienzo y, con él, fuera del estado atenuado:
                // justo la pantalla que se mira con el brazo colgando en la cinta.
                //
                // Dobles conserva la suya hasta que su guion esté portado: quitarla
                // ahora dejaría al relevo sin pantalla, que es peor.
                if let dobles = frame?.dobles {
                    doblesContent(dobles)
                } else {
                    activeContent
                }
                // Los dos tapan la pantalla entera, así que en atenuado bajan el
                // brillo en vez de quedarse encendidos a plena luz: el descanso es
                // POR DEFINICIÓN el momento en que la muñeca está abajo.
                if phase == MirrorWire.Phase.paused {
                    pausedOverlay.opacity(atenuado ? 0.65 : 1)
                } else if let rest = frame?.restRemaining {
                    restOverlay(base: rest).opacity(atenuado ? 0.7 : 1)
                }
            }
        }
        // Out-of-zone nudge — same throttle as the standalone continuous screen, and
        // only while actually working (never on a gate / pause / rest).
        .onChange(of: controller.liveZone) { _, zone in
            guard phase == MirrorWire.Phase.active,
                  let target = targetZone, let zone, zone != target,
                  Date().timeIntervalSince(lastZoneHapticAt) >= WatchTheme.zoneExitHapticThrottle else { return }
            lastZoneHapticAt = Date()
            WatchHaptics.warning()
        }
        // #56 — "entras tú": the station flipped from the partner's relay back to the
        // athlete (partner → mine/split). Fire the double handoff haptic so a resting
        // athlete knows to go, even without looking at the wrist.
        .onChange(of: frame?.dobles?.role) { old, new in
            guard phase == MirrorWire.Phase.active,
                  old == "partner", new == "mine" || new == "split" else { return }
            WatchHaptics.relayHandoff()
        }
    }

    private var gateContent: some View {
        LiveScaffold {
            VStack(spacing: 8) {
                Text(frame?.blockTitle ?? "Bloque")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                WatchLabel(text: "Listo para empezar", accent: true)
            }
        } bottom: {
            advanceButton
        }
    }

    // The structured-run 3-2-1 pre-roll, rendered like the standalone view
    // (StructuredRunLiveView.countIn): "Prepárate" + a CEIL count-in re-based locally,
    // with the first tramo (frame.lineTitle) as the "luego" preview. No bottom button —
    // the count-in isn't skippable from the mirrored wrist (matches standalone).
    private var countInContent: some View {
        LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 0.25)) { context in
                let remaining = countInRemaining(context.date)
                let ceil = max(0, Int(ceil(remaining)))
                VStack(spacing: 6) {
                    WatchLabel(text: "Prepárate")
                    GiantNumber(text: CountdownFormat.standalone(remaining), size: 84, color: WatchTheme.orange)
                    if let next = frame?.lineTitle {
                        Text(next)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                            .padding(.top, 1)
                    }
                }
                // Local tick: fire when the CEIL second drops (3→2→1→0).
                .onChange(of: ceil) { _, n in
                    guard phase == MirrorWire.Phase.countIn else { return }
                    if n > 0, lastCountInCeil == nil || n < (lastCountInCeil ?? n + 1) {
                        Haptics.cueTick()
                    } else if n == 0, (lastCountInCeil ?? 1) > 0 {
                        Haptics.cueGo()
                    }
                    lastCountInCeil = n
                }
                .onAppear {
                    if ceil > 0 { lastCountInCeil = ceil }
                }
            }
        }
        .onDisappear { lastCountInCeil = nil }
    }

    private func countInRemaining(_ now: Date) -> Double {
        guard let cd = frame?.countdownRemaining else { return 0 }
        return max(0, cd - sinceFrame(now))
    }

    /// EL VIVO DEL ESPEJO — ahora es el MISMO lienzo y los MISMOS guiones que sin
    /// móvil (`GuionDelEspejo`). Antes esta pantalla tenía lenguaje propio (título
    /// + un crono de 56 pt + dos líneas + un botón de 52 pt), y como el reloj corre
    /// en espejo casi siempre, eso convertía en genérico todo el diseño por formato:
    /// el atleta veía la pantalla buena en el 10 % de sus entrenos.
    ///
    /// El botón de abajo desaparece con él: en este lenguaje **la pantalla ES el
    /// botón**, y el rótulo lo pone el guion según lo que de verdad cierre este
    /// toque — no un booleano precocinado que en la ronda 1 de 5 decía «Terminar».
    @ViewBuilder
    private var activeContent: some View {
        if let f = frame {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                WatchReloj(
                    paginas: GuionDelEspejo.paginas(
                        f,
                        bpm: controller.liveHR,
                        elapsed: heroElapsed(context.date),
                        avanzar: { controller.sendCommand(MirrorWire.CommandKind.advance) }
                    ),
                    tinte: WatchTinte.color(for: controller.liveZone),
                    bisel: bisel
                )
            }
        }
    }

    /// El aro lo DECIDE el guion (dato puro, testeado) y aquí sólo se dibuja:
    /// segmentado en series/fuerza/ergo — el on/off alrededor del cuadrado —,
    /// continuo para una sola cosa en marcha, y nada cuando nadie sabe el total.
    private var bisel: AnyView? {
        guard let f = frame else { return nil }
        switch GuionDelEspejo.aro(f) {
        case .ninguno:
            return nil
        case let .continuo(queda):
            return WatchAroContinuo(remaining: queda).watchBisel()
        case let .segmentado(total, hechas, fraccion):
            return WatchAroSegmentado(total: total, hechas: hechas, fraccion: fraccion).watchBisel()
        }
    }

    /// Los segundos DENTRO de la ventana, re-basados en local entre tramas (los
    /// timers del iPhone mueren en segundo plano).
    private func heroElapsed(_ now: Date) -> Double {
        guard let f = frame else { return 0 }
        let base = f.tramo?.enTramoS ?? f.lapElapsed
        return phase == MirrorWire.Phase.active ? base + sinceFrame(now) : base
    }

    // MARK: - Dobles turn (#56)
    //
    // The wrist glance for a HYROX dobles station: whose turn it is (orange = you, blue
    // = the partner), the station, the rep reparto and — for the partner's relay — a
    // "Recupera" cue. Same clock + HR + advance idiom as activeContent so it never reads
    // like a different mode. Every value is frame-pushed (MirrorDoblesTurn); nothing
    // fabricated. The button reads "Relevo ▸" on the partner's relay.
    private func doblesContent(_ d: MirrorDoblesTurn) -> some View {
        let isPartner = d.role == "partner"
        let accent = isPartner ? WatchTheme.zoneBlue : WatchTheme.orange
        return LiveScaffold(status: frame?.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 5) {
                    Text(doblesHeading(d))
                        .font(.system(size: 12, weight: .heavy).italic())
                        .tracking(1.2)
                        .foregroundStyle(accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(d.station)
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    if let reps = doblesRepsLine(d) {
                        Text(reps)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(isPartner ? WatchTheme.dim : accent)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    GiantNumber(text: heroClock(context.date), size: 44)
                    hrZoneRow
                }
            }
        } bottom: {
            advanceButton
        }
    }

    private func doblesPartner(_ d: MirrorDoblesTurn) -> String {
        let n = d.partnerName?.trimmingCharacters(in: .whitespaces)
        return (n?.isEmpty == false) ? n! : "compañero"
    }

    private func doblesHeading(_ d: MirrorDoblesTurn) -> String {
        switch d.role {
        case "partner": return "AHORA · \(doblesPartner(d).uppercased())"
        case "split":   return "RELEVO CON \(doblesPartner(d).uppercased())"
        default:        return "TE TOCA A TI"
        }
    }

    private func doblesRepsLine(_ d: MirrorDoblesTurn) -> String? {
        switch d.role {
        case "partner":
            return "Recupera"
        case "split":
            if let mine = d.selfReps, let theirs = d.partnerReps {
                return "Tú \(mine) · \(doblesPartner(d)) \(theirs)"
            }
            return "Tú \(d.selfSharePct)%"
        default:   // mine
            return d.selfReps.map { "Completa · \($0) reps" } ?? "Estación completa"
        }
    }

    // MARK: - Treadmill belt (indoor run)
    //
    // The wrist glance for a live treadmill DISTANCE run: a progress bar filling with the
    // covered belt meters (a distance leg has no countdown to tick), the covered pace and
    // the zone — the SAME readouts the phone HUD shows. The BELT values are frame-pushed
    // (the wrist can't derive belt distance locally), so the bar and the meters only move
    // when the phone resends; the CLOCK is re-based locally like activeContent's, because
    // it's what the hero degrades to before the first measured pace. Same status/HR/
    // advance idiom as activeContent.
    private func treadmillContent(_ f: MirrorStateFrame, covered: Double, target: Double?) -> some View {
        LiveScaffold(status: f.blockTitle) {
            // El reloj SÍ se re-basa localmente entre tramas (igual que en
            // activeContent): los metros de la cinta no se pueden derivar aquí, pero el
            // tiempo sí, así que la lectura degradada no se queda congelada.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                treadmillHero(f, now: context.date, covered: covered, target: target)
            }
        } bottom: {
            advanceButton
        }
    }

    /// El cuerpo del hero de cinta. Vive aparte del `LiveScaffold` a propósito: dentro
    /// del `TimelineView` el inferidor de SwiftUI no podía resolver el `Content` del
    /// scaffold, y el error salía apuntando al scaffold en vez de aquí.
    private func treadmillHero(_ f: MirrorStateFrame, now: Date,
                               covered: Double, target: Double?) -> some View {
        let lectura = lecturaDeCinta(f, now: now)
        return VStack(spacing: 6) {
            if let line = f.lineTitle {
                Text(line)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            WatchLabel(text: lectura.etiqueta)
            GiantNumber(text: lectura.texto, size: 46, unit: lectura.unidad)
            beltProgressBar(covered: covered, target: target)
            WatchLabel(text: beltDistanceLabel(covered: covered, target: target))
            hrZoneRow
        }
    }

    /// LA SIGUIENTE VERDAD DISPONIBLE en la cinta: el ritmo cubierto si el teléfono ya
    /// lo ha medido, y mientras no (los primeros metros del tramo) el reloj del tramo.
    /// Etiqueta, cifra y unidad viajan JUNTAS — mismo criterio que
    /// `StructuredRunLiveView.lecturaDelTramo` y que el HUD del teléfono. El guion que
    /// había aquí ocupaba el hero con algo que no dice nada, y con el «/km» al lado
    /// (§7).
    private func lecturaDeCinta(_ f: MirrorStateFrame, now: Date) -> (etiqueta: String, texto: String, unidad: String?) {
        guard let ritmo = f.beltPaceSecPerKm else {
            return (Vocab.tiempo, WatchFormat.clock(f.lapElapsed + sinceFrame(now)), nil)
        }
        return (Vocab.ritmo, WatchFormat.pace(ritmo), Formato.UnidadRitmo.porKm.rawValue)
    }

    private func beltDistanceLabel(covered: Double, target: Double?) -> String {
        guard let target, target > 0 else { return beltDistance(covered, km: covered >= 1000) }
        let km = target >= 1000                              // format both by the target's scale
        return "\(beltDistance(covered, km: km)) / \(beltDistance(target, km: km))"
    }

    private func beltDistance(_ meters: Double, km: Bool) -> String {
        km ? (Formato.distanciaCubierta(meters) ?? "0 m") : "\(Int(meters.rounded())) m"
    }

    /// La barra solo existe cuando hay contra qué llenarla. Sin objetivo de distancia
    /// (un tramo de cinta abierto) se pintaba una cápsula vacía de punta a punta, que
    /// insinúa un progreso hacia una meta que nadie prescribió — el §7 la nombra con
    /// todas las letras. Se omite, y la línea de metros de debajo dice lo que sí se
    /// ha medido.
    @ViewBuilder
    private func beltProgressBar(covered: Double, target: Double?) -> some View {
        if let target, target > 0 {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(WatchTheme.surfaceRaised)
                    Capsule().fill(WatchTheme.orange)
                        .frame(width: geo.size.width * min(1, max(0, covered / target)))
                }
            }
            .frame(height: 8)
        }
    }

    // MARK: - HR + zone bar (mirrors ContinuousLiveView)

    private var hrZoneRow: some View {
        VStack(spacing: 5) {
            HStack {
                HRPill(bpm: controller.liveHR, zoneColor: controller.liveZone.map(WatchTheme.zoneColor) ?? WatchTheme.dim)
                Spacer()
                if let target = targetZone {
                    WatchLabel(text: "Obj \(target.label)")
                }
            }
            if targetZone != nil {
                zoneBar
            }
        }
    }

    private var zoneBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(HRZone.allCases, id: \.rawValue) { zone in
                        Rectangle()
                            .fill(WatchTheme.zoneColor(zone).opacity(controller.liveZone == zone ? 1 : 0.34))
                    }
                }
                if let target = targetZone {
                    Rectangle()
                        .fill(WatchTheme.ink)
                        .frame(width: 3)
                        .offset(x: markerX(for: target, width: geo.size.width))
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .frame(height: 12)
    }

    private func markerX(for zone: HRZone, width: CGFloat) -> CGFloat {
        // Center the marker in the target zone's 1/5 slot.
        let slot = width / CGFloat(HRZone.allCases.count)
        return slot * (CGFloat(zone.rawValue) - 0.5) - 1.5
    }

    // MARK: - Overlays

    private var pausedOverlay: some View {
        ZStack {
            WatchTheme.bg.opacity(0.92).ignoresSafeArea()
            VStack(spacing: 8) {
                Image(systemName: "pause.fill")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(WatchTheme.orange)
                WatchLabel(text: "En pausa", accent: true)
            }
        }
    }

    private func restOverlay(base: Double) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            ZStack {
                WatchTheme.restBg.ignoresSafeArea()
                VStack(spacing: 6) {
                    StatusHeader(text: "Descanso", color: WatchTheme.zoneGreen)
                    Spacer(minLength: 0)
                    WatchLabel(text: "Vuelve en", color: WatchTheme.zoneGreen.opacity(0.85))
                    GiantNumber(
                        // MIRROR of the phone's rest clock → round like the phone (#68).
                        text: CountdownFormat.mirrored(max(0, base - sinceFrame(context.date))),
                        size: 80,
                        color: WatchTheme.zoneGreen
                    )
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
        }
    }

    private var savingOverlay: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 10) {
                ProgressView()
                    .tint(WatchTheme.orange)
                WatchLabel(text: "Guardando…", accent: true)
            }
        }
    }

    // MARK: - Advance button

    /// The FINAL step never ends on one tap (IMG_2385: a free strength session is
    /// one segment inside, so "Siguiente" closed the whole workout mid-warmup).
    /// On the last step the button says what it does — "Terminar" — and asks.
    @State private var confirmingFinish = false

    private var advanceButton: some View {
        let final = isFinalStep
        return BigTapButton(title: advanceTitle) {
            if final {
                confirmingFinish = true
            } else {
                controller.sendCommand(MirrorWire.CommandKind.advance)
            }
        }
        .confirmationDialog(
            "¿Terminar el entreno?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Terminar", role: .destructive) {
                controller.sendCommand(MirrorWire.CommandKind.advance)
            }
            Button("Seguir", role: .cancel) { }
        }
    }

    private var isFinalStep: Bool {
        // Only a POSITIVE final flag (new phones send it) and never on a gate —
        // a gate's advance starts the block, it can't end anything.
        phase != MirrorWire.Phase.gate && frame?.isFinalStep == true
    }

    private var advanceTitle: String {
        if phase == MirrorWire.Phase.gate { return "Empezar ▸" }
        // #56 — the partner's relay station advances the athlete's OWN next station.
        if frame?.dobles?.role == "partner" { return "Relevo ▸" }
        if isFinalStep { return "Terminar" }
        return "Siguiente ▸"
    }

    // MARK: - Controls page

    private var controlsPage: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            if controller.isConnectionLost {
                connectionLostControls
            } else {
                normalControls
            }
        }
    }

    private var normalControls: some View {
        VStack(spacing: 11) {
            pauseResumeButton
            Text("El entreno se controla desde el iPhone")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 12)
    }

    private var pauseResumeButton: some View {
        let paused = phase == MirrorWire.Phase.paused
        return Button {
            WatchHaptics.tap()
            controller.sendCommand(paused ? MirrorWire.CommandKind.resume : MirrorWire.CommandKind.pause)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 18, weight: .heavy))
                Text(paused ? "Reanudar" : "Pausar")
                    .font(.system(size: 16, weight: .heavy))
                Spacer(minLength: 0)
            }
            .foregroundStyle(WatchTheme.ink)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .frame(maxWidth: .infinity)
            .background(WatchTheme.surfaceRaised)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // Phone unreachable but recording alive → honest local exit (mirrors
    // ResumeOfferView's visual idiom).
    private var connectionLostControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            WatchLabel(text: "Sin conexión con el iPhone", accent: true)
            Text("El entreno se sigue grabando aquí.")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
            Spacer(minLength: 0)
            BigTapButton(title: "Terminar y guardar aquí", systemImage: "checkmark") {
                controller.finishLocally()
            }
            Button {
                WatchHaptics.tap()
                controller.discardLocally()
            } label: {
                Text("Descartar")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Derived

    private var frame: MirrorStateFrame? { controller.frame }
    private var phase: String? { controller.frame?.phase }
    private var targetZone: HRZone? { frame?.targetZone.flatMap { HRZone(rawValue: $0) } }

    /// Seconds accrued since the last frame while the clock is running — the active
    /// live clock AND the count-in count-down (both re-based locally between frames);
    /// frozen on a gate / pause / rest-that-isn't-active.
    private func sinceFrame(_ now: Date) -> Double {
        guard let at = controller.frameReceivedAt,
              phase == MirrorWire.Phase.active || phase == MirrorWire.Phase.countIn else { return 0 }
        return max(0, now.timeIntervalSince(at))
    }

    /// The hero clock: a re-based countdown when the phone shows one, else a re-based
    /// count-up of the current lap.
    private func heroClock(_ now: Date) -> String {
        guard let f = frame else { return WatchFormat.clock(0) }
        if let countdown = f.countdownRemaining {
            // MIRROR of the phone's countdown → round like the phone (#68).
            return CountdownFormat.mirrored(max(0, countdown - sinceFrame(now)))
        }
        return WatchFormat.clock(f.lapElapsed + sinceFrame(now))
    }
}
