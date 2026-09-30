import Foundation

// LA BIBLIOTECA DE MARCAS, RESUELTA SIN PINTAR NADA.
//
// Qué estado tiene la pantalla, qué grupos salen, qué dice cada fila y con qué palabras: todo eso se decide
// aquí, en tipos puros y testeables, y la vista solo lo pinta. Antes vivía en `static func` de la propia vista
// (`MarcasGrupos.estado/sublabel/color`), donde no se podía probar sin montar una pantalla.
//
// Las reglas que gobiernan cada fila (docs/CONTRATO-UI.md):
//
//   §4      el dato pesa más que su etiqueta: con marca, el tiempo manda; sin marca, la prueba es el
//           sujeto de su fila y el subtítulo se convierte en la invitación.
//   §6.2bis un CONTADOR se pinta en cero («0 de 4 con récord»); un VALOR MEDIDO no existe hasta que se
//           mide: ni guion ni cifra inventada, una invitación con lo que cuesta la prueba.
//   §6.2    una lista sin filas ES un vacío; un grupo sin ninguna prueba en el catálogo no se declara:
//           no es un hueco del atleta, es que su coach no ha puesto pruebas de ese tipo.

// MARK: - El estado de la pantalla

enum EstadoDeBiblioteca: Equatable {
    /// Aún no contestó nadie y no hay nada que enseñar.
    case cargando
    /// No pudimos preguntar. Distinto de «preguntamos y no hay nada»: uno lleva reintento y el otro no,
    /// y confundirlos es lo que dejaba la pantalla muda.
    case error
    /// Preguntamos y el catálogo está vacío: no es un hueco que el atleta pueda llenar con ningún acto.
    case vacio
    case datos

    /// Un fallo NO vacía una lista que ya se tiene: nueve récords no desaparecen de la pantalla porque
    /// falle una revalidación. El error solo sale cuando nunca hubo nada que enseñar.
    static func resolver(cargando: Bool, fallo: Bool, marcas: [MarkView]) -> EstadoDeBiblioteca {
        if cargando { return .cargando }
        if !marcas.isEmpty { return .datos }
        return fallo ? .error : .vacio
    }
}

// MARK: - Una fila

/// Una prueba del catálogo, lista para pintar.
struct FilaDeMarca: Equatable, Identifiable {
    enum Estado: Equatable {
        /// Hay récord: el tiempo manda y, debajo, el ritmo que sale de él.
        case marca(cifra: String, ritmo: String?)
        /// No lo hay: la invitación dice cuánto cuesta la prueba.
        case sinMarca(invitacion: String)
    }

    let slug: String
    let etiqueta: String
    let estado: Estado
    /// «hace 3 semanas · test del coach»: cuándo y de dónde salió el número. Solo con marca.
    let detalle: String?

    var id: String { slug }

    var tieneMarca: Bool {
        if case .marca = estado { return true }
        return false
    }

    /// Lo que lee VoiceOver de la fila entera, en el orden en que se lee a ojo.
    var etiquetaAccesible: String {
        switch estado {
        case let .marca(cifra, ritmo):
            return [etiqueta, cifra, ritmo, detalle].compactMap { $0 }.joined(separator: ", ")
        case let .sinMarca(invitacion):
            return "\(etiqueta), \(invitacion)"
        }
    }

    static func desde(_ mark: MarkView, ahora: Date = Date()) -> FilaDeMarca {
        guard let mejor = mark.best else {
            return FilaDeMarca(
                slug: mark.slug,
                etiqueta: mark.label,
                estado: .sinMarca(invitacion: invitacion(mark)),
                detalle: nil
            )
        }
        return FilaDeMarca(
            slug: mark.slug,
            etiqueta: mark.label,
            estado: .marca(cifra: MarkFormat.value(mark, mejor.value), ritmo: MarkFormat.paceLine(mark, mejor.value)),
            detalle: procedencia(mark, mejor, ahora: ahora)
        )
    }

    /// «Aún sin marca · ~4:00»: la invitación de una prueba que se puede medir; «Aún sin tiempo» la de una
    /// carrera que se registra (no se mide, se declara).
    private static func invitacion(_ mark: MarkView) -> String {
        mark.measuredBy == "registered" ? "Aún sin tiempo" : "Aún sin marca · \(mark.approxLabel)"
    }

    /// La fila pinta el MEJOR resultado, así que la fecha y el sello describen ese, no el último: con una
    /// marca declarada, una fecha reciente sobre un número de hace medio año no es una imprecisión, es una
    /// mentira. El sello sale cuando el número NO es una medición propia del atleta (del coach, de una
    /// carrera, o declarado al entrar): `athlete_test` es el caso por defecto de la biblioteca y se calla.
    static func procedencia(_ mark: MarkView, _ resultado: MarkResult, ahora: Date = Date()) -> String {
        var partes: [String] = []
        if let relativa = MarkFormat.relative(resultado.recordedAt, ahora: ahora) { partes.append(relativa) }
        if resultado.source != DataOrigin.athleteTest,
           let origen = DataOrigin.label(resultado.source, eventName: resultado.eventName) {
            partes.append(origen)
        }
        return partes.isEmpty ? mark.approxLabel : partes.joined(separator: " · ")
    }
}

// MARK: - Los grupos

/// Correr · Remo y SkiErg · Carreras: cada uno, una tarjeta de filas.
struct GrupoDeMarcas: Equatable, Identifiable {
    enum Clave: CaseIterable {
        case correr, ergo, carreras

        /// El valor con que el servidor etiqueta el grupo (`MarkView.group`).
        var grupoDelCable: String {
            switch self {
            case .correr: return "run"
            case .ergo: return "ergo"
            case .carreras: return "race"
            }
        }

        var titulo: String {
            switch self {
            case .correr: return "Correr"
            case .ergo: return "Remo y SkiErg"
            case .carreras: return "Carreras"
            }
        }
    }

    let clave: Clave
    let filas: [FilaDeMarca]

    var id: Clave { clave }
    var titulo: String { clave.titulo }
    var conRecord: Int { filas.filter(\.tieneMarca).count }

    /// «2 de 4 con récord»: el mismo contador que enseña la tesela de Marcas en Perfil. Se pinta también
    /// en cero: «0 de 4» es información, y es justo cuando más falta hace.
    var recuento: String { "\(conRecord) de \(filas.count) con récord" }

    /// Los grupos que SE PINTAN, en su orden. Un grupo sin ninguna prueba en el catálogo no se declara.
    static func desde(_ marcas: [MarkView], ahora: Date = Date()) -> [GrupoDeMarcas] {
        Clave.allCases.compactMap { clave in
            let filas = marcas.filter { $0.group == clave.grupoDelCable }.map { FilaDeMarca.desde($0, ahora: ahora) }
            return filas.isEmpty ? nil : GrupoDeMarcas(clave: clave, filas: filas)
        }
    }
}
