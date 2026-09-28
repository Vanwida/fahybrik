import CoreLocation

/// Lo que dirían el GPS y la cinta en una prueba o una captura, sin arrancar
/// CoreLocation ni el Bluetooth (en CI no hay ni señal ni permiso, y un permiso
/// de ubicación taparía la captura). Solo lo que el motor NO ve: los metros, el
/// pulso y la cadencia entran por el motor real (`sampleRunDistance`,
/// `injectLiveHR`, `sampleRunCadence`). En la app es `nil`.
struct VivoLecturaDePrueba: Equatable {
    var gps: Vivo.EstadoGps = .listo
    /// El recorrido hasta aquí, para la página Mapa.
    var ruta: [CLLocationCoordinate2D] = []
    /// El ritmo de AHORA (s/km) que daría la banda de la cinta.
    var ritmo: Double? = nil

    static func == (a: VivoLecturaDePrueba, b: VivoLecturaDePrueba) -> Bool {
        a.gps == b.gps && a.ritmo == b.ritmo && a.ruta.count == b.ruta.count
            && zip(a.ruta, b.ruta).allSatisfy { $0.latitude == $1.latitude && $0.longitude == $1.longitude }
    }
}
