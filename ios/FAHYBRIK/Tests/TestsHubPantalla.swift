import SwiftUI

// LA PANTALLA DEL HUB DE TESTS, PINTADA — cabecera, y debajo el estado que toque.
//
// Pinta una `LecturaTestsHub` ya resuelta y nada más: no carga, no navega, no decide. `TestsHubView` la
// alimenta con lo cargado y con las acciones; la galería de pruebas la alimenta con los casos de
// `CasosTestsHub`. Cinco estados, ninguno una pantalla muerta:
//
//   · cargando — el esqueleto de la MISMA forma que la lista.
//   · error    — el sujeto de error del kit, con su reintento.
//   · vacío    — `centra`: sin batería la lista ES un vacío, con el contador en cero y salida real.
//   · lista    — `llena` + scroll: el sujeto (cuánto has calibrado), las zonas, cada test y, anclado
//                abajo, el siguiente acto.

/// Lo que la pantalla puede pedirle a quien la monta.
struct AccionesTestsHub {
    var alReintentar: () async -> Void
    var alRefrescar: () -> Void
    var alProbarPorMiCuenta: () -> Void
    /// Un test pide su acción (la de su tarjeta o la del siguiente acto anclado).
    var alEjecutar: (_ testId: String, AccionTest) -> Void
}

struct TestsHubPantalla: View {
    let lectura: LecturaTestsHub
    let acciones: AccionesTestsHub
    /// Presente cuando el hub se abre como cover (Inicio, Analíticas): pinta la ✕. Sin él el hub está
    /// empujado (Perfil) y la barra de navegación lleva la vuelta.
    var alCerrar: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            TestsHubCabecera(alCerrar: alCerrar)
            contenido
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    @ViewBuilder
    private var contenido: some View {
        switch lectura {
        case .cargando:
            FillingScreen {
                TestsHubEsqueleto()
                    .padding(cuerpo)
            }
        case .error:
            CenteredScreen {
                SujetoErrorDia(
                    kicker: "Calibración",
                    titulo: "No pudimos cargar tus tests",
                    apoyo: "Revisa tu conexión e inténtalo de nuevo.",
                    alReintentar: acciones.alReintentar
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
            }
        case .vacio:
            // Sin batería publicada la Lista ES un Vacío, y se pinta como Vacío (§6.2): centrado y con
            // salida, no un encabezado colgando arriba.
            CenteredScreen {
                TestsSinBateriaState(onProbarme: acciones.alProbarPorMiCuenta)
                    .padding(.horizontal, Theme.Spacing.pantalla)
            }
        case .lista(let lista):
            TestsHubLista(lista: lista, acciones: acciones)
        }
    }

    private var cuerpo: EdgeInsets {
        EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xxl, trailing: Theme.Spacing.pantalla)
    }
}

// MARK: - La cabecera

/// El título de la pantalla y, en un cover, su salida. Fija: no scrollea.
struct TestsHubCabecera: View {
    var alCerrar: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            Text("Tus tests")
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if let alCerrar {
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: alCerrar)
            }
        }
        .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.s, trailing: alCerrar == nil ? Theme.Spacing.pantalla : Theme.Spacing.s))
        .frame(minHeight: Theme.Size.toque)
    }
}

// MARK: - La lista

/// La batería publicada: `llena` — si no llega al alto el sobrante entra en el propio sujeto; si desborda,
/// scrollea desde arriba — y el siguiente acto anclado al alcance del pulgar.
struct TestsHubLista: View {
    let lista: ListaTests
    let acciones: AccionesTestsHub

