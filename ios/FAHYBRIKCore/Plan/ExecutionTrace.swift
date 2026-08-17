import Foundation

// EL ARCHIVO DE LA CARRERA, TAL Y COMO LLEGA.
//
// `execution.trace` (web/lib/execution/session-trace.ts). Tres piezas y una regla
// que las separa:
//
//   · `splits`     — los kilómetros, calculados sobre la traza ENTERA. **Esta es
//                    la fuente para cualquier cifra.**
//   · `displayCurve` — ritmo y pulso reducidos a 600 puntos SOLO PARA DIBUJAR.
//                    De aquí no sale una media, ni un split, ni un número que se
//                    enseñe: se dibuja y ya. El nombre lleva el prefijo justo
//                    para que nadie las confunda.
//   · `route`      — el recorrido, con la zona de ritmo de cada punto.
//
// `available: false` NO es un error: es una sesión sin archivo. Las trazas
// empiezan el 11 de agosto de 2026, así que es el estado de TODO lo anterior, y
// se dice con una frase en vez de con seis secciones vacías.

struct ExecutionTrace: Codable, Equatable {
    /// false = no hay traza guardada para esta ejecución. Los demás campos vienen
    /// vacíos, nunca ausentes.
    var available = false
    /// El corte por kilómetro, con fidelidad completa.
    var splits: [KmSplitDTO] = []
    var displayCurve = DisplayCurve()
    var route = RouteDTO()

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        available = try c.decodeIfPresent(Bool.self, forKey: .available) ?? false
        splits = (try c.decodeIfPresent(LossyArray<KmSplitDTO>.self, forKey: .splits))?
            .wrappedValue ?? []
        displayCurve = try c.decodeIfPresent(DisplayCurve.self, forKey: .displayCurve)
            ?? DisplayCurve()
        route = try c.decodeIfPresent(RouteDTO.self, forKey: .route) ?? RouteDTO()
    }

    init() {}

    /// Las dos series que se dibujan. `pace` viene ya en s/km —la traza guarda
    /// velocidad y el servidor convierte la unidad al leer, nunca la
    /// interpretación—, y los puntos parados sencillamente no están: parado no
    /// tiene ritmo, tiene una pausa.
    struct DisplayCurve: Codable, Equatable {
        var pace: DisplaySeries?
        var hr: DisplaySeries?
        init(pace: DisplaySeries? = nil, hr: DisplaySeries? = nil) {
            self.pace = pace
            self.hr = hr
        }
    }

    /// Una serie archivada: cadencia variable y huecos SIN rellenar. Los dos
    /// arrays van en paralelo; el más corto manda al leer.
    struct DisplaySeries: Codable, Equatable {
        var offsetsS: [Double] = []
        var values: [Double] = []

        /// Pares (t, v), ya emparejados y en orden. Los valores no finitos se
        /// tiran: un `NaN` en medio parte la curva en un sitio donde no pasó nada.
        var muestras: [Muestra] {
            let n = min(offsetsS.count, values.count)
            var out: [Muestra] = []
            out.reserveCapacity(n)
            for i in 0..<n where offsetsS[i].isFinite && values[i].isFinite {
                out.append(Muestra(t: offsetsS[i], v: values[i]))
            }
            return out
        }
    }

    /// Un kilómetro cerrado por el servidor. `durationS` nulo = el cruce no se
    /// pudo interpolar honestamente (hubo un hueco grande de señal ahí), y
    /// entonces el kilómetro existe pero no tiene ritmo que enseñar.
    struct KmSplitDTO: Codable, Equatable {
        let index: Int
        let partial: Bool
        let distanceM: Double
        let durationS: Double?
        let avgPaceSPerKm: Double?
        let avgHr: Double?
        let elevationGainM: Double?
    }

    /// El mapa. Disponibilidad PROPIA: una ruta puede existir sin traza (y al
    /// revés, en cinta), así que esto no cuelga de `available`.
    struct RouteDTO: Codable, Equatable {
        var available = false
        var points: [RoutePointDTO] = []
        /// Las bandas de ritmo del atleta, ya resueltas por el servidor, en orden
        /// de la más fácil a la más dura. Nulas = el atleta no tiene zonas
        /// medidas, y entonces el recorrido se pinta sin color: un mapa sin color
        /// es honesto, uno con color inventado no.
        var paceZones: [ResolvedZoneDTO]?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            available = try c.decodeIfPresent(Bool.self, forKey: .available) ?? false
            points = (try c.decodeIfPresent(LossyArray<RoutePointDTO>.self, forKey: .points))?
                .wrappedValue ?? []
            paceZones = (try c.decodeIfPresent(
                LossyArray<ResolvedZoneDTO>.self, forKey: .paceZones))?.wrappedValue
        }

        init() {}
    }

    struct RoutePointDTO: Codable, Equatable {
        let lat: Double
        let lon: Double
        /// Código de la banda en ESTE punto ("Z3"). Nulo cuando este punto concreto
        /// no se pudo clasificar, aunque el resto del recorrido sí tenga color.
        let zoneCode: String?
    }

    /// Una banda de ritmo del atleta. Se decodifican solo el código y el orden: el
    /// color lo pone la app desde su propia escalera de zonas, que es la misma en
    /// el mapa, en el reparto y en el resto de la pantalla.
    struct ResolvedZoneDTO: Codable, Equatable {
        let code: String
        let sortOrder: Int?
    }
}

extension ExecutionTrace.RouteDTO {
    /// El número de zona de un código ("Z3" → 3), resuelto contra el ORDEN que
    /// mandó el servidor y no partiendo la cadena: los códigos son método del
    /// coach y otro entrenador puede llamarlas de otra manera. Sin bandas, o con
    /// un código que no está en ellas, no hay zona — y sin zona no hay color.
    func zona(deCodigo codigo: String?) -> Zona? {
        guard let codigo, let paceZones, !paceZones.isEmpty else { return nil }
        guard let i = paceZones.firstIndex(where: { $0.code == codigo }) else { return nil }
        // `sort_order` cuando viene; si no, el orden del array, que el servidor
        // sirve de la más fácil a la más dura. La escalera de color tiene cinco
        // peldaños, así que un modelo con más zonas se apoya en el último.
        let orden = paceZones[i].sortOrder ?? (i + 1)
        return min(max(orden, 1), 5)
    }
}
