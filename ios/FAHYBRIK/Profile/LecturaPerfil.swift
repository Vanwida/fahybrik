import Foundation

// EL CONTRATO DE «PERFIL» — lo que la pestaña del atleta recibe, y solo eso.
//
// Es el espejo, campo a campo, de `web/components/design-twin/kit-perfil/contrato.ts`: la pestaña
// PINTA una `LecturaPerfil` ya resuelta y no decide nada por su cuenta. Quien decide es
// `DecidePerfil` (el sujeto, «Pendiente», las puertas y su pliegue) y `RendimientoEstados` (las
// cinco filas), y quien construye la lectura desde lo que la app YA lee (el store, los servicios,
// el estado local del móvil) es `LecturaPerfil.desde(...)`, en `LecturaPerfil+Cable.swift`. Así la
// app y el doble no pueden divergir: son la misma lectura con los mismos tests.
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md), que esta pestaña respeta ─────────────────────────
//  · 28-jul (Rendimiento): un CONTADOR se pinta también en cero; un VALOR MEDIDO no existe hasta
//    que se mide. Sin ancla de pulso NO hay zonas y no se inventa ninguna; un umbral estimado dice
//    SIEMPRE de dónde sale.
//  · 25-sep (Privacidad): puerta nueva; el movimiento del reloj se retira en un toque, sin «¿seguro?».
//  · 29-sep: el PROGRESO vive en Analíticas. Aquí Rendimiento son las cifras de identidad (1RM,
//    VO₂ máx, zonas, marcas, tests), no gráficas.
//  · SIN COACH (tier libre): cero suscripción, tests, zonas ni metodología.
//  · Las pantallas que cuelgan (Identidad, Entreno, Dispositivos, Cuenta, Privacidad, Ayuda y legal,
//    y las de cada cifra) NO se rehacen aquí: solo su puerta.
//  · HARD RULE Nº0: el catálogo de marcas y los tests son del coach; el nombre del coach es un
//    dato. Nada de esto está cableado en la vista.
//
// ── DIFERENCIAS CON EL CONTRATO DEL DOBLE (a propósito) ───────────────────────────────────────
//  · La foto es la URL (`fotoURL`) y no un booleano: en la web la foto es un marcador dibujado; en
//    el teléfono es la imagen del atleta.
//  · El aviso de la sincronización de COROS NO vive en la lectura: es un aviso pasajero (`AvisoDia`)
//    que dispara la propia carga. Su exclusión con la pregunta pendiente la garantiza el tipo
//    (`ResultadoCoros`: una cosa u otra), no una convención.

// MARK: - Lo que una fuente puede decir

/// Una fuente de datos que se pide por separado. Son TRES estados, no dos, y toda la honestidad de
/// Rendimiento vive en no confundirlos:
///  · `cargando`     aún no ha contestado (ni cifra ni invitación: no se sabe cuál toca);
///  · `contesto`     contestó, con lo que sea, incluido «no hay nada» (un valor nil o vacío);
///  · `sinRespuesta` FALLÓ. Antes se quedaba en `cargando` para siempre (el esqueleto no se iba
///                   nunca); ahora se declara, con su salida.
enum FuenteDelDato<Valor> {
    case cargando
    case sinRespuesta
    case contesto(Valor)

    /// El valor, si ya contestó.
    var valor: Valor? {
        if case let .contesto(v) = self { return v }
        return nil
    }
}

extension FuenteDelDato: Equatable where Valor: Equatable {}

// MARK: - Identidad

/// Lo que se sabe de quien abre la app, ya en el vocabulario de la pantalla.
struct IdentidadPerfil: Equatable {
    /// Cadena vacía = todavía sin nombre (`@DefaultEmptyString`): silueta, no iniciales vacías.
    var nombre = ""
    /// La foto de perfil, ya resuelta contra la API. Nil = sin foto.
    var fotoURL: String?
    /// `AthleteNextRace.divisionLabel`: Open · Pro · Elite. Sale de la carrera objetivo, no del perfil.
    var division: String?
    /// Años cumplidos derivados de `dob`. Nil = sin fecha de nacimiento (nunca se adivina).
    var edad: Int?
    /// `trainingExperienceYears` en años enteros; nil si no hay o si aún no llega al año.
    var anosEntrenando: Int?
    var alturaCm: Double?
    var pesoKg: Double?
    /// FC máxima declarada (`maxHrBpm`). Entrada de una estimación de zonas, no un ancla.
    var fcMax: Int?
    var objetivo: GoalTypeOption?

    var tieneFoto: Bool { fotoURL != nil }

    static let vacia = IdentidadPerfil()
}

// MARK: - Rendimiento: las cinco fuentes

/// La batería de calibración que programa el coach (`BatteryStatus`).
struct BateriaPerfil: Equatable {
    /// Programados. Cero = el coach aún no la programó (jamás se pinta «0 de 0»).
    var total: Int
    /// Con resultado CAPTURADO (no basta con que la sesión se haya hecho).
    var completados: Int
    /// Hechos pero sin su número: `resultPending`.
    var aMedias: Int
}

/// Cuántas pruebas del catálogo del coach tienen ya un récord.
struct MarcasPerfil: Equatable {
    var conRecord: Int
    /// Tamaño del catálogo (0 = aún no hay marcas que probar).
    var catalogo: Int
}

/// `AthleteVo2Max.headline`: lo estima el reloj o sale del test de campo de 12 minutos.
struct Vo2Perfil: Equatable {
    enum Origen: Equatable { case reloj, cooper }
    var valor: Double
    var fuente: Origen
}