    var body: some View {
        let cuerpo = FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                sujeto
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("Tus zonas")
                    ZonasDeTests(zonas: lista.zonas)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("La batería")
                    ForEach(lista.tests) { ficha in
                        TarjetaTest(ficha: ficha) { acciones.alEjecutar(ficha.id, $0) }
                    }
                }
            }
            .padding(EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xxl, trailing: Theme.Spacing.pantalla))
        }
        .refreshable { acciones.alRefrescar() }

        // Batería cerrada = no queda acto global que anclar, y una barra vacía abajo es exactamente el hueco
        // que el §6.1 prohíbe.
        if let siguiente = lista.siguiente {
            cuerpo.anchoredAction {
                VStack(spacing: Theme.Spacing.xs) {
                    Text(siguiente.asunto)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                    BotonAccionDia(
                        siguiente.accion.titulo,
                        relleno: .tinta,
                        completa: true,
                        alto: Theme.Size.accion,
                        estado: siguiente.accion.estadoDelBoton
                    ) {
                        acciones.alEjecutar(siguiente.testId, siguiente.accion)
                    }
                }
                // El pie ancla con 16 y el margen de las pantallas del día es 20: los 4 restantes van dentro.
                .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
            }
        } else {
            cuerpo
        }
    }

    /// El sujeto: cuánto has calibrado, con su regleta. Se tiñe de «hecho» cuando la batería está cerrada.
    private var sujeto: some View {
        SujetoDia(
            tono: lista.completa ? .ok : .acento,
            etiqueta: SujetoTests.etiquetaAccesible(lista)
        ) {
            KickerDia(lista.completa ? "Calibración completa" : "Calibración") {
                if lista.sinResultado > 0 {
                    InfoPill(text: SujetoTests.sinResultado(lista.sinResultado), estilo: .velo, glifo: .lapiz)
                }
            }
            CalibrationCounter(done: lista.hechos, total: lista.total)
            ApoyoDia("Corre el test y la app mide por ti: marca, recuperación y zonas. Tú solo aprietas.")
        } abajo: {
            RegletaDia(n: lista.hechos, de: lista.total)
        }
    }
}

extension AccionTest {
    /// El estado del botón anclado: preparando gira y no admite otro toque; sin sesión o sin nada que abrir,
    /// inactivo (cambia de superficie y de tinta, no de opacidad).
    var estadoDelBoton: BotonAccionDia.Estado {
        if case .probarme(let preparando, _) = self, preparando {
            return .ocupado(texto: "Preparando…", voz: "Preparando el test")
        }
        return habilitada ? .normal : .inactivo
    }
}

/// Los textos del sujeto, fuera de la vista para poder comprobarlos.
enum SujetoTests {
    static func sinResultado(_ n: Int) -> String {
        n == 1 ? "1 sin resultado" : "\(n) sin resultado"
    }

    static func etiquetaAccesible(_ lista: ListaTests) -> String {
        var frase = CalibrationCounter.lectura(done: lista.hechos, total: lista.total)
        if lista.sinResultado > 0 { frase += ". " + sinResultado(lista.sinResultado) }
        return frase
    }
}

// MARK: - El vacío

/// EL CASO DE DISEÑO (§6.3): el atleta recién dado de alta. Sin batería, sin zonas, sin marcas. Lo único que
/// NO puede pasar es que se quede sin nada que tocar.
///
/// Vive como pieza propia (y no como un `private var` del hub) porque es un estado con vida propia: no
/// depende de nada del hub salvo su acción, y así se puede RENDERIZAR en el arnés de capturas — una pantalla
/// se mira, no se supone (§8).
struct TestsSinBateriaState: View {
    /// La salida real: la biblioteca de marcas, donde el atleta puede probarse hoy sin esperar a que nadie le
    /// programe nada.
    let onProbarme: () -> Void

    var body: some View {
        SujetoDia(
            tono: .acento,
            etiqueta: "Tus zonas y tus cargas están sin fijar. \(CalibrationCounter.lectura(done: 0, total: nil))"
        ) {
            KickerDia("Calibración")
            TituloDia("Tus zonas y tus cargas están sin fijar")
            ApoyoDia("Los tests las fijan en una sesión: a qué pulso entrenas, con cuánto peso y a qué ritmo. Hasta entonces, todo va con estimaciones.")
            // Sin batería publicada no hay denominador que enseñar, y no se inventa (§7): el contador dice
            // lo que se sabe — cero calibrados.
            CalibrationCounter(done: 0, total: nil, papelDeLaCifra: .dato)
        } abajo: {
            BotonAccionDia("Pruébate por tu cuenta", glifo: .flecha, completa: true, accion: onProbarme)
            Text("Tu coach programa los tests de calibración, normalmente en tu primera semana. Cuando lo haga aparecen aquí.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
