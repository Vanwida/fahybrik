#if DEBUG
import SwiftUI

// EL ESCAPARATE — ver la pantalla REAL del reloj sin tener que entrenar.
//
// Por qué existe: un guion es una función pura y sus tests dicen que devuelve las
// páginas correctas, pero NO dicen cómo se ve un `73:00` a 44 pt sobre el bisel,
// ni si «te pasas · afloja» cabe en la línea del segundo nivel. Eso sólo se ve
// mirando la muñeca, y llegar a la muñeca hoy exige crear un entreno, arrancarlo
// desde el móvil y hacer la primera serie. Una pantalla que sólo se puede mirar
// entrenando es una pantalla que no se mira, y se nota: la app se pasó semanas
// enseñando la dosis de la primera serie las cuatro series.
//
// Con esto, cada caso de diseño se abre en un toque:
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion series-hito
//     xcrun simctl io <sim> screenshot serie.png
//
// Sólo en DEBUG y sólo con el argumento: la app de verdad no lo ve ni lo compila
// en release. Los casos son LOS MISMOS que recorren los tests, así que el
// escaparate no puede enseñar una pantalla que el guion no produzca.

enum GuionEscaparate {

    /// El argumento que enciende el escaparate, y el id del caso a pintar.
    static let bandera = "-guion"

