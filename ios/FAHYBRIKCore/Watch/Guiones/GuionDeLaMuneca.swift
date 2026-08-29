import SwiftUI

// LA MUÑECA SOLA — lo que sabe sin que el teléfono haya dicho una palabra.
//
// AQUÍ HABÍA UNA PANTALLA QUE DECÍA «CONECTANDO…» y «El entreno se controla desde el
// iPhone», con un spinner, hasta que llegara la primera trama. Era la pieza que
// producía la clase 1 del debugger del 29-ago: el reloj arrancaba, la sesión de
// HealthKit era SUYA y estaba grabando, y aun así la pantalla decía que el entreno
// era de otro y no ofrecía ni pausa ni fin. Una sesión que la muñeca no puede mirar
// ni parar no es una sesión suya, aunque el objeto viva en su proceso.
//
// El modelo de Apple es el que manda: `HKWorkoutSession` vive EN EL RELOJ y el
// teléfono es el acompañante. Así que lo que la muñeca mide, la muñeca lo pinta —
// ahora mismo, sin esperar a nadie:
//
//   · el reloj y las calorías, del `HKLiveWorkoutBuilder`;
//   · los metros, del mismo builder (`metrosPropios`);
//   · el pulso, de su propio sensor.
//
// Y cuando el teléfono habla, sus tramas ENRIQUECEN esto (qué pierna, qué objetivo,
// el veredicto del ritmo) en vez de ser la condición para que exista una pantalla.
//
// NO ES UN SEGUNDO MOTOR: aquí no hay cursor de tramos, ni avance, ni prescripción.
// No se decide nada — se enseña lo que Apple ya midió. La misma interfaz de tres
// páginas de correr (`GuionCorrer`), con la pieza ABIERTA, que es la verdad: nadie
// le ha dicho a la muñeca qué tramo es éste.

enum GuionDeLaMuneca {

    struct Estado {
        /// De la configuración con la que se creó la sesión, no de una frase del cable.
        var esCorrer: Bool = true
        /// Del `HKLiveWorkoutBuilder`.
        var segundos: Double = 0
        /// Del mismo builder. Nil / 0 = Apple todavía no ha contado un metro.
        var metros: Double? = nil
        var bpm: Int? = nil
        var zona: HRZone? = nil
        var enPausa: Bool = false
    }

    /// Las páginas de la muñeca sola. Correr son las tres de siempre; cualquier otra
    /// cosa son las dos que el reloj sabe medir sin ayuda (tiempo y pulso) más sus
    /// controles.
    static func paginas(_ e: Estado, _ g: GuionCorrer.Gestos) -> [WatchPagina] {
        guard e.esCorrer else { return noCorrer(e, g) }
        return GuionCorrer.paginas(comoCorrer(e), g)
    }

    /// El estado de correr, relleno con lo que mide la muñeca. La pieza va ABIERTA
    /// porque es la verdad: sin trama nadie le ha dicho qué tramo es éste, así que el
    /// sujeto cae al reloj de la sesión y la banda dice «llevas» — no se inventa un
    /// objetivo ni se pinta lo que falta de algo que no se conoce.
    static func comoCorrer(_ e: Estado) -> GuionCorrer.Estado {
        GuionCorrer.Estado(
            contextoPieza: "Al aire libre",
            fase: e.enPausa ? .pausa : .corriendo,
            pieza: .abierta,
            enPiezaS: e.segundos,
            sesionS: e.segundos,
            sesionMetros: metrosMedidos(e),
            sesionRitmoSecPorKm: ritmo(e),
            // El ritmo de LA PIEZA es el de la sesión mientras la pieza es la sesión
            // entera, que es exactamente lo que pasa cuando nadie la ha troceado.
            ritmoSecPorKm: ritmo(e),
            bpm: e.bpm,
            zonaViva: e.zona,
            // El parcial lo sella el motor del teléfono: sin él no hay a quién
            // pedirle un corte, y un botón al vacío es peor que no tenerlo.
            puedeCortarTramo: false
        )
    }

    /// Los metros sólo existen cuando Apple ha contado alguno. Un cero se pinta como
    /// una medida y no lo es.
    private static func metrosMedidos(_ e: Estado) -> Double? {
        guard let m = e.metros, m > 0 else { return nil }
        return m
    }

    /// El ritmo por la MISMA derivación única del motor. Nil sin metros o sin reloj:
    /// no hay media que inventar.
    private static func ritmo(_ e: Estado) -> Int? {
        WorkoutSession.paceSecPerKm(meters: metrosMedidos(e), seconds: e.segundos)
            .map { Int($0.rounded()) }
            .flatMap { $0 <= RunLegDisplay.maxPaceSecPerKm ? $0 : nil }
    }

    /// Fuerza, ergo, lo que sea: el reloj mide pulso y tiempo y nada más. Se enseña
    /// eso, con sus controles, en vez de un spinner.
    private static func noCorrer(_ e: Estado, _ g: GuionCorrer.Gestos) -> [WatchPagina] {
        var paginas: [WatchPagina] = [
            WatchPaginasComunes.tiempo(
                segundos: e.segundos,
                contexto: e.enPausa ? "En pausa · llevas" : "Llevas"
            )
        ]
        if let pulso = WatchPaginasComunes.pulso(bpm: e.bpm, zone: e.zona) {
            paginas.append(pulso)
        }
        paginas.append(controles(e, g))
        return paginas
    }

    /// Los controles de la muñeca sola: los DOS que actúan sobre la sesión que ella
    /// OWNS. Pausar es de Apple sobre su propia `HKWorkoutSession`; terminar cierra
    /// la grabación y la guarda. Ninguno necesita que el teléfono conteste.
    static func controles(_ e: Estado, _ g: GuionCorrer.Gestos) -> WatchPagina {
        .controles(
            id: GuionCorrer.idControles,
            contexto: "\(e.enPausa ? "En pausa" : "Entreno") · \(WatchFormat.clock(e.segundos))",
            botones: [
                WatchBoton(
                    id: "pausa",
                    titulo: e.enPausa ? "Reanudar" : "Pausar",
                    peso: .principal,
                    onToca: e.enPausa ? g.reanudar : g.pausar
                ),
                WatchBoton(
                    id: "terminar",
                    titulo: "Terminar",
                    peso: .destructiva,
                    confirma: "¿Terminar y guardar?",
                    onToca: g.terminar
                ),
            ]
        )
    }
}
