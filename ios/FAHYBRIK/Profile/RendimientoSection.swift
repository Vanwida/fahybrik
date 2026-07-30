import SwiftUI

// RENDIMIENTO — las cifras del atleta, en Perfil, por fin pintadas.
//
// Esta sección eran CINCO PUERTAS CON LA ETIQUETA DE LO QUE HAY DENTRO: «Mi
// fuerza · Tus 1RM por levantamiento · sentadilla, peso muerto, press…», y ni un
// número. El atleta con 245 kg de peso muerto guardados abría la pantalla que
// existe para enseñar sus cifras y leía una descripción de sí misma.
//
// Y dos de los cinco datos ya estaban EN LA APP: los 1RM viven en la porción
// `strengthMaxes` del store (los usa Inicio desde hace meses) y las zonas de
// pulso viajan dentro de la identidad. Los otros tres se piden aquí, a la vez,
// igual que hace la tarjeta de la batería en Inicio.
//
// Las reglas que gobiernan cada fila (docs/CONTRATO-UI.md):
//
//   §4      el dato pesa más que su etiqueta — 22 mono contra 13.
//   §6.2    arquetipo LISTA: el conjunto y su estado de un vistazo, y por eso las
//           cinco tarjetas sueltas separadas 16 pt son UN grupo con hairlines: los
//           números se alinean en columna y la sección se lee de un golpe.
//   §6.2bis un CONTADOR se pinta en cero («0 de 4 calibrados» es información, y es
//           cuando más falta hace); un VALOR MEDIDO no existe hasta que se mide, y
//           ahí va la invitación con el acto que lo llena.
//   §7      lo que no se sabe no se pinta. Mientras una fuente no ha contestado la
//           fila no dice ni cifra ni invitación: dice que aún no lo sabe.

// MARK: - Lo que las cinco filas saben (puro)

/// Una fila resuelta: cómo se pinta, y si el atleta tiene ALGO ahí.
///
/// Son dos cosas distintas y confundirlas hace mentir al encabezado. Un contador se
/// pinta también en cero (§6.2 bis: «0 de 4 calibrados» es información, y es cuando
/// más falta hace) — pero un cero NO es un logro, y contarlo como «fila con dato»
/// le diría a un atleta que no ha medido nada que ya tiene dos de cinco.
struct FilaRendimiento: Equatable {
    let estado: EstadoDelDato
    /// El atleta tiene algo aquí: un test calibrado, un récord, una medida.
    let logrado: Bool

    static func cargando() -> FilaRendimiento {
        FilaRendimiento(estado: .cargando, logrado: false)
    }

    /// Un hueco declarado nunca es un logro.
    static func vacio(_ invitacion: String) -> FilaRendimiento {
        FilaRendimiento(estado: .vacio(invitacion: invitacion), logrado: false)
    }
}

/// El estado de cada fila, resuelto SIN pintar nada.
///
/// Vive separado de la vista porque es donde están todas las decisiones que
/// importan —qué es un contador y qué un valor medido, cuándo un hueco se declara
/// y cuándo se calla, qué es «no hay dato» y qué «todavía no lo sé»— y así se
/// prueban una a una en vez de a través de una captura.
struct RendimientoResumen: Equatable {
    let tests: FilaRendimiento
    let marcas: FilaRendimiento
    let vo2: FilaRendimiento
    let zonas: FilaRendimiento
    let fuerza: FilaRendimiento
    let hasCoach: Bool

    /// Las filas que de verdad se pintan, en su orden.
    var visibles: [FilaRendimiento] {
        hasCoach ? [tests, marcas, vo2, zonas, fuerza] : [marcas, vo2, fuerza]
    }

