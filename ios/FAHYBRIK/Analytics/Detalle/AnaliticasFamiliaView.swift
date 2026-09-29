import SwiftUI

// EL DETALLE DE UNA FAMILIA — la pantalla que abre una fila del Progreso: la marca clave como sujeto y, debajo, el «¿mejoro?» a fondo
// de esa familia (correr, ergo con sus tres máquinas, fuerza, estaciones y WOD). La misma ventana que la portada rige la pantalla:
// cambiarla aquí la cambia en toda la pestaña (A4).
//
// Cuatro estados (CONTRATO-UI §5): con datos (`AnaliticasFamiliaCuerpo`), cargando (el esqueleto con la MISMA forma), error con su
// reintento, y el vacío de una familia sin nada, que es el propio sujeto con su salida. El motor SWR conserva el último detalle bueno
// si una revalidación falla: el error solo sale cuando no hay nada que enseñar.

struct AnaliticasFamiliaView: View {
    /// La familia por la que se entró; en el ergo, la máquina se cambia dentro.
    let familia: FamiliaDeDetalle
    @Binding var ventana: VentanaClave
    let onSalida: (DestinoDeSalida) -> Void
    let onAtras: () -> Void

    @Environment(AppDataStore.self) private var store
    @State private var maquina: FamiliaDeDetalle

    init(familia: FamiliaDeDetalle, ventana: Binding<VentanaClave>, onSalida: @escaping (DestinoDeSalida) -> Void, onAtras: @escaping () -> Void) {
        self.familia = familia
        _ventana = ventana
        self.onSalida = onSalida
        self.onAtras = onAtras
        _maquina = State(initialValue: familia)
    }

    static let tituloDelError = "No se ha podido cargar el detalle"

    /// La familia que se está viendo: la de la pantalla o, en el ergo, la máquina elegida.
    private var activa: FamiliaDeDetalle { familia.esErgo ? maquina : familia }
    private var slice: Slice<DetalleAnaliticas> { store.detalleAnaliticas(activa, ventana) }

    var body: some View {
        AnaliticasPantalla(
            sobretitulo: ventana.frase,
            titulo: TextosDeFamilia.titulo(activa),
            ventana: $ventana,
            atras: (AppTab.analiticas.title, onAtras),
            alRefrescar: { await cargar(forzar: true) }
        ) { ancho in
            contenido(ancho: ancho)
        }
        .task(id: "\(activa.rawValue)|\(ventana.rawValue)") { await cargar(forzar: false) }
        .toolbar(.hidden, for: .navigationBar)
    }

    @ViewBuilder
    private func contenido(ancho: CGFloat) -> some View {
        if let detalle = slice.value {
            AnaliticasFamiliaCuerpo(
                detalle: detalle, familia: activa,
                cumplimiento: store.cumplimientoAnalitico(ventana).value,
                panel: store.panelAnaliticas(ventana).value,
                ancho: ancho, maquina: familia.esErgo ? $maquina : nil, onSalida: onSalida
            )
        } else if slice.loadFailed {
            AnaliticasErrorDeCarga(kicker: TextosDeFamilia.titulo(activa), titulo: Self.tituloDelError, reintentando: slice.isRevalidating) {
                Task { await cargar(forzar: true) }
            }
        } else {
            AnaliticasDetalleEsqueleto(accesorio: familia.esErgo ? AnyView(selectorDeMaquina($maquina)) : nil)
        }
    }

    /// Lo que la pantalla necesita para pintarse: su detalle y, aparte, lo que cada familia lee de otro sitio (el cumplimiento de
    /// correr y de fuerza, el panel de estaciones). Un fallo de lo aparte no tumba la pantalla: esa sección simplemente no sale.
    private func cargar(forzar: Bool) async {
        async let detalle: Void = store.refreshDetalleAnaliticas(activa, ventana, force: forzar)
        async let cumplimiento: Void = activa == .correr || activa == .fuerza ? store.refreshCumplimientoAnalitico(ventana, force: forzar) : ()
        async let panel: Void = activa == .estaciones ? store.refreshPanelAnaliticas(ventana, force: forzar) : ()
        _ = await (detalle, cumplimiento, panel)
    }
}

