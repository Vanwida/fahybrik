import Foundation

// DEATH BY — funciones PURAS (espejo de `kit-reloj/deathby.ts`).
// La pregunta de la familia: ¿cuántas reps este minuto? El héroe son las reps
// de ESTE minuto, el trabajo es lo que queda del minuto, y el WOD acaba cuando
// el reloj te caza.

extension Vivo {

    /// Sin tope del coach, cuántas ventanas se generan. Mecanismo.
    static let deathByVentanasDefecto = 20

    struct InfoDeathBy: Equatable {
        var tarea: Tarea
        var inicio: Int
        var incremento: Int
        var ventanaS: Double
        var tope: Int?
    }

    static func deathByDe(_ p: Paso?) -> InfoDeathBy? {
        guard case let .deathby(tarea, inicio, incremento, ventanaS, tope)? = p?.wod else { return nil }
        return InfoDeathBy(tarea: tarea, inicio: inicio, incremento: incremento, ventanaS: ventanaS, tope: tope)
    }

    /// Las reps (o cal) que tocan en la ventana `n` (1-based).
    static func repsDelMinuto(inicio: Int, incremento: Int, _ n: Int) -> Int { inicio + incremento * (n - 1) }

    struct EscaleraDeathBy: Equatable {
        var inicio: Int
        var incremento: Int
        var ventanaS: Double
        var tope: Int?
    }

    /// LOS PASOS DE UN DEATH BY: una ventana por minuto con la tarea resuelta.
    static func minutosDeathBy(_ tarea: Tarea, _ e: EscaleraDeathBy, id: (Int) -> String, bloque: Int = 0, origen: ((Int) -> Origen)? = nil) -> [Paso] {
        let n = e.tope ?? deathByVentanasDefecto
        let tipo: TipoMedida = tarea.dosis?.tipo == .cal ? .cal : .reps
        let mide = tarea.dosis?.mide ?? tarea.mide
        return (0..<n).map { k in
            let dosis = Medida(tipo: tipo, prescrito: Double(repsDelMinuto(inicio: e.inicio, incremento: e.incremento, k + 1)), mide: mide)
            var t = tarea
            t.dosis = dosis
            return Paso(id: id(k), clase: .emom, rol: .trabajo, fase: .principal,
                        medida: Medida(tipo: .tiempo, prescrito: e.ventanaS, mide: .reloj),
                        objetivos: [], posicion: Posicion(serie: Contador(n: k + 1, de: n)),
                        nombre: tarea.nombre, carga: tarea.carga, cierre: .medida, bloque: bloque,
                        wod: .deathby(tarea: t, inicio: e.inicio, incremento: e.incremento, ventanaS: e.ventanaS, tope: e.tope),
                        origen: origen?(k))
        }
    }

    /// «7 Burpee» / «14 cal» de este minuto, con la carga en la etiqueta.
    static func heroeDeathBy(_ p: Paso, hechaEn: Double? = nil) -> HeroeVista? {
        guard let w = deathByDe(p) else { return nil }
        let n = p.posicion?.serie?.n ?? 1
        let reps = w.tarea.dosis?.prescrito.map { Int($0) } ?? repsDelMinuto(inicio: w.inicio, incremento: w.incremento, n)
        let unidad = w.tarea.dosis?.tipo == .cal ? "cal \(w.tarea.nombre)" : w.tarea.nombre
        let carga = w.tarea.carga.map { "\($0.implementos.map { "\($0) × " } ?? "")\(num($0.kg)) kg" }
        let etiqueta = hechaEn.map { "hecho en \(fmtReloj($0)) · respiro" } ?? ["este minuto", carga].compactMap { $0 }.joined(separator: " · ")
        return HeroeVista(clase: .falta, texto: String(reps), unidad: unidad, etiqueta: etiqueta)
    }

    /// «Minuto 7» (abierto) o «Minuto 7/20» (con tope del coach).
    static func posicionDeathBy(_ p: Paso) -> [String]? {
        guard let w = deathByDe(p) else { return nil }
        let n = p.posicion?.serie?.n ?? 1
        return [w.tope.map { "Minuto \(n)/\($0)" } ?? "Minuto \(n)"]
    }

    /// «Death by · +1 cada 1′», «Death by · 10 y +2 cada 1′ · hasta 15».
    static func formatoDeathBy(_ p: Paso, nombres: NombresFormato = nombresFormatoDefecto) -> String? {
        guard let w = deathByDe(p) else { return nil }
        let escalera = w.inicio == w.incremento ? "+\(w.incremento) cada \(fmtDuracion(w.ventanaS))" : "\(w.inicio) y +\(w.incremento) cada \(fmtDuracion(w.ventanaS))"
        return [nombres.deathby, escalera, w.tope.map { "hasta \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }

    /// Lo que viene: «Minuto 8 · 8 Burpee».
    static func vieneDeathBy(_ p: Paso) -> String? {
        guard let w = deathByDe(p) else { return nil }
        let n = p.posicion?.serie?.n ?? 1
        let reps = w.tarea.dosis?.prescrito.map { Int($0) } ?? repsDelMinuto(inicio: w.inicio, incremento: w.incremento, n)
        return "Minuto \(n) · \(reps) \(w.tarea.dosis?.tipo == .cal ? "cal " : "")\(w.tarea.nombre)"
    }

    /// El GO: «Minuto 7. 7 burpees.» / «Minuto 3. 14 calorías de remo.»
    static func vozDeathBy(_ p: Paso) -> String? {
        guard let w = deathByDe(p) else { return nil }
        let n = p.posicion?.serie?.n ?? 1
        let reps = w.tarea.dosis?.prescrito.map { Int($0) } ?? repsDelMinuto(inicio: w.inicio, incremento: w.incremento, n)
        let que = w.tarea.dosis?.tipo == .cal ? "\(reps) calorías de \(w.tarea.nombre.lowercased())" : "\(reps) \(w.tarea.nombre)"
        return "Minuto \(n). \(que)."
    }

    /// La fila de la Estructura: «Death by Burpee · 1 + 1 cada 1′ · hasta 20».
    static func filaDeathBy(_ p: Paso) -> (linea: String, detalle: String)? {
        guard let w = deathByDe(p) else { return nil }
        let carga = w.tarea.carga.map { " · \(num($0.kg)) kg" } ?? ""
        return ("\(nombresFormatoDefecto.deathby) \(w.tarea.nombre)\(carga)",
                ["\(w.inicio) + \(w.incremento) cada \(fmtDuracion(w.ventanaS))", w.tope.map { "hasta \($0)" } ?? "hasta que el reloj te cace"].joined(separator: " · "))
    }

    /// ¿El reloj te ha cazado? Un minuto cerrado sin marcar la tarea es el último.
    static func cazadoEn(_ pasos: [Paso], iCerrado: Int, hechas: [String: Double]) -> Bool {
        guard iCerrado >= 0, iCerrado < pasos.count, deathByDe(pasos[iCerrado]) != nil else { return false }
        return hechas[pasos[iCerrado].id] == nil
    }

    /// «9 minutos completos · te cazó el 10» (o «hasta el tope»).
    static func resultadoDeathBy(completos: Int, tope: Int?) -> String {
        if let tope, completos >= tope { return "\(completos) minutos completos · hasta el tope" }
        return "\(completos) \(completos == 1 ? "minuto completo" : "minutos completos") · te cazó el \(completos + 1)"
    }
}
