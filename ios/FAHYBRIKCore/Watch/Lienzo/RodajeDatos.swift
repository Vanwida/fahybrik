import Foundation
import CoreGraphics

// DATOS — «LA SESIÓN», DECIDIDA UNA SOLA VEZ (FH-30).
//
// EL DOMINIO: la página de Datos de correr no tiene sujeto. Es la sesión entera
// en cuatro filas —tiempo, distancia, ritmo medio, pulso— y, cuando el pulso no
// tiene zona con la que compararse, la razón. Lo único que cambia entre las dos
// vías es DE DÓNDE salen los cuatro datos crudos: el motor (`WorkoutSession`) sin
// móvil, o la muñeca y la trama en espejo.
//
// POR QUÉ ESTE FICHERO EXISTE. La cuenta vivía en línea dentro de
// `RodajeDatosPage` y el espejo no tenía Datos: el atleta veía tres páginas
// corriendo sin el móvil y dos con él (el móvil lo lleva el 90 % de los días).
// Como con `RodajeLamina`, aquí las dos vías proyectan a un dato plano
// (`Entrada`) y `lectura(_:)` decide; la vista sólo pinta. Y como vive en
// FAHYBRIKCore, FAHYBRIKTests comprueba que el MISMO entreno da la MISMA lectura
// por las dos vías, que es lo único que significa «misma cara».
//
// LO QUE NO SE SABE NO SE PINTA (§7): distancia sin contar, ritmo sin metros
// suficientes o absurdo, pulso sin sensor → «—». Jamás un cero con cara de
// medida.
enum RodajeDatos {

    /// Lo que se sabe de la sesión, en dato plano y sin motor ni cable.
    struct Entrada: Equatable {
        /// Segundos de la sesión entera.
        var segundos: Double
        /// Metros contados por alguien (Apple, GPS). Nil o ≤ 0 = nadie los ha
        /// contado: el cable no distingue «cero contados» de «sin contar», así que
        /// un cero nunca se pinta como medida.
        var metros: Double? = nil
        var bpm: Int? = nil
        /// La zona del pulso vivo contra las bandas del atleta. Nil = sin bandas.
        var zona: HRZone? = nil
    }

    /// Una fila de la página: etiqueta en versales, cifra, unidad y —sólo el
    /// pulso— el chip de zona.
    struct Fila: Equatable {
        var etiqueta: String
        var cifra: String
        var unidad: String = ""
        var chip: String? = nil
    }

    struct Lectura: Equatable {
        var tiempo: Fila
        var distancia: Fila
        var ritmo: Fila
        var pulso: Fila
        /// La razón de que no haya zona (`WatchNota.sinAncla`). Nil si la hay.
        var nota: String?

        var filas: [Fila] { [tiempo, distancia, ritmo, pulso] }
    }

    /// Lo que se pinta cuando un dato no existe. Una sola grafía.
    static let sinDato = "—"

    static func lectura(_ e: Entrada) -> Lectura {
        let segundos = max(0, e.segundos)
        let metros = e.metros.flatMap { $0 > 0 ? $0 : nil }

        let distancia: Fila = metros.map {
            Fila(etiqueta: "distancia", cifra: WatchDistancia.cifra($0), unidad: WatchDistancia.unidad($0))
        } ?? Fila(etiqueta: "distancia", cifra: sinDato)

        return Lectura(
            tiempo: Fila(etiqueta: "tiempo", cifra: WatchFormat.clock(segundos)),
            distancia: distancia,
            ritmo: ritmoMedio(metros: metros, segundos: segundos),
            pulso: pulso(bpm: e.bpm, zona: e.zona),
            nota: e.zona == nil ? WatchNota.sinAncla : nil
        )
    }

    /// Ritmo MEDIO de la sesión (metros ÷ tiempo total), no el instantáneo. La
    /// derivación es la única de la app (`WorkoutSession.paceSecPerKm`) y pasa por
    /// las mismas dos puertas de honestidad que el ritmo de la lámina: por debajo
    /// de `minMetersForPace` es un sensor arrancando y por encima de
    /// `maxPaceSecPerKm` es alguien de pie (`RodajeLamina.ritmoHonesto`).
    private static func ritmoMedio(metros: Double?, segundos: Double) -> Fila {
        let vacia = Fila(etiqueta: "ritmo medio", cifra: sinDato)
        guard let metros, metros >= RunLegDisplay.minMetersForPace,
              let pace = WorkoutSession.paceSecPerKm(meters: metros, seconds: segundos)
        else { return vacia }
        let s = Int(pace.rounded())
        guard s <= RunLegDisplay.maxPaceSecPerKm else { return vacia }
        return Fila(etiqueta: "ritmo medio", cifra: WatchFormat.pace(s),
                    unidad: Formato.UnidadRitmo.porKm.rawValue)
    }

    private static func pulso(bpm: Int?, zona: HRZone?) -> Fila {
        guard let bpm else { return Fila(etiqueta: "pulso", cifra: sinDato) }
        let chip = zona.map { "\($0.label) \(WatchZonaNombre.de($0))" }
        return Fila(etiqueta: "pulso", cifra: "\(bpm)", unidad: "ppm", chip: chip)
    }
}

// MARK: - Las dos proyecciones

extension RodajeDatos.Entrada {

    /// Sin móvil: el motor es la fuente.
    init(sesion s: WorkoutSession) {
        self.init(
            segundos: s.elapsedSeconds,
            metros: s.liveRunDistanceMeters,
            bpm: s.liveHRBpm,
            zona: s.liveZone
        )
    }

