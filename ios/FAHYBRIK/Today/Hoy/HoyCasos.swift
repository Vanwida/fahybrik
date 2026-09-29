#if DEBUG
import SwiftUI

// LOS CASOS DE «HOY» — catorce atletas de ejemplo que recorren todos los estados.
//
// Espejo de `web/components/design-twin/kit-hoy/casos.ts` (los mismos nombres, textos y cifras), para
// que una `#Preview`, la galería de capturas y las pruebas miren EXACTAMENTE lo que el doble. NINGUNO
// sale de la base de producción (CONTRATO-UI §7): son personas inventadas para probar el modelo, y lo
// que las hace útiles es qué estado de cada pieza ejercitan. Solo existen en DEBUG.
//
// El orden es el de un día real, del caso lleno al mínimo (§6.3): el mínimo (⑨ alta) y el vacío total
// (⑩ libre) van a la vista, no escondidos al final.
//
//  MATRIZ: cada pieza, sus cuatro estados
//   Disposición   con datos ①②③   · sin datos ⑨(check-in) · cargando ⑬
//   Camino        fijada ①③      · sin objetivo ⑧⑨          · n/a ⑩     · cargando ⑬ · error ⑭
//   Hoy           sesiones ①⑤    · descanso ⑥⑨ · pausado ⑦  · n/a ⑩     · cargando ⑬ · error ⑭
//   Reclamos      ninguno ①      · uno ⑤⑪                   · varios ⑫
//   Marca         una ①          · sin marca ⑧⑨             · cargando ⑬
//   Pasos         cifra ①        · conectar ⑨               · sin datos ⑧ · leyendo ⑬

struct CasoHoy: Identifiable {
    let id: String
    let titulo: String
    /// Qué simula y qué hay que mirar.
    let mira: String
    let lectura: LecturaHoy
}

enum HoyCasos {

    // MARK: - Los ladrillos

    static let fecha = "Martes 29 sep"

    /// Las cuatro señales, con lo que llegó y lo que no.
    static func senales(checkin: Bool = false, hrv: String? = nil, sueno: String? = nil, fc: String? = nil) -> [Senal] {
        [
            Senal(clave: .checkin, etiqueta: "Check-in", activa: checkin, valor: nil),
            Senal(clave: .hrv, etiqueta: "HRV", activa: hrv != nil, valor: hrv),
            Senal(clave: .sueno, etiqueta: "Sueño", activa: sueno != nil, valor: sueno),
            Senal(clave: .fcReposo, etiqueta: Vocab.fcReposo, activa: fc != nil, valor: fc),
        ]
    }

    static func sesion(
        _ titulo: String,
        _ modalidad: ModalidadHoy,
        _ estado: EstadoSesion = .pendiente,
        franja: SesionHoy.Franja? = nil,
        libre: Bool = false
    ) -> SesionHoy {
        SesionHoy(franja: franja, titulo: titulo, modalidad: modalidad, estado: estado, libre: libre)
    }

    static func carrera(
        _ nombre: String, dias: Int, meta: String?, fase: String?, semana: (Int, Int)?, foto: Int
    ) -> CaminoEstado {
        .fijada(CarreraDelCamino(
            nombre: nombre, dias: dias, meta: meta, fase: fase,
            semana: semana.map { PosicionEnPlan(n: $0.0, m: $0.1) },
            foto: BrandImagery.raceCardBackgrounds[foto]
        ))
    }

    /// La atleta de partida: con coach, plan y carrera; cada caso pisa lo que ejercita.
    static let base = LecturaHoy(
        nombre: "Nora", fecha: fecha, hora: "7:40", conCoach: true, coach: "Mar", iniciales: "NR", fotoURL: nil,
        noLeidosChat: 0, comunicados: 0, checkinPendiente: false, cargando: false,
        disposicion: .medida(score: 84, delta7d: 6, senales: senales(checkin: true, hrv: "68 ms", sueno: "7,4 h", fc: "48 ppm")),
        camino: carrera("HYROX Barcelona", dias: 39, meta: "Sub-65", fase: "Construcción · semana 4 de 12", semana: (4, 12), foto: 0),
        simulacion: .programada(dia: "el sábado", hoy: false),
        hoy: .sesiones([sesion("Series 6×800", .run)]),
        reclamos: [],
        marca: .reciente(MarcaReciente(titulo: "5 km · prueba", valor: "19:58", tendencia: .mejora("\u{2212}1:02 desde la primera"))),
        pasos: .cifra("3.204")
    )

    private static func caso(_ id: String, _ titulo: String, _ mira: String, _ pisa: (inout LecturaHoy) -> Void) -> CasoHoy {
        var l = base
        pisa(&l)
        return CasoHoy(id: id, titulo: titulo, mira: mira, lectura: l)
    }

