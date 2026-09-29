import SwiftUI

// LA SESIÓN — la pantalla que abre una sesión hecha de Semana a semana: «¿qué pasó en esa sesión?», tramo a tramo. No obedece a la
// ventana (una sesión es un día) y vuelve a «Semana a semana». El detalle de la sesión y el cumplimiento de su ventana llegan por
// separado: con el segundo, cada tramo lleva su sello; sin él (una sesión libre, o el cumplimiento aún en camino) el tramo se
// pinta sin sello, no con uno inventado.
//
// Cuatro estados: con datos (`AnaliticasCuerpoDeSesion`), cargando (esqueleto de la misma forma), error con su reintento; y una
// sesión sin nada que decir no existe: si el servidor la sirve, tiene al menos su carga y su duración.

/// A qué sesión lleva un toque y cómo se pinta su vuelta.
struct SesionDeDestino: Hashable {
    /// La ejecución: lo que pide el servidor.
    let executionId: String
    /// La sesión del plan: con ella se busca el veredicto de cada tramo en el cumplimiento.
    let assignmentId: String
    /// Desde dónde se llegó, para «‹ Semana a semana».
    let atras: String
    /// «Hoy» del atleta: el año de una fecha solo se escribe si no es el actual.
    let hoy: String
}

struct AnaliticasSesionView: View {
    let destino: SesionDeDestino
    /// La ventana en que se abrió: de su cumplimiento salen los sellos.
    let ventana: VentanaClave
    let onAtras: () -> Void

    @Environment(AppDataStore.self) private var store

    private var slice: Slice<DetalleDeSesion> { store.sesionAnalitica(destino.executionId) }

    private var fila: FilaDeSesion? {
        store.cumplimientoAnalitico(ventana).value?.sesiones.first { $0.assignmentId == destino.assignmentId }
    }

    var body: some View {
        let lectura = slice.value.map { LecturaDeSesion.desde($0, fila: fila, hoy: destino.hoy) }
        AnaliticasPantalla(
            sobretitulo: lectura?.sobretitulo ?? "",
            titulo: lectura?.titulo ?? "Sesión",
            atras: (destino.atras, onAtras),
            alRefrescar: { await cargar(forzar: true) }
        ) { ancho in
            if let lectura {
                AnaliticasCuerpoDeSesion(lectura: lectura, ancho: ancho)
            } else if slice.loadFailed {
                AnaliticasErrorDeCarga(kicker: "Sesión", titulo: AnaliticasFamiliaView.tituloDelError, reintentando: slice.isRevalidating) { Task { await cargar(forzar: true) } }
            } else {
                AnaliticasDetalleEsqueleto()
            }
        }
        .task(id: destino) { await cargar(forzar: false) }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func cargar(forzar: Bool) async {
        async let sesion: Void = store.refreshSesionAnalitica(destino.executionId, force: forzar)
        async let cumplimiento: Void = store.refreshCumplimientoAnalitico(ventana, force: forzar)
        _ = await (sesion, cumplimiento)
    }
}
