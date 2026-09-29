import Foundation

// LAS PÁGINAS DE LA CORONA, EN LÍNEAS DE DATO — Datos, Vueltas y Estructura
// (espejo de `kit-reloj/listas.tsx#filasDeDatos`, `filasDeVueltas`,
// `PaginaLista` y de `vivo.tsx#vueltasDe`). Funciones PURAS: la muñeca pinta
// las filas; qué filas, en qué orden y con qué palabras, se decide aquí.

extension Vivo {

    // MARK: - Datos: la sesión entera

    /// Una fila «valor unidad»: el valor a 30 pt, la unidad a 15 en tinta2, y la zona si es el pulso.
    struct FilaDatoVista: Equatable {
        var valor: String
        var unidad: String
        /// El pulso lleva su zona.
        var ppm: Double? = nil
        var zona: ZonaVista? = nil
        /// El corazón delante (solo la fila del pulso).
        var glifo: Bool = false
    }

    /// Las cuatro filas de la sesión entera (tiempo, distancia, ritmo medio, pulso).
    /// Los metros y el pulso que dependen del móvil y no llegan se pintan «—», no el
    /// último valor congelado. `fuente`: quién da los metros si no es el GPS («cinta»).
    static func filasDeDatos(_ sesion: Sesion, _ l: Lecturas, zonas: ZonasCoach?, fuente: String? = nil) -> [FilaDatoVista] {
        let sinMetros = l.viejo(.hecho)
        let d = (sesion.metros != nil && !sinMetros) ? fmtDistancia(sesion.metros!) : nil
        let ppm = l.viejo(.ppm) ? nil : l.ppm
        let unidadDistancia = "\(d?.unidad ?? "km")\(fuente.map { " · \($0)" } ?? "")"
        return [
            FilaDatoVista(valor: fmtReloj(sesion.t), unidad: "total"),
            FilaDatoVista(valor: d?.valor ?? "—", unidad: unidadDistancia),
            FilaDatoVista(valor: sinMetros ? "—" : fmtRitmo(sesion.ritmoMedio), unidad: "/km medio"),
            FilaDatoVista(valor: ppm.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm", ppm: ppm,
                          zona: (ppm != nil && zonas != nil) ? zonaVista(ppm!, zonas!) : nil, glifo: true),
        ]
    }

    // MARK: - Vueltas: la última arriba

    struct JuicioVuelta: Equatable {
        var texto: String
        /// Con marca (▲▼) va en tinta y negrita; «dentro», en tinta2.
        var fuera: Bool
    }

    struct FilaSplit: Equatable {
        var n: String
        var valor: String
        var detalle: String? = nil
        var juicio: JuicioVuelta? = nil
    }

    /// Las filas de la página Vueltas: el título («Series · 3:45–3:55» o «Kilómetros»)
    /// y una fila por vuelta con su número, su valor, su detalle y su veredicto, la
    /// última primero. `visibles`: cuántas de las últimas se enseñan (decide si una
    /// serie por tiempo se lee por sus metros).
    static func filasDeVueltas(_ vueltas: [Vuelta], objetivo: String?, visibles: Int) -> (titulo: [String], filas: [FilaSplit]) {
        let ultimas = Array(vueltas.reversed().prefix(visibles))
        let series = vueltas.contains { $0.clase != .km } || (vueltas.isEmpty && objetivo != nil)
        let nombre = series ? "Series" : "Kilómetros"
        let filas: [FilaSplit] = ultimas.map { v in
            // Una serie por TIEMPO siempre dura lo mismo: su resultado son los metros.
            let porTiempo = v.clase != .km && ultimas.count > 1 && ultimas.allSatisfy { $0.segundos == v.segundos }
            let detalle: String?
            if v.clase != .km, let m = v.metros, m != 1000 { detalle = fmtRitmo(v.ritmo) }
            else if v.clase == .km, let ppm = v.ppm { detalle = "\(num(ppm)) ppm" }
            else { detalle = nil }
            let n: String
            if v.clase == .km { n = "km \(v.n)" } else if let t = v.tanda { n = "\(t)·\(v.n)" } else { n = String(v.n) }
            let valor = (porTiempo && v.metros != nil) ? "\(num(v.metros!))\u{00A0}m" : fmtReloj(v.segundos)
            return FilaSplit(n: n, valor: valor, detalle: detalle, juicio: juicioDe(v).map { JuicioVuelta(texto: $0.texto, fuera: $0.fuera) })
        }
        return (objetivo.map { [nombre, $0] } ?? [nombre], filas)
    }

    /// Lo que dice la fila de la vuelta que se está corriendo.
    static let palabraAhora = "ahora"

    /// Lo que la página Vueltas necesita además de las vueltas: el objetivo de las
    /// series para la cabecera y la vuelta que se está corriendo (la serie en curso, o el km).
    static func vueltaEnCurso(_ e: EstadoVivo, registro: RegistroVueltas) -> (objetivo: String?, enCurso: FilaSplit?) {
        let p = e.paso
        let deSerie: Paso? = p.rol == .trabajo ? p : e.siguiente
        let o = deSerie.flatMap { principal($0) }
        let objetivo = (o != nil && (deSerie?.posicion?.serie != nil || deSerie?.posicion?.tramo != nil)) ? fmtObjetivo(o!) : nil
        let cuenta = p.posicion?.serie ?? p.posicion?.tramo
        if p.rol == .trabajo, let cuenta {
            let n = p.posicion?.tanda.map { "\($0.n)·\(cuenta.n)" } ?? String(cuenta.n)
            return (objetivo, FilaSplit(n: n, valor: fmtReloj(e.lecturas.t), detalle: palabraAhora))
        }
        if p.vueltaAutoM != nil {
            let km = registro.kmEnCurso(sesionT: e.sesion.t)
            return (objetivo, FilaSplit(n: "km \(km.n)", valor: km.segundos.map(fmtReloj) ?? "—", detalle: palabraAhora))
        }
        return (objetivo, nil)
    }

    // MARK: - Estructura: la sesión del coach y dónde estás

    struct FilaLista: Equatable {
        var linea: String
        var detalle: String?
        var estado: FilaEstructura.Estado
    }

    /// Cuántas filas caben en la página sin hacer scroll: se enseña una ventana alrededor de «ahora».
    static let filasVisiblesEstructura = 4

    /// La ventana: la fila anterior a la de ahora, la de ahora y las que vienen.
    static func ventanaDeLista(_ filas: [FilaLista], visibles: Int = filasVisiblesEstructura) -> [FilaLista] {
        let ahora = Swift.max(0, filas.firstIndex { $0.estado == .ahora } ?? 0)
        let desde = Swift.max(0, Swift.min(ahora - 1, filas.count - visibles))
        return Array(filas.dropFirst(desde).prefix(visibles))
    }
}
