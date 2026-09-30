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

struct MunecaVivo: View {
    let cuadro: Vivo.CuadroMuneca
    /// El id del paso vivo: un paso nuevo devuelve la muñeca al Vivo, página Paso.
    let alPaso: String
    let mandos: MunecaMandos

    private enum Area: Int { case controles, vivo, musica }

    @State private var area: Area = .vivo
    @State private var pagina: Vivo.PaginaMuneca
    @State private var puntosVisibles = false

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
        .onChange(of: alPaso) { _, _ in volverAlVivo() }
        // Con la muñeca bajada el sistema ignora los deslizamientos: se vuelve sola al Vivo,
        // y al subirla se empieza por la página Paso.
        .onChange(of: cuadro.alwaysOn) { _, _ in volverAlVivo() }
    }

    /// La página con la que se pinta: si la que estaba abierta ya no existe en esta familia, la de Paso.
    private var paginaVisible: Binding<Vivo.PaginaMuneca> {
        Binding(get: { cuadro.paginas.contains(pagina) ? pagina : .paso }, set: { pagina = $0 })
    }

    @ViewBuilder
    private func paginaVista(_ p: Vivo.PaginaMuneca) -> some View {
        switch p {
        case .paso:
            MunecaPaso(cara: cuadro.cara, alMas30: mandos.mas30, alEmpezarYa: mandos.empezarYa,
                       alPrimaria: { mandos.primaria?() }, anotar: mandos.anotar)
        case .datos: MunecaDatos(pagina: cuadro.datos)
        case .vueltas: MunecaVueltas(pagina: cuadro.vueltas)
        case .estructura: MunecaEstructura(pagina: cuadro.estructura)
        case .ejercicios: if let e = cuadro.ejercicios { MunecaEjercicios(pagina: e) }
        }
    }

    private func volverAlVivo() {
        area = .vivo
        pagina = .paso
    }

    // MARK: - Controles (izquierda)

    private var controles: some View {
        MunecaControles(
            pausado: cuadro.pausado,
            control: mandos.control,
            alPausar: mandos.pausa,
            alTerminar: mandos.terminar,
            alIrAlVivo: { area = .vivo }
        )
        .opacity(cuadro.tinta)
    }

    // MARK: - El Vivo (centro): la pila vertical de la corona

    private var centro: some View {
        ZStack {
            MunecaFondo(tinte: cuadro.tinte).ignoresSafeArea()
            // Las páginas las dice el cuadro (correr 4, fuerza 3, ergo 4; con un dato enfocado, una sola).
            TabView(selection: paginaVisible) {
                ForEach(cuadro.paginas, id: \.self) { p in paginaVista(p).tag(p) }
            }
            .tabViewStyle(.verticalPage)
            .munecaCorona(cuadro.corona, alGirar: mandos.anotar?.girar)
            .opacity(cuadro.pausado ? MunecaForma.opacidadPausa : cuadro.tinta)
            .accessibilityLabel(pagina.titulo)

            aro
            if let capa = cuadro.capa { MunecaCapa(capa: capa).opacity(cuadro.tinta) }
            if cuadro.pausado && !cuadro.alwaysOn { MunecaVeloPausa(alReanudar: mandos.pausa) }
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
        if cuadro.pausado { WatchHaptics.click(); mandos.pausa(); return }
        guard let primaria = mandos.primaria else { return }
        WatchHaptics.click()
        primaria()
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