/// El conmutador de máquina del ergo: Remo · SkiErg · BikeErg.
func selectorDeMaquina(_ maquina: Binding<FamiliaDeDetalle>) -> some View {
    AnaliticasSegmento(
        items: [FamiliaDeDetalle.remo, .ski, .bici].map { ($0, $0.lectura.nombre) },
        valor: maquina, etiqueta: "Máquina", completo: true
    )
}

// MARK: - El cuerpo, con lo que ya llegó

/// Lo que se pinta con un detalle delante, sin ninguna de las máquinas de la pantalla (ni scroll, ni almacén, ni navegación): el
/// sujeto y las secciones de la familia. Está aparte de `AnaliticasFamiliaView` para que la galería y las capturas pinten EXACTAMENTE
/// lo mismo que la pantalla.
struct AnaliticasFamiliaCuerpo: View {
    let detalle: DetalleAnaliticas
    /// La familia que se pinta (en el ergo, la máquina).
    let familia: FamiliaDeDetalle
    /// El cumplimiento de la misma ventana, si ya llegó: de él salen «lo que te piden» de correr y de fuerza.
    var cumplimiento: CumplimientoAnaliticas? = nil
    /// El panel de la misma ventana, si ya llegó: de él sale el hueco por tramo de estaciones.
    var panel: PanelAnaliticas? = nil
    let ancho: CGFloat
    var maquina: Binding<FamiliaDeDetalle>? = nil
    let onSalida: (DestinoDeSalida) -> Void

    var body: some View {
        // Las secciones de cada familia son hermanas sueltas: quien las ordena es esta pila, con el mismo aire que la portada.
        VStack(alignment: .leading, spacing: AnaliticasPortadaCuerpo.entreSecciones) { cuerpo }
    }

    @ViewBuilder
    private var cuerpo: some View {
        switch familia {
        case .correr:
            let l = LecturaDeCorrer.desde(detalle)
            sujeto(l.sujeto)
            AnaliticasCuerpoDeCorrer(lectura: l, pedido: .correr(cumplimiento), holguraRitmo: detalle.metodo.holguraRitmoSKm, onSalida: onSalida)
        case .remo, .ski, .bici:
            let l = LecturaDeErgo.desde(detalle, familia)
            sujeto(l.sujeto)
            AnaliticasCuerpoDeErgo(lectura: l, ancho: ancho, onSalida: onSalida)
        case .fuerza:
            let l = LecturaDeFuerza.desde(detalle)
            sujeto(l.sujeto)
            AnaliticasCuerpoDeFuerza(lectura: l, rir: .rir(cumplimiento), holguraRir: detalle.metodo.holguraRir, ancho: ancho)
        case .estaciones, .desconocida:
            let l = LecturaDeEstaciones.desde(detalle)
            sujeto(l.sujeto)
            AnaliticasCuerpoDeEstaciones(lectura: l, panel: panel, ancho: ancho, onSalida: onSalida)
        }
    }

    private func sujeto(_ s: SujetoDeFamilia) -> some View {
        AnaliticasSujetoFamilia(sujeto: s, etiquetaDelVacio: TextosDeFamilia.etiquetaDelVacio(familia), onSalida: onSalida) {
            if let maquina { selectorDeMaquina(maquina) }
        }
    }
}

// MARK: - Cargando: el esqueleto con la MISMA forma

/// Lo que se ve antes de que llegue el detalle: el sujeto neutro (con el conmutador de máquina, si lo hay) y dos secciones con su título
/// y su tarjeta, de las medidas de lo que va a llegar. Nada salta al llegar el dato.
struct AnaliticasDetalleEsqueleto: View {
    var accesorio: AnyView? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: AnaliticasPortadaCuerpo.entreSecciones) {
            SujetoDia(tono: .neutro, etiqueta: "Cargando") {
                SkeletonBar(width: 150, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(height: 44, radius: 10).frame(maxWidth: 200)
                SkeletonBar(height: 17, radius: 6)
            } abajo: {
                if let accesorio { accesorio }
                SkeletonBar(height: 40, radius: Theme.Radius.fila)
            }
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                    SkeletonBar(width: 190, height: 24, radius: 6)
                    SkeletonBar(width: 240, height: 15, radius: 5)
                    SkeletonBar(height: 200, radius: Theme.Radius.tarjeta)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}
