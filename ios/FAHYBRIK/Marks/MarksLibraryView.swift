import SwiftUI

// "Tus marcas" (#Marcas) — la biblioteca de marcas del atleta.
//
// Tres grupos, tres orígenes, una lista: lo que la app mide (correr · ergo) y las carreras que se registran.
// Cada fila enseña la mejor marca comparable, hace cuánto y de dónde salió: un test del coach y una prueba
// propia conviven, con su sello. «Aún sin marca» es una invitación, no un vacío triste.
//
// ARQUETIPO **Lista** (CONTRATO-UI §6.2), estrategia `llena` + scroll: un catálogo de nueve pruebas o más
// siempre desborda la pantalla, así que no hay sobrante que repartir. Los otros tres estados son un
// **Vacío** y se pintan como tal: un sujeto con su salida, no una lista de cero filas.
//
// Lo decidido (qué estado, qué grupos, qué dice cada fila) vive en `LecturaBiblioteca`; lo que se pinta, en
// `MarcasBiblioteca`. Aquí solo queda el servicio: pedir, guardar, reintentar.
struct MarksLibraryView: View {
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    @State private var marks: [MarkView] = []
    @State private var cargando = true
    @State private var fallo = false

    private var estado: EstadoDeBiblioteca {
        EstadoDeBiblioteca.resolver(cargando: cargando, fallo: fallo, marcas: marks)
    }

    var body: some View {
        FillingScreen {
            MarcasBibliotecaCuerpo(
                estado: estado,
                grupos: GrupoDeMarcas.desde(marks),
                bearer: bearer,
                hrZones: hrZones,
                alReintentar: { await load() }
            )
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .refreshable { await load() }
        .navigationTitle("Tus marcas")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @MainActor
    private func load() async {
        // Solo la primera carga en frío es «cargando»: reintentar desde el error deja el error a la vista (su
        // botón gira) y revalidar con datos no los tapa con un esqueleto.
        cargando = marks.isEmpty && !fallo
        do {
            marks = try await MarksService.fetchMarks(bearer: bearer).marks
            fallo = false
        } catch {
            // Sin respuesta NO se vacía la lista: un fallo de red no puede borrar de la pantalla nueve récords
            // que el atleta tiene. Si nunca llegó a haber lista, la pantalla pasa al error con su reintento.
            fallo = true
        }
        cargando = false
    }
}

// MARK: - El cuerpo, según su estado

/// Lo que se pinta con un estado ya resuelto, sin ninguna de las máquinas de la pantalla (ni scroll, ni
/// servicio): la galería y las capturas pintan exactamente esto.
struct MarcasBibliotecaCuerpo: View {
    let estado: EstadoDeBiblioteca
    let grupos: [GrupoDeMarcas]
    let bearer: String?
    var hrZones: HRZoneProfile? = nil
    let alReintentar: () async -> Void

    var body: some View {
        switch estado {
        case .cargando:
            EsqueletoDeMarcas()
        case .datos:
            MarcasBiblioteca(grupos: grupos, bearer: bearer, hrZones: hrZones)
        case .error:
            sujeto {
                SujetoErrorDia(
                    kicker: "Tus marcas",
                    titulo: "No pudimos cargar tus marcas",
                    apoyo: "Revisa tu conexión e inténtalo de nuevo.",
                    alReintentar: alReintentar
                )
            }
        case .vacio:
            // Preguntamos y no hay catálogo. No es un hueco que el atleta pueda llenar con ningún acto suyo,
            // así que la salida se explica (§6.2 bis): quién lo hace y dónde aparecerá.
            sujeto {
                SujetoDia(tono: .neutro, etiqueta: "Todavía no hay marcas. Tu coach define qué pruebas entran.") {
                    KickerDia("Tus marcas")
                    TituloDia("Todavía no hay marcas")
                    ApoyoDia("Aquí verás tus mejores tiempos de cada prueba.")
                } abajo: {
                    Text("Tu coach define qué pruebas entran, y aparecen aquí en cuanto las publique.")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// Un vacío o un error es UN sujeto que se queda con todo el alto (estrategia `centra` del §6.1: no hay más
    /// que decir, así que no se apila arriba y se deja el resto muerto).
    private func sujeto<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        contenido()
            .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
    }
}