/// `HRZoneProfile`: la ancla de pulso resuelta por el SERVIDOR. `origen` es la explicación que
/// escribe para el atleta («Estimado por tu edad») y va SIEMPRE: un umbral inferido que se lee
/// como medido es cómo un número que nadie midió se convierte en evidencia.
struct ZonasPerfil: Equatable {
    var umbralPpm: Int
    var origen: String
}

/// `StrengthMaxProfile`: un 1RM vigente.
struct LevantamientoPerfil: Equatable {
    var etiqueta: String
    var kg: Double
}

struct FuentesRendimiento: Equatable {
    /// Nil (o total 0) = sin batería programada. Solo se pide con coach.
    var bateria: FuenteDelDato<BateriaPerfil?> = .cargando
    var marcas: FuenteDelDato<MarcasPerfil> = .cargando
    /// Nil = nadie lo ha medido.
    var vo2: FuenteDelDato<Vo2Perfil?> = .cargando
    /// Viajan con la identidad: `cargando` hasta que llega. Nil = sin ancla.
    var zonas: FuenteDelDato<ZonasPerfil?> = .cargando
    /// Vacío = sin 1RM registrado. Viene de la porción `strengthMaxes` del store.
    var fuerza: FuenteDelDato<[LevantamientoPerfil]> = .cargando
}

// MARK: - Las puertas: lo que el store y el móvil saben de cada una

/// `SubscriptionInfo` en el vocabulario de la pantalla. Solo con coach: sin coach no hay
/// suscripción (nada que pagar). Fechas ya escritas («12 oct», `FechaES.corta`). La puerta solo
/// dice lo que es NOTICIA: una suscripción al día no cuenta su renovación aquí (eso vive dentro).
enum SuscripcionPerfil: Equatable {
    case activa
    case termina(el: String)
    case prueba(hasta: String?)
    case pagoPendiente
    case cancelada
    case pausada
}

/// La pareja de Dobles (`PartnerEnvelope`). Nil en la lectura = individual.
///  · `conPareja`  emparejados: `PartnerInfo.firstName`;
///  · `sinPareja`  Dobles y nadie invitado aún;
///  · `invitacion` hay una invitación enviada: pendiente, caducada o rechazada. Solo las dos
///                 últimas son un ACTO.
enum ParejaPerfil: Equatable {
    enum EstadoInvitacion: Equatable { case pendiente, caducada, rechazada }
    case conPareja(nombre: String)
    case sinPareja
    /// `caduca` ya viene dicho para meterlo tras «caduca»: «en 12 días», «mañana», «hoy».
    case invitacion(EstadoInvitacion, email: String, caduca: String?)
}

/// Lo que puede estar conectado (`HealthKitConnection`, `AppleWatchWorkoutScheduler`, `WearablesService`).
enum DispositivoPerfil: CaseIterable, Equatable {
    case salud, watch, polar, coros

    /// Con un espacio de no separación en «Apple Salud» / «Apple Watch»: un salto de línea no parte el nombre
    /// de un dispositivo por la mitad («…, Apple / Salud conectado»).
    var nombre: String {
        switch self {
        case .salud: return "Apple\u{00A0}Salud"
        case .watch: return "Apple\u{00A0}Watch"
        case .polar: return "Polar"
        case .coros: return "COROS"
        }
    }
}

/// El permiso del movimiento del reloj (`SensorCaptureConsent`, 25-sep):
///  · `sinPreguntar` aún no ha entrenado con el reloj: la hoja no ha salido;
///  · `permitido`    dijo que sí;
///  · `retirado`     «Ahora no» o apagó el interruptor. No es un fallo: es una decisión.
enum MovimientoReloj: Equatable {
    case sinPreguntar, permitido, retirado
}

/// `WearablePendingLink` de COROS: una actividad nueva que puede ser el entreno previsto de hoy.
struct PreguntaCoros: Equatable {
    /// Hora de inicio de la actividad («7:12»), si el proveedor la trae.
    var inicio: String?
}

// MARK: - La lectura entera de la pestaña

struct LecturaPerfil: Equatable {
    /// Arranque en frío: la identidad aún no ha contestado y no hay caché. Cada pieza que depende
    /// de datos se pinta como esqueleto, NUNCA como un vacío ni con una invitación (aún no sabemos
    /// cuál de las dos toca). Los campos de abajo llevan valores de relleno que la pantalla no lee.
    var cargando = false
    /// La identidad no cargó y no hay caché (`Slice.loadFailed`, AUDIT-B5): se declara con su salida.
    var errorCarga = false

    /// Con coach o sin él (`hasCoach`). Sin coach: sin suscripción, tests, zonas ni metodología.
    var conCoach = true
    /// `planWeek.coachName`. Nil sin coach o si el nombre no llegó.
    var coach: String?

    var identidad = IdentidadPerfil.vacia
    var rendimiento = FuentesRendimiento()

    /// Nil = sin coach (no aplica), o aún no leída.
    var suscripcion: SuscripcionPerfil?
    /// Nil = individual (o aún no leída).
    var dobles: ParejaPerfil?

    var dispositivos: [DispositivoPerfil] = []
    var movimientoReloj = MovimientoReloj.sinPreguntar
    var corosPendiente: PreguntaCoros?

    /// `AppBundleMetadata.displayVersion` («1.0 (103)»). Siete toques abren el diagnóstico del reloj
    /// (no es producto).
    var version: String?
}
