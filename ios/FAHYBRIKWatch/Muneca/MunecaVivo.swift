import SwiftUI
import WatchKit

// LA PILA DEL VIVO — la gramática de la muñeca (P4), la misma para todas las
// familias: a la izquierda los CONTROLES, en el centro una pila vertical que se
// recorre con la CORONA (Paso → Datos → Vueltas → Estructura) y a la derecha
// AHORA SUENA, la música del sistema. Espejo de `kit-reloj/Muneca.tsx`.
//
// Esta vista es PURA: recibe un `CuadroMuneca` que pintar y unos `MunecaMandos`
// con lo que se puede hacer, y no sabe si detrás hay el motor local (`MunecaSolo`)
// o el iPhone (el espejo). Todo lo que decide qué se ve ya lo decidió el cuadro.
//
// TOCAR LA PANTALLA NO CIERRA NADA. Cerrar a mano el paso es el doble toque: el
// gesto de la mano (`handGestureShortcut(.primaryAction)`, Series 9 / Ultra 2 en
// adelante) y dos toques seguidos en la pantalla (`onTapGesture(count: 2)`, como
// Apple Entreno, en cualquier reloj). Los dos llaman a la MISMA acción del momento.
//
// CERRAR EL ÚLTIMO PASO PREGUNTA. Un entreno nunca termina por un toque accidental (IMG_2385):
// si cerrar el paso guardaría la sesión (o no se sabe que no), el doble toque, «Siguiente paso»
// y «Empezar ya» piden «¿Terminar y guardar?» antes (`MunecaMandos.pideConfirmarAlCerrar`, lo
// decide `Vivo.CierreSeguro`). Un paso que cambia mientras se pregunta retira la pregunta.
//
// Las vibraciones no son de esta vista: cada acción del atleta avisa a `mandos.alActuar` y el
// director de la muñeca toca el `.click` (P5).

struct MunecaVivo: View {
    let cuadro: Vivo.CuadroMuneca
    /// El id del paso vivo: un paso nuevo devuelve la muñeca al Vivo, página Paso.
    let alPaso: String
    let mandos: MunecaMandos

    private enum Area: Int { case controles, vivo, musica }

    @State private var area: Area = .vivo
    @State private var pagina: Vivo.PaginaMuneca
    @State private var puntosVisibles = false
    /// El cierre que espera un «¿Terminar y guardar?»; `nil` = nada que preguntar.
    @State private var cierrePendiente: (() -> Void)?

    /// `paginaInicial`: en qué página de la corona se abre (siempre Paso en el entreno; el
    /// escaparate de DEBUG abre las otras para poder mirarlas sin girar la corona).
    init(cuadro: Vivo.CuadroMuneca, alPaso: String, mandos: MunecaMandos, paginaInicial: Vivo.PaginaMuneca = .paso) {
        self.cuadro = cuadro
        self.alPaso = alPaso
        self.mandos = mandos
        _pagina = State(initialValue: paginaInicial)
    }

    var body: some View {
        TabView(selection: $area) {
            controles.tag(Area.controles)
            centro.tag(Area.vivo)
            NowPlayingView().tag(Area.musica)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .bottom) { puntosDeAreas }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
        .overlay { preguntaDeCierre }
        .onChange(of: alPaso) { _, _ in volverAlVivo() }
        // Con la muñeca bajada el sistema ignora los deslizamientos: se vuelve sola al Vivo,
        // y al subirla se empieza por la página Paso.
        .onChange(of: cuadro.alwaysOn) { _, _ in volverAlVivo() }
    }

    private func volverAlVivo() {
        area = .vivo
        pagina = .paso
        cierrePendiente = nil
    }

    // MARK: - Cerrar un paso: pregunta si guardaría la sesión

    /// Cierra el paso, o pregunta antes si cerrarlo terminaría la sesión (o no se sabe que no).
    private func cerrando(_ cierre: @escaping () -> Void) -> () -> Void {
        { if mandos.pideConfirmarAlCerrar { cierrePendiente = cierre } else { cierre() } }
    }

    /// El control contextual de Controles: «Siguiente paso» cierra el paso (pregunta), «Vuelta» no.
    private var controlDeControles: MunecaControl? {
        mandos.control.map { c in
            MunecaControl(titulo: c.titulo, icono: c.icono,
                          accion: { mandos.alActuar(); (c.icono == .siguiente ? cerrando(c.accion) : c.accion)() })
        }
    }

    /// Reanudar o pausar: es una acción del atleta.
    private func pausando() {
        mandos.alActuar()
        mandos.pausa()
    }

    @ViewBuilder
    private var preguntaDeCierre: some View {
        if let cierre = cierrePendiente {
            MunecaConfirmar(pregunta: "¿Terminar y guardar?", accion: "Terminar",
                            alConfirmar: { cierrePendiente = nil; cierre() },
                            alSeguir: { cierrePendiente = nil })
                .background(MunecaPaleta.fondo.ignoresSafeArea())
        }
    }

    // MARK: - Controles (izquierda)

    private var controles: some View {
        MunecaControles(
            pausado: cuadro.pausado,
            control: controlDeControles,
            alPausar: pausando,
            alTerminar: mandos.terminar,
            alDescartar: mandos.descartar,
            alIrAlVivo: { area = .vivo }
        )
        .opacity(cuadro.tinta)
    }

