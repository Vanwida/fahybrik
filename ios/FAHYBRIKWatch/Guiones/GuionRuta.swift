import SwiftUI

// (7) RUTA — el crono único de las 16 estaciones, y el formato donde el reloj
// sabe MENOS de toda la app. Port de
// `web/components/design-twin/screens/watch-fortime/guion.ts`.
//
// Se llama `GuionRuta` y no `GuionForTime` a propósito: sirve a TODO formato
// que se recorre como una RUTA de estaciones contra un solo crono — For Time,
// Chipper y la simulación HYROX comparten el mismo hueso (una lista de
// estaciones, un crono que no para, y una bandera por estación de si el reloj
// mide algo ahí). El `Estado` de abajo no sabe de una plantilla fija: lleva su
// propia `ruta`. La única ejecución real que hay hoy es un For Time —la
// plantilla 441— y sus datos viven en `CASOS`, al final, no en el guion.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// El crono. Y en la mitad de la ruta, nada más que el crono.
//
// De las 16 estaciones de la plantilla 441 (la única ejecución completa que
// existe), **8 son tramos de carrera que el GPS sí mide (distancia y ritmo) y
// 8 son estaciones que el reloj no ve en absoluto**: trineo, wall balls,
// farmers carry, burpee broad jump, zancadas con saco. No hay sensor que
// cuente un wall ball ni que sepa cuántos metros llevas de un sled push. Cada
// estación lo declara con `distanciaM` (`nil` = ciega), y esa bandera —no el
// formato— es la que parte esta vista en dos.
//
// Y hay un segundo hecho, peor: la ejecución 59 marcó 4.380 s (73:00
// clavados) y **CERO `segment_executions`**. Ni un parcial, ni un pulso, ni
// un metro. El otro intento capturó 3 de 23 segmentos y se abandonó. O sea
// que **lo más completo que existe de un For Time en toda la base es el
// tiempo final**, y eso es exactamente lo que esta pantalla promete: el
// crono, entero, siempre.
//
// Por eso aquí NO hay página de pulso. No es una omisión: `FORTIME` no trae
// FC porque sin `segment_executions` no hay `avg_hr` que reproducir, y un
// pulso inventado en la pantalla que presume de honestidad sería el peor
// sitio para inventarlo (§7). Sin FC tampoco hay zona, y sin zona no hay
// tinte: el lienzo de esta vista es negro de principio a fin.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Cambia estación a estación, y ése es el otro giro:
//
//   · tramo de carrera            → `ojeada`. Corres, miras de reojo, no tocas.
//   · trineo, farmers, sandbag    → `ciego`. Las dos manos ocupadas o cargando.
//   · wall balls, burpees         → `ciego`. Ni mirar ni tocar.
//
// La transición entre estaciones la gobierna un SUCESO que el reloj no ve
// (cruzas la línea de la siguiente estación), así que la declara el atleta
// con un toque. En `ciego` esa oferta se pinta atenuada —es para cuando
// sueltes el trineo, no ahora—; en `ojeada` no se pinta en absoluto, pero el
// gesto sigue ahí: toda la pantalla es el toque.
//
// ── DÓNDE ME CHIRRIÓ EL MODELO DE LOS TRES MODOS ───────────────────────────
// El `mando` no aparece en ninguna página de esta vista, y no es un
// descuido: **una ruta contra reloj no tiene un solo momento en el que el
// atleta se pare** — vale igual para el For Time, el Chipper y la
// simulación HYROX, las tres son la misma promesa de crono corriendo. El
// instante de tocar existe (cruzas la línea y tocas), pero es un instante,
// no un estado en el que la pantalla se quede. Modelarlo como fase sería
// inventar un descanso que la ruta no tiene.

enum GuionRuta {

    /// Una estación de la ruta, tal y como la escribió el coach.
    struct Estacion {
        let nombre: String
        /// La dosis del coach, en su propia grafía («50 m · 152 kg», «100 reps · 6 kg»).
        let dosis: String
        /// Peso en el bisel (segundos ESTIMADOS de duración). No es un dato, es
        /// una estimación para que el aro tenga forma — por eso nunca se
        /// escribe en pantalla como si fuera un tiempo medido.
        let peso: Double
        /// Los metros del tramo si el GPS los mide, `nil` si la estación es
        /// ciega. Esta bandera —no el formato de la ruta— es la que decide
        /// si hay una o dos páginas, y cuánto se enciende el aro.
        let distanciaM: Double?

