#if DEBUG
import SwiftUI

// LAS `#Preview` DE «PERFIL» — cada estado del doble, montado como lo monta la pestaña.
//
// Los veinte casos (con la lectura de ejemplo de `CasosPerfil`, sin red ni store). Cada uno en claro y
// en oscuro a la vez (`EnAmbasDia`) y, los que más dependen del acento, también con el de un club azul:
// un componente que lleva el naranja clavado solo se ve mal cuando un coach elige otro color.

/// La pestaña como se ve: el cuerpo, con el caso de ejemplo `id`. Los casos ⑲ y ⑳ llevan además su
/// aviso de COROS sobre la parte de abajo, como sale sobre la barra de pestañas.
struct PestanaPerfilDeEjemplo: View {
    let id: String

    var body: some View {
        let caso = CasosPerfil.caso(id)
        PerfilContenido(lectura: caso.lectura)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let aviso = caso.aviso {
                    AvisoDia(tono: aviso.tono == .ok ? .ok : .fallo, texto: aviso.texto, alCerrar: {})
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.bottom, Theme.Spacing.m)
                }
            }
    }
}

#Preview("① Nora · todo con dato") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "veterano") } }
#Preview("① Nora · club azul") { EnAmbasDia(club: .pruebaAzul) { PestanaPerfilDeEjemplo(id: "veterano") } }
#Preview("② Marc · recién dado de alta") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "alta") } }
#Preview("② Marc · club azul") { EnAmbasDia(club: .pruebaAzul) { PestanaPerfilDeEjemplo(id: "alta") } }
#Preview("③ Iris · sin coach") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "libre") } }
#Preview("④ Dídac · con pareja") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "pareja") } }
#Preview("⑤ Pol · zonas sin ancla") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "sin-ancla") } }
#Preview("⑥ Aina · tests a medias") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "tests-a-medias") } }
#Preview("⑥ Aina · club amarillo") { EnAmbasDia(club: .pruebaAmarillo) { PestanaPerfilDeEjemplo(id: "tests-a-medias") } }
#Preview("⑦ Jan · movimiento retirado") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "reloj-retirado") } }
#Preview("⑧ Núria · pregunta de COROS") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "coros") } }
#Preview("⑧ Núria · club azul") { EnAmbasDia(club: .pruebaAzul) { PestanaPerfilDeEjemplo(id: "coros") } }
#Preview("⑨ Sin nombre") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "sin-nombre") } }
#Preview("⑩ En frío") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "cargando") } }
#Preview("⑪ Sin red") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "error") } }
#Preview("⑫ Carla · todo con aviso") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "denso") } }
#Preview("⑬ Lluís · la suscripción termina") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "termina") } }
#Preview("⑭ Vera · el VO₂ no contestó") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "fuente-caida") } }
#Preview("⑮ Nombre y datos largos") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "largos") } }
#Preview("⑯ Bruno · Dobles sin compañero/a") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "sin-pareja") } }
#Preview("⑰ Emma · invitación enviada") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "invitacion") } }
#Preview("⑱ Leo · sin coach y recién dado de alta") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "libre-alta") } }
#Preview("⑲ COROS importó entrenos") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "coros-importados") } }
#Preview("⑳ COROS no pudo sincronizar") { EnAmbasDia { PestanaPerfilDeEjemplo(id: "coros-fallo") } }
#endif