    // MARK: - Los catorce

    static let todos: [CasoHoy] = [
        caso("listo", "① Nora · 7:40, todo en su sitio",
             "El caso LLENO: disposición alta con sus cuatro señales, la sesión de hoy pendiente, la carrera a 39 días con su fase y posición, una simulación programada, una marca reciente y los pasos.") { _ in },

        caso("manana", "② Iván · 6:55, check-in por hacer",
             "Hay número (lo dio el reloj) pero el check-in matinal sigue pendiente y su señal está apagada. El check-in ES el sujeto: cinco toques y pasa a lo siguiente.") {
            $0.nombre = "Iván"; $0.iniciales = "IV"; $0.hora = "6:55"; $0.checkinPendiente = true
            $0.disposicion = .medida(score: 71, delta7d: 2, senales: senales(hrv: "55 ms", sueno: "6,8 h", fc: "52 ppm"))
            $0.hoy = .sesiones([sesion("Fuerza tren inferior", .strength)])
            $0.pasos = .cifra("812")
        },

        caso("cargado", "③ Carla · cuerpo cargado, sesión por delante",
             "Disposición BAJA (38, −14 en 7 días): la portada dice el estado del cuerpo, jamás una prescripción. El color de la zona no puede parecer una alarma ni un aplauso. Dos mensajes sin leer del coach.") {
            $0.nombre = "Carla"; $0.iniciales = "CA"; $0.noLeidosChat = 2
            $0.disposicion = .medida(score: 38, delta7d: -14, senales: senales(checkin: true, hrv: "41 ms", sueno: "5,1 h", fc: "57 ppm"))
            $0.hoy = .sesiones([sesion("Fuerza tren inferior", .strength)])
            $0.camino = carrera("HYROX Madrid", dias: 12, meta: "Sub-75", fase: "Puesta a punto · semana 11 de 12", semana: (11, 12), foto: 2)
            $0.simulacion = .abierta
        },

        caso("hecho", "④ Dídac · ya ha entrenado",
             "La sesión de hoy está HECHA: el bucle se cierra en la portada. Disposición media. El estado no relanza nada: tocar lleva al Plan.") {
            $0.nombre = "Dídac"; $0.iniciales = "DI"; $0.hora = "19:20"
            $0.disposicion = .medida(score: 58, delta7d: -3, senales: senales(checkin: true, hrv: "49 ms", sueno: "7,0 h", fc: "51 ppm"))
            $0.hoy = .sesiones([sesion("Rodaje suave 8 km", .run, .hecha)])
            $0.pasos = .cifra("11.480")
        },

        caso("doble", "⑤ Marina · dos sesiones, una hecha",
             "AM hecha y PM pendiente: el estado por sesión con su franja, sin que la segunda pase a ser un segundo héroe. Aparece además la batería de tests del coach, con su contador.") {
            $0.nombre = "Marina"; $0.iniciales = "MA"; $0.hora = "13:05"
            $0.hoy = .sesiones([
                sesion("Remo 5×1000", .ergo, .hecha, franja: .am),
                sesion("Fuerza tren superior", .strength, .pendiente, franja: .pm),
            ])
            $0.reclamos = [.tests(hechos: 1, total: 4)]
            $0.pasos = .cifra("6.930")
        },

        caso("descanso", "⑥ Biel · día de descanso",
             "El plan cargó y hoy no hay nada: no se fabrica una sesión. Se dice qué toca mañana. El día de descanso tiene que sentirse como un día bueno, no como una pantalla vacía.") {
            $0.nombre = "Biel"; $0.iniciales = "BI"
            $0.disposicion = .medida(score: 91, delta7d: 8, senales: senales(checkin: true, hrv: "74 ms", sueno: "8,1 h", fc: "46 ppm"))
            $0.hoy = .descanso(manana: Manana(titulo: "Series 8×400", modalidad: .run, dia: "mañana"), hayMasPublicado: true)
            $0.simulacion = .abierta
            $0.pasos = .cifra("2.140")
        },

        caso("pausado", "⑦ Aina · plan en pausa",
             "El coach ha pausado su plan: una pausa tranquila, sin sesión vieja ni tests. Tiene que quedar claro que no es un fallo.") {
            $0.nombre = "Aina"; $0.iniciales = "AI"
            $0.disposicion = .medida(score: 64, delta7d: 1, senales: senales(checkin: true, hrv: "52 ms", sueno: "7,2 h", fc: "50 ppm"))
            $0.hoy = .pausado
            $0.simulacion = .abierta
        },

        caso("sin-objetivo", "⑧ Pol · sin carrera fijada",
             "Plan cargado y ninguna carrera objetivo: el ancla se convierte en invitación con su salida. La fase y la posición desaparecen: sin destino no hay camino que contar.") {
            $0.nombre = "Pol"; $0.iniciales = "PO"
            $0.camino = .sinObjetivo
            $0.simulacion = .abierta
            $0.hoy = .sesiones([sesion("Rodaje 45 min", .run)])
            $0.marca = .ninguna
            $0.pasos = .sinDatos
        },

        caso("alta", "⑨ Lía · recién dada de alta (con coach)",
             "EL CASO MÍNIMO (§6.3): sin número de disposición ni carrera ni marca ni pasos, sin nada publicado, con un check-in por hacer, la batería en 0 de 4 y el primer comunicado del coach. Cada hueco lleva su salida.") {
            $0.nombre = "Lía"; $0.iniciales = "LI"; $0.hora = "9:10"
            $0.checkinPendiente = true; $0.comunicados = 1; $0.noLeidosChat = 1
            $0.disposicion = .sinDatos(.checkinPendiente)
            $0.camino = .sinObjetivo
            $0.simulacion = .abierta
            $0.hoy = .descanso(manana: nil, hayMasPublicado: false)
            $0.reclamos = [.tests(hechos: 0, total: 4)]
            $0.marca = .ninguna
            $0.pasos = .conectar
        },

        caso("libre", "⑩ Marc · sin coach",
             "EL TIER LIBRE: no hay plan, ni chat, ni «Del coach», ni carrera de plan, ni revisión, ni tests. NINGUNA pieza de coach se pinta. El sujeto natural es montar el entreno de hoy.") {
            $0.nombre = "Marc"; $0.iniciales = "MC"; $0.conCoach = false; $0.coach = nil
            $0.camino = nil; $0.simulacion = nil; $0.hoy = nil
            $0.disposicion = .medida(score: 79, delta7d: 4, senales: senales(checkin: true, hrv: "61 ms", sueno: "7,6 h", fc: "49 ppm"))
            $0.pasos = .cifra("5.320")
        },

        caso("a-medias", "⑪ Nora · dejó un entreno a medias",
             "Guardó «Series 6×800» para luego a las 8:12. Retomarlo es lo que reclama, y no compite con la sesión de hoy: es LA MISMA sesión, empezada.") {
            $0.reclamos = [.aMedias(titulo: "Series 6×800", desde: "8:12")]
            $0.hora = "9:30"
        },

        caso("avisos", "⑫ Nora · todo reclama a la vez",
             "El peor caso de densidad: mensajes sin leer, dos comunicados, una batería a medias, una revisión propuesta, su pareja entrenando ahora y la sesión de hoy.") {
            $0.noLeidosChat = 3; $0.comunicados = 2
            $0.reclamos = [
                .parejaEnVivo(nombre: "Biel", detalle: "Metcon 20' · RONDA 3/5"),
                .revision(.propuesta, cuando: nil, minutos: nil, enlace: nil),
                .tests(hechos: 1, total: 4),
            ]
        },

        caso("cargando", "⑬ Arranque en frío (todavía sin datos)",
             "Primera carga sin caché. Cada pieza es un esqueleto con la MISMA forma que tendrá: ni un vacío ni una invitación (aún no sabemos cuál de las dos toca).") {
            $0.nombre = nil; $0.iniciales = ""; $0.cargando = true
            $0.disposicion = .cargando; $0.camino = nil; $0.simulacion = nil; $0.hoy = nil
            $0.marca = .cargando; $0.pasos = .leyendo
        },

        caso("error", "⑭ Primer arranque sin red",
             "Instalación nueva cuyo primer plan no cargó y sin caché: el ancla no puede quedarse girando para siempre. Error con su salida («Reintentar»). Sigue lo que no depende del plan.") {
            $0.hoy = .errorCarga; $0.camino = nil; $0.simulacion = nil; $0.marca = .ninguna
        },
    ]

