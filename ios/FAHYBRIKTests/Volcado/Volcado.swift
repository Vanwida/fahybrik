import SwiftUI
import UIKit
import XCTest
@testable import FAHYBRIK

// EL VOLCADO DE PANTALLAS — cómo una vista de SwiftUI acaba siendo un PNG que un
// humano pueda MIRAR.
//
// ESTO NO ES UNA PRUEBA. No afirma nada sobre la app: su trabajo es producir
// imágenes. Falla en un solo caso —cuando no consigue producirlas— y entonces dice
// cuál y por qué, porque un volcado que se salta una pantalla en silencio es peor
// que no tenerlo: deja creyendo que se miró algo que no se miró.
//
// POR QUÉ EXISTE
// --------------
// Una pantalla se venía cotejando leyendo Swift contra Swift: exacto para los
// números y CIEGO para el resultado óptico. Dos pantallas se rechazaron por su
// acabado y a una le faltaba el FONDO ENTERO — que ningún cotejo de código iba a
// delatar, porque el fondo no lo pinta la vista: lo pone quien la coloca.
//
// **DE AHÍ LA REGLA: SE VUELCA LA PANTALLA, NO LA VISTA.** Una vista que vive
// dentro de otra se renderiza sobre nada y miente justo en lo único que este
// volcado existe para enseñar. Quien vuelque una tiene que reproducir lo que su
// sitio le pone encima —lienzo, tinte, márgenes— y decir de dónde lo copió, para
// que el día que el sitio cambie se vea que la copia se quedó atrás.
//
// POR QUÉ SE DIBUJA EN UNA VENTANA DE VERDAD Y NO CON `ImageRenderer`
// ------------------------------------------------------------------
// `ImageRenderer` es el camino corto y **se descartó con la prueba delante**: la
// lectura de una carrera volcada así salía con el lienzo, el tinte y el botón de
// cerrar, y TODO SU CONTENIDO EN BLANCO. Su cuerpo va dentro de un `ScrollView`,
// que fuera de una jerarquía viva no coloca nada, y una composición que se mide a
// sí misma con una preferencia (la banda del sujeto) se queda en la primera
// pasada con el alto a cero.
//
// Una herramienta que produce una imagen vacía sin quejarse es peor que no
// tenerla: da por revisada una pantalla que nadie vio. Así que se monta la vista
// en una `UIWindow` real, se la deja colocarse y se dibuja la jerarquía. Cuesta
// unos milisegundos más y no tiene puntos ciegos.
//
// DÓNDE ACABAN LOS FICHEROS, Y POR QUÉ AHÍ
// ----------------------------------------
// Las pruebas corren DENTRO del contenedor de la app en el simulador, y ese
// contenedor no puede escribir fuera de sí mismo: un intento anterior de volcar a
// una ruta del Mac se dio por imposible por esto. La salida es escribir en lo
// único que sí está permitido —los Documentos de la propia app— y sacarlos desde
// fuera con `xcrun simctl get_app_container`. La receta entera está en `carpeta`.
//
// `FAHYBRIK_CAPTURAS` sigue mandando cuando está: es la variable que ya usan las
// capturas de las vistas en vivo, y dos convenciones para lo mismo es cómo se
// acaba buscando un PNG en el sitio equivocado.

enum Volcado {

    /// EL LIENZO REAL: el ancho del iPhone 17 Pro dentro de su área segura. Es el
    /// mismo con el que están cuadradas las bandas de las vistas en vivo, así que
    /// un volcado a otro ancho no serviría para compararlas.
    static let ancho: CGFloat = 402

    /// El ALTO de ese mismo lienzo (874 de pantalla menos 59/34 de área segura).
    /// Solo lo usan las pantallas que ocupan el hueco entero y anclan algo abajo;
    /// una que scrollea se vuelca a su alto natural — ver `vuelca`.
    static let altoDeDispositivo: CGFloat = 781

    /// 3×, como la pantalla. A 1× se pierden el trazo fino y el tracking negativo,
    /// que son dos de las tres cosas que se juzgan mirando esto.
    static let escala: CGFloat = 3

    /// DÓNDE QUEDAN LOS PNG.
    ///
    /// Por defecto, `Documents/volcado` DENTRO del contenedor de datos de la app.
    /// Para sacarlos al Mac, desde fuera del simulador:
    ///
    /// ```sh
    /// open "$(xcrun simctl get_app_container <UDID> com.fahybrid.app data)/Documents/volcado"
    /// ```
    ///
    /// Con `FAHYBRIK_CAPTURAS` puesta manda ella, que es como se piden hoy las
    /// capturas de las vistas en vivo.
    static let carpeta: URL = {
        if let pedida = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"] {
            return URL(fileURLWithPath: pedida)
        }
        let documentos = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentos.appendingPathComponent("volcado", isDirectory: true)
    }()
}

