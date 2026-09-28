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
    /// Lo marcado en el WOD al montar (una sesión reabierta; las capturas del contrato).
    var wodInicial = Vivo.EstadoWod()
    /// Gestos guionizados (capturas): pasan por el MISMO camino que el dedo.
    var guion: [VivoGestoGuion] = []
    /// Lo que el vivo ya sabía al montarse a mitad de sesión (las capturas).
    var arranque = VivoArranque()

    @State private var pagina: VivoIdPagina = .vivo
    @State private var toast: (n: Int, aviso: String, hacer: () -> Void)? = nil
    @State private var hoja = false
    @State private var terminado = false
    @State private var declaradas: [String: Set<Vivo.CampoAnotar>] = [:]
    @State private var wod = Vivo.EstadoWod()
    @State private var foco: VivoFoco? = nil
    @State private var outdoorModel: OutdoorRunHUDModel?
    @State private var treadmillModel: TreadmillHUDModel?
    @State private var planCache: (clave: String, plan: Vivo.PlanVivo)? = nil
    @State private var actividad = VivoActividadEnVivo()
    /// «GO» a pantalla completa: el paso al que se acaba de entrar (1 s).
    @State private var go: Vivo.Paso? = nil
    /// El último toque de la primaria: el GO de un trabajo cerrado por el atleta.
    @State private var toqueAtleta: Date? = nil
    /// El paso cuyo preaviso ya sonó (una vez por paso).
    @State private var preavisado: String? = nil

    // MARK: - El estado, desde el motor

    /// El plan tal como lo escribió el coach (sin mirar qué está enlazado).
    private var planBase: Vivo.PlanVivo {
        let clave = "\(session.plan.id)|\(session.runEnvironment?.rawValue ?? "-")|\(hrZones?.lthrBpm ?? 0)|\(isBenchmark)"
        if let c = planCache, c.clave == clave { return c.plan }
        return Vivo.planDe(session.plan, zonas: hrZones, entorno: session.runEnvironment, test: isBenchmark)
    }

    /// El plan que se pinta: sin la máquina enlazada, lo suyo lo dices tú.
    private var plan: Vivo.PlanVivo {
        Vivo.segunEnlace(planBase, maquina: dispositivos.maquina)
    }

    /// La máquina de ergo cuenta como enlazada si llega (el monitor o el motor lo
    /// dicen) o si SE PERDIÓ: una perdida sigue siendo suya, con sus datos «—».
    private var ergoEnlazado: Bool { pm5.isConnected || session.ergConnected || pm5.connectionLost }

    private var dispositivos: Vivo.Dispositivos {
        let paso = Vivo.estadoDe(session, plan: planBase).paso
        var maquina: Vivo.Maquina.Tipo? = nil
        if let m = paso.maquina?.tipo {
            if m == .cinta { maquina = treadmillLink.isLive ? .cinta : nil } else if ergoEnlazado { maquina = m }
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
        return VivoIphoneCuadro(estado: e, sesion: session, dispositivos: dispositivos, test: isBenchmark, declaradas: declaradas, wod: wod)
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
                if let n = c.estado.cuenta { VivoCuentaAtras(n: n, paso: c.pasoDeLaCuenta) }
                else if let e = c.entrada { VivoCuentaAtras(n: e.n, paso: e.paso) }
                else if let g = go { VivoCuentaAtras(n: 0, paso: g) }
                if hoja {
                    VivoHojaTerminar(resumen: Vivo.resumenParaTerminar(c.paso, sesionM: c.estado.sesion.metros ?? 0, sesionErgoM: c.estado.sesionErgoM, sesionT: c.estado.sesion.t),
                                     alTerminar: { hoja = false; terminado = true; alTerminarYGuardar() },
                                     alSeguir: { hoja = false })
                }
                if terminado { VivoTerminado(titulo: "Sesión terminada", detalle: "guardando lo hecho…") }
                else if c.estado.terminado { VivoTerminado(titulo: "Sesión completada", detalle: c.detalleFin ?? "guardando…") }
            }
            .environment(\.vivoLienzo, lienzo)
            .animation(.easeOut(duration: 0.2), value: hoja)
            .animation(.easeOut(duration: 0.2), value: toast?.n)
        }
        .onAppear {
            pagina = paginaInicial; wod = wodInicial; refrescarPlan(); syncRunModels(); actividad.empezar(titulo: session.plan.name)
            declaradas.merge(arranque.declaradas) { _, nuevo in nuevo }
            if let f = arranque.foco { foco = f }
            if let a = arranque.aviso { avisar(a) {} }
        }
        // Death by: un minuto que el reloj cierra sin «Hecho» es el último.
        .onChange(of: session.rotRoundIndex) { antes, ahora in if ahora == antes + 1 { cazadoSiToca(minutoCerrado: antes) } }
        .task { await correrGuion() }
        // La fuerza (VivoFuerzaMotor): la serie por tiempo se cierra sola; al acabar
        // un descanso, al siguiente ejercicio o a la serie por tiempo desde cero.
        .onChange(of: session.elapsedSeconds) { _, _ in session.vivoCerrarSerieCumplida() }
        .onChange(of: session.restRemainingSeconds) { antes, ahora in if antes > 0, ahora <= 0 { session.vivoAlAcabarDescanso() } }
        .onChange(of: session.currentSegmentIndex) { _, _ in syncRunModels(); foco = nil }
        .onChange(of: indiceVivo) { antes, ahora in entrar(desde: antes, en: ahora) }
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
        .task {
            // El preaviso (10 s / 100 m): lo decide el kit, suena una vez por paso.
            var primera = true
            while !Task.isCancelled {
                preavisar(primera: primera)
                primera = false
                try? await Task.sleep(for: .seconds(VivoTokens.Duracion.miraPreaviso))
            }
        }
    }

    // MARK: - La entrada a un paso: GO y preaviso

    private var indiceVivo: Int { Vivo.indiceActual(planBase.pasos, session) }

    /// Al pasar de un paso al siguiente: «GO» si se entra en trabajo (kit `veGo`).
    /// La carrera estructurada y el EMOM tienen su propia entrada en el motor.
    private func entrar(desde a: Int, en b: Int) {
        let pasos = plan.pasos
        guard b == a + 1, pasos.indices.contains(a), pasos.indices.contains(b),
              !session.isRunStructureActive, session.currentSegment?.isEMOM != true, !session.isTramoCountIn else { return }
        let porAtleta = toqueAtleta.map { Date().timeIntervalSince($0) < VivoTokens.Duracion.go } ?? false
        guard Vivo.veGo(desde: pasos[a], hacia: pasos[b], cerroElAtleta: porAtleta) else { return }
        let paso = pasos[b]
        go = paso
        DispatchQueue.main.asyncAfter(deadline: .now() + VivoTokens.Duracion.go) { if go?.id == paso.id { go = nil } }
    }

    /// El preaviso del kit: háptico + voz, una vez por paso. Si la pantalla se abre
    /// ya dentro del preaviso, ese preaviso ya sonó (no se repite con otra cifra).
    private func preavisar(primera: Bool) {
        guard !session.isPaused, !session.isFinished, !session.isRunStructureActive else { return }
        let e = Vivo.estadoDe(session, plan: plan, externo: externo)
        guard preavisado != e.paso.id, let falta = Vivo.preavisoDe(e.paso, e.lecturas, e.reglas) else { return }
        preavisado = e.paso.id
        guard !primera else { return }
        Haptics.success()
        AudioCoach.shared.decir(Vivo.vozPreaviso(e.paso, falta: falta))
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
                // §3: el sujeto a la izquierda (1,1 de 2,1 del ancho REAL de la página,
                // ya sin las zonas seguras), la rejilla, «Luego», la tira y la acción a la derecha.
                GeometryReader { g in
                    let anchoIzq = ((g.size.width - VivoTokens.hueco) * 1.1 / 2.1).rounded(.down)
                    let conBanda = c.banda != nil || c.instruccion != nil
                    let altoSujeto = g.size.height - (conBanda ? VivoTokens.Alto.banda + VivoTokens.hueco : 0)
                        - (c.trabajo != nil ? VivoTokens.Alto.trabajo + VivoTokens.hueco : 0)
                    HStack(spacing: VivoTokens.hueco) {
                        VStack(spacing: VivoTokens.hueco) { Spacer(minLength: 0); bloqueSujeto(c, alto: Swift.max(120, altoSujeto), ancho: anchoIzq - 2 * VivoTokens.margen); Spacer(minLength: 0) }
                            .frame(width: anchoIzq)
                        VStack(spacing: VivoTokens.hueco) { bloqueApoyo(c, apretada: true); franja(c) }
                            .frame(maxWidth: .infinity)
                    }
                }
            } else {
                VStack(spacing: VivoTokens.hueco) {
                    bloqueSujeto(c, alto: VivoTokens.Alto.sujeto, ancho: nil)
                    bloqueApoyo(c)
                }
            }
        case .estructura:
            if let f = c.circuito { VivoRutaCircuito(estado: c.estado, formato: f) } else { VivoPaginaEstructura(estado: c.estado) }
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
            let estira = c.enDescanso && c.paso.rol == .descanso && c.paso.wod?.formato != .pared
            VivoTrabajo(trabajo: t) { if estira { VivoMas30 { sumar30() } } }
        }
    }

    @ViewBuilder
    private func bloqueApoyo(_ c: VivoIphoneCuadro, apretada: Bool = false) -> some View {
        let anota = c.enDescanso && !c.seriesAnotables.isEmpty
        let apoyo = c.enDescanso ? nil : c.apoyoWod
        VivoRejilla(metricas: anota ? Array(c.metricas.prefix(2)) : apoyo.map { Array(c.metricas.prefix($0.celdas)) } ?? c.metricas,
                    compacta: anota || apoyo?.compacta == true, apretada: apretada && !anota) {
            if anota {
                VivoAnotarSerie(series: c.seriesAnotables, foco: $foco) { paso, campo, dir in cambiar(paso, campo, dir, c) }
            }
            switch apoyo {
            case let .lista(a)?: VivoListaAlrededor(alrededor: a) { pagina = .estructura }
            case let .puntuacion(d, tareas, foco)?:
                VivoAnotarPuntuacion(dial: d, tareas: tareas, foco: foco, alFoco: { wod.foco = $0 }) { moverPuntuacion($0, c) }
            case nil: EmptyView()
            }
        }
        if !c.enDescanso, apoyo?.quitaLuego != true { VivoLuego(luego: c.luego) }
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
        toqueAtleta = Date()
        switch p.clave {
        case .confirmar:
            for s in c.seriesAnotables { confirmar(s, c) }
            return
        case .rondaHecha:
            session.bumpAmrapRound()
            avisar(c.avisoCierre) { if session.fixedRoundsDone > 0 { session.fixedRoundsDone -= 1 } }
            return
        case .hecho where Vivo.seMarca(c.paso):
            // EMOM y death by: «Hecho» MARCA la ventana, no la cierra; lo que queda es respiro y el reloj la cierra solo.
            let id = c.paso.id
            wod.hechas[id] = c.estado.lecturas.t
            avisar(c.avisoCierre) { wod.hechas[id] = nil }
            return
        case .guardar:
            // La campana: la puntuación dicha es la del bloque, y el trabajo prescrito ya acabó.
            let d = wod.dial ?? Vivo.dialDelMotor(rondas: session.capturedScoreRounds, reps: session.capturedScoreReps)
            session.capturedScoreRounds = d.rondas
            session.capturedScoreReps = d.reps
            session.finish()
            return
        case .empezarYa where session.restRemainingSeconds > 0:
            // Cortar el descanso se puede deshacer; lo que viene lo decide
            // `vivoAlAcabarDescanso` (la serie siguiente o el siguiente ejercicio).
            let resto = (seg: session.currentSegmentIndex, queda: session.restRemainingSeconds, total: session.restTotalSeconds)
            session.dismissRest()
            avisar(c.avisoCierre) {
                if session.currentSegmentIndex == resto.seg { session.restRemainingSeconds = resto.queda; session.restTotalSeconds = resto.total }
                else if session.canStepBack { session.stepBack() }
            }
            return
        case .empezarYa where session.rotPhase == .rest && session.rotPhaseRemaining > 0 && session.currentSegment?.formatScheme == .tabata:
            // El descanso del tabata se corta en el siguiente tic del motor, con su tono de trabajo.
            session.rotPhaseRemaining = Swift.min(session.rotPhaseRemaining, 0.01)
            return
        default:
            break
        }
        if session.currentBlockIsStructural { alAccionDelHost(); return }
        let antes = (session.currentSegmentIndex, session.setRecords.firstIndex { !$0.confirmed })
        let cerrado = c.paso.id
        session.primaryAdvance(fromAthleteTap: true)
        session.vivoTrasCerrarSerie()
        avisar(c.avisoCierre) { deshacer(antes: antes, paso: cerrado) }
    }

    // MARK: - La familia WOD

    /// Los ± de la puntuación: el dato enfocado se mueve (las reps llevan a la ronda).
    private func moverPuntuacion(_ delta: Int, _ c: VivoIphoneCuadro) {
        guard case let .puntuacion(d, tareas, foco)? = c.apoyoWod else { return }
        wod.dial = Vivo.girarPuntuacion(d, campo: foco, delta: delta, porRonda: Vivo.repsPorRonda(tareas))
        Haptics.light()
    }

    /// El reloj cerró el minuto `minutoCerrado` del death by: si no se marcó, te cazó
    /// y se acabó (la puntuación son los minutos marcados, no los que el motor dejó pasar).
    private func cazadoSiToca(minutoCerrado k: Int) {
        guard session.currentSegment?.formatScheme == .deathBy, !session.isFinished else { return }
        let pasos = plan.pasos
        guard let i = pasos.firstIndex(where: { $0.origen?.segmento == session.currentSegmentIndex && $0.origen?.ventana == .ronda(k) }),
              Vivo.cazadoEn(pasos, iCerrado: i, hechas: wod.hechas) else { return }
        session.rotRoundIndex = Vivo.completosDeathBy(pasos, wod.hechas)
        session.deathByFail()
        if session.isAwaitingFinishDecision { session.finish() }
    }

    /// El guion de una captura: cada gesto a su hora, por el mismo camino que el dedo.
    private func correrGuion() async {
        var t: TimeInterval = 0
        for g in guion {
            try? await Task.sleep(for: .seconds(Swift.max(0, g.en - t)))
            t = g.en
            let c = cuadro
            switch g.gesto {
            case .primaria: primaria(c)
            case let .puntuacion(delta): moverPuntuacion(delta, c)
            }
        }
    }

    private func avisar(_ aviso: String, hacer: @escaping () -> Void) {
        let n = (toast?.n ?? 0) + 1
        toast = (n, aviso, hacer)
        DispatchQueue.main.asyncAfter(deadline: .now() + VivoTokens.Duracion.deshacer) { if toast?.n == n { toast = nil } }
    }

    /// Deshacer un cierre a mano: la serie de fuerza reabre; el resto retrocede el motor si puede.
    private func deshacer(antes: (segmento: Int, serie: Int?), paso: String) {
        if session.currentSegmentIndex == antes.segmento, let k = antes.serie, session.setRecords.indices.contains(k), session.setRecords[k].confirmed {
            session.dismissRest()
            session.setRecords[k].confirmed = false
            declaradas[paso] = nil
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
