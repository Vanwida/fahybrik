import Foundation

// LAS REGLAS DEL PINTOR — funciones PURAS de (paso, lecturas) → qué se pinta.
// Espejo función por función de `kit-reloj/reglas.ts`.
//
// Aquí vive la decisión que la auditoría encontró repartida por las vistas: qué
// número manda (P3), contra qué banda se juzga, en qué dirección y con qué
// palabra, qué falta, qué se dice en el contexto. Una vista NO decide nada de
// esto: llama a `laminaDelPaso` y pinta lo que le devuelve.

extension Vivo {

    // MARK: - Formatos — un formateador por concepto, coma española

    private static func dos(_ n: Int) -> String { n < 10 ? "0\(n)" : String(n) }

    /// 14 → «0:14»; 2246 → «37:26»; 3725 → «1:02:05».
    static func fmtReloj(_ totalS: Double) -> String {
        let s = Swift.max(0, Int(totalS.rounded()))
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        return h > 0 ? "\(h):\(dos(m)):\(dos(sec))" : "\(m):\(dos(sec))"
    }

    /// Techo de honestidad: por encima de 20:00/km un ritmo describe un GPS fijando.
    static let ritmoTechoS: Double = 20 * 60

    /// s/km → «3:52». Sin dato o fuera de lo creíble → «—».
    static func fmtRitmo(_ sKm: Double?) -> String {
        guard let s = sKm, s.isFinite, s > 0, s <= ritmoTechoS else { return "—" }
        return fmtReloj(s)
    }

    // MARK: - La máquina: cómo se llama en el box y en qué distancia se lee su ritmo

    /// Copy de box: nunca PM5, FTMS ni BLE.
    static let nombreMaquinaTabla: [Maquina.Tipo: String] = [.remo: "el remo", .ski: "el ski", .bici: "la bici", .cinta: "la cinta"]

    static func nombreMaquina(_ m: Maquina?) -> String? {
        guard let m else { return nil }
        return nombreMaquinaTabla[m.tipo]
    }

    /// «Remo», «Bici»: para un chip, sin artículo.
    static func nombreMaquinaCorto(_ m: Maquina?) -> String? {
        guard let n = nombreMaquina(m) else { return nil }
        let sin = n.hasPrefix("el ") ? String(n.dropFirst(3)) : n.hasPrefix("la ") ? String(n.dropFirst(3)) : n
        return sin.prefix(1).uppercased() + sin.dropFirst()
    }

    /// «del remo», «de la bici».
    static func deMaquina(_ m: Maquina?) -> String? {
        guard let n = nombreMaquina(m) else { return nil }
        return n.hasPrefix("el ") ? "del \(n.dropFirst(3))" : "de \(n)"
    }

    static func esBici(_ m: Maquina?) -> Bool { m?.tipo == .bici }

    static func unidadSplit(_ m: Maquina?) -> String { esBici(m) ? "/1000" : "/500" }

    /// El dato viaja en s/500 m; en la bici se ENSEÑA por 1000 m.
    static func fmtSplit(_ s500: Double?, _ m: Maquina? = nil) -> String {
        guard let s = s500, s.isFinite, s > 0 else { return "—" }
        return fmtRitmo(esBici(m) ? s * 2 : s)
    }

    /// Decimal con coma: 8.5 → «8,5».
    static func num(_ n: Double) -> String {
        if n == n.rounded() { return String(Int(n.rounded())) }
        let r = (n * 10).rounded() / 10
        if r == r.rounded() { return String(Int(r.rounded())) }
        return String(format: "%.1f", r).replacingOccurrences(of: ".", with: ",")
    }

    static func num(_ n: Int) -> String { String(n) }

    /// Distancia medida: metros enteros por debajo del km, km con dos decimales encima.
    static func fmtDistancia(_ m: Double) -> (valor: String, unidad: String) {
        if m < 1000 { return (String(Swift.max(0, Int(m.rounded(.up)))), "m") }
        return (String(format: "%.2f", m / 1000).replacingOccurrences(of: ".", with: ","), "km")
    }

    /// Duración prescrita en notación de pista: «20″», «90″», «1′», «2′30″», «50′».
    static func fmtDuracion(_ sD: Double) -> String {
        let s = Int(sD.rounded())
        if s < 60 || (s <= 90 && s % 60 != 0) { return "\(s)″" }
        let m = s / 60
        let r = s % 60
        return r == 0 ? "\(m)′" : "\(m)′\(dos(r))″"
    }

