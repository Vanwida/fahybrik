import SwiftUI

// EL ESPEJO LEE LOS MISMOS GUIONES QUE EL MODO SOLITARIO.
//
// Aquí está la pieza que faltaba. El reloj corre en espejo la inmensa mayoría de
// las sesiones (el móvil es el motor y la muñeca pinta lo que le llega), así que
// mientras el espejo tuviera su propia pantalla, todo el diseño por formato vivía
// en el 10 % de los entrenos y el atleta veía una pantalla genérica en el 90 %.
//
// Lo que cambia: el cable ya no manda tres frases redactadas, manda EL TRAMO
// (`MirrorTramo`). Con eso, este fichero rellena el `Estado` que cada guion pide
// y devuelve exactamente las mismas páginas que pintaría el reloj sin móvil. Una
// pantalla por formato, no dos — y lo que se arregle en un guion se arregla en
// las dos vías a la vez.
//
// Degradación: sin tramo (un móvil viejo, o una trama previa a este cambio) cae
// en la lectura genérica de las frases de siempre. Nunca en blanco.

enum GuionDelEspejo {

    /// Las páginas de la muñeca para esta trama. `elapsed` lo tickea el reloj en
    /// local entre tramas; `bpm` es del sensor de la muñeca, no del móvil.
    static func paginas(
        _ f: MirrorStateFrame,
        bpm: Int?,
        elapsed: Double,
        avanzar: @escaping () -> Void
    ) -> [WatchPagina] {
        guard let t = f.tramo else { return generico(f, bpm: bpm, elapsed: elapsed, avanzar: avanzar) }

        // El reloj de LA ventana, no el del tramo entero: en un 4×10 `lapElapsed`
        // suma las cuatro series y sus descansos de corrido (f4c7f0e9).
        let enTramo = t.enTramoS ?? elapsed
        switch guionPara(t) {
        case .fuerza:
            return GuionFuerza.paginas(fuerza(t, bpm: bpm, elapsed: enTramo),
                                       GuionFuerza.Gestos(serieHecha: avanzar))
        case .rodaje:
            return GuionRodaje.paginas(rodaje(t, f, bpm: bpm, elapsed: enTramo))
        case .series:
            return GuionSeries.paginas(series(t, bpm: bpm, elapsed: enTramo),
                                       GuionSeries.Gestos(cerrarSerie: avanzar, empezarYa: avanzar))
        case .ninguno:
            return generico(f, bpm: bpm, elapsed: elapsed, avanzar: avanzar)
        }
    }

    // MARK: - Qué guion sirve este tramo

    private enum Cual { case fuerza, rodaje, series, ninguno }

    /// El formato NO basta: unas series de correr y unas de remo son el mismo
    /// `intervals` y distinta pantalla, porque el reloj mide una y la otra no.
    /// Manda la pareja formato × modalidad, que es como está modelado el dominio.
    private static func guionPara(_ t: MirrorTramo) -> Cual {
        if t.formato == PrescriptionScheme.sets.rawValue { return .fuerza }
        guard t.modalidad == PrescriptionModality.run.rawValue else { return .ninguno }
        // Correr continuo — un bout sin trocear.
        if t.formato == PrescriptionScheme.steady.rawValue { return .rodaje }
        // Correr troceado: series de calle. Cubre el `intervals` que hoy emite el
        // constructor de entreno libre para «Correr · Series» y las series
        // prescritas por el coach.
        if t.rondaTotal ?? 0 > 1 { return .series }
        return .rodaje
    }

    // MARK: - Trama → Estado de cada guion

