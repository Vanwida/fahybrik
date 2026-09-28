import Foundation

// EL CIRCUITO Y LA HYROX — funciones PURAS de la familia «circuito» (espejo de
// `screens/iphone-vivo-circuito/texto.ts` y `screens/reloj-circuito/texto.ts`).
//
//   formatoCircuitoDe      ¿el segmento es un circuito de rondas o una HYROX?
//   tituloCircuito         fila 1 de la cabecera: QUÉ haces, el nombre delante
//                          («Sled Push», «SkiErg · 1000 m», «Run 5/8 · 1000 m»).
//   formatoCircuito        fila 2: el formato y DÓNDE estás («HYROX · Estación 2/8»,
//                          «Circuito · Ronda 2/5 · Estación 2/3»).
//   claveCircuito          la acción del momento (vocabulario cerrado).
//   avisoCircuito          el texto del deshacer (la carrera: «Run 3 cerrado»).
//   tiempoDeRonda          lo que va de la ronda: lo cerrado de ella + lo de ahora.
//   dosisCompleta          la dosis de lo que aún no ha empezado (la Estructura).
//   posicionesPorCarrera   el adaptador: en una lista que el coach escribe como
//                          «Run · estación · Run · estación…», cada Run ABRE una ronda.
//   marcarTramosContinuos  el adaptador: un bloque continuo remo → ski → bici son
//                          tres TRAMOS de una misma pieza («Remo · tramo 1/3»).
//
// Lo que el motor no modela no se inventa: la Roxzone existe solo si el coach la
// escribe como una pieza más de la lista («Roxzone»), y se cierra con un toque.

extension Vivo {

    enum FormatoCircuito: String, Equatable { case rondas, hyrox }

    /// Cómo se llama en pantalla una simulación de HYROX.
    static let nombreHyrox = "HYROX"

    /// El formato de un segmento que pinta esta familia. `nil` = no es un circuito
    /// (For Time y chipper son del WOD).
    static func formatoCircuitoDe(_ scheme: PrescriptionScheme?) -> FormatoCircuito? {
        switch scheme {
        case .hyroxSim?: return .hyrox
        case .rounds?: return .rondas
        default: return nil
        }
    }

    /// ¿Es la pieza «Roxzone» que el coach escribió en la lista?
    static func esRoxzone(_ nombre: String) -> Bool {
        nombre.lowercased().contains("roxzone")
    }

    /// ¿La mide algo que no sea el atleta? La máquina o un sensor.
    static func estacionMedida(_ p: Paso) -> Bool { p.medida.mide == .ergo || p.medida.mide == .sensor }

    /// UNA ESTACIÓN DE MÁQUINA SIN LA MÁQUINA: nadie cuenta los metros, así que no
    /// hay cuenta atrás que se congele. Manda el crono de la estación, el trabajo
    /// dice la dosis y se cierra con «Estación hecha» (I10: nada se conecta solo).
    static func pasoSegunEnlace(_ p: Paso, _ d: Dispositivos) -> Paso {
        guard p.clase == .estacion, p.medida.mide == .ergo, let m = p.maquina, d.maquina != m.tipo else { return p }
        var q = p
        q.medida.mide = .atleta
        q.cierre = .atleta
        return q
    }

    // MARK: - La cabecera

    /// FILA 1 — qué haces, el nombre delante. En HYROX el atleta cuenta runs.
    static func tituloCircuito(_ p: Paso, _ f: FormatoCircuito) -> [String] {
        let nombre = p.nombre ?? nombreClase(p.clase)
        let r = p.posicion?.ronda
        let pr = fmtPrescrito(p.medida)
        switch p.clase {
        case .carrera:
            if f == .hyrox, let r { return ["\(nombre) \(r.n)/\(r.de)", pr].filter { !$0.isEmpty } }
            return [nombre, pr].filter { !$0.isEmpty }
        case .estacion:
            return estacionMedida(p) && !pr.isEmpty ? [nombre, pr] : [nombre]
        case .roxzone:
            return [nombreClase(.roxzone)]
        default:
            return posicionDe(p)
        }
    }

