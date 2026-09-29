import Foundation

// LA FUERZA, LEÍDA — el «¿mejoro?» de la fuerza (`screens/analiticas-familia-fuerza`) sobre lo que sirve
// `progreso-fuerza.ts`. Puro y con test.
//
//   sujeto        `progreso.fuerza`: el 1RM estimado del levantamiento principal (o las reps a peso corporal), la MISMA
//                 fila que la portada
//   ejercicios    `fuerza.e1rm.<id>` (1RM estimado con la FÓRMULA DEL COACH, que no se calcula aquí) y `fuerza.reps.<id>`
//                 (la mejor serie a peso corporal), cada uno con su tendencia
//   por reps      `fuerza.rm.<id>`: lo más pesado que ha movido para cada número de repeticiones, levantado, no estimado
//   tonelaje      `fuerza.tonelaje` y `fuerza.series`: Σ reps × kg y series de cada semana
//   por patrón    el reparto de esas dos lecturas + `fuerza.patron.<patrón>.series` (para el cambio de series)
//
// No se pinta lo que el servidor no sirve o no le toca al cliente: el 1RM «est.» por número de repeticiones del doble
// (es la fórmula del coach: método, no código), el día de cada mejor por reps, el contorno del plan en el tonelaje (no
// hay carga planificada por kilos) y el 1RM declarado en el perfil (el detalle lee las series hechas). La fila de
// «El RIR que te piden» sale del cumplimiento (`PedidoDeSeries`).

/// Un ejercicio con marca: su 1RM estimado, o sus reps a peso corporal.
struct EjercicioDeFuerza: Equatable, Identifiable {
    /// El id del ejercicio del servidor (el sufijo de `fuerza.e1rm.<id>`).
    let id: String
    /// «Sentadilla»: el título del servidor sin lo que mide.
    let nombre: String
    /// «1RM estimado» o «mejor serie».
    let metrica: String
    let lectura: LecturaAnalitica
    /// A peso corporal: progresa en repeticiones por serie, no en kilos.
    let pesoCorporal: Bool
    /// Lo más pesado para cada número de repeticiones, de menos a más reps. Vacío a peso corporal.
    let porReps: [MarcaPorReps]
}

struct MarcaPorReps: Equatable, Identifiable {
    let reps: Int
    /// «1 rep», «5 reps»: como lo escribe el servidor.
    let etiqueta: String
    let kg: Double
    var id: Int { reps }
}

/// Un patrón de movimiento en la ventana: sus series y su tonelaje, y cuántas series tenía en el periodo anterior.
struct PatronDeFuerza: Equatable, Identifiable {
    /// `squat`, `hinge`…: la clave estable del catálogo.
    let codigo: String
    /// «Sentadilla», «Bisagra de cadera»: como lo escribe el servidor.
    let nombre: String
    let series: Double
    /// Nulo si el patrón no suma kilos (los acarreos): se cuentan por series y metros.
    let tonelajeKg: Double?
    let seriesAnterior: Double?
    var id: String { codigo }

    /// El cambio de series contra el periodo anterior, solo si cambió.
    var cambioDeSeries: Int? {
        guard let seriesAnterior, series != seriesAnterior else { return nil }
        return Int((series - seriesAnterior).rounded())
    }
}

struct LecturaDeFuerza: Equatable {
    let sujeto: SujetoDeFamilia
    let fila: LecturaAnalitica?
    let ejercicios: [EjercicioDeFuerza]
    let tonelaje: LecturaAnalitica?
    let series: LecturaAnalitica?
    let patrones: [PatronDeFuerza]
    let hoy: String

    static let prefijoE1rm = "fuerza.e1rm."
    static let prefijoReps = "fuerza.reps."
    static let prefijoTabla = "fuerza.rm."
    static let prefijoPatron = "fuerza.patron."
    static let idTonelaje = "fuerza.tonelaje"
    static let idSeries = "fuerza.series"

    var estado: EstadoDeFamilia { sujeto.estado }

    static func desde(_ d: DetalleAnaliticas) -> LecturaDeFuerza {
        LecturaDeFuerza(
            sujeto: SujetoDeFamilia.desde(d, .fuerza),
            fila: d.fila,
            ejercicios: ejercicios(d),
            tonelaje: d.lectura(idTonelaje),
            series: d.lectura(idSeries),
            patrones: patrones(d),
            hoy: d.hoy
        )
    }

    private static func ejercicios(_ d: DetalleAnaliticas) -> [EjercicioDeFuerza] {
        let tablas = Dictionary(d.lecturas(prefijo: prefijoTabla).map { (String($0.id.dropFirst(prefijoTabla.count)), $0) }, uniquingKeysWith: { a, _ in a })
        let cargados = d.lecturas(prefijo: prefijoE1rm).filter { $0.estado == .medida && $0.dato != nil }.map { l -> EjercicioDeFuerza in
            let id = String(l.id.dropFirst(prefijoE1rm.count))
            return EjercicioDeFuerza(id: id, nombre: nombreDeEjercicio(l), metrica: "1RM estimado", lectura: l, pesoCorporal: false, porReps: marcasPorReps(tablas[id]))
        }
        let corporales = d.lecturas(prefijo: prefijoReps).filter { $0.estado == .medida && $0.dato != nil }.map { l in
            EjercicioDeFuerza(id: String(l.id.dropFirst(prefijoReps.count)), nombre: nombreDeEjercicio(l), metrica: "mejor serie", lectura: l, pesoCorporal: true, porReps: [])
        }
        return cargados + corporales
    }

    /// «Sentadilla · 1RM estimado» → «Sentadilla». El servidor escribe el nombre delante y lo que mide detrás.
    static func nombreDeEjercicio(_ l: LecturaAnalitica) -> String {
        for sufijo in [" · 1RM estimado", " · mejor serie"] where l.tituloEs.hasSuffix(sufijo) {
            return String(l.tituloEs.dropLast(sufijo.count))
        }
        return l.tituloEs
    }

    private static func marcasPorReps(_ tabla: LecturaAnalitica?) -> [MarcaPorReps] {
        guard let tabla, tabla.estado == .medida, let partes = tabla.reparto?.partes else { return [] }
        return partes.compactMap { p in Int(p.code).map { MarcaPorReps(reps: $0, etiqueta: p.etiquetaEs, kg: p.valor) } }
            .sorted { $0.reps < $1.reps }
    }

    private static func patrones(_ d: DetalleAnaliticas) -> [PatronDeFuerza] {
        guard let series = d.lectura(idSeries), series.estado == .medida, let partes = series.reparto?.partes else { return [] }
        let kilos = Dictionary((d.lectura(idTonelaje)?.reparto?.partes ?? []).map { ($0.code, $0.valor) }, uniquingKeysWith: { a, _ in a })
        return partes.map { p in
            PatronDeFuerza(
                codigo: p.code,
                nombre: p.etiquetaEs,
                series: p.valor,
                tonelajeKg: kilos[p.code].flatMap { $0 > 0 ? $0 : nil },
                seriesAnterior: d.lectura("\(prefijoPatron)\(p.code).series")?.comparacion?.anterior
            )
        }
        .sorted { $0.series > $1.series || ($0.series == $1.series && $0.nombre < $1.nombre) }
    }
}