    private static func fuerza(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionFuerza.Estado {
        GuionFuerza.Estado(
            serie: t.rondaN ?? 1,
            totalSeries: t.rondaTotal ?? 0,
            cargaKg: t.cargaKg,
            reps: t.reps,
            // RIR y RPE no viajan sueltos: van dentro de la dosis que escribió el
            // coach, y esa se pinta tal cual en vez de descomponerla aquí.
            rir: nil,
            rpe: nil,
            esfuerzo: t.dosis,
            segundosEnSerie: elapsed,
            zonaViva: zona(t.zonaViva),
            bpm: bpm
        )
    }

    private static func rodaje(_ t: MirrorTramo, _ f: MirrorStateFrame, bpm: Int?, elapsed: Double) -> GuionRodaje.Estado {
        GuionRodaje.Estado(
            esCorrer: t.modalidad == PrescriptionModality.run.rawValue,
            zonaObjetivo: zona(f.targetZone),
            zonaViva: zona(t.zonaViva),
            bpm: bpm,
            ritmoSecPorKm: t.ritmoSecPorKm,
            metros: t.hechoMedida,
            objetivoMetros: t.objetivoMedida,
            segundos: elapsed
        )
    }

    private static func series(_ t: MirrorTramo, bpm: Int?, elapsed: Double) -> GuionSeries.Estado {
        GuionSeries.Estado(
            fase: t.enDescanso ? .recupera : .trabajo,
            serie: t.rondaN ?? 1,
            totalSeries: t.rondaTotal ?? 1,
            cierre: cierre(t),
            metrosEnTramo: t.hechoMedida,
            quedaS: t.ventanaQueda,
            enTramoS: elapsed,
            ritmoSecPorKm: t.ritmoSecPorKm,
            objetivo: t.objetivoLabel.map { ($0, estado(t.objetivoEstado)) },
            loQueViene: t.siguiente,
            zonaViva: zona(t.zonaViva),
            bpm: bpm
        )
    }

    /// QUIÉN CIERRA la ventana — lo resuelve el motor y viaja resuelto, para que
    /// la muñeca no vuelva a decidirlo por su cuenta con otra regla.
    private static func cierre(_ t: MirrorTramo) -> GuionSeries.Cierre {
        switch t.cierre {
        case "machineGoal":
            // Un hito sin metros no es un hito: si el objetivo no viaja, quien
            // cierra de verdad es el atleta y el sujeto tiene que cambiar.
            guard let m = t.objetivoMedida, m > 0 else { return .atleta }
            return .hito(metros: m)
        case "sessionClock", "formatClock":
            return .reloj
        default:
            return .atleta
        }
    }

    // MARK: - La lectura genérica, para lo que aún no tiene guion

    /// EMOM, For Time, AMRAP y compañía todavía no tienen guion propio. Hasta que
    /// lo tengan se pintan con el MISMO lienzo — un sujeto, un segundo nivel, su
    /// contexto — en vez de con la pantalla vieja de tejas y botón de 52 pt.
    /// Prefiere el tramo (la tarea de ahora) sobre las frases del bloque, que
    /// están congeladas de la primera ronda a la última.
    private static func generico(
        _ f: MirrorStateFrame,
        bpm: Int?,
        elapsed: Double,
        avanzar: @escaping () -> Void
    ) -> [WatchPagina] {
        let t = f.tramo
        let queda = t?.ventanaQueda ?? f.countdownRemaining
        let descansando = t?.enDescanso ?? false
        let contexto: String = {
            if let n = t?.rondaN, let total = t?.rondaTotal { return "Ronda \(n) / \(total)" }
            return f.progressText ?? f.blockTitle ?? "Entreno"
        }()
        let principal = WatchPagina(
            id: "espejo",
            contexto: descansando ? "Descanso · \(contexto)" : contexto,
            // El móvil lleva el entreno: en la muñeca sólo hay un avance.
            modo: .mando,
            sujeto: queda.map { WatchFormat.countdown($0) } ?? WatchFormat.clock(elapsed),
            tono: queda.map { WatchTinte.urgente($0) } ?? WatchTheme.ink,
            segundoEtiqueta: descansando ? "Luego" : t?.etiqueta ?? f.lineTitle,
            segundoValor: descansando ? (t?.siguiente ?? f.lineTitle) : (t?.dosis ?? f.detailLine),
            accion: "Toca · hecho",
            onToca: avanzar
        )
        var list = [principal]
        if let pulso = WatchPaginasComunes.pulso(bpm: bpm, zone: zona(t?.zonaViva), modo: .mando) {
            list.append(pulso)
        }
        return list
    }

    // MARK: - Decodificación

    private static func zona(_ raw: Int?) -> HRZone? { raw.flatMap { HRZone(rawValue: $0) } }

    private static func estado(_ raw: String?) -> TargetStatus {
        switch raw {
        case "inTarget": return .inTarget
        case "tooFast":  return .tooFast
        case "tooSlow":  return .tooSlow
        default:         return .unknown
        }
    }
}