    /// En espejo: el reloj de la sesión viene en la trama y `desdeTrama` lo
    /// re-basa entre tramas mientras la fase es activa (el llamante pasa 0 en
    /// pausa: un crono parado no avanza). Metros y pulso son de LA MUÑECA —los
    /// mide Apple, no el móvil—, igual que en el resto del espejo.
    init(trama f: MirrorStateFrame, desdeTrama: TimeInterval, metrosApple: Double?, bpm: Int?, zona: HRZone?) {
        self.init(
            segundos: f.sessionElapsed + max(0, desdeTrama),
            metros: metrosApple,
            bpm: bpm,
            zona: zona
        )
    }
}

// MARK: - El encabezado de Controles

extension RodajeLamina {

    /// La línea de versales de la página de Controles: dónde estás y el reloj de
    /// la sesión. Una sola redacción para las dos vías (antes vivía en
    /// `PauseFinishPage` leyendo el motor).
    static func encabezadoControles(_ v: Ventana, sesionS: Double) -> String {
        let reloj = WatchFormat.clock(max(0, sesionS))
        if v.enPausa { return "en pausa · \(reloj)" }
        if v.esSerie { return "serie \(v.serieN) de \(v.serieTotal) · \(reloj)" }
        return "rodaje · \(reloj)"
    }
}

// MARK: - El pager de tres páginas

/// LAS PÁGINAS DE CORRER POR ETIQUETA, no por índice suelto. Al correr son tres
/// (Datos | Vivo | Controles) con los tres puntos de la lámina; cualquier otra
/// modalidad en espejo se queda en dos (Vivo | Controles) con el índice del
/// sistema. La selección se guarda como etiqueta para que un cambio de
/// modalidad (HYROX: tramo de carrera → estación) no deje al atleta en una
/// página que ya no existe.
enum RodajePagina: Hashable {
    case datos, vivo, controles

    /// Las páginas que existen ahora, de izquierda a derecha.
    static func existentes(esLamina: Bool) -> [RodajePagina] {
        esLamina ? [.datos, .vivo, .controles] : [.vivo, .controles]
    }

    /// Posición del punto activo en los tres puntos de la lámina.
    var punto: Int {
        switch self {
        case .datos: return 0
        case .vivo: return 1
        case .controles: return 2
        }
    }

    /// A qué página hay que estar dado el estado: si la actual ya no existe se
    /// vuelve a Vivo, y con la muñeca bajada (el sistema ignora los
    /// deslizamientos y no se puede salir de otra página) también — la misma
    /// regla que `WatchReloj`. El atenuado sólo manda en la lámina: el resto del
    /// espejo no cambia.
    static func valida(_ actual: RodajePagina, esLamina: Bool, atenuado: Bool) -> RodajePagina {
        if !existentes(esLamina: esLamina).contains(actual) { return .vivo }
        if esLamina && atenuado { return .vivo }
        return actual
    }
}

// MARK: - Las medidas de Controles

/// CUÁNTO MIDE CADA BOTÓN, según el hueco. Un 46 mm y un SE de 40 mm no tienen
/// el mismo alto útil, y con medidas fijas (60 + 46) en el SE «Terminar» se
/// quedaba cortado y en el 46 mm el pie del espejo desaparecía. Los botones
/// crecen hasta su medida ideal si hay sitio y bajan, en proporción, hasta un
/// suelo táctil; si ni así caben, la página se recorre con la corona. El pie sólo
/// se enseña si cabe SIN pasar de los suelos: es información, no un mando.
enum RodajeControlesMedidas {
    struct Distribucion: Equatable {
        var pausar: CGFloat
        var extra: CGFloat
        var terminar: CGFloat
        var hueco: CGFloat
        var muestraPie: Bool
    }

    static let ideal = Distribucion(pausar: 60, extra: 52, terminar: 46, hueco: 8, muestraPie: true)
    static let suelo = Distribucion(pausar: 44, extra: 40, terminar: 36, hueco: 4, muestraPie: true)
    /// Dos líneas de 11 pt más su aire superior.
    static let altoPie: CGFloat = 30

    static func suma(_ d: Distribucion, extras: Int) -> CGFloat {
        d.pausar + d.terminar + CGFloat(extras) * d.extra + CGFloat(extras + 1) * d.hueco
    }

    static func distribuir(disponible: CGFloat, extras: Int, pie: Bool) -> Distribucion {
        let extras = max(0, extras)
        let sumaSuelo = suma(suelo, extras: extras)
        let sumaIdeal = suma(ideal, extras: extras)
        let conPie = pie && disponible - altoPie >= sumaSuelo
        let presupuesto = conPie ? disponible - altoPie : disponible
        let t = sumaIdeal > sumaSuelo
            ? min(1, max(0, (presupuesto - sumaSuelo) / (sumaIdeal - sumaSuelo)))
            : 1
        func mezcla(_ a: CGFloat, _ b: CGFloat) -> CGFloat { a + t * (b - a) }
        return Distribucion(
            pausar: mezcla(suelo.pausar, ideal.pausar),
            extra: mezcla(suelo.extra, ideal.extra),
            terminar: mezcla(suelo.terminar, ideal.terminar),
            hueco: mezcla(suelo.hueco, ideal.hueco),
            muestraPie: conPie
        )
    }
}