/// LO ÚNICO QUE PUEDE FALLAR AQUÍ, dicho con el nombre de la pantalla y el motivo.
/// Sin esto, una vista que `ImageRenderer` no sepa rasterizar desaparecería del
/// volcado sin dejar rastro, y el que mira las imágenes daría por revisada una
/// pantalla que nadie vio.
struct NoSePudoVolcar: Error, CustomStringConvertible {
    let pantalla: String
    let motivo: String

    var description: String { "«\(pantalla)» no se pudo volcar: \(motivo)" }
}

extension XCTestCase {

    /// VUELCA UNA PANTALLA A PNG y devuelve dónde quedó.
    ///
    /// `alto` nulo = **alto natural**, que es lo correcto para una pantalla que
    /// scrollea: recortarla a los 781 pt del dispositivo enseñaría el primer
    /// tercio y escondería justo la densidad que crece hacia abajo. Se pasa el
    /// alto del dispositivo solo cuando la pantalla ocupa el hueco entero y ancla
    /// algo al suelo, porque entonces su reparto vertical ES parte del diseño.
    ///
    /// El PNG va SIEMPRE al informe de la ejecución además de a disco: así queda
    /// pegado al resultado del test aunque nadie entre al contenedor.
    @MainActor
    @discardableResult
    func vuelca(_ pantalla: some View, como nombre: String, alto: CGFloat? = nil) throws -> URL {
        let raiz = pantalla
            .frame(width: Volcado.ancho, height: alto)
            .environment(\.colorScheme, .dark)
        let anfitrion = UIHostingController(rootView: raiz)

        // El alto natural se MIDE, no se adivina: es lo que ocupa el contenido a
        // 402 pt de ancho, que es lo que scrollearía el atleta de arriba abajo.
        let medido = alto ?? anfitrion.sizeThatFits(
            in: CGSize(width: Volcado.ancho, height: .greatestFiniteMagnitude)
        ).height
        guard medido > 0 else {
            throw NoSePudoVolcar(pantalla: nombre, motivo: "el contenido midió 0 pt de alto")
        }
        let lienzo = CGRect(x: 0, y: 0, width: Volcado.ancho, height: medido)

        // EL OSCURO SE FIJA POR LAS DOS PUERTAS: el entorno de SwiftUI (arriba) y
        // el rasgo de UIKit (aquí). La paleta del tema son `UIColor` dinámicos y
        // los resuelve el rasgo vigente al dibujar, que no siempre es el del
        // entorno de la vista. Con una sola, un volcado «oscuro» sale en claro y
        // nadie lo nota hasta que lo mira.
        let ventana = UIWindow(frame: lienzo)
        ventana.overrideUserInterfaceStyle = .dark
        ventana.rootViewController = anfitrion
        ventana.makeKeyAndVisible()
        defer {
            // La ventana se desmonta SIEMPRE. La suite corre en orden aleatorio y
            // dejar una ventana clave viva se lo lleva puesto a la prueba de al
            // lado, que es la peor clase de fallo: intermitente y de otro.
            ventana.isHidden = true
            ventana.rootViewController = nil
        }
        anfitrion.view.frame = lienzo
        anfitrion.view.layoutIfNeeded()
        // UNA VUELTA DE BUCLE ANTES DE DIBUJAR, y no es una espera supersticiosa:
        // hay composiciones que se colocan en DOS pasadas —la banda del sujeto de
        // una carrera se mide a sí misma con una preferencia y se centra con lo
        // medido—, así que en la primera su alto todavía es cero. Sin esto, esa
        // pantalla se volcaría descuadrada y el volcado estaría mintiendo justo
        // sobre lo que se le pide mirar.
        RunLoop.current.run(until: Date())
        anfitrion.view.layoutIfNeeded()

        let formato = UIGraphicsImageRendererFormat()
        formato.scale = Volcado.escala
        let imagen = UIGraphicsImageRenderer(bounds: lienzo, format: formato).image { _ in
            anfitrion.view.drawHierarchy(in: lienzo, afterScreenUpdates: true)
        }
        guard let png = imagen.pngData() else {
            throw NoSePudoVolcar(pantalla: nombre,
                                 motivo: "la imagen (\(Int(imagen.size.width))×\(Int(imagen.size.height)) pt) no dio PNG")
        }

        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)

        try FileManager.default.createDirectory(at: Volcado.carpeta, withIntermediateDirectories: true)
        let destino = Volcado.carpeta.appendingPathComponent("\(nombre).png")
        try png.write(to: destino)
        // La ruta, al registro: es lo que se copia y pega para ir a buscarlas.
        print("VOLCADO \(nombre) · \(Int(imagen.size.width))×\(Int(imagen.size.height)) pt → \(destino.path)")
        return destino
    }
}
