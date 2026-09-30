import Foundation

// HACIA QUÉ LADO AVISA UN OBJETIVO — el hueco de `Objetivo.avisa` (§4).
//
// El veredicto (`veredictoDe`) ya respeta `Objetivo.avisa`, pero el plan del motor no lo
// rellenaba: un rodaje a zona avisaba también por debajo, y «vas por debajo de Z2» en un
// rodaje suave no es un fallo. La regla del modelo: un techo de zona en un rodaje avisa solo
// por arriba; una serie a ritmo o a Z5, en los dos sentidos.
//
// Es MÉTODO del coach (otro entrenador querría la banda entera en su rodaje), así que nace como
// dato con defecto: `MetodoAviso`. El servidor ya guarda `wrist_alert_continuous_zone` (solo por
// arriba) y el campo por tramo `alert`; cuando el cliente los lea (`AssignmentDetail.wristMethod`,
// aún sin fusionar) entran aquí sin tocar la lógica. Hasta entonces, el defecto.

extension Vivo {

    struct MetodoAviso: Equatable, Codable {
        /// Un rodaje o una tirada a zona avisa solo por arriba.
        var zonaContinuaSoloArriba: Bool

        static let defecto = MetodoAviso(zonaContinuaSoloArriba: true)
    }

    /// Los pasos que se corren de corrido, sin series: el rodaje y la tirada (los de la vuelta automática).
    static let clasesContinuas: Set<Clase> = [.rodaje, .tirada]

    /// ¿Es un paso de correr de corrido (rodaje, tirada), cuyo objetivo de zona o pulso se juzga por un solo lado?
    static func esZonaContinua(_ p: Paso) -> Bool {
        p.rol == .trabajo && clasesContinuas.contains(p.clase)
    }

    /// Rellena `Objetivo.avisa` donde el método lo pide. NO pisa lo que ya venga puesto (un `alert` del tramo).
    static func conSentidoDeAviso(_ pasos: [Paso], _ metodo: MetodoAviso) -> [Paso] {
        guard metodo.zonaContinuaSoloArriba else { return pasos }
        return pasos.map { p in
            guard esZonaContinua(p) else { return p }
            var q = p
            q.objetivos = p.objetivos.map { o in
                guard o.papel == .principal, o.avisa == nil, o.eje == .zona || o.eje == .ppm else { return o }
                var x = o
                x.avisa = .soloArriba
                return x
            }
            return q
        }
    }
}