    /// FILA 2 — el formato y dónde estás. Un dato, un sitio: el run de HYROX ya
    /// se cuenta en la fila 1; una sola estación por ronda no dice «Estación 1/1».
    static func formatoCircuito(_ p: Paso, _ f: FormatoCircuito, nombres: NombresFormato = nombresFormatoDefecto) -> [String] {
        let r = p.posicion?.ronda
        let e = p.posicion?.estacion
        if f == .hyrox {
            if p.clase == .carrera { return [nombreHyrox] }
            if let e { return [nombreHyrox, "Estación \(e.n)/\(e.de)"] }
            if let r { return [nombreHyrox, "Ronda \(r.n)/\(r.de)"] }
            return [nombreHyrox]
        }
        var partes = [nombres.circuito]
        if let r, r.de > 1 { partes.append("Ronda \(r.n)/\(r.de)") }
        if let e, e.de > 1 { partes.append("Estación \(e.n)/\(e.de)") }
        return partes
    }

    // MARK: - La acción y el deshacer

    /// La acción del momento del circuito. `nil` = la del kit.
    static func claveCircuito(_ p: Paso) -> ClavePrimaria? {
        if p.rol == .descanso { return .empezarYa }
        if p.clase == .roxzone { return p.roxzone == .salida ? .salgoACorrer : .empiezo }
        if p.clase == .estacion { return .estacionHecha }
        if p.clase == .carrera { return .cerrarElTramo }
        return nil
    }

    /// El texto del deshacer: el del kit, salvo la carrera.
    static func avisoCircuito(_ p: Paso, _ f: FormatoCircuito) -> String {
        guard p.clase == .carrera else { return avisoDeCierre(p) }
        if f == .hyrox, let r = p.posicion?.ronda { return "Run \(r.n) cerrado" }
        return "Tramo cerrado"
    }

    // MARK: - Lo que va de la ronda

    /// Lo cerrado de la ronda del paso `i` (sus parciales) más lo que va del paso
    /// de ahora. La ronda de HYROX es su run, su Roxzone y su estación.
    static func tiempoDeRonda(_ pasos: [Paso], _ i: Int, _ parciales: [Parcial], _ t: Double) -> Double? {
        guard pasos.indices.contains(i), let r = pasos[i].posicion?.ronda else { return nil }
        let seg = pasos[i].origen?.segmento
        let cerrado = parciales.filter { x in
            x.i < i && pasos.indices.contains(x.i) && pasos[x.i].posicion?.ronda?.n == r.n && pasos[x.i].origen?.segmento == seg
        }.reduce(0) { $0 + $1.segundos }
        return cerrado + t
    }

    // MARK: - La Estructura

    /// La dosis entera, mida quien mida: para lo que AÚN no ha empezado.
    static func dosisCompleta(_ p: Paso) -> [String] {
        let pr = fmtPrescrito(p.medida)
        return [pr.isEmpty ? nil : pr, textoCargaImplemento(p.carga), principal(p).map { fmtObjetivo($0) }].compactMap { $0 }
    }

