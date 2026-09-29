#if DEBUG
import Foundation
import UIKit

// LOS VEINTE CASOS DE «PERFIL» — atletas de ejemplo que recorren todos los estados. Espejo de
// `kit-perfil/casos.ts` y `casos-base.ts`: las MISMAS veinte lecturas, con los mismos números, para
// poder poner cada captura al lado de la de su doble.
//
// NINGUNO sale de la base de producción (CONTRATO-UI §7; «no hay atletas reales»): son personas
// inventadas para probar el modelo, y lo que las hace útiles es qué estado de cada pieza ejercitan.
// Alimentan las `#Preview` y las pruebas (`DecidePerfilTests`, `RendimientoPerfilTests`, la galería
// renderizada); no se compilan en release.
//
// El orden es el de un día real, del caso lleno al mínimo (§6.3: «el caso mínimo es el caso de
// diseño»): el recién dado de alta (② con coach) y el vacío total sin coach (⑱) van a la vista, no
// escondidos al final.

struct CasoPerfil: Identifiable {
    let id: String
    let titulo: String
    /// Qué simula y qué hay que mirar.
    let mira: String
    let lectura: LecturaPerfil
    /// El aviso de la sincronización de COROS que el doble enseña sobre las pestañas (casos ⑲ y ⑳). No
    /// forma parte de la lectura: lo dispara la carga (ver `LecturaPerfil.swift`).
    var aviso: AvisoCoros?
}

enum CasosPerfil {

    // MARK: La foto de ejemplo

