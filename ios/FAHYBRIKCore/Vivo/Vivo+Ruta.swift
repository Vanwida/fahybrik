import Foundation

// LA RUTA DE UN CIRCUITO y LO DE ALREDEDOR DEL PASO — funciones PURAS (P10;
// espejo de `kit-reloj/ruta.ts` y `kit-reloj/alrededor.ts`).

extension Vivo {

    enum EstadoRuta: String, Equatable { case hecho, ahora, pendiente }

    enum FilaRuta: Equatable {
        case ronda(n: Int, de: Int)
        case paso(i: Int, paso: Paso, estado: EstadoRuta, parcial: Parcial?, suelta: Bool)
    }

    struct OpcionesRuta: Equatable {
        var desde: Int = 0
        var cabecerasDeRonda: Bool = false
        enum Sueltas: Equatable { case ahora, pasadas }
        var sueltas: Sueltas = .ahora
    }

    /// ¿Está en la lista del coach? Un tramo de carrera, una estación o un AMRAP de trabajo.
    static func enRuta(_ p: Paso) -> Bool {
        (p.clase == .carrera || p.clase == .estacion || p.clase == .amrap) && p.rol == .trabajo
    }

    /// El nombre de un paso en la ruta. En HYROX los runs se cuentan («Run 4»).
    static func nombreEnRuta(_ p: Paso, runsNumerados: Bool) -> String {
        if p.roxzone != nil { return nombreClase(.roxzone) }
        if case .puntuacion = p.wod { return "Puntuación" }
        if p.rol == .descanso || p.rol == .recuperacion { return nombreClase(p.clase) }
        let nombre = p.nombre ?? nombreClase(p.clase)
        if p.clase != .carrera { return nombre }
        if runsNumerados, let r = p.posicion?.ronda { return "\(nombre) \(r.n)" }
        return "\(nombre) \(fmtPrescrito(p.medida))"
    }

    /// LA RUTA según el estado del motor.
    static func rutaDe(_ pasos: [Paso], i: Int, parciales: [Parcial], terminado: Bool = false, _ o: OpcionesRuta = OpcionesRuta()) -> [FilaRuta] {
        var hechos: [Int: Parcial] = [:]
        for x in parciales { hechos[x.i] = x }
        var filas: [FilaRuta] = []
        var ronda: Int? = nil
        for (j, p) in pasos.enumerated() where j >= o.desde {
            let parcial = hechos[j]
            let ahora = j == i && !terminado
            let estado: EstadoRuta = parcial != nil ? .hecho : ahora ? .ahora : .pendiente
            if !enRuta(p) {
                if ahora || (o.sueltas == .pasadas && parcial != nil) {
                    filas.append(.paso(i: j, paso: p, estado: estado, parcial: parcial, suelta: true))
                }
                continue
            }
            if o.cabecerasDeRonda, let r = p.posicion?.ronda, r.n != ronda {
                ronda = r.n
                filas.append(.ronda(n: r.n, de: r.de))
            }
            filas.append(.paso(i: j, paso: p, estado: estado, parcial: parcial, suelta: false))
        }
        return filas
    }

    /// La Roxzone sumada: lo cerrado más lo de ahora. `nil` si el plan no lleva Roxzone.
    static func roxzoneDe(_ pasos: [Paso], i: Int, t: Double, parciales: [Parcial], terminado: Bool = false) -> Double? {
        guard pasos.contains(where: { $0.clase == .roxzone }) else { return nil }
        let cerrada = parciales.filter { $0.i < pasos.count && pasos[$0.i].clase == .roxzone }.reduce(0) { $0 + $1.segundos }
        let ahora = (i < pasos.count && pasos[i].clase == .roxzone && !terminado) ? t : 0
        return cerrada + ahora
    }

    /// Lo que dice un parcial medido en metros: el /km de un tramo corrido (salvo
    /// un km justo) o el /500 (/1000 en la bici) de la máquina.
    static func ritmoDeParcial(_ p: Paso, _ x: Parcial) -> String? {
        guard let m = x.metros, m > 50, x.segundos > 0 else { return nil }
        if p.medida.mide == .ergo { return "\(fmtSplit(x.segundos * 500 / m, p.maquina)) \(unidadSplit(p.maquina))" }
        if m == 1000 { return nil }
        return "\(fmtRitmo(x.segundos / (m / 1000))) /km"
    }

    // MARK: - Lo de alrededor (la lista ±1 del chipper)

    struct AlrededorVista: Equatable {
        var anterior: (paso: Paso, segundos: Double?)?
        var siguiente: Paso?
        var masAtras: Int
        var masAdelante: Int
        static func == (a: AlrededorVista, b: AlrededorVista) -> Bool {
            a.anterior?.paso == b.anterior?.paso && a.anterior?.segundos == b.anterior?.segundos
                && a.siguiente == b.siguiente && a.masAtras == b.masAtras && a.masAdelante == b.masAdelante
        }
    }

    /// La ventana ±1 alrededor del paso `i`.
    static func alrededorDe(_ pasos: [Paso], _ i: Int, _ parciales: [Parcial]) -> AlrededorVista {
        func trabajo(_ j: Int) -> Bool { j >= 0 && j < pasos.count && pasos[j].rol == .trabajo }
        var iAnt = i - 1
        while iAnt >= 0, !trabajo(iAnt) { iAnt -= 1 }
        var iSig = i + 1
        while iSig < pasos.count, !trabajo(iSig) { iSig += 1 }
        let anterior: (paso: Paso, segundos: Double?)? = iAnt >= 0 ? (pasos[iAnt], parciales.first { $0.i == iAnt }?.segundos) : nil
        let siguiente = iSig < pasos.count ? pasos[iSig] : nil
        let masAtras = iAnt > 0 ? pasos[0..<iAnt].filter { $0.rol == .trabajo }.count : 0
        let masAdelante = siguiente != nil ? pasos[(iSig + 1)...].filter { $0.rol == .trabajo }.count : 0
        return AlrededorVista(anterior: anterior, siguiente: siguiente, masAtras: masAtras, masAdelante: masAdelante)
    }

    /// Una estación en una línea: «40 Wall Ball · 9 kg», «30 cal Row», «Run · 800 m».
    static func textoEstacion(_ p: Paso, conCarga: Bool = true) -> String {
        switch p.wod {
        case let .fortime(tarea?, _):
            var t = tarea
            if !conCarga { t.carga = nil }
            return textoTarea(t)
        case let .emom(tarea, _, _, ventanaS):
            var t = tarea
            if !conCarga { t.carga = nil }
            return textoTarea(t, ventanaS: ventanaS)
        default:
            var q = p
            if !conCarga { q.carga = nil }
            return textoPasoCorto(q)
        }
    }
}
