import SwiftUI
import UIKit

// CORRER FUERA, EN VIVO — la vista más usada de la app, hablando el lenguaje del
// §10 del CONTRATO-UI.
//
// Qué cambió el 29-jul y por qué. La pantalla anterior no era incorrecta: era
// MUDA. Apilaba desde arriba (mapa al 38 % del alto, luego un `ScrollView` que no
// llegaba a llenar), el sujeto vivía en una tarjeta que pesaba igual que las tres
// celdas de debajo (§10.4), la zona de pulso solo teñía una celda de 22 pt en vez
// del lienzo (§10.1), había tres tratamientos distintos de número grande (§10.2),
// las dos acciones pesaban 66 pt cada una y competían con el dato (§10.5), y el
// pulso ausente se pintaba «—», que es exactamente lo que el §7 prohíbe.
//
// El MOTOR no se ha tocado: `OutdoorRunHUDModel` sigue siendo la misma fuente de
// verdad, con el mismo GPS, el mismo auto-cierre por distancia, la misma
// auto-pausa y el mismo Live Activity. Lo que cambia es el idioma.
//
// EL SUJETO LO DECIDE LO QUE PRESCRIBE EL TRAMO, no la máquina:
//
//   cuenta atrás  → los segundos que faltan. No existe nada más todavía.
//   recuperación  → lo que queda de descanso.
//   objetivo ZONA → el PULSO, en el color de su zona (el rodaje en Z2).
//   objetivo RITMO→ el RITMO, con su diferencia contra el objetivo ya leída.
//   sin objetivo  → el ritmo, sin veredicto que dar.
//
// Y cuando el dato que gobierna NO existe, el sujeto DEGRADA a la siguiente
// verdad disponible en vez de pintar un hueco: sin pulso manda el ritmo, sin
// ritmo manda el reloj del tramo. Nunca un guion (§7).

