import Foundation

// LA SESIÓN COMO EJERCICIOS — la hoja del coach agrupada por ejercicio, y lo que se
// dice de ella en la muñeca: «Viene:», «Luego ·», la pista de la corona, la página
// Ejercicios y los Datos de fuerza (espejo de `screens/reloj-fuerza/modelo.ts`,
// `textos.ts` y `paginas.tsx`). Funciones PURAS de (pasos, estado, lo declarado):
// la vista pinta lo que sale de aquí y no decide nada.
//
// Lo que es dato y no constante (HARD RULE Nº0): `pasoKg` y `vaciaKg` de la ficha (del
// gimnasio), la RM y la última carga (del atleta), «Colócate» (`colocateSDefecto`).

extension Vivo {

    // MARK: - La hoja del coach como ejercicios

    struct Ejercicio: Equatable {
        var clave: String
        var nombre: String
        var slot: String?
        var bloque: Int
        /// Índices de los pasos de trabajo del ejercicio, aproximaciones incluidas.
        var pasos: [Int]
        /// Series de trabajo (sin aproximaciones).
        var series: Int
    }

    private static func claveDeEjercicio(_ p: Paso) -> String? {
        if let f = p.fuerza { return f.ejercicio }
        if p.rol != .trabajo { return nil }
        return "\(p.bloque ?? 0)-\(p.nombre ?? p.clase.rawValue)"
    }

    /// Los ejercicios de la sesión, en el orden de la hoja del coach.
    static func ejerciciosDe(_ pasos: [Paso]) -> [Ejercicio] {
        var out: [Ejercicio] = []
        for (i, p) in pasos.enumerated() {
            guard let clave = claveDeEjercicio(p) else { continue }
            var k = out.firstIndex { $0.clave == clave }
            if k == nil {
                out.append(Ejercicio(clave: clave, nombre: p.nombre ?? nombreClase(.movilidad), slot: p.posicion?.slot, bloque: p.bloque ?? 0, pasos: [], series: 0))
                k = out.count - 1
            }
            guard let k else { continue }
            out[k].pasos.append(i)
            if !(p.fuerza?.aproximacion ?? false) { out[k].series += 1 }
        }
        return out
    }

    /// El ejercicio al que pertenece el paso `i`, si es de trabajo.
    static func ejercicioDe(_ pasos: [Paso], _ i: Int) -> Ejercicio? {
        guard pasos.indices.contains(i), let clave = claveDeEjercicio(pasos[i]) else { return nil }
        return ejerciciosDe(pasos).first { $0.clave == clave }
    }

    /// El siguiente paso de trabajo desde `desde` (incluido), saltando descansos y «Colócate».
    static func siguienteTrabajo(_ pasos: [Paso], desde: Int) -> Int? {
        guard desde < pasos.count else { return nil }
        return (Swift.max(0, desde)..<pasos.count).first { pasos[$0].rol == .trabajo }
    }

    /// El último paso de trabajo antes de `i`.
    static func anteriorTrabajo(_ pasos: [Paso], _ i: Int) -> Int? {
        guard i > 0 else { return nil }
        return (0..<Swift.min(i, pasos.count)).last { pasos[$0].rol == .trabajo }
    }

    /// ¿Es `j` la primera serie de su ejercicio (lo que abre un ejercicio nuevo)?
    static func abreEjercicio(_ pasos: [Paso], _ j: Int) -> Bool {
        guard pasos.indices.contains(j), let clave = claveDeEjercicio(pasos[j]) else { return false }
        return !pasos.prefix(j).contains { claveDeEjercicio($0) == clave }
    }

    // MARK: - Lo que se dice: «Luego ·», «Viene:», la corona

    /// «A2 · Box Jump»: el hueco de la superserie delante del nombre.
    static func conSlot(_ p: Paso) -> String {
        p.posicion?.slot.map { "\($0) · \(p.nombre ?? "")" } ?? (p.nombre ?? "")
    }

    /// «A2 Box Jump»: para «Luego ·», en la fila de abajo.
    private static func cortoDeEjercicio(_ p: Paso) -> String {
        [p.posicion?.slot, p.nombre].compactMap { $0 }.joined(separator: " ")
    }

    /// La dosis de un paso que no es de fuerza desde `j`: LO QUE FALTA del ejercicio («8 × 250 m» al
    /// abrirlo, «2 × 250 m» cuando ya solo quedan dos), nunca el total de la hoja repetido en cada descanso.
    static func dosisRestante(_ pasos: [Paso], _ j: Int) -> String {
        let pr = fmtPrescrito(pasos[j].medida)
        let restan = ejercicioDe(pasos, j)?.pasos.filter { $0 >= j }.count ?? 1
        return restan > 1 ? "\(restan) × \(pr)" : pr
    }