    /// «3 de 5 con dato» — cuántas de las filas VISIBLES tienen algo del atleta.
    ///
    /// Cuenta sobre las que se pintan, no sobre cinco fijas: al atleta sin coach no
    /// se le enseñan ni tests ni zonas, y un denominador que las incluyera
    /// prometería dos huecos que en su app no existen.
    var linea: String? {
        // Mientras una fuente sigue en el aire el recuento sería un número que
        // cambia solo debajo del pulgar. Se calla hasta saberlo entero.
        guard visibles.allSatisfy({ $0.estado != .cargando }) else { return nil }
        return "\(visibles.filter(\.logrado).count) de \(visibles.count) con dato"
    }
}

// MARK: - La sección (estado + carga)

struct RendimientoSection: View {
    let bearer: String?
    /// FREE (atleta sin coach): sin batería de tests ni zonas calibradas.
    var hasCoach: Bool = true

    /// Los 1RM que el store YA tiene en memoria — se pintan al instante, sin
    /// esperar a ninguna red. `nil` = la porción aún no ha cargado nunca.
    let fuerza: [StrengthMaxProfile]?
    /// Las cinco bandas de pulso resueltas por el servidor, que viajan dentro de
    /// la identidad. Nil con `identidadCargada` = no hay ancla, y se dice.
    let zonas: HRZoneProfile?
    let identidadCargada: Bool

    /// Se dispara al terminar una sesión de test lanzada desde el hub.
    var onSessionCompleted: () -> Void = {}

    // Las tres fuentes que Perfil no tenía. Cada una con su «ya contestó», porque
    // «no hay dato» y «todavía no lo sé» son estados distintos y se pintan distinto.
    @State private var bateria: BatteryStatus? = nil
    @State private var bateriaLista = false
    @State private var marcas: [MarkView] = []
    @State private var marcasListas = false
    @State private var vo2: AthleteVo2Max? = nil
    @State private var vo2Listo = false

    var body: some View {
        RendimientoFilas(
            resumen: resumen,
            bateriaAbierta: bateria.map { !$0.isComplete } ?? false,
            bearer: bearer,
            hasCoach: hasCoach,
            zonas: zonas,
            onSessionCompleted: onSessionCompleted
        )
        .task { await cargar() }
    }

    private var resumen: RendimientoResumen {
        RendimientoResumen(
            tests: RendimientoEstados.tests(bateria, lista: bateriaLista),
            marcas: RendimientoEstados.marcas(marcas, listas: marcasListas),
            vo2: RendimientoEstados.vo2(vo2, listo: vo2Listo),
            zonas: RendimientoEstados.zonas(zonas, identidadCargada: identidadCargada),
            fuerza: RendimientoEstados.fuerza(fuerza),
            hasCoach: hasCoach
        )
    }

    // MARK: - Carga
    //
    // Las tres fuentes que no son porciones del store, a la vez y tolerante por
    // fuente: que falle el VO₂ no puede dejar sin cifra a las marcas.
    //
    // Y un fallo NO se marca como «ya contestó», que es la parte que importa: si lo
    // hiciera, un servidor caído pintaría «Aún no hay marcas que probar» a un atleta
    // con nueve récords, y eso no es un estado vacío, es la app mintiendo (§7). Sin
    // respuesta la fila se queda en «todavía no lo sé» —el placeholder— y se
    // reintenta sola la próxima vez que se abre Perfil.

    /// Contestó (con lo que sea, incluido «no hay nada») o no contestó. Son cosas
    /// distintas y toda la honestidad de esta sección vive en no confundirlas.
    private enum Respuesta<V> {
        case contesto(V)
        case sinRespuesta
    }

    private func cargar() async {
        guard let bearer else { return }
        async let bateriaReq = pideBateria(bearer)
        async let marcasReq = pideMarcas(bearer)
        async let vo2Req = pideVo2(bearer)
        let (b, m, v) = await (bateriaReq, marcasReq, vo2Req)

        if case let .contesto(status) = b {
            bateria = status
            bateriaLista = true
        }
        if case let .contesto(lista) = m {
            marcas = lista
            marcasListas = true
        }
        if case let .contesto(data) = v {
            vo2 = data
            vo2Listo = true
        }
    }

