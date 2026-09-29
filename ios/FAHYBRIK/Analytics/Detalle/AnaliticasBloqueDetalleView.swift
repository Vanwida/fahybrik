import SwiftUI

// EL DETALLE DE UN BLOQUE — a donde lleva el «›» de tres secciones de la portada, las únicas cuyo contenido no cabe entero en ella:
//
//   Semana a semana   todas las sesiones del plan de la ventana (la portada enseña las últimas cinco), cada una con su marca
//   Récords           todas las marcas (la portada enseña cinco)
//   Carrera           el hueco de TODOS los tramos contra tu objetivo (la portada, los tres donde más falta)
//
// Forma y fatiga, Intensidad, Progreso y Recuperación ya se enseñan enteros en la portada y no tienen «›»: un detalle que repitiera
// lo mismo no sería un detalle. La misma ventana que la portada rige la pantalla (A4).
//
// Semana a semana vive del cumplimiento; Récords y Carrera, del panel de la misma ventana. Cuatro estados en cada uno: con datos,
// cargando (esqueleto de la misma forma), error con su reintento, y vacío con su salida.

struct AnaliticasBloqueDetalleView: View {
    let bloque: BloqueDelPanel
    @Binding var ventana: VentanaClave
    let onSalida: (DestinoDeSalida) -> Void
    let onAbrir: (AnaliticasDestino) -> Void
    let onAtras: () -> Void

    @Environment(AppDataStore.self) private var store

    private var panel: Slice<PanelAnaliticas> { store.panelAnaliticas(ventana) }
    private var cumplimiento: Slice<CumplimientoAnaliticas> { store.cumplimientoAnalitico(ventana) }

    var body: some View {
        AnaliticasPantalla(
            sobretitulo: ventana.frase,
            titulo: bloque.titulo,
            ventana: $ventana,
            atras: (AppTab.analiticas.title, onAtras),
            alRefrescar: { await cargar(forzar: true) }
        ) { ancho in
            cuerpo(ancho: ancho)
        }
        .task(id: ventana) { await cargar(forzar: false) }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func cargar(forzar: Bool) async {
        async let p: Void = store.refreshPanelAnaliticas(ventana, force: forzar)
        async let c: Void = bloque == .semanas ? store.refreshCumplimientoAnalitico(ventana, force: forzar) : ()
        _ = await (p, c)
    }

    // MARK: Los estados

    @ViewBuilder
    private func cuerpo(ancho: CGFloat) -> some View {
        let origen = bloque == .semanas ? cumplimiento.loadFailed && cumplimiento.value == nil : panel.loadFailed && panel.value == nil
        if let panel = panel.value, bloque != .semanas || cumplimiento.value != nil {
            AnaliticasBloqueDetalleCuerpo(bloque: bloque, panel: panel, cumplimiento: cumplimiento.value, ancho: ancho, onSalida: onSalida, onAbrir: onAbrir)
        } else if origen {
            AnaliticasErrorDeCarga(kicker: bloque.titulo, titulo: AnaliticasFamiliaView.tituloDelError, reintentando: panel.isRevalidating || cumplimiento.isRevalidating) { Task { await cargar(forzar: true) } }
        } else {
            AnaliticasDetalleEsqueleto()
        }
    }
}

// MARK: - El cuerpo, con lo que ya llegó

/// Lo que se pinta con el panel (y, en Semana a semana, el cumplimiento) delante, sin ninguna de las máquinas de la pantalla: está aparte
/// para que la galería y las capturas pinten EXACTAMENTE lo mismo que ella.
struct AnaliticasBloqueDetalleCuerpo: View {
    let bloque: BloqueDelPanel
    let panel: PanelAnaliticas
    var cumplimiento: CumplimientoAnaliticas? = nil
    let ancho: CGFloat
    let onSalida: (DestinoDeSalida) -> Void
    let onAbrir: (AnaliticasDestino) -> Void

    var body: some View {
        let estados = ContextoDeBloque.estados(de: panel)
        let ctx = ContextoDeBloque(panel: panel, estados: estados, ancho: ancho, onSalida: onSalida, onAbrir: onAbrir)
        switch bloque {
        case .semanas: sesiones(ctx: ctx)
        case .records: records(ctx: ctx)
        case .carrera:
            if panel.estaPendiente(.carrera) || panel.bloques.carrera.isEmpty { AnaliticasHuecoDeBloque(ctx: ctx, bloque: .carrera) }
            else { AnaliticasBloqueCarrera(ctx: ctx, todosLosTramos: true) }
        default: EmptyView()
        }
    }

    // MARK: Semana a semana: todas las sesiones

    @ViewBuilder
    private func sesiones(ctx: ContextoDeBloque) -> some View {
        let filas = cumplimiento.map(PuertaDeSesiones.filas) ?? []
        if filas.isEmpty {
            AnaliticasHueco(
                texto: TextoHueco(
                    titulo: "Sin sesiones del plan en esta ventana",
                    cuerpo: "Cuando tu coach programe entrenos, aquí verás cada uno con lo que tocaba y lo que hiciste.",
                    salida: .accion("Ver mi plan", .plan),
                    plazo: nil
                ),
                onSalida: onSalida
            )
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                if let l = AnaliticasDerivados.lectura(ctx.panel.bloques.semanas, IdsDelPanel.semanasCumplimiento), let r = AnaliticasDerivados.resumenDeSesiones(l) {
                    AnaliticasCuerpo(texto: r.texto, fuerte: true)
                }
                AnaliticasEtiqueta(texto: "Toca una hecha para verla tramo a tramo")
                AnaliticasLista {
                    ForEach(filas) { fila in
                        AnaliticasFilaSesion(fila: fila, hoy: ctx.hoy) { abrir in
                            if let id = abrir.executionId {
                                onAbrir(.sesion(SesionDeDestino(executionId: id, assignmentId: abrir.id, atras: bloque.titulo, hoy: ctx.hoy)))
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Récords: todas las marcas

    @ViewBuilder
    private func records(ctx: ContextoDeBloque) -> some View {
        let lecturas = ctx.lecturas(.records).conDato
        if lecturas.isEmpty {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .records)
        } else {
            let nuevos = lecturas.filter { $0.veredicto?.code == IdsDelPanel.veredictoRecordNuevo }.count
            VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                AnaliticasCuerpo(
                    texto: "\(lecturas.count) marcas" + (nuevos > 0 ? " · \(nuevos) nueva\(nuevos > 1 ? "s" : "") en esta ventana" : ""),
                    fuerte: true
                )
                AnaliticasLista {
                    ForEach(lecturas) { l in
                        if let fila = AnaliticasFilaRecord(l, hoy: ctx.hoy) { fila }
                    }
                }
                AnaliticasNota(texto: "Un récord es de siempre: la ventana solo decide cuáles son nuevas.")
            }
        }
    }
}
