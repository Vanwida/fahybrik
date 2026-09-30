import SwiftUI

// EL CUERPO DEL DETALLE DE UNA MARCA, SEGÚN SU ESTADO.
//
// Lo que se pinta con un estado ya resuelto, sin ninguna de las máquinas de la pantalla (ni scroll, ni servicio,
// ni hojas): `MarkDetailView` lo envuelve en un `FillingScreen` y la galería y las capturas pintan exactamente
// esto. Los cuatro estados del §5: con datos · cargando (el esqueleto con la MISMA forma) · error con su
// reintento · y el que no es ni una cosa ni otra, una marca que ya no está, con su salida.

struct MarcaDetalleCuerpo: View {
    let estado: EstadoDeMarca
    let lectura: LecturaDeMarca?
    var nueva: MarcaNueva? = nil
    var aviso: AvisoDeMarca? = nil
    let alReintentar: () async -> Void
    let alRetirar: (MarkResult) -> Void
    let alVolver: () -> Void

    var body: some View {
        switch estado {
        case .cargando:
            EsqueletoDeMarca()
        case .datos:
            if let lectura { datos(lectura) }
        case .error:
            sujeto {
                ErrorDeMarcas(
                    kicker: "Tus marcas",
                    titulo: "No pudimos cargar la marca",
                    apoyo: "Revisa tu conexión e inténtalo de nuevo.",
                    alReintentar: alReintentar
                )
            }
        case .noExiste:
            // La retiró el coach, o el enlace era de una prueba que ya no existe. No es un fallo ni un hueco que
            // el atleta pueda llenar: se dice y se ofrece volver a la biblioteca.
            sujeto {
                SujetoDia(tono: .neutro, etiqueta: "Esta marca ya no está. No la encontramos en tu biblioteca.") {
                    KickerDia("Tus marcas")
                    TituloDia("Esta marca ya no está")
                    ApoyoDia("No la encontramos en tu biblioteca.")
                } abajo: {
                    Button(action: alVolver) { AccionDia("Volver", glifo: .flecha) }
                        .buttonStyle(PressScaleStyle(escala: 0.96))
                }
            }
        }
    }

    // MARK: Con datos

    private func datos(_ lectura: LecturaDeMarca) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            if let aviso {
                AvisoEnLineaMarcas(aviso.texto) {
                    if aviso.reintentable {
                        BotonTextoMarcas("Reintentar") { Task { await alReintentar() } }
                    }
                }
            }
            if let nueva { TarjetaMarcaNueva(nueva: nueva) }
            SujetoDeMarca(sujeto: lectura.sujeto)
            if let contextos = lectura.contextos { TeselasDeContexto(contextos: contextos) }
            if let gemelo = lectura.gemelo { GemeloDeCarrera(gemelo: gemelo) }
            HistorialDeMarca(filas: lectura.historial, vacio: lectura.historialVacio, alRetirar: alRetirar)
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Un error o un «ya no está» es UN sujeto que se queda con todo el alto: no se apila arriba y se deja el
    /// resto muerto (estrategia `centra` del §6.1).
    private func sujeto<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        contenido()
            .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
    }
}

// MARK: - La pantalla: el cuerpo, el scroll y la acción anclada

/// Lo que la app monta y lo que fotografía la galería: el cuerpo en un `FillingScreen` (el sujeto se queda el
/// sobrante y, si el contenido crece, scrollea) con la acción de la marca anclada abajo.
///
/// La acción es la pastilla de tinta invertida de las pantallas del día (no compite con el sujeto). Sin marca
/// cargada no hay acción que anclar: un pie vacío deja una barra muerta con su filete.
struct MarcaDetallePantalla: View {
    let estado: EstadoDeMarca
    let lectura: LecturaDeMarca?
    var nueva: MarcaNueva? = nil
    var aviso: AvisoDeMarca? = nil
    let alReintentar: () async -> Void
    let alRetirar: (MarkResult) -> Void
    let alVolver: () -> Void
    let alActuar: () -> Void

    var body: some View {
        FillingScreen {
            MarcaDetalleCuerpo(
                estado: estado, lectura: lectura, nueva: nueva, aviso: aviso,
                alReintentar: alReintentar, alRetirar: alRetirar, alVolver: alVolver
            )
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .anclandoMarcas(si: estado == .datos && lectura != nil) {
            if let lectura {
                AccionAncladaMarcas(
                    titulo: lectura.accion,
                    simbolo: lectura.registra ? "plus" : "play.fill",
                    alTocar: alActuar
                )
            }
        }
    }
}