        var loMideElReloj: Bool { distanciaM != nil }
    }

    struct Estado {
        /// La ruta completa de esta ejecución: For Time, Chipper o
        /// simulación HYROX. Datos ya resueltos, nada que simular aquí.
        let ruta: [Estacion]
        /// Índice de la estación en curso dentro de `ruta`.
        var estacion: Int
        /// El crono total desde la salida. ES la puntuación, y no se va de
        /// pantalla.
        var cronoS: Double
        /// Segundos dentro de la estación en curso.
        var enEstacionS: Double
    }

    struct Gestos {
        /// «Estación hecha»: la gobierna un suceso que el reloj no ve, así
        /// que la dice el atleta con un toque.
        var estacionHecha: (() -> Void)?

        init(estacionHecha: (() -> Void)? = nil) {
            self.estacionHecha = estacionHecha
        }
    }

    /// La estación en curso, o `nil` si el índice no cae dentro de la ruta
    /// (estado a medio construir; nunca debería llegar así desde el motor).
    private static func estacionActual(_ e: Estado) -> Estacion? {
        e.ruta.indices.contains(e.estacion) ? e.ruta[e.estacion] : nil
    }

    /**
     * EL CRONO DE LA RUTA, Y AQUÍ ESTÁ EL HALLAZGO DE ESTA VISTA.
     *
     * Un HYROX dura entre 60 y 90 minutos, así que el reloj del kit —que
     * rueda a horas a partir de 3.600 s— escribiría `1:02:40`: SEIS glifos,
     * o sea 37 pt de altura de cifra en un lienzo de 188 de ancho. A ese
     * tamaño el crono ya no es un dato gigante, es una línea de texto
     * grande, y deja de ser el sujeto.
     *
     * El CONTRATO-UI §2 ya lo resuelve para carreras (`enHoras: false`): **el
     * marcador de una ruta habla en minutos**. `73:00` son cinco glifos y
     * 44 pt, que es justo el suelo. La hora, si algún día hace falta, vive
     * en el contexto — por eso delega en `Formato.clock(anchoFijo: true,
     * enHoras: false)` en vez de reimplementar el padding a mano.
     *
     * (El límite conocido: a partir de 100 minutos serían seis glifos otra
     * vez. No lo alcanza ninguna carrera de la base —la más larga son los
     * 73:00 de la ejecución 59— y resolverlo antes de tener el caso sería
     * inventárselo.)
     */
    static func cronoCarrera(_ segundos: Double) -> String {
        Formato.clock(segundos, anchoFijo: true, enHoras: false)
    }

    /**
     * Los metros que faltan del tramo. **`nil` en las estaciones ciegas**, y
     * entonces esta vista no tiene página de tramo: no es que el dato esté
     * vacío, es que no hay nada que medir.
     *
     * El ritmo con el que avanza la reproducción sale del peso que la ruta
     * le da al tramo (270 s para 1 km ≈ 4:30/km en la plantilla 441). En la
     * app estos metros los mide el GPS: el peso sólo sirve para reproducir,
     * y por eso no se escribe en pantalla.
     */
    static func metrosQueFaltan(_ e: Estado) -> Double? {
        guard let est = estacionActual(e), let distancia = est.distanciaM else { return nil }
        let hechos = distancia * e.enEstacionS / est.peso
        return max(0, distancia - hechos)
    }

    /**
     * Lo que se enciende del aro de la estación en curso.
     *
     * REGLA, y vale para las dos vistas del relevo y de la ruta: **el bisel
     * sólo rellena lo que se mide.** En un tramo de carrera se rellena con
     * los metros del GPS; en una estación ciega se queda a cero, porque no
     * hay ni un dato con el que rellenarlo. El resultado es que el aro se
     * apaga justo donde el reloj deja de medir, que es la tesis de esta
     * vista dibujada en el borde. Y el «estás aquí» no se pierde: lo dice el
     * filo entre lo encendido y lo apagado.
     */
    static func fraccionMedida(_ e: Estado) -> Double {
        guard let distancia = estacionActual(e)?.distanciaM, let faltan = metrosQueFaltan(e) else { return 0 }
        return 1 - faltan / distancia
    }

    // MARK: - Páginas

