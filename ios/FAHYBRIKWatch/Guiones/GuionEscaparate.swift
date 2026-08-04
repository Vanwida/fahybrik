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
        /// La fracción que le queda al aro continuo (1 = entero). Nil = sin aro.
        var aro: Double? = nil
        /// El aro SEGMENTADO del doble — el on/off alrededor del cuadrado, una
        /// porción por serie. Si está, gana al continuo.
        var aroSeg: (total: Int, hechas: Int, fraccion: Double)? = nil
    }

    // MARK: - El catálogo

    static let casos: [Caso] = rodaje + series + fuerza + emom + ruta + ergo

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
                aroSeg: (total: 5, hechas: 0, fraccion: 0.35)
            ),
            Caso(
                id: "series-lento",
                titulo: "Series · vas por debajo del objetivo",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 3, totalSeries: 5, cierre: .hito(metros: 1_200),
                    metrosEnTramo: 640, quedaS: nil, enTramoS: 196, ritmoSecPorKm: 322,
                    objetivo: ("4:55–5:05 /km", .tooSlow), loQueViene: nil,
                    zonaViva: nil, bpm: 171)),
                aroSeg: (total: 5, hechas: 2, fraccion: 0.53)
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
                tinte: WatchTinte.color(for: .z4), aroSeg: (total: 5, hechas: 1, fraccion: 0.54)
            ),
            // Sin objetivo escrito: nadie sabe dónde acaba, así que el sujeto cambia de
            // sentido (los metros que LLEVAS) y aparece el toque para cerrar.
            Caso(
                id: "series-abierta",
                titulo: "Series · sin objetivo, la cierras tú",
                paginas: GuionSeries.paginas(.init(
                    fase: .trabajo, serie: 2, totalSeries: 5, cierre: .atleta,
                    metrosEnTramo: 1_176, quedaS: nil, enTramoS: 294, ritmoSecPorKm: 250,
                    objetivo: nil, loQueViene: nil, zonaViva: nil, bpm: 168)),
                // Serie abierta: el aro dice POR QUÉ serie vas, pero el segmento en
                // curso no se rellena — nadie mide cuánto le falta.
                aroSeg: (total: 5, hechas: 1, fraccion: 0)
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
                aroSeg: (total: 4, hechas: 2, fraccion: 0)
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

    // ── EMOM ────────────────────────────────────────────────────────────────
    private static var emom: [Caso] {
        // Ejecución 177: ski y bici alternos, 45 s de trabajo y 15 de parada.
        let ski = GuionEmom.TareaEmom(texto: "Ski 45 s", modo: .ojeada, ergo: "Ski")
        let bici = GuionEmom.TareaEmom(texto: "Bici 45 s", modo: .ojeada, ergo: "Bici")
        // Plantilla 462: 10 rondas de 60 s a 10 burpees. El único EMOM a pulso que
        // existe, y el que demuestra que el MODO manda: en el suelo no se mira.
        let burpees = GuionEmom.TareaEmom(texto: "10 burpees", modo: .ciego, ergo: nil)
        return [
            Caso(
                id: "emom-trabajo",
                titulo: "EMOM · minuto de ski, con máquina",
                paginas: GuionEmom.paginas(.init(
                    rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45,
                    tareas: [ski, bici], enVentanaS: 17, hechaEnS: nil,
                    maquina: true, metrosMaquina: 148, bpm: 161, zonaViva: .z4)),
                tinte: WatchTinte.color(for: .z4), aro: 0.72
            ),
            // El hallazgo de esta vista: al marcar la tarea el sujeto NO cambia —
            // cambia el color, y el mismo número pasa a leerse como el respiro.
            Caso(
                id: "emom-hecha",
                titulo: "EMOM · tarea hecha, el resto es tuyo",
                paginas: GuionEmom.paginas(.init(
                    rondas: 20, ronda: 7, ventanaS: 60, trabajoS: 45,
                    tareas: [ski, bici], enVentanaS: 38, hechaEnS: 34,
                    maquina: true, metrosMaquina: 312, bpm: 158, zonaViva: .z4)),
                tinte: WatchTheme.zoneGreen, aro: 0.37
            ),
            Caso(
                id: "emom-ciego",
                titulo: "EMOM · burpees, a pulso y a ciegas",
                paginas: GuionEmom.paginas(.init(
                    rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 60,
                    tareas: [burpees], enVentanaS: 22, hechaEnS: nil,
                    maquina: false, metrosMaquina: nil, bpm: 172, zonaViva: nil)),
                aro: 0.63
            ),
        ]
    }

    // ── Ruta (For Time · Chipper · HYROX) ───────────────────────────────────
    private static var ruta: [Caso] {
        // La ruta oficial de HYROX: 8 tramos de 1 km alternados con 8 estaciones.
        // Los tramos los mide el GPS; las ocho estaciones no las ve el reloj.
        let run = GuionRuta.Estacion(nombre: "Run", dosis: "1000 m", peso: 270, distanciaM: 1_000)
        let sled = GuionRuta.Estacion(nombre: "Sled Push", dosis: "50 m · 152 kg", peso: 180, distanciaM: nil)
        let wall = GuionRuta.Estacion(nombre: "Wall Balls", dosis: "100 reps · 9 kg", peso: 300, distanciaM: nil)
        return [
            Caso(
                id: "ruta-ciega",
                titulo: "HYROX · estación que el reloj no ve",
                paginas: GuionRuta.paginas(.init(
                    ruta: [run, sled, run, wall], estacion: 1,
                    cronoS: 2_480, enEstacionS: 41))
            ),
            Caso(
                id: "ruta-carrera",
                titulo: "HYROX · tramo de carrera",
                paginas: GuionRuta.paginas(.init(
                    ruta: [run, sled, run, wall], estacion: 2,
                    cronoS: 2_745, enEstacionS: 168)),
                aro: 0.38
            ),
            // El caso que justifica escribir el crono en minutos: pasada la hora,
            // `1:02:40` son seis glifos y deja de ser un sujeto.
            Caso(
                id: "ruta-pasada-la-hora",
                titulo: "HYROX · pasada la hora",
                paginas: GuionRuta.paginas(.init(
                    ruta: [run, sled, run, wall], estacion: 3,
                    cronoS: 4_200, enEstacionS: 90))
            ),
        ]
    }

    // ── Ergo ────────────────────────────────────────────────────────────────
    private static var ergo: [Caso] {
        [
            // Hoy es el 100 % de los casos: ningún PM5 llega a la app. Sin monitor
            // no hay metros ni /500 — quedan el pulso y el crono, y cierras tú.
            Caso(
                id: "ergo-sin-maquina",
                titulo: "Ergo · sin monitor emparejado",
                paginas: GuionErgo.paginas(.init(
                    fase: .remando, serie: 2, totalSeries: 8, tramoM: 500,
                    maquina: false, hechosM: nil, ritmoSec500: nil,
                    segundosEnFase: 74, quedaDescansoS: nil, zonaViva: nil, bpm: 164)),
                aroSeg: (total: 8, hechas: 1, fraccion: 0)
            ),
            Caso(
                id: "ergo-con-maquina",
                titulo: "Ergo · 8×500 con el PM5 emparejado",
                paginas: GuionErgo.paginas(.init(
                    fase: .remando, serie: 3, totalSeries: 8, tramoM: 500,
                    maquina: true, hechosM: 318, ritmoSec500: 115,
                    segundosEnFase: 73, quedaDescansoS: nil, zonaViva: .z4, bpm: 169)),
                tinte: WatchTinte.color(for: .z4), aroSeg: (total: 8, hechas: 2, fraccion: 0.64)
            ),
            Caso(
                id: "ergo-descanso",
                titulo: "Ergo · descanso entre series",
                paginas: GuionErgo.paginas(.init(
                    fase: .descanso, serie: 4, totalSeries: 8, tramoM: 500,
                    maquina: true, hechosM: 500, ritmoSec500: 114,
                    segundosEnFase: 46, quedaDescansoS: 74, zonaViva: nil, bpm: 142)),
                tinte: WatchTheme.zoneGreen, aro: 0.62
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
            bisel: caso.aroSeg.map {
                WatchAroSegmentado(total: $0.total, hechas: $0.hechas, fraccion: $0.fraccion).watchBisel()
            } ?? caso.aro.map { WatchAroContinuo(remaining: $0).watchBisel() }
        )
    }
}
#endif
