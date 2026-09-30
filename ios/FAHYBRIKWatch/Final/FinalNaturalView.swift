import SwiftUI

// «SESIÓN COMPLETADA» — el final natural TIENE pantalla (P9, P13).
//
// El reloj acaba solo (el último paso se cumplió por su medida, sin que el atleta cierre nada): hasta hoy la lámina
// se congelaba y los toques siguientes grababan vueltas fantasma (P0-1). Ahora dice que se acabó, si está completa
// o parcial y por qué —lo decide LO HECHO (`Vivo.completitud`), nunca un `.partial` cableado (P0-2)—, y da la
// decisión: «Guardar», o «Seguir» (el reloj sigue grabando un enfriamiento libre; si se queda quieto lo que dice el
// coach, se guarda solo).
//
// Si el atleta cerró el último paso a mano y ya contestó «¿Terminar y guardar?», no pasa por aquí: no se pregunta dos
// veces (`MunecaAlimentador.mandos`).

struct FinalNaturalView: View {
    let session: WorkoutSession

    @State private var completitud: Vivo.Completitud?

    init(session: WorkoutSession) {
        self.session = session
        _completitud = State(initialValue: Vivo.completitudDe(session, natural: true))
    }

    var body: some View {
        MunecaMedidor { _ in
            MunecaColumna {
                Spacer(minLength: 0)
                FinalSello()
                Text("Sesión completada")
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600))
                    .foregroundStyle(MunecaPaleta.tinta)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.tercero))
                if let c = completitud {
                    FinalNota(texto: Vivo.lineaCompletitud(c), tono: MunecaPaleta.tinta)
                    if let motivo = c.motivo { FinalNota(texto: motivo) }
                }
                Spacer(minLength: 0)
                FinalBotones(secundario: "Seguir", primario: "Guardar",
                             alSecundario: { session.continueAfterPrescribedWork() },
                             alPrimario: { session.finish() })
            }
        }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
        // «Sesión hecha»: la vibración y la frase del vocabulario. La cara de correr ya se fue y no las dio.
        .onAppear {
            var memoria = Vivo.MemoriaDirector()
            guard let emision = memoria.componer([Vivo.Emitido(evento: .sesion, voz: Vivo.vozSesion)]) else { return }
            MunecaHaptics.tocar(emision)
            WatchVoz.shared.decir(emision)
        }
    }
}