    static func lectura(_ id: String) -> LecturaHoy {
        guard let c = (todos + extras).first(where: { $0.id == id }) else {
            preconditionFailure("Caso de Hoy desconocido: \(id)")
        }
        return c.lectura
    }

    // MARK: - Los que el doble no modela y la app sí

    /// Estados reales que el contrato del doble no traía: lo que la app puede ver y hay que poder mirar.
    static let extras: [CasoHoy] = [
        caso("extra-sin-salud", "Sin cifra y sin Salud conectada",
             "Cargó y no hay cifra: la salida es conectar Salud o hacer el check-in (con el check-in ya hecho no hay fila).") {
            $0.disposicion = .sinDatos(.saludSinConectar)
        },
        caso("extra-salud-conectada", "Salud conectada, sin muestras",
             "Salud conectada y el reloj aún no ha subido el sueño ni la HRV: se dice, no se cifra.") {
            $0.disposicion = .sinDatos(.saludConectada)
        },
        caso("extra-reservada", "Revisión reservada con enlace",
             "La revisión ya está reservada y el enlace de la videollamada llegó: «Unirse» en la fila.") {
            $0.reclamos = [.revision(.reservada, cuando: "Lunes 5 oct · 18:00", minutos: 30,
                                     enlace: URL(string: "https://meet.example.com/abc"))]
        },
        caso("extra-tests-sin-bateria", "Tests sin batería publicada",
             "El coach aún no ha programado tests: contador en cero, sin denominador inventado.") {
            $0.reclamos = [.tests(hechos: 0, total: nil)]
        },
        caso("extra-marca-empeora", "Marca que empeora",
             "El 5 km de hoy es más lento que el primero: flecha arriba y rojo, sin aplauso ni reproche en la cifra.") {
            $0.marca = .reciente(MarcaReciente(titulo: "5 km · prueba", valor: "21:02", tendencia: .empeora("+0:36 desde la primera")))
        },
        caso("extra-primera-marca", "Primera marca",
             "Con una sola prueba no hay tendencia que afirmar.") {
            $0.marca = .reciente(MarcaReciente(titulo: "5 km · prueba", valor: "22:10", tendencia: .primeraPrueba))
        },
        caso("extra-hay-mas", "Descanso con la semana siguiente publicada",
             "Domingo: hoy no hay nada y mañana ya es la semana que viene. No se dice «nada publicado» si lo hay.") {
            $0.hoy = .descanso(manana: nil, hayMasPublicado: true)
        },
        caso("extra-libre-checkin", "Sin coach con el check-in por hacer",
             "El sujeto es montar el entreno; el check-in queda como fila de salida en «Cómo llegas».") {
            $0.conCoach = false; $0.coach = nil; $0.camino = nil; $0.simulacion = nil; $0.hoy = nil
            $0.checkinPendiente = true
            $0.disposicion = .sinDatos(.checkinPendiente)
            $0.marca = .ninguna; $0.pasos = .conectar
        },
    ]
}