    private func pideBateria(_ bearer: String) async -> Respuesta<BatteryStatus?> {
        // Sin coach la fila ni se pinta: no hay nada que preguntar.
        guard hasCoach else { return .contesto(nil) }
        guard let status = try? await TestBatteryService.fetchStatus(bearer: bearer) else {
            return .sinRespuesta
        }
        return .contesto(status)
    }

    private func pideMarcas(_ bearer: String) async -> Respuesta<[MarkView]> {
        guard let overview = try? await MarksService.fetchMarks(bearer: bearer) else {
            return .sinRespuesta
        }
        return .contesto(overview.marks)
    }

    private func pideVo2(_ bearer: String) async -> Respuesta<AthleteVo2Max?> {
        // `fetch` devuelve nil cuando NADIE lo ha medido — esa es una respuesta, y
        // la fila la convierte en su invitación. Lo que no es respuesta es el throw.
        guard let data = try? await Vo2MaxService.fetch(bearer: bearer) else {
            return .sinRespuesta
        }
        return .contesto(data)
    }
}

// MARK: - De los datos cargados al estado de cada fila

/// Las cinco reglas, puras y sueltas. Aquí es donde se decide qué es un contador y
/// qué un valor medido, y por eso se prueban aquí y no mirando una pantalla.
enum RendimientoEstados {

    /// CONTADOR — se pinta también en cero: «0 de 4 calibrados» es información, y
    /// es justo cuando más falta hace (§6.2 bis). Pero un cero no es un logro: la
    /// batería cuenta como suya en cuanto hay un test cerrado o uno a medias.
    static func tests(_ bateria: BatteryStatus?, lista: Bool) -> FilaRendimiento {
        guard lista else { return .cargando() }
        guard let b = bateria, b.isScheduled else {
            // Sin batería programada no hay contador que enseñar Y no hay acto que
            // el atleta pueda hacer: los tests los programa su coach. Se dice, y no
            // se pinta un «0 de 0», que es el estado roto que el propio modelo avisa.
            return .vacio("Tu coach los programa y aparecen aquí")
        }
        return FilaRendimiento(
            estado: .valor("\(b.completed)", sufijo: "de \(b.total)", pie: pieDeTests(b)),
            logrado: b.completed > 0 || b.tests.contains(where: \.resultPending)
        )
    }

    private static func pieDeTests(_ b: BatteryStatus) -> String {
        let base = b.completed == 1 ? "calibrado" : "calibrados"
        let aMedias = b.tests.filter(\.resultPending).count
        guard aMedias > 0 else { return base }
        return "\(base) · \(aMedias) sin resultado"
    }

    /// CONTADOR — cuántas pruebas del catálogo tienen ya un récord.
    static func marcas(_ marcas: [MarkView], listas: Bool) -> FilaRendimiento {
        guard listas else { return .cargando() }
        guard !marcas.isEmpty else {
            return .vacio("Aún no hay marcas que probar")
        }
        let conRecord = marcas.filter { $0.best != nil }.count
        return FilaRendimiento(
            estado: .valor("\(conRecord)", sufijo: "de \(marcas.count)", pie: "con récord"),
            logrado: conRecord > 0
        )
    }

    /// VALOR MEDIDO — no existe hasta que algo lo mide.
    static func vo2(_ vo2: AthleteVo2Max?, listo: Bool) -> FilaRendimiento {
        guard listo else { return .cargando() }
        guard let h = vo2?.headline else {
            return .vacio("Lo trae tu reloj, o el Cooper de 12 min")
        }
        let fuente = h.source == .watch ? "tu reloj" : "tu Cooper"
        return FilaRendimiento(
            estado: .valor(Formato.esDecimal(h.value), pie: "ml/kg/min · \(fuente)"),
            logrado: true
        )
    }