    static var casoPedido: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: bandera), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// Un caso: su id para la línea de comandos y lo que pinta.
    struct Caso {
        let id: String
        let titulo: String
        let paginas: [WatchPagina]
        var tinte: Color? = nil
        /// La fracción que le queda al aro (1 = entero, 0 = vacío). Nil = sin aro,
        /// que es lo que corresponde cuando nadie sabe cuánto falta.
        var aro: Double? = nil
    }

    // MARK: - El catálogo

    static let casos: [Caso] = rodaje + series + fuerza

    // ── Rodaje ──────────────────────────────────────────────────────────────
    private static var rodaje: [Caso] {
        [
            Caso(
                id: "rodaje-sin-senal",
                titulo: "Rodaje · el GPS aún no fija",
                paginas: GuionRodaje.paginas(.init(
                    esCorrer: true, zonaObjetivo: nil, zonaViva: nil, bpm: 138,
                    ritmoSecPorKm: nil, metros: nil, objetivoMetros: nil, segundos: 47))
            ),
            Caso(
                id: "rodaje-sin-umbral",
                titulo: "Rodaje · con GPS, sin umbral",
                paginas: GuionRodaje.paginas(.init(
                    esCorrer: true, zonaObjetivo: nil, zonaViva: nil, bpm: 150,
                    ritmoSecPorKm: 312, metros: 5_240, objetivoMetros: 10_000, segundos: 1_636))
            ),
            // El caso DOMINANTE de la biblioteca real (212 bloques continuos, patrón
            // «Run 1h15' zona 2») y el que el doble no cubría: con zona prescrita el
            // segundo nivel juzga en vez de describir.
            Caso(
                id: "rodaje-en-zona",
                titulo: "Rodaje · Z2 prescrita, en zona",
                paginas: GuionRodaje.paginas(.init(
                    esCorrer: true, zonaObjetivo: .z2, zonaViva: .z2, bpm: 141,
                    ritmoSecPorKm: 330, metros: 8_120, objetivoMetros: 12_000, segundos: 2_680)),
                tinte: WatchTinte.color(for: .z2), aro: 0.32
            ),
            Caso(
                id: "rodaje-te-pasas",
                titulo: "Rodaje · Z2 prescrita, te pasas",
                paginas: GuionRodaje.paginas(.init(
                    esCorrer: true, zonaObjetivo: .z2, zonaViva: .z4, bpm: 168,
                    ritmoSecPorKm: 268, metros: 8_400, objetivoMetros: 12_000, segundos: 2_690)),
                tinte: WatchTinte.color(for: .z4), aro: 0.30
            ),
        ]
    }

    // ── Series de calle ─────────────────────────────────────────────────────
    private static var series: [Caso] {
        [
            // El caso de Alex: 5×500 a 5:00/km creado en la app y arrancado desde el
            // móvil. Con hito, el sujeto son los metros que FALTAN y no hay toque.
            Caso(
                id: "series-hito",
                titulo: "Series · 5×500, hito de distancia",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 1, totalSeries: 5, cierre: .hito(metros: 500),
                    metrosEnTramo: 174, quedaS: nil, enTramoS: 52, ritmoSecPorKm: 298,
                    objetivo: ("5:00 /km", .inTarget), loQueViene: nil,
                    zonaViva: nil, bpm: 162)),
                aro: 0.65
            ),
            Caso(
                id: "series-lento",
                titulo: "Series · vas por debajo del objetivo",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 3, totalSeries: 5, cierre: .hito(metros: 1_200),
                    metrosEnTramo: 640, quedaS: nil, enTramoS: 196, ritmoSecPorKm: 322,
                    objetivo: ("4:55–5:05 /km", .tooSlow), loQueViene: nil,
                    zonaViva: nil, bpm: 171)),
                aro: 0.47
            ),
            // El fartlek de la plantilla 318 — 5×(5' Z4 / 1' Z2). Lo cierra el reloj,
            // así que el sujeto es la cuenta atrás y no unos metros que nadie prometió.
            Caso(
                id: "series-tiempo",
                titulo: "Fartlek · el tramo lo cierra el reloj",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 2, totalSeries: 5, cierre: .reloj,
                    metrosEnTramo: 810, quedaS: 137, enTramoS: 163, ritmoSecPorKm: 289,
                    objetivo: ("Z4", .unknown), loQueViene: nil,
                    zonaViva: .z4, bpm: 176)),
                tinte: WatchTinte.color(for: .z4), aro: 0.46
            ),
            // Sin objetivo escrito: nadie sabe dónde acaba, así que el sujeto cambia de
            // sentido (los metros que LLEVAS) y aparece el toque para cerrar.
            Caso(
                id: "series-abierta",
                titulo: "Series · sin objetivo, la cierras tú",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 2, totalSeries: 5, cierre: .atleta,
                    metrosEnTramo: 1_176, quedaS: nil, enTramoS: 294, ritmoSecPorKm: 250,
                    objetivo: nil, loQueViene: nil, zonaViva: nil, bpm: 168))
            ),
            Caso(
                id: "series-recupera",
                titulo: "Series · recuperando",
                paginas: GuionSeries.paginas(.init(
                    fase: .recupera, serie: 4, totalSeries: 5, cierre: .reloj,
                    metrosEnTramo: nil, quedaS: 38, enTramoS: 52, ritmoSecPorKm: nil,
                    objetivo: nil, loQueViene: "1200 m", zonaViva: nil, bpm: 148)),
                tinte: WatchTheme.zoneGreen, aro: 0.42
            ),
        ]
    }

    // ── Fuerza ──────────────────────────────────────────────────────────────
    private static var fuerza: [Caso] {
        [
            Caso(
                id: "fuerza-serie",
                titulo: "Fuerza · 4×5 a 100 kg",
                paginas: GuionFuerza.paginas(.init(
                    serie: 3, totalSeries: 4, cargaKg: 100, reps: 5, rir: 2, rpe: nil,
                    esfuerzo: nil, segundosEnSerie: 24, zonaViva: nil, bpm: 132)),
                aro: 0.5
            ),
            // Ejecución 171: el coach no escribió carga. El sujeto pasa a ser las reps
            // y no se pinta «— kg».
            Caso(
                id: "fuerza-sin-carga",
                titulo: "Fuerza · sin carga escrita",
                paginas: GuionFuerza.paginas(.init(
                    serie: 2, totalSeries: 4, cargaKg: nil, reps: 10, rir: nil, rpe: nil,
                    esfuerzo: nil, segundosEnSerie: 18, zonaViva: nil, bpm: 128))
            ),
        ]
    }

    static func caso(_ id: String) -> Caso? { casos.first { $0.id == id } }
}

/// El lienzo del escaparate: el MISMO `WatchReloj` que pinta el entreno de verdad.
/// Si aquí se ve mal, se ve mal en la muñeca.
struct GuionEscaparateView: View {
    let caso: GuionEscaparate.Caso

    var body: some View {
        WatchReloj(
            paginas: caso.paginas,
            tinte: caso.tinte,
            bisel: caso.aro.map { WatchAroContinuo(remaining: $0).watchBisel() }
        )
    }
}
#endif