extension HoyCasos {
    /// La portada entera de un caso, como la monta la app pero sin scroll: para las previews y las capturas.
    struct Pantalla: View {
        let lectura: LecturaHoy
        var cierreDelCheckin: CierreDelCheckin?
        var hayNota = false
        /// El margen lateral de la pantalla. Las previews ya lo ponen (`EnAmbasDia`) y lo piden en `false`.
        var conMargen = true

        var body: some View {
            VStack(spacing: 0) {
                HoyCromo(lectura: lectura, acciones: .ninguna)
                HoyCuerpo(lectura: lectura, acciones: .ninguna, cierreDelCheckin: cierreDelCheckin, hayNotaEnElCheckin: hayNota)
                    .padding(.horizontal, conMargen ? Theme.Spacing.pantalla : 0)
                    .padding(.top, Theme.Spacing.xs + 2)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
        }
    }
}

// MARK: - Las previews: un momento por preview, en las dos apariencias y con otro acento

#Preview("Hoy · ① listo · fábrica") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("listo"), conMargen: false) } }
#Preview("Hoy · ① listo · club azul") { EnAmbasDia(club: .pruebaAzul) { HoyCasos.Pantalla(lectura: HoyCasos.lectura("listo"), conMargen: false) } }
#Preview("Hoy · ② check-in") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("manana"), conMargen: false) } }
#Preview("Hoy · ③ cuerpo cargado") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("cargado"), conMargen: false) } }
#Preview("Hoy · ④ hecho") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("hecho"), conMargen: false) } }
#Preview("Hoy · ⑤ dos sesiones") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("doble"), conMargen: false) } }
#Preview("Hoy · ⑥ descanso") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("descanso"), conMargen: false) } }
#Preview("Hoy · ⑦ pausa") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("pausado"), conMargen: false) } }
#Preview("Hoy · ⑧ sin objetivo") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("sin-objetivo"), conMargen: false) } }
#Preview("Hoy · ⑨ alta") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("alta"), conMargen: false) } }
#Preview("Hoy · ⑩ sin coach") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("libre"), conMargen: false) } }
#Preview("Hoy · ⑪ a medias") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("a-medias"), conMargen: false) } }
#Preview("Hoy · ⑫ todo reclama") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("avisos"), conMargen: false) } }
#Preview("Hoy · ⑬ en frío") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("cargando"), conMargen: false) } }
#Preview("Hoy · ⑭ error") { EnAmbasDia { HoyCasos.Pantalla(lectura: HoyCasos.lectura("error"), conMargen: false) } }
#endif