    private static func cortoDeOtro(_ pasos: [Paso], _ j: Int) -> String {
        [pasos[j].nombre, dosisRestante(pasos, j)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// «Luego ·» en la cara de la serie: el compañero de superserie si va sin descanso; el ejercicio nuevo
    /// si esta es su última serie; si no, el descanso.
    static func textoLuego(_ pasos: [Paso], _ i: Int) -> String? {
        var k = i + 1
        if k < pasos.count, pasos[k].rol == .transicion { k += 1 }
        guard k < pasos.count else { return nil }
        let q = pasos[k]
        // La última fila es la más estrecha (esquinas): el nombre sin la dosis, que ya dice el descanso.
        if q.rol == .trabajo { return esFuerza(q) ? cortoDeEjercicio(q) : cortoDeOtro(pasos, k) }
        if let j = siguienteTrabajo(pasos, desde: k + 1), abreEjercicio(pasos, j) {
            return esFuerza(pasos[j]) ? cortoDeEjercicio(pasos[j]) : (pasos[j].nombre ?? cortoDeOtro(pasos, j))
        }
        return "descanso \(fmtDuracion(q.medida.prescrito ?? 0))"
    }

    /// Lo que viene, en dos partes: qué («B1 · Deadlift», «Serie 3/4») y su dosis. Va en una línea si cabe;
    /// si no, en dos (qué arriba, la dosis debajo), nunca partida por la mitad.
    struct VieneMuneca: Equatable {
        var que: String
        var dosis: String?
        var enUna: Bool

        var alto: Double { enUna ? Fila.nota.alto : Fila.nota2.alto }
    }

    static func vieneMuneca(que: String, dosis: String?, _ m: MedidasMuneca) -> VieneMuneca {
        let texto = "Viene: \(que)\(dosis.map { " · \($0)" } ?? "")"
        let cabe = anchoTexto(texto, TipoMuneca.nota, peso: TipoMuneca.pesoNota) <= m.anchoUtil * TipoMuneca.holguraEstima
        return VieneMuneca(que: que, dosis: dosis, enUna: cabe)
    }

    /// «Viene:» en el descanso `i`. Un ejercicio nuevo se anuncia entero («B1 · Deadlift» + «4 × 8 · RIR 3»);
    /// la serie siguiente del mismo, con su carga (la arrastrada si el atleta declaró otra).
    static func vieneDe(_ pasos: [Paso], _ i: Int, _ registro: Registro, _ m: MedidasMuneca) -> VieneMuneca? {
        guard let j = siguienteTrabajo(pasos, desde: i + 1) else { return nil }
        let q = pasos[j]
        guard esFuerza(q), let f = q.fuerza else {
            return vieneMuneca(que: q.nombre ?? fmtPrescrito(q.medida), dosis: q.nombre != nil ? dosisRestante(pasos, j) : nil, m)
        }
        if abreEjercicio(pasos, j), let e = ejercicioDe(pasos, j) {
            return vieneMuneca(que: conSlot(q), dosis: dosisEjercicio(q, series: e.series), m)
        }
        let dosis = dosisSerie(q, arrastrada: cargaArrastrada(pasos, j, registro))
        let antes = anteriorTrabajo(pasos, i).map { pasos[$0] }
        guard let a = antes?.fuerza, a.ejercicio == f.ejercicio else { return vieneMuneca(que: conSlot(q), dosis: dosis, m) }
        // Tras la aproximación, el eje del esfuerzo sale por primera vez: se dice.
        let conEsfuerzo = a.aproximacion ? f.esfuerzo.map { " · \(textoEsfuerzo($0))" } ?? "" : ""
        return vieneMuneca(que: quienSerie(q), dosis: "\(dosis)\(conEsfuerzo)", m)
    }

    /// Con la corona en un dato: qué gira y, en la carga, a qué series llega la cascada.
    static func textoPistaCorona(_ pasos: [Paso], _ j: Int, _ campo: CampoAnotar, _ registro: Registro) -> String {
        guard pasos.indices.contains(j) else { return "gira la corona" }
        let p = pasos[j]
        guard campo == .kg, esFuerza(p) else {
            let nombre = campo == .reps ? "reps" : (p.fuerza?.esfuerzo?.eje == .rpe ? "RPE" : "RIR")
            return "gira la corona · \(nombre)"
        }
        let siguen = seriesQueHeredan(pasos, j, registro)
        if siguen.isEmpty { return "gira la corona · kg" }
        if siguen.count == 1 { return "también en la serie \(siguen[0])" }
        return "también en las series \(siguen[0])–\(siguen[siguen.count - 1])"
    }

    // MARK: - La página Ejercicios

    enum EstadoEjercicio: Equatable { case hecho, ahora, pendiente }
    enum MarcaSerie: Equatable { case hecha, propuesta, ahora, luego }

    enum LineaEjercicio: Equatable {
        case ejercicio(slot: String?, nombre: String, sinConfirmar: Bool, estado: EstadoEjercicio, ahora: Bool)
        case serie(n: Int?, texto: String, marca: MarcaSerie, ahora: Bool)

        var alto: Double {
            switch self {
            case .ejercicio: return AltoEjercicios.ejercicio
            case .serie: return AltoEjercicios.serie
            }
        }
        var esAhora: Bool {
            switch self {
            case let .ejercicio(_, _, _, _, ahora), let .serie(_, _, _, ahora): return ahora
            }
        }
        var esEjercicio: Bool {
            if case .ejercicio = self { return true }
            return false
        }
    }

    /// El alto de cada línea de la página Ejercicios y lo que se lleva el título (contexto + aire).
    enum AltoEjercicios {
        static let ejercicio: Double = 24
        static let serie: Double = 21
        static let titulo: Double = 26
    }

    struct PaginaEjerciciosMuneca: Equatable {
        var titulo: [String]
        var lineas: [LineaEjercicio]
    }

    private static func estadoDeEjercicio(_ e: Ejercicio, _ i: Int) -> EstadoEjercicio {
        if e.pasos.allSatisfy({ $0 < i }) { return .hecho }
        if e.pasos.contains(where: { $0 <= i }) { return .ahora }
        return .pendiente
    }

    /// Todas las líneas de la hoja: se abre serie a serie el ejercicio de «ahora» (en un descanso, el que se
    /// acaba de hacer) y, en superserie, sus compañeros de ronda. Lo hecho, cerrado; lo que falta, con su dosis.
    static func lineasDeEjercicios(_ e: EstadoVivo, _ a: AnotarMuneca) -> [LineaEjercicio] {
        let pasos = e.pasos
        let i = e.i
        let ref = pasos[i].rol == .trabajo ? i : (anteriorTrabajo(pasos, i) ?? siguienteTrabajo(pasos, desde: i) ?? i)
        let pRef = pasos[ref]
        var out: [LineaEjercicio] = []
        for ej in ejerciciosDe(pasos) {
            let estado = estadoDeEjercicio(ej, i)
            let primero = pasos[ej.pasos[0]]
            let trabajo = ej.pasos.filter { !(pasos[$0].fuerza?.aproximacion ?? false) }
            let anot: (Int) -> Anotacion? = { anotacionDe(pasos, $0, a.registro, medida: a.medidas[pasos[$0].id]) }
            let sinConfirmar = trabajo.contains { j in
                guard j < i, let x = anot(j) else { return false }
                return pasos[j].medida.tipo == .reps && pendiente(x)
            }
            let abierto = esFuerza(primero) && (ej.pasos.contains(ref)
                || (ej.slot != nil && pRef.posicion?.slot != nil && ej.bloque == (pRef.bloque ?? 0) && estado != .pendiente))
            out.append(.ejercicio(slot: ej.slot, nombre: ej.nombre, sinConfirmar: sinConfirmar && !abierto, estado: estado, ahora: ej.pasos.contains(ref)))
            if estado == .pendiente, !abierto {
                let dosis = esFuerza(primero)
                    ? dosisEjercicio(primero, series: ej.series)
                    : [ej.series > 1 ? "\(ej.series) ×" : "", fmtPrescrito(primero.medida)].filter { !$0.isEmpty }.joined(separator: " ")
                out.append(.serie(n: nil, texto: dosis, marca: .luego, ahora: false))
                continue
            }
            guard abierto else { continue }
            for j in trabajo {
                let q = pasos[j]
                guard let f = q.fuerza else { continue }
                let n = q.posicion?.serie?.n ?? 0
                if j < i {
                    if q.medida.tipo == .tiempo {
                        out.append(.serie(n: n, texto: fmtDuracion((q.medida.prescrito ?? 0).rounded()), marca: .hecha, ahora: false))
                        continue
                    }
                    guard let x = anot(j) else { continue }
                    out.append(.serie(n: n, texto: textoAnotacion(x, f, conEsfuerzo: false), marca: pendiente(x) ? .propuesta : .hecha, ahora: false))
                } else {
                    let ahora = j == i
                    out.append(.serie(n: n, texto: dosisSerie(q, arrastrada: cargaArrastrada(pasos, j, a.registro)), marca: ahora ? .ahora : .luego, ahora: ahora))
                }
            }
        }
        return out
    }

    /// La ventana que cabe: desde un poco antes de «ahora». Nunca scroll dentro de una página de la corona.
    static func ventanaDeEjercicios(_ ls: [LineaEjercicio], alto: Double) -> [LineaEjercicio] {
        let kEj = Swift.max(0, ls.firstIndex { $0.esEjercicio && $0.esAhora } ?? 0)
        let kSerie = ls.firstIndex { !$0.esEjercicio && $0.esAhora }
        let foco = kSerie ?? kEj
        func caben(_ d: Int) -> Int {
            var h = 0.0
            var n = 0
            var x = d
            while x < ls.count, h + ls[x].alto <= alto { h += ls[x].alto; n += 1; x += 1 }
            return n
        }
        // Arranca un ejercicio antes del de «ahora»; si «ahora» se queda fuera por abajo, baja.
        var desde = Swift.max(0, kEj - 1)
        while desde > 0, !ls[desde].esEjercicio { desde -= 1 }
        while desde < foco, desde + caben(desde) <= foco + 1 { desde += 1 }
        return Array(ls.dropFirst(desde).prefix(caben(desde)))
    }

    static func paginaEjercicios(_ e: EstadoVivo, _ a: AnotarMuneca, _ m: MedidasMuneca) -> PaginaEjerciciosMuneca {
        PaginaEjerciciosMuneca(titulo: ["Ejercicios"],
                               lineas: ventanaDeEjercicios(lineasDeEjercicios(e, a), alto: m.altoUtil - AltoEjercicios.titulo))
    }

    // MARK: - Los Datos de fuerza

    /// El volumen de lo hecho (reps × kg) y cuántas series siguen sin confirmar.
    static func volumenDeFuerza(_ e: EstadoVivo, _ a: AnotarMuneca) -> (kg: Double, sinConfirmar: Int, hechas: Int, total: Int) {
        var kg = 0.0
        var sinConfirmar = 0
        var hechas = 0
        var total = 0
        for (j, p) in e.pasos.enumerated() {
            guard p.rol == .trabajo, p.fase == .principal, p.posicion?.serie != nil || p.posicion?.tramo != nil else { continue }
            total += 1
            guard j < e.i else { continue }
            hechas += 1
            guard esFuerza(p), p.medida.tipo == .reps, let x = anotacionDe(e.pasos, j, a.registro, medida: a.medidas[p.id]) else { continue }
            if pendiente(x) { sinConfirmar += 1 }
            if let k = x.kg?.valor, let r = x.reps.valor { kg += k * r }
        }
        return (kg, sinConfirmar, hechas, total)
    }

    /// 4280 → «4.280»: miles con punto, como se escriben en España.
    static func fmtMiles(_ n: Double) -> String {
        let s = String(Int(n.rounded()))
        var out = ""
        for (k, c) in s.reversed().enumerated() {
            if k > 0, k % 3 == 0 { out.append(".") }
            out.append(c)
        }
        return String(out.reversed())
    }

    /// La página Datos de fuerza: tiempo, series hechas, volumen y el pulso con su zona; lo que siga sin
    /// confirmar se dice abajo.
    static func paginaDatosFuerza(_ e: EstadoVivo, _ a: AnotarMuneca, _ l: Lecturas, _ m: MedidasMuneca) -> PaginaDatosMuneca {
        let v = volumenDeFuerza(e, a)
        let ppm = l.viejo(.ppm) ? nil : l.ppm
        let filas = [
            FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total"),
            FilaDatoVista(valor: "\(v.hechas)/\(v.total)", unidad: "series"),
            FilaDatoVista(valor: v.kg > 0 ? fmtMiles(v.kg) : "—", unidad: "kg de volumen"),
            FilaDatoVista(valor: ppm.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm", ppm: ppm,
                          zona: (ppm != nil && e.zonas != nil) ? zonaVista(ppm!, e.zonas!) : nil, glifo: true),
        ]
        let pie = v.sinConfirmar > 0 ? notaVista("\(v.sinConfirmar) \(v.sinConfirmar == 1 ? "serie" : "series") sin confirmar", ancho: m.anchoPie) : nil
        return PaginaDatosMuneca(titulo: ["Sesión"], filas: filas, pie: pie)
    }
}
