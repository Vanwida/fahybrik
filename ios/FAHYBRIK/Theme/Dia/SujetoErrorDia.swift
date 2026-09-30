import SwiftUI

// EL SUJETO DE ERROR — «no pudimos cargar X», con su salida.
//
// Lo pedido no ha llegado y no hay copia que enseñar: se dice qué (el título), dónde estás (el kicker), qué
// hacer (el apoyo) y se ofrece reintentar. Es un sujeto de peligro que se anuncia solo a VoiceOver al
// aparecer (`role="alert"` del doble), con el peligro en el tinte y jamás en el texto. Lo usan Hoy, Carreras,
// Perfil y Analíticas: lo único que cambia entre ellas es el texto.
//
// «Reintentar» pide de nuevo lo que falló; mientras dura no admite otro toque y el glifo gira. Si quien lo monta
// ya sabe que hay un reintento en marcha (el almacén revalida), lo dice en `reintentando`; si no, lo lleva la pieza.
//
//     SujetoErrorDia(kicker: "Tu plan", titulo: "No pudimos cargar tu plan",
//                    apoyo: "Revisa tu conexión e inténtalo de nuevo.", alReintentar: { await recarga() })

struct SujetoErrorDia: View {
    let kicker: String
    let titulo: String
    let apoyo: String
    /// El reintento lo lleva quien monta la pieza (p. ej. `slice.isRevalidating`). `nil` = lo lleva ella misma.
    var reintentando: Bool?
    let alReintentar: () async -> Void

    @State private var enMarcha = false

    private var girando: Bool { reintentando ?? enMarcha }

    var body: some View {
        SujetoDia(tono: .peligro, etiqueta: "\(titulo). \(apoyo)", anuncia: true) {
            KickerDia(kicker)
            TituloDia(titulo)
            ApoyoDia(apoyo)
        } abajo: {
            BotonAccionDia(girando ? "Reintentando" : "Reintentar", glifo: .reintentar, enCurso: girando) {
                guard !girando else { return }
                enMarcha = true
                Task {
                    await alReintentar()
                    enMarcha = false
                }
            }
            .accessibilityAddTraits(girando ? .updatesFrequently : [])
        }
    }
}

#if DEBUG
#Preview("Sujeto de error · fábrica") { EnAmbasDia { GaleriaDia.SujetosDeEstado() } }
#Preview("Sujeto de error · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.SujetosDeEstado() } }
#endif