    // MARK: - El Vivo (centro): la pila vertical de la corona

    private var centro: some View {
        ZStack {
            MunecaFondo(tinte: cuadro.tinte).ignoresSafeArea()
            TabView(selection: $pagina) {
                MunecaPaso(cara: cuadro.cara, alMas30: mandos.mas30, alEmpezarYa: cerrando(mandos.empezarYa))
                    .tag(Vivo.PaginaMuneca.paso)
                MunecaDatos(pagina: cuadro.datos).tag(Vivo.PaginaMuneca.datos)
                MunecaVueltas(pagina: cuadro.vueltas).tag(Vivo.PaginaMuneca.vueltas)
                MunecaEstructura(pagina: cuadro.estructura).tag(Vivo.PaginaMuneca.estructura)
            }
            .tabViewStyle(.verticalPage)
            .opacity(cuadro.pausado ? MunecaForma.opacidadPausa : cuadro.tinta)
            .accessibilityLabel(pagina.titulo)

            aro
            if let capa = cuadro.capa { MunecaCapa(capa: capa).opacity(cuadro.tinta) }
            if cuadro.pausado && !cuadro.alwaysOn { MunecaVeloPausa(alReanudar: pausando) }
            gestoDeLaMano
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { gestoPrimario() }
    }

    /// El aro de la sesión: solo en el Vivo, atenuado en Always-On.
    private var aro: some View {
        WatchAroEstructura(
            arcos: cuadro.aro.arcos.map { ArcoDeTramo(trabajo: $0.trabajo, peso: $0.peso) },
            enCurso: cuadro.aro.indice,
            fraccion: cuadro.aro.fraccion
        )
        .opacity(cuadro.opacidadAro)
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - La acción del momento

    /// El gesto de doble toque de la mano. Ancla el atajo del sistema a un botón sin
    /// cuerpo: la acción es la misma que la de dos toques en la pantalla.
    private var gestoDeLaMano: some View {
        Button(action: gestoPrimario) { Color.clear }
            .buttonStyle(.plain)
            .frame(width: 1, height: 1)
            .handGestureShortcut(.primaryAction)
            .accessibilityHidden(true)
    }

    private func gestoPrimario() {
        guard area == .vivo, !cuadro.alwaysOn else { return }
        // En pausa, el gesto reanuda: es la única acción posible.
        if cuadro.pausado { pausando(); return }
        guard let primaria = mandos.primaria else { return }
        mandos.alActuar()
        cerrando(primaria)()
        // F3: aquí engancha el aviso de deshacer (5 s, `Vivo.deshacerMs` con
        // `cuadro.avisoCierre`). Necesita que el motor pueda volver atrás un cierre
        // de tramo; hasta entonces el cierre a mano no se puede deshacer.
    }

    // MARK: - Los puntos de las áreas

    /// Tres puntos abajo que aparecen al cambiar de área y se apagan: dicen que a la
    /// izquierda hay controles y a la derecha la música.
    private var puntosDeAreas: some View {
        HStack(spacing: MunecaForma.puntoAreaAire) {
            ForEach([Area.controles, .vivo, .musica], id: \.rawValue) { a in
                Circle()
                    .fill(a == area ? MunecaPaleta.tinta : MunecaPaleta.tinta.opacity(MunecaForma.puntoAreaApagado))
                    .frame(width: MunecaForma.puntoArea, height: MunecaForma.puntoArea)
            }
        }
        .padding(.bottom, MunecaForma.puntoAreaAbajo)
        .opacity(puntosVisibles && !cuadro.alwaysOn ? 1 : 0)
        .animation(.easeOut(duration: 0.3), value: puntosVisibles)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: area) {
            puntosVisibles = true
            try? await Task.sleep(for: .seconds(MunecaForma.puntosAreaSegundos))
            puntosVisibles = false
        }
    }
}

// MARK: - El fondo y el velo de la pausa

/// El fondo: el tinte de zona en una banda central (solo si el paso va a zona, y
/// nunca en Always-On), negro arriba (el aro) y abajo (el OLED no gasta).
struct MunecaFondo: View {
    let tinte: Vivo.TinteVista?

    var body: some View {
        ZStack {
            MunecaPaleta.fondo
            if let tinte {
                MunecaPaleta.zona(tinte.color).opacity(tinte.mezclaPct / 100)
            }
            LinearGradient(stops: MunecaForma.degradadoFondo, startPoint: .top, endPoint: .bottom)
        }
        .animation(.easeInOut(duration: 0.7), value: tinte)
        .accessibilityHidden(true)
    }
}

/// «EN PAUSA» y el botón que reanuda, sobre la página apagada.
struct MunecaVeloPausa: View {
    let alReanudar: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)
            Text("EN PAUSA")
                .font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto).weight(.bold))
                .tracking(MunecaForma.trackingPausa)
                .foregroundStyle(MunecaPaleta.tinta)
            MunecaBoton(titulo: "Reanudar", accion: alReanudar)
        }
        .padding(.horizontal, CGFloat(Vivo.MedidasMuneca.ladoSafe) + 10)
        .padding(.bottom, CGFloat(Vivo.MedidasMuneca.abajoSafe) + 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(stops: MunecaForma.degradadoPausa, startPoint: .top, endPoint: .bottom).ignoresSafeArea()
        )
    }
}