    /// Lo prescrito de una medida: «1000 m», «1′», «12 reps». Espacio duro.
    static func fmtPrescrito(_ m: Medida) -> String {
        guard let p = m.prescrito, m.tipo != .abierta else { return "" }
        switch m.tipo {
        case .distancia:
            if p >= 5000, p.truncatingRemainder(dividingBy: 1000) == 0 { return "\(Int(p / 1000))\u{00A0}km" }
            return "\(num(p))\u{00A0}m"
        case .tiempo: return fmtDuracion(p)
        case .reps: return "\(num(p))\u{00A0}reps"
        case .cal: return "\(num(p))\u{00A0}cal"
        case .abierta: return ""
        }
    }

    private static func rango(_ min: Double?, _ max: Double?, _ f: (Double) -> String) -> String {
        if let min, let max { return min == max ? f(min) : "\(f(min))–\(f(max))" }
        if let max { return "máx \(f(max))" }
        if let min { return "mín \(f(min))" }
        return ""
    }

    /// Un objetivo en palabras cortas: «3:45–3:55», «Z2», «RPE 7», «máx 142 ppm».
    static func fmtObjetivo(_ o: Objetivo, _ maquina: Maquina? = nil) -> String {
        switch o.eje {
        case .ritmo: return rango(o.min, o.max) { fmtRitmo($0) }
        case .split500: return "\(rango(o.min, o.max) { fmtSplit($0, maquina) }) \(unidadSplit(maquina))"
        case .zona:
            if o.papel == .techo, let max = o.max { return "máx Z\(Int(max))" }
            return rango(o.min, o.max) { "Z\(Int($0))" }
        case .ppm: return "\(rango(o.min, o.max, num))\u{00A0}ppm"
        case .rpe: return "RPE \(rango(o.min, o.max, num))"
        case .potencia: return "\(rango(o.min, o.max, num))\u{00A0}W"
        case .pctRM: return "\(rango(o.min, o.max, num))\u{00A0}%\u{00A0}RM"
        case .kg: return "\(rango(o.min, o.max, num))\u{00A0}kg"
        case .rir: return "RIR \(rango(o.min, o.max, num))"
        case .cadencia: return "\(rango(o.min, o.max, num)) pasos/min"
        case .inclinacion: return "\(rango(o.min, o.max, num))\u{00A0}%"
        }
    }

    /// EL OBJETIVO EN UNA NOTA — la única notación: «a 3:45–3:55», «a Z2», «RPE 7»,
    /// «máx 142 ppm», «al 1 %». Sin «@».
    static func textoObjetivo(_ o: Objetivo, _ maquina: Maquina? = nil) -> String {
        if o.eje == .inclinacion { return "al \(fmtObjetivo(o))" }
        if o.papel == .techo || o.eje == .rpe || o.eje == .rir || o.eje == .kg || o.eje == .pctRM { return fmtObjetivo(o, maquina) }
        return "a \(fmtObjetivo(o, maquina))"
    }

    /// M7 · La carga del implemento: «180 kg», «2 × 32 kg».
    static func textoCargaImplemento(_ c: Carga?) -> String? {
        guard let c else { return nil }
        if let n = c.implementos, n > 1 { return "\(n) × \(num(c.kg))\u{00A0}kg" }
        return "\(num(c.kg))\u{00A0}kg"
    }

    /// La palabra de un RPE: la del coach si la trae, si no la del defecto.
    static func palabraRpe(_ o: Objetivo) -> String {
        if let p = o.palabra { return p }
        let n = Int((o.max ?? o.min ?? 0).rounded())
        return rpePalabraDefecto[n] ?? ""
    }

    // MARK: - El paso: objetivo principal, lo que falta, el contexto

    static func principal(_ p: Paso) -> Objetivo? { p.objetivos.first { $0.papel == .principal } }

    static func objetivoDe(_ p: Paso, _ papel: PapelObjetivo) -> Objetivo? { p.objetivos.first { $0.papel == papel } }

    static let clasesCorrer: Set<Clase> = [
        .calentamiento, .vueltaCalma, .rodaje, .tirada, .tempo, .series, .progresivo, .fartlek, .cuestas, .strides, .carrera, .test,
    ]

    /// ¿Es un paso de correr (hay un ritmo y un GPS o una cinta que importan)?
    static func esCarrera(_ p: Paso) -> Bool {
        clasesCorrer.contains(p.clase) || p.medida.mide == .gps || p.medida.mide == .cinta || p.entorno != nil
    }

    /// Lo que falta del paso, en la unidad de su medida. `nil` = nadie lo sabe.
    static func faltaDe(_ p: Paso, _ l: Lecturas) -> Double? {
        guard let pr = p.medida.prescrito, p.medida.tipo != .abierta else { return nil }
        if p.medida.tipo == .tiempo { return Swift.max(0, pr - l.t) }
        guard let h = l.hecho, !l.viejo(.hecho) else { return nil }
        return Swift.max(0, pr - h)
    }

