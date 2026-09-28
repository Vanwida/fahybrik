import SwiftUI

// EL VIVO DEL IPHONE — la anatomía fija (I5), montada sobre el MISMO estado y
// las MISMAS reglas que la muñeca (`Vivo`): un estado, dos pintores. Espejo de
// `kit-iphone-vivo/Vivo.tsx#VistaIphone`.
//
// De arriba abajo, y el sujeto no baila: Cabecera · puntos · Sujeto (alto fijo)
// · Banda del objetivo (si hay) · Trabajo · Rejilla (elástica) · Luego · Tira ·
// Franja de acción. Las páginas laterales (Estructura, Mapa) se deslizan bajo la
// cabecera y sobre la franja: la acción se alcanza siempre.
//
// Sustituye a `RunLiveShellView` detrás de `VivoIphoneBandera`. El motor sigue
// siendo `WorkoutSession`: aquí no se decide nada del dominio, se pinta lo que
// `VivoIphoneCuadro` calcula con el kit compartido.

struct VivoIphoneView: View {
    let session: WorkoutSession
    let hrZones: HRZoneProfile?
    let pm5: PM5ConnectionStore
    let hrLink: DeviceLink
    let treadmillLink: DeviceLink
    var gpsActive = false
    var isBenchmark = false
    /// Un bloque estructural (calentamiento de lista) lo cierra el host de un toque.
    let alAccionDelHost: () -> Void
    let alConectividad: () -> Void
    /// «Terminar y guardar» confirmado en la hoja: el host cierra la sesión (parcial).
    let alTerminarYGuardar: () -> Void
    /// La página con la que arranca (las capturas piden Estructura).
    var paginaInicial: VivoIdPagina = .vivo

    @State private var pagina: VivoIdPagina = .vivo
    @State private var toast: (n: Int, aviso: String, hacer: () -> Void)? = nil
    @State private var hoja = false
    @State private var terminado = false
    @State private var declaradas: [String: Set<Vivo.CampoAnotar>] = [:]
    @State private var foco: VivoFoco? = nil
    @State private var outdoorModel: OutdoorRunHUDModel?
    @State private var treadmillModel: TreadmillHUDModel?
    @State private var planCache: (clave: String, plan: Vivo.PlanVivo)? = nil
    @State private var actividad = VivoActividadEnVivo()

    // MARK: - El estado, desde el motor

    private var plan: Vivo.PlanVivo {
        let clave = "\(session.plan.id)|\(session.runEnvironment?.rawValue ?? "-")|\(hrZones?.lthrBpm ?? 0)|\(isBenchmark)"
        if let c = planCache, c.clave == clave { return c.plan }
        return Vivo.planDe(session.plan, zonas: hrZones, entorno: session.runEnvironment, test: isBenchmark)
    }

    private var dispositivos: Vivo.Dispositivos {
        let paso = Vivo.estadoDe(session, plan: plan).paso
        var maquina: Vivo.Maquina.Tipo? = nil
        if let m = paso.maquina?.tipo {
            if m == .cinta { maquina = treadmillLink.isLive ? .cinta : nil } else if pm5.isConnected { maquina = m }
        } else if Vivo.familiaDe(paso) == .cinta, treadmillLink.isLive { maquina = .cinta }
        let reloj: Vivo.Dispositivos.Reloj = PhoneLiveSession.shared.hasMirroredHKSession ? .segundaPantalla : .sin
        let pulso: Vivo.Dispositivos.Pulsometro = hrLink.isLive ? .banda : (session.liveHRBpm != nil || reloj != .sin ? .reloj : .sin)
        return Vivo.Dispositivos(reloj: reloj, maquina: maquina, pulsometro: pulso)
    }

    private var externo: Vivo.LecturaExterna {
        var x = Vivo.LecturaExterna(dispositivos: dispositivos)
        if pm5.isConnected {
            x.split500 = pm5.live.paceSecondsPer500m
            x.vatios = pm5.live.powerWatts.map(Double.init)
            x.cadencia = session.tramoIsErg ? pm5.live.strokeRate.map(Double.init) : nil
        }
        if let m = outdoorModel { x.gps = m.gpsQuality == .searching ? .buscando : .listo }
        else if gpsActive { x.gps = .listo }
        var viejos: [Vivo.CampoVivo] = []
        if session.tramoIsErg, pm5.connectionLost { viejos += [.split500, .vatios, .cadencia, .cal, .hecho] }
        if session.tramoIsRun, session.runEnvironment == .treadmill, treadmillLink == .lost { viejos += [.ritmo, .hecho] }
        if hrLink == .lost { viejos.append(.ppm) }
        x.viejos = viejos
        return x
    }