struct OutdoorRunHUDView: View {
    @State private var model: OutdoorRunHUDModel
    /// SALIR DEL ENTRENO, no «cerrar la pantalla».
    ///
    /// Esta vista fue un `fullScreenCover` hasta el 5-ago, así que su aspa llamaba
    /// a `dismiss()` y debajo seguía montado otro HUD del mismo tramo. Ahora ES la
    /// pantalla del entreno cuando corres fuera: no hay nada detrás que descubrir,
    /// y un `dismiss()` desde aquí cerraría el cover del ENTRENO entero (que es
    /// quien presenta a `WorkoutContainer`) sin cerrar la sesión ni soltar los
    /// aparatos. Así que el aspa hace lo mismo que la del cromo de
    /// `ActiveWorkoutView`: pedir la salida, con su confirmación si hay trabajo
    /// registrado.
    let alSalir: () -> Void
    /// Abre la hoja de bloques del padre. Un disparador: `mostrarBloques = true`.
    let alVerBloques: () -> Void
    /// "Avisos de voz" (#63) toggle — shares the key with ProfileView.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    init(session: WorkoutSession, hrZones: HRZoneProfile?,
         alSalir: @escaping () -> Void, alVerBloques: @escaping () -> Void) {
        _model = State(initialValue: OutdoorRunHUDModel(session: session, hrZones: hrZones))
        self.alSalir = alSalir
        self.alVerBloques = alVerBloques
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            // §10.1 — el lienzo ES tu zona. Sin ancla de FC, `liveZone` es nil y
            // aquí no se pinta nada: el fondo se queda neutro y dice la verdad.
            Ambiente(zona: model.liveZone)
            MarcoVivo {
                cromo
            } contexto: {
                contexto
            } sujeto: {
                BandaSujeto { sujeto }
            } apoyos: {
                apoyos
            } accion: {
                accion
            }
        }
        .onAppear {
            model.start()
            // La pantalla despierta la lleva WorkoutContainer por fase (dueño
            // único); el flag suelto que se re-afirmaba aquí ya no hace falta.
        }
        .onDisappear { model.teardown() }
        // AQUÍ VIVÍAN TRES AUTO-CIERRES (`dismissIfLeftRun`, terminar, puerta de
        // bloque). Existían sólo para bajar el cover cuando la sesión se iba de
        // correr; ahora el reparto lo hace `ActiveWorkoutView.superficieViva`, que
        // deja de resolver a esta vista en el mismo instante — y desmontarla ya
        // llama a `teardown()`. Un `dismiss()` aquí, sin cover propio, se llevaría
        // por delante la presentación del entreno entero.
    }

    // MARK: - Cromo — salir, callar, pausar

    private var cromo: some View {
        HStack(spacing: 6) {
            Image(systemName: "figure.run")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
            Text("AL AIRE LIBRE")
                .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                .tracking(0.8)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            Spacer(minLength: 0)
            BotonVerBloques(accion: alVerBloques)
            botonRedondo(voiceCoachEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                         tono: voiceCoachEnabled ? Theme.Color.accentText : Theme.Color.muted,
                         etiqueta: voiceCoachEnabled ? "Silenciar avisos de voz" : "Activar avisos de voz") {
                voiceCoachEnabled.toggle()
                if !voiceCoachEnabled { AudioCoach.shared.stopSpeaking() }
            }
            // La pausa sube al cromo: es cromo, no acción. Abajo pesaba 66 pt y
            // competía con el toque que de verdad cierra el tramo (§10.5).
            botonRedondo(model.session.isPaused ? "play.fill" : "pause.fill",
                         tono: model.session.isPaused ? Theme.Color.accentText : Theme.Color.muted,
                         etiqueta: model.session.isPaused ? "Reanudar" : "Pausa") {
                model.togglePause()
            }
            botonRedondo("xmark", tono: Theme.Color.muted, etiqueta: "Salir del entreno") { alSalir() }
        }
    }

    private func botonRedondo(_ icono: String,
                              tono: Color,
                              etiqueta: String,
                              accion: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); accion() }) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(tono)
                .frame(width: BandaViva.cromo, height: BandaViva.cromo)
                .background(Theme.Color.surface.opacity(0.8), in: Circle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(etiqueta)
    }

    // MARK: - Contexto — dónde estás y con qué te está midiendo la app

    /// La franja que no desaparece jamás: en qué tramo vas, cómo se llama, y el
    /// estado honesto de las dos cosas que miden (el GPS y el reloj de pulso).
    private var contexto: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                if model.isStructured {
                    Text("Tramo \(model.legNumber) de \(model.legTotal)")
                        .scaledFont(11, weight: .heavy, relativeTo: .caption2, italic: true)
                        .tracking(0.6)
                        .foregroundStyle(Theme.Color.accentText)
                }
                Text(tituloTramo)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            chip(model.gpsQuality.label, encendido: model.gpsQuality == .strong, icono: "dot.radiowaves.up.forward")
            chip(model.currentBpm == nil ? "Sin reloj" : Vocab.fc,
                 encendido: model.currentBpm != nil,
                 icono: "heart.fill")
        }
    }

    private var tituloTramo: String {
        if model.session.currentBlockIsStructural {
            return model.session.currentBlockRegion?.phase.displayName
                ?? model.currentSegment?.title
                ?? "Calentamiento"
        }
        if model.isRecovery { return "Recuperación" }
        return model.currentSegment?.title ?? "Correr"
    }

    private func chip(_ texto: String, encendido: Bool, icono: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icono).font(.system(size: 8, weight: .bold))
            Text(texto)
                .scaledFont(9, weight: .heavy, relativeTo: .caption2, italic: true)
                .uppercaseTracked(0.7)
                .lineLimit(1)
        }
        .foregroundStyle(encendido ? Theme.Color.foreground : Theme.Color.muted)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.vertical, 4)
        .background(Theme.Color.surface.opacity(0.8), in: Capsule())
        .accessibilityElement(children: .combine)
    }

    // MARK: - El sujeto

    @ViewBuilder
    private var sujeto: some View {
        if model.session.calentamientoEsListaEnLaCarrera,
           let region = model.session.currentBlockRegion {
            StructuralBlockChecklist(
                segments: model.session.plan.segments(in: region),
                phaseName: region.phase.displayName
            )
        } else if model.isCountIn {
            EtiquetaSujeto(texto: "Prepárate")
            Numeral(texto: "\(max(0, model.countInRemaining))", tono: Theme.Color.accentText)
            Text("Empieza la carrera")
                .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.muted)
        } else if model.isRecovery {
            EtiquetaSujeto(texto: "Recuperación")
            Numeral(texto: Formato.clock(model.legTimeRemaining ?? 0))
        } else {
            switch model.runTarget {
            case let .zone(objetivo): sujetoDeZona(objetivo)
            case let .pace(objetivo): sujetoDeRitmo(objetivo)
            case .none:               sujetoLibre
            }
        }
    }

    /// Objetivo ZONA (el rodaje): el sujeto es el PULSO, en el color de su zona.
    ///
    /// A dos metros, sudando y sin gafas, el color se lee antes que cualquier
    /// número — por eso el ritmo baja a los apoyos, que es donde le toca cuando no
    /// manda. Sin pulso no hay número que pintar: se dice, y el sujeto pasa a la
    /// siguiente verdad que sí existe (§7).
    @ViewBuilder
    private func sujetoDeZona(_ objetivo: HRZone) -> some View {
        if let bpm = model.currentBpm {
            EtiquetaSujeto(texto: Vocab.fc, tono: model.liveZone?.color ?? Theme.Color.muted)
            Numeral(texto: "\(bpm)",
                    tono: model.liveZone?.color ?? Theme.Color.foreground,
                    unidad: Vocab.ppm)
        } else {
            EtiquetaSujeto(texto: lecturaViva.etiqueta)
            Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
        }
        BandaZonas(actual: model.liveZone, objetivo: objetivo)
        Text(fraseDeZona(objetivo))
            .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
            .foregroundStyle(model.liveZone == objetivo ? Theme.Color.foreground : Theme.Color.warning)
            .multilineTextAlignment(.center)
        // El ancla de las zonas viaja marcada cuando el servidor la estimó: una
        // banda estimada que parece medida es como un número que nadie midió se
        // convierte en evidencia.
        if let zonas = model.hrZones, zonas.estimated {
            Text(zonas.sourceLabel)
                .scaledFont(11, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// Lo que hay que oír cuando te sales, sin drama y con qué hacer.
    private func fraseDeZona(_ objetivo: HRZone) -> String {
        guard let actual = model.liveZone else { return "Sin pulso no hay zona que enseñar" }
        if actual == objetivo { return "Estás donde toca" }
        if actual.rawValue < objetivo.rawValue { return "Vas por debajo. Aprieta un poco para volver a \(objetivo.label)" }
        return "Te has ido a \(actual.label). Afloja un poco y vuelve a \(objetivo.label)"
    }

    /// Objetivo RITMO: el sujeto es el ritmo, con la diferencia YA interpretada.
    ///
    /// «4:32» obliga al atleta a acordarse de su objetivo y restar de cabeza
    /// corriendo; «+7 s vs objetivo» ya está leído. Es la idea del ergo que nadie
    /// copiaba, y aquí es donde más falta hacía.
    @ViewBuilder
    private func sujetoDeRitmo(_ objetivo: PaceTarget) -> some View {
        if let ritmo = model.livePaceSecPerKm {
            EtiquetaSujeto(texto: Vocab.ritmo)
            Numeral(texto: Formato.ritmoCifras(Double(ritmo)),
                    tono: colorDeEstado(model.heroStatus),
                    unidad: Formato.UnidadRitmo.porKm.rawValue)
            if let desvio = desvioConSigno(ritmo, objetivo) {
                DeltaPastilla(delta: Delta(valor: Double(desvio),
                                           unidad: "s",
                                           sentido: .menos,
                                           sufijo: Vocab.vsObjetivo,
                                           textoNulo: "en el objetivo"))
            }
        } else if let ordenado = objetivo.label {
            // Todavía no hay ritmo medido: el sujeto es la ORDEN, no un número
            // que nadie ha medido (§7).
            EtiquetaSujeto(texto: Vocab.objetivo)
            Numeral(texto: ordenado, unidad: Formato.UnidadRitmo.porKm.rawValue)
            Text(model.gpsQuality.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
        } else {
            // Ni ritmo medido ni objetivo legible (una banda sin valores usables).
            // La siguiente verdad disponible es el reloj del tramo, que es lo único
            // que la app sabe con certeza — la misma degradación de `lecturaViva`.
            EtiquetaSujeto(texto: lecturaViva.etiqueta)
            Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
            Text(model.gpsQuality.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// Un tramo sin objetivo evaluable: se enseña lo que hay, sin fingir veredicto.
    @ViewBuilder
    private var sujetoLibre: some View {
        EtiquetaSujeto(texto: lecturaViva.etiqueta)
        Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
    }

    /// LA SIGUIENTE VERDAD DISPONIBLE: el ritmo si ya se ha medido, y si no el
    /// reloj del tramo, que es lo único que la app sabe con certeza.
    ///
    /// Etiqueta y cifra viajan JUNTAS a propósito. Cuando eran dos decisiones
    /// separadas la pantalla acababa poniendo «Ritmo» encima de un cronómetro al
    /// degradar — mentir con la etiqueta es mentir igual (§7), y encima es el
    /// error más difícil de ver porque cada mitad, por su cuenta, es correcta.
    private var lecturaViva: (etiqueta: String, texto: String, unidad: String?) {
        guard let ritmo = model.livePaceSecPerKm else {
            return (Vocab.tiempo, Formato.clock(model.legElapsedEffective, anchoFijo: true), nil)
        }
        return (Vocab.ritmo, Formato.ritmoCifras(Double(ritmo)), Formato.UnidadRitmo.porKm.rawValue)
    }

    /// El desvío CON SIGNO contra el objetivo. `paceDeviationSecPerKm` devuelve la
    /// magnitud (el aviso de voz solo necesita cuánto), pero una pastilla tiene que
    /// decir hacia qué lado: el signo lo pone el estado.
    private func desvioConSigno(_ ritmo: Int, _ objetivo: PaceTarget) -> Int? {
        guard let magnitud = model.runTarget.paceDeviationSecPerKm(currentSecPerKm: ritmo) else { return nil }
        switch objetivo.status(currentSecPerKm: ritmo) {
        case .tooSlow:  return magnitud       // más segundos por km = vas más lento
        case .tooFast:  return -magnitud
        case .inTarget: return 0
        case .unknown:  return nil
        }
    }

    private func colorDeEstado(_ estado: TargetStatus) -> Color {
        switch estado {
        case .inTarget: return Theme.Color.ok
        case .tooFast:  return Theme.Color.warning
        case .tooSlow:  return Theme.Color.danger
        case .unknown:  return Theme.Color.foreground
        }
    }

    // MARK: - Apoyos — y el mapa, que es quien se gana el sobrante

    /// El segundo nivel de lectura, y debajo el mapa.
    ///
    /// El mapa ERA el 38 % del alto y vivía ENCIMA del sujeto, que es lo que hacía
    /// que la pantalla se leyera de arriba abajo en vez de por importancia. Aquí
    /// se queda con lo que sobra de la banda de apoyos (§6.1: «el sobrante entra
    /// en las filas»): sigue siendo una superficie de vistazo, deja de mandar, y
    /// en un tramo con mucho que decir se encoge solo.
    private var apoyos: some View {
        VStack(spacing: Theme.Spacing.s) {
            FilaApoyos {
                if model.currentBpm != nil, esObjetivoDeZona {
                    // El pulso ya ES el sujeto: aquí sería decir dos veces lo mismo.
                    ApoyoVivo(etiqueta: Vocab.ritmo,
                              valor: model.livePaceSecPerKm.map { Formato.ritmoCifras(Double($0)) },
                              unidad: Formato.UnidadRitmo.porKm.rawValue,
                              ausente: model.gpsQuality.label)
                } else {
                    ApoyoVivo(etiqueta: Vocab.fc,
                              valor: model.currentBpm.map { "\($0)" },
                              unidad: Vocab.ppm,
                              tono: model.liveZone?.color ?? Theme.Color.foreground,
                              ausente: "sin reloj")
                }
                ApoyoVivo(etiqueta: Vocab.tiempo,
                          valor: Formato.clock(model.legElapsedEffective, anchoFijo: true))
                ApoyoVivo(etiqueta: Vocab.distancia,
                          valor: Formato.distanciaCubierta(model.coveredMeters))
            }
            objetivoDelTramo
            referenciaDeGuia
            if model.isAutoPaused { avisoAutoPausa }
            RunRouteMapView(coordinates: model.coordinates,
                            quality: model.gpsQuality,
                            paused: model.isAutoPaused)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1))
        }
    }

    private var esObjetivoDeZona: Bool {
        if case .zone = model.runTarget { return true }
        return false
    }

    @ViewBuilder
    private var objetivoDelTramo: some View {
        if !model.isRecovery {
            switch model.currentLeg.goal {
            case let .distance(target):
                GoalProgress(caption: "Distancia del tramo",
                             primary: Formato.distancia(model.legCoveredMeters) ?? "0 m",
                             secondary: Formato.distancia(target) ?? "0 m",
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case let .time(target):
                // Lo LLEVADO contra lo pedido, no lo que queda. `GoalProgress` se
                // lee «X de Y», así que meter ahí el restante hacía que un tramo
                // recién empezado dijera «40:00 / 40:00» — es decir, terminado, con
                // el cronómetro a cero. La distancia ya enseñaba lo cubierto; el
                // tiempo enseñaba lo contrario en la misma caja.
                GoalProgress(caption: "Tiempo del tramo",
                             primary: Formato.clock(model.legElapsedEffective),
                             secondary: Formato.clock(target),
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case .open:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private var referenciaDeGuia: some View {
        let partes: [String] = {
            var p: [String] = []
            if let inc = model.prescribedInclinePct, inc > 0 {
                p.append("Inclinación \(Formato.esDecimal(inc))%")
            }
            if let cad = model.prescribedCadenceSpm { p.append("Cadencia \(cad) \(Vocab.cadencia)") }
            return p
        }()
        if !partes.isEmpty {
            Text(partes.joined(separator: " · "))
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
        }
    }

    private var avisoAutoPausa: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "pause.circle.fill").font(.system(size: 16, weight: .bold))
            Text("Auto-pausa · sin movimiento")
                .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                .tracking(0.4)
            Spacer(minLength: 0)
            Text("Se reanuda solo").scaledFont(11, weight: .medium, relativeTo: .caption2)
        }
        .foregroundStyle(Theme.Color.warning)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.warningTint, in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityLabel("Auto-pausa activada, sin movimiento; se reanuda al moverte")
    }

    // MARK: - La acción

    /// Una sola, anclada abajo, y en contorno salvo cuando el toque es lo ÚNICO
    /// que cierra el tramo.
    ///
    /// Un tramo por distancia lo cierra el GPS al cruzar el hito; uno por tiempo,
    /// el reloj de la sesión. En los dos el toque es un ATAJO, y un atajo no se
    /// pinta como la salida. Solo el tramo ABIERTO —el rodaje que no termina hasta
    /// que tú lo dices— se gana el relleno.
    private var accion: some View {
        if model.session.currentBlockIsStructural {
            FranjaAccion(titulo: model.session.tituloHechoEstructural,
                         unicaSalida: true,
                         nota: nil) {
                model.session.completeStructuralBlock()
            }
        } else {
            FranjaAccion(titulo: model.isStructured ? "TRAMO HECHO" : "HECHO",
                         unicaSalida: model.currentLeg.goal == .open,
                         nota: notaDeAccion) {
                model.endLegNow()
            }
        }
    }

    private var notaDeAccion: String? {
        switch model.currentLeg.goal {
        case .distance: return "se cierra solo al llegar"
        case .time:     return "se cierra solo al acabar"
        case .open:     return nil
        }
    }
}

// MARK: - Las cinco zonas a lo ancho, con la tuya encendida

/// La banda de zonas: el objetivo señalado aunque no estés en él.
///
/// Vive aquí y no en `Theme/LenguajeVivoUI.swift` porque es de CORRER: solo tiene
/// sentido cuando el objetivo del tramo es una zona. El lenguaje compartido es el
/// tinte, el numeral, el marco y la acción — no cada instrumento de cada deporte.
private struct BandaZonas: View {
    let actual: HRZone?
    let objetivo: HRZone

    var body: some View {
        HStack(spacing: 4) {
            ForEach(HRZone.allCases, id: \.rawValue) { z in
                let viva = z == actual
                VStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .fill(z.color)
                        .opacity(viva ? 1 : 0.2)
                        .frame(height: viva ? 20 : 14)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                                .stroke(viva ? Theme.Color.foreground.opacity(0.45) : .clear, lineWidth: 2)
                        )
                    Text(z == objetivo && !viva ? "\(z.label) ·" : z.label)
                        .scaledFont(10, weight: viva ? .heavy : .semibold,
                                    relativeTo: .caption2, italic: viva)
                        .uppercaseTracked(0.9)
                        .foregroundStyle(viva ? z.color : Theme.Color.faint)
                }
            }
        }
        .animation(.easeInOut(duration: 0.4), value: actual)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(actual.map { "Estás en \($0.label), objetivo \(objetivo.label)" }
                            ?? "Sin pulso; objetivo \(objetivo.label)")
    }
}

// MARK: - Los dos estados de diseño, para abrirlos en el lienzo de Xcode

#if DEBUG
/// Un rodaje de 40:00 con objetivo Z2 — el caso que dirige esta pantalla.
private func rodajeDePrueba() -> WorkoutSession {
    let tramo = WorkoutSegment(order: 1, title: "Rodaje 40:00", kind: .running,
                               targetDurationSeconds: 2400, targetZone: .z2,
                               blockTitle: "Carrera", blockPosition: 1)
    let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                           estimatedDurationSeconds: 2400, blockContext: "Carrera",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    return WorkoutSession(plan: plan)
}

/// Las bandas tal y como las manda el servidor, sobre un umbral de 170 ppm.
private func zonasDePrueba() -> HRZoneProfile {
    HRZoneProfile(
        lthrBpm: 170, estimated: true, source: "from_age",
        sourceLabel: "Zonas estimadas por tu edad", confidence: "estimated",
        zones: [
            HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
            HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
            HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
            HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
            HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
        ]
    )
}

/// CON PULSO — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona y el
/// sujeto es el pulso en el color de esa zona (§10.1).
#Preview("Correr en vivo · con pulso") {
    let sesion = rodajeDePrueba()
    sesion.liveHRBpm = 145        // Z2 con el umbral de 170 → estás donde toca
    return OutdoorRunHUDView(session: sesion, hrZones: zonasDePrueba(),
                             alSalir: {}, alVerBloques: {})
}

/// SIN ANCLA DE FC — el servidor no mandó zonas y no hay reloj. NO hay tinte, no
/// hay zona, y el sujeto degrada a la siguiente verdad que sí existe. Ni un guion
/// ni una barra vacía (§7). Es el atleta recién dado de alta, que es el caso de
/// diseño (§6.3) — no la versión rota de la de arriba.
#Preview("Correr en vivo · sin ancla de FC") {
    OutdoorRunHUDView(session: rodajeDePrueba(), hrZones: nil,
                      alSalir: {}, alVerBloques: {})
}
#endif

// AQUÍ ESTABA `OutdoorEntryButton` («CORRER FUERA»), y su gemelo `TreadmillEntryButton`
// en `Devices/Treadmill/TreadmillHUDComponents.swift`. Los dos abrían un cover encima
// de la pantalla del entreno, y con los covers se van ellos: a la pantalla de correr
// no se entra desde otra pantalla, ES la pantalla del tramo. Lo que se pregunta —dónde
// corres— se contesta en la puerta del bloque y se cambia con «CAMBIAR DE SITIO».