    /// «Serie 3/6 · 1000 m» → las PARTES por prioridad.
    static func contextoDe(_ p: Paso) -> [String] {
        let nombre = nombreClase(p.clase)
        let o = principal(p)
        let pos = p.posicion
        if p.rol == .recuperacion {
            let modo = p.modoRecupera == .andar ? "caminando" : p.modoRecupera == .parado ? "parado" : "trote"
            return ["Recupera", modo]
        }
        if p.rol == .descanso { return [nombre] }
        var partes: [String] = []
        if let slot = pos?.slot, let n = p.nombre { partes.append("\(slot) · \(n)") }
        if let r = pos?.ronda { partes.append("Ronda \(r.n)/\(r.de)") }
        if let e = pos?.estacion { partes.append("Estación \(e.n)/\(e.de)") }
        if let t = pos?.tanda { partes.append("Tanda \(t.n)/\(t.de)") }
        if let s = pos?.serie { partes.append("\(nombre) \(s.n)/\(s.de)") }
        if let t = pos?.tramo {
            partes.append(nombre)
            partes.append("tramo \(t.n)/\(t.de)")
            return partes
        }
        if partes.isEmpty { partes.append(nombre) }
        if pos?.serie == nil, let o, o.eje == .zona || o.eje == .rpe { partes.append(fmtObjetivo(o)) }
        let pr = fmtPrescrito(p.medida)
        if !pr.isEmpty { partes.append(pr) }
        return partes
    }

    /// El paso en una línea corta, para «Luego · …» y «Viene: …».
    static func textoPasoCorto(_ p: Paso) -> String {
        let o = principal(p)
        let pr = fmtPrescrito(p.medida)
        if p.rol == .descanso { return "\(nombreClase(p.clase)) · \(pr)" }
        let nombre = p.nombre ?? nombreMaquinaCorto(p.maquina)
        let quien = nombre.map { "\($0) · " } ?? ""
        let conCarga = textoCargaImplemento(p.carga).map { " · \($0)" } ?? ""
        guard let o else { return "\(quien)\(pr)\(conCarga)" }
        let obj = o.eje == .rpe ? "RPE \(num(o.min ?? o.max ?? 0))" : fmtObjetivo(o, p.maquina)
        return "\(quien)\(pr)\(conCarga) a \(obj)"
    }

    // MARK: - Zonas del coach

    /// La zona (1..N) de un pulso con las zonas del coach.
    static func zonaDe(_ ppm: Double, _ z: ZonasCoach) -> Int {
        if let i = z.techos.firstIndex(where: { ppm <= $0 }) { return i + 1 }
        return z.techos.count
    }

    /// Suelo y techo en ppm de la zona k. Z1 recibe un suelo con el ancho de Z2.
    static func limitesZona(_ k: Int, _ z: ZonasCoach) -> (Double, Double) {
        let t = z.techos
        let hi = t[Swift.max(0, Swift.min(t.count - 1, k - 1))]
        if k > 1 { return (t[k - 2] + 1, hi) }
        let ancho = t.count > 1 ? t[1] - t[0] : 20
        return (hi - ancho, hi)
    }

    /// El rango en ppm de un objetivo de pulso (zona o ppm).
    static func rangoPpm(_ o: Objetivo, _ z: ZonasCoach?) -> (Double?, Double?) {
        if o.eje == .ppm { return (o.min, o.max) }
        guard o.eje == .zona, let z else { return (nil, nil) }
        let lo: Double? = (o.min.map { $0 > 1 } ?? false) && o.papel != .techo ? limitesZona(Int(o.min!), z).0 : nil
        let hi: Double? = o.max.map { limitesZona(Int($0), z).1 }
        return (lo, hi)
    }

    // MARK: - El veredicto — con dirección, nunca solo color (P3, P6)

    /// Ejes donde MÁS es MENOS intenso.
    static let ejesInversos: Set<EjeObjetivo> = [.ritmo, .split500]

    static func veredictoDe(_ o: Objetivo, _ valor: Double, holgura: Double = 0, zonas: ZonasCoach? = nil) -> Veredicto {
        let (lo, hi) = (o.eje == .zona || o.eje == .ppm) ? rangoPpm(o, zonas) : (o.min, o.max)
        var v: Veredicto = .dentro
        if ejesInversos.contains(o.eje) {
            if let lo, valor < lo - holgura { v = .porEncima } else if let hi, valor > hi + holgura { v = .porDebajo }
        } else {
            if let hi, valor > hi + holgura { v = .porEncima } else if let lo, valor < lo - holgura { v = .porDebajo }
        }
        let avisa: SentidoAviso = o.papel == .techo ? .soloArriba : (o.avisa ?? .ambos)
        if avisa == .soloArriba, v == .porDebajo { return .dentro }
        if avisa == .soloAbajo, v == .porEncima { return .dentro }
        return v
    }

    struct PalabraVeredicto: Equatable {
        var marca: String?
        var texto: String
    }