    /// Lo que se dice bajo el nombre en la Estructura: el /km o el /500 y el
    /// pulso de lo hecho; la dosis de lo que viene, sin repetir lo que ya dice el nombre.
    static func detalleEnRuta(_ p: Paso, parcial: Parcial?, nombre: String) -> String? {
        if let x = parcial {
            let partes = [ritmoDeParcial(p, x), x.ppm.map { "\(Int($0.rounded())) ppm" }].compactMap { $0 }
            return partes.isEmpty ? nil : partes.joined(separator: " · ")
        }
        let partes = dosisCompleta(p).filter { !nombre.contains($0) }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    // MARK: - El adaptador: la ronda que abre cada Run

    /// En una ruta que el coach escribe como «Run · estación · Run · estación…»
    /// (la 493, una HYROX), cada Run abre una ronda: «Ronda 2/5», «Run 3/8».
    /// Las estaciones se cuentan dentro de su ronda (o en toda la HYROX); la
    /// Roxzone no es estación: la de entrada lleva la estación a la que entras.
    /// `nil` = la lista no tiene esa forma (no empieza por Run, un solo Run, o dos
    /// Run seguidos) y el adaptador sigue como antes.
    static func posicionesPorCarrera(corre: [Bool], roxzone: [Bool], hyrox: Bool) -> [Posicion]? {
        let n = corre.count
        guard n > 1, n == roxzone.count, corre.first == true else { return nil }
        let runs = corre.filter { $0 }.count
        guard runs >= 2 else { return nil }
        for k in 0..<(n - 1) where corre[k] && corre[k + 1] { return nil }
        let esEstacion = (0..<n).map { !corre[$0] && !roxzone[$0] }
        // Las estaciones de cada ronda, para contarlas dentro de ella.
        var porRonda: [Int] = []
        for k in 0..<n {
            if corre[k] { porRonda.append(0) } else if esEstacion[k] { porRonda[porRonda.count - 1] += 1 }
        }
        let totalEstaciones = esEstacion.filter { $0 }.count
        var out: [Posicion] = []
        var r = 0, enRonda = 0, global = 0
        for k in 0..<n {
            if corre[k] { r += 1; enRonda = 0 }
            var pos = Posicion(ronda: Contador(n: r, de: runs))
            if esEstacion[k] {
                enRonda += 1; global += 1
                pos.estacion = hyrox ? Contador(n: global, de: totalEstaciones) : Contador(n: enRonda, de: porRonda[r - 1])
            }
            out.append(pos)
        }
        // La Roxzone de entrada lleva la estación a la que entras.
        for k in 0..<(n - 1) where roxzone[k] && esEstacion[k + 1] { out[k].estacion = out[k + 1].estacion }
        return out
    }

    /// La estación de cada pieza DENTRO de su ronda cuando la ronda mezcla Run y
    /// estaciones: el Run no es estación. `nil` en el Run y en la Roxzone.
    static func estacionesDeRonda(corre: [Bool], roxzone: [Bool]) -> [Contador?] {
        let esEstacion = zip(corre, roxzone).map { !$0 && !$1 }
        let de = esEstacion.filter { $0 }.count
        var k = 0
        return esEstacion.map { es in
            guard es else { return nil }
            k += 1
            return Contador(n: k, de: de)
        }
    }

    /// El sentido de la Roxzone `k`: de salida si lo siguiente es correr (o nada).
    static func sentidoRoxzone(_ k: Int, corre: [Bool]) -> SentidoRoxzone {
        (k + 1 >= corre.count || corre[k + 1]) ? .salida : .entrada
    }

    // MARK: - El adaptador: el bloque continuo multi-máquina

    /// UN BLOQUE CONTINUO SON N TRAMOS (I2). Pasos seguidos que son, cada uno, el
    /// único paso de un segmento continuo del mismo bloque: «tramo k/N». El
    /// nombre en pantalla es el de la máquina en el box («Remo», «Ski», «Bici») y
    /// la mide su monitor (su métrica manda, §4).
    /// `continuo(s)`: ¿el segmento `s` es una pieza continua?
    static func marcarTramosContinuos(_ pasos: inout [Paso], continuo: (Int) -> Bool) {
        func candidato(_ k: Int) -> Bool {
            let p = pasos[k]
            guard let o = p.origen, o.ventana == .segmento, !o.descanso, p.rol == .trabajo, p.fase == .principal,
                  p.posicion == nil else { return false }
            return continuo(o.segmento)
        }
        var k = 0
        while k < pasos.count {
            guard candidato(k) else { k += 1; continue }
            var fin = k
            while fin + 1 < pasos.count, candidato(fin + 1), pasos[fin + 1].bloque == pasos[k].bloque { fin += 1 }
            let n = fin - k + 1
            if n >= 2 {
                for j in k...fin {
                    pasos[j].posicion = Posicion(tramo: Contador(n: j - k + 1, de: n))
                    if let m = pasos[j].maquina {
                        pasos[j].nombre = nombreMaquinaCorto(m)
                        // Lo cuenta el monitor aunque la pieza vaya por tiempo: su /500 (/1000) sale en la rejilla.
                        pasos[j].medida.mide = .ergo
                    }
                }
            }
            k = fin + 1
        }
    }
}
