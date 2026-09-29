import Foundation

// LAS ESTACIONES Y LOS WOD, LEÍDOS — el detalle de `screens/analiticas-familia-estaciones` sobre lo que sirve
// `progreso-estaciones.ts`. Puro y con test.
//
//   sujeto        `progreso.estaciones`: la marca clave (la estación con más uso comparable), la MISMA fila que la portada
//   estaciones    `estaciones.<slug>.<dosis>.<carga>`: el mejor tiempo de una estación A LA MISMA DOSIS Y CON LA MISMA
//                 CARGA (un sled push de 25 m con 150 kg y uno de 50 m con 100 kg son dos pruebas distintas)
//   wods          `wod.<id>`: las simulaciones HYROX y los WOD que se repiten, con su historial entero
//   carrera       el bloque «Carrera» del panel, con TODOS sus tramos: el hueco contra el objetivo
//
// No se pinta lo que el servidor no sirve: los parciales de la última carrera oficial (no se importan a las
// analíticas) y las estaciones sin marca como invitación (el servidor solo emite las pruebas que se han hecho: la dosis y
// la carga de las que faltan dependen de la categoría y no se inventan).

struct MejorEstacion: Equatable, Identifiable {
    /// El id de la lectura (`estaciones.sled_push.50m.152kg`).
    let id: String
    /// «Sled push».
    let nombre: String
    /// «50 m», «100 reps».
    let dosis: String?
    /// «152 kg». Nulo = «sin carga»: nunca se inventa la del plan.
    let carga: String?
    let mejor: Double
    let anterior: Double?
    let delta: DeltaVista?
    let cuando: DiaDeMarca
    let nuevo: Bool
    let viejo: Bool

    /// La dosis y la carga en una línea: «50 m · 152 kg».
    var detalle: String { [dosis, carga].compactMap { $0 }.joined(separator: " · ") }
}

/// Un WOD de referencia (uno que se repite) o una simulación HYROX, con su historial.
struct WodDeReferencia: Equatable, Identifiable {
    let id: String
    let nombre: String
    /// `segundos` (menos es mejor) o `rondas` (más es mejor: rondas + fracción de la siguiente).
    let unidad: UnidadLectura
    /// TODA la historia, un punto por día con marca.
    let serie: [PuntoDeSerie]
    /// La última puntuación.
    let ultimo: UltimaPuntuacion?
    let esSimulacion: Bool
    let delta: DeltaVista?

    var menosEsMejor: Bool { AnaliticasFormato.menosEsMejor(unidad) }
    /// Una línea necesita dos puntos: con uno solo no hay tendencia.
    var hayTendencia: Bool { serie.compactMap(\.v).count >= 2 }
}

struct UltimaPuntuacion: Equatable {
    let valor: Double
    let dia: String
}

struct LecturaDeEstaciones: Equatable {
    let sujeto: SujetoDeFamilia
    let fila: LecturaAnalitica?
    let estaciones: [MejorEstacion]
    let wods: [WodDeReferencia]
    let hoy: String

    static let prefijoEstacion = "estaciones."
    static let prefijoWod = "wod."
    static let simulacion = "simulacion_hyrox"

    var estado: EstadoDeFamilia { sujeto.estado }

    static func desde(_ d: DetalleAnaliticas) -> LecturaDeEstaciones {
        LecturaDeEstaciones(
            sujeto: SujetoDeFamilia.desde(d, .estaciones),
            fila: d.fila,
            estaciones: estaciones(d),
            wods: wods(d),
            hoy: d.hoy
        )
    }

    private static func estaciones(_ d: DetalleAnaliticas) -> [MejorEstacion] {
        d.lecturas(prefijo: prefijoEstacion).compactMap { l -> MejorEstacion? in
            guard l.estado == .medida, let dato = l.dato, dato.unidad == .segundos else { return nil }
            let partes = partesDelTitulo(l.tituloEs)
            return MejorEstacion(
                id: l.id, nombre: partes.nombre, dosis: partes.dosis, carga: partes.carga,
                mejor: dato.valor,
                anterior: l.esViejo ? nil : l.comparacion?.anterior,
                delta: l.esViejo ? nil : AnaliticasDerivados.delta(de: l),
                cuando: l.diaDelMejor(ventana: d.ventana),
                nuevo: !l.esViejo && l.esRecordDeLaVentana,
                viejo: l.esViejo
            )
        }
    }

    /// «Sled push · 50 m · 152 kg» → nombre, dosis y carga. El servidor escribe la prueba con su dosis y, si la hubo, su carga.
    static func partesDelTitulo(_ titulo: String) -> (nombre: String, dosis: String?, carga: String?) {
        var trozos = titulo.components(separatedBy: " · ")
        let carga = trozos.count >= 3 && trozos.last?.hasSuffix(" kg") == true ? trozos.removeLast() : nil
        let dosis = trozos.count >= 2 ? trozos.removeLast() : nil
        return (trozos.joined(separator: " · "), dosis, carga)
    }

    private static func wods(_ d: DetalleAnaliticas) -> [WodDeReferencia] {
        d.lecturas(prefijo: prefijoWod).compactMap { l -> WodDeReferencia? in
            guard l.estado == .medida, let dato = l.dato, let serie = l.serie else { return nil }
            let ultimo = serie.puntos.last { $0.v != nil }.flatMap { p in p.v.map { UltimaPuntuacion(valor: $0, dia: p.t) } }
            return WodDeReferencia(
                id: l.id, nombre: l.tituloEs, unidad: dato.unidad, serie: serie.puntos, ultimo: ultimo,
                esSimulacion: l.procedencia.de == simulacion, delta: AnaliticasDerivados.delta(de: l)
            )
        }
    }
}
