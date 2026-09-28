import Foundation

// LA TAREA DEL WOD EN PALABRAS — funciones PURAS sobre `Paso.wod` (P12, M5;
// espejo de `kit-reloj/tarea.ts`). Notación de pizarra, en un sitio, y la
// puntuación del AMRAP que se dice en la campana (rondas + reps).

extension Vivo {

    private static func kgTarea(_ t: Tarea) -> String? {
        guard let c = t.carga else { return nil }
        let n = c.implementos.map { "\($0) × " } ?? ""
        return "\(n)\(num(c.kg)) kg"
    }

    /// La carga o su ausencia declarada: «9 kg», «peso corporal», o nada.
    static func cargaTarea(_ t: Tarea) -> String? {
        kgTarea(t) ?? (t.corporal == true ? "peso corporal" : nil)
    }

    /// «6 Bench Press · 60 kg», «500 m Row», «Row · todo el minuto».
    static func textoTarea(_ t: Tarea, ventanaS: Double? = nil) -> String {
        guard let d = t.dosis, d.tipo != .abierta else {
            let todo = ventanaS == 60 ? "todo el minuto" : "todo el intervalo"
            return ventanaS != nil ? "\(t.nombre) · \(todo)" : t.nombre
        }
        let pr = d.tipo == .reps ? num(d.prescrito ?? 0) : fmtPrescrito(d)
        return ["\(pr) \(t.nombre)", kgTarea(t)].compactMap { $0 }.joined(separator: " · ")
    }

    /// Lo mismo, en corto para «Luego ·»: la ventana entera es su duración («Row · 1′»).
    static func textoTareaCorto(_ t: Tarea, ventanaS: Double? = nil) -> String {
        if t.dosis == nil || t.dosis?.tipo == .abierta, let v = ventanaS {
            return "\(t.nombre)\(t.corre == true ? " en cinta" : "") · \(fmtDuracion(v))"
        }
        return textoTarea(t)
    }

    /// La dosis sin el nombre: «6 reps · 60 kg», «500 m»; `nil` si es la ventana entera.
    static func dosisTarea(_ t: Tarea) -> String? {
        guard let d = t.dosis, d.tipo != .abierta else { return nil }
        return [fmtPrescrito(d), cargaTarea(t)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Lo que una tarea cuenta en la puntuación de una ronda a medias.
    static func repsDeTarea(_ t: Tarea) -> Int {
        guard let d = t.dosis, d.tipo != .abierta, d.tipo != .tiempo else { return 0 }
        if d.tipo == .distancia { return 1 }
        return Int((d.prescrito ?? 0).rounded())
    }

    /// Reps de una ronda entera del AMRAP (12 + 10 + 8 = 30).
    static func repsPorRonda(_ tareas: [Tarea]) -> Int { tareas.reduce(0) { $0 + repsDeTarea($1) } }

    // MARK: - La puntuación del AMRAP, dicha en la campana

    struct Dial: Equatable {
        var rondas: Int
        /// Reps sueltas (con rondas) o reps totales; `nil` = sin declarar, nunca 0.
        var reps: Int?
    }

    /// Un paso de corona sobre la puntuación. Con rondas, las reps sueltas llevan.
    static func girarDial(_ d: Dial, _ mas: Int, porRonda: Int) -> Dial {
        var rondas = d.rondas
        var reps: Int
        if let r = d.reps { reps = r + mas } else { reps = mas > 0 ? 1 : 0 }
        if porRonda > 0, reps >= porRonda {
            rondas += 1
            reps -= porRonda
        } else if porRonda > 0, reps < 0, rondas > 0 {
            rondas -= 1
            reps += porRonda
        }
        return Dial(rondas: rondas, reps: Swift.max(0, reps))
    }

    enum CampoPuntuacion: String, Equatable { case rondas, reps }

    /// La puntuación tocada en el móvil: el dato enfocado se mueve `delta` de golpe.
    static func girarPuntuacion(_ d: Dial, campo: CampoPuntuacion, delta: Int, porRonda: Int) -> Dial {
        if campo == .rondas { return Dial(rondas: Swift.max(0, d.rondas + delta), reps: d.reps) }
        var r = d
        for _ in 0..<abs(delta) { r = girarDial(r, delta > 0 ? 1 : -1, porRonda: porRonda) }
        return r
    }

    /// 18 reps de una ronda 12/10/8 → «12 Wall Ball + 6 KB Swing».
    static func desgloseReps(_ tareas: [Tarea], _ reps: Int) -> String {
        var partes: [String] = []
        var resto = reps
        for t in tareas {
            if resto <= 0 { break }
            let cuenta = repsDeTarea(t)
            let n = Swift.min(resto, cuenta)
            partes.append(t.dosis?.tipo == .distancia ? t.nombre : "\(n) \(t.nombre)")
            resto -= n
        }
        return partes.joined(separator: " + ")
    }
}