    /// «▲ rápido», «▼ lento», «▲ alto», «▼ bajo», «dentro».
    static func palabraVeredicto(_ eje: EjeObjetivo, _ v: Veredicto) -> PalabraVeredicto {
        if v == .dentro { return .init(marca: nil, texto: "dentro") }
        let arriba = v == .porEncima
        if ejesInversos.contains(eje) { return .init(marca: arriba ? "▲" : "▼", texto: arriba ? "rápido" : "lento") }
        if eje == .cadencia { return .init(marca: arriba ? "▲" : "▼", texto: arriba ? "alta" : "baja") }
        return .init(marca: arriba ? "▲" : "▼", texto: arriba ? "alto" : "bajo")
    }

    static func holguraDe(_ eje: EjeObjetivo, _ r: ReglasAviso) -> Double {
        switch eje {
        case .ritmo: return r.holgura.ritmo
        case .zona, .ppm: return r.holgura.ppm
        case .split500: return r.holgura.split500
        case .potencia: return r.holgura.vatios
        case .cadencia: return r.holgura.cadencia
        default: return 0
        }
    }

    private static func juzgar(_ o: Objetivo, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso) -> Veredicto? {
        guard let v = valorDeEje(o.eje, l) else { return nil }
        return veredictoDe(o, v, holgura: holguraDe(o.eje, reglas), zonas: zonas)
    }

    private static func esPulso(_ e: EjeObjetivo) -> Bool { e == .zona || e == .ppm }
    private static func mismaMagnitud(_ a: EjeObjetivo, _ b: EjeObjetivo) -> Bool { a == b || (esPulso(a) && esPulso(b)) }

    /// El veredicto del objetivo principal — el que pinta la banda. Un techo en
    /// la MISMA magnitud pone el borde alto.
    static func veredictoPrincipal(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso) -> Veredicto? {
        guard let o = principal(p) else { return nil }
        let vp = juzgar(o, l, zonas, reglas)
        guard let techo = objetivoDe(p, .techo), mismaMagnitud(o.eje, techo.eje) else { return vp }
        if juzgar(techo, l, zonas, reglas) == .porEncima { return .porEncima }
        return vp == .porEncima ? .dentro : vp
    }

    /// EL veredicto del paso (P1: uno solo, el que vibra). Un techo pasado manda.
    static func veredictoDelPaso(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso) -> Veredicto? {
        if let techo = objetivoDe(p, .techo), juzgar(techo, l, zonas, reglas) == .porEncima { return .porEncima }
        return veredictoPrincipal(p, l, zonas, reglas)
    }

    static func techoPasado(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso) -> Bool {
        guard let techo = objetivoDe(p, .techo) else { return false }
        return juzgar(techo, l, zonas, reglas) == .porEncima
    }

    /// El valor en vivo que se juzga contra un objetivo, o `nil` si no lo mide nadie.
    static func valorDeEje(_ eje: EjeObjetivo, _ l: Lecturas) -> Double? {
        switch eje {
        case .ritmo: return l.viejo(.ritmo) ? nil : l.ritmo
        case .zona, .ppm: return l.viejo(.ppm) ? nil : l.ppm
        case .split500: return l.viejo(.split500) ? nil : l.split500
        case .potencia: return l.viejo(.vatios) ? nil : l.vatios
        case .cadencia: return l.viejo(.cadencia) ? nil : l.cadencia
        default: return nil
        }
    }

    /// «Z2 · a 6 de Z3», «Z3 · a 5 de Z4», «Z4 · 3 sobre Z3», «Z5 · dentro».
    static func posicionZona(_ ppm: Double, _ o: Objetivo, _ z: ZonasCoach) -> String {
        let actual = zonaDe(ppm, z)
        let (lo, hi) = rangoPpm(o, z)
        let zMax = o.max.map { Int($0) } ?? actual
        if let hi, ppm > hi { return "Z\(actual) · \(Int(ppm - hi)) sobre Z\(zMax)" }
        if let lo, ppm < lo { return "Z\(actual) · a \(Int(lo - ppm)) de Z\(Int(o.min ?? 0))" }
        if let hi, zMax < z.techos.count { return "Z\(actual) · a \(Int(hi + 1 - ppm)) de Z\(zMax + 1)" }
        return "Z\(actual) · dentro"
    }

    /// La zona de fondo de un paso: SOLO si va a zona y hay pulso y zonas (P6).
    /// Devuelve el número de zona (el pintor le pone el color del espectro).
    static func tinteDelPaso(_ p: Paso, _ l: Lecturas, _ z: ZonasCoach?) -> Int? {
        guard let o = principal(p), o.eje == .zona || o.eje == .ppm, let z, p.rol == .trabajo else { return nil }
        guard let ppm = valorDeEje(.ppm, l) else { return nil }
        return zonaDe(ppm, z)
    }
}