    /// Un marcador de foto (un busto sobre un degradado), como el del doble: no hay fotos de atletas
    /// en los ejemplos. Se escribe una vez a un fichero temporal y se pasa como URL, así el avatar de
    /// la app recorre EXACTAMENTE el camino de una foto de verdad (`AsyncImage` sobre una URL).
    static let fotoDeEjemplo: String = {
        let lado: CGFloat = 176
        let imagen = UIGraphicsImageRenderer(size: CGSize(width: lado, height: lado)).image { contexto in
            let cg = contexto.cgContext
            // Una foto es opaca: el degradado (translúcido) va sobre una cara de la app, no sobre nada.
            UIColor(Theme.Color.surfaceElevated).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).setFill()
            cg.fill(CGRect(x: 0, y: 0, width: lado, height: lado))
            let colores = [
                UIColor(Theme.Color.info).withAlphaComponent(0.55).cgColor,
                UIColor(Theme.Color.modalityStrength).withAlphaComponent(0.5).cgColor,
            ]
            if let degradado = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colores as CFArray, locations: [0, 1]) {
                cg.drawLinearGradient(degradado, start: .zero, end: CGPoint(x: lado, y: lado), options: [])
            }
            UIColor(white: 0.16, alpha: 0.6).setFill()
            cg.fillEllipse(in: CGRect(x: lado * 0.345, y: lado * 0.255, width: lado * 0.31, height: lado * 0.31))
            let hombros = UIBezierPath()
            hombros.move(to: CGPoint(x: lado * 0.17, y: lado))
            hombros.addCurve(
                to: CGPoint(x: lado * 0.83, y: lado),
                controlPoint1: CGPoint(x: lado * 0.17, y: lado * 0.62),
                controlPoint2: CGPoint(x: lado * 0.83, y: lado * 0.62)
            )
            hombros.close()
            hombros.fill()
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("perfil-foto-de-ejemplo.png")
        try? imagen.pngData()?.write(to: url)
        return url.absoluteString
    }()

    // MARK: Ladrillos

    static func identidad(
        _ nombre: String,
        foto: Bool = true,
        division: String? = nil,
        edad: Int? = nil,
        anos: Int? = nil,
        alto: Double? = nil,
        peso: Double? = nil,
        fcMax: Int? = nil,
        objetivo: GoalTypeOption? = nil
    ) -> IdentidadPerfil {
        IdentidadPerfil(
            nombre: nombre,
            fotoURL: foto ? fotoDeEjemplo : nil,
            division: division,
            edad: edad,
            anosEntrenando: anos,
            alturaCm: alto,
            pesoKg: peso,
            fcMax: fcMax,
            objetivo: objetivo
        )
    }

    /// Todo con dato: el atleta que lleva un año.
    static let fuentesLlenas = FuentesRendimiento(
        bateria: .contesto(BateriaPerfil(total: 4, completados: 4, aMedias: 0)),
        marcas: .contesto(MarcasPerfil(conRecord: 9, catalogo: 12)),
        vo2: .contesto(Vo2Perfil(valor: 52.8, fuente: .reloj)),
        zonas: .contesto(ZonasPerfil(umbralPpm: 163, origen: "Medido en tu test de umbral")),
        fuerza: .contesto([
            LevantamientoPerfil(etiqueta: "Sentadilla", kg: 140),
            LevantamientoPerfil(etiqueta: "Peso muerto", kg: 165),
            LevantamientoPerfil(etiqueta: "Press banca", kg: 82.5),
        ])
    )

    /// Nada medido: el que acaba de darse de alta. Los contadores se pintan en cero.
    static let fuentesVacias = FuentesRendimiento(
        bateria: .contesto(BateriaPerfil(total: 4, completados: 0, aMedias: 0)),
        marcas: .contesto(MarcasPerfil(conRecord: 0, catalogo: 12)),
        vo2: .contesto(nil),
        zonas: .contesto(nil),
        fuerza: .contesto([])
    )

    static func fuentes(_ base: FuentesRendimiento, _ pisa: (inout FuentesRendimiento) -> Void = { _ in }) -> FuentesRendimiento {
        var f = base
        pisa(&f)
        return f
    }

    static let version = "1.8.0 (312)"

    /// El atleta de partida: con coach, con todo, individual, con reloj. Se le pisa lo que cada caso ejercita.
    static let base = LecturaPerfil(
        coach: "Mar",
        identidad: identidad(
            "Nora Ramos", division: "Open", edad: 34, anos: 6, alto: 172, peso: 64.5, fcMax: 188, objetivo: .improveHyroxMark
        ),
        rendimiento: fuentesLlenas,
        suscripcion: .activa,
        dispositivos: [.salud, .watch, .coros],
        movimientoReloj: .permitido,
        version: version
    )

    /// El recién dado de alta con coach: solo el nombre, nada medido, sin foto ni reloj.
    static func alta(_ l: inout LecturaPerfil) {
        l.identidad = identidad("Marc Puig", foto: false)
        l.rendimiento = fuentesVacias
        l.suscripcion = .activa
        l.dispositivos = []
        l.movimientoReloj = .sinPreguntar
    }

    /// Sin coach (tier libre): sin suscripción y sin las fuentes de coach (batería y zonas no se piden).
    static func libre(_ l: inout LecturaPerfil) {
        l.conCoach = false
        l.coach = nil
        l.suscripcion = nil
        l.rendimiento = fuentes(fuentesLlenas) { $0.bateria = .contesto(nil); $0.zonas = .contesto(nil) }
    }

    private static func caso(
        _ id: String, _ titulo: String, _ mira: String,
        aviso: AvisoCoros? = nil,
        _ pisa: (inout LecturaPerfil) -> Void = { _ in }
    ) -> CasoPerfil {
        var l = base
        pisa(&l)
        return CasoPerfil(id: id, titulo: titulo, mira: mira, lectura: l, aviso: aviso)
    }

    private static let nuria = identidad(
        "Núria Pla", edad: 33, anos: 5, alto: 170, peso: 61, fcMax: 186, objetivo: .improveRunning
    )

    // MARK: Los veinte casos

    static let todos: [CasoPerfil] = [
        caso(
            "veterano",
            "① Nora · un año dentro, todo con dato",
            "El caso LLENO: foto, subtítulo con sus métricas (sin «nivel» inventado), las cinco cifras de Rendimiento con su origen, reloj conectado y movimiento permitido. Mira qué manda (la identidad), que las cifras se leen de un golpe y que los ajustes quedan abajo: las puertas que dicen algo a la vista y las mudas (Cuenta, Ayuda y legal) plegadas."
        ),
        caso(
            "alta",
            "② Marc · recién dado de alta (con coach)",
            "El CASO MÍNIMO: sin foto, sin métricas, sin reloj, nada medido. No puede parecer roto: el sujeto se vuelve invitación (la acción es completar el perfil, la foto se pone tocando el avatar), los contadores se pintan en cero (0 de 4, 0 de 12), y lo que el atleta puede medir declara su salida en vez de un guion.",
            alta
        ),
        caso(
            "libre",
            "③ Iris · sin coach (tier libre)",
            "Tres cifras en vez de cinco: sin tests ni zonas (las calibra un coach), sin suscripción en «Identidad», sin metodología en «Cuenta», sin chip de coach. La pieza impar (fuerza) ocupa el ancho. Ninguna pieza de coach se pinta, ni siquiera vacía."
        ) { l in
            libre(&l)
            l.identidad = identidad("Iris Costa", edad: 29, anos: 3, alto: 168, peso: 58, objetivo: .improveRunning)
            l.rendimiento = fuentes(l.rendimiento) {
                $0.marcas = .contesto(MarcasPerfil(conRecord: 2, catalogo: 12))
                $0.vo2 = .contesto(Vo2Perfil(valor: 44.1, fuente: .reloj))
                $0.fuerza = .contesto([LevantamientoPerfil(etiqueta: "Sentadilla", kg: 90)])
            }
            l.dispositivos = [.salud]
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "pareja",
            "④ Dídac · con su pareja de Dobles",
            "Entrena en Dobles con Biel: la pareja es parte de quién eres, así que sale como marca en el sujeto («Dobles · con Biel») y como estado de la puerta Identidad. No hay nada que hacer, así que no reclama."
        ) { l in
            l.identidad = identidad("Dídac Font", division: "Open", edad: 31, anos: 4, alto: 181, peso: 78, fcMax: 190, objetivo: .firstHyrox)
            l.dobles = .conPareja(nombre: "Biel")
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 3, aMedias: 0))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 5, catalogo: 12))
                $0.vo2 = .contesto(Vo2Perfil(valor: 48.2, fuente: .reloj))
                $0.fuerza = .contesto([
                    LevantamientoPerfil(etiqueta: "Sentadilla", kg: 150),
                    LevantamientoPerfil(etiqueta: "Peso muerto", kg: 190),
                ])
            }
        },
        caso(
            "sin-ancla",
            "⑤ Pol · zonas sin ancla",
            "Tiene VO₂ y 1RM pero ninguna ancla de pulso: NO hay zonas y no se inventa ninguna. La tesela de zonas declara el hueco con los DOS actos que lo llenan (fecha de nacimiento o test de umbral) y nadie le ve una cifra por defecto."
        ) { l in
            l.identidad = identidad("Pol Vidal", alto: 181, peso: 79)
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 0, aMedias: 0))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 2, catalogo: 12))
                $0.vo2 = .contesto(Vo2Perfil(valor: 42.4, fuente: .reloj))
                $0.zonas = .contesto(nil)
                $0.fuerza = .contesto([
                    LevantamientoPerfil(etiqueta: "Sentadilla", kg: 120),
                    LevantamientoPerfil(etiqueta: "Peso muerto", kg: 245),
                ])
            }
            l.dispositivos = [.salud, .watch]
        },
        caso(
            "tests-a-medias",
            "⑥ Aina · tests a medias, zonas estimadas",
            "Batería 2 de 4 con un test hecho pero sin su número («1 sin resultado»): es la única tesela que pide un acto y lo dice en tinte y regleta, no en la cifra. Sus zonas salen de su edad y la tesela lo escribe («Estimado por tu edad»): un umbral inferido nunca se lee como medido."
        ) { l in
            l.identidad = identidad("Aina Serra", division: "Open", edad: 27, anos: 2, alto: 165, peso: 56, objetivo: .firstHyrox)
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 2, aMedias: 1))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 3, catalogo: 12))
                $0.vo2 = .contesto(Vo2Perfil(valor: 46.5, fuente: .cooper))
                $0.zonas = .contesto(ZonasPerfil(umbralPpm: 171, origen: "Estimado por tu edad"))
                $0.fuerza = .contesto([LevantamientoPerfil(etiqueta: "Peso muerto", kg: 105)])
            }
        },
        caso(
            "reloj-retirado",
            "⑦ Jan · reloj conectado, movimiento retirado",
            "Tiene Apple Salud y Apple Watch, y dijo «Ahora no» al movimiento del reloj. Es una decisión suya, no un fallo: la puerta Privacidad dice «Movimiento del reloj: retirado» en tono neutro (ni verde ni rojo) y se ve a la primera: una decisión sobre tus datos no se esconde tras un pliegue, aunque no pida nada."
        ) { l in
            l.identidad = identidad("Jan Roca", division: "Pro", edad: 36, anos: 9, alto: 178, peso: 74, fcMax: 184, objetivo: .improveHyroxMark)
            l.dispositivos = [.salud, .watch]
            l.movimientoReloj = .retirado
        },
        caso(
            "coros",
            "⑧ Núria · COROS pregunta «¿esto es el entreno?»",
            "Hay una actividad nueva de COROS y un entreno previsto hoy. Antes era un diálogo del sistema que saltaba al abrir Perfil; aquí es la primera fila de «Pendiente», con sus tres respuestas a la vista (Sí, No, Ahora no). Pruébalas: la fila se va y avisa de qué pasa con la actividad."
        ) { l in
            l.identidad = nuria
            l.dispositivos = [.coros, .salud]
            l.corosPendiente = PreguntaCoros(inicio: "7:12")
        },
        caso(
            "sin-nombre",
            "⑨ Perfil sin nombre aún",
            "La cuenta existe y el nombre no llegó: silueta en vez de iniciales vacías, y el título es una pregunta, no un hueco («¿Cómo te llamas?»). Sigue habiendo altura y peso, así que se ve el subtítulo. La acción es poner el nombre."
        ) { l in
            l.identidad = identidad("", foto: false, alto: 175, peso: 70)
            l.rendimiento = fuentesVacias
            l.dispositivos = []
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "cargando",
            "⑩ Arranque en frío (todavía sin datos)",
            "Primera carga sin caché. El sujeto y las cifras son esqueletos con la MISMA forma que tendrán: ni un vacío ni una invitación (aún no sabemos cuál de las dos toca). Las puertas dicen lo que hay dentro, porque su estado aún no se sabe, y «Pendiente» no se pinta hasta saber si hay algo."
        ) { l in
            l.cargando = true
            l.identidad = .vacia
            l.rendimiento = FuentesRendimiento()
            l.suscripcion = nil
            l.dispositivos = []
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "error",
            "⑪ Primer arranque sin red",
            "La identidad no cargó y no hay caché: el sujeto no puede quedarse girando para siempre. Error con su salida («Reintentar») y las cifras, una sola frase que dice por qué y dónde está la salida (no cinco teselas de error). Lo que no depende de la red sigue vivo: cuenta, privacidad, ayuda y cerrar sesión."
        ) { l in
            l.errorCarga = true
            l.identidad = .vacia
            l.rendimiento = FuentesRendimiento(
                bateria: .sinRespuesta, marcas: .sinRespuesta, vo2: .sinRespuesta, zonas: .sinRespuesta, fuerza: .sinRespuesta
            )
            l.suscripcion = nil
            l.dispositivos = []
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "denso",
            "⑫ Carla · todo con aviso a la vez",
            "El peor caso de densidad: pago pendiente, invitación de Dobles caducada, pregunta de COROS, tests a medias, zonas estimadas, sin VO₂, movimiento retirado y sin foto. «Pendiente» las reparte en el orden en que caducan, la puerta Identidad se tiñe de aviso y Privacidad dice su decisión sin abrir nada; el sujeto y las cifras no se pierden."
        ) { l in
            l.identidad = identidad("Carla Pons", foto: false, division: "Open", edad: 38, anos: 7, alto: 166, peso: 60, objetivo: .improveHyroxMark)
            l.suscripcion = .pagoPendiente
            l.dobles = .invitacion(.caducada, email: "aleix@ejemplo.es", caduca: nil)
            l.corosPendiente = PreguntaCoros(inicio: "19:05")
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 2, aMedias: 1))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 1, catalogo: 12))
                $0.vo2 = .contesto(nil)
                $0.zonas = .contesto(ZonasPerfil(umbralPpm: 168, origen: "Estimado por tu edad"))
                $0.fuerza = .contesto([LevantamientoPerfil(etiqueta: "Press banca", kg: 47.5)])
            }
            l.dispositivos = [.salud]
            l.movimientoReloj = .retirado
        },
        caso(
            "termina",
            "⑬ Lluís · la suscripción termina el 12 oct",
            "Cancelada al final del periodo: sigue con acceso hasta esa fecha. No es un acto (nada que resolver hoy), es un estado: sale en la puerta Identidad con marca de aviso y esa puerta no se pliega, pero «Pendiente» no aparece."
        ) { l in
            l.identidad = identidad("Lluís Bosch", edad: 42, anos: 10, alto: 183, peso: 84, fcMax: 179, objetivo: .completeFun)
            l.suscripcion = .termina(el: "12 oct")
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 4, aMedias: 0))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 6, catalogo: 12))
                $0.vo2 = .contesto(Vo2Perfil(valor: 41.0, fuente: .cooper))
                $0.zonas = .contesto(ZonasPerfil(umbralPpm: 154, origen: "Con el umbral que declaraste"))
            }
        },
        caso(
            "fuente-caida",
            "⑭ Vera · el VO₂ no contestó",
            "Una sola fuente falló y las otras cuatro llegaron. La tesela afectada dice «No pudimos cargarlo» con su «Reintentar» (no se queda en esqueleto para siempre, que es lo que hacía la app) y el recuento «N de 5 con dato» se calla: con una pieza desconocida sería un número que miente."
        ) { l in
            l.identidad = identidad("Vera Molina", division: "Open", edad: 30, anos: 3, alto: 169, peso: 62, fcMax: 190, objetivo: .firstHyrox)
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 1, aMedias: 0))
                $0.marcas = .contesto(MarcasPerfil(conRecord: 4, catalogo: 12))
                $0.vo2 = .sinRespuesta
                $0.zonas = .contesto(ZonasPerfil(umbralPpm: 167, origen: "Medido en tu test de umbral"))
            }
        },
        caso(
            "largos",
            "⑮ Nombre y datos largos",
            "Límite de maquetación: un nombre de 35 letras, un subtítulo con todo, una pareja con nombre largo y un estado de puerta que da tres líneas. El nombre baja de tamaño en vez de ganar una tercera línea; nada desborda, nada se corta."
        ) { l in
            l.identidad = identidad(
                "Alejandro Sánchez-Villanueva Ortega",
                division: "Elite", edad: 41, anos: 12, alto: 188, peso: 92.5, fcMax: 181, objetivo: .improveHyroxMark
            )
            l.coach = "Marina"
            l.dobles = .conPareja(nombre: "María del Carmen")
            l.suscripcion = .activa
        },
        caso(
            "sin-pareja",
            "⑯ Bruno · Dobles sin compañero/a",
            "Su plan es de Dobles y aún no ha invitado a nadie: es un ACTO (invitar por email), así que entra en «Pendiente» con su salida y la puerta Identidad lo marca con la marca de «puedes hacer algo». Además su coach no le ha programado tests: la tesela lo dice y no pinta «0 de 0», porque no hay ningún acto que él pueda hacer."
        ) { l in
            l.identidad = identidad("Bruno Camps", foto: false, division: "Open", edad: 35, anos: 5, alto: 179, peso: 80)
            l.dobles = .sinPareja
            l.rendimiento = fuentes(fuentesLlenas) {
                // Su coach aún no le ha programado la batería: sin contador, y sin acto que él pueda hacer.
                $0.bateria = .contesto(nil)
                $0.marcas = .contesto(MarcasPerfil(conRecord: 1, catalogo: 12))
                $0.vo2 = .contesto(nil)
                $0.zonas = .contesto(nil)
                $0.fuerza = .contesto([])
            }
            l.dispositivos = []
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "invitacion",
            "⑰ Emma · invitación de Dobles enviada",
            "Invitó a su compañero y espera: no hay nada que hacer, así que NO entra en «Pendiente» (esperar no es un acto). Solo lo cuenta la puerta Identidad, con cuándo caduca. Y su coach aún no ha definido marcas: la tesela dice que no hay nada que probar (sin salida, porque no es cosa suya)."
        ) { l in
            l.identidad = identidad("Emma Ribas", division: "Open", edad: 28, anos: 3, alto: 164, peso: 55, fcMax: 192)
            l.dobles = .invitacion(.pendiente, email: "oriol@ejemplo.es", caduca: "en 12 días")
            l.rendimiento = fuentes(fuentesLlenas) {
                $0.bateria = .contesto(BateriaPerfil(total: 4, completados: 1, aMedias: 0))
                // Su coach aún no ha definido el catálogo de marcas: no hay nada que probar, y se dice.
                $0.marcas = .contesto(MarcasPerfil(conRecord: 0, catalogo: 0))
                $0.vo2 = .contesto(Vo2Perfil(valor: 43.7, fuente: .reloj))
                $0.fuerza = .contesto([
                    LevantamientoPerfil(etiqueta: "Sentadilla", kg: 85),
                    LevantamientoPerfil(etiqueta: "Peso muerto", kg: 110),
                ])
            }
        },
        caso(
            "libre-alta",
            "⑱ Leo · sin coach y recién dado de alta",
            "El vacío TOTAL del tier libre: tres teselas y las tres con su invitación, sin ninguna pieza de coach y sin nombre de coach en ninguna parte. Es el perfil más corto que existe y no puede parecer una pantalla a medias."
        ) { l in
            libre(&l)
            l.identidad = identidad("Leo Marín", foto: false)
            l.rendimiento = fuentes(fuentesVacias) { $0.bateria = .contesto(nil); $0.zonas = .contesto(nil) }
            l.dispositivos = []
            l.movimientoReloj = .sinPreguntar
        },
        caso(
            "coros-importados",
            "⑲ Núria · COROS acaba de importar entrenos",
            "La sincronización de COROS al abrir Perfil trajo dos entrenos. Antes era una alerta que había que descartar; aquí es un aviso pasajero sobre las pestañas (sin botón: es una buena noticia y se va sola). Lo que no cambia: el texto es el de la app.",
            aviso: AvisoCoros(tono: .ok, texto: "Importados 2 entrenos de COROS.")
        ) { l in
            l.identidad = nuria
            l.dispositivos = [.coros, .salud]
        },
        caso(
            "coros-fallo",
            "⑳ Núria · COROS no pudo sincronizar",
            "La sincronización falló (sin red). Un fallo no se va solo: el aviso se queda hasta que se descarta con «Entendido», como la alerta de antes, y nada más de la pantalla se ve afectado.",
            aviso: AvisoCoros(tono: .fallo, texto: "Sin conexión. Vuelve a intentarlo cuando tengas red.")
        ) { l in
            l.identidad = nuria
            l.dispositivos = [.coros, .salud]
        },
    ]

    static func caso(_ id: String) -> CasoPerfil {
        guard let c = todos.first(where: { $0.id == id }) else { preconditionFailure("Caso de Perfil desconocido: \(id)") }
        return c
    }
}
#endif