    static func paginas(_ e: Estado, _ g: Gestos = Gestos()) -> [WatchPagina] {
        guard let est = estacionActual(e) else { return [] }
        let donde = "\(est.nombre) · \(e.estacion + 1) de \(e.ruta.count)"
        let faltan = metrosQueFaltan(e)

        guard let faltan else {
            // ESTACIÓN CIEGA — el caso real, y el mínimo de esta vista. Una
            // página, y no porque falte sitio: es que no hay un segundo dato
            // que enseñar.
            return [
                WatchPagina(
                    id: "crono",
                    contexto: donde,
                    modo: .ciego,
                    sujeto: cronoCarrera(e.cronoS),
                    // La dosis del coach, que NO es una medida: es lo que hay
                    // que hacer. Por eso va de segundo nivel y la nota dice
                    // de dónde sale.
                    segundoValor: est.dosis,
                    // Una oferta para cuando sueltes el trineo, no una
                    // petición: el lienzo la pinta atenuada porque el modo
                    // es `ciego`.
                    accion: "Al acabar · toca",
                    onToca: g.estacionHecha,
                    nota: WatchNota.loDicesTu
                )
            ]
        }

        // TRAMO DE CARRERA — lo único de la ruta que el reloj mide por su
        // cuenta.
        return [
            WatchPagina(
                id: "crono",
                contexto: donde,
                modo: .ojeada,
                // Sin segundo nivel y sin nota: corriendo, un dato gigante y
                // nada más. La dosis del tramo no hace falta aquí, la lleva
                // la página de al lado.
                sujeto: cronoCarrera(e.cronoS),
                accion: "Al llegar · toca",
                onToca: g.estacionHecha
            ),
            WatchPagina(
                id: "tramo",
                contexto: "\(est.nombre) · faltan",
                modo: .ojeada,
                sujeto: WatchDistancia.cifra(faltan),
                unidad: WatchDistancia.unidad(faltan),
                // El gesto vive en las dos páginas: llegas a la estación y
                // tocas, mires la que mires. En `ojeada` no se anuncia, pero
                // está.
                accion: "Al llegar · toca",
                onToca: g.estacionHecha
            )
        ]
    }

    // -----------------------------------------------------------------------
    // Los casos que esta vista puede alcanzar — para los tests de Xcode.
    // -----------------------------------------------------------------------

    /**
     * La ruta real de la plantilla 441 (16 estaciones) — la única ejecución
     * completa que existe de un For Time en la base (ejecución 59 ·
     * asignación 244 · atleta 67, 4.380 s = 73:00 clavados). El guion de
     * arriba no la conoce: sólo sirve para construir los `CASOS`.
     */
    private static let plantilla441: [Estacion] = [
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "SkiErg", dosis: "1.000 m", peso: 240, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Sled Push", dosis: "50 m · 152 kg", peso: 180, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Sled Pull", dosis: "50 m · 103 kg", peso: 210, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Burpee Broad Jump", dosis: "80 m", peso: 240, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Rowing", dosis: "1.000 m", peso: 240, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Farmers Carry", dosis: "200 m · 24 kg", peso: 150, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Sandbag Lunges", dosis: "100 m · 20 kg", peso: 240, distanciaM: nil),
        Estacion(nombre: "Run", dosis: "1,00 km", peso: 270, distanciaM: 1_000),
        Estacion(nombre: "Wall Balls", dosis: "100 reps · 6 kg", peso: 300, distanciaM: nil),
    ]

    static let CASOS: [(nombre: String, estado: Estado)] = [
        ("estación ciega · sled push", Estado(ruta: plantilla441, estacion: 3, cronoS: 2_480, enEstacionS: 0)),
        ("tramo de carrera", Estado(ruta: plantilla441, estacion: 10, cronoS: 2_480, enEstacionS: 20)),
        // El GPS ya ha dado el kilómetro y la estación SIGUE abierta: la
        // cierra el atleta al cruzar, no el hito de distancia.
        ("tramo · metros a cero", Estado(ruta: plantilla441, estacion: 10, cronoS: 2_745, enEstacionS: 285)),
        // La última estación, con el crono pasado de la hora: cinco glifos,
        // 44 pt. Es el caso que justifica el formateador en minutos.
        ("wall balls · pasada la hora", Estado(ruta: plantilla441, estacion: 15, cronoS: 4_200, enEstacionS: 90)),
    ]
}
