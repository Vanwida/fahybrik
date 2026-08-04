import SwiftUI

// (3) FUERZA — el reloj está en la muñeca que sostiene la barra. Port del guion
// del doble (`web/components/design-twin/screens/watch-fuerza/`).
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Pulso y tiempo, y nada más. La carga y las reps NO LAS MIDE NADIE: las declara
// el atleta, y por eso todas las cifras de esta vista llevan al pie la nota que
// lo dice. Es la vista con menos medida de las tres y aun así la más útil,
// porque lo que el atleta necesita saber entre serie y serie no es un sensor:
// es qué le tocaba.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Durante la serie, nada: `ciego`. Un reloj que en ese momento PIDE algo está
// mal diseñado por definición — tienes las dos manos en la barra. Así que la
// pantalla enuncia (carga · reps · RIR) y espera, con la oferta de «serie hecha»
// pintada ATENUADA: está ahí para cuando sueltes, no ahora.
//
// La decisión y los controles viven en el descanso, que es otra pantalla
// (`RestBannerView`) y otro modo (`mando`).
//
// ── EL SUJETO, Y CÓMO DEGRADA ──────────────────────────────────────────────
// La CARGA, porque es lo que define la serie y lo que se olvida entre series.
// Si el coach no escribió carga (peso corporal, un circuito), el sujeto son las
// REPS. Y si no escribió ninguna de las dos, lo único cierto que queda es el
// crono de la serie: no se pinta «— kg» ni un 0, que sería inventarse la
// prescripción que no hay.

enum GuionFuerza {

    struct Estado {
        /// La serie en curso y el total. `totalSeries` 0 = el coach no escribió
        /// tabla de series: es un ejercicio suelto, no «la serie 1 de 1».
        var serie: Int
        var totalSeries: Int
        var cargaKg: Double?
        var reps: Int?
        /// Sólo uno de los dos se pinta, y RIR gana: es lo que el coach escribe.
        var rir: Double?
        var rpe: Double?
        /// La guía de esfuerzo en palabras, cuando no hay ni RIR ni RPE.
        var esfuerzo: String?
        /// Degradación final: sin carga y sin reps, el crono de la serie.
        var segundosEnSerie: Double
        var zonaViva: HRZone?
        var bpm: Int?
    }

    struct Gestos {
        var serieHecha: (() -> Void)?

        init(serieHecha: (() -> Void)? = nil) { self.serieHecha = serieHecha }
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        var list = [paginaSerie(e, g)]
        // El pulso también en ciego: no pide nada, sólo está.
        if let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zonaViva, modo: .ciego) {
            list.append(pulso)
        }
        return list
    }

    private static func paginaSerie(_ e: Estado, _ g: Gestos) -> WatchPagina {
        let (sujeto, unidad, segundo) = lectura(e)
        return WatchPagina(
            id: "serie",
            contexto: contexto(e),
            // Las dos manos en la barra: el reloj enuncia y espera.
            modo: .ciego,
            sujeto: sujeto,
            unidad: unidad,
            segundoValor: segundo,
            segundoTono: WatchTheme.orangeSoft,
            // Una oferta en reposo, no una petición: el lienzo la pinta atenuada
            // porque el modo es `ciego`.
            accion: "Toca · serie hecha",
            onToca: g.serieHecha,
            // Todas las cifras de esta vista las declara el atleta.
            nota: WatchNota.loDicesTu
        )
    }

    /// Carga → reps → crono. Nunca un hueco: si un dato no está, manda el
    /// siguiente que sí es cierto.
    private static func lectura(_ e: Estado) -> (String, String?, String?) {
        if let carga = e.cargaKg {
            return (WatchFormat.kg(carga), "kg", detalle(e, conReps: true))
        }
        if let reps = e.reps {
            return ("\(reps)", Vocab.reps, detalle(e, conReps: false))
        }
        return (WatchFormat.clock(e.segundosEnSerie), nil, detalle(e, conReps: true))
    }

    /// El segundo nivel: las reps (si no son ya el sujeto) y el esfuerzo. RIR
    /// antes que RPE — es lo que el coach escribe — y la guía en palabras sólo
    /// cuando no hay ninguno de los dos.
    private static func detalle(_ e: Estado, conReps: Bool) -> String? {
        var partes: [String] = []
        if conReps, let reps = e.reps, e.cargaKg != nil { partes.append("\(reps) \(Vocab.reps)") }
        if let rir = e.rir { partes.append("\(Vocab.rir) \(Formato.esDecimal(rir))") }
        else if let rpe = e.rpe { partes.append("\(Vocab.rpe) \(Formato.esDecimal(rpe))") }
        if partes.isEmpty, let esfuerzo = e.esfuerzo { partes.append(esfuerzo) }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    private static func contexto(_ e: Estado) -> String {
        guard e.totalSeries > 0 else { return "Fuerza" }
        return "Serie \(min(e.serie, e.totalSeries)) / \(e.totalSeries)"
    }
}
