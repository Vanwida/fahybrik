import Foundation

// LO DE HOY PARA LA ESFERA Y EL SMART STACK — el dato y su almacén (P13).
//
// La complicación y el widget de la pila (`FAHYBRIKWatchWidgets`) viven en OTRO proceso
// que la app del reloj: no ven el plan, ni el detalle del coach, ni WatchConnectivity.
// Lo que comparten con ella es UN registro ya leído: qué día es, qué estado tiene
// (sesión, descanso, hecha, sin plan), y las pocas líneas que se pintan. Quien lo
// escribe es la app (`ComplicacionLectura`, que sí conoce el plan); el widget solo lo
// pinta. Así la notación del objetivo sale de `EntradaBrief`/`EntradaNotacion`, la misma
// del brief al que lleva el toque, y no hay una segunda copia en la extensión.
//
// FOUNDATION PURO y sin más dependencias que `Marca`: compila en la app del reloj, en la
// extensión del widget y en FAHYBRIKTests. Lo que NO trae el plan no se inventa: sin
// duración escrita no hay «desde N min», y de mañana la muñeca no sabe nada.

struct ComplicacionHoy: Codable, Equatable {

    /// Qué dice hoy. Las cuatro cosas que puede decir, y ninguna se rellena con otra.
    enum Estado: String, Codable {
        /// Hay sesión por hacer.
        case sesion
        /// El coach programó descanso.
        case descanso
        /// La sesión de hoy ya está guardada.
        case hecha
        /// No hay nada que decir: nada ha llegado del iPhone, o lo que hay es de otro día.
        case sinPlan
    }

    /// El icono de la sesión, por su modalidad. La extensión lo traduce a su símbolo.
    enum Icono: String, Codable {
        case correr, fuerza, mixto, descanso, hecha, iphone
    }

    /// Un arco de la tira: lo que ocupa (solo para repartir el ancho) y si es el trabajo.
    struct Arco: Codable, Equatable {
        let peso: Double
        let trabajo: Bool
    }

    var estado: Estado
    /// El día en que se escribió, `aaaa-mm-dd` en el calendario del reloj. El plan que llega
    /// del iPhone no trae fecha propia, así que «hoy» es el día en que llegó: una foto de
    /// ayer no se enseña como la de hoy (`paraElDia`).
    var dia: String
    /// La cabecera: «Hoy · desde 55 min», «Hoy · hecha», «Hoy».
    var contexto: String
    /// El titular: «6 × 1000 m», «Back Squat», «Descanso», «Sin plan».
    var titulo: String
    /// Lo de debajo, en trozos que se pueden soltar por la cola si no caben:
    /// [«a 3:45–3:55», «r 90″ suave»]. Nunca se corta un dato a la mitad.
    var detalle: [String]
    /// La forma de la sesión: el aro desenrollado. Vacía si el plan no se conoce.
    var forma: [Arco]
    var icono: Icono
    /// «#rrggbb» del acento del club del atleta, o nil = el de fábrica.
    var acento: String?
    /// Hecha a medias: lo dice la palabra, no solo el símbolo.
    var parcial: Bool

    init(estado: Estado, dia: String, contexto: String, titulo: String, detalle: [String] = [],
         forma: [Arco] = [], icono: Icono, acento: String? = nil, parcial: Bool = false) {
        self.estado = estado
        self.dia = dia
        self.contexto = contexto
        self.titulo = titulo
        self.detalle = detalle
        self.forma = forma
        self.icono = icono
        self.acento = acento
        self.parcial = parcial
    }

    // MARK: - Sin plan

    /// No hay nada que decir: se dice, y se dice cómo arreglarlo (la misma frase que la app).
    static func sinPlan(dia: String) -> ComplicacionHoy {
        ComplicacionHoy(estado: .sinPlan, dia: dia, contexto: "Hoy", titulo: "Sin plan",
                        detalle: ["Abre \(Marca.nombre) en el iPhone"], icono: .iphone)
    }

    // MARK: - El día

    /// `aaaa-mm-dd` del calendario dado. Sin `DateFormatter`: ni locale ni zona que lo muevan.
    static func claveDeDia(_ fecha: Date, calendario: Calendar = .current) -> String {
        let c = calendario.dateComponents([.year, .month, .day], from: fecha)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Lo que dice esto en la fecha dada. Si se escribió otro día, ya no es «hoy»: sale
    /// «Sin plan» hasta que el iPhone empuje el día nuevo. Mejor eso que la sesión de ayer.
    func paraElDia(_ fecha: Date, calendario: Calendar = .current) -> ComplicacionHoy {
        let hoy = Self.claveDeDia(fecha, calendario: calendario)
        return dia == hoy ? self : Self.sinPlan(dia: hoy)
    }
}

// MARK: - El almacén compartido

/// El App Group entre la app del reloj y su extensión: un solo registro, el de hoy.
///
/// El identificador sale del bundle (`Marca.grupoApp`, de `BRAND_BUNDLE_ID`), igual que el
/// resto de la marca. Sin grupo (un bundle sin la clave, o un firmado sin la capacidad) no
/// hay dónde escribir: `guardar` lo dice con `false` y la extensión lee «sin plan».
enum ComplicacionAlmacen {

    /// La clave del registro. Con versión: si el modelo cambia, la vieja se ignora.
    static let clave = "fahybrik.complicacion.hoy.v1"

    /// Los defaults del grupo, o nil sin grupo.
    static var compartido: UserDefaults? {
        Marca.grupoApp.flatMap { UserDefaults(suiteName: $0) }
    }

    /// Lo último que escribió la app, o nil si nada (o si no se puede leer).
    static func leer(de defaults: UserDefaults? = compartido) -> ComplicacionHoy? {
        guard let data = defaults?.data(forKey: clave) else { return nil }
        return try? JSONDecoder().decode(ComplicacionHoy.self, from: data)
    }

    /// Escribe el registro. Devuelve si HA CAMBIADO algo: quien llama solo recarga las
    /// líneas de tiempo cuando lo que se ve puede ser distinto. Se compara el VALOR ya leído, no
    /// los bytes: `JSONEncoder` no fija el orden de las claves, y dos escrituras del mismo día
    /// salían distintas y recargaban las líneas de tiempo para nada.
    @discardableResult
    static func guardar(_ hoy: ComplicacionHoy, en defaults: UserDefaults? = compartido) -> Bool {
        guard let defaults else { return false }
        if leer(de: defaults) == hoy { return false }
        guard let data = try? JSONEncoder().encode(hoy) else { return false }
        defaults.set(data, forKey: clave)
        return true
    }


    /// Borra el registro (cierre de sesión): lo que se ve pasa a «sin plan».
    @discardableResult
    static func borrar(de defaults: UserDefaults? = compartido) -> Bool {
        guard let defaults, defaults.data(forKey: clave) != nil else { return false }
        defaults.removeObject(forKey: clave)
        return true
    }
}
