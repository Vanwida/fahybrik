import SwiftUI

// «¿DÓNDE CORRES?» — solo si el plan no lo dice (M3) y el reloj empieza sin el móvil.
//
// Se pregunta UNA vez, al pulsar «Empezar», y la respuesta vale para toda la sesión: nunca se pregunta a mitad de
// carrera. Calle y pista salen a la calle (GPS); la cinta no lo necesita. Con el iPhone llevando el entreno se
// contesta allí. Lo que responde el atleta entra al motor como el entorno de la sesión.

struct EntradaDondeView: View {
    let alElegir: (Vivo.Entorno) -> Void
    let alVolver: () -> Void

    private static let opciones: [(entorno: Vivo.Entorno, titulo: String)] = [(.calle, "Calle"), (.cinta, "Cinta"), (.pista, "Pista")]

    var body: some View {
        EntradaPagina(espacio: EntradaTipo.hueco, conVersion: false) {
            EntradaContexto(partes: ["¿Dónde corres?"])
            Text("Tu plan no lo dice")
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
            ForEach(Self.opciones, id: \.entorno) { opcion in
                EntradaBoton(titulo: opcion.titulo, estilo: .superficie, accion: { alElegir(opcion.entorno) })
            }
            EntradaBoton(titulo: "Atrás", estilo: .superficie, accion: alVolver)
        }
    }
}