    /// VALOR MEDIDO — sin ancla no hay zonas, y no se inventa ninguna.
    static func zonas(_ zonas: HRZoneProfile?, identidadCargada: Bool) -> FilaRendimiento {
        guard identidadCargada else { return .cargando() }
        guard let z = zonas else {
            return .vacio("Sin ancla todavía. Un test de umbral las fija")
        }
        // `sourceLabel` es la explicación que el servidor escribe para el atleta
        // («Estimado por tu edad»). Va SIEMPRE: un umbral inferido que se lee como
        // medido es cómo un número que nadie midió se convierte en evidencia.
        return FilaRendimiento(
            estado: .valor("\(z.lthrBpm)", sufijo: Vocab.ppm, pie: z.sourceLabel),
            logrado: true
        )
    }

    /// VALOR MEDIDO — el levantamiento más pesado abre la fila y el pie dice CUÁL
    /// es: sin eso, «245 kg» en una fila que se llama «Tu fuerza» no se sabe de qué
    /// levantamiento habla.
    static func fuerza(_ fuerza: [StrengthMaxProfile]?) -> FilaRendimiento {
        guard let fuerza else { return .cargando() }
        guard let masPesado = fuerza.max(by: { $0.oneRmKg < $1.oneRmKg }) else {
            return .vacio("Un test de peso × repeticiones calcula tu 1RM")
        }
        let carga = Formato.carga(masPesado.oneRmKg)
        let cuantos = fuerza.count == 1 ? "1 levantamiento" : "\(fuerza.count) levantamientos"
        return FilaRendimiento(
            estado: .valor(
                carga.cifra,
                sufijo: carga.unidad,
                pie: "\(masPesado.exerciseLabel.lowercased()) · \(cuantos)"
            ),
            logrado: true
        )
    }
}

// MARK: - El pintado (sin estado, para poder renderizarse)

/// El encabezado con el estado de la sección y las cinco filas en UN grupo.
///
/// Vive fuera de `RendimientoSection` para poder renderizarse en una captura —
/// dentro de Perfil cuelga de un `ScrollView` e `ImageRenderer` no dibuja
/// ScrollView, el mismo motivo por el que `ResumenSemanaCard` vive fuera de la suya.
struct RendimientoFilas: View {
    let resumen: RendimientoResumen
    /// La batería está programada y aún abierta → el contador va en acento: es la
    /// única fila de la sección que pide un acto concreto.
    var bateriaAbierta: Bool = false
    let bearer: String?
    var hasCoach: Bool = true
    let zonas: HRZoneProfile?
    var onSessionCompleted: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SectionHeader(title: "Rendimiento", accesorio: resumen.linea)
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    if hasCoach {
                        NavigationLink {
                            TestsHubView(
                                bearer: bearer,
                                hrZones: zonas,
                                onSessionCompleted: onSessionCompleted
                            )
                        } label: {
                            FilaDato(
                                etiqueta: "Tus tests",
                                estado: resumen.tests.estado,
                                destacaValor: bateriaAbierta
                            )
                        }
                        .buttonStyle(.plain)
                        Hairline()
                    }

                    NavigationLink {
                        MarksLibraryView(bearer: bearer, hrZones: zonas)
                    } label: {
                        FilaDato(etiqueta: "Tus marcas", estado: resumen.marcas.estado)
                    }
                    .buttonStyle(.plain)
                    Hairline()

                    NavigationLink {
                        Vo2MaxView(bearer: bearer, hrZones: zonas)
                    } label: {
                        FilaDato(etiqueta: "Tu VO₂ máx", estado: resumen.vo2.estado)
                    }
                    .buttonStyle(.plain)

                    if hasCoach {
                        Hairline()
                        NavigationLink {
                            MyZonesView(bearer: bearer)
                        } label: {
                            FilaDato(etiqueta: "Tus zonas de pulso", estado: resumen.zonas.estado)
                        }
                        .buttonStyle(.plain)
                    }
                    Hairline()

                    NavigationLink {
                        MyStrengthView(bearer: bearer, hasCoach: hasCoach)
                    } label: {
                        FilaDato(etiqueta: "Tu fuerza", estado: resumen.fuerza.estado)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