    private var cuadro: VivoIphoneCuadro {
        let e = Vivo.estadoDe(session, plan: plan, externo: externo)
        return VivoIphoneCuadro(estado: e, sesion: session, dispositivos: dispositivos, test: isBenchmark, declaradas: declaradas)
    }

    // MARK: - El cuerpo

    var body: some View {
        GeometryReader { g in
            let lienzo = VivoLienzo(ancho: g.size.width, alto: g.size.height)
            let c = cuadro
            ZStack {
                fondo(c)
                VStack(spacing: lienzo.horizontal ? 0 : VivoTokens.hueco) {
                    VivoCabecera(posicion: c.posicion, formato: c.formato, test: c.esTest, crono: c.crono, chips: c.chips) { _ in alConectividad() }
                    if !lienzo.horizontal { VivoPuntosPaginas(total: paginas(c).count, activa: paginas(c).firstIndex(of: pagina) ?? 0) }
                    TabView(selection: $pagina) {
                        ForEach(paginas(c), id: \.self) { id in
                            paginaVista(id, c, lienzo).tag(id)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    if !lienzo.horizontal { franja(c) }
                }
                .padding(.top, 8)
                .opacity(session.isPaused ? 0.4 : 1)
                .animation(.easeOut(duration: 0.2), value: session.isPaused)

                if let t = toast, !hoja {
                    VStack { Spacer(); VivoAvisoDeshacer(aviso: t.aviso) { t.hacer(); toast = nil } }
                        .padding(.bottom, VivoTokens.Alto.accion + VivoTokens.Alto.pieAccion + 10)
                        .id(t.n)
                }
                if session.isPaused, !hoja { VivoVeloPausa() }
                if let n = c.estado.cuenta { VivoCuentaAtras(n: n, paso: c.paso) }
                if hoja {
                    VivoHojaTerminar(resumen: Vivo.resumenParaTerminar(c.paso, sesionM: c.estado.sesion.metros ?? 0, sesionErgoM: c.estado.sesionErgoM, sesionT: c.estado.sesion.t),
                                     alTerminar: { hoja = false; terminado = true; alTerminarYGuardar() },
                                     alSeguir: { hoja = false })
                }
                if terminado { VivoTerminado(titulo: "Sesión terminada", detalle: "guardando lo hecho…") }
                else if c.estado.terminado { VivoTerminado(titulo: "Sesión completada", detalle: "guardando…") }
            }
            .environment(\.vivoLienzo, lienzo)
            .animation(.easeOut(duration: 0.2), value: hoja)
            .animation(.easeOut(duration: 0.2), value: toast?.n)
        }
        .onAppear { pagina = paginaInicial; refrescarPlan(); syncRunModels(); actividad.empezar(titulo: session.plan.name) }
        .onChange(of: session.currentSegmentIndex) { _, _ in syncRunModels(); foco = nil }
        .onChange(of: session.tramoKey) { _, _ in syncRunModels() }
        .onChange(of: session.runEnvironment) { _, _ in refrescarPlan(); syncRunModels() }
        .onDisappear {
            outdoorModel?.teardown(); outdoorModel = nil
            treadmillModel?.teardown(); treadmillModel = nil
            actividad.terminar()
        }
        .task {
            // La Live Activity de las familias sin calle: cada 2 s, la MISMA lámina que el vivo (I11).
            while !Task.isCancelled {
                if outdoorModel == nil { actividad.actualizar(cuadro, pausado: session.isPaused) }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    // MARK: - Las páginas

    private func paginas(_ c: VivoIphoneCuadro) -> [VivoIdPagina] {
        c.conMapa ? [.vivo, .estructura, .mapa] : [.vivo, .estructura]
    }

    @ViewBuilder
    private func paginaVista(_ id: VivoIdPagina, _ c: VivoIphoneCuadro, _ lienzo: VivoLienzo) -> some View {
        switch id {
        case .vivo:
            if lienzo.horizontal, Vivo.admiteHorizontal(c.familia) || c.enDescanso {
                HStack(spacing: VivoTokens.hueco) {
                    VStack(spacing: VivoTokens.hueco) { Spacer(minLength: 0); bloqueSujeto(c, alto: Swift.max(120, lienzo.alto - 200), ancho: lienzo.ancho * 0.5 - 2 * VivoTokens.margen); Spacer(minLength: 0) }
                        .frame(maxWidth: .infinity)
                    VStack(spacing: VivoTokens.hueco) { bloqueApoyo(c); franja(c) }
                        .frame(maxWidth: .infinity)
                }
            } else {
                VStack(spacing: VivoTokens.hueco) {
                    bloqueSujeto(c, alto: VivoTokens.Alto.sujeto, ancho: nil)
                    bloqueApoyo(c)
                }
            }
        case .estructura:
            VivoPaginaEstructura(estado: c.estado)
        case .mapa:
            VivoPaginaMapa(coordenadas: outdoorModel?.coordinates ?? [], calidad: outdoorModel?.gpsQuality ?? .searching,
                           pausado: session.isPaused, metros: c.estado.sesion.metros, ritmoMedio: c.estado.sesion.ritmoMedio)
        }
    }

    @ViewBuilder
    private func bloqueSujeto(_ c: VivoIphoneCuadro, alto: CGFloat, ancho: CGFloat?) -> some View {
        VivoSujeto(heroe: c.heroe, nota: c.nota, alto: alto, ancho: ancho)
        if let b = c.banda { VivoBandaObjetivo(banda: b) } else if let i = c.instruccion { VivoObjetivoInstruccion(texto: i) }
        if let t = c.trabajo {
            // «+30 s» solo en un descanso que se estira: el del reloj de pared (tabata) no.
            let estira = c.enDescanso && c.paso.rol == .descanso && c.familia != .pared
            VivoTrabajo(trabajo: t) { if estira { VivoMas30 { sumar30() } } }
        }
    }

    @ViewBuilder
    private func bloqueApoyo(_ c: VivoIphoneCuadro) -> some View {
        let anota = c.enDescanso && !c.seriesAnotables.isEmpty
        VivoRejilla(metricas: anota ? Array(c.metricas.prefix(2)) : c.metricas, compacta: anota) {
            if anota {
                VivoAnotarSerie(series: c.seriesAnotables, foco: $foco) { paso, campo, dir in cambiar(paso, campo, dir, c) }
            }
        }
        if !c.enDescanso { VivoLuego(luego: c.luego) }
        VivoTiraEstructura(arcos: c.arcos, enCurso: c.estado.i, fraccion: c.fraccion) { pagina = .estructura }
    }

    private func franja(_ c: VivoIphoneCuadro) -> some View {
        VivoFranjaAccion(primaria: c.primaria, pausado: session.isPaused,
                         alPausar: { _ in session.togglePause() },
                         alPrimaria: { primaria(c) },
                         alTerminar: { hoja = true })
    }

    @ViewBuilder
    private func fondo(_ c: VivoIphoneCuadro) -> some View {
        VivoColor.fondo.ignoresSafeArea()
        if let z = c.tinte, let n = c.estado.zonas?.techos.count {
            VivoColor.tinteAmbiente(VivoColor.zona(z, de: n)).ignoresSafeArea().transition(.opacity)
        }
    }

    // MARK: - Las acciones

    private func primaria(_ c: VivoIphoneCuadro) {
        guard let p = c.primaria, p.desactivada == nil, !session.isPaused else { return }
        Haptics.medium()
        switch p.clave {
        case .confirmar:
            for s in c.seriesAnotables { confirmar(s, c) }
            return
        case .rondaHecha:
            session.bumpAmrapRound()
            avisar(c.avisoCierre) { if session.fixedRoundsDone > 0 { session.fixedRoundsDone -= 1 } }
            return
        case .hecho where c.familia == .deathby:
            session.deathByLogged()
            return
        case .empezarYa where session.restRemainingSeconds > 0:
            session.dismissRest()
            return
        default:
            break
        }
        if session.currentBlockIsStructural { alAccionDelHost(); return }
        let antes = (session.currentSegmentIndex, session.setRecords.firstIndex { !$0.confirmed })
        session.primaryAdvance(fromAthleteTap: true)
        avisar(c.avisoCierre) { deshacer(antes: antes) }
    }

    private func avisar(_ aviso: String, hacer: @escaping () -> Void) {
        let n = (toast?.n ?? 0) + 1
        toast = (n, aviso, hacer)
        DispatchQueue.main.asyncAfter(deadline: .now() + VivoTokens.Duracion.deshacer) { if toast?.n == n { toast = nil } }
    }

    /// Deshacer un cierre a mano: la serie de fuerza reabre; el resto retrocede el motor si puede.
    private func deshacer(antes: (segmento: Int, serie: Int?)) {
        if session.currentSegmentIndex == antes.segmento, let k = antes.serie, session.setRecords.indices.contains(k), session.setRecords[k].confirmed {
            session.dismissRest()
            session.setRecords[k].confirmed = false
            declaradas[session.plan.segments[antes.segmento].id.uuidString + "-\(k)"] = nil
            return
        }
        if session.fixedRoundsDone > 0, session.currentSegment?.isConditioningTimer == true { session.unmarkLastRound(); return }
        if session.canStepBack { session.stepBack() }
    }

    private func sumar30() {
        if session.restRemainingSeconds > 0 { session.restRemainingSeconds += 30; session.restTotalSeconds += 30 }
        else if session.fixedRestRemaining > 0 { session.fixedRestRemaining += 30; session.fixedRestTotal += 30 }
        else if session.rotPhase == .rest { session.rotPhaseRemaining += 30 }
        else if session.emomPhase == .rest { session.emomPhaseRemaining += 30 }
        Haptics.light()
    }

    private func indiceSerie(_ paso: Vivo.Paso) -> Int? {
        guard let o = paso.origen, o.segmento == session.currentSegmentIndex, case let .serie(k) = o.ventana, session.setRecords.indices.contains(k) else { return nil }
        return k
    }

    private func cambiar(_ paso: Vivo.Paso, _ campo: Vivo.CampoAnotar, _ dir: Int, _ c: VivoIphoneCuadro) {
        guard let k = indiceSerie(paso), let a = c.seriesAnotables.first(where: { $0.paso.id == paso.id })?.anot else { return }
        let actual: Double? = campo == .reps ? a.reps.valor : campo == .kg ? a.kg?.valor : a.esfuerzo?.valor
        let nuevo = Vivo.girar(paso, campo: campo, actual: actual, dir: dir)
        switch campo {
        case .reps: session.setSetReps(k, Int(nuevo))
        case .kg: session.setSetLoadCascade(k, nuevo)
        case .esfuerzo: if paso.fuerza?.esfuerzo?.eje == .rir { session.setSetRIR(k, nuevo) } else { session.setSetRPE(k, nuevo) }
        }
        declaradas[paso.id, default: []].insert(campo)
        Haptics.light()
    }

    private func confirmar(_ s: VivoSerieAnotable, _ c: VivoIphoneCuadro) {
        guard let k = indiceSerie(s.paso) else { return }
        if let kg = s.anot.kg?.valor, session.setRecords[k].loadActualKg != kg { session.setSetLoad(k, kg) }
        if let r = s.anot.reps.valor, session.setRecords[k].repsActual != Int(r) { session.setSetReps(k, Int(r)) }
        if let e = s.anot.esfuerzo?.valor {
            if s.paso.fuerza?.esfuerzo?.eje == .rir { session.setSetRIR(k, e) } else { session.setSetRPE(k, e) }
        }
        declaradas[s.paso.id] = [.reps, .kg, .esfuerzo]
    }

    // MARK: - Los modelos de calle y cinta (los mismos que montaba el shell)

    private func refrescarPlan() {
        let clave = "\(session.plan.id)|\(session.runEnvironment?.rawValue ?? "-")|\(hrZones?.lthrBpm ?? 0)|\(isBenchmark)"
        planCache = (clave, Vivo.planDe(session.plan, zonas: hrZones, entorno: session.runEnvironment, test: isBenchmark))
    }

    private func syncRunModels() {
        let corre = session.tramoIsRun || session.calentamientoEnLaCarrera
        guard corre, let env = session.runEnvironment else {
            outdoorModel?.teardown(); outdoorModel = nil
            treadmillModel?.teardown(); treadmillModel = nil
            return
        }
        switch RunCoverAutoOpen.decide(environment: env) {
        case .outdoor:
            treadmillModel?.teardown(); treadmillModel = nil
            if outdoorModel == nil {
                actividad.terminar()
                let m = OutdoorRunHUDModel(session: session, hrZones: hrZones)
                outdoorModel = m
                m.start()
            }
        case .treadmill:
            outdoorModel?.teardown(); outdoorModel = nil
            if treadmillModel == nil {
                let m = TreadmillHUDModel(session: session, hrZones: hrZones, hub: .shared)
                treadmillModel = m
                m.start()
            }
        }
    }
}
